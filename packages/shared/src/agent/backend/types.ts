/**
 * Backend Abstraction Types
 *
 * Defines the core interface that all AI backends (Claude, OpenAI, etc.) must implement.
 * The CraftAgent facade delegates to these backends, enabling provider switching while
 * maintaining a consistent API surface.
 *
 * Key design decisions:
 * - Provider-agnostic events: All backends emit the same AgentEvent types
 * - Capabilities-driven UI: Model/thinking selectors read from capabilities()
 * - Callback pattern: Facade sets callbacks after creating backend
 * - AsyncGenerator for streaming: Consistent with existing CraftAgent API
 */

import type { AgentEvent } from '@craft-agent/core/types';
import type { FileAttachment } from '../../utils/files.ts';
import type { ThinkingLevel } from '../thinking-levels.ts';
import type { PermissionMode } from '../mode-manager.ts';
import type { LoadedSource } from '../../sources/types.ts';
import type { AuthRequest } from '../session-scoped-tools.ts';
import type { Workspace } from '../../config/storage.ts';
import type { SessionConfig as Session } from '../../sessions/storage.ts';

// Import AbortReason and RecoveryMessage from craft-agent (single source of truth)
// These are imported for local use in this file, then re-exported
import { AbortReason, type RecoveryMessage } from '../craft-agent.ts';
export { AbortReason, type RecoveryMessage };

/**
 * Provider identifier for AI backends.
 * Extensible to support additional providers in the future.
 */
export type AgentProvider = 'anthropic' | 'openai';

// OpenAIVariant removed - Codex backend now uses app-server mode exclusively

/**
 * Model definition with provider-specific metadata.
 * Used by UI to populate model selection dropdowns.
 */
export interface ModelDefinition {
  /** Model identifier (e.g., 'claude-sonnet-4-5-20250929', 'codex-mini') */
  id: string;
  /** Human-readable name (e.g., 'Sonnet 4.5', 'Codex Mini') */
  name: string;
  /** Provider that offers this model */
  provider: AgentProvider;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Whether model supports extended thinking */
  supportsThinking?: boolean;
  /** Whether model supports vision/image inputs */
  supportsVision?: boolean;
  /** Whether model supports tool/function calling */
  supportsTools?: boolean;
  /** Cost per million input tokens (USD) */
  inputCostPerM?: number;
  /** Cost per million output tokens (USD) */
  outputCostPerM?: number;
}

/**
 * Thinking level definition for extended reasoning.
 * Provider-agnostic representation that maps to provider-specific budgets.
 */
export interface ThinkingLevelDefinition {
  /** Thinking level identifier */
  id: ThinkingLevel;
  /** Human-readable name */
  name: string;
  /** Description of the thinking level */
  description: string;
  /**
   * Provider-specific budget configuration.
   * - number: Token budget (Anthropic)
   * - 'low'|'medium'|'high': Effort level (OpenAI)
   */
  budget?: number | 'low' | 'medium' | 'high';
}

/**
 * Capabilities advertised by a backend.
 * Used by UI to adapt model/thinking selectors and feature availability.
 */
export interface AgentCapabilities {
  /** Provider identifier */
  provider: AgentProvider;
  /** Available models for this backend */
  models: ModelDefinition[];
  /** Available thinking levels */
  thinkingLevels: ThinkingLevelDefinition[];
  /** Whether backend supports permission request callbacks */
  supportsPermissionCallbacks: boolean;
  /** Whether backend supports subagent parent tracking (Task tool nesting) */
  supportsSubagentParents: boolean;
  /** Maximum context window tokens across all models */
  maxContextTokens: number;
  /** Whether backend supports MCP servers */
  supportsMcp: boolean;
  /** Whether backend supports session resume */
  supportsResume: boolean;
}

// ============================================================
// Callback Types
// ============================================================

/**
 * Permission request callback signature.
 * Called when a tool requires user permission before execution.
 */
export type PermissionCallback = (request: {
  requestId: string;
  toolName: string;
  command: string;
  description: string;
  type?: 'bash';
}) => void;

/**
 * Plan submission callback signature.
 * Called when agent submits a plan for user review.
 */
export type PlanCallback = (planPath: string) => void;

/**
 * Auth request callback signature.
 * Called when a source requires authentication.
 */
export type AuthCallback = (request: AuthRequest) => void;

/**
 * Source change callback signature.
 * Called when a source is activated, deactivated, or modified.
 */
export type SourceChangeCallback = (slug: string, source: LoadedSource | null) => void;

/**
 * Source activation request callback.
 * Returns true if source was successfully activated.
 */
export type SourceActivationCallback = (sourceSlug: string) => Promise<boolean>;

// ============================================================
// Backend Interface
// ============================================================

/**
 * Options for the chat method.
 */
export interface ChatOptions {
  /** Retry flag (internal use for session recovery) */
  isRetry?: boolean;
  /** Override thinking level for this message only */
  thinkingOverride?: ThinkingLevel;
}

/**
 * SDK-compatible MCP server configuration.
 * Supports HTTP/SSE (remote) and stdio (local subprocess) transports.
 */
export type SdkMcpServerConfig =
  | {
      type: 'http' | 'sse';
      url: string;
      headers?: Record<string, string>;
      /** Environment variable name containing bearer token (Codex-specific) */
      bearerTokenEnvVar?: string;
    }
  | {
      type: 'stdio';
      command: string;
      args?: string[];
      /** Environment variables to set (literal values) */
      env?: Record<string, string>;
      /** Environment variable names to forward from parent process (Codex-specific) */
      envVars?: string[];
      /** Working directory for the server process (Codex-specific) */
      cwd?: string;
    };

