/**
 * AddCommentPopover - Popover for adding a comment on selected text
 *
 * Appears near the text selection with a text input and submit button.
 * Supports Cmd+Enter to submit.
 */

import * as React from 'react'
import { useState, useRef, useEffect, useCallback } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { MessageSquarePlus, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { SelectionState } from './hooks/useTextSelection'

interface AddCommentPopoverProps {
  /** The current text selection */
  selection: SelectionState | null
  /** Called when user submits a comment */
  onSubmit: (commentText: string) => void
  /** Called when popover is dismissed */
  onDismiss: () => void
}

export function AddCommentPopover({
  selection,
  onSubmit,
  onDismiss,
}: AddCommentPopoverProps) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isOpen = selection !== null

  // Reset text when popover opens
  useEffect(() => {
    if (isOpen) {
      setText('')
      // Small delay to ensure popover is rendered before focusing
      // Use preventScroll to avoid any layout shifts that might affect selection
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50)
    }
  }, [isOpen])

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (trimmed) {
      onSubmit(trimmed)
      setText('')
    }
  }, [text, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onDismiss()
    }
  }, [handleSubmit, onDismiss])

  if (!selection) return null

  // Calculate position based on selection rect
  const { rect } = selection

  return (
    <Popover.Root open={isOpen} onOpenChange={(open) => !open && onDismiss()}>
      {/* Virtual anchor positioned at the selection */}
      <Popover.Anchor
        style={{
          position: 'fixed',
          left: rect.left + rect.width / 2,
          top: rect.bottom + 8,
          width: 0,
          height: 0,
        }}
      />
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={0}
          className={cn(
            "z-[70] w-[320px] rounded-[10px] bg-background shadow-strong border border-border/50",
            "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "[-webkit-app-region:no-drag]"
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <MessageSquarePlus className="w-3.5 h-3.5 text-accent" />
              <span>Add Comment</span>
            </div>
            <Popover.Close asChild>
              <button
                className="p-1 rounded-[4px] text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Close"
              >
                <X className="w-3 h-3" />
              </button>
            </Popover.Close>
          </div>

          {/* Selected text preview */}
          <div className="px-3 py-2 border-b border-border/30 bg-muted/30">
            <p className="text-xs text-muted-foreground line-clamp-2 italic">
              "{selection.text}"
            </p>
          </div>

          {/* Input area */}
          <div className="p-3">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's your feedback on this?"
              className={cn(
                "w-full h-[72px] px-2.5 py-2 text-sm rounded-[6px] resize-none",
                "bg-muted/50 border border-border/50",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
              )}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/50">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to submit
              </span>
              <button
                onClick={handleSubmit}
                disabled={!text.trim()}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-[6px] transition-all",
                  text.trim()
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-muted text-muted-foreground/50 cursor-not-allowed"
                )}
              >
                Add Comment
              </button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
