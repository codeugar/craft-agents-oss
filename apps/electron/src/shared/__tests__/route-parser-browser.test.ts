/**
 * Tests for browser route parsing and building.
 *
 * Validates that browser routes round-trip correctly through all parsing layers:
 * parseCompoundRoute → buildCompoundRoute, and
 * parseRouteToNavigationState → buildRouteFromNavigationState.
 */

import { describe, it, expect } from 'bun:test'
import {
  parseCompoundRoute,
  buildCompoundRoute,
  parseRouteToNavigationState,
  buildRouteFromNavigationState,
  isCompoundRoute,
  type ParsedCompoundRoute,
} from '../route-parser'

describe('browser route parsing', () => {
  describe('isCompoundRoute', () => {
    it('recognizes browser as compound route', () => {
      expect(isCompoundRoute('browser/abc')).toBe(true)
      expect(isCompoundRoute('browser')).toBe(true)
    })
  })

  describe('parseCompoundRoute', () => {
    it('parses browser/{instanceId}', () => {
      const result = parseCompoundRoute('browser/abc')
      expect(result).toEqual({
        navigator: 'browser',
        details: { type: 'browser', id: 'abc' },
      })
    })

    it('parses browser with complex instance id', () => {
      const result = parseCompoundRoute('browser/browser-session-123')
      expect(result).toEqual({
        navigator: 'browser',
        details: { type: 'browser', id: 'browser-session-123' },
      })
    })

    it('returns null for browser without id', () => {
      const result = parseCompoundRoute('browser')
      expect(result).toBeNull()
    })
  })

  describe('buildCompoundRoute', () => {
    it('builds browser route from parsed state', () => {
      const parsed: ParsedCompoundRoute = {
        navigator: 'browser',
        details: { type: 'browser', id: 'abc' },
      }
      expect(buildCompoundRoute(parsed)).toBe('browser/abc')
    })

    it('builds browser route without details', () => {
      const parsed: ParsedCompoundRoute = {
        navigator: 'browser',
        details: null,
      }
      expect(buildCompoundRoute(parsed)).toBe('browser')
    })
  })

  describe('round-trip: parseCompoundRoute → buildCompoundRoute', () => {
    it('round-trips browser/abc', () => {
      const route = 'browser/abc'
      const parsed = parseCompoundRoute(route)
      expect(parsed).not.toBeNull()
      expect(buildCompoundRoute(parsed!)).toBe(route)
    })

    it('round-trips browser/browser-session-42', () => {
      const route = 'browser/browser-session-42'
      const parsed = parseCompoundRoute(route)
      expect(parsed).not.toBeNull()
      expect(buildCompoundRoute(parsed!)).toBe(route)
    })
  })

  describe('parseRouteToNavigationState', () => {
    it('parses browser/{id} to BrowserNavigationState', () => {
      const state = parseRouteToNavigationState('browser/my-instance')
      expect(state).toEqual({
        navigator: 'browser',
        instanceId: 'my-instance',
      })
    })

    it('returns null for browser without id', () => {
      const state = parseRouteToNavigationState('browser')
      expect(state).toBeNull()
    })
  })

  describe('buildRouteFromNavigationState', () => {
    it('builds route from BrowserNavigationState', () => {
      const route = buildRouteFromNavigationState({
        navigator: 'browser',
        instanceId: 'x',
      })
      expect(route).toBe('browser/x')
    })
  })

  describe('round-trip: NavigationState', () => {
    it('round-trips through NavigationState', () => {
      const route = 'browser/test-123'
      const state = parseRouteToNavigationState(route)
      expect(state).not.toBeNull()
      expect(buildRouteFromNavigationState(state!)).toBe(route)
    })
  })
})
