/**
 * Path helper functions for bezier curves and waypoint calculations
 */
import type { Point } from '../types'

/**
 * Calculate the actual midpoint of a quadratic bezier curve (at t=0.5)
 */
export const getBezierMidpoint = (
  startX: number, startY: number,
  controlX: number, controlY: number,
  endX: number, endY: number
): Point => {
  // B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2
  return {
    x: 0.25 * startX + 0.5 * controlX + 0.25 * endX,
    y: 0.25 * startY + 0.5 * controlY + 0.25 * endY
  }
}

/**
 * Calculate the control point needed to make the curve pass through a given midpoint
 */
export const getControlPointFromMidpoint = (
  startX: number, startY: number,
  midX: number, midY: number,
  endX: number, endY: number
): Point => {
  // If M = 0.25*P0 + 0.5*P1 + 0.25*P2, then P1 = 2*M - 0.5*(P0 + P2)
  return {
    x: 2 * midX - 0.5 * (startX + endX),
    y: 2 * midY - 0.5 * (startY + endY)
  }
}

/**
 * Find the closest point on the path to insert a new waypoint
 */
export const findInsertionIndex = (
  waypointsList: Point[],
  start: Point,
  end: Point,
  clickPoint: Point
): number => {
  const points = [start, ...waypointsList, end]
  
  // Find which segment the click is closest to
  let bestSegment = 0
  let bestDist = Infinity
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    
    // Distance from point to line segment
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const lengthSq = dx * dx + dy * dy
    
    let t = 0
    if (lengthSq > 0) {
      t = Math.max(0, Math.min(1, ((clickPoint.x - p1.x) * dx + (clickPoint.y - p1.y) * dy) / lengthSq))
    }
    
    const projX = p1.x + t * dx
    const projY = p1.y + t * dy
    const dist = Math.hypot(clickPoint.x - projX, clickPoint.y - projY)
    
    if (dist < bestDist) {
      bestDist = dist
      bestSegment = i
    }
  }
  
  // Return the index where the new waypoint should be inserted
  return bestSegment
}
