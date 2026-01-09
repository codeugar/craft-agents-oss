/**
 * Notification Service
 *
 * Handles native OS notifications and app badge count.
 * - Shows notifications when new messages arrive (when app is not focused)
 * - Updates dock badge count with total unread messages
 * - Clicking notification navigates to the relevant session
 */

import { Notification, app, BrowserWindow } from 'electron'
import { mainLog } from './logger'
import type { WindowManager } from './window-manager'

let windowManager: WindowManager | null = null

/**
 * Initialize the notification service with window manager reference
 */
export function initNotificationService(wm: WindowManager): void {
  windowManager = wm
}

/**
 * Show a native notification for a new message
 *
 * @param title - Notification title (e.g., session name)
 * @param body - Notification body (e.g., message preview)
 * @param workspaceId - Workspace ID for navigation
 * @param sessionId - Session ID for navigation
 */
export function showNotification(
  title: string,
  body: string,
  workspaceId: string,
  sessionId: string
): void {
  if (!Notification.isSupported()) {
    mainLog.info('Notifications not supported on this platform')
    return
  }

  const notification = new Notification({
    title,
    body,
    // macOS-specific options
    silent: false,
    // Use the app icon
    icon: undefined,  // Will use app icon by default on macOS
  })

  notification.on('click', () => {
    mainLog.info('Notification clicked:', { workspaceId, sessionId })
    handleNotificationClick(workspaceId, sessionId)
  })

  notification.show()
  mainLog.info('Notification shown:', { title, sessionId })
}

/**
 * Handle notification click - focus window and navigate to session
 */
function handleNotificationClick(workspaceId: string, sessionId: string): void {
  if (!windowManager) {
    mainLog.error('WindowManager not initialized for notification click')
    return
  }

  // Find or create window for this workspace
  let window = windowManager.getWindowByWorkspace(workspaceId)

  if (!window) {
    // Create a new window for this workspace
    windowManager.createWindow(workspaceId)
    window = windowManager.getWindowByWorkspace(workspaceId)
  }

  if (window && !window.isDestroyed()) {
    // Focus the window
    if (window.isMinimized()) {
      window.restore()
    }
    window.focus()

    // Send navigation event to renderer to open the session
    window.webContents.send('notification:navigate', {
      workspaceId,
      sessionId,
    })
  }
}

/**
 * Update the app dock badge count (macOS only)
 *
 * @param count - Number to show on badge (0 to clear)
 */
export function updateBadgeCount(count: number): void {
  if (process.platform !== 'darwin') {
    // Badge count is only supported on macOS
    // On Windows, we could use setOverlayIcon, but that requires an icon
    return
  }

  try {
    if (count > 0) {
      app.setBadgeCount(count)
    } else {
      // Clear the badge
      app.setBadgeCount(0)
    }
    mainLog.info('Badge count updated:', count)
  } catch (error) {
    mainLog.error('Failed to update badge count:', error)
  }
}

/**
 * Clear the app dock badge
 */
export function clearBadgeCount(): void {
  updateBadgeCount(0)
}

/**
 * Check if any window is currently focused
 */
export function isAnyWindowFocused(): boolean {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  return focusedWindow !== null && !focusedWindow.isDestroyed()
}
