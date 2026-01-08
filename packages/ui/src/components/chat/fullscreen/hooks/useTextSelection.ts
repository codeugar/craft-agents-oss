/**
 * useTextSelection - Hook for tracking text selection within a container
 *
 * Listens to mouseup events to capture selection only after the user
 * finishes selecting (not during drag).
 */

import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'

export interface SelectionState {
  text: string
  range: Range
  rect: DOMRect
}

interface UseTextSelectionOptions {
  /** Ref to the container element - selections outside this are ignored */
  containerRef: RefObject<HTMLElement | null>
  /** Called when a valid selection is made */
  onSelect?: (selection: SelectionState) => void
}

interface UseTextSelectionReturn {
  /** Current selection state, or null if no valid selection */
  selection: SelectionState | null
  /** Clear the current selection */
  clearSelection: () => void
}

export function useTextSelection({
  containerRef,
  onSelect,
}: UseTextSelectionOptions): UseTextSelectionReturn {
  const [selection, setSelection] = useState<SelectionState | null>(null)
  // Track if we're currently showing a selection (to avoid clearing it on outside clicks)
  const hasActiveSelectionRef = useRef(false)

  const clearSelection = useCallback((clearBrowserSelection = true) => {
    setSelection(null)
    hasActiveSelectionRef.current = false
    if (clearBrowserSelection) {
      window.getSelection()?.removeAllRanges()
    }
  }, [])

  // Capture selection on mouseup (when user finishes selecting)
  const handleMouseUp = useCallback((e: MouseEvent) => {
    // Small delay to let the browser finalize the selection
    requestAnimationFrame(() => {
      const windowSelection = window.getSelection()

      if (!windowSelection || !windowSelection.anchorNode) {
        return
      }

      // Check if selection is collapsed (no text selected)
      if (windowSelection.isCollapsed) {
        // If clicking outside of active selection, clear it
        if (hasActiveSelectionRef.current) {
          const container = containerRef.current
          if (container && container.contains(e.target as Node)) {
            // Clicked inside container but not on a selection - clear
            clearSelection(false)
          }
        }
        return
      }

      // Get the selected text
      const text = windowSelection.toString().trim()
      if (!text) {
        return
      }

      // Verify selection is within our container
      const container = containerRef.current
      if (!container) {
        return
      }

      const anchorNode = windowSelection.anchorNode
      const focusNode = windowSelection.focusNode

      // Both anchor and focus must be within the container
      if (!container.contains(anchorNode) || !container.contains(focusNode)) {
        return
      }

      // Get the range and its bounding rect for positioning
      const range = windowSelection.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      // Don't create selection if rect has no dimensions
      if (rect.width === 0 && rect.height === 0) {
        return
      }

      const newSelection: SelectionState = {
        text,
        range: range.cloneRange(), // Clone to preserve the range
        rect,
      }

      setSelection(newSelection)
      hasActiveSelectionRef.current = true
      onSelect?.(newSelection)
    })
  }, [containerRef, onSelect, clearSelection])

  // Handle keyboard selection (Shift+Arrow keys, Cmd+A, etc.)
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    // Only process if shift was involved (for shift+arrow selection)
    // or if it's Cmd/Ctrl+A (select all)
    if (!e.shiftKey && !(e.metaKey || e.ctrlKey)) {
      return
    }

    const windowSelection = window.getSelection()
    if (!windowSelection || windowSelection.isCollapsed) {
      return
    }

    const text = windowSelection.toString().trim()
    if (!text) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    const anchorNode = windowSelection.anchorNode
    const focusNode = windowSelection.focusNode

    if (!container.contains(anchorNode) || !container.contains(focusNode)) {
      return
    }

    const range = windowSelection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    if (rect.width === 0 && rect.height === 0) {
      return
    }

    const newSelection: SelectionState = {
      text,
      range: range.cloneRange(),
      rect,
    }

    setSelection(newSelection)
    hasActiveSelectionRef.current = true
    onSelect?.(newSelection)
  }, [containerRef, onSelect])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleMouseUp, handleKeyUp])

  return { selection, clearSelection }
}
