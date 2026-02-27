/**
 * Panel Stack State
 *
 * Generic lane/policy model for side-by-side panels.
 *
 * Lanes:
 * - main: regular content panels (sessions/sources/settings/skills)
 * - rightPinned: singleton, rightmost lane (browser)
 *
 * Core behaviors:
 * - Browser is always routed to the rightPinned lane
 * - rightPinned is singleton (max 1 visible browser panel)
 * - Implicit session/source/settings navigation never replaces browser
 * - Opening session panels never displaces browser position
 */

import { atom } from 'jotai'
import { parseRouteToNavigationState } from '../../shared/route-parser'
import type { ViewRoute } from '../../shared/routes'

let nextPanelId = 0
function generatePanelId(): string {
  return `panel-${++nextPanelId}-${Date.now()}`
}

export type PanelType = 'session' | 'source' | 'settings' | 'skills' | 'browser' | 'other'
export type PanelLaneId = 'main' | 'rightPinned'
export type OpenIntent = 'implicit' | 'explicit'

export interface PanelLanePolicy {
  id: PanelLaneId
  order: number
  allowedTypes: PanelType[]
  locked: boolean
  singleton: boolean
  fallbackLaneId?: PanelLaneId
}

export const PANEL_LANE_POLICIES: Record<PanelLaneId, PanelLanePolicy> = {
  main: {
    id: 'main',
    order: 0,
    allowedTypes: ['session', 'source', 'settings', 'skills', 'other'],
    locked: false,
    singleton: false,
  },
  rightPinned: {
    id: 'rightPinned',
    order: 10,
    allowedTypes: ['browser'],
    locked: true,
    singleton: true,
    fallbackLaneId: 'main',
  },
}

export interface PanelStackEntry {
  /** Unique ID for React key / AnimatePresence */
  id: string
  /** The deeplink route that determines what renders in this panel */
  route: ViewRoute
  /** Proportion of available content width (0–1, all proportions sum to 1.0) */
  proportion: number
  /** Generic panel type for lane routing */
  panelType: PanelType
  /** Lane assignment (main vs rightPinned) */
  laneId: PanelLaneId
}

/** The panel stack — all panels are peers, the focused one drives navigation */
export const panelStackAtom = atom<PanelStackEntry[]>([])

/** Which panel is currently focused (null = defaults to index 0) */
export const focusedPanelIdAtom = atom<string | null>(null)

/**
 * Derived: number of visible center-content panels.
 *
 * rightPinned lane (browser host) is rendered in a dedicated AppShell lane,
 * not inside PanelStackContainer content slots.
 */
export const panelCountAtom = atom(
  (get) => get(panelStackAtom).filter((p) => p.laneId !== 'rightPinned').length
)

/** Derived: the focused panel's index in the stack (defaults to 0) */
export const focusedPanelIndexAtom = atom((get) => {
  const stack = get(panelStackAtom)
  const focusedId = get(focusedPanelIdAtom)
  if (!focusedId) return 0
  const idx = stack.findIndex(p => p.id === focusedId)
  return idx === -1 ? 0 : idx
})

/** Derived: the focused panel's route */
export const focusedPanelRouteAtom = atom((get) => {
  const stack = get(panelStackAtom)
  const idx = get(focusedPanelIndexAtom)
  return stack[idx]?.route ?? null
})

export function getPanelTypeFromRoute(route: ViewRoute): PanelType {
  const navState = parseRouteToNavigationState(route)
  if (!navState) return 'other'

  switch (navState.navigator) {
    case 'browser':
      return 'browser'
    case 'sessions':
      return 'session'
    case 'sources':
      return 'source'
    case 'settings':
      return 'settings'
    case 'skills':
      return 'skills'
    default:
      return 'other'
  }
}

export function getDefaultLaneForType(type: PanelType): PanelLaneId {
  return type === 'browser' ? 'rightPinned' : 'main'
}

function getLanePolicy(laneId: PanelLaneId): PanelLanePolicy {
  return PANEL_LANE_POLICIES[laneId]
}

