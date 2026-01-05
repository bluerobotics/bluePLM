// Context menu and floating toolbar state management hook
import { useState, useCallback } from 'react'
import type { ContextMenuState, WaypointContextMenu, FloatingToolbarState } from '../types'

export function useContextMenuState() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [waypointContextMenu, setWaypointContextMenu] = useState<WaypointContextMenu | null>(null)
  const [floatingToolbar, setFloatingToolbar] = useState<FloatingToolbarState | null>(null)

  /**
   * Show context menu for a state
   */
  const showStateContextMenu = useCallback((
    x: number,
    y: number,
    stateId: string
  ) => {
    setContextMenu({
      x,
      y,
      type: 'state',
      targetId: stateId
    })
  }, [])

  /**
   * Show context menu for a transition
   */
  const showTransitionContextMenu = useCallback((
    x: number,
    y: number,
    transitionId: string
  ) => {
    setContextMenu({
      x,
      y,
      type: 'transition',
      targetId: transitionId
    })
  }, [])

  /**
   * Show context menu for canvas (empty space)
   */
  const showCanvasContextMenu = useCallback((
    x: number,
    y: number,
    canvasX: number,
    canvasY: number
  ) => {
    setContextMenu({
      x,
      y,
      type: 'canvas',
      targetId: '',
      canvasX,
      canvasY
    })
  }, [])

  /**
   * Close context menu
   */
  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  /**
   * Show waypoint context menu
   */
  const showWaypointContextMenu = useCallback((
    x: number,
    y: number,
    canvasX: number,
    canvasY: number,
    transitionId: string,
    waypointIndex: number | null
  ) => {
    setWaypointContextMenu({
      x,
      y,
      canvasX,
      canvasY,
      transitionId,
      waypointIndex
    })
  }, [])

  /**
   * Close waypoint context menu
   */
  const closeWaypointContextMenu = useCallback(() => {
    setWaypointContextMenu(null)
  }, [])

  /**
   * Show floating toolbar for a state
   */
  const showStateToolbar = useCallback((
    canvasX: number,
    canvasY: number,
    stateId: string
  ) => {
    setFloatingToolbar({
      canvasX,
      canvasY,
      type: 'state',
      targetId: stateId
    })
  }, [])

  /**
   * Show floating toolbar for a transition
   */
  const showTransitionToolbar = useCallback((
    canvasX: number,
    canvasY: number,
    transitionId: string
  ) => {
    setFloatingToolbar({
      canvasX,
      canvasY,
      type: 'transition',
      targetId: transitionId
    })
  }, [])

  /**
   * Close floating toolbar
   */
  const closeFloatingToolbar = useCallback(() => {
    setFloatingToolbar(null)
  }, [])

  /**
   * Close all menus and toolbars
   */
  const closeAll = useCallback(() => {
    setContextMenu(null)
    setWaypointContextMenu(null)
    setFloatingToolbar(null)
  }, [])

  return {
    // State
    contextMenu,
    waypointContextMenu,
    floatingToolbar,

    // Setters
    setContextMenu,
    setWaypointContextMenu,
    setFloatingToolbar,

    // Actions
    showStateContextMenu,
    showTransitionContextMenu,
    showCanvasContextMenu,
    closeContextMenu,
    showWaypointContextMenu,
    closeWaypointContextMenu,
    showStateToolbar,
    showTransitionToolbar,
    closeFloatingToolbar,
    closeAll
  }
}
