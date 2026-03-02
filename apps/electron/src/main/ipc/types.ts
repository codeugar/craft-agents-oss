import type { SessionManager } from '../sessions'
import type { WindowManager } from '../window-manager'
import type { BrowserPaneManager } from '../browser-pane-manager'

export interface IpcContext {
  sessionManager: SessionManager
  windowManager: WindowManager
  browserPaneManager?: BrowserPaneManager
}
