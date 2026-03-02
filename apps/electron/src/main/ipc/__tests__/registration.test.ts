/**
 * Validates IPC handler registration integrity by statically parsing
 * HANDLED_CHANNELS arrays from all domain files. This avoids importing
 * the domain modules (which depend on Electron runtime).
 */
import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const IPC_DIR = join(__dirname, '..')

/** Extract IPC_CHANNELS.XXX references from a HANDLED_CHANNELS array in source text */
function extractHandledChannels(source: string): string[] {
  const match = source.match(/export const HANDLED_CHANNELS\s*=\s*\[([\s\S]*?)\]\s*as const/)
  if (!match) return []
  const body = match[1]
  const channels: string[] = []
  for (const m of body.matchAll(/IPC_CHANNELS\.(\w+)/g)) {
    channels.push(m[1])
  }
  return channels
}

// Discover all domain handler files (skip index.ts, types.ts, utils.ts, __tests__)
const domainFiles = readdirSync(IPC_DIR)
  .filter(f => f.endsWith('.ts') && !['index.ts', 'types.ts', 'utils.ts'].includes(f))
  .sort()

const domainChannels = new Map<string, string[]>()
for (const file of domainFiles) {
  const source = readFileSync(join(IPC_DIR, file), 'utf-8')
  const channels = extractHandledChannels(source)
  if (channels.length > 0) {
    domainChannels.set(file, channels)
  }
}

describe('IPC handler registration', () => {
  it('has no duplicate channel registrations across domains', () => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []

    for (const [file, channels] of domainChannels) {
      for (const ch of channels) {
        if (seen.has(ch)) {
          duplicates.push(`IPC_CHANNELS.${ch} registered in both "${seen.get(ch)}" and "${file}"`)
        }
        seen.set(ch, file)
      }
    }

    expect(duplicates).toEqual([])
  })

  it('all domain files have non-empty HANDLED_CHANNELS', () => {
    for (const [file, channels] of domainChannels) {
      expect(channels.length).toBeGreaterThan(0)
      // Also verify within the file — no duplicates internally
      const unique = new Set(channels)
      if (unique.size !== channels.length) {
        const dupes = channels.filter((ch, i) => channels.indexOf(ch) !== i)
        throw new Error(`${file} has internal duplicates: ${dupes.join(', ')}`)
      }
    }
  })

  it('covers all 13 domain files', () => {
    expect(domainChannels.size).toBe(13)
  })

  it('registers a reasonable total number of channels (>100)', () => {
    const total = [...domainChannels.values()].reduce((sum, chs) => sum + chs.length, 0)
    expect(total).toBeGreaterThanOrEqual(100)
  })
})
