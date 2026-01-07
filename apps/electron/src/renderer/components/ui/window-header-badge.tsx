import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Badge variants using the 6-color design system
 */
export const BADGE_VARIANTS = {
  // Tool badges with semantic colors (modifications)
  edit: 'bg-info/15 text-info',              // amber - modification
  write: 'bg-success/15 text-success',        // green - creation

  // Tool badges with white background (non-modifying)
  read: 'bg-background text-foreground/70',   // white - passive
  bash: 'bg-background text-foreground/70',   // white - passive
  grep: 'bg-background text-foreground/70',   // white - search
  glob: 'bg-background text-foreground/70',   // white - search

  // Default - white background (for file paths, metadata)
  default: 'bg-background text-foreground/70',
} as const

export type BadgeVariant = keyof typeof BADGE_VARIANTS

interface WindowHeaderBadgeProps {
  /** Icon component to display */
  Icon?: LucideIcon
  /** Badge label text */
  label: string
  /** Badge variant (default: 'default') */
  variant?: BadgeVariant
  /** Click handler (makes it a clickable link-style button) */
  onClick?: () => void
  /** Title for tooltip */
  title?: string
  /** Additional className */
  className?: string
}

/**
 * WindowHeaderBadge - Unified badge component for preview window headers
 *
 * Style specs:
 * - Height: 26px
 * - Padding: 10px horizontal
 * - Border radius: 6px
 * - Font: Sans-serif, 13px, medium weight
 * - Shadow: shadow-minimal
 * - Truncation: CSS truncate (end), shrink x, stay 1 line
 * - Clickable: underline on hover, pointer cursor, opens file
 */
export function WindowHeaderBadge({
  Icon,
  label,
  variant = 'default',
  onClick,
  title,
  className,
}: WindowHeaderBadgeProps) {
  const variantClasses = BADGE_VARIANTS[variant]
  const baseClasses = cn(
    'flex items-center gap-1.5 h-[26px] px-2.5 rounded-[6px] font-sans text-[13px] font-medium shadow-minimal',
    variantClasses,
    className
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={cn(baseClasses, 'min-w-0 cursor-pointer group titlebar-no-drag')}
        title={title || label}
      >
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
        <span className="truncate group-hover:underline">{label}</span>
      </button>
    )
  }

  return (
    <div className={cn(baseClasses, 'shrink-0')} title={title}>
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span className="truncate">{label}</span>
    </div>
  )
}

interface WindowHeaderProps {
  /** Badge elements to render in center */
  children?: React.ReactNode
  /** Additional className for the toolbar */
  className?: string
  /** Inline styles (e.g., for background color) */
  style?: React.CSSProperties
}

/**
 * WindowHeader - Standardized header/toolbar for preview windows
 */
export function WindowHeader({
  children,
  className,
  style,
}: WindowHeaderProps) {
  return (
    <div
      className={cn(
        'titlebar-drag-region h-[50px] shrink-0 flex items-center justify-between px-4 border-b border-foreground/5',
        'sticky top-0 z-10 backdrop-blur-xl backdrop-saturate-150',
        'bg-white dark:bg-[#302f33]',
        className
      )}
      style={style}
    >
      {/* Left side - space for traffic lights on macOS */}
      <div className="w-[70px] shrink-0" />

      {/* Center - badges row */}
      <div className="flex items-center gap-2 min-w-0 p-2">
        {children}
      </div>

      {/* Right side - placeholder for future actions */}
      <div className="w-[70px] shrink-0" />
    </div>
  )
}
