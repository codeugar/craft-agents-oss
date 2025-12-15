import React, { useState, useRef, useEffect } from 'react'
import type { Session, Message } from '../../shared/types'
import MessageBubble from './MessageBubble'

interface ChatViewProps {
  session: Session
  onSendMessage: (message: string) => void
  onOpenFile: (path: string) => void
  onOpenUrl: (url: string) => void
}

export default function ChatView({ session, onSendMessage, onOpenFile, onOpenUrl }: ChatViewProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [session.id])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || session.isProcessing) return
    onSendMessage(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center">
        <h2 className="font-medium">{session.workspaceName}</h2>
        {session.isProcessing && (
          <span className="ml-2 text-xs text-craft-purple">Processing...</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {session.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#666]">
            <p>Start a conversation...</p>
          </div>
        ) : (
          session.messages.map(message => (
            <MessageBubble
              key={message.id}
              message={message}
              onOpenFile={onOpenFile}
              onOpenUrl={onOpenUrl}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-[#2a2a2a]">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            disabled={session.isProcessing}
            className="w-full bg-[#2a2a2a] rounded-lg px-4 py-3 pr-12 resize-none focus:outline-none focus:ring-1 focus:ring-craft-purple disabled:opacity-50"
            rows={1}
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || session.isProcessing}
            className="absolute right-2 bottom-2 p-2 rounded-lg bg-craft-purple text-white disabled:opacity-50 hover:bg-craft-purple-light transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  )
}
