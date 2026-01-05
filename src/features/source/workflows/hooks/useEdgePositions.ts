// Edge position state management hook
import { useState, useCallback } from 'react'
import type { EdgePosition } from '../types'

export function useEdgePositions() {
  // Store custom edge connection points
  // Key format: "transitionId-start" or "transitionId-end"
  const [edgePositions, setEdgePositions] = useState<Record<string, EdgePosition>>({})

  /**
   * Get edge position for a transition endpoint
   */
  const getEdgePosition = useCallback((
    transitionId: string, 
    endpoint: 'start' | 'end'
  ): EdgePosition | null => {
    const key = `${transitionId}-${endpoint}`
    return edgePositions[key] || null
  }, [edgePositions])

  /**
   * Update edge position for a transition endpoint
   */
  const updateEdgePosition = useCallback((
    transitionId: string,
    endpoint: 'start' | 'end',
    position: EdgePosition
  ) => {
    const key = `${transitionId}-${endpoint}`
    setEdgePositions(prev => ({
      ...prev,
      [key]: position
    }))
  }, [])

  /**
   * Clear edge position for a transition endpoint
   */
  const clearEdgePosition = useCallback((transitionId: string, endpoint: 'start' | 'end') => {
    const key = `${transitionId}-${endpoint}`
    setEdgePositions(prev => {
      const { [key]: _, ...rest } = prev
      return rest
    })
  }, [])

  /**
   * Clear all edge positions for a transition
   */
  const clearTransitionEdges = useCallback((transitionId: string) => {
    setEdgePositions(prev => {
      const startKey = `${transitionId}-start`
      const endKey = `${transitionId}-end`
      const { [startKey]: _s, [endKey]: _e, ...rest } = prev
      return rest
    })
  }, [])

  /**
   * Get both edge positions for a transition
   */
  const getTransitionEdges = useCallback((transitionId: string): {
    start: EdgePosition | null
    end: EdgePosition | null
  } => {
    return {
      start: edgePositions[`${transitionId}-start`] || null,
      end: edgePositions[`${transitionId}-end`] || null
    }
  }, [edgePositions])

  return {
    // State
    edgePositions,

    // Setters
    setEdgePositions,

    // Actions
    getEdgePosition,
    updateEdgePosition,
    clearEdgePosition,
    clearTransitionEdges,
    getTransitionEdges
  }
}
