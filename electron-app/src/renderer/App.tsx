import React, { useState, useEffect, useCallback } from 'react'
import type { Session, Workspace, SessionEvent, Message } from '../shared/types'
import { generateMessageId } from '../shared/types'
import ThreadList from './components/ThreadList'
import ChatView from './components/ChatView'
import RightSidebar from './components/RightSidebar'

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [rightPanelContent, setRightPanelContent] = useState<{ type: 'markdown' | 'browser'; url: string } | null>(null)

  // Load workspaces on mount
  useEffect(() => {
    window.electronAPI.getWorkspaces().then(setWorkspaces)
    window.electronAPI.getSessions().then(setSessions)
  }, [])

  // Listen for session events
  useEffect(() => {
    const cleanup = window.electronAPI.onSessionEvent((event: SessionEvent) => {
      setSessions(prev => {
        return prev.map(session => {
          if (session.id !== event.sessionId) return session

          switch (event.type) {
            case 'text_delta': {
              // Update streaming text - append to existing streaming message or create new one
              const lastMsg = session.messages[session.messages.length - 1]

              // If last message is a streaming assistant message, append to it
              if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
                return {
                  ...session,
                  messages: [
                    ...session.messages.slice(0, -1),
                    { ...lastMsg, content: lastMsg.content + event.delta }
                  ]
                }
              }

              // If last message is assistant but not streaming (shouldn't happen normally),
              // or last message is something else, start a new streaming message
              return {
                ...session,
                messages: [
                  ...session.messages,
                  {
                    id: generateMessageId(),
                    role: 'assistant' as const,
                    content: event.delta,
                    timestamp: Date.now(),
                    isStreaming: true
                  }
                ]
              }
            }

            case 'text_complete': {
              const msgs = session.messages
              const lastAssistant = msgs[msgs.length - 1]
              if (lastAssistant?.role === 'assistant') {
                return {
                  ...session,
                  messages: [
                    ...msgs.slice(0, -1),
                    { ...lastAssistant, content: event.text, isStreaming: false }
                  ]
                }
              }
              return session
            }

            case 'tool_start':
              return {
                ...session,
                messages: [
                  ...session.messages,
                  {
                    id: generateMessageId(),
                    role: 'tool' as const,
                    content: `Running ${event.toolName}...`,
                    timestamp: Date.now(),
                    toolName: event.toolName,
                    toolUseId: event.toolUseId,
                    toolInput: event.toolInput
                  }
                ]
              }

            case 'tool_result': {
              // Match by toolUseId for reliable matching (not toolName which could have duplicates)
              const toolMsgs = session.messages
              const matchingTool = toolMsgs.find(m => m.toolUseId === event.toolUseId)
              if (matchingTool) {
                return {
                  ...session,
                  messages: toolMsgs.map(m =>
                    m.toolUseId === event.toolUseId
                      ? { ...m, content: event.result, toolResult: event.result }
                      : m
                  )
                }
              }
              // Fallback: try matching by toolName (for backwards compatibility)
              const lastTool = toolMsgs.findLast(m => m.toolName === event.toolName && !m.toolResult)
              if (lastTool) {
                return {
                  ...session,
                  messages: toolMsgs.map(m =>
                    m.id === lastTool.id
                      ? { ...m, content: event.result, toolResult: event.result }
                      : m
                  )
                }
              }
              return session
            }

            case 'error':
              return {
                ...session,
                messages: [
                  ...session.messages,
                  {
                    id: generateMessageId(),
                    role: 'error' as const,
                    content: event.error,
                    timestamp: Date.now()
                  }
                ]
              }

            case 'typed_error':
              // Typed errors have structured information - show title and message
              return {
                ...session,
                messages: [
                  ...session.messages,
                  {
                    id: generateMessageId(),
                    role: 'error' as const,
                    content: event.error.title
                      ? `${event.error.title}: ${event.error.message}`
                      : event.error.message,
                    timestamp: Date.now()
                  }
                ]
              }

            case 'status':
              // Add status messages to show progress (e.g., "Compacting conversation...")
              return {
                ...session,
                messages: [
                  ...session.messages,
                  {
                    id: generateMessageId(),
                    role: 'status' as const,
                    content: event.message,
                    timestamp: Date.now()
                  }
                ]
              }

            case 'complete':
              return { ...session, isProcessing: false }

            default:
              return session
          }
        })
      })
    })

    return cleanup
  }, [])

  const handleCreateSession = useCallback(async (workspaceId: string) => {
    const session = await window.electronAPI.createSession(workspaceId)
    setSessions(prev => [session, ...prev])
    setActiveSessionId(session.id)
  }, [])

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await window.electronAPI.deleteSession(sessionId)
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    if (activeSessionId === sessionId) {
      setActiveSessionId(null)
    }
  }, [activeSessionId])

  const handleSendMessage = useCallback(async (message: string) => {
    if (!activeSessionId) return

    // Add user message to local state immediately for responsive UI
    const userMessage: Message = {
      id: generateMessageId(),
      role: 'user',
      content: message,
      timestamp: Date.now()
    }

    setSessions(prev => prev.map(s =>
      s.id === activeSessionId
        ? { ...s, messages: [...s.messages, userMessage], isProcessing: true }
        : s
    ))

    // Send to main process - this returns immediately, results come via events
    try {
      await window.electronAPI.sendMessage(activeSessionId, message)
    } catch (error) {
      // Handle IPC errors (e.g., main process crashed)
      console.error('Failed to send message:', error)
      setSessions(prev => prev.map(s =>
        s.id === activeSessionId
          ? {
              ...s,
              isProcessing: false,
              messages: [
                ...s.messages,
                {
                  id: generateMessageId(),
                  role: 'error' as const,
                  content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  timestamp: Date.now()
                }
              ]
            }
          : s
      ))
    }
  }, [activeSessionId])

  const handleOpenFile = useCallback((path: string) => {
    setRightPanelContent({ type: 'markdown', url: path })
  }, [])

  const handleOpenUrl = useCallback((url: string) => {
    setRightPanelContent({ type: 'browser', url })
  }, [])

  const activeSession = sessions.find(s => s.id === activeSessionId)

  return (
    <div className="flex h-full bg-[#1a1a1a]">
      {/* Left sidebar - Thread list */}
      <div className="w-64 border-r border-[#2a2a2a] flex flex-col">
        <ThreadList
          sessions={sessions}
          workspaces={workspaces}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
        />
      </div>

      {/* Main area - Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeSession ? (
          <ChatView
            session={activeSession}
            onSendMessage={handleSendMessage}
            onOpenFile={handleOpenFile}
            onOpenUrl={handleOpenUrl}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#666]">
            <div className="text-center">
              <h2 className="text-xl mb-2">Welcome to Craft Agent</h2>
              <p>Select a thread or create a new one to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar - File viewer / Browser */}
      {rightPanelContent && (
        <div className="w-96 border-l border-[#2a2a2a]">
          <RightSidebar
            content={rightPanelContent}
            onClose={() => setRightPanelContent(null)}
          />
        </div>
      )}
    </div>
  )
}