function isTypeAllowedInLane(type: PanelType, laneId: PanelLaneId): boolean {
  return getLanePolicy(laneId).allowedTypes.includes(type)
}

function createEntry(route: ViewRoute, proportion: number, id?: string): PanelStackEntry {
  const panelType = getPanelTypeFromRoute(route)
  const defaultLane = getDefaultLaneForType(panelType)
  return {
    id: id ?? generatePanelId(),
    route,
    proportion,
    panelType,
    laneId: defaultLane,
  }
}

function normalizeProportions(stack: PanelStackEntry[]): PanelStackEntry[] {
  if (stack.length === 0) return stack
  const total = stack.reduce((sum, p) => sum + p.proportion, 0)
  if (total <= 0) {
    const equal = 1 / stack.length
    return stack.map(p => ({ ...p, proportion: equal }))
  }
  return stack.map(p => ({ ...p, proportion: p.proportion / total }))
}

function sortByLaneOrder(stack: PanelStackEntry[]): PanelStackEntry[] {
  return [...stack].sort((a, b) => {
    const laneDiff = getLanePolicy(a.laneId).order - getLanePolicy(b.laneId).order
    if (laneDiff !== 0) return laneDiff
    return 0
  })
}

function getLastIndexForLane(stack: PanelStackEntry[], laneId: PanelLaneId): number {
  let last = -1
  for (let i = 0; i < stack.length; i++) {
    if (stack[i].laneId === laneId) last = i
  }
  return last
}

function getFirstIndexForLane(stack: PanelStackEntry[], laneId: PanelLaneId): number {
  for (let i = 0; i < stack.length; i++) {
    if (stack[i].laneId === laneId) return i
  }
  return -1
}

function findPanelInLane(stack: PanelStackEntry[], laneId: PanelLaneId): PanelStackEntry | undefined {
  return stack.find(p => p.laneId === laneId)
}

/**
 * Resolve the lane for an open request.
 *
 * Mental model (VS Code-style locked groups):
 * - Every route has a default lane by panel type.
 * - Explicit opens may target a lane directly (if that lane accepts the type).
 * - Implicit opens respect lock semantics: if user is currently focused in a locked lane
 *   and the target type is not allowed there, route to fallback lane instead of replacing.
 */
function resolveTargetLaneForRoute(route: ViewRoute, opts?: {
  targetLaneId?: PanelLaneId
  intent?: OpenIntent
  focusedLaneId?: PanelLaneId
}): PanelLaneId {
  const panelType = getPanelTypeFromRoute(route)
  const defaultLane = getDefaultLaneForType(panelType)
  const intent = opts?.intent ?? 'implicit'

  // Explicit targeting wins if allowed.
  if (opts?.targetLaneId && isTypeAllowedInLane(panelType, opts.targetLaneId)) {
    return opts.targetLaneId
  }

  // If focused lane is locked and doesn't allow this type, fall back.
  if (opts?.focusedLaneId) {
    const focusedLanePolicy = getLanePolicy(opts.focusedLaneId)
    const focusedAllowsType = isTypeAllowedInLane(panelType, opts.focusedLaneId)
    if (intent === 'implicit' && focusedLanePolicy.locked && !focusedAllowsType) {
      return focusedLanePolicy.fallbackLaneId ?? defaultLane
    }
  }

  return defaultLane
}

/**
 * Extract a session ID from a ViewRoute string.
 * Routes containing '/session/{id}' have a session detail view.
 */
export function parseSessionIdFromRoute(route: ViewRoute): string | null {
  const segments = route.split('/')
  const idx = segments.indexOf('session')
  if (idx >= 0 && idx + 1 < segments.length) {
    return segments[idx + 1]
  }
  return null
}

/** Derived: the session ID of the focused panel (null if not viewing a session) */
export const focusedSessionIdAtom = atom((get) => {
  const route = get(focusedPanelRouteAtom)
  if (!route) return null
  return parseSessionIdFromRoute(route)
})