/**
 * Core backend interface - all AI providers must implement this.
 *
 * The interface is designed to:
 * 1. Abstract provider differences (Claude SDK vs OpenAI Responses API)
 * 2. Enable the facade pattern in CraftAgent
 * 3. Support streaming via AsyncGenerator
 * 4. Allow capability-based UI adaptation
 */
export interface AgentBackend {
  // ============================================================
  // Chat & Lifecycle
  // ============================================================

  /**
   * Send a message and stream back events.
   * This is the core agentic loop - handles tool execution, permission checks, etc.
   *
   * @param message - User message text
   * @param attachments - Optional file attachments
   * @param options - Optional chat configuration
   * @yields AgentEvent stream
   */
  chat(
    message: string,
    attachments?: FileAttachment[],
    options?: ChatOptions
  ): AsyncGenerator<AgentEvent>;

  /**
   * Abort current query (user stop or internal abort).
   *
   * @param reason - Optional reason for abort (for logging/debugging)
   */
  abort(reason?: string): Promise<void>;

  /**
   * Force abort with specific reason.
   * Used for auth requests, plan submissions where we need synchronous abort.
   *
   * @param reason - AbortReason enum value
   */
  forceAbort(reason: AbortReason): void;

  /**
   * Clean up resources (MCP connections, watchers, etc.)
   */
  destroy(): void;

  /**
   * Check if currently processing a query.
   */
  isProcessing(): boolean;

  // ============================================================
  // Model & Thinking Configuration
  // ============================================================

  /** Get current model ID */
  getModel(): string;

  /** Set model (should validate against capabilities) */
  setModel(model: string): void;

  /** Get current thinking level */
  getThinkingLevel(): ThinkingLevel;

  /** Set thinking level */
  setThinkingLevel(level: ThinkingLevel): void;

  /** Enable/disable ultrathink override for next message */
  setUltrathinkOverride(enabled: boolean): void;

  // ============================================================
  // Permission Mode
  // ============================================================

  /** Get current permission mode */
  getPermissionMode(): PermissionMode;

  /** Set permission mode */
  setPermissionMode(mode: PermissionMode): void;

  /** Cycle to next permission mode */
  cyclePermissionMode(): PermissionMode;

  // ============================================================
  // Capabilities & State
  // ============================================================

  /** Get backend capabilities for UI adaptation */
  capabilities(): AgentCapabilities;

  /** Get SDK session ID (for resume, null if no session) */
  getSessionId(): string | null;

  // ============================================================
  // Source Management
  // ============================================================

  /**
   * Set the MCP server configurations for sources.
   * Called by facade when sources are activated/deactivated.
   *
   * @param mcpServers Pre-built MCP server configs with auth headers
   * @param apiServers In-process MCP servers for REST APIs
   * @param intendedSlugs Source slugs that should be considered active
   */
  setSourceServers(
    mcpServers: Record<string, SdkMcpServerConfig>,
    apiServers: Record<string, unknown>,
    intendedSlugs?: string[]
  ): void;

  /**
   * Get currently active source slugs.
   */
  getActiveSourceSlugs(): string[];

  /**
   * Get all sources (for context injection).
   */
  getAllSources(): LoadedSource[];

  // ============================================================
  // Permission Resolution
  // ============================================================

  /**
   * Respond to a pending permission request.
   *
   * @param requestId - Permission request ID
   * @param allowed - Whether permission was granted
   * @param alwaysAllow - Whether to remember this permission for session
   */
  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void;

  // ============================================================
  // Callbacks (set by facade after construction)
  // ============================================================

  /** Called when a tool requires permission */
  onPermissionRequest: PermissionCallback | null;

  /** Called when agent submits a plan */
  onPlanSubmitted: PlanCallback | null;

  /** Called when a source requires authentication */
  onAuthRequest: AuthCallback | null;

  /** Called when a source config changes */
  onSourceChange: SourceChangeCallback | null;

  /** Called when permission mode changes */
  onPermissionModeChange: ((mode: PermissionMode) => void) | null;

  /** Called with debug messages */
  onDebug: ((message: string) => void) | null;

  /** Called when a source tool is used but source isn't active */
  onSourceActivationRequest: SourceActivationCallback | null;
}

/**
 * Configuration for creating a backend.
 */
export interface BackendConfig {
  /** Provider to use */
  provider: AgentProvider;

  /**
   * Authentication type that determines credential source.
   * - api_key: Anthropic API key (Claude)
   * - oauth_token: Claude Max OAuth (Anthropic)
   * - codex_oauth: ChatGPT Plus OAuth via Codex app-server (~/.codex/auth.json)
   *
   * Note: OpenAI API key auth is deprecated - use Codex app-server OAuth instead.
   */
  authType?: 'api_key' | 'oauth_token' | 'codex_oauth';

  /** Workspace configuration */
  workspace: Workspace;

  /** Session configuration (for resume) */
  session?: Session;

  /** Initial model ID */
  model?: string;

  /** Initial thinking level */
  thinkingLevel?: ThinkingLevel;

  /** MCP token override (for testing) */
  mcpToken?: string;

  /** Headless mode flag (disables interactive tools) */
  isHeadless?: boolean;

  /** Debug mode configuration */
  debugMode?: {
    enabled: boolean;
    logFilePath?: string;
  };

  /** System prompt preset ('default' | 'mini' | custom string) */
  systemPromptPreset?: 'default' | 'mini' | string;

  /** Callback when SDK session ID is captured/updated */
  onSdkSessionIdUpdate?: (sdkSessionId: string) => void;

  /** Callback when SDK session ID is cleared (e.g., after failed resume) */
  onSdkSessionIdCleared?: () => void;

  /** Callback to get recent messages for recovery context */
  getRecoveryMessages?: () => RecoveryMessage[];
}
