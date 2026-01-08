/**
 * useComments - Hook for managing inline comments on text content
 *
 * Tracks comments with their text ranges and provides methods
 * for adding, removing, and formatting comments for LLM feedback.
 */

import { useState, useCallback, useMemo } from 'react'
import type { SelectionState } from './useTextSelection'

export interface Comment {
  id: string
  startOffset: number
  endOffset: number
  selectedText: string
  commentText: string
}

interface UseCommentsReturn {
  /** All comments */
  comments: Comment[]
  /** Add a new comment from a selection */
  addComment: (selection: SelectionState, commentText: string) => void
  /** Remove a comment by ID */
  removeComment: (id: string) => void
  /** Clear all comments */
  clearComments: () => void
  /** Format all comments as feedback for the LLM */
  formatForLLM: () => string
  /** Number of comments */
  count: number
}

function generateId(): string {
  return `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Get the text offset within a container element
 * This calculates the character offset from the start of the container's text content
 */
function getTextOffset(container: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)

  let node = walker.nextNode()
  while (node) {
    if (node === targetNode) {
      return offset + targetOffset
    }
    offset += node.textContent?.length ?? 0
    node = walker.nextNode()
  }

  return offset
}

export function useComments(): UseCommentsReturn {
  const [comments, setComments] = useState<Comment[]>([])

  const addComment = useCallback((selection: SelectionState, commentText: string) => {
    const { range, text } = selection

    // Get the common ancestor container for offset calculation
    const container = range.commonAncestorContainer
    const rootContainer = container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : container

    if (!rootContainer) return

    // Calculate offsets relative to the container
    const startOffset = getTextOffset(rootContainer, range.startContainer, range.startOffset)
    const endOffset = startOffset + text.length

    const newComment: Comment = {
      id: generateId(),
      startOffset,
      endOffset,
      selectedText: text,
      commentText,
    }

    setComments(prev => [...prev, newComment])
  }, [])

  const removeComment = useCallback((id: string) => {
    setComments(prev => prev.filter(c => c.id !== id))
  }, [])

  const clearComments = useCallback(() => {
    setComments([])
  }, [])

  const formatForLLM = useCallback((): string => {
    if (comments.length === 0) return ''

    const formatted = comments
      .map(c => `> "${c.selectedText}"\n${c.commentText}`)
      .join('\n\n')

    return `I have feedback on your response:\n\n${formatted}`
  }, [comments])

  const count = useMemo(() => comments.length, [comments])

  return {
    comments,
    addComment,
    removeComment,
    clearComments,
    formatForLLM,
    count,
  }
}
