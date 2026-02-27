import { describe, it, expect } from 'bun:test'
import { createStore } from 'jotai'
import {
  panelStackAtom,
  focusedPanelIdAtom,
  pushPanelAtom,
  updateFocusedPanelRouteAtom,
  type PanelStackEntry,
} from '../panel-stack'

function getStack(store: ReturnType<typeof createStore>): PanelStackEntry[] {
  return store.get(panelStackAtom)
}

describe('panel stack lane policies', () => {
  it('keeps browser rightmost while allowing new main panels', () => {
    const store = createStore()

    store.set(pushPanelAtom, { route: 'allSessions/session/s1' })
    store.set(pushPanelAtom, { route: 'browser/b1' })
    store.set(pushPanelAtom, { route: 'allSessions/session/s2' })

    const stack = getStack(store)
    expect(stack).toHaveLength(3)

    // main lane panels stay before rightPinned lane
    expect(stack[0].route).toBe('allSessions/session/s1')
    expect(stack[0].laneId).toBe('main')

    expect(stack[1].route).toBe('allSessions/session/s2')
    expect(stack[1].laneId).toBe('main')

    expect(stack[2].route).toBe('browser/b1')
    expect(stack[2].laneId).toBe('rightPinned')
  })

  it('does not replace browser when implicit navigation targets a session', () => {
    const store = createStore()

    store.set(pushPanelAtom, { route: 'allSessions/session/s1' })
    store.set(pushPanelAtom, { route: 'browser/b1' })

    // Focus browser panel
    const browserPanel = getStack(store).find((p) => p.route === 'browser/b1')
    expect(browserPanel).toBeDefined()
    store.set(focusedPanelIdAtom, browserPanel!.id)

    // Implicit session navigation should update/focus main lane, not replace browser
    store.set(updateFocusedPanelRouteAtom, 'allSessions/session/s2')

    const stack = getStack(store)
    const browserAfter = stack.find((p) => p.laneId === 'rightPinned')
    const mainAfter = stack.filter((p) => p.laneId === 'main')

    expect(browserAfter?.route).toBe('browser/b1')
    expect(mainAfter.length).toBeGreaterThan(0)
    expect(mainAfter.some((p) => p.route === 'allSessions/session/s2')).toBe(true)

    const focusedId = store.get(focusedPanelIdAtom)
    expect(mainAfter.some((p) => p.id === focusedId)).toBe(true)
  })

  it('enforces singleton browser lane and replaces in-slot on new browser open', () => {
    const store = createStore()

    store.set(pushPanelAtom, { route: 'allSessions/session/s1' })
    store.set(pushPanelAtom, { route: 'browser/b1' })
    store.set(pushPanelAtom, { route: 'browser/b2' })

    const stack = getStack(store)
    const browsers = stack.filter((p) => p.laneId === 'rightPinned')

    expect(browsers).toHaveLength(1)
    expect(browsers[0].route).toBe('browser/b2')

    // Browser remains rightmost
    expect(stack[stack.length - 1].laneId).toBe('rightPinned')
  })
})
