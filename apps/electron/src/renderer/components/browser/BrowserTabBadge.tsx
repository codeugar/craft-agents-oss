/**
 * BrowserTabBadge
 *
 * A compact badge showing a browser instance's favicon/hostname in the TopBar.
 * Clicking focuses the browser panel, clicking X destroys the instance.
 */

import * as Icons from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@craft-agent/ui'
import type { BrowserInstanceInfo } from '../../../shared/types'
import { getHostname } from './utils'

interface BrowserTabBadgeProps {
  instance: BrowserInstanceInfo
  isActive: boolean
  onClick: () => void
  onClose: () => void
}

export function BrowserTabBadge({ instance, isActive, onClick, onClose }: BrowserTabBadgeProps) {
  const hostname = getHostname(instance.url)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`
            group flex items-center gap-1.5 h-[26px] pl-2 pr-1 rounded-md cursor-pointer
            text-[11px] leading-tight transition-colors max-w-[160px]
            ${isActive
              ? 'bg-accent/10 border border-accent/30 text-foreground'
              : 'bg-foreground/[0.04] border border-foreground/[0.06] text-foreground/60 hover:bg-foreground/[0.08] hover:text-foreground/80'
            }
          `}
          onClick={onClick}
        >
          {/* Favicon or loading spinner */}
          <span className="shrink-0">
            {instance.isLoading ? (
              <Icons.Loader2 className="h-3 w-3 animate-spin text-accent" />
            ) : instance.favicon ? (
              <img src={instance.favicon} alt="" className="h-3 w-3 rounded-sm" />
            ) : (
              <Icons.Globe className="h-3 w-3" />
            )}
          </span>

          {/* Hostname */}
          <span className="truncate">{hostname}</span>

          {/* Agent indicator */}
          {instance.boundSessionId && (
            <Icons.Sparkles className="h-2.5 w-2.5 shrink-0 text-accent/60" />
          )}

          {/* Close button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-foreground/10 transition-opacity"
            aria-label="Close browser"
          >
            <Icons.X className="h-2.5 w-2.5" />
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {instance.title || hostname}
      </TooltipContent>
    </Tooltip>
  )
}
