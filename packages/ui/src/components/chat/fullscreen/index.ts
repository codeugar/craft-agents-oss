/**
 * Fullscreen overlay components with commenting support
 */

export { FullscreenOverlay } from './FullscreenOverlay'
export type { FullscreenOverlayProps } from './FullscreenOverlay'

// Re-export hooks for potential external use
export { useTextSelection } from './hooks/useTextSelection'
export type { SelectionState } from './hooks/useTextSelection'

export { useComments } from './hooks/useComments'
export type { Comment } from './hooks/useComments'
