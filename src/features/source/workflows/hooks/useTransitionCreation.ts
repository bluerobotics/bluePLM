// Transition creation state management hook
import { useState, useCallback, useRef } from 'react'

export interface TransitionEndpointDrag {
  transitionId: string
  endpoint: 'start' | 'end'
  originalStateId: string
}

export function useTransitionCreation() {
  const [isCreatingTransition, setIsCreatingTransition] = useState(false)
  const [transitionStartId, setTransitionStartId] = useState<string | null>(null)
  const [isDraggingToCreateTransition, setIsDraggingToCreateTransition] = useState(false)
  const [draggingTransitionEndpoint, setDraggingTransitionEndpoint] = useState<TransitionEndpointDrag | null>(null)
  
  // Refs for tracking transition completion
  const justCompletedTransitionRef = useRef(false)
  const transitionCompletedAtRef = useRef<number>(0)

  /**
   * Start creating a new transition from a state
   */
  const startTransition = useCallback((fromStateId: string) => {
    setIsCreatingTransition(true)
    setTransitionStartId(fromStateId)
  }, [])

  /**
   * Start drag-to-connect transition creation
   */
  const startDragToConnect = useCallback((fromStateId: string) => {
    setIsCreatingTransition(true)
    setTransitionStartId(fromStateId)
    setIsDraggingToCreateTransition(true)
  }, [])

  /**
   * Cancel transition creation
   */
  const cancelTransitionCreation = useCallback(() => {
    setIsCreatingTransition(false)
    setTransitionStartId(null)
    setIsDraggingToCreateTransition(false)
  }, [])

  /**
   * Mark transition as completed (to prevent click events)
   */
  const markTransitionCompleted = useCallback(() => {
    justCompletedTransitionRef.current = true
    transitionCompletedAtRef.current = Date.now()
    setIsCreatingTransition(false)
    setTransitionStartId(null)
    setIsDraggingToCreateTransition(false)
  }, [])

  /**
   * Start dragging an existing transition endpoint
   */
  const startEndpointDrag = useCallback((transitionId: string, endpoint: 'start' | 'end', originalStateId: string) => {
    setDraggingTransitionEndpoint({ transitionId, endpoint, originalStateId })
  }, [])

  /**
   * End endpoint drag
   */
  const endEndpointDrag = useCallback(() => {
    setDraggingTransitionEndpoint(null)
  }, [])

  /**
   * Check if transition was just completed (within 100ms)
   */
  const wasJustCompleted = useCallback(() => {
    return justCompletedTransitionRef.current && (Date.now() - transitionCompletedAtRef.current < 100)
  }, [])

  /**
   * Reset the just-completed flag
   */
  const resetCompletedFlag = useCallback(() => {
    justCompletedTransitionRef.current = false
  }, [])

  return {
    // State
    isCreatingTransition,
    transitionStartId,
    isDraggingToCreateTransition,
    draggingTransitionEndpoint,

    // Setters
    setIsCreatingTransition,
    setTransitionStartId,
    setIsDraggingToCreateTransition,
    setDraggingTransitionEndpoint,

    // Refs
    justCompletedTransitionRef,
    transitionCompletedAtRef,

    // Actions
    startTransition,
    startDragToConnect,
    cancelTransitionCreation,
    markTransitionCompleted,
    startEndpointDrag,
    endEndpointDrag,
    wasJustCompleted,
    resetCompletedFlag
  }
}
