/**
 * BrowserTabStrip
 *
 * Rendered in the TopBar, shows compact badges for all active browser instances.
 * Shows up to 3 badges, with an overflow indicator for additional instances.
 */

import { useCallback, useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import * as Icons from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@craft-agent/ui'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import {
  browserInstancesAtom,
  setBrowserInstancesAtom,
  updateBrowserInstanceAtom,
  removeBrowserInstanceAtom,
} from '@/atoms/browser-pane'
import { panelStackAtom, focusedPanelIdAtom, closePanelAtom } from '@/atoms/panel-stack'
import { BrowserTabBadge } from './BrowserTabBadge'
import { useNavigation } from '@/contexts/NavigationContext'
import { routes } from '../../../shared/routes'
import type { BrowserInstanceInfo } from '../../../shared/types'
import { getHostname } from './utils'

const MAX_VISIBLE_BADGES = 3

interface BrowserTabStripProps {
  /** Route of the currently focused panel (to determine which badge is active) */
  focusedRoute?: string | null
}

export function BrowserTabStrip({ focusedRoute }: BrowserTabStripProps) {
  const instances = useAtomValue(browserInstancesAtom)
  const setInstances = useSetAtom(setBrowserInstancesAtom)
  const updateInstance = useSetAtom(updateBrowserInstanceAtom)
  const removeInstance = useSetAtom(removeBrowserInstanceAtom)
  const panelStack = useAtomValue(panelStackAtom)
  const setFocusedPanelId = useSetAtom(focusedPanelIdAtom)
  const closePanel = useSetAtom(closePanelAtom)
  const { navigate } = useNavigation()

  // Determine which instance is active (from focused route)
  const activeInstanceId = focusedRoute?.startsWith('browser/')
    ? focusedRoute.slice('browser/'.length)
    : null

  const closePanelsForInstance = useCallback((instanceId: string) => {
    const targetRoute = routes.view.browser(instanceId)
    const matches = panelStack.filter((p) => p.route === targetRoute)
    for (const p of matches) {
      closePanel(p.id)
    }
  }, [panelStack, closePanel])

  // Load initial instances on mount
  useEffect(() => {
    window.electronAPI.browserPane.list().then(setInstances)
  }, [setInstances])

  // Subscribe to state changes
  useEffect(() => {
    const cleanupState = window.electronAPI.browserPane.onStateChanged((info: BrowserInstanceInfo) => {
      updateInstance(info)
    })
    const cleanupRemoved = window.electronAPI.browserPane.onRemoved((id: string) => {
      removeInstance(id)
      closePanelsForInstance(id)
    })
    const cleanupInteracted = window.electronAPI.browserPane.onInteracted((id: string) => {
      const targetRoute = routes.view.browser(id)
      const panel = panelStack.find((p) => p.route === targetRoute)
      if (panel) {
        setFocusedPanelId(panel.id)
      }
    })
    return () => {
      cleanupState()
      cleanupRemoved()
      cleanupInteracted()
    }
  }, [updateInstance, removeInstance, closePanelsForInstance, panelStack, setFocusedPanelId])

  const handleBadgeClick = useCallback((instanceId: string) => {
    navigate(routes.view.browser(instanceId))
  }, [navigate])

  const handleBadgeClose = useCallback((instanceId: string) => {
    window.electronAPI.browserPane.destroy(instanceId)
    removeInstance(instanceId)
    closePanelsForInstance(instanceId)

    // Fallback route if user closed the active browser badge before panel close settles.
    if (activeInstanceId === instanceId) {
      navigate(routes.view.allSessions())
    }
  }, [removeInstance, closePanelsForInstance, activeInstanceId, navigate])

  if (instances.length === 0) return null

  const visible = instances.slice(0, MAX_VISIBLE_BADGES)
  const overflow = instances.slice(MAX_VISIBLE_BADGES)

  return (
    <div className="flex items-center gap-1">
      {/*
        UX affordance for the generic lane policy model:
        Browser lives in a dedicated right-pinned, locked singleton lane.
        This mirrors VS Code's locked-group concept where implicit opens
        don't replace protected content.
      */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="h-[26px] px-1.5 rounded-md border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/45 flex items-center">
            <Icons.Lock className="h-3 w-3" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">Browser lane is pinned & locked (always right)</TooltipContent>
      </Tooltip>

      {visible.map((instance) => (
        <BrowserTabBadge
          key={instance.id}
          instance={instance}
          isActive={instance.id === activeInstanceId}
          onClick={() => handleBadgeClick(instance.id)}
          onClose={() => handleBadgeClose(instance.id)}
        />
      ))}

      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-[26px] px-1.5 rounded-md text-[11px] text-foreground/50 bg-foreground/[0.04] border border-foreground/[0.06] hover:bg-foreground/[0.08] transition-colors cursor-pointer"
            >
              +{overflow.length}
            </button>
          </DropdownMenuTrigger>
          <StyledDropdownMenuContent align="end" minWidth="min-w-48">
            {overflow.map((instance) => {
              const hostname = getHostname(instance.url)
              return (
                <StyledDropdownMenuItem
                  key={instance.id}
                  onClick={() => handleBadgeClick(instance.id)}
                >
                  {instance.isLoading ? (
                    <Icons.Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Icons.Globe className="h-3.5 w-3.5" />
                  )}
                  <span className="truncate">{instance.title || hostname}</span>
                </StyledDropdownMenuItem>
              )
            })}
          </StyledDropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
