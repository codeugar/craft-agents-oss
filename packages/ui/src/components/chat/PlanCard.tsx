/**
 * PlanCard - Inline plan message component
 *
 * Displays a plan submitted by the agent for user review.
 * Uses the same markdown rendering and max height as TurnCard responses.
 * Platform-agnostic: accepts callbacks for all interactions.
 *
 * The fullscreen overlay is responsive - shows as modal on large viewports.
 */

import * as React from 'react'
import { useState, useCallback } from 'react'
import { Check, ListTodo, Maximize2, ExternalLink, Copy } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Markdown } from '../markdown'
import { FullscreenOverlay } from './fullscreen'

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
  /** Whether to show the Accept Plan button (default: true) */
  showAcceptPlan?: boolean
  /** Callback when user sends feedback via fullscreen commenting */
  onSendFeedback?: (feedback: string) => void
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
  showAcceptPlan = true,
  onSendFeedback,
}: PlanCardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Accept the plan - calls the provided callback
  const handleAcceptPlan = () => onAccept?.()

  // Copy content to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [content])

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

        {/* Footer with Copy and View as Markdown on left, Accept Plan on right */}
        <div className={cn(
          "pl-4 pr-2.5 py-2 border-t border-border/30 flex items-center justify-between bg-muted/20",
          SIZE_CONFIG.fontSize
        )}>
          {/* Left side - Copy and View as Markdown */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              className={cn(
                "flex items-center gap-1.5 transition-colors",
                copied ? "text-success" : "text-muted-foreground hover:text-foreground",
                "focus:outline-none focus-visible:underline"
              )}
            >
              {copied ? (
                <>
                  <Check className={SIZE_CONFIG.iconSize} />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className={SIZE_CONFIG.iconSize} />
                  <span>Copy</span>
                </>
              )}
            </button>
            {onPopOut && (
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
            )}
          </div>

          {/* Right side - Accept Plan (only shown until user responds) */}
          {!hasUserResponse && showAcceptPlan && (
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
          )}
        </div>
      </div>

      {/* Fullscreen overlay with commenting */}
      <FullscreenOverlay
        content={content}
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        variant="plan"
        onOpenUrl={onOpenUrl}
        onOpenFile={onOpenFile}
        onSendFeedback={onSendFeedback}
      />
    </>
  )
}