/**
 * Push a new panel onto the stack using lane policies.
 *
 * - Browser routes are forced into rightPinned (singleton) lane.
 * - Session/source/settings/skills routes go into main lane.
 * - Singleton lanes reveal/replace in-slot instead of adding duplicates.
 */
export const pushPanelAtom = atom(
  null,
  (get, set, { route, afterIndex, targetLaneId, intent }: {
    route: ViewRoute
    afterIndex?: number
    targetLaneId?: PanelLaneId
    intent?: OpenIntent
  }) => {
    const stack = get(panelStackAtom)
    const focusedId = get(focusedPanelIdAtom)
    const focusedLaneId = stack.find(p => p.id === focusedId)?.laneId

    const laneId = resolveTargetLaneForRoute(route, {
      targetLaneId,
      intent: intent ?? 'explicit',
      focusedLaneId,
    })
    const lanePolicy = getLanePolicy(laneId)

    // Singleton lane: reveal or replace in-slot.
    //
    // For rightPinned/browser this guarantees:
    // - max 1 visible browser panel
    // - stable spatial memory (always the same right-side slot)
    // - opening a new browser updates that slot instead of creating lane drift
    if (lanePolicy.singleton) {
      const existing = findPanelInLane(stack, laneId)
      if (existing) {
        const updated = stack.map((p) =>
          p.id === existing.id
            ? { ...createEntry(route, p.proportion, p.id), proportion: p.proportion }
            : p
        )
        set(panelStackAtom, sortByLaneOrder(updated))
        set(focusedPanelIdAtom, existing.id)
        return
      }

      const newEntry = createEntry(route, 0)
      const normalized = normalizeProportions(sortByLaneOrder([...stack, newEntry]))
      set(panelStackAtom, normalized)
      set(focusedPanelIdAtom, newEntry.id)
      return
    }

    // Multi-panel lane (main)
    const lastLaneIndex = getLastIndexForLane(stack, laneId)
    const defaultInsertAt = lastLaneIndex >= 0 ? lastLaneIndex + 1 : getFirstIndexForLane(stack, 'rightPinned') >= 0
      ? getFirstIndexForLane(stack, 'rightPinned')
      : stack.length

    // Honor afterIndex only within the same lane boundary.
    let insertAt = defaultInsertAt
    if (afterIndex !== undefined && afterIndex >= 0 && afterIndex < stack.length) {
      const afterEntry = stack[afterIndex]
      if (afterEntry.laneId === laneId) {
        insertAt = Math.min(afterIndex + 1, defaultInsertAt)
      }
    }

    const newEntry = createEntry(route, 0)
    const newStack = [
      ...stack.slice(0, insertAt),
      newEntry,
      ...stack.slice(insertAt),
    ]

    const normalized = normalizeProportions(sortByLaneOrder(newStack))
    set(panelStackAtom, normalized)
    set(focusedPanelIdAtom, newEntry.id)
  }
)

/**
 * Close a panel by ID. Removes the targeted panel from the stack.
 * Redistributes the closed panel's proportion among remaining panels.
 * Stack can reach [] — a reactive effect handles window close when empty.
 */
export const closePanelAtom = atom(
  null,
  (get, set, id: string) => {
    const stack = get(panelStackAtom)
    const idx = stack.findIndex(p => p.id === id)
    if (idx === -1) return
    const remaining = [...stack.slice(0, idx), ...stack.slice(idx + 1)]

    set(panelStackAtom, normalizeProportions(remaining))

    // If the closed panel was focused, move focus to the left neighbor
    if (get(focusedPanelIdAtom) === id) {
      const newIdx = Math.min(idx, remaining.length - 1)
      set(focusedPanelIdAtom, remaining[newIdx]?.id ?? null)
    }
  }
)

/**
 * Reconcile the panel stack against a target layout from URL params.
 *
 * Smart-matches existing panels by route so React keys are preserved.
 * Lane metadata is derived from route and rightPinned lane remains singleton.
 */
