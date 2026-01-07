/**
 * useSelectionBox - Reusable hook for marquee/drag-box selection
 * 
 * Provides selection box functionality for multi-selecting items by
 * clicking and dragging to draw a selection rectangle.
 * 
 * Used by:
 * - FilePane (file browser list view)
 * - FileTree (explorer tree view)
 * 
 * @example
 * const { selectionBox, selectionHandlers } = useSelectionBox({
 *   containerRef: tableRef,
 *   getVisibleItems: () => sortedFiles,
 *   rowSelector: 'tbody tr',
 *   setSelectedFiles,
 *   clearSelection
 * })
 * 
 * return (
 *   <div ref={containerRef} {...selectionHandlers}>
 *     {selectionBox && <SelectionBoxOverlay box={selectionBox} />}
 *     ...
 *   </div>
 * )
 */
import { useState, useCallback, RefObject } from 'react'

export interface SelectionBox {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

export interface UseSelectionBoxOptions {
  /** Reference to the scrollable container element */
  containerRef: RefObject<HTMLElement | null>
  /** Function that returns the currently visible/selectable items with their paths */
  getVisibleItems: () => { path: string }[]
  /** CSS selector to find row elements within the container */
  rowSelector: string
  /** Function to set the selected file paths */
  setSelectedFiles: (paths: string[]) => void
  /** Function to clear all selections */
  clearSelection: () => void
  /** Optional: Elements that should NOT trigger selection box (default: none) */
  excludeSelector?: string
}

export interface UseSelectionBoxReturn {
  /** Current selection box state, or null if not dragging */
  selectionBox: SelectionBox | null
  /** Set selection box state directly (for external control) */
  setSelectionBox: React.Dispatch<React.SetStateAction<SelectionBox | null>>
  /** Event handlers to spread onto the container element */
  selectionHandlers: {
    onMouseDown: (e: React.MouseEvent) => void
    onMouseMove: (e: React.MouseEvent) => void
    onMouseUp: (e: React.MouseEvent) => void
    onMouseLeave: (e: React.MouseEvent) => void
  }
}

/**
 * Hook for marquee/drag-box selection functionality
 */
export function useSelectionBox(options: UseSelectionBoxOptions): UseSelectionBoxReturn {
  const {
    containerRef,
    getVisibleItems,
    rowSelector,
    setSelectedFiles,
    clearSelection,
    excludeSelector
  } = options

  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start selection box on left click
    if (e.button !== 0) return
    
    const target = e.target as HTMLElement
    
    // Don't start selection if clicking on an actual row/item
    if (target.closest(rowSelector)) return
    
    // Don't start selection if clicking on excluded elements
    if (excludeSelector && target.closest(excludeSelector)) return
    
    const container = containerRef.current
    if (!container) return
    
    const rect = container.getBoundingClientRect()
    const startX = e.clientX - rect.left + container.scrollLeft
    const startY = e.clientY - rect.top + container.scrollTop
    
    setSelectionBox({ startX, startY, currentX: startX, currentY: startY })
    
    // Clear selection unless modifier keys are held
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      clearSelection()
    }
  }, [containerRef, rowSelector, excludeSelector, clearSelection])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!selectionBox) return
    
    const container = containerRef.current
    if (!container) return
    
    const rect = container.getBoundingClientRect()
    const currentX = e.clientX - rect.left + container.scrollLeft
    const currentY = e.clientY - rect.top + container.scrollTop
    
    setSelectionBox(prev => prev ? { ...prev, currentX, currentY } : null)
    
    // Calculate selection box bounds
    const top = Math.min(selectionBox.startY, currentY)
    const bottom = Math.max(selectionBox.startY, currentY)
    
    // Find rows that intersect with selection box
    const rows = container.querySelectorAll(rowSelector)
    const visibleItems = getVisibleItems()
    const selectedPaths: string[] = []
    
    rows.forEach((row, index) => {
      const rowRect = row.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      
      const rowTop = rowRect.top - containerRect.top + container.scrollTop
      const rowBottom = rowTop + rowRect.height
      
      // Check if row intersects with selection box
      if (rowBottom > top && rowTop < bottom) {
        const item = visibleItems[index]
        if (item) {
          selectedPaths.push(item.path)
        }
      }
    })
    
    setSelectedFiles(selectedPaths)
  }, [selectionBox, containerRef, rowSelector, getVisibleItems, setSelectedFiles])

  const handleMouseUp = useCallback(() => {
    setSelectionBox(null)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (selectionBox) {
      setSelectionBox(null)
    }
  }, [selectionBox])

  return {
    selectionBox,
    setSelectionBox,
    selectionHandlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseLeave
    }
  }
}
