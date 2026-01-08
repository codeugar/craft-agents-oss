/**
 * HighlightedMarkdown - Markdown content with comment highlights
 *
 * Wraps the Markdown component and overlays comment highlights.
 * Uses a simple approach: renders markdown normally, then uses
 * CSS to highlight ranges based on comment data.
 */

import * as React from 'react'
import { useRef, useEffect, useCallback } from 'react'
import { cn } from '../../../lib/utils'
import { Markdown } from '../../markdown'
import type { Comment } from './hooks/useComments'
import type { SelectionState } from './hooks/useTextSelection'

interface HighlightedMarkdownProps {
  /** The markdown content */
  content: string
  /** Array of comments to highlight */
  comments: Comment[]
  /** Current active selection (shown as temporary highlight) */
  activeSelection?: SelectionState | null
  /** Callback when a highlight is clicked */
  onHighlightClick?: (comment: Comment, element: HTMLElement) => void
  /** Callback for URL clicks */
  onUrlClick?: (url: string) => void
  /** Callback for file path clicks */
  onFileClick?: (path: string) => void
  /** Additional className */
  className?: string
}

/**
 * Finds and wraps text ranges with mark elements based on comments
 * This is a simplified approach that works with rendered markdown
 */
function applyHighlights(
  container: HTMLElement,
  comments: Comment[],
  onHighlightClick?: (comment: Comment, element: HTMLElement) => void
) {
  // Remove existing highlights
  container.querySelectorAll('mark[data-comment-id]').forEach(mark => {
    const parent = mark.parentNode
    if (parent) {
      // Replace mark with its text content
      const textNode = document.createTextNode(mark.textContent || '')
      parent.replaceChild(textNode, mark)
      parent.normalize() // Merge adjacent text nodes
    }
  })

  if (comments.length === 0) return

  // Sort comments by start offset (process in order)
  const sortedComments = [...comments].sort((a, b) => a.startOffset - b.startOffset)

  // Process each comment
  for (const comment of sortedComments) {
    const { selectedText, id } = comment

    // Find the text in the container
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let node: Node | null
    let found = false

    while ((node = walker.nextNode()) && !found) {
      const textContent = node.textContent || ''
      const index = textContent.indexOf(selectedText)

      if (index !== -1) {
        const textNode = node as Text
        const parent = textNode.parentNode

        if (!parent) continue

        // Don't highlight inside existing marks or code blocks
        const parentElement = parent as HTMLElement
        if (
          parentElement.tagName === 'MARK' ||
          parentElement.tagName === 'CODE' ||
          parentElement.closest('pre')
        ) {
          continue
        }

        // Split the text node and wrap the match
        const before = textContent.slice(0, index)
        const match = textContent.slice(index, index + selectedText.length)
        const after = textContent.slice(index + selectedText.length)

        // Create the mark element
        const mark = document.createElement('mark')
        mark.setAttribute('data-comment-id', id)
        mark.className = cn(
          'bg-accent/20 rounded-[2px] cursor-pointer transition-colors',
          'hover:bg-accent/30'
        )
        mark.textContent = match

        // Add click handler
        if (onHighlightClick) {
          mark.addEventListener('click', (e) => {
            e.stopPropagation()
            onHighlightClick(comment, mark)
          })
        }

        // Replace the text node with our new structure
        const fragment = document.createDocumentFragment()
        if (before) fragment.appendChild(document.createTextNode(before))
        fragment.appendChild(mark)
        if (after) fragment.appendChild(document.createTextNode(after))

        parent.replaceChild(fragment, textNode)
        found = true
      }
    }
  }
}

/**
 * Applies a temporary highlight for the active selection using the actual Range
 * This preserves the visual selection when focus moves to the comment popover
 * and highlights the exact text that was selected (not just the first occurrence)
 */
function applyActiveSelectionHighlight(
  container: HTMLElement,
  selection: SelectionState | null | undefined
) {
  // Remove existing active selection highlight
  container.querySelectorAll('mark[data-active-selection]').forEach(mark => {
    const parent = mark.parentNode
    if (parent) {
      // Move all children out of the mark
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark)
      }
      parent.removeChild(mark)
      parent.normalize()
    }
  })

  if (!selection) return

  const { range } = selection

  // Check if the range is still valid and within our container
  if (!range) return

  try {
    // Verify the range is still in the document and within our container
    if (!range.commonAncestorContainer || !container.contains(range.commonAncestorContainer)) {
      return
    }

    // Check if selection is inside code blocks - skip if so
    const ancestor = range.commonAncestorContainer
    const ancestorElement = ancestor.nodeType === Node.ELEMENT_NODE
      ? ancestor as HTMLElement
      : ancestor.parentElement
    if (ancestorElement?.closest('pre, code')) {
      return
    }

    // Create the mark element for active selection
    const mark = document.createElement('mark')
    mark.setAttribute('data-active-selection', 'true')
    mark.className = cn('bg-info/30 rounded-[2px]')

    // Use surroundContents for simple single-node selections
    // For complex selections spanning multiple nodes, extract and wrap
    if (
      range.startContainer === range.endContainer &&
      range.startContainer.nodeType === Node.TEXT_NODE
    ) {
      // Simple case: selection within a single text node
      range.surroundContents(mark)
    } else {
      // Complex case: selection spans multiple nodes
      // Extract contents, wrap in mark, and insert back
      const contents = range.extractContents()
      mark.appendChild(contents)
      range.insertNode(mark)
    }
  } catch (e) {
    // Range operations can throw if the DOM has changed
    // Silently fail - the browser's native selection highlight will still show
    console.debug('Could not apply selection highlight:', e)
  }
}

export function HighlightedMarkdown({
  content,
  comments,
  activeSelection,
  onHighlightClick,
  onUrlClick,
  onFileClick,
  className,
}: HighlightedMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Apply comment highlights after render and when comments change
  useEffect(() => {
    if (!containerRef.current) return

    // Small delay to ensure markdown has rendered
    const timer = setTimeout(() => {
      if (containerRef.current) {
        applyHighlights(containerRef.current, comments, onHighlightClick)
      }
    }, 50)

    return () => clearTimeout(timer)
  }, [content, comments, onHighlightClick])

  // Apply active selection highlight separately (runs more frequently)
  useEffect(() => {
    if (!containerRef.current) return

    // Apply immediately for responsive feel
    applyActiveSelectionHighlight(containerRef.current, activeSelection)
  }, [activeSelection])

  return (
    <div ref={containerRef} className={className}>
      <Markdown
        mode="minimal"
        onUrlClick={onUrlClick}
        onFileClick={onFileClick}
      >
        {content}
      </Markdown>
    </div>
  )
}

/**
 * Scroll a highlight into view and briefly pulse it
 */
export function scrollToHighlight(commentId: string, container?: HTMLElement) {
  const target = container || document
  const mark = target.querySelector(`mark[data-comment-id="${commentId}"]`) as HTMLElement

  if (mark) {
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Add a pulse effect
    mark.style.transition = 'background-color 0.2s'
    mark.style.backgroundColor = 'var(--accent)'
    setTimeout(() => {
      mark.style.backgroundColor = ''
    }, 300)
  }
}
