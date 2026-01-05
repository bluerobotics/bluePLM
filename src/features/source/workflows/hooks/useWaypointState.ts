// Waypoint and curve control state management hook
import { useState, useCallback, useRef } from 'react'
import type { Point } from '../types'

export function useWaypointState() {
  // Waypoints per transition (array of points the curve passes through)
  const [waypoints, setWaypoints] = useState<Record<string, Point[]>>({})
  
  // Curve control dragging state
  const [draggingCurveControl, setDraggingCurveControl] = useState<string | null>(null)
  const [draggingWaypointIndex, setDraggingWaypointIndex] = useState<number | null>(null)
  const [draggingWaypointAxis, setDraggingWaypointAxis] = useState<'x' | 'y' | null>(null)
  const [tempCurvePos, setTempCurvePos] = useState<Point | null>(null)
  
  // Refs for drag tracking
  const waypointHasDraggedRef = useRef(false)
  const justFinishedWaypointDragRef = useRef(false)

  /**
   * Get waypoints for a transition
   */
  const getWaypoints = useCallback((transitionId: string): Point[] => {
    return waypoints[transitionId] || []
  }, [waypoints])

  /**
   * Set waypoints for a transition
   */
  const updateWaypoints = useCallback((transitionId: string, points: Point[]) => {
    setWaypoints(prev => ({
      ...prev,
      [transitionId]: points
    }))
  }, [])

  /**
   * Add a waypoint to a transition
   */
  const addWaypoint = useCallback((transitionId: string, point: Point, index?: number) => {
    setWaypoints(prev => {
      const existing = prev[transitionId] || []
      if (index !== undefined) {
        const newPoints = [...existing]
        newPoints.splice(index, 0, point)
        return { ...prev, [transitionId]: newPoints }
      }
      return { ...prev, [transitionId]: [...existing, point] }
    })
  }, [])

  /**
   * Remove a waypoint from a transition
   */
  const removeWaypoint = useCallback((transitionId: string, index: number) => {
    setWaypoints(prev => {
      const existing = prev[transitionId] || []
      const newPoints = existing.filter((_, i) => i !== index)
      return { ...prev, [transitionId]: newPoints }
    })
  }, [])

  /**
   * Clear all waypoints for a transition
   */
  const clearWaypoints = useCallback((transitionId: string) => {
    setWaypoints(prev => {
      const { [transitionId]: _, ...rest } = prev
      return rest
    })
  }, [])

  /**
   * Start dragging a waypoint
   */
  const startWaypointDrag = useCallback((
    transitionId: string,
    waypointIndex: number,
    axis?: 'x' | 'y' | null
  ) => {
    setDraggingCurveControl(transitionId)
    setDraggingWaypointIndex(waypointIndex)
    setDraggingWaypointAxis(axis || null)
    waypointHasDraggedRef.current = false
  }, [])

  /**
   * Update temp curve position during drag
   */
  const updateTempCurvePos = useCallback((pos: Point | null) => {
    setTempCurvePos(pos)
    if (pos) {
      waypointHasDraggedRef.current = true
    }
  }, [])

  /**
   * Stop dragging waypoint
   */
  const stopWaypointDrag = useCallback(() => {
    if (waypointHasDraggedRef.current) {
      justFinishedWaypointDragRef.current = true
      // Reset after a short delay
      setTimeout(() => {
        justFinishedWaypointDragRef.current = false
      }, 50)
    }
    setDraggingCurveControl(null)
    setDraggingWaypointIndex(null)
    setDraggingWaypointAxis(null)
    setTempCurvePos(null)
  }, [])

  /**
   * Check if waypoint drag just finished
   */
  const justFinishedDrag = useCallback(() => {
    return justFinishedWaypointDragRef.current
  }, [])

  return {
    // State
    waypoints,
    draggingCurveControl,
    draggingWaypointIndex,
    draggingWaypointAxis,
    tempCurvePos,

    // Setters
    setWaypoints,
    setDraggingCurveControl,
    setDraggingWaypointIndex,
    setDraggingWaypointAxis,
    setTempCurvePos,

    // Refs
    waypointHasDraggedRef,
    justFinishedWaypointDragRef,

    // Actions
    getWaypoints,
    updateWaypoints,
    addWaypoint,
    removeWaypoint,
    clearWaypoints,
    startWaypointDrag,
    updateTempCurvePos,
    stopWaypointDrag,
    justFinishedDrag
  }
}
