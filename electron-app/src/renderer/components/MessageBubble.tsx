import React from 'react'
import type { Message } from '../../shared/types'

interface MessageBubbleProps {
  message: Message
  onOpenFile: (path: string) => void
  onOpenUrl: (url: string) => void
}

export default function MessageBubble({ message, onOpenFile, onOpenUrl }: MessageBubbleProps) {
  /**
   * Detects and linkifies URLs and file paths in text.
   * URLs open in the browser panel, file paths open in the file viewer.
   */
  const detectLinks = (text: string): React.ReactNode => {
    // Patterns for URLs and file paths
    const urlRegex = /(https?:\/\/[^\s]+)/g
    // File path detection (starts with / or ~, ends with common extensions)
    const fileRegex = /((?:\/|~\/)[^\s]+\.(?:md|txt|json|yaml|yml|ts|tsx|js|jsx|py|go|rs|swift|kt|java|c|cpp|h|hpp|css|scss|html|xml|toml|ini|cfg|conf|sh|bash|zsh))/g

    // Collect all matches with their positions
    interface Match {
      type: 'url' | 'file'
      text: string
      index: number
      length: number
    }

    const matches: Match[] = []

    // Find all URLs
    let match: RegExpExecArray | null
    while ((match = urlRegex.exec(text)) !== null) {
      matches.push({
        type: 'url',
        text: match[0],
        index: match.index,
        length: match[0].length
      })
    }

    // Find all file paths
    while ((match = fileRegex.exec(text)) !== null) {
      // Avoid matching URLs that happen to end with a file extension
      const isPartOfUrl = matches.some(
        m => m.type === 'url' && match!.index >= m.index && match!.index < m.index + m.length
      )
      if (!isPartOfUrl) {
        matches.push({
          type: 'file',
          text: match[0],
          index: match.index,
          length: match[0].length
        })
      }
    }

    // Sort matches by position
    matches.sort((a, b) => a.index - b.index)

    // If no matches, return plain text
    if (matches.length === 0) {
      return text
    }

    // Build the result with linkified parts
    const parts: React.ReactNode[] = []
    let lastIndex = 0

    for (const m of matches) {
      // Add text before this match
      if (m.index > lastIndex) {
        parts.push(text.slice(lastIndex, m.index))
      }

      // Add the linked match
      if (m.type === 'url') {
        parts.push(
          <button
            key={`url-${m.index}`}
            onClick={() => onOpenUrl(m.text)}
            className="text-craft-purple hover:underline"
          >
            {m.text}
          </button>
        )
      } else {
        parts.push(
          <button
            key={`file-${m.index}`}
            onClick={() => onOpenFile(m.text)}
            className="text-blue-400 hover:underline font-mono text-sm"
          >
            {m.text}
          </button>
        )
      }

      lastIndex = m.index + m.length
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }

    return parts
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-craft-purple text-white rounded-2xl rounded-br-md px-4 py-2">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] bg-[#2a2a2a] rounded-2xl rounded-bl-md px-4 py-2">
          <p className="whitespace-pre-wrap">{detectLinks(message.content)}</p>
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 bg-craft-purple ml-1 animate-pulse" />
          )}
        </div>
      </div>
    )
  }

  if (message.role === 'tool') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] bg-[#1e2a1e] border border-[#2a4a2a] rounded-lg px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-[#6a9a6a] mb-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{message.toolName}</span>
          </div>
          {message.toolResult ? (
            <pre className="text-xs text-[#8a8a8a] overflow-x-auto max-h-32 overflow-y-auto">
              {message.toolResult.slice(0, 500)}
              {message.toolResult.length > 500 && '...'}
            </pre>
          ) : (
            <span className="text-xs text-[#6a9a6a]">Running...</span>
          )}
        </div>
      </div>
    )
  }

  if (message.role === 'error') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] bg-[#2a1e1e] border border-[#4a2a2a] rounded-lg px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-[#ef4444] mb-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Error</span>
          </div>
          <p className="text-sm text-[#ff6b6b]">{message.content}</p>
        </div>
      </div>
    )
  }

  if (message.role === 'status') {
    return (
      <div className="flex justify-center">
        <div className="px-3 py-1 rounded-full bg-[#2a2a2a] text-xs text-[#888]">
          {message.content}
        </div>
      </div>
    )
  }

  return null
}
