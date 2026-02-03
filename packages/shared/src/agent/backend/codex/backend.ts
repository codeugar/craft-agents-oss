/**
 * Codex Backend (App-Server Mode)
 *
 * Agent backend implementation using the Codex app-server protocol.
 * This backend spawns `codex app-server` and communicates via JSON-RPC over stdio.
 *
 * Key benefits over exec mode:
 * - Pre-tool approval (blocking permission requests BEFORE execution)
 * - Thread persistence (resume conversations across app restarts)
 * - Built-in auth handling (OAuth flow via account/login/start)
 * - Auto-generated types from the Rust binary
 *
 * The app-server handles the agent loop internally, emitting notifications
 * for UI events and server requests for approval prompts.
 */

import type { AgentEvent } from '@craft-agent/core/types';
import type { FileAttachment } from '../../../utils/files.ts';
import type { ThinkingLevel } from '../../thinking-levels.ts';
import { DEFAULT_THINKING_LEVEL } from '../../thinking-levels.ts';
import type { PermissionMode } from '../../mode-manager.ts';
import {
  getPermissionMode,
  setPermissionMode,
  cyclePermissionMode,
} from '../../mode-manager.ts';
import type { LoadedSource } from '../../../sources/types.ts';

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
} from '../types.ts';
import { AbortReason } from '../types.ts';

// App-server client
import { AppServerClient, type AppServerOptions } from '../../../codex/app-server-client.ts';

// Event adapter
import { EventAdapter } from './event-adapter.ts';

// Import types from generated codex-types
import type {
  RequestId,
  ReasoningEffort,
} from '@craft-agent/codex-types';
import type {
  AskForApproval,
  SandboxMode,
  UserInput,
  CommandExecutionApprovalDecision,
  FileChangeApprovalDecision,
} from '@craft-agent/codex-types/v2';

// ============================================================
// Constants
// ============================================================

const DEFAULT_CODEX_MODEL = 'codex';

/**
 * Map thinking levels to Codex reasoning effort.
 */
const THINKING_TO_EFFORT: Record<ThinkingLevel, ReasoningEffort> = {
  off: 'low',
  think: 'medium',
  max: 'high',
};

/**
 * Codex model definitions for capabilities reporting.
 */
const CODEX_MODELS: ModelDefinition[] = [
  {
    id: 'codex',
    name: 'Codex',
    provider: 'openai',
    contextWindow: 256_000,
    supportsThinking: true,
    supportsVision: true,
    supportsTools: true,
    inputCostPerM: 2.0,
    outputCostPerM: 8.0,
  },
  {
    id: 'codex-mini',
    name: 'Codex Mini',
    provider: 'openai',
    contextWindow: 128_000,
    supportsThinking: false,
    supportsVision: true,
    supportsTools: true,
    inputCostPerM: 0.5,
    outputCostPerM: 2.0,
  },
];

/**
 * Codex thinking level definitions.
 */
const CODEX_THINKING_LEVELS: ThinkingLevelDefinition[] = [
  {
    id: 'off',
    name: 'Off',
    description: 'Minimal reasoning effort',
    budget: 'low',
  },
  {
    id: 'think',
    name: 'Think',
    description: 'Medium reasoning effort',
    budget: 'medium',
  },
  {
    id: 'max',
    name: 'Max',
    description: 'Maximum reasoning effort',
    budget: 'high',
  },
];

// ============================================================
// CodexBackend Implementation
// ============================================================

/**
 * Backend implementation using the Codex app-server protocol.
 *
 * The app-server provides a structured JSON-RPC API that:
 * 1. Manages thread lifecycle (start, resume, archive)
 * 2. Handles turns with proper approval workflows
 * 3. Emits notifications for streaming events
 * 4. Sends server requests for approval prompts
 */
export class CodexBackend implements AgentBackend {
  // Configuration
  private config: BackendConfig;
  private workingDirectory: string;
  private sessionId: string;

  // App-server client
  private client: AppServerClient | null = null;
  private clientConnecting: Promise<void> | null = null;

