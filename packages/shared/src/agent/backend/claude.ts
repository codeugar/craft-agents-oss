/**
 * ClaudeBackend - Anthropic Claude SDK Backend
 *
 * Implements the AgentBackend interface for Claude models via the Claude Agent SDK.
 * This is an adapter that wraps the existing CraftAgent implementation, providing
 * the standardized interface while maintaining full backward compatibility.
 *
 * Design rationale:
 * - CraftAgent has extensive, battle-tested logic for SDK interaction
 * - Rather than duplicate or fully extract, we wrap it as an adapter
 * - This establishes the interface pattern for future OpenAI backend
 * - Incremental extraction can happen in future iterations if needed
 */

import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent } from '@craft-agent/core/types';
import type { FileAttachment } from '../../utils/files.ts';
import type { ThinkingLevel } from '../thinking-levels.ts';
import { THINKING_LEVELS } from '../thinking-levels.ts';
import type { PermissionMode } from '../mode-manager.ts';
import {
  getPermissionMode,
  setPermissionMode,
  cyclePermissionMode,
} from '../mode-manager.ts';
import type { LoadedSource } from '../../sources/types.ts';

import type {
  AgentBackend,
  AgentCapabilities,
  BackendConfig,
  ChatOptions,
  PermissionCallback,
  PlanCallback,
  AuthCallback,
  SourceChangeCallback,
  SourceActivationCallback,
  SdkMcpServerConfig,
  ModelDefinition,
  ThinkingLevelDefinition,
} from './types.ts';
import { AbortReason } from './types.ts';

// Import CraftAgent for delegation
// Note: This creates a temporary circular dependency during the transition
// In the future, CraftAgent will use ClaudeBackend internally instead
import { CraftAgent, type CraftAgentConfig, type SdkMcpServerConfig as CraftSdkMcpServerConfig } from '../craft-agent.ts';

// ============================================================
// Claude Model Definitions
// ============================================================

/**
 * Claude model definitions for capabilities reporting.
 * These are the models available via the Anthropic API.
 */
const CLAUDE_MODELS: ModelDefinition[] = [
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Sonnet 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    inputCostPerM: 3.0,
    outputCostPerM: 15.0,
  },
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Opus 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    inputCostPerM: 15.0,
    outputCostPerM: 75.0,
  },
  {
    id: 'claude-3-5-haiku-latest',
    name: 'Haiku 3.5',
    provider: 'anthropic',
    contextWindow: 200_000,
    supportsThinking: false,
    supportsVision: true,
    supportsTools: true,
    inputCostPerM: 0.8,
    outputCostPerM: 4.0,
  },
];

/**
 * Claude thinking level definitions.
 * Maps to token budgets for extended thinking.
 */
const CLAUDE_THINKING_LEVELS: ThinkingLevelDefinition[] = THINKING_LEVELS.map(level => ({
  ...level,
  budget: level.id === 'off' ? 0 : level.id === 'think' ? 10_000 : 32_000,
}));

// ============================================================
// ClaudeBackend Implementation
// ============================================================

/**
 * Claude backend implementation using the Claude Agent SDK.
 *
 * This is an adapter that wraps CraftAgent to provide the AgentBackend interface.
 * All core functionality is delegated to the underlying CraftAgent instance.
 */
export class ClaudeBackend implements AgentBackend {
  private agent: CraftAgent;
  private config: BackendConfig;
  private configSessionId: string;
  /** SDK-assigned session ID, updated during chat via onSdkSessionIdUpdate */
  private sdkSessionId: string | null = null;

  // ============================================================
  // Callbacks (forwarded to internal CraftAgent)
  // ============================================================

  onPermissionRequest: PermissionCallback | null = null;
  onPlanSubmitted: PlanCallback | null = null;
  onAuthRequest: AuthCallback | null = null;
  onSourceChange: SourceChangeCallback | null = null;
  onPermissionModeChange: ((mode: PermissionMode) => void) | null = null;
  onDebug: ((message: string) => void) | null = null;
  onSourceActivationRequest: SourceActivationCallback | null = null;

  constructor(config: BackendConfig) {
    this.config = config;
    this.configSessionId = config.session?.id || `temp-${Date.now()}`;

    // Create internal CraftAgent with equivalent configuration
    // Intercept onSdkSessionIdUpdate to track the real SDK session ID
    const agentConfig: CraftAgentConfig = {
      workspace: config.workspace,
      session: config.session,
      mcpToken: config.mcpToken,
      model: config.model,
      thinkingLevel: config.thinkingLevel,
      isHeadless: config.isHeadless,
      debugMode: config.debugMode,
      systemPromptPreset: config.systemPromptPreset,
      onSdkSessionIdUpdate: (sdkSessionId: string) => {
        // Track SDK session ID for getSessionId()
        this.sdkSessionId = sdkSessionId;
        // Forward to original callback if provided
        config.onSdkSessionIdUpdate?.(sdkSessionId);
      },
      onSdkSessionIdCleared: () => {
        // Clear tracked session ID
        this.sdkSessionId = null;
        // Forward to original callback if provided
        config.onSdkSessionIdCleared?.();
      },
      getRecoveryMessages: config.getRecoveryMessages,
    };

    this.agent = new CraftAgent(agentConfig);
    this.setupCallbackForwarding();
  }

