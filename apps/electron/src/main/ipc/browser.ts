import { ipcMain } from 'electron'
import { IPC_CHANNELS, type BrowserPaneCreateOptions, type BrowserEmptyStateLaunchPayload } from '../../shared/types'
import type { BrowserScreenshotOptions } from '../browser-pane-manager'
import { ipcLog } from '../logger'
import type { IpcContext } from './types'

export const HANDLED_CHANNELS = [
  IPC_CHANNELS.BROWSER_PANE_CREATE,
  IPC_CHANNELS.BROWSER_PANE_DESTROY,
  IPC_CHANNELS.BROWSER_PANE_LIST,
  IPC_CHANNELS.BROWSER_PANE_NAVIGATE,
  IPC_CHANNELS.BROWSER_PANE_GO_BACK,
  IPC_CHANNELS.BROWSER_PANE_GO_FORWARD,
  IPC_CHANNELS.BROWSER_PANE_RELOAD,
  IPC_CHANNELS.BROWSER_PANE_STOP,
  IPC_CHANNELS.BROWSER_PANE_FOCUS,
  IPC_CHANNELS.BROWSER_EMPTY_STATE_LAUNCH,
  IPC_CHANNELS.BROWSER_PANE_SNAPSHOT,
  IPC_CHANNELS.BROWSER_PANE_CLICK,
  IPC_CHANNELS.BROWSER_PANE_FILL,
  IPC_CHANNELS.BROWSER_PANE_SELECT,
  IPC_CHANNELS.BROWSER_PANE_SCREENSHOT,
  IPC_CHANNELS.BROWSER_PANE_EVALUATE,
  IPC_CHANNELS.BROWSER_PANE_SCROLL,
] as const

export function registerBrowserHandlers({ browserPaneManager, windowManager }: IpcContext): void {
  if (!browserPaneManager) return

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_CREATE, (_event, input?: string | BrowserPaneCreateOptions) => {
    if (typeof input === 'string') {
      return browserPaneManager.createInstance(input)
    }

    if (input?.bindToSessionId) {
      return browserPaneManager.createForSession(input.bindToSessionId, { show: input.show ?? false })
    }

    return browserPaneManager.createInstance(input?.id, { show: input?.show })
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_DESTROY, (_event, id: string) => {
    browserPaneManager.destroyInstance(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_LIST, () => {
    return browserPaneManager.listInstances()
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_NAVIGATE, async (_event, id: string, url: string) => {
    try {
      return await browserPaneManager.navigate(id, url)
    } catch (err) {
      ipcLog.error(`[browser-pane] navigate failed for ${id}:`, err)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_GO_BACK, async (_event, id: string) => {
    try {
      return await browserPaneManager.goBack(id)
    } catch (err) {
      ipcLog.error(`[browser-pane] goBack failed for ${id}:`, err)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_GO_FORWARD, async (_event, id: string) => {
    try {
      return await browserPaneManager.goForward(id)
    } catch (err) {
      ipcLog.error(`[browser-pane] goForward failed for ${id}:`, err)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_RELOAD, (_event, id: string) => {
    browserPaneManager.reload(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_STOP, (_event, id: string) => {
    browserPaneManager.stop(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_FOCUS, (_event, id: string) => {
    browserPaneManager.focus(id)
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_EMPTY_STATE_LAUNCH, async (event, payload: BrowserEmptyStateLaunchPayload) => {
    try {
      return await browserPaneManager.handleEmptyStateLaunchFromRenderer(event.sender.id, payload)
    } catch (err) {
      ipcLog.error('[browser-pane] empty-state launch IPC failed:', err)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_SNAPSHOT, async (_event, id: string) => {
    try {
      return await browserPaneManager.getAccessibilitySnapshot(id)
    } catch (err) {
      ipcLog.error(`[browser-pane] snapshot failed for ${id}:`, err)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_CLICK, async (_event, id: string, ref: string) => {
    try {
      return await browserPaneManager.clickElement(id, ref)
    } catch (err) {
      ipcLog.error(`[browser-pane] click failed for ${id} ref=${ref}:`, err)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_FILL, async (_event, id: string, ref: string, value: string) => {
    try {
      return await browserPaneManager.fillElement(id, ref, value)
    } catch (err) {
      ipcLog.error(`[browser-pane] fill failed for ${id} ref=${ref}:`, err)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_SELECT, async (_event, id: string, ref: string, value: string) => {
    try {
      return await browserPaneManager.selectOption(id, ref, value)
    } catch (err) {
      ipcLog.error(`[browser-pane] select failed for ${id} ref=${ref}:`, err)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_SCREENSHOT, async (_event, id: string, options?: BrowserScreenshotOptions) => {
    try {
      const result = await browserPaneManager.screenshot(id, options)
      return {
        base64: result.imageBuffer.toString('base64'),
        imageFormat: result.imageFormat,
        metadata: result.metadata,
      }
    } catch (err) {
      ipcLog.error(`[browser-pane] screenshot failed for ${id}:`, err)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_EVALUATE, async (_event, id: string, expression: string) => {
    try {
      return await browserPaneManager.evaluate(id, expression)
    } catch (err) {
      ipcLog.error(`[browser-pane] evaluate failed for ${id}:`, err)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.BROWSER_PANE_SCROLL, async (_event, id: string, direction: string, amount?: number) => {
    const validDirections = ['up', 'down', 'left', 'right']
    if (!validDirections.includes(direction)) {
      throw new Error(`Invalid scroll direction: ${direction}`)
    }
    try {
      return await browserPaneManager.scroll(id, direction as 'up' | 'down' | 'left' | 'right', amount)
    } catch (err) {
      ipcLog.error(`[browser-pane] scroll failed for ${id}:`, err)
      throw err
    }
  })

  // Forward browser state changes to all windows
  browserPaneManager.onStateChange((info) => {
    windowManager.broadcastToAll(IPC_CHANNELS.BROWSER_PANE_STATE_CHANGED, info)
  })

  // Forward browser removals so renderer can immediately drop stale tabs
  browserPaneManager.onRemoved((id) => {
    windowManager.broadcastToAll(IPC_CHANNELS.BROWSER_PANE_REMOVED, id)
  })

  // Forward browser interaction/focus events so renderer can align panel focus.
  browserPaneManager.onInteracted((id) => {
    windowManager.broadcastToAll(IPC_CHANNELS.BROWSER_PANE_INTERACTED, id)
  })
}
