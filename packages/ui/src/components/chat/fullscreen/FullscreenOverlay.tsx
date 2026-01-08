/**
 * FullscreenOverlay - Unified fullscreen view with margin commenting
 *
 * Uses Dropbox Paper-style margin comments: a button appears in the right
 * margin when text is selected, and comments are positioned alongside
 * their highlighted text.
 */

import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Check, Copy, ListTodo, Send, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useTextSelection } from './hooks/useTextSelection'
import { useComments } from './hooks/useComments'
import { HighlightedMarkdown, scrollToHighlight } from './HighlightedMarkdown'
import { CommentMargin } from './CommentMargin'
import { AddCommentPopover } from './AddCommentPopover'
import { CommentPopover } from './CommentPopover'
import type { Comment } from './hooks/useComments'

export interface FullscreenOverlayProps {
  /** The content to display (markdown) */
  content: string
  /** Whether the overlay is open */
  isOpen: boolean
  /** Called when overlay should close */
  onClose: () => void
  /** Variant: 'response' (default) or 'plan' (shows header) */
  variant?: 'response' | 'plan'
  /** Callback for URL clicks */
  onOpenUrl?: (url: string) => void
  /** Callback for file path clicks */
  onOpenFile?: (path: string) => void
  /** Callback when user sends feedback (all comments formatted) */
  onSendFeedback?: (feedback: string) => void
}

const MARGIN_BREAKPOINT = 1024

export function FullscreenOverlay({
  content,
  isOpen,
  onClose,
  variant = 'response',
  onOpenUrl,
  onOpenFile,
  onSendFeedback,
}: FullscreenOverlayProps) {
  // Copy state
  const [copied, setCopied] = useState(false)

  // Responsive state - show margin on larger screens
  const [showMargin, setShowMargin] = useState(window.innerWidth > MARGIN_BREAKPOINT)

  // Comment management
  const { comments, addComment, removeComment, clearComments, formatForLLM, count } = useComments()

  // Refs for positioning
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Selection for adding comments
  const { selection, clearSelection } = useTextSelection({ containerRef: contentRef })

  // Mobile comment popover state
  const [activeComment, setActiveComment] = useState<Comment | null>(null)
  const [activeHighlightElement, setActiveHighlightElement] = useState<HTMLElement | null>(null)

  // Handle window resize for responsive margin
  useEffect(() => {
    const handleResize = () => {
      setShowMargin(window.innerWidth > MARGIN_BREAKPOINT)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If there's an active selection, clear that first
        if (selection) {
          clearSelection()
          return
        }
        if (activeComment) {
          setActiveComment(null)
          return
        }
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selection, activeComment, clearSelection, onClose])

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      clearComments()
      clearSelection()
      setActiveComment(null)
    }
  }, [isOpen, clearComments, clearSelection])

  // Copy handler
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [content])

  // Handle adding a comment
  const handleAddComment = useCallback((commentText: string) => {
    if (selection) {
      addComment(selection, commentText)
      clearSelection()
    }
  }, [selection, addComment, clearSelection])

  // Handle highlight click
  const handleHighlightClick = useCallback((comment: Comment, element: HTMLElement) => {
    if (showMargin) {
      // Desktop: scroll to the comment in margin (it's already visible)
      scrollToHighlight(comment.id, contentRef.current || undefined)
    } else {
      // Mobile: show popover
      setActiveHighlightElement(element)
      setActiveComment(comment)
    }
  }, [showMargin])

  // Handle comment click in margin (scroll to highlight)
  const handleMarginCommentClick = useCallback((comment: Comment) => {
    scrollToHighlight(comment.id, contentRef.current || undefined)
  }, [])

  // Handle sending feedback
  const handleSendFeedback = useCallback(() => {
    if (count > 0 && onSendFeedback) {
      const feedback = formatForLLM()
      onSendFeedback(feedback)
      onClose()
    }
  }, [count, formatForLLM, onSendFeedback, onClose])

  if (!isOpen) return null

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Fixed header buttons */}
      <div className="fixed top-4 right-4 z-[60] flex items-center gap-2 [-webkit-app-region:no-drag]">
        {/* Copy button */}
        <button
          onClick={handleCopy}
          className={cn(
            "p-[5px] rounded-[6px] transition-all",
            "bg-background shadow-minimal",
            copied ? "text-success" : "text-muted-foreground/50 hover:text-foreground",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
          title={copied ? "Copied!" : "Copy"}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          className={cn(
            "p-1 rounded-[6px] transition-all",
            "bg-background shadow-minimal",
            "text-muted-foreground/50 hover:text-foreground",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
          title="Close (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main scrollable area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 bg-foreground-3 overflow-y-auto"
      >
        {/* Content stays centered, margin is absolutely positioned */}
        <div className="min-h-full flex justify-center pt-16 px-6 pb-12 relative">
          {/* Content card - always centered */}
          <div className="bg-background rounded-[16px] shadow-strong w-full max-w-[720px] h-fit">
            {/* Plan header (variant="plan" only) */}
            {variant === 'plan' && (
              <div className="px-4 py-2 border-b border-border/30 flex items-center gap-2 bg-success/5 rounded-t-[16px]">
                <ListTodo className="w-3 h-3 text-success" />
                <span className="text-[13px] font-medium text-success">Plan</span>
              </div>
            )}

            {/* Content area */}
            <div ref={contentRef} className="px-10 pt-8 pb-8">
              <div className="text-sm">
                <HighlightedMarkdown
                  content={content}
                  comments={comments}
                  activeSelection={selection}
                  onHighlightClick={handleHighlightClick}
                  onUrlClick={onOpenUrl}
                  onFileClick={onOpenFile}
                />
              </div>
            </div>
          </div>

          {/* Comment margin - positioned to the right of content */}
          {showMargin && (
            <CommentMargin
              selection={selection}
              comments={comments}
              contentRef={contentRef}
              scrollRef={scrollRef}
              onAddComment={handleAddComment}
              onDeleteComment={removeComment}
              onClearSelection={clearSelection}
              onCommentClick={handleMarginCommentClick}
            />
          )}
        </div>
      </div>

      {/* Footer with send feedback button (when there are comments) */}
      {count > 0 && onSendFeedback && (
        <div className="shrink-0 bg-background border-t border-border/30 px-6 py-3 flex items-center justify-end [-webkit-app-region:no-drag]">
          <button
            onClick={handleSendFeedback}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-medium transition-all",
              "bg-accent text-accent-foreground hover:bg-accent/90",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            )}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Feedback ({count})</span>
          </button>
        </div>
      )}

      {/* Mobile: popover for adding comments (on selection) */}
      {!showMargin && (
        <AddCommentPopover
          selection={selection}
          onSubmit={handleAddComment}
          onDismiss={clearSelection}
        />
      )}

      {/* Mobile: popover for viewing comments (tap on highlight) */}
      {!showMargin && (
        <CommentPopover
          comment={activeComment}
          anchorElement={activeHighlightElement}
          onDelete={removeComment}
          onDismiss={() => {
            setActiveComment(null)
            setActiveHighlightElement(null)
          }}
        />
      )}
    </div>,
    document.body
  )
}