export const reconcilePanelStackAtom = atom(
  null,
  (get, set, { entries, focusedIndex }: {
    entries: { route: ViewRoute; proportion: number }[]
    focusedIndex?: number
  }): boolean => {
    if (entries.length === 0) return false

    const current = get(panelStackAtom)
    const used = new Set<string>()

    const requestedFocusIndex = Math.min(focusedIndex ?? 0, entries.length - 1)
    const requestedFocusRoute = entries[requestedFocusIndex]?.route ?? entries[0].route

    // Build stack while reusing IDs where possible.
    let newStack: PanelStackEntry[] = entries.map((target, i) => {
      const positional = current[i]

      if (positional && positional.route === target.route && !used.has(positional.id)) {
        used.add(positional.id)
        const updated = createEntry(target.route, target.proportion, positional.id)
        return { ...updated, proportion: target.proportion }
      }

      const any = current.find(c => c.route === target.route && !used.has(c.id))
      if (any) {
        used.add(any.id)
        const updated = createEntry(target.route, target.proportion, any.id)
        return { ...updated, proportion: target.proportion }
      }

      if (positional && !used.has(positional.id)) {
        used.add(positional.id)
        const updated = createEntry(target.route, target.proportion, positional.id)
        return { ...updated, proportion: target.proportion }
      }

      return createEntry(target.route, target.proportion)
    })

    // Enforce singleton lanes by keeping the last occurrence (most recent/rightmost intent).
    for (const lane of Object.values(PANEL_LANE_POLICIES)) {
      if (!lane.singleton) continue
      const inLane = newStack.filter(p => p.laneId === lane.id)
      if (inLane.length <= 1) continue
      const keepId = inLane[inLane.length - 1].id
      newStack = newStack.filter(p => p.laneId !== lane.id || p.id === keepId)
    }

    newStack = normalizeProportions(sortByLaneOrder(newStack))

    // Check if anything actually changed (avoid unnecessary re-renders)
    if (
      newStack.length === current.length &&
      newStack.every((p, i) =>
        p.id === current[i].id &&
        p.route === current[i].route &&
        p.laneId === current[i].laneId &&
        p.panelType === current[i].panelType &&
        Math.abs(p.proportion - current[i].proportion) < 0.001
      )
    ) {
      const targetFocusId =
        newStack.find((p) => p.route === requestedFocusRoute)?.id ??
        newStack[Math.min(requestedFocusIndex, newStack.length - 1)]?.id ??
        null
      if (get(focusedPanelIdAtom) !== targetFocusId) {
        set(focusedPanelIdAtom, targetFocusId)
      }
      return false
    }

    set(panelStackAtom, newStack)

    const focusId =
      newStack.find((p) => p.route === requestedFocusRoute)?.id ??
      newStack[Math.min(requestedFocusIndex, newStack.length - 1)]?.id ??
      null
    set(focusedPanelIdAtom, focusId)

    return true
  }
)

/**
 * Resize two adjacent panels by updating their proportions.
 * Called by PanelResizeSash during drag.
 */
export const resizePanelsAtom = atom(
  null,
  (get, set, { leftIndex, rightIndex, leftProportion, rightProportion }: {
    leftIndex: number
    rightIndex: number
    leftProportion: number
    rightProportion: number
  }) => {
    const stack = get(panelStackAtom)
    if (leftIndex < 0 || rightIndex >= stack.length) return
    const newStack = stack.map((p, i) => {
      if (i === leftIndex) return { ...p, proportion: leftProportion }
      if (i === rightIndex) return { ...p, proportion: rightProportion }
      return p
    })
    set(panelStackAtom, newStack)
  }
)

/**
 * Update navigation target for implicit route changes.
 *
 * Uses lane policy routing instead of blindly replacing the focused panel:
 * - browser routes always resolve to rightPinned lane
 * - non-browser routes resolve to main lane
 * - locked singleton lane (rightPinned) is never implicitly replaced by non-browser routes
 */
