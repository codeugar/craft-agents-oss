import { remark } from 'remark'
import strip from 'strip-markdown'
import type { Message } from '../../shared/types'

// Pre-configured processor (reusable, avoids creating per call)
const processor = remark().use(strip)

// Regex to match emoji characters (using Unicode property escapes)
const EMOJI_REGEX = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu

/**
 * Strip markdown formatting and emojis using remark AST parser.
 * Uses strip-markdown plugin from the unified/remark ecosystem.
 */
export function stripMarkdown(text: string): string {
  if (!text) return ''

  // Process synchronously (strip-markdown is sync)
  const result = processor.processSync(text)

  // Remove emojis and normalize whitespace
  return String(result)
    .replace(EMOJI_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Message roles suitable for preview display */
const PREVIEWABLE_ROLES = new Set<Message['role']>(['user', 'assistant', 'info', 'warning'])

/**
 * Find the most appropriate message for preview.
 * Skips tool results, status, system, and error messages.
 */
export function getPreviewMessage(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!PREVIEWABLE_ROLES.has(msg.role)) continue
    if (!msg.content?.trim()) continue
    return msg.content
  }
  return 'New chat'
}

/**
 * Generate a clean preview string for session list.
 * - Finds the most recent previewable message (skips tool results)
 * - Strips markdown formatting using remark parser
 * - Truncates to maxLength characters
 */
export function getSessionPreview(messages: Message[], maxLength = 300): string {
  const raw = getPreviewMessage(messages)
  if (raw === 'New chat') return raw

  // Only parse first 500 chars to avoid parsing huge messages
  const truncatedInput = raw.slice(0, 500)
  const cleaned = stripMarkdown(truncatedInput)

  return cleaned.length > maxLength
    ? cleaned.slice(0, maxLength) + '...'
    : cleaned
}
