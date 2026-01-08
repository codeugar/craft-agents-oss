/**
 * CommentPopover - Popover for viewing a comment on highlighted text
 *
 * Used on mobile/narrow screens when tapping a highlighted comment.
 * Shows the selected text and comment with a delete option.
 */

import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Trash2, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { Comment } from './hooks/useComments'

interface CommentPopoverProps {
  /** The comment to display */
  comment: Comment | null
  /** Anchor element (the highlighted mark) */
  anchorElement: HTMLElement | null
  /** Called when user deletes the comment */
  onDelete: (id: string) => void
  /** Called when popover is dismissed */
  onDismiss: () => void
}

export function CommentPopover({
  comment,
  anchorElement,
  onDelete,
  onDismiss,
}: CommentPopoverProps) {
  const isOpen = comment !== null && anchorElement !== null

  if (!comment || !anchorElement) return null

  // Get the bounding rect of the anchor element for positioning
  const rect = anchorElement.getBoundingClientRect()

  return (
    <Popover.Root open={isOpen} onOpenChange={(open) => !open && onDismiss()}>
      {/* Virtual anchor positioned at the highlight element */}
      <Popover.Anchor
        style={{
          position: 'fixed',
          left: rect.left + rect.width / 2,
          top: rect.top,
          width: 0,
          height: 0,
        }}
      />
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          className={cn(
            "z-[70] w-[280px] rounded-[10px] bg-background shadow-strong border border-border/50",
            "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "[-webkit-app-region:no-drag]"
          )}
        >
          {/* Header with close button */}
          <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Comment</span>
            <Popover.Close asChild>
              <button
                className="p-1 rounded-[4px] text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Close"
              >
                <X className="w-3 h-3" />
              </button>
            </Popover.Close>
          </div>

          {/* Selected text */}
          <div className="px-3 py-2 border-b border-border/30 bg-muted/30">
            <p className="text-xs text-muted-foreground line-clamp-2 italic">
              "{comment.selectedText}"
            </p>
          </div>

          {/* Comment text */}
          <div className="px-3 py-2.5">
            <p className="text-sm text-foreground">{comment.commentText}</p>
          </div>

          {/* Actions */}
          <div className="px-3 py-2 border-t border-border/30 flex justify-end">
            <button
              onClick={() => {
                onDelete(comment.id)
                onDismiss()
              }}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 text-xs rounded-[4px] transition-colors",
                "text-destructive/70 hover:text-destructive hover:bg-destructive/10"
              )}
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
