// Label position state management hook
import { useState, useCallback, useRef } from 'react'
import type { Point } from '../types'

export function useLabelState() {
  // Pinned label positions (absolute canvas position)
  const [pinnedLabelPositions, setPinnedLabelPositions] = useState<Record<string, Point>>({})
  
  // Label offset from curve midpoint (relative position)
  const [labelOffsets, setLabelOffsets] = useState<Record<string, Point>>({})
  
  // Dragging state
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null)
  const [tempLabelPos, setTempLabelPos] = useState<Point | null>(null)
  
  // Ref for tracking drag completion
  const justFinishedLabelDragRef = useRef(false)

  /**
   * Get label offset for a transition
   */
  const getLabelOffset = useCallback((transitionId: string): Point | null => {
    return labelOffsets[transitionId] || null
  }, [labelOffsets])

  /**
   * Get pinned label position for a transition
   */
  const getPinnedPosition = useCallback((transitionId: string): Point | null => {
    return pinnedLabelPositions[transitionId] || null
  }, [pinnedLabelPositions])

  /**
   * Update label offset for a transition
   */
  const updateLabelOffset = useCallback((transitionId: string, offset: Point) => {
    setLabelOffsets(prev => ({
      ...prev,
      [transitionId]: offset
    }))
  }, [])

  /**
   * Update pinned label position
   */
  const updatePinnedPosition = useCallback((transitionId: string, position: Point) => {
    setPinnedLabelPositions(prev => ({
      ...prev,
      [transitionId]: position
    }))
  }, [])

  /**
   * Clear label offset for a transition
   */
  const clearLabelOffset = useCallback((transitionId: string) => {
    setLabelOffsets(prev => {
      const { [transitionId]: _, ...rest } = prev
      return rest
    })
  }, [])

  /**
   * Clear pinned position for a transition
   */
  const clearPinnedPosition = useCallback((transitionId: string) => {
    setPinnedLabelPositions(prev => {
      const { [transitionId]: _, ...rest } = prev
      return rest
    })
  }, [])

  /**
   * Start dragging a label
   */
  const startLabelDrag = useCallback((transitionId: string) => {
    setDraggingLabel(transitionId)
  }, [])

  /**
   * Update temp label position during drag
   */
  const updateTempLabelPos = useCallback((pos: Point | null) => {
    setTempLabelPos(pos)
  }, [])

  /**
   * Stop dragging label
   */
  const stopLabelDrag = useCallback(() => {
    if (draggingLabel) {
      justFinishedLabelDragRef.current = true
      // Reset after a short delay
      setTimeout(() => {
        justFinishedLabelDragRef.current = false
      }, 50)
    }
    setDraggingLabel(null)
    setTempLabelPos(null)
  }, [draggingLabel])

  /**
   * Check if label drag just finished
   */
  const justFinishedDrag = useCallback(() => {
    return justFinishedLabelDragRef.current
  }, [])

  return {
    // State
    pinnedLabelPositions,
    labelOffsets,
    draggingLabel,
    tempLabelPos,

    // Setters
    setPinnedLabelPositions,
    setLabelOffsets,
    setDraggingLabel,
    setTempLabelPos,

    // Refs
    justFinishedLabelDragRef,

    // Actions
    getLabelOffset,
    getPinnedPosition,
    updateLabelOffset,
    updatePinnedPosition,
    clearLabelOffset,
    clearPinnedPosition,
    startLabelDrag,
    updateTempLabelPos,
    stopLabelDrag,
    justFinishedDrag
  }
}
