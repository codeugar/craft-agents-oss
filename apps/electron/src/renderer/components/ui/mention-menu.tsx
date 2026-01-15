/**
 * Unified @ Mention Menu
 *
 * A combined menu for @mentioning both skills and sources.
 * Shows type badges to distinguish between the two.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { SkillAvatar } from '@/components/ui/skill-avatar'
import { SourceAvatar } from '@/components/ui/source-avatar'
import type { LoadedSkill, LoadedSource } from '../../../shared/types'
import {
  type MentionableItem,
  buildMentionableItems,
  filterMentionableItems,
} from '@/lib/mentions'

// Re-export MentionableItem for consumers
export type { MentionableItem } from '@/lib/mentions'

// ============================================================================
// Shared Styles (matching slash-command-menu)
// ============================================================================

const MENU_CONTAINER_STYLE = 'min-w-[280px] overflow-hidden rounded-[8px] bg-background text-foreground shadow-modal-small'
const MENU_LIST_STYLE = 'max-h-[300px] overflow-y-auto p-1'
const MENU_ITEM_STYLE = 'flex cursor-pointer select-none items-center gap-3 rounded-[6px] px-3 py-2 text-[13px]'
const MENU_ITEM_SELECTED = 'bg-foreground/5'

// ============================================================================
// Type Badge Component
// ============================================================================

function TypeBadge({ type }: { type: 'skill' | 'source' }) {
  const isSkill = type === 'skill'
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 text-[10px] font-medium rounded',
        isSkill
          ? 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400'
          : 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
      )}
    >
      {isSkill ? 'Skill' : 'Source'}
    </span>
  )
}

// ============================================================================
// MentionMenu Component
// ============================================================================

export interface MentionMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: MentionableItem[]
  onSelect: (item: MentionableItem) => void
  filter?: string
  position: { x: number; y: number }
  workspaceId?: string
  className?: string
}

// Constants for collapsed view
const MAX_SKILLS_COLLAPSED = 2
const MAX_SOURCES_COLLAPSED = 2

export function MentionMenu({
  open,
  onOpenChange,
  items,
  onSelect,
  filter = '',
  position,
  workspaceId,
  className,
}: MentionMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [isExpanded, setIsExpanded] = React.useState(false)
  const filteredItems = filterMentionableItems(items, filter)

  // Separate skills and sources
  const skills = filteredItems.filter(item => item.type === 'skill')
  const sources = filteredItems.filter(item => item.type === 'source')

  // Determine if we need "Show more" (only when not filtering and have more items)
  const hasMoreItems = !filter && (skills.length > MAX_SKILLS_COLLAPSED || sources.length > MAX_SOURCES_COLLAPSED)
  const showExpanded = isExpanded || !!filter // Always show all when filtering

  // Build display items: limited skills + limited sources + optional "Show more"
  const displayItems: (MentionableItem | 'show-more')[] = React.useMemo(() => {
    if (showExpanded) {
      return filteredItems
    }
    const limitedSkills = skills.slice(0, MAX_SKILLS_COLLAPSED)
    const limitedSources = sources.slice(0, MAX_SOURCES_COLLAPSED)
    const result: (MentionableItem | 'show-more')[] = [...limitedSkills, ...limitedSources]
    if (hasMoreItems) {
      result.push('show-more')
    }
    return result
  }, [filteredItems, skills, sources, showExpanded, hasMoreItems])

  // Reset selection and collapse state when menu opens/closes or filter changes
  React.useEffect(() => {
    setSelectedIndex(0)
  }, [filter])

  React.useEffect(() => {
    if (!open) {
      setIsExpanded(false)
      setSelectedIndex(0)
    }
  }, [open])

  // Keyboard navigation
  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => (prev < displayItems.length - 1 ? prev + 1 : 0))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : displayItems.length - 1))
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          const selectedItem = displayItems[selectedIndex]
          if (selectedItem === 'show-more') {
            setIsExpanded(true)
            setSelectedIndex(0)
          } else if (selectedItem) {
            onSelect(selectedItem)
            onOpenChange(false)
          }
          break
        case 'Escape':
          e.preventDefault()
          onOpenChange(false)
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, displayItems, selectedIndex, onSelect, onOpenChange])

  // Close on click outside
  React.useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onOpenChange(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onOpenChange])

  // Hide if no results or not open
  if (!open || filteredItems.length === 0) return null

  // Calculate bottom position from window height (menu appears above cursor)
  const bottomPosition = typeof window !== 'undefined'
    ? window.innerHeight - Math.round(position.y) + 8
    : 0

  // Count of hidden items for "Show more" label
  const hiddenCount = skills.length + sources.length - (MAX_SKILLS_COLLAPSED + MAX_SOURCES_COLLAPSED)

  return (
    <div
      ref={menuRef}
      className={cn('fixed z-50', MENU_CONTAINER_STYLE, className)}
      style={{ left: Math.round(position.x) - 10, bottom: bottomPosition }}
    >
      <div className={MENU_LIST_STYLE}>
        {displayItems.map((item, index) => {
          const isSelected = index === selectedIndex

          // Handle "Show more" row
          if (item === 'show-more') {
            return (
              <div
                key="show-more"
                onClick={() => {
                  setIsExpanded(true)
                  setSelectedIndex(0)
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  MENU_ITEM_STYLE,
                  'text-foreground/60',
                  isSelected && MENU_ITEM_SELECTED
                )}
              >
                <div className="shrink-0 w-6 h-6 flex items-center justify-center text-foreground/40">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Show {hiddenCount} more...</div>
                </div>
              </div>
            )
          }

          return (
            <div
              key={`${item.type}-${item.slug}`}
              onClick={() => {
                onSelect(item)
                onOpenChange(false)
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              className={cn(
                MENU_ITEM_STYLE,
                isSelected && MENU_ITEM_SELECTED
              )}
            >
              {/* Avatar */}
              <div className="shrink-0">
                {item.type === 'skill' ? (
                  <SkillAvatar
                    skill={item.item as LoadedSkill}
                    size="sm"
                    workspaceId={workspaceId}
                  />
                ) : (
                  <SourceAvatar
                    source={item.item as LoadedSource}
                    size="sm"
                  />
                )}
              </div>

              {/* Name + Description */}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.name}</div>
                {item.description && (
                  <div className="text-[11px] text-foreground/50 truncate">
                    {item.description}
                  </div>
                )}
              </div>

              {/* Type Badge */}
              <TypeBadge type={item.type} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// useMentionMenu Hook
