/**
 * WsRpcServer — WebSocket-based RPC server.
 *
 * Owns ALL transport concerns: connection lifecycle, handshake, heartbeat,
 * optional auth, request dispatching, and push routing.
 *
 * Same class used locally (127.0.0.1, no auth) and remotely (0.0.0.0, auth).
 */

import { WebSocketServer, type WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import {
  PROTOCOL_VERSION,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MAX_MISSED,
  type MessageEnvelope,
  type PushTarget,
  type ErrorCode,
} from '@craft-agent/shared/protocol'
import type { RpcServer, HandlerFn, RequestContext } from './types'

// ---------------------------------------------------------------------------
// Client connection state
// ---------------------------------------------------------------------------

interface ClientConnection {
  id: string
  ws: WebSocket
  workspaceId: string | null
  webContentsId: number | null
  missedPongs: number
  alive: boolean
}

// ---------------------------------------------------------------------------
// Server options
// ---------------------------------------------------------------------------

export interface WsRpcServerOptions {
  /** Host to bind to. Default: '127.0.0.1' */
  host?: string
  /** Port to bind to. 0 = random available port. Default: 0 */
  port?: number
  /** Whether to require a bearer token on handshake. Default: false */
  requireAuth?: boolean
  /** Token validator. Called when requireAuth is true. */
  validateToken?: (token: string) => Promise<boolean>
  /** Server identity stamp on outgoing events. Default: 'local' */
  serverId?: string
  /** Called when a client completes handshake. */
  onClientConnected?: (info: { clientId: string; webContentsId: number | null; workspaceId: string | null }) => void
  /** Called when a client disconnects. */
  onClientDisconnected?: (clientId: string) => void
}

// ---------------------------------------------------------------------------
// WsRpcServer
// ---------------------------------------------------------------------------

export class WsRpcServer implements RpcServer {
  private wss: WebSocketServer | null = null
  private clients = new Map<string, ClientConnection>()
  private handlers = new Map<string, HandlerFn>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _port = 0

  private readonly host: string
  private readonly requestedPort: number
  private readonly requireAuth: boolean
  private readonly validateToken: ((token: string) => Promise<boolean>) | null
  private readonly serverId: string
  private readonly onClientConnected: WsRpcServerOptions['onClientConnected']
  private readonly onClientDisconnected: WsRpcServerOptions['onClientDisconnected']

  constructor(opts?: WsRpcServerOptions) {
    this.host = opts?.host ?? '127.0.0.1'
    this.requestedPort = opts?.port ?? 0
    this.requireAuth = opts?.requireAuth ?? false
    this.validateToken = opts?.validateToken ?? null
    this.serverId = opts?.serverId ?? 'local'
    this.onClientConnected = opts?.onClientConnected
    this.onClientDisconnected = opts?.onClientDisconnected
  }

  /** The actual port the server is listening on (available after listen()). */
  get port(): number {
    return this._port
  }

  // -------------------------------------------------------------------------
  // RpcServer interface
  // -------------------------------------------------------------------------

  handle(channel: string, handler: HandlerFn): void {
    if (this.handlers.has(channel)) {
      throw new Error(`Handler already registered for channel: ${channel}`)
    }
    this.handlers.set(channel, handler)
  }

  push(channel: string, target: PushTarget, ...args: any[]): void {
    const envelope: MessageEnvelope = {
      id: randomUUID(),
      type: 'event',
      channel,
      args,
      serverId: this.serverId,
    }
    const data = JSON.stringify(envelope)

    for (const client of this.clients.values()) {
      if (this.matchesTarget(client, target)) {
        this.safeSend(client.ws, data)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({
        host: this.host,
        port: this.requestedPort,
      })

      this.wss.on('listening', () => {
        const addr = this.wss!.address()
        if (typeof addr === 'object' && addr) {
          this._port = addr.port
        }
        this.startHeartbeat()
        resolve()
      })

      this.wss.on('error', (err) => {
        reject(err)
      })

      this.wss.on('connection', (ws) => {
        this.onConnection(ws)
      })
    })
  }

  close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    for (const client of this.clients.values()) {
      client.ws.terminate()
    }
    this.clients.clear()
    this.wss?.close()
    this.wss = null
  }

  // -------------------------------------------------------------------------
  // Connection handling
  // -------------------------------------------------------------------------

  private onConnection(ws: WebSocket): void {
    let handshakeCompleted = false
    let handshakeTimeout: ReturnType<typeof setTimeout> | null = null

    // Give the client 5 seconds to send a handshake
    handshakeTimeout = setTimeout(() => {
      if (!handshakeCompleted) {
        ws.close(4001, 'Handshake timeout')
      }
    }, 5_000)

    ws.on('message', async (raw) => {
      let envelope: MessageEnvelope
      try {
        envelope = JSON.parse(raw.toString())
      } catch {
        ws.close(4002, 'Invalid JSON')
        return
      }

      if (!handshakeCompleted) {
        if (envelope.type !== 'handshake') {
          ws.close(4003, 'Expected handshake')
          return
        }

        if (handshakeTimeout) {
          clearTimeout(handshakeTimeout)
          handshakeTimeout = null
        }

        // Protocol version check
        if (envelope.protocolVersion) {
          const clientMajor = parseInt(envelope.protocolVersion.split('.')[0], 10)
          const serverMajor = parseInt(PROTOCOL_VERSION.split('.')[0], 10)
          if (clientMajor !== serverMajor) {
            this.sendError(ws, envelope.id, 'PROTOCOL_VERSION_UNSUPPORTED',
              `Server protocol ${PROTOCOL_VERSION}, client ${envelope.protocolVersion}`)
            ws.close(4004, 'Protocol version unsupported')
            return
          }
        }

        // Auth check
        if (this.requireAuth) {
          if (!envelope.token) {
            this.sendError(ws, envelope.id, 'AUTH_FAILED', 'Token required')
            ws.close(4005, 'Auth failed')
            return
          }
          if (this.validateToken) {
            const valid = await this.validateToken(envelope.token)
            if (!valid) {
              this.sendError(ws, envelope.id, 'AUTH_FAILED', 'Invalid token')
              ws.close(4005, 'Auth failed')
              return
            }
          }
        }

        // Register client
        const clientId = randomUUID()
        const client: ClientConnection = {
          id: clientId,
          ws,
          workspaceId: envelope.workspaceId ?? null,
          webContentsId: envelope.webContentsId ?? null,
          missedPongs: 0,
          alive: true,
        }
        this.clients.set(clientId, client)
        handshakeCompleted = true

        // Send handshake_ack
        const ack: MessageEnvelope = {
          id: envelope.id,
          type: 'handshake_ack',
          protocolVersion: PROTOCOL_VERSION,
          clientId,
        }
        this.safeSend(ws, JSON.stringify(ack))

        // Notify lifecycle listener
        this.onClientConnected?.({
          clientId,
          webContentsId: client.webContentsId,
          workspaceId: client.workspaceId,
        })

        // Setup close handler
        ws.on('close', () => {
          this.clients.delete(clientId)
          this.onClientDisconnected?.(clientId)
        })

        // Setup pong handler
        ws.on('pong', () => {
          client.alive = true
          client.missedPongs = 0
        })
        return
      }

      // Post-handshake: find the client for this ws
      const client = this.findClientByWs(ws)
      if (!client) {
        ws.close(4006, 'Unknown client')
        return
      }

      if (envelope.type === 'request') {
        await this.onRequest(client, envelope)
      }
      // Ignore other types from client (events, responses are server→client only)
    })

    ws.on('error', () => {
      // Connection errors are handled by the close event
    })
  }

  // -------------------------------------------------------------------------
  // Request dispatching
  // -------------------------------------------------------------------------

  private async onRequest(client: ClientConnection, envelope: MessageEnvelope): Promise<void> {
    const { channel, id, args } = envelope

    if (!channel) {
      this.sendResponseError(client.ws, id, undefined, 'CHANNEL_NOT_FOUND', 'Missing channel')
      return
    }

    const handler = this.handlers.get(channel)
    if (!handler) {
      this.sendResponseError(client.ws, id, channel, 'CHANNEL_NOT_FOUND', `No handler for: ${channel}`)
      return
    }

    const ctx: RequestContext = {
      clientId: client.id,
      workspaceId: client.workspaceId,
      webContentsId: client.webContentsId,
    }

    try {
      const result = await handler(ctx, ...(args ?? []))
      const response: MessageEnvelope = {
        id,
        type: 'response',
        channel,
        result,
      }
      this.safeSend(client.ws, JSON.stringify(response))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const code: ErrorCode = (err as any)?.code ?? 'HANDLER_ERROR'
      this.sendResponseError(client.ws, id, channel, code, message)
    }
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [id, client] of this.clients) {
        if (!client.alive) {
          client.missedPongs++
          if (client.missedPongs >= HEARTBEAT_MAX_MISSED) {
            client.ws.terminate()
            this.clients.delete(id)
            this.onClientDisconnected?.(id)
            continue
          }
        }
        client.alive = false
        client.ws.ping()
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private matchesTarget(client: ClientConnection, target: PushTarget): boolean {
    switch (target.to) {
      case 'all':
        return target.exclude ? client.id !== target.exclude : true
      case 'workspace':
        if (target.exclude && client.id === target.exclude) return false
        return client.workspaceId === target.workspaceId
      case 'client':
        return client.id === target.clientId
      default:
        return false
    }
  }

  /** Update a client's workspaceId (called after SWITCH_WORKSPACE so push routing stays correct). */
  updateClientWorkspace(clientId: string, workspaceId: string): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.workspaceId = workspaceId
    }
  }

  private findClientByWs(ws: WebSocket): ClientConnection | undefined {
    for (const client of this.clients.values()) {
      if (client.ws === ws) return client
    }
    return undefined
  }

  /** Handler/request errors — sent as type:'response' with error field. */
  private sendResponseError(
    ws: WebSocket, id: string, channel: string | undefined,
    code: ErrorCode, message: string,
  ): void {
    const envelope: MessageEnvelope = {
      id,
      type: 'response',
      channel,
      error: { code, message },
    }
    this.safeSend(ws, JSON.stringify(envelope))
  }

  /** Protocol-level errors only (handshake rejection, version mismatch). May close connection. */
  private sendError(ws: WebSocket, id: string, code: ErrorCode, message: string): void {
    const envelope: MessageEnvelope = {
      id,
      type: 'error',
      error: { code, message },
    }
    this.safeSend(ws, JSON.stringify(envelope))
  }

  private safeSend(ws: WebSocket, data: string): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(data)
    }
  }
}
