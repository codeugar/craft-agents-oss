import { describe, it, expect } from 'bun:test'
import type { ActivityItem } from '../../components/chat/TurnCard'
import { extractOverlayCards } from '../tool-parsers'

function makeActivity(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: 'tool-1',
    type: 'tool',
    status: 'completed',
    timestamp: Date.now(),
    toolName: 'mcp__session__browser_tool',
    toolInput: {},
    content: '',
    ...overrides,
  }
}

describe('extractOverlayCards', () => {
  it('uses wrapper command verbatim for browser_tool input cards', () => {
    const activity = makeActivity({
      toolName: 'mcp__session__browser_tool',
      toolInput: { command: 'navigate https://example.com' },
      content: 'Navigated to: https://example.com\nTitle: Example',
    })

    const cards = extractOverlayCards(activity)
    expect(cards[0]?.label).toBe('Input')
    expect(cards[0]?.commandPreview).toBe('navigate https://example.com')
  })

  it('returns input + output cards for browser_tool with output', () => {
    const activity = makeActivity({
      toolName: 'mcp__session__browser_tool',
      toolInput: { command: 'snapshot' },
      content: JSON.stringify([{ ref: '@e1', role: 'button' }]),
    })

    const cards = extractOverlayCards(activity)
    expect(cards).toHaveLength(2)
    expect(cards[0]?.label).toBe('Input')
    expect(cards[0]?.commandPreview).toBe('snapshot')
    expect(cards[1]?.label).toBe('Output')
  })

  it('returns output-only card when command is empty', () => {
    const activity = makeActivity({
      toolName: 'mcp__session__browser_tool',
      toolInput: {},
      content: 'Missing command.',
    })

    const cards = extractOverlayCards(activity)
    // No meaningful input → output only
    expect(cards.length).toBeGreaterThanOrEqual(1)
    expect(cards[cards.length - 1]?.label).toBe('Output')
  })
})
