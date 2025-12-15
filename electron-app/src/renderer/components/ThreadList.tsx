import React, { useState } from 'react'
import type { Session, Workspace } from '../../shared/types'

interface ThreadListProps {
  sessions: Session[]
  workspaces: Workspace[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onCreateSession: (workspaceId: string) => void
  onDeleteSession: (id: string) => void
}

export default function ThreadList({
  sessions,
  workspaces,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession
}: ThreadListProps) {
  const [showNewMenu, setShowNewMenu] = useState(false)

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  const getPreview = (session: Session) => {
    const lastMessage = session.messages[session.messages.length - 1]
    if (!lastMessage) return 'New conversation'
    const content = lastMessage.content
    return content.length > 50 ? content.slice(0, 50) + '...' : content
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a2a]">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-craft-purple">Threads</h1>
          <div className="relative">
            <button
              onClick={() => setShowNewMenu(!showNewMenu)}
              className="p-2 rounded hover:bg-[#2a2a2a] transition-colors"
              title="New thread"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {showNewMenu && workspaces.length > 0 && (
              <div className="absolute right-0 mt-1 w-48 bg-[#2a2a2a] rounded-lg shadow-lg border border-[#3a3a3a] z-10">
                <div className="p-2">
                  <p className="text-xs text-[#888] px-2 mb-1">Select workspace</p>
                  {workspaces.map(ws => (
                    <button
                      key={ws.id}
                      onClick={() => {
                        onCreateSession(ws.id)
                        setShowNewMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 rounded hover:bg-[#3a3a3a] text-sm"
                    >
                      {ws.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-[#666]">
            <p className="text-sm">No threads yet</p>
            <p className="text-xs mt-1">Click + to start a new conversation</p>
          </div>
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`p-3 border-b border-[#2a2a2a] cursor-pointer transition-colors group ${
                activeSessionId === session.id ? 'bg-[#2a2a2a]' : 'hover:bg-[#222]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{session.workspaceName}</span>
                    {session.isProcessing && (
                      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-craft-purple animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs text-[#888] truncate mt-1">{getPreview(session)}</p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-[#666]">{formatTime(session.lastMessageAt)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteSession(session.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#3a3a3a] transition-opacity"
                    title="Delete thread"
                  >
                    <svg className="w-4 h-4 text-[#888]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