export const updateFocusedPanelRouteAtom = atom(
  null,
  (get, set, route: ViewRoute) => {
    const stack = get(panelStackAtom)

    if (stack.length === 0) {
      const newEntry = createEntry(route, 1)
      set(panelStackAtom, [newEntry])
      set(focusedPanelIdAtom, newEntry.id)
      return
    }

    const focusedId = get(focusedPanelIdAtom)
    const focused = stack.find(p => p.id === focusedId) ?? stack[0]

    // This is the key path for "normal" navigation (not explicit new-panel opens).
    // We intentionally pass intent='implicit' so lock policies are applied:
    // - if focus is on rightPinned (browser) and navigation goes to a session route,
    //   the session is routed to main lane instead of replacing the browser slot.
    const targetLane = resolveTargetLaneForRoute(route, {
      intent: 'implicit',
      focusedLaneId: focused?.laneId,
    })
    const targetType = getPanelTypeFromRoute(route)
    const targetLanePolicy = getLanePolicy(targetLane)

    // Singleton lane (browser): reveal or create in dedicated slot.
    if (targetLanePolicy.singleton) {
      const existing = findPanelInLane(stack, targetLane)
      if (existing) {
        const updated = stack.map((p) =>
          p.id === existing.id
            ? { ...createEntry(route, p.proportion, p.id), proportion: p.proportion }
            : p
        )
        set(panelStackAtom, sortByLaneOrder(updated))
        set(focusedPanelIdAtom, existing.id)
        return
      }

      const newEntry = createEntry(route, 0)
      const normalized = normalizeProportions(sortByLaneOrder([...stack, newEntry]))
      set(panelStackAtom, normalized)
      set(focusedPanelIdAtom, newEntry.id)
      return
    }

    // Non-singleton lane (main): update focused lane panel if compatible,
    // otherwise use the rightmost panel in target lane, or create one.
    let targetPanel = focused?.laneId === targetLane
      ? focused
      : [...stack].reverse().find(p => p.laneId === targetLane)

    if (!targetPanel) {
      const newEntry = createEntry(route, 0)
      const normalized = normalizeProportions(sortByLaneOrder([...stack, newEntry]))
      set(panelStackAtom, normalized)
      set(focusedPanelIdAtom, newEntry.id)
      return
    }

    // If this panel would violate lane/type constraints, re-anchor via default lane.
    if (!isTypeAllowedInLane(targetType, targetPanel.laneId)) {
      const fallbackLane = getLanePolicy(targetPanel.laneId).fallbackLaneId ?? getDefaultLaneForType(targetType)
      targetPanel = [...stack].reverse().find(p => p.laneId === fallbackLane)
      if (!targetPanel) {
        const newEntry = createEntry(route, 0)
        const normalized = normalizeProportions(sortByLaneOrder([...stack, newEntry]))
        set(panelStackAtom, normalized)
        set(focusedPanelIdAtom, newEntry.id)
        return
      }
    }

    const updated = stack.map((p) =>
      p.id === targetPanel.id
        ? { ...createEntry(route, p.proportion, p.id), proportion: p.proportion }
        : p
    )
    set(panelStackAtom, sortByLaneOrder(updated))
    set(focusedPanelIdAtom, targetPanel.id)
  }
)

/** Focus the next panel in the stack (wraps around) */
export const focusNextPanelAtom = atom(
  null,
  (get, set) => {
    const stack = get(panelStackAtom)
    if (stack.length <= 1) return
    const currentIdx = get(focusedPanelIndexAtom)
    const nextIdx = (currentIdx + 1) % stack.length
    set(focusedPanelIdAtom, stack[nextIdx].id)
  }
)

/** Focus the previous panel in the stack (wraps around) */
export const focusPrevPanelAtom = atom(
  null,
  (get, set) => {
    const stack = get(panelStackAtom)
    if (stack.length <= 1) return
    const currentIdx = get(focusedPanelIndexAtom)
    const prevIdx = (currentIdx - 1 + stack.length) % stack.length
    set(focusedPanelIdAtom, stack[prevIdx].id)
  }
)