// ============================================================================

export interface UseMentionMenuOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement>
  skills: LoadedSkill[]
  sources: LoadedSource[]
  onSelect?: (item: MentionableItem) => void
}

export interface UseMentionMenuReturn {
  isOpen: boolean
  filter: string
  position: { x: number; y: number }
  items: MentionableItem[]
  handleInputChange: (value: string, cursorPosition: number) => void
  close: () => void
  handleSelect: (item: MentionableItem) => string
}

export function useMentionMenu({
  textareaRef,
  skills,
  sources,
  onSelect,
}: UseMentionMenuOptions): UseMentionMenuReturn {
  const [isOpen, setIsOpen] = React.useState(false)
  const [filter, setFilter] = React.useState('')
  const [position, setPosition] = React.useState({ x: 0, y: 0 })
  const [atStart, setAtStart] = React.useState(-1)

  // Build combined items list
  const allItems = React.useMemo(
    () => buildMentionableItems(skills, sources),
    [skills, sources]
  )

  // Filter items based on current filter
  const items = React.useMemo(
    () => filterMentionableItems(allItems, filter),
    [allItems, filter]
  )

  const handleInputChange = React.useCallback((value: string, cursorPosition: number) => {
    const textBeforeCursor = value.slice(0, cursorPosition)
    // Match @ at start of text or after whitespace, followed by optional word chars and hyphens
    const atMatch = textBeforeCursor.match(/(?:^|\s)@([\w-]*)$/)

    if (atMatch && allItems.length > 0) {
      const matchStart = textBeforeCursor.lastIndexOf('@')
      setAtStart(matchStart)
      setFilter(atMatch[1] || '')

      if (textareaRef.current) {
        const textarea = textareaRef.current
        const rect = textarea.getBoundingClientRect()
        const style = window.getComputedStyle(textarea)

        // Mirror element to measure cursor position
        const mirror = document.createElement('div')
        mirror.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: pre-wrap;
          word-wrap: break-word;
          font-family: ${style.fontFamily};
          font-size: ${style.fontSize};
          line-height: ${style.lineHeight};
          padding: ${style.padding};
          width: ${textarea.clientWidth}px;
          box-sizing: border-box;
        `
        mirror.textContent = textBeforeCursor
        const caret = document.createElement('span')
        caret.textContent = '|'
        mirror.appendChild(caret)

        document.body.appendChild(mirror)
        const caretRect = caret.getBoundingClientRect()
        const mirrorRect = mirror.getBoundingClientRect()
        document.body.removeChild(mirror)

        // Position above the current line (menu appears above cursor)
        setPosition({
          x: rect.left + (caretRect.left - mirrorRect.left),
          y: rect.top + (caretRect.top - mirrorRect.top),
        })
      }

      setIsOpen(true)
    } else {
      setIsOpen(false)
      setFilter('')
      setAtStart(-1)
    }
  }, [textareaRef, allItems.length])

  const handleSelect = React.useCallback((item: MentionableItem): string => {
    // Insert @slug at the @ position, replacing the partial text
    let result = ''
    if (textareaRef.current && atStart >= 0) {
      const currentValue = textareaRef.current.value
      const before = currentValue.slice(0, atStart)
      const cursorPos = textareaRef.current.selectionStart
      const after = currentValue.slice(cursorPos)
      // Insert @slug with trailing space
      result = before + '@' + item.slug + ' ' + after
    }

    onSelect?.(item)
    setIsOpen(false)

    return result
  }, [onSelect, textareaRef, atStart])

  const close = React.useCallback(() => {
    setIsOpen(false)
    setFilter('')
    setAtStart(-1)
  }, [])

  return {
    isOpen,
    filter,
    position,
    items,
    handleInputChange,
    close,
    handleSelect,
  }
}
