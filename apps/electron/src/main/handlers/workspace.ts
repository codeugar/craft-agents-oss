import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from './handler-deps'

export const GUI_HANDLED_CHANNELS = [
  RPC_CHANNELS.remote.TEST_CONNECTION,
  RPC_CHANNELS.remote.CREATE_WORKSPACE,
  RPC_CHANNELS.window.OPEN_WORKSPACE,
  RPC_CHANNELS.window.OPEN_SESSION_IN_NEW_WINDOW,
  RPC_CHANNELS.window.CLOSE,
  RPC_CHANNELS.window.CONFIRM_CLOSE,
  RPC_CHANNELS.window.CANCEL_CLOSE,
  RPC_CHANNELS.window.SET_TRAFFIC_LIGHTS,
] as const

/**
 * Connect to a remote server and wait for handshake.
 * Returns the connected client or null + error message.
 */
async function connectToRemote(url: string, token: string) {
  const { WsRpcClient } = await import('../../transport/client')
  const client = new WsRpcClient(url, { token, autoReconnect: false, tlsRejectUnauthorized: false })

  const connected = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 10_000)
    const unsub = client.onConnectionStateChanged((state) => {
      if (state.status === 'connected') {
        clearTimeout(timeout)
        unsub()
        resolve(true)
      } else if (state.status === 'failed') {
        clearTimeout(timeout)
        unsub()
        resolve(false)
      }
    })
    client.connect()
  })

  if (!connected) {
    const error = client.getConnectionState().lastError?.message ?? 'Connection failed'
    client.destroy()
    return { client: null, error }
  }

  return { client, error: null }
}

export function registerWorkspaceGuiHandlers(server: RpcServer, deps: HandlerDeps): void {
  const windowManager = deps.windowManager

  // Test connection to a remote Craft Agent Server — just verifies connectivity + discovers workspace
  server.handle(RPC_CHANNELS.remote.TEST_CONNECTION, async (_ctx, url: string, token: string) => {
    const { client, error } = await connectToRemote(url, token)
    if (!client) return { ok: false, error }

    try {
      const workspaces = await client.invoke('workspaces:get') as Array<{ id: string; name: string }>

      if (workspaces.length === 0) {
        // Fresh server — no workspace yet, caller needs to create one
        return { ok: true, needsWorkspace: true }
      }
      if (workspaces.length > 1) {
        return { ok: false, error: 'Multiple workspaces not supported yet' }
      }

      return {
        ok: true,
        remoteWorkspaceId: workspaces[0].id,
        remoteWorkspaceName: workspaces[0].name,
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
    } finally {
      client.destroy()
    }
  })

  // Create a workspace on a remote server with the user's chosen name
  server.handle(RPC_CHANNELS.remote.CREATE_WORKSPACE, async (_ctx, url: string, token: string, name: string) => {
    const { client, error } = await connectToRemote(url, token)
    if (!client) return { ok: false, error }

    try {
      const homeDir = await client.invoke('system:homeDir') as string
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'
      const remotePath = `${homeDir}/.craft-agent/workspaces/${slug}`

      await client.invoke('workspaces:create', remotePath, name)

      const workspaces = await client.invoke('workspaces:get') as Array<{ id: string; name: string }>
      if (workspaces.length === 0) {
        return { ok: false, error: 'Failed to create workspace on remote server' }
      }

      // Return the workspace we just created (last one if multiple)
      const ws = workspaces.find(w => w.name === name) ?? workspaces[workspaces.length - 1]
      return {
        ok: true,
        remoteWorkspaceId: ws.id,
        remoteWorkspaceName: ws.name,
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
    } finally {
      client.destroy()
    }
  })

  // Open workspace in new window (or focus existing)
  server.handle(RPC_CHANNELS.window.OPEN_WORKSPACE, async (_ctx, workspaceId: string) => {
    if (!windowManager) return
    windowManager.focusOrCreateWindow(workspaceId)
  })

  // Open a session in a new window
  server.handle(RPC_CHANNELS.window.OPEN_SESSION_IN_NEW_WINDOW, async (_ctx, workspaceId: string, sessionId: string) => {
    if (!windowManager) return
    const deepLink = `craftagents://allSessions/session/${sessionId}`
    windowManager.createWindow({
      workspaceId,
      focused: true,
      initialDeepLink: deepLink,
    })
  })

  // Close the calling window (triggers close event which may be intercepted)
  server.handle(RPC_CHANNELS.window.CLOSE, (ctx) => {
    if (!windowManager) return
    windowManager.closeWindow(ctx.webContentsId!)
  })

  // Confirm close - force close the window (bypasses interception).
  server.handle(RPC_CHANNELS.window.CONFIRM_CLOSE, (ctx) => {
    if (!windowManager) return
    windowManager.forceCloseWindow(ctx.webContentsId!)
  })

  // Cancel close - renderer handled the request (closed a modal/panel).
  server.handle(RPC_CHANNELS.window.CANCEL_CLOSE, (ctx) => {
    if (!windowManager) return
    windowManager.cancelPendingClose(ctx.webContentsId!)
  })

  // Show/hide macOS traffic light buttons (for fullscreen overlays)
  server.handle(RPC_CHANNELS.window.SET_TRAFFIC_LIGHTS, (ctx, visible: boolean) => {
    if (!windowManager) return
    windowManager.setTrafficLightsVisible(ctx.webContentsId!, visible)
  })
}
