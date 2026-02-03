/**
 * Codex App-Server Client
 *
 * JSON-RPC client for communicating with the Codex app-server.
 * The app-server provides a structured API for managing conversations with pre-tool approval support.
 *
 * Protocol:
 * - Spawns `codex app-server` subprocess
 * - Reads JSONL from stdout
 * - Writes JSON-RPC requests/responses to stdin
 * - Routes by message structure: { id, method } = request, { id } = response, { method } = notification
 *
 * Key features over exec mode:
 * - Pre-tool approval (blocking permission requests before execution)
 * - Thread persistence (resume conversations across app restarts)
 * - Built-in auth handling (OAuth flow via account/login/start)
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';

// Import generated types from codex-types package
import type {
  ClientRequest,
  ServerRequest,
  ServerNotification,
  EventMsg,
  InitializeParams,
  InitializeResponse,
  RequestId,
} from '@craft-agent/codex-types';

import type {
  ThreadStartParams,
  ThreadStartResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnInterruptParams,
  TurnInterruptResponse,
  LoginAccountParams,
  LoginAccountResponse,
  GetAccountParams,
  GetAccountResponse,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  CommandExecutionApprovalDecision,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  FileChangeApprovalDecision,
  ItemStartedNotification,
  ItemCompletedNotification,
  AgentMessageDeltaNotification,
  TurnStartedNotification,
  TurnCompletedNotification,
  ThreadStartedNotification,
} from '@craft-agent/codex-types/v2';

// ============================================================
// Types
// ============================================================

/**
 * JSON-RPC message types
 */
