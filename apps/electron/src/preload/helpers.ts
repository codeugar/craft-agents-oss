import { ipcRenderer, type IpcRendererEvent } from 'electron'

type AsyncMethod = (...args: any[]) => Promise<unknown>

type SyncMethod = (...args: any[]) => unknown

/**
 * Create a function that invokes an IPC channel (request-response).
 * Usage: getSessions: invoke<ElectronAPI['getSessions']>(IPC_CHANNELS.sessions.GET)
 */
export function invoke<T extends AsyncMethod>(channel: string) {
  return ((...args: Parameters<T>) =>
    ipcRenderer.invoke(channel, ...args) as ReturnType<T>) as (
    ...args: Parameters<T>
  ) => ReturnType<T>
}

/**
 * Create a function that sends to an IPC channel (fire-and-forget).
 * Usage: debugLog: send<ElectronAPI['debugLog']>(IPC_CHANNELS.debug.LOG)
 */
export function send<T extends SyncMethod>(channel: string) {
  return ((...args: Parameters<T>) =>
    ipcRenderer.send(channel, ...args)) as (...args: Parameters<T>) => ReturnType<T>
}

/**
 * Create a listener for channels with a single payload argument.
 * Usage: onSessionEvent: listenOne<SessionEvent>(IPC_CHANNELS.sessions.EVENT)
 */
export function listenOne<T>(channel: string) {
  return (callback: (data: T) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => callback(args[0] as T)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

/**
 * Create a listener for channels with multiple payload arguments.
 * Usage: onTupleEvent: listenMany<[string, number]>('channel')
 */
export function listenMany<TArgs extends unknown[]>(channel: string) {
  return (callback: (...args: TArgs) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...(args as TArgs))
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

/**
 * Create a listener that passes no arguments (just notifies).
 * Usage: onCloseRequested: listenVoid(IPC_CHANNELS.window.CLOSE_REQUESTED)
 */
export function listenVoid(channel: string) {
  return (callback: () => void): (() => void) => {
    const handler = () => callback()
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}