  // State
  private _isProcessing: boolean = false;
  private abortReason?: AbortReason;
  private codexThreadId: string | null = null; // For session resume
  private currentTurnId: string | null = null;

  // Model configuration
  private _model: string;
  private _thinkingLevel: ThinkingLevel;
  private _ultrathinkOverride: boolean = false;

  // Source state
  private activeSlugs: Set<string> = new Set();
  private allSources: LoadedSource[] = [];
  // Note: MCP servers are configured via app-server config, not runtime injection
  // See ~/.codex/config.toml for MCP server configuration

  // Event adapter
  private adapter: EventAdapter;

  // Event queue for streaming (AsyncGenerator pattern)
  private eventQueue: AgentEvent[] = [];
  private eventResolvers: Array<(done: boolean) => void> = [];
  private turnComplete: boolean = false;

  // Pending approval requests
  private pendingApprovals: Map<string, {
    type: 'command' | 'fileChange';
    resolve: (decision: CommandExecutionApprovalDecision | FileChangeApprovalDecision) => void;
  }> = new Map();

  // ============================================================
  // Callbacks
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
    this.workingDirectory = config.workspace.rootPath || process.cwd();
    this.sessionId = config.session?.id || `codex-${Date.now()}`;
    this._model = config.model || DEFAULT_CODEX_MODEL;
    this._thinkingLevel = config.thinkingLevel || DEFAULT_THINKING_LEVEL;

    // Restore thread ID from previous session (for resume)
    this.codexThreadId = config.session?.sdkSessionId || null;

    // Initialize event adapter
    this.adapter = new EventAdapter();

