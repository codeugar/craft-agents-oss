/**
 * SourceAvatar - Unified avatar component for sources
 *
 * Provides consistent styling for all source icons (global sources and subagent sources).
 * Uses CrossfadeAvatar internally for smooth image loading with fallback support.
 *
 * Two usage patterns:
 * 1. Direct props: <SourceAvatar type="mcp" name="Linear" logoUrl="..." />
 * 2. Source object: <SourceAvatar source={loadedSource} />
 *
 * Size variants:
 * - xs: 14x14 (compact)
 * - sm: 16x16 (dropdowns, inline, sidebar)
 * - md: 20x20 (auth steps)
 * - lg: 24x24 (info panels)
 */

import * as React from 'react'
import { CrossfadeAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { Mail, Plug, Globe, HardDrive } from 'lucide-react'
import { McpIcon } from '@/components/icons/McpIcon'
import { getLogoUrl } from '@craft-agent/shared/utils/logo'
import { resolveSourceIconUrl } from '@craft-agent/shared/utils/icon'
import type { LoadedSource } from '../../../../shared/types'

export type SourceType = 'mcp' | 'api' | 'gmail' | 'local'
export type SourceAvatarSize = 'xs' | 'sm' | 'md' | 'lg'

/** Props for direct usage with explicit type/name/logo */
interface DirectSourceAvatarProps {
  /** Source type for automatic fallback icon */
  type: SourceType
  /** Service name for alt text */
  name: string
  /** Logo URL (Google Favicon URL) - if not provided, derives from serviceUrl */
  logoUrl?: string | null
  /** Service URL to derive logo from (used if logoUrl not provided) */
  serviceUrl?: string
  /** Size variant */
  size?: SourceAvatarSize
  /** Additional className overrides */
  className?: string
  /** Not used in direct mode */
  source?: never
}

/** Props for usage with LoadedSource object */
interface LoadedSourceAvatarProps {
  /** LoadedSource object to extract type/name/logo from */
  source: LoadedSource
  /** Size variant */
  size?: SourceAvatarSize
  /** Additional className overrides */
  className?: string
  /** Not used in source mode */
  type?: never
  name?: never
  logoUrl?: never
  serviceUrl?: never
}

type SourceAvatarProps = DirectSourceAvatarProps | LoadedSourceAvatarProps

// Size configurations (container only - icons fill parent with padding)
const SIZE_CONFIG: Record<SourceAvatarSize, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

// Fallback icons by source type
const FALLBACK_ICONS: Record<SourceType, React.ComponentType<{ className?: string }>> = {
  mcp: McpIcon,
  api: Globe,
  gmail: Mail,
  local: HardDrive,
}

/**
 * Get the fallback icon for a source type
 */
export function getSourceFallbackIcon(type: SourceType): React.ComponentType<{ className?: string }> {
  return FALLBACK_ICONS[type] ?? Plug
}

/**
 * Derive favicon URL from service URL (for sources without explicit iconUrl)
 */
function deriveServiceFavicon(source: LoadedSource): string | null {
  const config = source.config
  const url = config.mcp?.url ?? config.api?.baseUrl
  return url ? getLogoUrl(url) : null
}

export function SourceAvatar(props: SourceAvatarProps) {
  const { size = 'md', className } = props

  // Extract type, name, and logo URL based on props variant
  let type: SourceType
  let name: string
  let resolvedLogoUrl: string | null

  if ('source' in props && props.source) {
    // LoadedSource mode
    const source = props.source
    type = source.config.type as SourceType
    name = source.config.name
    // Priority: explicit iconUrl → derive from service URL → null
    resolvedLogoUrl = resolveSourceIconUrl(source.config.iconUrl, source.folderPath)
      ?? deriveServiceFavicon(source)
  } else {
    // Direct props mode
    const directProps = props as DirectSourceAvatarProps
    type = directProps.type
    name = directProps.name
    resolvedLogoUrl = directProps.logoUrl ?? (directProps.serviceUrl ? getLogoUrl(directProps.serviceUrl) : null)
  }

  const containerSize = SIZE_CONFIG[size]
  const FallbackIcon = FALLBACK_ICONS[type] ?? Plug

  return (
    <CrossfadeAvatar
      src={resolvedLogoUrl}
      alt={name}
      className={cn(
        containerSize,
        'rounded-[4px] ring-1 ring-border/30 shrink-0',
        className
      )}
      fallbackClassName="bg-muted rounded-[4px]"
      fallback={<FallbackIcon className="w-full h-full text-muted-foreground" />}
    />
  )
}
