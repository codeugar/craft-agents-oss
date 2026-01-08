/**
 * CommentsSidebar - Desktop sidebar showing all comments
 *
 * Displays a list of comments with the ability to scroll to highlights
 * and delete individual comments. Shown on screens >1024px.
 */

import * as React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageSquare, Trash2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { Comment } from './hooks/useComments'
import { scrollToHighlight } from './HighlightedMarkdown'

interface CommentsSidebarProps {
  /** Array of comments to display */
  comments: Comment[]
  /** Called when user deletes a comment */
  onDelete: (id: string) => void
  /** Currently focused comment ID */
  focusedCommentId?: string | null
  /** Called when a comment is clicked */
  onCommentClick?: (comment: Comment) => void
  /** Ref to the content container for scrolling */
  contentContainerRef?: React.RefObject<HTMLElement>
}

export function CommentsSidebar({
  comments,
  onDelete,
  focusedCommentId,
  onCommentClick,
  contentContainerRef,
}: CommentsSidebarProps) {
  const handleCommentClick = (comment: Comment) => {
    onCommentClick?.(comment)
    scrollToHighlight(comment.id, contentContainerRef?.current || undefined)
  }

  return (
    <div className="w-[280px] shrink-0 border-l border-border/30 bg-muted/20 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          Comments
          {comments.length > 0 && (
            <span className="ml-1.5 text-muted-foreground">({comments.length})</span>
          )}
        </span>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {comments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-4 py-8 text-center"
            >
              <p className="text-sm text-muted-foreground/70">
                Select text to add comments
              </p>
            </motion.div>
          ) : (
            comments.map((comment, index) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "px-4 py-3 border-b border-border/20 cursor-pointer transition-colors",
                  "hover:bg-muted/30",
                  focusedCommentId === comment.id && "bg-accent/10"
                )}
                onClick={() => handleCommentClick(comment)}
              >
                {/* Selected text preview */}
                <p className="text-xs text-muted-foreground line-clamp-1 italic mb-1.5">
                  "{comment.selectedText}"
                </p>

                {/* Comment text */}
                <p className="text-sm text-foreground line-clamp-3 mb-2">
                  {comment.commentText}
                </p>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(comment.id)
                  }}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-[4px] transition-colors",
                    "text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                  )}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  <span>Delete</span>
                </button>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