    this.debug(`Codex backend initialized (app-server mode)${this.codexThreadId ? ` (will resume thread ${this.codexThreadId})` : ''}`);
  }

  // ============================================================
  // Client Management
  // ============================================================

  /**
   * Ensure the app-server client is connected.
   */
  private async ensureClient(): Promise<AppServerClient> {
    if (this.client?.isConnected()) {
      return this.client;
    }

    // Wait if already connecting
    if (this.clientConnecting) {
      await this.clientConnecting;
      if (this.client?.isConnected()) {
        return this.client;
      }
    }

    // Create and connect new client
    const options: AppServerOptions = {
      workDir: this.workingDirectory,
      onDebug: (msg) => this.debug(msg),
    };

    this.client = new AppServerClient(options);

    // Set up event handlers
    this.setupClientEventHandlers();

    // Connect
    this.clientConnecting = this.client.connect();
    await this.clientConnecting;
    this.clientConnecting = null;

    this.debug('App-server client connected');
    return this.client;
  }

  /**
   * Set up event handlers for the app-server client.
   */
  private setupClientEventHandlers(): void {
    if (!this.client) return;

    // Thread started - capture thread ID
    this.client.on('thread/started', (notification) => {
      const threadId = notification.thread?.id;
      if (threadId && threadId !== this.codexThreadId) {
        this.codexThreadId = threadId;
        this.debug(`Thread ID captured: ${threadId}`);
        this.config.onSdkSessionIdUpdate?.(threadId);
      }
    });

    // Turn started
    this.client.on('turn/started', (notification) => {
      this.currentTurnId = notification.turn?.id || null;
      for (const event of this.adapter.adaptTurnStarted(notification)) {
        this.enqueueEvent(event);
      }
    });

    // Turn completed
    this.client.on('turn/completed', (notification) => {
      for (const event of this.adapter.adaptTurnCompleted(notification)) {
        this.enqueueEvent(event);
      }
      this.turnComplete = true;
      this.signalEventAvailable(true);
    });

    // Item started
    this.client.on('item/started', (notification) => {
      for (const event of this.adapter.adaptItemStarted(notification)) {
        this.enqueueEvent(event);
      }
    });

    // Item completed
    this.client.on('item/completed', (notification) => {
      for (const event of this.adapter.adaptItemCompleted(notification)) {
        this.enqueueEvent(event);
      }
    });

    // Agent message delta (streaming text)
    this.client.on('item/agentMessage/delta', (notification) => {
      for (const event of this.adapter.adaptAgentMessageDelta(notification)) {
        this.enqueueEvent(event);
      }
    });

    // Reasoning delta (streaming thinking)
    this.client.on('item/reasoning/textDelta', (notification) => {
      for (const event of this.adapter.adaptReasoningDelta(notification)) {
        this.enqueueEvent(event);
      }
    });

    // Command output delta (accumulate for tool result)
    this.client.on('item/commandExecution/outputDelta', (notification) => {
      this.adapter.adaptCommandOutputDelta(notification);
    });

    // Command execution approval request
    this.client.on('item/commandExecution/requestApproval', async (params) => {
      await this.handleCommandApproval(params);
    });

    // File change approval request
    this.client.on('item/fileChange/requestApproval', async (params) => {
      await this.handleFileChangeApproval(params);
    });

    // Error handling
    this.client.on('error', (err) => {
      this.debug(`Client error: ${err.message}`);
      this.enqueueEvent({ type: 'error', message: err.message });
    });

    // Disconnection
    this.client.on('disconnected', ({ code, signal }) => {
      this.debug(`Client disconnected: code=${code}, signal=${signal}`);
      if (this._isProcessing) {
        this.enqueueEvent({ type: 'error', message: 'Connection to Codex lost' });
        this.turnComplete = true;
        this.signalEventAvailable(true);
      }
    });
  }

  // ============================================================
  // Approval Handling
  // ============================================================

  /**
   * Handle command execution approval request.
   * This is called BEFORE the command is executed (pre-tool approval).
   */
  private async handleCommandApproval(params: {
    threadId: string;
    turnId: string;
    itemId: string;
    reason: string | null;
    command?: string;
    cwd?: string;
    requestId: RequestId;
  }): Promise<void> {
    const permissionMode = getPermissionMode(this.sessionId);

    // In execute mode, auto-approve
    if (permissionMode === 'allow-all') {
      this.debug('Auto-approving command (execute mode)');
      this.client?.respondToCommandApproval(params.requestId, 'accept');
      return;
    }

    // In explore mode, auto-reject write operations
    if (permissionMode === 'safe') {
      this.debug('Auto-rejecting command (explore mode)');
      this.client?.respondToCommandApproval(params.requestId, 'decline');
      return;
    }

    // In ask mode, emit permission request and wait for user response
    const requestId = String(params.requestId);
    this.debug(`Requesting command approval: ${params.command}`);

    // Emit permission request to UI
    if (this.onPermissionRequest) {
      this.onPermissionRequest({
        requestId,
        toolName: 'Bash',
        command: params.command || '',
        description: params.reason || 'Execute command',
        type: 'bash',
      });

      // Store resolver for when respondToPermission is called
      return new Promise((resolve) => {
        this.pendingApprovals.set(requestId, {
          type: 'command',
          resolve: (decision: CommandExecutionApprovalDecision | FileChangeApprovalDecision) => {
            this.client?.respondToCommandApproval(
              params.requestId,
              decision as CommandExecutionApprovalDecision
            );
            resolve();
          },
        });
      });
    }

    // No permission handler - decline by default
    this.debug('No permission handler - declining');
    this.client?.respondToCommandApproval(params.requestId, 'decline');
  }

  /**
   * Handle file change approval request.
   */
  private async handleFileChangeApproval(params: {
    threadId: string;
    turnId: string;
    itemId: string;
    reason: string | null;
    grantRoot: string | null;
    requestId: RequestId;
  }): Promise<void> {
    const permissionMode = getPermissionMode(this.sessionId);

    // In execute mode, auto-approve
    if (permissionMode === 'allow-all') {
      this.debug('Auto-approving file change (execute mode)');
      this.client?.respondToFileChangeApproval(params.requestId, 'accept');
      return;
    }

    // In explore mode, auto-reject
    if (permissionMode === 'safe') {
      this.debug('Auto-rejecting file change (explore mode)');
      this.client?.respondToFileChangeApproval(params.requestId, 'decline');
      return;
    }

    // In ask mode, emit permission request
    const requestId = String(params.requestId);
    this.debug(`Requesting file change approval`);

    if (this.onPermissionRequest) {
      this.onPermissionRequest({
        requestId,
        toolName: 'Edit',
        command: params.grantRoot || '',
        description: params.reason || 'Modify files',
      });

      return new Promise((resolve) => {
        this.pendingApprovals.set(requestId, {
          type: 'fileChange',
          resolve: (decision: CommandExecutionApprovalDecision | FileChangeApprovalDecision) => {
            this.client?.respondToFileChangeApproval(
              params.requestId,
              decision as FileChangeApprovalDecision
            );
            resolve();
          },
        });
      });
    }

    // No permission handler - decline by default
    this.client?.respondToFileChangeApproval(params.requestId, 'decline');
  }

  // ============================================================
  // Event Queue Management (AsyncGenerator Pattern)
  // ============================================================

  /**
   * Add an event to the queue and signal waiters.
   */
  private enqueueEvent(event: AgentEvent): void {
    this.eventQueue.push(event);
    this.signalEventAvailable(false);
  }

  /**
   * Signal that events are available.
   */
  private signalEventAvailable(done: boolean): void {
    const resolvers = this.eventResolvers.splice(0);
    for (const resolve of resolvers) {
      resolve(done);
    }
  }

  /**
   * Wait for the next event.
   */
  private waitForEvent(): Promise<boolean> {
    // If we have queued events, return immediately
    if (this.eventQueue.length > 0 || this.turnComplete) {
      return Promise.resolve(this.turnComplete && this.eventQueue.length === 0);
    }

    // Otherwise wait for signal
    return new Promise((resolve) => {
      this.eventResolvers.push(resolve);
    });
  }

  // ============================================================
  // Chat & Lifecycle
  // ============================================================

  /**
   * Main chat method - runs the Codex agent loop via app-server.
   */
  async *chat(
    message: string,
    attachments?: FileAttachment[],
    _options?: ChatOptions
  ): AsyncGenerator<AgentEvent> {
    this._isProcessing = true;
    this.abortReason = undefined;
    this.turnComplete = false;
    this.eventQueue = [];
    this.eventResolvers = [];
    this.adapter.startTurn();

    try {
      // Ensure client is connected
      const client = await this.ensureClient();

      // Start or resume thread
      const permissionMode = getPermissionMode(this.sessionId);
      if (this.codexThreadId) {
        // Resume existing thread from disk
        try {
          await client.threadResume({
            threadId: this.codexThreadId,
            history: null,
            path: null,
            model: null,
            modelProvider: null,
            cwd: null,
            approvalPolicy: null,
            sandbox: null,
            config: null,
            baseInstructions: null,
            developerInstructions: null,
            personality: null,
          });
          this.debug(`Resumed thread: ${this.codexThreadId}`);
        } catch (err) {
          // Thread not found or corrupted - fall back to new thread
          this.debug(
            `Failed to resume thread ${this.codexThreadId}, starting new: ${err instanceof Error ? err.message : err}`
          );
          const response = await client.threadStart({
            model: this._model,
            cwd: this.workingDirectory,
            approvalPolicy: this.getApprovalPolicy(permissionMode),
            sandbox: this.getSandboxMode(permissionMode),
          });
          this.codexThreadId = response.thread.id;
          this.debug(`Started new thread: ${this.codexThreadId}`);
          this.config.onSdkSessionIdUpdate?.(this.codexThreadId);
        }
      } else {
        // Start new thread
        const response = await client.threadStart({
          model: this._model,
          cwd: this.workingDirectory,
          approvalPolicy: this.getApprovalPolicy(permissionMode),
          sandbox: this.getSandboxMode(permissionMode),
        });
        this.codexThreadId = response.thread.id;
        this.debug(`Started new thread: ${this.codexThreadId}`);
        this.config.onSdkSessionIdUpdate?.(this.codexThreadId);
      }

      // Build user input
      const input = this.buildUserInput(message, attachments);

      // Start turn
      this.debug(`Starting turn with input: ${message.slice(0, 100)}...`);
      await client.turnStart({
        threadId: this.codexThreadId!,
        input,
        cwd: null,
        approvalPolicy: null,
        sandboxPolicy: null,
        model: null,
        effort: this.getReasoningEffort(),
        summary: null,
        personality: null,
        outputSchema: null,
        collaborationMode: null,
      });

      // Yield events from queue until turn completes
      while (true) {
        const done = await this.waitForEvent();

        // Yield all queued events
        while (this.eventQueue.length > 0) {
          const event = this.eventQueue.shift()!;
          yield event;
        }

        if (done) {
          break;
        }
      }

      // Emit complete if not already emitted
      if (!this.turnComplete) {
        yield { type: 'complete' };
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('abort')) {
        // Check abort reason
        if (this.abortReason === AbortReason.PlanSubmitted) {
          return;
        }
        if (this.abortReason === AbortReason.AuthRequest) {
          return;
        }
        return;
      }

      yield {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Build user input from message and attachments.
   */
  private buildUserInput(
    message: string,
    attachments?: FileAttachment[]
  ): UserInput[] {
    const input: UserInput[] = [];

    // Add text message
    if (message) {
      input.push({ type: 'text', text: message, text_elements: [] });
    }

    // Add image attachments
    for (const att of attachments || []) {
      if (att.mimeType?.startsWith('image/') && att.path) {
        input.push({ type: 'localImage', path: att.path });
      }
    }

    return input;
  }

  /**
   * Get Codex approval policy from permission mode.
   * Valid values: "untrusted" | "on-failure" | "on-request" | "never"
   */
  private getApprovalPolicy(mode: PermissionMode): AskForApproval {
    switch (mode) {
      case 'safe':
        // Always require approval (untrusted)
        return 'untrusted';
      case 'ask':
        // Ask on failure or request
        return 'on-failure';
      case 'allow-all':
        // Never ask
        return 'never';
      default:
        return 'on-failure';
    }
  }

  /**
   * Get Codex sandbox mode from permission mode.
   * Valid values: "read-only" | "workspace-write" | "danger-full-access"
   */
  private getSandboxMode(mode: PermissionMode): SandboxMode {
    switch (mode) {
      case 'safe':
        // Read-only
        return 'read-only';
      case 'ask':
        // Workspace write with approval
        return 'workspace-write';
      case 'allow-all':
        // Full access
        return 'danger-full-access';
      default:
        return 'workspace-write';
    }
  }

  /**
   * Get reasoning effort from thinking level.
   */
  private getReasoningEffort(): ReasoningEffort {
    const level = this._ultrathinkOverride ? 'max' : this._thinkingLevel;
    return THINKING_TO_EFFORT[level] || 'medium';
  }

  /**
   * Debug logging.
   */
  private debug(message: string): void {
    this.onDebug?.(`[Codex] ${message}`);
  }

  // ============================================================
  // Abort & Lifecycle
  // ============================================================

  async abort(reason?: string): Promise<void> {
    if (this.client?.isConnected() && this.codexThreadId && this.currentTurnId) {
      try {
        await this.client.turnInterrupt({
          threadId: this.codexThreadId,
          turnId: this.currentTurnId,
        });
      } catch (e) {
        this.debug(`Failed to interrupt turn: ${e}`);
      }
    }
    this.turnComplete = true;
    this.signalEventAvailable(true);
    this.debug(`Aborted: ${reason || 'user stop'}`);
  }

  forceAbort(reason: AbortReason): void {
    this.abortReason = reason;
    this.abort(String(reason));
  }

  destroy(): void {
    this.client?.disconnect().catch(() => {});
    this.client = null;
    this.pendingApprovals.clear();
  }

  isProcessing(): boolean {
    return this._isProcessing;
  }

  // ============================================================
  // Model & Thinking Configuration
  // ============================================================

  getModel(): string {
    return this._model;
  }

  setModel(model: string): void {
    this._model = model;
  }

  getThinkingLevel(): ThinkingLevel {
    return this._thinkingLevel;
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this._thinkingLevel = level;
  }

  setUltrathinkOverride(enabled: boolean): void {
    this._ultrathinkOverride = enabled;
  }

  // ============================================================
  // Permission Mode
  // ============================================================

  getPermissionMode(): PermissionMode {
    return getPermissionMode(this.sessionId);
  }

  setPermissionMode(mode: PermissionMode): void {
    setPermissionMode(this.sessionId, mode);
    this.onPermissionModeChange?.(mode);
  }

  cyclePermissionMode(): PermissionMode {
    const newMode = cyclePermissionMode(this.sessionId);
    this.onPermissionModeChange?.(newMode);
    return newMode;
  }

  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    const pending = this.pendingApprovals.get(requestId);
    if (pending) {
      let decision: CommandExecutionApprovalDecision | FileChangeApprovalDecision;

      if (allowed) {
        decision = alwaysAllow ? 'acceptForSession' : 'accept';
      } else {
        decision = 'decline';
      }

      pending.resolve(decision);
      this.pendingApprovals.delete(requestId);
    }
  }

  // ============================================================
  // Capabilities & State
  // ============================================================

  capabilities(): AgentCapabilities {
    return {
      provider: 'openai',
      models: CODEX_MODELS,
      thinkingLevels: CODEX_THINKING_LEVELS,
      supportsPermissionCallbacks: true, // Now true with app-server!
      supportsSubagentParents: false,
      maxContextTokens: 256_000,
      supportsMcp: true,
      supportsResume: true, // Thread persistence
    };
  }

  getSessionId(): string | null {
    return this.codexThreadId;
  }

  // ============================================================
  // Source Management
  // ============================================================

  /**
   * Set the MCP server configurations for sources.
   * Compatible with CraftAgent's 3-param signature for drop-in replacement.
   */
  setSourceServers(
    mcpServers: Record<string, SdkMcpServerConfig>,
    apiServers: Record<string, unknown>,
    intendedSlugs?: string[]
  ): void {
    // Convert intendedSlugs array to Set for internal tracking
    this.activeSlugs = new Set(intendedSlugs || []);

    // Note: App-server mode uses ~/.codex/config.toml for MCP server configuration
    // Runtime injection is not supported in the same way as exec mode
    // Users should configure MCP servers in their Codex config file
    const mcpServerCount = Object.keys(mcpServers).length;
    if (mcpServerCount > 0) {
      this.debug(
        `MCP servers (${mcpServerCount}) should be configured in ~/.codex/config.toml for app-server mode. ` +
        `Runtime injection is not supported. Servers: ${Object.keys(mcpServers).join(', ')}`
      );
    }

    const apiServerCount = Object.keys(apiServers).length;
    if (apiServerCount > 0) {
      this.debug(
        `API servers (${apiServerCount}) are not supported in Codex backend. ` +
        `Servers: ${Object.keys(apiServers).join(', ')}`
      );
    }
  }

  getActiveSourceSlugs(): string[] {
    return Array.from(this.activeSlugs);
  }

  getAllSources(): LoadedSource[] {
    return this.allSources;
  }

  // ============================================================
  // CraftAgent Compatibility Methods
  // These methods provide compatibility with CraftAgent interface
  // so CodexBackend can be used in SessionManager
  // ============================================================

  /**
   * Set all sources (for context injection).
   * In Codex mode, sources are configured via ~/.codex/config.toml
   */
  setAllSources(sources: LoadedSource[]): void {
    this.allSources = sources;
  }

  /**
   * Mark a source as unseen (no-op for Codex backend).
   */
  markSourceUnseen(_sourceSlug: string): void {
    // No-op: Codex backend doesn't track source visibility
  }

  /**
   * Update the working directory.
   */
  updateWorkingDirectory(path: string): void {
    this.workingDirectory = path;
    this.debug(`Working directory updated: ${path}`);
  }

  /**
   * Alias for destroy() to match CraftAgent interface.
   */
  dispose(): void {
    this.destroy();
  }
}
