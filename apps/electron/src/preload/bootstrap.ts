/**
 * WS-mode preload — replaces the full IPC preload (index.ts).
 *
 * 1. Gets port + token from main via ipcRenderer.sendSync
 * 2. Creates WsRpcClient → connects to local WS server
 * 3. Builds the full ElectronAPI proxy via buildClientApi + CHANNEL_MAP
 * 4. Exposes as window.electronAPI via contextBridge
 *
 * On localhost the WS handshake completes in <1ms. The React app takes >100ms
 * to initialise, so by the time any component calls an API method, the
 * connection is established.
 */

import '@sentry/electron/preload'
import { contextBridge, ipcRenderer } from 'electron'
import { WsRpcClient } from '../transport/client'
import { buildClientApi } from '../transport/build-api'
import { CHANNEL_MAP } from '../transport/channel-map'

// Get connection details from main process (synchronous — runs during preload eval)
const wsPort: number = ipcRenderer.sendSync('__get-ws-port')
const wsToken: string = ipcRenderer.sendSync('__get-ws-token')
const webContentsId: number = ipcRenderer.sendSync('__get-web-contents-id')
const workspaceId: string = ipcRenderer.sendSync('__get-workspace-id')

// Create WS client and connect immediately
const client = new WsRpcClient(`ws://127.0.0.1:${wsPort}`, {
  token: wsToken,
  workspaceId,
  webContentsId,
  autoReconnect: true,
})
client.connect()

// Build the full ElectronAPI proxy — identical shape to the IPC preload.
// Methods return promises (via client.invoke), listeners return unsubscribe fns.
const api = buildClientApi(client, CHANNEL_MAP)

contextBridge.exposeInMainWorld('electronAPI', api)