  /**
   * Set up callback forwarding from ClaudeBackend to internal CraftAgent.
   * Also forwards callbacks from CraftAgent back to ClaudeBackend consumers.
   */
  private setupCallbackForwarding(): void {
    // Forward callbacks from ClaudeBackend setters to CraftAgent
    // This is done via property descriptors to maintain reactivity

    // CraftAgent → ClaudeBackend (for events from internal agent)
    this.agent.onPermissionRequest = (request) => {
      this.onPermissionRequest?.(request);
    };

    this.agent.onPlanSubmitted = (planPath) => {
      this.onPlanSubmitted?.(planPath);
    };

    this.agent.onAuthRequest = (request) => {
      this.onAuthRequest?.(request);
    };

    this.agent.onSourceChange = (slug, source) => {
      this.onSourceChange?.(slug, source);
    };

    this.agent.onPermissionModeChange = (mode) => {
      this.onPermissionModeChange?.(mode);
    };

    this.agent.onDebug = (message) => {
      this.onDebug?.(message);
    };

    this.agent.onSourceActivationRequest = async (sourceSlug) => {
      if (this.onSourceActivationRequest) {
        return this.onSourceActivationRequest(sourceSlug);
      }
      return false;
    };
  }

  // ============================================================
  // Chat & Lifecycle
  // ============================================================

  async *chat(
    message: string,
    attachments?: FileAttachment[],
    options?: ChatOptions
  ): AsyncGenerator<AgentEvent> {
    // Delegate to internal CraftAgent
    yield* this.agent.chat(message, attachments, options?.isRetry);
  }

  async abort(reason?: string): Promise<void> {
    // CraftAgent.abort() is synchronous but we expose async interface
    // for future backends that may need async cleanup
    this.agent.forceAbort();
  }

  forceAbort(reason: AbortReason): void {
    // AbortReason is now re-exported from types.ts → craft-agent.ts
    // so both this file and CraftAgent use the same enum
    this.agent.forceAbort(reason);
  }

  destroy(): void {
    // Clean up CraftAgent resources
    this.agent.dispose();

    // Clear our callbacks
    this.onPermissionRequest = null;
    this.onPlanSubmitted = null;
    this.onAuthRequest = null;
    this.onSourceChange = null;
    this.onPermissionModeChange = null;
    this.onDebug = null;
    this.onSourceActivationRequest = null;
  }

  /**
   * Check if currently processing a query.
   *
   * Note: CraftAgent doesn't expose query state publicly. This method
   * always returns false. For accurate processing state, consumers should
   * track state based on chat() generator lifecycle (start/complete events).
   */
  isProcessing(): boolean {
    // CraftAgent's currentQuery is private - we cannot access it
    // Consumers should track processing state via AgentEvent lifecycle
    return false;
  }

  // ============================================================
  // Model & Thinking Configuration
  // ============================================================

  getModel(): string {
    return this.config.model || 'claude-sonnet-4-5-20250929';
  }

  setModel(model: string): void {
    // CraftAgent doesn't support runtime model changes
    // Model is set at construction time
    // This would require recreating the agent
    this.onDebug?.(`[ClaudeBackend] setModel(${model}) - requires agent recreation`);
  }

  getThinkingLevel(): ThinkingLevel {
    return this.agent.getThinkingLevel();
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this.agent.setThinkingLevel(level);
  }

  setUltrathinkOverride(enabled: boolean): void {
    this.agent.setUltrathinkOverride(enabled);
  }

  // ============================================================
  // Permission Mode
  // ============================================================

  getPermissionMode(): PermissionMode {
    return getPermissionMode(this.configSessionId);
  }

  setPermissionMode(mode: PermissionMode): void {
    setPermissionMode(this.configSessionId, mode);
  }

  cyclePermissionMode(): PermissionMode {
    return cyclePermissionMode(this.configSessionId);
  }

  // ============================================================
  // Capabilities & State
  // ============================================================

  capabilities(): AgentCapabilities {
    return {
      provider: 'anthropic',
      models: CLAUDE_MODELS,
      thinkingLevels: CLAUDE_THINKING_LEVELS,
      supportsPermissionCallbacks: true,
      supportsSubagentParents: true,
      maxContextTokens: 200_000,
      supportsMcp: true,
      supportsResume: true,
    };
  }

  getSessionId(): string | null {
    // Return SDK-assigned session ID (updated during chat via onSdkSessionIdUpdate)
    // Falls back to null if no chat has occurred yet
    return this.sdkSessionId;
  }

  // ============================================================
  // Source Management
  // ============================================================

  setSourceServers(
    mcpServers: Record<string, SdkMcpServerConfig>,
    apiServers: Record<string, unknown>,
    intendedSlugs?: string[]
  ): void {
    // Delegate to CraftAgent's setSourceServers
    this.agent.setSourceServers(
      mcpServers as Record<string, CraftSdkMcpServerConfig>,
      apiServers as Record<string, ReturnType<typeof createSdkMcpServer>>,
      intendedSlugs
    );
  }

  getActiveSourceSlugs(): string[] {
    return [...this.agent.getActiveSourceServerNames()];
  }

  getAllSources(): LoadedSource[] {
    return this.agent.getAllSources();
  }

  // ============================================================
  // Permission Resolution
  // ============================================================

  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    this.agent.respondToPermission(requestId, allowed, alwaysAllow ?? false);
  }
}
