/**
 * Notifications Hook
 *
 * Handles native OS notifications and app badge count.
 * - Tracks window focus state
 * - Shows notifications for new messages when window is unfocused
 * - Updates dock badge with total unread count
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Session } from '../../shared/types'
import { hasUnreadMessages, countUnreadMessages } from '@/utils/session'

interface UseNotificationsOptions {
  /** Current workspace ID */
  workspaceId: string | null
  /** All sessions for counting total unread */
  sessions: Session[]
  /** Callback to navigate to a session when notification is clicked */
  onNavigateToSession?: (sessionId: string) => void
}

interface UseNotificationsResult {
  /** Whether the window is currently focused */
  isWindowFocused: boolean
  /** Show a notification for a session */
  showSessionNotification: (session: Session, messagePreview?: string) => void
  /** Update the app badge count based on sessions */
  updateBadgeCount: () => void
}

export function useNotifications({
  workspaceId,
  sessions,
  onNavigateToSession,
}: UseNotificationsOptions): UseNotificationsResult {
  const [isWindowFocused, setIsWindowFocused] = useState(true)
  const onNavigateToSessionRef = useRef(onNavigateToSession)

  // Keep ref updated
  useEffect(() => {
    onNavigateToSessionRef.current = onNavigateToSession
  }, [onNavigateToSession])

  // Subscribe to window focus changes
  useEffect(() => {
    // Get initial focus state
    window.electronAPI.getWindowFocusState().then(setIsWindowFocused)

    // Subscribe to focus changes
    const cleanup = window.electronAPI.onWindowFocusChange((isFocused) => {
      setIsWindowFocused(isFocused)

      // Clear badge when window gains focus
      if (isFocused) {
        window.electronAPI.clearBadgeCount()
      }
    })

    return cleanup
  }, [])

  // Subscribe to notification navigation (when user clicks a notification)
  useEffect(() => {
    const cleanup = window.electronAPI.onNotificationNavigate((data) => {
      console.log('[Notifications] Navigate to session:', data.sessionId)
      onNavigateToSessionRef.current?.(data.sessionId)
    })

    return cleanup
  }, [])

  // Update badge count when sessions change or focus changes
  const updateBadgeCount = useCallback(() => {
    // Only show badge when window is not focused
    if (isWindowFocused) {
      window.electronAPI.clearBadgeCount()
      return
    }

    // Count total unread messages across all sessions
    const totalUnread = sessions.reduce((count, session) => {
      if (hasUnreadMessages(session)) {
        return count + countUnreadMessages(session)
      }
      return count
    }, 0)

    window.electronAPI.updateBadgeCount(totalUnread)
  }, [sessions, isWindowFocused])

  // Auto-update badge when sessions or focus changes
  useEffect(() => {
    updateBadgeCount()
  }, [updateBadgeCount])

  // Show notification for a session
  const showSessionNotification = useCallback((session: Session, messagePreview?: string) => {
    // Don't show notification if window is focused
    if (isWindowFocused) return
    // Don't show if no workspace
    if (!workspaceId) return

    // Get session title for notification
    const title = session.name || session.agentName || 'New message'

    // Get message preview (truncate if needed)
    let body = messagePreview || 'Craft Agent has a new message for you'
    if (body.length > 100) {
      body = body.substring(0, 97) + '...'
    }

    window.electronAPI.showNotification(title, body, workspaceId, session.id)
  }, [isWindowFocused, workspaceId])

  return {
    isWindowFocused,
    showSessionNotification,
    updateBadgeCount,
  }
}
