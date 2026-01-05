// Transition handles component - renders draggable handles for transition endpoints, waypoints, and labels
import type { 
  WorkflowState, 
  WorkflowTransition 
} from '@/types/workflow'
import { getClosestPointOnBox, getPointFromEdgePosition, getPointOnSpline } from '../utils'
import type { 
  EdgePosition,
  TransitionEndpointDrag,
  WaypointContextMenu
} from '../types'

interface TransitionHandlesProps {
  transitions: WorkflowTransition[]
  states: WorkflowState[]
  isAdmin: boolean
  selectedTransitionId: string | null
  
  // Edge positions
  edgePositions: Record<string, EdgePosition>
  
  // Waypoints
  waypoints: Record<string, Array<{ x: number; y: number }>>
  
  // Label positions
  labelOffsets: Record<string, { x: number; y: number }>
  pinnedLabelPositions: Record<string, { x: number; y: number }>
  
  // Dragging states
  draggingTransitionEndpoint: TransitionEndpointDrag | null
  draggingCurveControl: string | null
  draggingWaypointIndex: number | null
  draggingLabel: string | null
  tempCurvePos: { x: number; y: number } | null
  tempLabelPos: { x: number; y: number } | null
  
  // Hover state
  hoveredWaypoint: { transitionId: string; index: number } | null
  
  // Refs
  waypointHasDraggedRef: React.MutableRefObject<boolean>
  
  // Setters
  setFloatingToolbar: (toolbar: any) => void
  setDraggingTransitionEndpoint: (endpoint: TransitionEndpointDrag | null) => void
  setDraggingCurveControl: (id: string | null) => void
  setDraggingWaypointIndex: (index: number | null) => void
  setDraggingWaypointAxis: (axis: 'x' | 'y' | null) => void
  setTempCurvePos: (pos: { x: number; y: number } | null) => void
  setDraggingLabel: (id: string | null) => void
  setTempLabelPos: (pos: { x: number; y: number } | null) => void
  setHoveredWaypoint: (waypoint: { transitionId: string; index: number } | null) => void
  setWaypoints: React.Dispatch<React.SetStateAction<Record<string, Array<{ x: number; y: number }>>>>
  setWaypointContextMenu: (menu: WaypointContextMenu | null) => void
  setSelectedTransitionId: (id: string | null) => void
  setSelectedStateId: (id: string | null) => void
  setLabelOffsets: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number }>>>
  setPinnedLabelPositions: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number }>>>
  
  // Notifications
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void
}

