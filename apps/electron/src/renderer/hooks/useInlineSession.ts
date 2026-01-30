/**
 * useInlineSession - Hook for managing inline chat sessions in popovers
 *
 * Creates a hidden session on first message, subscribes to events,
 * and provides session data for ChatDisplay.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { Session, CreateSessionOptions, SessionEvent } from '../../shared/types'
import type { Message } from '@craft-agent/core/types'

export interface UseInlineSessionOptions {
  /** Workspace ID for creating the session */
  workspaceId: string
  /** Session creation options (model, systemPromptPreset, permissionMode, etc.) */
  createOptions?: Omit<CreateSessionOptions, 'hidden'>
  /** Called when session completes successfully */
  onComplete?: () => void
  /** Called when session errors */
  onError?: (error: string) => void
}

export interface UseInlineSessionResult {
  /** The session object (null until first message is sent) */
  session: Session | null
  /** Whether the session is currently processing */
  isProcessing: boolean
  /** Whether we're in the process of creating the session */
  isCreating: boolean
  /** Error message if something went wrong */
  error: string | null
  /** Send a message (creates session on first call) */
  sendMessage: (message: string, badges?: unknown[]) => Promise<void>
  /** Reset the session state (for retry) */
  reset: () => void
}

/**
 * Hook for managing inline chat sessions in EditPopover.
 *
 * Usage:
 * ```tsx
 * const { session, isProcessing, sendMessage } = useInlineSession({
 *   workspaceId: workspace.id,
 *   createOptions: { model: 'haiku', systemPromptPreset: 'mini' }
 * })
 *
 * <ChatDisplay
 *   session={session}
 *   onSendMessage={(msg) => sendMessage(msg)}
 *   ...
 * />
 * ```
 */
export function useInlineSession({
  workspaceId,
  createOptions,
  onComplete,
  onError,
}: UseInlineSessionOptions): UseInlineSessionResult {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track if we've completed (to avoid duplicate callbacks)
  const completedRef = useRef(false)

  // Subscribe to session events when we have a session
  useEffect(() => {
    if (!sessionId) return

    const cleanup = window.electronAPI.onSessionEvent(async (event: SessionEvent) => {
      if (event.sessionId !== sessionId) return

      switch (event.type) {
        case 'message_start':
        case 'text_start':
          setIsProcessing(true)
          break

        case 'text_complete':
        case 'tool_result':
          // Refresh messages from main process to get updated content
          try {
            const updated = await window.electronAPI.getSessionMessages(sessionId)
            if (updated) {
              setSession(prev => prev ? { ...prev, messages: updated.messages } : null)
            }
          } catch (e) {
            console.error('[useInlineSession] Failed to refresh messages:', e)
          }
          break

        case 'complete':
          setIsProcessing(false)
          if (!completedRef.current) {
            completedRef.current = true
            onComplete?.()
          }
          // Final refresh to get complete messages
          try {
            const updated = await window.electronAPI.getSessionMessages(sessionId)
            if (updated) {
              setSession(prev => prev ? { ...prev, messages: updated.messages, isProcessing: false } : null)
            }
          } catch (e) {
            console.error('[useInlineSession] Failed to refresh messages on complete:', e)
          }
          break

        case 'error':
          setIsProcessing(false)
          setError(event.error || 'An error occurred')
          onError?.(event.error || 'An error occurred')
          break

        case 'interrupted':
          setIsProcessing(false)
          setError('Execution was interrupted')
          onError?.('Execution was interrupted')
          break
      }
    })

    return cleanup
  }, [sessionId, onComplete, onError])

  // Send message (creates session on first call)
  const sendMessage = useCallback(async (message: string, badges?: unknown[]) => {
    setError(null)

    // If no session yet, create one first
    if (!sessionId) {
      setIsCreating(true)
      try {
        const newSession = await window.electronAPI.createSession(workspaceId, {
          ...createOptions,
          hidden: true, // Always hidden for inline sessions
        })

        setSessionId(newSession.id)
        setSession({
          ...newSession,
          messages: [],
          isProcessing: true,
        })
        setIsProcessing(true)
        completedRef.current = false

        // Send the message
        await window.electronAPI.sendMessage(
          newSession.id,
          message,
          [], // attachments
          [], // storedAttachments
          badges ? { badges: badges as import('../../shared/types').ContentBadge[] } : undefined
        )
      } catch (e) {
        console.error('[useInlineSession] Failed to create session:', e)
        setError(e instanceof Error ? e.message : 'Failed to create session')
        onError?.(e instanceof Error ? e.message : 'Failed to create session')
      } finally {
        setIsCreating(false)
      }
      return
    }

    // Session exists, just send the message
    setIsProcessing(true)
    try {
      await window.electronAPI.sendMessage(
        sessionId,
        message,
        [],
        [],
        badges ? { badges: badges as import('../../shared/types').ContentBadge[] } : undefined
      )
    } catch (e) {
      console.error('[useInlineSession] Failed to send message:', e)
      setError(e instanceof Error ? e.message : 'Failed to send message')
      setIsProcessing(false)
    }
  }, [sessionId, workspaceId, createOptions, onError])

  // Reset state (for retry)
  const reset = useCallback(() => {
    setSessionId(null)
    setSession(null)
    setIsProcessing(false)
    setIsCreating(false)
    setError(null)
    completedRef.current = false
  }, [])

  return {
    session,
    isProcessing,
    isCreating,
    error,
    sendMessage,
    reset,
  }
}
