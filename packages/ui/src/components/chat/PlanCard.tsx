/**
 * PlanCard - Inline plan message component
 *
 * Displays a plan submitted by the agent for user review.
 * Uses the same markdown rendering and max height as TurnCard responses.
 * Platform-agnostic: accepts callbacks for all interactions.
 */

import * as React from 'react'
import { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { Check, ListTodo, Maximize2, ExternalLink, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Markdown } from '../markdown'

// ============================================================================
// Size Configuration (matches TurnCard)
// ============================================================================

const SIZE_CONFIG = {
  fontSize: 'text-[13px]',
  iconSize: 'w-3 h-3',
} as const

// ============================================================================
// Types
// ============================================================================

export interface PlanCardProps {
  /** The plan content (markdown) */
  content: string
  /** Callback when user accepts the plan */
  onAccept?: () => void
  /** Callback to open file in editor */
  onOpenFile?: (path: string) => void
  /** Callback to open URL */
  onOpenUrl?: (url: string) => void
  /** Callback to open plan content in external viewer */
  onPopOut?: (text: string) => void
  /** Whether a user message has been sent after this plan (hides the approve footer) */
  hasUserResponse?: boolean
}

// ============================================================================
// PlanCard Component
// ============================================================================

export function PlanCard({
  content,
  onAccept,
  onOpenFile,
  onOpenUrl,
  onPopOut,
  hasUserResponse = false,
}: PlanCardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Accept the plan - calls the provided callback
  const handleAcceptPlan = () => onAccept?.()

  // Handle escape key to close fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  const MAX_HEIGHT = 540

  return (
    <>
      <div className="bg-background shadow-minimal rounded-[8px] overflow-hidden relative group">
        {/* Fullscreen button - top right corner, visible on hover */}
        <button
          onClick={() => setIsFullscreen(true)}
          className={cn(
            "absolute top-2 right-2 p-1 rounded-[6px] transition-all z-10",
            "opacity-0 group-hover:opacity-100",
            "bg-background shadow-minimal",
            "text-muted-foreground/50 hover:text-foreground",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:opacity-100"
          )}
          title="View Fullscreen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {/* Header with plan indicator */}
        <div
          className={cn(
            "px-4 py-2 border-b border-border/30 flex items-center gap-2 bg-success/5",
            SIZE_CONFIG.fontSize
          )}
        >
          <ListTodo className={cn(SIZE_CONFIG.iconSize, "text-success")} />
          <span className="font-medium text-success">Plan</span>
        </div>

        {/* Content area */}
        <div
          className="pl-[22px] pr-[16px] py-3 text-sm overflow-y-auto"
          style={{ maxHeight: MAX_HEIGHT }}
        >
          <Markdown
            mode="minimal"
            onUrlClick={onOpenUrl}
            onFileClick={onOpenFile}
          >
            {content}
          </Markdown>
        </div>

        {/* Footer with View as Markdown on left, Accept Plan on right - only shown until user responds */}
        {!hasUserResponse && (
          <div className={cn(
            "pl-4 pr-2.5 py-2 border-t border-border/30 flex items-center justify-between bg-muted/20",
            SIZE_CONFIG.fontSize
          )}>
            {/* Left side - View as Markdown */}
            {onPopOut ? (
              <button
                onClick={() => onPopOut(content)}
                className={cn(
                  "flex items-center gap-1.5 transition-colors",
                  "text-muted-foreground hover:text-foreground",
                  "focus:outline-none focus-visible:underline"
                )}
              >
                <ExternalLink className={SIZE_CONFIG.iconSize} />
                <span>View as Markdown</span>
              </button>
            ) : (
              <div />
            )}

            {/* Right side - Accept Plan */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Type your feedback in chat or
              </span>
              <button
                type="button"
                onClick={handleAcceptPlan}
                className="h-[28px] pl-2.5 pr-2.5 text-xs font-medium rounded-[6px] flex items-center gap-1.5 transition-all bg-success/5 text-success hover:bg-success/10 shadow-tinted"
                style={{ '--shadow-color': '34, 136, 82' } as React.CSSProperties}
              >
                <Check className="h-3.5 w-3.5" />
                <span>Accept Plan</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && ReactDOM.createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Close button - fixed top right */}
          <button
            onClick={() => setIsFullscreen(false)}
            className={cn(
              "fixed top-4 right-[18px] p-1 rounded-[6px] transition-all z-[60]",
              "bg-background shadow-minimal",
              "text-muted-foreground/50 hover:text-foreground",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "[-webkit-app-region:no-drag]"
            )}
            title="Close (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Scrollable content wrapper */}
          <div className="min-h-screen bg-foreground-3 flex items-start justify-center pt-16 px-6 pb-12">
            <div className="bg-background rounded-[16px] shadow-strong w-full max-w-[848px]">
              <div className="px-12 pt-8 pb-8">
                <div className="text-sm">
                  <Markdown
                    mode="minimal"
                    onUrlClick={onOpenUrl}
                    onFileClick={onOpenFile}
                  >
                    {content}
                  </Markdown>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
