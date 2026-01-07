/**
 * TerminalPreviewOverlay - Responsive overlay for terminal output
 *
 * Uses TerminalOutput for command/output display with ANSI colors.
 * For Bash/Grep/Glob tool results.
 *
 * Shows as centered modal on large viewports, fullscreen on smaller ones.
 */

import * as React from 'react'
import { useEffect, useState } from 'react'
import * as ReactDOM from 'react-dom'
import { Terminal, Search, FolderSearch, X, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useOverlayMode, OVERLAY_LAYOUT } from '../../lib/layout'
import { TerminalOutput, type ToolType } from '../terminal/TerminalOutput'

export interface TerminalPreviewOverlayProps {
  /** Whether the overlay is visible */
  isOpen: boolean
  /** Callback when the overlay should close */
  onClose: () => void
  /** The command that was executed */
  command: string
  /** The output from the command */
  output: string
  /** Exit code (0 = success) */
  exitCode?: number
  /** Tool type for display styling */
  toolType?: ToolType
  /** Optional description of what the command does */
  description?: string
  /** Theme mode */
  theme?: 'light' | 'dark'
}

export function TerminalPreviewOverlay({
  isOpen,
  onClose,
  command,
  output,
  exitCode,
  toolType = 'bash',
  description,
  theme = 'light',
}: TerminalPreviewOverlayProps) {
  const [forceFullscreen, setForceFullscreen] = useState(false)
  const responsiveMode = useOverlayMode()
  const displayMode = forceFullscreen ? 'fullscreen' : responsiveMode

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

  const Icon = toolType === 'grep' ? Search : toolType === 'glob' ? FolderSearch : Terminal
  const label = toolType === 'grep' ? 'Grep' : toolType === 'glob' ? 'Glob' : 'Bash'
  const backgroundColor = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  const textColor = theme === 'dark' ? '#e4e4e4' : '#1a1a1a'
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

        {/* Tool badge */}
        <span className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium",
          toolType === 'grep'
            ? "bg-green-500/10 text-green-600 dark:text-green-400"
            : toolType === 'glob'
            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
            : "bg-gray-500/10 text-gray-600 dark:text-gray-400"
        )}>
          <Icon className="w-3.5 h-3.5" />
          {label}
        </span>

        {/* Description */}
        {description && (
          <span className="text-sm font-medium">{description}</span>
        )}
      </div>

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
  )

  const content = (
    <div className="flex-1 min-h-0">
      <TerminalOutput
        command={command}
        output={output}
        exitCode={exitCode}
        toolType={toolType}
        description={description}
        theme={theme}
      />
    </div>
  )

  // Fullscreen mode
  if (!isModal) {
    return ReactDOM.createPortal(
      <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor, color: textColor }}>
        {header}
        {content}
      </div>,
      document.body
    )
  }

  // Modal mode
  return ReactDOM.createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${OVERLAY_LAYOUT.backdropClass}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex flex-col rounded-xl shadow-modal-small overflow-hidden"
        style={{
          backgroundColor,
          color: textColor,
          width: '90vw',
          maxWidth: OVERLAY_LAYOUT.modalMaxWidth,
          height: `${OVERLAY_LAYOUT.modalMaxHeightPercent}vh`,
        }}
      >
        {header}
        {content}
      </div>
    </div>,
    document.body
  )
}
