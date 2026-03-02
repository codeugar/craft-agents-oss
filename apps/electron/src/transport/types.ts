/**
 * Transport-layer interfaces for the WS-based RPC.
 *
 * RpcServer and RpcClient are the ONLY abstractions handlers and the renderer
 * interact with. The WebSocket implementation is hidden behind these.
 */

import type { PushTarget } from '@craft-agent/shared/protocol'

// ---------------------------------------------------------------------------
// Request context (provided to every handler by the server)
// ---------------------------------------------------------------------------

export interface RequestContext {
  /** Unique ID assigned on handshake. */
  clientId: string
  /** Workspace the client declared on handshake (null if not set). */
  workspaceId: string | null
  /** Electron webContents.id, null for headless clients. */
  webContentsId: number | null
}

// ---------------------------------------------------------------------------
// Server interface
// ---------------------------------------------------------------------------

export type HandlerFn = (ctx: RequestContext, ...args: any[]) => Promise<any> | any

export interface RpcServer {
  /** Register an RPC handler for a channel. */
  handle(channel: string, handler: HandlerFn): void
  /** Push an event to matching clients. */
  push(channel: string, target: PushTarget, ...args: any[]): void
  /** Update a client's workspace binding (keeps push routing correct after workspace switch). */
  updateClientWorkspace?(clientId: string, workspaceId: string): void
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export interface RpcClient {
  /** Send an RPC request and wait for the response. */
  invoke(channel: string, ...args: any[]): Promise<any>
  /** Subscribe to server-pushed events. Returns an unsubscribe function. */
  on(channel: string, callback: (...args: any[]) => void): () => void
}

// ---------------------------------------------------------------------------
// EventSink — how SessionManager (and other services) push events
// ---------------------------------------------------------------------------

export type EventSink = (channel: string, target: PushTarget, ...args: any[]) => void
