// CreatingTransition component - renders the transition line while creating a new transition
import type { WorkflowState } from '../types'
import type { StateDimensions, Point } from '../types'

export interface CreatingTransitionProps {
  fromState: WorkflowState
  hoveredStateId: string | null
  states: WorkflowState[]
  mousePos: Point
  stateDimensions: Record<string, StateDimensions>
  DEFAULT_STATE_WIDTH: number
  DEFAULT_STATE_HEIGHT: number
}

export function CreatingTransition({
  fromState,
  hoveredStateId,
  states,
  mousePos,
  stateDimensions,
  DEFAULT_STATE_WIDTH,
  DEFAULT_STATE_HEIGHT
}: CreatingTransitionProps) {
  // Determine end point - snap to hovered state edge or use mouse position
  let endX = mousePos.x
  let endY = mousePos.y
  
  if (hoveredStateId && hoveredStateId !== fromState.id) {
    const hoverState = states.find(s => s.id === hoveredStateId)
    if (hoverState) {
      const hoverDims = stateDimensions[hoverState.id] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }
      // Snap end point to nearest of 4 handle positions
      const hw = hoverDims.width / 2
      const hh = hoverDims.height / 2
      const handlePositions = [
        { x: hoverState.position_x + hw, y: hoverState.position_y, edge: 'right' as const },
        { x: hoverState.position_x - hw, y: hoverState.position_y, edge: 'left' as const },
        { x: hoverState.position_x, y: hoverState.position_y - hh, edge: 'top' as const },
        { x: hoverState.position_x, y: hoverState.position_y + hh, edge: 'bottom' as const },
      ]
      let nearestHandle = handlePositions[0]
      let minDist = Infinity
      for (const hp of handlePositions) {
        const dist = Math.hypot(hp.x - mousePos.x, hp.y - mousePos.y)
        if (dist < minDist) {
          minDist = dist
          nearestHandle = hp
        }
      }
      endX = nearestHandle.x
      endY = nearestHandle.y
    }
  }
  
  // Snap start point to nearest of 4 handle positions on source box
  const fromDims = stateDimensions[fromState.id] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }
  const fhw = fromDims.width / 2
  const fhh = fromDims.height / 2
  const fromHandlePositions = [
    { x: fromState.position_x + fhw, y: fromState.position_y, edge: 'right' as const },
    { x: fromState.position_x - fhw, y: fromState.position_y, edge: 'left' as const },
    { x: fromState.position_x, y: fromState.position_y - fhh, edge: 'top' as const },
    { x: fromState.position_x, y: fromState.position_y + fhh, edge: 'bottom' as const },
  ]
  let startPoint = fromHandlePositions[0]
  let minStartDist = Infinity
  for (const hp of fromHandlePositions) {
    const dist = Math.hypot(hp.x - endX, hp.y - endY)
    if (dist < minStartDist) {
      minStartDist = dist
      startPoint = hp
    }
  }
  
  // Calculate midpoint for curved path
  const midX = (startPoint.x + endX) / 2
  const midY = (startPoint.y + endY) / 2
  const curveOffset = 30
  
  // Curve the line slightly
  let controlX = midX
  let controlY = midY - curveOffset
  
  if (startPoint.edge === 'bottom' || startPoint.edge === 'top') {
    controlX = midX + curveOffset
    controlY = midY
  }
  
  const pathD = `M ${startPoint.x} ${startPoint.y} Q ${controlX} ${controlY} ${endX} ${endY}`
  
  return (
    <path
      d={pathD}
      fill="none"
      stroke="#22c55e"
      strokeWidth="2"
      strokeDasharray="5,5"
      markerEnd="url(#arrowhead-creating)"
      className="pointer-events-none"
    />
  )
}

export default CreatingTransition
