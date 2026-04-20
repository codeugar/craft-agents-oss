/**
 * PlanTokenRegistry — short-lived opaque tokens for plan approval buttons.
 *
 * Telegram's `callback_data` is capped at 64 bytes, which is too small to
 * round-trip an absolute plan path. We issue an 8-char random token per
 * plan submission, hand it out inside button IDs like `plan:accept:<token>`,
 * and look up the real `{sessionId, planPath}` when the callback fires.
 *
 * Tokens expire after `ttlMs` (default 30 min) — stale buttons resolve to
 * `null` and the gateway replies "plan expired, retry from the desktop app."
 *
 * Per-session revocation lets a newer plan supersede an older one so the
 * earlier buttons can't be used to accept a plan the user didn't see.
 */

import { randomBytes } from 'node:crypto'

const DEFAULT_TTL_MS = 30 * 60 * 1000

export interface PlanTokenEntry {
  sessionId: string
  planPath: string
  messageId?: string
  createdAt: number
}

export class PlanTokenRegistry {
  private readonly tokens = new Map<string, PlanTokenEntry>()
  private readonly ttlMs: number

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs
  }

  issue(sessionId: string, planPath: string, messageId?: string): string {
    this.revokeForSession(sessionId)
    const token = randomBytes(6).toString('base64url').slice(0, 8)
    this.tokens.set(token, {
      sessionId,
      planPath,
      messageId,
      createdAt: Date.now(),
    })
    return token
  }

  resolve(token: string): PlanTokenEntry | null {
    const entry = this.tokens.get(token)
    if (!entry) return null
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.tokens.delete(token)
      return null
    }
    return entry
  }

  revoke(token: string): void {
    this.tokens.delete(token)
  }

  revokeForSession(sessionId: string): void {
    for (const [token, entry] of this.tokens) {
      if (entry.sessionId === sessionId) this.tokens.delete(token)
    }
  }

  size(): number {
    return this.tokens.size
  }
}
