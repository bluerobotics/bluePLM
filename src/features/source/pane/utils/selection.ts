/**
 * Selection utilities for the file browser
 */
import type { SelectionBox } from '../types'

/**
 * Check if a point is inside a selection box
 */
export function isPointInBox(
  x: number,
  y: number,
  box: SelectionBox
): boolean {
  const minX = Math.min(box.startX, box.currentX)
  const maxX = Math.max(box.startX, box.currentX)
  const minY = Math.min(box.startY, box.currentY)
  const maxY = Math.max(box.startY, box.currentY)
  
  return x >= minX && x <= maxX && y >= minY && y <= maxY
}

/**
 * Get the bounds of a selection box (normalized min/max values)
 */
export function getSelectionBoxBounds(box: SelectionBox): {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
} {
  const top = Math.min(box.startY, box.currentY)
  const bottom = Math.max(box.startY, box.currentY)
  const left = Math.min(box.startX, box.currentX)
  const right = Math.max(box.startX, box.currentX)
  
  return {
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top
  }
}

/**
 * Check if a rectangle intersects with a selection box
 */
export function rectangleIntersectsBox(
  rect: { top: number; bottom: number; left?: number; right?: number },
  box: SelectionBox
): boolean {
  const bounds = getSelectionBoxBounds(box)
  
  // Only check vertical intersection for file rows (horizontal is always full width)
  return rect.bottom > bounds.top && rect.top < bounds.bottom
}

/**
 * Get file indices that intersect with a selection box
 */
export function getFilesInSelectionBox(
  box: SelectionBox,
  getRowBounds: (index: number) => { top: number; bottom: number } | null,
  totalItems: number
): number[] {
  const selectedIndices: number[] = []
  
  for (let i = 0; i < totalItems; i++) {
    const rowBounds = getRowBounds(i)
    if (rowBounds && rectangleIntersectsBox(rowBounds, box)) {
      selectedIndices.push(i)
    }
  }
  
  return selectedIndices
}

/**
 * Create a selection box from mouse coordinates
 */
export function createSelectionBox(
  startX: number,
  startY: number,
  currentX: number = startX,
  currentY: number = startY
): SelectionBox {
  return {
    startX,
    startY,
    currentX,
    currentY
  }
}

/**
 * Update selection box with new mouse position
 */
export function updateSelectionBox(
  box: SelectionBox,
  currentX: number,
  currentY: number
): SelectionBox {
  return {
    ...box,
    currentX,
    currentY
  }
}

/**
 * Get CSS styles for rendering a selection box
 */
export function getSelectionBoxStyles(box: SelectionBox): React.CSSProperties {
  const bounds = getSelectionBoxBounds(box)
  
  return {
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
    position: 'absolute',
    pointerEvents: 'none'
  }
}
