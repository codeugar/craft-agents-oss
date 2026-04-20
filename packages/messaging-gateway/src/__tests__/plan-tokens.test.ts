/**
 * PlanTokenRegistry — short-lived token lookup for Telegram plan approvals.
 *
 * Tokens are opaque, per-session revocable, TTL-expiring. These tests
 * cover the happy path, expiry, re-issue semantics, and isolation between
 * sessions.
 */

import { describe, expect, it } from 'bun:test'
import { PlanTokenRegistry } from '../plan-tokens'

describe('PlanTokenRegistry', () => {
  it('issues and resolves tokens', () => {
    const reg = new PlanTokenRegistry()
    const token = reg.issue('s1', '/tmp/plan.md')
    expect(token).toHaveLength(8)

    const resolved = reg.resolve(token)
    expect(resolved).toEqual({
      sessionId: 's1',
      planPath: '/tmp/plan.md',
      messageId: undefined,
      createdAt: expect.any(Number),
    })
  })

  it('returns null for unknown tokens', () => {
    const reg = new PlanTokenRegistry()
    expect(reg.resolve('nope')).toBeNull()
  })

  it('expires tokens after TTL', async () => {
    const reg = new PlanTokenRegistry(10) // 10ms TTL for the test
    const token = reg.issue('s1', '/tmp/plan.md')
    await new Promise((r) => setTimeout(r, 20))
    expect(reg.resolve(token)).toBeNull()
  })

  it('drops the token from storage after expiry', async () => {
    const reg = new PlanTokenRegistry(5)
    const token = reg.issue('s1', '/tmp/plan.md')
    expect(reg.size()).toBe(1)
    await new Promise((r) => setTimeout(r, 15))
    reg.resolve(token) // triggers cleanup
    expect(reg.size()).toBe(0)
  })

  it('revokes previous tokens for the same session on re-issue', () => {
    const reg = new PlanTokenRegistry()
    const t1 = reg.issue('s1', '/plan-a.md')
    const t2 = reg.issue('s1', '/plan-b.md')

    expect(reg.resolve(t1)).toBeNull()
    expect(reg.resolve(t2)?.planPath).toBe('/plan-b.md')
  })

  it('leaves other sessions untouched when revoking', () => {
    const reg = new PlanTokenRegistry()
    const t1 = reg.issue('s1', '/a.md')
    const t2 = reg.issue('s2', '/b.md')

    reg.revokeForSession('s1')
    expect(reg.resolve(t1)).toBeNull()
    expect(reg.resolve(t2)?.sessionId).toBe('s2')
  })

  it('explicit revoke removes one token only', () => {
    const reg = new PlanTokenRegistry()
    const t1 = reg.issue('s1', '/a.md')
    const t2 = reg.issue('s2', '/b.md')
    reg.revoke(t1)
    expect(reg.resolve(t1)).toBeNull()
    expect(reg.resolve(t2)).not.toBeNull()
  })
})
