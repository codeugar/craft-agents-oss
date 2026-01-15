/**
 * Unified @ Mention System
 *
 * Utilities for parsing and managing @mentions that can reference
 * both skills and sources in a unified menu.
 */

import type { LoadedSkill, LoadedSource } from '../../shared/types'

// ============================================================================
// Types
// ============================================================================

/**
 * A mentionable item (skill or source) for the unified @ menu
 */
export interface MentionableItem {
  type: 'skill' | 'source'
  slug: string
  name: string
  description?: string
  /** Original item for avatar rendering */
  item: LoadedSkill | LoadedSource
}

/**
 * Parsed mentions from message text
 */
export interface ParsedMentions {
  skillSlugs: string[]
  sourceSlugs: string[]
}

// ============================================================================
// Building Mentionable Items
// ============================================================================

/**
 * Build a unified list of mentionable items from skills and sources
 * Skills are listed first, then sources
 */
export function buildMentionableItems(
  skills: LoadedSkill[],
  sources: LoadedSource[]
): MentionableItem[] {
  const items: MentionableItem[] = []

  // Add skills first
  for (const skill of skills) {
    items.push({
      type: 'skill',
      slug: skill.slug,
      name: skill.metadata.name,
      description: skill.metadata.description,
      item: skill,
    })
  }

  // Then add sources
  for (const source of sources) {
    items.push({
      type: 'source',
      slug: source.config.slug,
      name: source.config.name || source.config.slug,
      description: source.config.tagline,
      item: source,
    })
  }

  return items
}

// ============================================================================
// Filtering
// ============================================================================

/**
 * Filter mentionable items by search string
 * Matches against slug and name (case-insensitive)
 */
export function filterMentionableItems(
  items: MentionableItem[],
  filter: string
): MentionableItem[] {
  if (!filter) return items

  const lowerFilter = filter.toLowerCase()
  return items.filter(
    item =>
      item.slug.toLowerCase().includes(lowerFilter) ||
      item.name.toLowerCase().includes(lowerFilter)
  )
}

// ============================================================================
// Parsing Mentions from Text
// ============================================================================

/**
 * Parse @mentions from message text and resolve against available skills/sources
 *
 * @param text - The message text to parse
 * @param skills - Available skills to match against
 * @param sources - Available sources to match against
 * @returns Parsed mentions with separate skill and source slug arrays
 *
 * @example
 * parseMentions('@github help me', skills, sources)
 * // If 'github' is both a skill and source, returns:
 * // { skillSlugs: ['github'], sourceSlugs: ['github'] }
 */
export function parseMentions(
  text: string,
  skills: LoadedSkill[],
  sources: LoadedSource[]
): ParsedMentions {
  // Match @word patterns (allowing hyphens and underscores)
  // Must be at start of string or after whitespace
  const mentionPattern = /(?:^|\s)@([\w-]+)/g
  const skillSlugs = new Set<string>()
  const sourceSlugs = new Set<string>()

  const skillSlugSet = new Set(skills.map(s => s.slug))
  const sourceSlugSet = new Set(sources.map(s => s.config.slug))

  let match
  while ((match = mentionPattern.exec(text)) !== null) {
    const slug = match[1]

    // Check if slug matches a skill
    if (skillSlugSet.has(slug)) {
      skillSlugs.add(slug)
    }

    // Check if slug matches a source (can match both!)
    if (sourceSlugSet.has(slug)) {
      sourceSlugs.add(slug)
    }
  }

  return {
    skillSlugs: Array.from(skillSlugs),
    sourceSlugs: Array.from(sourceSlugs),
  }
}

/**
 * Strip @mentions from message text
 *
 * @param text - The message text with mentions
 * @returns Text with @mentions removed, preserving other content
 */
export function stripMentions(text: string): string {
  return text
    .replace(/(?:^|\s)@[\w-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