export function TransitionHandles({
  transitions,
  states,
  isAdmin,
  selectedTransitionId,
  edgePositions,
  waypoints,
  labelOffsets,
  pinnedLabelPositions,
  draggingTransitionEndpoint,
  draggingCurveControl,
  draggingWaypointIndex,
  draggingLabel,
  tempCurvePos,
  tempLabelPos,
  hoveredWaypoint,
  waypointHasDraggedRef,
  setFloatingToolbar,
  setDraggingTransitionEndpoint,
  setDraggingCurveControl,
  setDraggingWaypointIndex,
  setDraggingWaypointAxis,
  setTempCurvePos,
  setDraggingLabel,
  setTempLabelPos,
  setHoveredWaypoint,
  setWaypoints,
  setWaypointContextMenu,
  setSelectedTransitionId,
  setSelectedStateId,
  setLabelOffsets,
  setPinnedLabelPositions,
  addToast
}: TransitionHandlesProps) {
  if (!isAdmin) return null
  
  return (
    <>
      {transitions.map(transition => {
        const fromState = states.find(s => s.id === transition.from_state_id)
        const toState = states.find(s => s.id === transition.to_state_id)
        if (!fromState || !toState) return null
        
        const isSelected = selectedTransitionId === transition.id
        const isDraggingThis = draggingTransitionEndpoint?.transitionId === transition.id
        
        // Only show handles when selected and not currently dragging this transition
        if (!isSelected || isDraggingThis) return null
        
        // Check for stored edge positions
        const storedStartPos = edgePositions[`${transition.id}-start`]
        const storedEndPos = edgePositions[`${transition.id}-end`]
        
        // Calculate handle positions (use stored or default)
        const defaultStartPoint = getClosestPointOnBox(
          fromState.position_x, fromState.position_y,
          toState.position_x, toState.position_y
        )
        const defaultEndPoint = getClosestPointOnBox(
          toState.position_x, toState.position_y,
          fromState.position_x, fromState.position_y
        )
        
        const startPoint = storedStartPos 
          ? { ...getPointFromEdgePosition(fromState.position_x, fromState.position_y, storedStartPos), edge: storedStartPos.edge }
          : defaultStartPoint
        const endPoint = storedEndPos
          ? { ...getPointFromEdgePosition(toState.position_x, toState.position_y, storedEndPos), edge: storedEndPos.edge }
          : defaultEndPoint
        
        // Get path type and waypoints for this transition
        const pathType = transition.line_path_type || 'spline'
        const transitionWaypoints = waypoints[transition.id] || []
        const lineMidX = (startPoint.x + endPoint.x) / 2
        const lineMidY = (startPoint.y + endPoint.y) / 2
        
        // Calculate curve midpoint for label positioning
        const curveMid = pathType === 'spline' 
          ? getPointOnSpline(
              { x: startPoint.x, y: startPoint.y, edge: startPoint.edge },
              transitionWaypoints,
              { x: endPoint.x, y: endPoint.y, edge: endPoint.edge },
              0.5
            )
          : { x: lineMidX, y: lineMidY }
        const curveMidX = curveMid.x
        const curveMidY = curveMid.y
        
        // Label position
        const storedLabelOffset = labelOffsets[transition.id]
        const labelX = storedLabelOffset ? lineMidX + storedLabelOffset.x : curveMidX
        const labelY = storedLabelOffset ? lineMidY + storedLabelOffset.y : curveMidY - 20
        const isDraggingThisLabel = draggingLabel === transition.id
        const actualLabelX = isDraggingThisLabel && tempLabelPos ? tempLabelPos.x : labelX
        const actualLabelY = isDraggingThisLabel && tempLabelPos ? tempLabelPos.y : labelY
        
        return (
          <g key={`handles-${transition.id}`}>
            {/* Start handle */}
            <g
              transform={`translate(${startPoint.x}, ${startPoint.y})`}
              className="cursor-grab"
              style={{ pointerEvents: 'all' }}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setFloatingToolbar(null)
                setDraggingTransitionEndpoint({
                  transitionId: transition.id,
                  endpoint: 'start',
                  originalStateId: transition.from_state_id
                })
              }}
            >
              <circle r="12" fill="transparent" />
              <circle
                r="5"
                fill="#60a5fa"
                stroke="#fff"
                strokeWidth="1.5"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
              />
              <title>Drag to reconnect start</title>
            </g>
            
            {/* Waypoint handles */}
            {transitionWaypoints.map((waypoint, index) => {
              const isDraggingThisWaypoint = draggingCurveControl === transition.id && draggingWaypointIndex === index
              const wpX = isDraggingThisWaypoint && tempCurvePos ? tempCurvePos.x : waypoint.x
              const wpY = isDraggingThisWaypoint && tempCurvePos ? tempCurvePos.y : waypoint.y
              const isHovered = hoveredWaypoint?.transitionId === transition.id && hoveredWaypoint?.index === index
              // Elbow paths: constrain movement to perpendicular axis
              const isElbow = pathType === 'elbow'
              const cursor = isElbow ? 'move' : 'move'
              return { wpX, wpY, index, isDraggingThisWaypoint, isHovered, isVertical: false, freeMove: true, cursor }
            }).map(({ wpX, wpY, index, isDraggingThisWaypoint, isHovered, cursor }) => (
              <g
                key={`waypoint-${index}`}
                transform={`translate(${wpX}, ${wpY})`}
                style={{ pointerEvents: 'all', cursor }}
                onMouseEnter={() => setHoveredWaypoint({ transitionId: transition.id, index })}
                onMouseLeave={() => setHoveredWaypoint(null)}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setFloatingToolbar(null)
                  setWaypointContextMenu(null)
                  setDraggingCurveControl(transition.id)
                  setDraggingWaypointIndex(index)
                  setDraggingWaypointAxis(null)
                  setTempCurvePos({ x: wpX, y: wpY })
                  waypointHasDraggedRef.current = false
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  if (!waypointHasDraggedRef.current) {
                    setWaypoints(prev => {
                      const currentWaypoints = [...(prev[transition.id] || [])]
                      currentWaypoints.splice(index, 1)
                      if (currentWaypoints.length === 0) {
                        const next = { ...prev }
                        delete next[transition.id]
                        return next
                      }
                      return { ...prev, [transition.id]: currentWaypoints }
                    })
                    addToast('info', 'Control point removed')
                  }
                }}
                onContextMenu={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setWaypointContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    canvasX: wpX,
                    canvasY: wpY,
                    transitionId: transition.id,
                    waypointIndex: index
                  })
                }}
              >
                <circle r="12" fill="transparent" />
                {isHovered && !isDraggingThisWaypoint && (
                  <circle r="9" fill="none" stroke="#60a5fa" strokeWidth="2" opacity="0.4" />
                )}
                <circle
                  r="5"
                  fill={isDraggingThisWaypoint ? '#60a5fa' : (isHovered ? '#f0f0f0' : '#ffffff')}
                  stroke="#60a5fa"
                  strokeWidth={isHovered || isDraggingThisWaypoint ? 2.5 : 2}
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
                />
                <title>Drag to adjust • Double-click or right-click to remove</title>
              </g>
            ))}
            
            {/* Add waypoint hint */}
            {(pathType === 'spline' || pathType === 'elbow') && transitionWaypoints.length === 0 && (
              <g transform={`translate(${curveMidX}, ${curveMidY})`} className="pointer-events-none">
                <circle
                  r="5"
                  fill="rgba(255, 255, 255, 0.3)"
                  stroke={`${transition.line_color || '#6b7280'}80`}
                  strokeWidth="2"
                  strokeDasharray="2,2"
                />
                <title>Double-click or right-click to add control point</title>
              </g>
            )}
            
            {/* Label handle */}
            {transition.name && (() => {
              const isPinned = !!pinnedLabelPositions[transition.id]
              const textWidth = transition.name.length * 7
              const pinAreaWidth = 18
              const padding = 8
              const totalWidth = textWidth + padding * 2 + pinAreaWidth
              const labelStartX = -totalWidth / 2
              const textCenterX = labelStartX + padding + textWidth / 2
              const pinCenterX = labelStartX + textWidth + padding * 1.5 + pinAreaWidth / 2
              
              return (
                <g transform={`translate(${actualLabelX}, ${actualLabelY})`} style={{ pointerEvents: 'all' }}>
                  <rect
                    x={labelStartX}
                    y="-10"
                    width={totalWidth}
                    height="18"
                    rx="4"
                    fill="rgba(31, 41, 55, 0.95)"
                    stroke={isDraggingThisLabel ? '#60a5fa' : isPinned ? 'rgba(96, 165, 250, 0.8)' : 'rgba(96, 165, 250, 0.6)'}
                    strokeWidth={isDraggingThisLabel ? 2 : isPinned ? 1.5 : 1}
                    style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' }}
                    className="cursor-move"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setDraggingLabel(transition.id)
                      setTempLabelPos({ x: actualLabelX, y: actualLabelY })
                      setSelectedTransitionId(transition.id)
                      setSelectedStateId(null)
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setLabelOffsets(prev => {
                        const next = { ...prev }
                        delete next[transition.id]
                        return next
                      })
                      setPinnedLabelPositions(prev => {
                        const next = { ...prev }
                        delete next[transition.id]
                        return next
                      })
                      addToast('info', 'Label position reset')
                    }}
                  />
                  
                  <line
                    x1={pinCenterX - pinAreaWidth / 2 - 1}
                    y1="-6"
                    x2={pinCenterX - pinAreaWidth / 2 - 1}
                    y2="6"
                    stroke="rgba(75, 85, 99, 0.4)"
                    strokeWidth="1"
                  />
                  
                  <text
                    x={textCenterX}
                    y="3"
                    textAnchor="middle"
                    fontSize="10"
                    fill="#d1d5db"
                    className="select-none pointer-events-none"
                  >
                    {transition.name}
                  </text>
                  
                  <g
                    transform={`translate(${pinCenterX}, 0)`}
                    className="cursor-pointer"
                    style={{ pointerEvents: 'all' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isPinned) {
                        setPinnedLabelPositions(prev => {
                          const next = { ...prev }
                          delete next[transition.id]
                          return next
                        })
                      } else {
                        setPinnedLabelPositions(prev => ({
                          ...prev,
                          [transition.id]: { x: actualLabelX, y: actualLabelY }
                        }))
                      }
                    }}
                  >
                    <rect
                      x="-7"
                      y="-7"
                      width="14"
                      height="14"
                      rx="2"
                      fill={isPinned ? 'rgba(96, 165, 250, 0.3)' : 'transparent'}
                      className="hover:fill-[rgba(96,165,250,0.2)]"
                    />
                    <g transform="translate(-5, -5) scale(0.42)">
                      <path 
                        d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1h.5a.5.5 0 0 0 0-1h-9a.5.5 0 0 0 0 1H8a1 1 0 0 1 1 1z"
                        fill="none"
                        stroke={isPinned ? '#60a5fa' : '#9ca3af'}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                    <title>{isPinned ? 'Unpin (label will follow line)' : 'Pin label to canvas'}</title>
                  </g>
                  
                  <title>Drag to move label (double-click to reset)</title>
                </g>
              )
            })()}
            
            {/* End handle */}
            <g
              transform={`translate(${endPoint.x}, ${endPoint.y})`}
              className="cursor-grab"
              style={{ pointerEvents: 'all' }}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setFloatingToolbar(null)
                setDraggingTransitionEndpoint({
                  transitionId: transition.id,
                  endpoint: 'end',
                  originalStateId: transition.to_state_id
                })
              }}
            >
              <circle r="12" fill="transparent" />
              <circle
                r="5"
                fill="#22c55e"
                stroke="#fff"
                strokeWidth="1.5"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
              />
              <title>Drag to reconnect end</title>
            </g>
          </g>
        )
      })}
    </>
  )
}
