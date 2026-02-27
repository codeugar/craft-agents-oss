/**
 * Browser Pane Atoms
 *
 * Jotai atoms for browser instance state in the renderer.
 * Synced from the main process via BROWSER_PANE_STATE_CHANGED IPC events.
 */

import { atom } from 'jotai'
import type { BrowserInstanceInfo } from '../../shared/types'

/** Map of all browser instances by ID */
export const browserInstancesMapAtom = atom<Map<string, BrowserInstanceInfo>>(new Map())

/** Derived: array of all browser instances (for iteration) */
export const browserInstancesAtom = atom<BrowserInstanceInfo[]>(
  (get) => Array.from(get(browserInstancesMapAtom).values())
)

/** Derived: count of active browser instances */
export const browserInstanceCountAtom = atom<number>(
  (get) => get(browserInstancesMapAtom).size
)

/** Update a single browser instance (from IPC state change event) */
export const updateBrowserInstanceAtom = atom(
  null,
  (get, set, info: BrowserInstanceInfo) => {
    const map = new Map(get(browserInstancesMapAtom))
    map.set(info.id, info)
    set(browserInstancesMapAtom, map)
  }
)

/** Remove a browser instance (when destroyed) */
export const removeBrowserInstanceAtom = atom(
  null,
  (get, set, id: string) => {
    const map = new Map(get(browserInstancesMapAtom))
    map.delete(id)
    set(browserInstancesMapAtom, map)
  }
)

/** Set all browser instances at once (from list query) */
export const setBrowserInstancesAtom = atom(
  null,
  (_get, set, instances: BrowserInstanceInfo[]) => {
    const map = new Map<string, BrowserInstanceInfo>()
    for (const info of instances) {
      map.set(info.id, info)
    }
    set(browserInstancesMapAtom, map)
  }
)
