// State dragging management hook
import { useState, useCallback, useRef } from 'react'
import { DRAG_THRESHOLD } from '../constants'

export interface DragState {
  draggingStateId: string | null
  dragOffset: { x: number; y: number }
}

export function useDraggingState() {
  const [draggingStateId, setDraggingStateId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  
  // Refs for drag tracking
  const hasDraggedRef = useRef(false)
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)

  /**
   * Start dragging a state
   */
  const startDragging = useCallback((
    stateId: string, 
    offsetX: number, 
    offsetY: number,
    clientX: number,
    clientY: number
  ) => {
    setDraggingStateId(stateId)
    setDragOffset({ x: offsetX, y: offsetY })
    hasDraggedRef.current = false
    dragStartPosRef.current = { x: clientX, y: clientY }
  }, [])

  /**
   * Stop dragging
   */
  const stopDragging = useCallback(() => {
    setDraggingStateId(null)
    setDragOffset({ x: 0, y: 0 })
    dragStartPosRef.current = null
  }, [])

  /**
   * Check if movement exceeds drag threshold
   */
  const checkDragThreshold = useCallback((clientX: number, clientY: number): boolean => {
    if (!dragStartPosRef.current) return false
    
    const dx = clientX - dragStartPosRef.current.x
    const dy = clientY - dragStartPosRef.current.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    return distance >= DRAG_THRESHOLD
  }, [])

  /**
   * Mark that actual dragging has occurred
   */
  const markHasDragged = useCallback(() => {
    hasDraggedRef.current = true
  }, [])

  /**
   * Check if actual dragging occurred
   */
  const didDrag = useCallback(() => {
    return hasDraggedRef.current
  }, [])

  /**
   * Reset drag tracking
   */
  const resetDragTracking = useCallback(() => {
    hasDraggedRef.current = false
  }, [])

  return {
    // State
    draggingStateId,
    dragOffset,

    // Setters
    setDraggingStateId,
    setDragOffset,

    // Refs
    hasDraggedRef,
    dragStartPosRef,

    // Actions
    startDragging,
    stopDragging,
    checkDragThreshold,
    markHasDragged,
    didDrag,
    resetDragTracking,
    
    // Constants
    DRAG_THRESHOLD
  }
}
