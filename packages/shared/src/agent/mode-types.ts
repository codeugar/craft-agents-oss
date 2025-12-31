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
 * - 'allow-all': Everything allowed, no prompts (red)
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
  color: 'green' | 'amber' | 'red';
  description: string;
  /** Icon name from lucide-react */
  iconName: 'ListTodo' | 'Info' | 'ShieldOff';
}> = {
  'safe': {
    displayName: 'Safe Mode',
    shortName: 'Safe',
    color: 'green',
    description: 'Read-only exploration. Blocks writes, never prompts.',
    iconName: 'ListTodo',
  },
  'ask': {
    displayName: 'Ask Permission',
    shortName: 'Ask',
    color: 'amber',
    description: 'Prompts for dangerous operations.',
    iconName: 'Info',
  },
  'allow-all': {
    displayName: 'Allow All',
    shortName: 'Allow All',
    color: 'red',
    description: 'Everything allowed, no prompts.',
    iconName: 'ShieldOff',
  },
};
