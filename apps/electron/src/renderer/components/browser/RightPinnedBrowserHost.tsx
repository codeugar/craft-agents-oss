/**
 * RightPinnedBrowserHost
 *
 * Dedicated full-height host lane for the native browser WebContentsView.
 *
 * Why this exists:
 * - WebContentsView is a native overlay, not DOM content.
 * - Embedding bounds ownership inside animated panel content can cause
 *   visual drift during window resize/reflow.
 * - A stable right-pinned host gives simpler geometry (x/y/width/height),
 *   making attach/setBounds updates more reliable.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import * as Icons from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { BrowserToolbar } from './BrowserToolbar'
import {
  browserInstancesMapAtom,
  updateBrowserInstanceAtom,
  removeBrowserInstanceAtom,
} from '@/atoms/browser-pane'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import type { BrowserInstanceInfo } from '../../../shared/types'

interface RightPinnedBrowserHostProps {
  instanceId: string
  onClose?: () => void
}

export function RightPinnedBrowserHost({ instanceId, onClose }: RightPinnedBrowserHostProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const instancesMap = useAtomValue(browserInstancesMapAtom)
  const updateInstance = useSetAtom(updateBrowserInstanceAtom)
  const removeInstance = useSetAtom(removeBrowserInstanceAtom)
  const [isCreating, setIsCreating] = useState(false)

  const instanceInfo = instancesMap.get(instanceId) ?? null

  // Ensure instance exists for the requested ID.
  useEffect(() => {
    if (instanceInfo || isCreating) return

    setIsCreating(true)
    window.electronAPI.browserPane.create(instanceId).then(() => {
      setIsCreating(false)
    }).catch(() => {
      setIsCreating(false)
    })
  }, [instanceId, instanceInfo, isCreating])

  // Attach native browser view and keep bounds synced to host viewport.
  useEffect(() => {
    if (!viewportRef.current || !instanceInfo) return

    const el = viewportRef.current

    const updateBounds = () => {
      const rect = el.getBoundingClientRect()
      const bounds = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }

      if (bounds.width > 0 && bounds.height > 0) {
        window.electronAPI.browserPane.attach(instanceId, bounds)
      }
    }

    let rafId: number | null = null
    const debouncedUpdateBounds = () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        updateBounds()
        rafId = null
      })
    }

    // Immediate first sync.
    updateBounds()

    const resizeObserver = new ResizeObserver(debouncedUpdateBounds)
    resizeObserver.observe(el)

    window.addEventListener('resize', debouncedUpdateBounds)
    window.addEventListener('scroll', debouncedUpdateBounds, true)

    // Small polling safety net for layout transitions.
    const intervalId = window.setInterval(debouncedUpdateBounds, 300)

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      window.removeEventListener('resize', debouncedUpdateBounds)
      window.removeEventListener('scroll', debouncedUpdateBounds, true)
      window.clearInterval(intervalId)
      window.electronAPI.browserPane.detach(instanceId)
    }
  }, [instanceId, instanceInfo])

  useEffect(() => {
    const cleanupState = window.electronAPI.browserPane.onStateChanged((info: BrowserInstanceInfo) => {
      if (info.id === instanceId) updateInstance(info)
    })

    const cleanupRemoved = window.electronAPI.browserPane.onRemoved((id: string) => {
      if (id === instanceId) removeInstance(id)
    })

    return () => {
      cleanupState()
      cleanupRemoved()
    }
  }, [instanceId, updateInstance, removeInstance])

  useEffect(() => {
    window.electronAPI.browserPane.list().then((instances) => {
      for (const info of instances) {
        updateInstance(info)
      }
    })
  }, [updateInstance])

  const handleNavigate = useCallback((url: string) => {
    window.electronAPI.browserPane.navigate(instanceId, url)
  }, [instanceId])

  const handleGoBack = useCallback(() => {
    window.electronAPI.browserPane.goBack(instanceId)
  }, [instanceId])

  const handleGoForward = useCallback(() => {
    window.electronAPI.browserPane.goForward(instanceId)
  }, [instanceId])

  const handleReload = useCallback(() => {
    window.electronAPI.browserPane.reload(instanceId)
  }, [instanceId])

  const handleStop = useCallback(() => {
    window.electronAPI.browserPane.stop(instanceId)
  }, [instanceId])

  return (
    <div className="h-full flex flex-col">
      <div className="h-11 px-2 border-b border-border/50 flex items-center justify-between">
        <div className="text-xs text-foreground/55 flex items-center gap-1.5">
          <Icons.Lock className="h-3 w-3" />
          Browser (Pinned Right Lane)
        </div>
        {onClose && (
          <HeaderIconButton
            icon={<Icons.X className="h-4 w-4" />}
            onClick={onClose}
            tooltip="Close Browser"
            className="text-foreground"
          />
        )}
      </div>

      <BrowserToolbar
        instanceInfo={instanceInfo}
        onNavigate={handleNavigate}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onReload={handleReload}
        onStop={handleStop}
      />

      <div
        ref={viewportRef}
        className="flex-1 min-h-0 relative"
        style={{ background: 'var(--background, #fff)' }}
      >
        {!instanceInfo && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Icons.Globe className="h-8 w-8 text-foreground/20" />
              <p className="text-sm">Loading browser...</p>
            </div>
          </div>
        )}
      </div>

      {instanceInfo && (
        <div className="h-6 px-3 flex items-center border-t border-border bg-background/50 text-[11px] text-foreground/40 truncate">
          {instanceInfo.isLoading ? 'Loading...' : instanceInfo.url !== 'about:blank' ? instanceInfo.url : ''}
        </div>
      )}
    </div>
  )
}
