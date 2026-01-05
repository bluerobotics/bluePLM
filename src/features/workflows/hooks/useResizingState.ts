// State resizing management hook
import { useState, useCallback } from 'react'
import { DEFAULT_STATE_WIDTH, DEFAULT_STATE_HEIGHT } from '../constants'
import type { ResizingState, StateDimensions } from '../types'

export function useResizingState() {
  const [resizingState, setResizingState] = useState<ResizingState | null>(null)
  const [stateDimensions, setStateDimensions] = useState<Record<string, StateDimensions>>({})

  /**
   * Start resizing a state
   */
  const startResizing = useCallback((
    stateId: string,
    handle: ResizingState['handle'],
    mouseX: number,
    mouseY: number,
    currentWidth?: number,
    currentHeight?: number
  ) => {
    setResizingState({
      stateId,
      handle,
      startMouseX: mouseX,
      startMouseY: mouseY,
      startWidth: currentWidth || DEFAULT_STATE_WIDTH,
      startHeight: currentHeight || DEFAULT_STATE_HEIGHT
    })
  }, [])

  /**
   * Stop resizing
   */
  const stopResizing = useCallback(() => {
    setResizingState(null)
  }, [])

  /**
   * Get dimensions for a state (with defaults)
   */
  const getDimensions = useCallback((stateId: string): StateDimensions => {
    return stateDimensions[stateId] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }
  }, [stateDimensions])

  /**
   * Update dimensions for a state
   */
  const updateDimensions = useCallback((stateId: string, dimensions: StateDimensions) => {
    setStateDimensions(prev => ({
      ...prev,
      [stateId]: dimensions
    }))
  }, [])

  /**
   * Remove dimensions for a state (when deleted)
   */
  const removeDimensions = useCallback((stateId: string) => {
    setStateDimensions(prev => {
      const { [stateId]: _, ...rest } = prev
      return rest
    })
  }, [])

  return {
    // State
    resizingState,
    stateDimensions,

    // Setters
    setResizingState,
    setStateDimensions,

    // Actions
    startResizing,
    stopResizing,
    getDimensions,
    updateDimensions,
    removeDimensions,

    // Constants
    DEFAULT_STATE_WIDTH,
    DEFAULT_STATE_HEIGHT
  }
}
