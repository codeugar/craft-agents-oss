/**
 * Mode Types and Constants
 *
 * Pure types and UI configuration for permission modes.
 * This file has NO runtime dependencies - safe for browser bundling.
 *
 * For runtime mode management functions, use './mode-manager.ts'
 */

// ============================================================
// Permission Mode Types
// ============================================================

/**
 * Available permission modes
 * - 'safe': Read-only, blocks writes, never prompts (green)
 * - 'ask': Prompts for dangerous operations (amber)
 * - 'allow-all': Everything allowed, no prompts (violet)
 */
export type PermissionMode = 'safe' | 'ask' | 'allow-all';

/**
 * Order of modes for cycling with SHIFT+TAB
 */
export const PERMISSION_MODE_ORDER: PermissionMode[] = ['safe', 'ask', 'allow-all'];

/**
 * Display configuration for each mode
 */
export const PERMISSION_MODE_CONFIG: Record<PermissionMode, {
  displayName: string;
  shortName: string;
  description: string;
  /** SVG path data for the icon (viewBox 0 0 24 24, stroke-based) */
  svgPath: string;
  /** Tailwind color classes for consistent theming */
  colorClass: {
    /** Text color class (e.g., 'text-info') */
    text: string;
    /** Background color class (e.g., 'bg-info') */
    bg: string;
    /** Border color class (e.g., 'border-info') */
    border: string;
  };
}> = {
  'safe': {
    displayName: 'Explore',
    shortName: 'Explore',
    description: 'Read-only exploration. Blocks writes, never prompts.',
    // Compass icon from Lucide
    svgPath: 'M16.24 7.76l-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    colorClass: {
      text: 'text-foreground/60',
      bg: 'bg-foreground/60',
      border: 'border-foreground/60',
    },
  },
  'ask': {
    displayName: 'Ask to Edit',
    shortName: 'Ask',
    description: 'Prompts before making edits.',
    // Info icon from Lucide
    svgPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4m0 4h.01',
    colorClass: {
      text: 'text-info',
      bg: 'bg-info',
      border: 'border-info',
    },
  },
  'allow-all': {
    displayName: 'Auto',
    shortName: 'Auto',
    description: 'Automatic execution, no prompts.',
    // Repeat icon from Lucide (loop)
    svgPath: 'm17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
    colorClass: {
      text: 'text-accent',
      bg: 'bg-accent',
      border: 'border-accent',
    },
  },
};
