// Selection and hover state management hook
import { useState, useCallback } from 'react'

export interface SelectionState {
  selectedStateId: string | null
  selectedTransitionId: string | null
  hoverNodeId: string | null
  hoveredTransitionId: string | null
  hoveredStateId: string | null
  hoveredWaypoint: { transitionId: string; index: number } | null
}

export function useSelectionState() {
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null)
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null)
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [hoveredTransitionId, setHoveredTransitionId] = useState<string | null>(null)
  const [hoveredStateId, setHoveredStateId] = useState<string | null>(null)
  const [hoveredWaypoint, setHoveredWaypoint] = useState<{ transitionId: string; index: number } | null>(null)

  /**
   * Select a state (and deselect any transition)
   */
  const selectState = useCallback((stateId: string | null) => {
    setSelectedStateId(stateId)
    if (stateId) {
      setSelectedTransitionId(null)
    }
  }, [])

  /**
   * Select a transition (and deselect any state)
   */
  const selectTransition = useCallback((transitionId: string | null) => {
    setSelectedTransitionId(transitionId)
    if (transitionId) {
      setSelectedStateId(null)
    }
  }, [])

  /**
   * Clear all selection
   */
  const clearSelection = useCallback(() => {
    setSelectedStateId(null)
    setSelectedTransitionId(null)
  }, [])

  /**
   * Clear all hover states
   */
  const clearHoverStates = useCallback(() => {
    setHoverNodeId(null)
    setHoveredTransitionId(null)
    setHoveredStateId(null)
    setHoveredWaypoint(null)
  }, [])

  return {
    // State
    selectedStateId,
    selectedTransitionId,
    hoverNodeId,
    hoveredTransitionId,
    hoveredStateId,
    hoveredWaypoint,

    // Setters
    setSelectedStateId,
    setSelectedTransitionId,
    setHoverNodeId,
    setHoveredTransitionId,
    setHoveredStateId,
    setHoveredWaypoint,

    // Actions
    selectState,
    selectTransition,
    clearSelection,
    clearHoverStates
  }
}