interface JsonRpcRequest {
  jsonrpc?: '2.0';
  id: RequestId;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: '2.0';
  id: RequestId;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcNotification {
  jsonrpc?: '2.0';
  method: string;
  params?: unknown;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/**
 * Pending request tracker with deferred promise
 */
interface PendingRequest<T = unknown> {
  method: string;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * App server connection options
 */
export interface AppServerOptions {
  /** Working directory for the server */
  workDir: string;
  /** Path to codex binary (defaults to 'codex' in PATH) */
  codexPath?: string;
  /** Request timeout in ms (default: 30000) */
  requestTimeout?: number;
  /** Debug callback for logging */
  onDebug?: (message: string) => void;
}

/**
 * Event types emitted by the client
 */
export interface AppServerEvents {
  // Server notifications (v2 protocol)
  'thread/started': ThreadStartedNotification;
  'turn/started': TurnStartedNotification;
  'turn/completed': TurnCompletedNotification;
  'item/started': ItemStartedNotification;
  'item/completed': ItemCompletedNotification;
  'item/agentMessage/delta': AgentMessageDeltaNotification;
  'item/commandExecution/outputDelta': { threadId: string; turnId: string; itemId: string; delta: string };
  'item/reasoning/textDelta': { threadId: string; turnId: string; itemId: string; delta: string };

  // Server requests (approval)
  'item/commandExecution/requestApproval': CommandExecutionRequestApprovalParams & { requestId: RequestId };
  'item/fileChange/requestApproval': FileChangeRequestApprovalParams & { requestId: RequestId };

  // Legacy EventMsg events (for compatibility)
  'event': EventMsg;

  // Connection events
  'connected': void;
  'disconnected': { code: number | null; signal: string | null };
  'error': Error;
}

// ============================================================
// AppServerClient
// ============================================================

/**
 * Client for communicating with Codex app-server via JSON-RPC over stdio.
 *
 * Usage:
 * ```typescript
 * const client = new AppServerClient({ workDir: '/path/to/project' });
 * await client.connect();
 *
 * // Start a new thread
 * const { threadId } = await client.threadStart({ model: 'codex' });
 *
 * // Listen for events
 * client.on('item/started', (item) => console.log('Tool started:', item));
 * client.on('item/commandExecution/requestApproval', async (params) => {
 *   // Show permission dialog, then respond
 *   await client.respondToCommandApproval(params.requestId, 'accept');
 * });
 *
 * // Send a message
 * await client.turnStart({ threadId, input: [{ type: 'text', text: 'Hello!' }] });
 *
 * await client.disconnect();
 * ```
 */
export class AppServerClient extends EventEmitter {
  private options: Required<AppServerOptions>;
  private process: ChildProcess | null = null;
  private readline: ReadlineInterface | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private nextRequestId: number = 1;
  private initialized: boolean = false;

  constructor(options: AppServerOptions) {
    super();
    this.options = {
      workDir: options.workDir,
      codexPath: options.codexPath || 'codex',
      requestTimeout: options.requestTimeout || 30000,
      onDebug: options.onDebug || (() => {}),
    };
  }

  // ============================================================
  // Connection Lifecycle
  // ============================================================

  /**
   * Connect to the app-server by spawning the process.
   */
  async connect(): Promise<void> {
    if (this.process) {
      throw new Error('Already connected');
    }

    this.debug('Spawning codex app-server...');

    // Spawn the app-server process
    this.process = spawn(this.options.codexPath, ['app-server'], {
      cwd: this.options.workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Ensure we get proper exit codes
        FORCE_COLOR: '0',
      },
    });

    // Handle process errors
    this.process.on('error', (err) => {
      this.debug(`Process error: ${err.message}`);
      this.emit('error', err);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      this.debug(`Process exited with code ${code}, signal ${signal}`);
      this.cleanup();
      this.emit('disconnected', { code, signal });
    });

    // Set up readline for stdout (JSONL parsing)
    if (this.process.stdout) {
      this.readline = createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      this.readline.on('line', (line) => {
        this.handleLine(line);
      });
    }

    // Capture stderr for debugging
    if (this.process.stderr) {
      this.process.stderr.on('data', (data) => {
        this.debug(`stderr: ${data.toString().trim()}`);
      });
    }

    // Perform initialization handshake
    await this.initialize();

    this.emit('connected', undefined as unknown as void);
    this.debug('Connected to app-server');
  }

  /**
   * Disconnect from the app-server.
   */
  async disconnect(): Promise<void> {
    if (!this.process) {
      return;
    }

    this.debug('Disconnecting from app-server...');

    // Kill the process gracefully
    this.process.kill('SIGTERM');

    // Wait briefly for graceful shutdown, then force kill
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 1000);

      if (this.process) {
        this.process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });

    this.cleanup();
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.process !== null && this.initialized;
  }

  // ============================================================
  // JSON-RPC Protocol
  // ============================================================

