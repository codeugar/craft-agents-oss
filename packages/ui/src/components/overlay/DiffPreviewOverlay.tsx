/**
 * DiffPreviewOverlay - Responsive overlay for diff preview
 *
 * Uses ShikiDiffViewer for rich diff display with syntax highlighting.
 * For Edit tool results.
 *
 * Shows as centered modal on large viewports, fullscreen on smaller ones.
 */

import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import * as ReactDOM from 'react-dom'
import { PencilLine, X, Copy, Check, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useOverlayMode, OVERLAY_LAYOUT } from '../../lib/layout'
import { ShikiDiffViewer } from '../code-viewer/ShikiDiffViewer'
import { formatFilePath } from '../code-viewer/language-map'

export interface DiffPreviewOverlayProps {
  /** Whether the overlay is visible */
  isOpen: boolean
  /** Callback when the overlay should close */
  onClose: () => void
  /** Original content (before edit) */
  original: string
  /** Modified content (after edit) */
  modified: string
  /** File path for language detection and display */
  filePath: string
  /** Language for syntax highlighting (auto-detected if not provided) */
  language?: string
  /** Diff style: 'unified' or 'split' */
  diffStyle?: 'unified' | 'split'
  /** Theme mode */
  theme?: 'light' | 'dark'
  /** Error message if tool failed */
  error?: string
}

export function DiffPreviewOverlay({
  isOpen,
  onClose,
  original,
  modified,
  filePath,
  language,
  diffStyle = 'unified',
  theme = 'light',
  error,
}: DiffPreviewOverlayProps) {
  const [copied, setCopied] = useState(false)
  const [forceFullscreen, setForceFullscreen] = useState(false)
  const responsiveMode = useOverlayMode()
  const displayMode = forceFullscreen ? 'fullscreen' : responsiveMode

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(modified)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [modified])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const backgroundColor = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const isModal = displayMode === 'modal'

  const header = (
    <div className={cn(
      "shrink-0 flex items-center justify-between px-4 border-b border-border",
      isModal ? "h-11" : "h-12"
    )}>
      <div className="flex items-center gap-3">
        {/* Close button */}
        <button
          onClick={onClose}
          className={cn(
            "p-1 rounded-[6px] transition-colors",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-foreground/5",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Edit badge */}
        <span className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400">
          <PencilLine className="w-3.5 h-3.5" />
          Edit
        </span>

        {/* File path */}
        <span className="text-sm font-medium">{formatFilePath(filePath)}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Copy button */}
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-xs transition-colors",
            copied
              ? "text-success"
              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
          title="Copy modified content"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>

        {/* Fullscreen toggle - only show in modal mode */}
        {responsiveMode === 'modal' && (
          <button
            onClick={() => setForceFullscreen(!forceFullscreen)}
            className={cn(
              "p-1 rounded-[6px] transition-colors",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-foreground/5",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
            title={forceFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {forceFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  )

  const errorBanner = error && (
    <div className="px-4 py-3 bg-destructive/10 border-b border-destructive/20 flex items-start gap-3">
      <X className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-destructive/70 mb-0.5">Edit Failed</div>
        <p className="text-sm text-destructive whitespace-pre-wrap break-words">{error}</p>
      </div>
    </div>
  )

  const content = (
    <div className="flex-1 min-h-0" style={{ backgroundColor }}>
      <ShikiDiffViewer
        original={original}
        modified={modified}
        filePath={filePath}
        language={language}
        diffStyle={diffStyle}
        theme={theme}
      />
    </div>
  )

  // Fullscreen mode
  if (!isModal) {
    return ReactDOM.createPortal(
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {header}
        {errorBanner}
        {content}
      </div>,
      document.body
    )
  }

  // Modal mode - use wider max width for diff view
  return ReactDOM.createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${OVERLAY_LAYOUT.backdropClass}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex flex-col bg-background rounded-xl shadow-modal-small overflow-hidden"
        style={{
          width: '90vw',
          maxWidth: OVERLAY_LAYOUT.modalMaxWidth,
          height: `${OVERLAY_LAYOUT.modalMaxHeightPercent}vh`,
        }}
      >
        {header}
        {errorBanner}
        {content}
      </div>
    </div>,
    document.body
  )
}
