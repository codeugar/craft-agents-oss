import { useEffect, useMemo, useState } from 'react'
import {
  resolveTheme,
  themeToCSS,
  DEFAULT_THEME,
  DEFAULT_SHIKI_THEME,
  getShikiTheme,
  type ThemeOverrides,
  type ThemeFile,
  type ShikiThemeConfig,
} from '@config/theme'
import { useTheme as useThemeContext } from '@/context/ThemeContext'

interface UseThemeOptions {
  /**
   * App-level theme override (from ~/.craft-agent/theme.json)
   */
  appTheme?: ThemeOverrides | null
}

interface UseThemeResult {
  theme: ThemeOverrides
  defaultTheme: ThemeOverrides
  shikiTheme: string
  shikiConfig: ShikiThemeConfig
  presetTheme: ThemeFile | null
  isDark: boolean
  /** Whether the theme is in scenic mode (background image with glass panels) */
  isScenic: boolean
}

/**
 * Hook to manage theme (preset → app override).
 * Resolves themes and injects CSS variables into document.
 * Also provides Shiki theme name for syntax highlighting.
 *
 * @example
 * ```tsx
 * const [appTheme] = useAtom(appThemeAtom)
 *
 * const { shikiTheme } = useTheme({ appTheme })
 * ```
 */
export function useTheme({ appTheme }: UseThemeOptions = {}): UseThemeResult {
  // Get resolved mode, system preference, and color theme from ThemeContext
  // Use effectiveColorTheme which includes hover preview state
  const { resolvedMode, systemPreference, colorTheme, effectiveColorTheme } = useThemeContext()
  const isDark = resolvedMode === 'dark'

  // Load preset theme when effectiveColorTheme changes
  // This allows hover preview to load and display themes immediately
  const [presetTheme, setPresetTheme] = useState<ThemeFile | null>(null)

  useEffect(() => {
    if (!effectiveColorTheme || effectiveColorTheme === 'default') {
      setPresetTheme(null)
      return
    }

    // Load preset theme via IPC (app-level)
    window.electronAPI?.loadPresetTheme?.(effectiveColorTheme).then((preset) => {
      setPresetTheme(preset?.theme ?? null)
    }).catch(() => {
      setPresetTheme(null)
    })
  }, [effectiveColorTheme])

  // Resolve theme (preset → app override)
  // Preset provides base, app theme.json can override
  const resolvedTheme = useMemo(() => {
    // First merge preset with app override, then apply resolveTheme for any final processing
    return resolveTheme(
      presetTheme ? { ...presetTheme, ...(appTheme ?? {}) } : (appTheme ?? undefined)
    )
  }, [presetTheme, appTheme])

  // Get Shiki theme configuration
  const shikiConfig = useMemo(() => {
    return presetTheme?.shikiTheme || DEFAULT_SHIKI_THEME
  }, [presetTheme])

  // Determine if theme is scenic mode (scenic themes force dark mode)
  const isScenic = useMemo(() => {
    return resolvedTheme.mode === 'scenic' && !!resolvedTheme.backgroundImage
  }, [resolvedTheme])

  // Scenic themes force dark mode for better contrast with background images
  const effectiveIsDark = isScenic ? true : isDark

  // Get the current Shiki theme name based on mode
  // If theme doesn't support current mode, use the mode it does support
  const shikiTheme = useMemo(() => {
    const supportedModes = presetTheme?.supportedModes
    const currentMode = effectiveIsDark ? 'dark' : 'light'

    // If theme has limited mode support and doesn't include current mode,
    // use the mode it does support for Shiki
    if (supportedModes && supportedModes.length > 0 && !supportedModes.includes(currentMode)) {
      // Use the first supported mode (e.g., dark-only theme uses dark shiki even in "light" mode)
      const effectiveMode = supportedModes[0] === 'dark'
      return getShikiTheme(shikiConfig, effectiveMode)
    }

    return getShikiTheme(shikiConfig, effectiveIsDark)
  }, [shikiConfig, effectiveIsDark, presetTheme])

  // Generate CSS and inject into document
  useEffect(() => {
    // Get or create style element
    const styleId = 'craft-theme-overrides'
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null

    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }

    // Always set theme-override for 50% opacity background (vibrancy effect)
    document.documentElement.dataset.themeOverride = 'true'

    // Handle themeMismatch - set solid background when:
    // 1. Theme doesn't support current mode (e.g., dark-only Dracula in light mode), OR
    // 2. Resolved mode differs from system preference (vibrancy mismatch)
    const supportedModes = presetTheme?.supportedModes
    const currentMode = isDark ? 'dark' : 'light'
    const themeModeUnsupported = supportedModes && supportedModes.length > 0 && !supportedModes.includes(currentMode)
    const vibrancyMismatch = resolvedMode !== systemPreference

    if (themeModeUnsupported || vibrancyMismatch) {
      document.documentElement.dataset.themeMismatch = 'true'
    } else {
      delete document.documentElement.dataset.themeMismatch
    }

    // Set scenic mode data attribute for CSS targeting
    // Scenic mode forces dark mode for better contrast with background images
    if (isScenic) {
      document.documentElement.dataset.scenic = 'true'
      // Force dark class on document for scenic themes
      document.documentElement.classList.add('dark')
      // Set background image directly as CSS property (avoids style sheet size limits)
      if (resolvedTheme.backgroundImage) {
        document.documentElement.style.setProperty(
          '--background-image',
          `url("${resolvedTheme.backgroundImage}")`
        )
      }
    } else {
      delete document.documentElement.dataset.scenic
      // Clear background image when not in scenic mode
      document.documentElement.style.removeProperty('--background-image')
      // Only remove dark class if we added it for scenic mode
      // (don't interfere with user's actual dark mode preference)
      if (!isDark) {
        document.documentElement.classList.remove('dark')
      }
    }

    // When using default theme, clear custom CSS but keep theme-override and themeMismatch
    if (!effectiveColorTheme || effectiveColorTheme === 'default') {
      styleEl.textContent = ''
      return
    }

    // Generate CSS variable declarations (use effectiveIsDark for scenic mode)
    const cssVars = themeToCSS(resolvedTheme, effectiveIsDark)

    // Inject CSS variables on :root
    if (cssVars) {
      styleEl.textContent = `:root {\n  ${cssVars}\n}`
    } else {
      styleEl.textContent = ''
    }

  }, [resolvedTheme, isDark, effectiveIsDark, presetTheme, appTheme, effectiveColorTheme, resolvedMode, systemPreference, isScenic])

  return {
    theme: resolvedTheme,
    defaultTheme: DEFAULT_THEME,
    shikiTheme,
    shikiConfig,
    presetTheme,
    isDark: effectiveIsDark, // Scenic themes force dark mode
    isScenic,
  }
}