  /**
   * Send a request and wait for response.
   */
  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.process?.stdin?.writable) {
      throw new Error('Not connected');
    }

    const id = String(this.nextRequestId++);

    return new Promise<T>((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out after ${this.options.requestTimeout}ms`));
      }, this.options.requestTimeout);

      // Track pending request
      this.pendingRequests.set(id, {
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      });

      // Send request
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      const json = JSON.stringify(request);
      this.debug(`→ ${method} (${id}): ${json.slice(0, 200)}${json.length > 200 ? '...' : ''}`);
      this.process!.stdin!.write(json + '\n');
    });
  }

  /**
   * Send a notification (no response expected).
   */
  notify(method: string, params?: unknown): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('Not connected');
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const json = JSON.stringify(notification);
    this.debug(`→ ${method} (notify): ${json.slice(0, 200)}${json.length > 200 ? '...' : ''}`);
    this.process.stdin.write(json + '\n');
  }

  /**
   * Respond to a server request (approval request, user input request).
   */
  respond(id: RequestId, result: unknown): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('Not connected');
    }

    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };

    const json = JSON.stringify(response);
    this.debug(`→ response (${id}): ${json.slice(0, 200)}${json.length > 200 ? '...' : ''}`);
    this.process.stdin.write(json + '\n');
  }

  // ============================================================
  // High-Level API Methods
  // ============================================================

  /**
   * Start a new thread (conversation).
   */
  async threadStart(params: Partial<ThreadStartParams>): Promise<ThreadStartResponse> {
    // Build full params with defaults
    const fullParams: ThreadStartParams = {
      model: params.model ?? null,
      modelProvider: params.modelProvider ?? null,
      cwd: params.cwd ?? this.options.workDir,
      approvalPolicy: params.approvalPolicy ?? 'on-failure',
      sandbox: params.sandbox ?? 'workspace-write',
      config: params.config ?? null,
      baseInstructions: params.baseInstructions ?? null,
      developerInstructions: params.developerInstructions ?? null,
      personality: params.personality ?? null,
      ephemeral: params.ephemeral ?? null,
      experimentalRawEvents: params.experimentalRawEvents ?? false,
    };

    return this.request<ThreadStartResponse>('thread/start', fullParams);
  }

  /**
   * Resume an existing thread.
   */
  async threadResume(params: ThreadResumeParams): Promise<ThreadResumeResponse> {
    return this.request<ThreadResumeResponse>('thread/resume', params);
  }

  /**
   * Start a turn (send user message).
   */
  async turnStart(params: TurnStartParams): Promise<TurnStartResponse> {
    return this.request<TurnStartResponse>('turn/start', params);
  }

  /**
   * Interrupt the current turn.
   */
  async turnInterrupt(params: TurnInterruptParams): Promise<TurnInterruptResponse> {
    return this.request<TurnInterruptResponse>('turn/interrupt', params);
  }

  /**
   * Get account/auth status.
   */
  async accountRead(params?: GetAccountParams): Promise<GetAccountResponse> {
    return this.request<GetAccountResponse>('account/read', params ?? {});
  }

  /**
   * Start OAuth login flow.
   */
  async accountLoginStart(params?: LoginAccountParams): Promise<LoginAccountResponse> {
    return this.request<LoginAccountResponse>('account/login/start', params ?? {});
  }

  /**
   * Log out.
   */
  async accountLogout(): Promise<void> {
    return this.request<void>('account/logout', undefined);
  }

  /**
   * Respond to a command execution approval request.
   */
  respondToCommandApproval(
    requestId: RequestId,
    decision: CommandExecutionApprovalDecision
  ): void {
    const response: CommandExecutionRequestApprovalResponse = { decision };
    this.respond(requestId, response);
  }

  /**
   * Respond to a file change approval request.
   */
  respondToFileChangeApproval(
    requestId: RequestId,
    decision: FileChangeApprovalDecision
  ): void {
    const response: FileChangeRequestApprovalResponse = { decision };
    this.respond(requestId, response);
  }

  // ============================================================
  // Private Methods
  // ============================================================

  /**
   * Perform initialization handshake.
   */
  private async initialize(): Promise<void> {
    const params: InitializeParams = {
      clientInfo: {
        name: 'Craft Agent',
        title: null,
        version: '0.3.1', // TODO: Get from package.json
      },
    };

    const response = await this.request<InitializeResponse>('initialize', params);
    this.debug(`Initialized: ${JSON.stringify(response)}`);

    // Send initialized notification
    this.notify('initialized', {});

    this.initialized = true;
  }

  /**
   * Handle an incoming line (JSONL message).
   */
  private handleLine(line: string): void {
    if (!line.trim()) return;

    try {
      const message = JSON.parse(line) as JsonRpcMessage;
      this.routeMessage(message);
    } catch (err) {
      this.debug(`Failed to parse line: ${line}`);
    }
  }

  /**
   * Route an incoming message based on its structure.
   */
  private routeMessage(message: JsonRpcMessage): void {
    // Check if it's a response (has id but no method)
    if ('id' in message && !('method' in message)) {
      this.handleResponse(message as JsonRpcResponse);
      return;
    }

    // Check if it's a server request (has id and method)
    if ('id' in message && 'method' in message) {
      this.handleServerRequest(message as JsonRpcRequest);
      return;
    }

    // Otherwise it's a notification
    if ('method' in message) {
      this.handleNotification(message as JsonRpcNotification);
      return;
    }

    this.debug(`Unknown message format: ${JSON.stringify(message)}`);
  }

  /**
   * Handle a response to a pending request.
   */
  private handleResponse(response: JsonRpcResponse): void {
    const id = String(response.id);
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      this.debug(`Received response for unknown request: ${id}`);
      return;
    }

    // Clean up
    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(id);

    // Handle error or success
    if (response.error) {
      this.debug(`← error (${id}): ${response.error.message}`);
      pending.reject(new Error(response.error.message));
    } else {
      this.debug(`← ${pending.method} (${id}): ${JSON.stringify(response.result).slice(0, 200)}`);
      pending.resolve(response.result);
    }
  }

  /**
   * Handle a server request (approval request, user input request).
   */
  private handleServerRequest(request: JsonRpcRequest): void {
    this.debug(`← request ${request.method} (${request.id})`);

    // Emit the request with its ID so the application can respond
    switch (request.method) {
      case 'item/commandExecution/requestApproval':
        this.emit('item/commandExecution/requestApproval', {
          ...(request.params as CommandExecutionRequestApprovalParams),
          requestId: request.id,
        });
        break;

      case 'item/fileChange/requestApproval':
        this.emit('item/fileChange/requestApproval', {
          ...(request.params as FileChangeRequestApprovalParams),
          requestId: request.id,
        });
        break;

      // Legacy approval methods (v1 protocol)
      case 'execCommandApproval':
      case 'applyPatchApproval':
        // Map to v2 events
        this.debug(`Legacy approval request: ${request.method}`);
        break;

      default:
        this.debug(`Unknown server request: ${request.method}`);
    }
  }

  /**
   * Handle a server notification.
   */
  private handleNotification(notification: JsonRpcNotification): void {
    const method = notification.method;
    const params = notification.params;

    this.debug(`← ${method}: ${JSON.stringify(params).slice(0, 200)}`);

    // Emit typed events for v2 notifications
    switch (method) {
      case 'thread/started':
        this.emit('thread/started', params as ThreadStartedNotification);
        break;

      case 'turn/started':
        this.emit('turn/started', params as TurnStartedNotification);
        break;

      case 'turn/completed':
        this.emit('turn/completed', params as TurnCompletedNotification);
        break;

      case 'item/started':
        this.emit('item/started', params as ItemStartedNotification);
        break;

      case 'item/completed':
        this.emit('item/completed', params as ItemCompletedNotification);
        break;

      case 'item/agentMessage/delta':
        this.emit('item/agentMessage/delta', params as AgentMessageDeltaNotification);
        break;

      case 'item/commandExecution/outputDelta':
        this.emit('item/commandExecution/outputDelta', params as { threadId: string; turnId: string; itemId: string; delta: string });
        break;

      case 'item/reasoning/textDelta':
        this.emit('item/reasoning/textDelta', params as { threadId: string; turnId: string; itemId: string; delta: string });
        break;

      default:
        // Emit as generic event for unknown notifications
        this.debug(`Unknown notification: ${method}`);
    }
  }

  /**
   * Clean up resources.
   */
  private cleanup(): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    // Close readline
    this.readline?.close();
    this.readline = null;

    // Clear process reference
    this.process = null;
    this.initialized = false;
  }

  /**
   * Debug logging.
   */
  private debug(message: string): void {
    this.options.onDebug(`[AppServer] ${message}`);
  }
}

// ============================================================
// Type-safe event emitter interface
// ============================================================

// Extend EventEmitter typing for better TypeScript support
export interface AppServerClient {
  on<K extends keyof AppServerEvents>(event: K, listener: (data: AppServerEvents[K]) => void): this;
  once<K extends keyof AppServerEvents>(event: K, listener: (data: AppServerEvents[K]) => void): this;
  emit<K extends keyof AppServerEvents>(event: K, data: AppServerEvents[K]): boolean;
  off<K extends keyof AppServerEvents>(event: K, listener: (data: AppServerEvents[K]) => void): this;
}
