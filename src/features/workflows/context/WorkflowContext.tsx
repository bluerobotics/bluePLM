/**
 * WorkflowContext - Provides centralized state for the workflow editor
 * 
 * Eliminates prop drilling through 10+ component levels by providing
 * all workflow data, selection state, and actions through React Context.
 */
import { 
  createContext, 
  useContext, 
  useState, 
  useRef, 
  useMemo, 
  useCallback,
  type ReactNode,
  type RefObject
} from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { MIN_ZOOM, MAX_ZOOM } from '../constants'
import type { 
  WorkflowTemplate, 
  WorkflowState, 
  WorkflowTransition, 
  WorkflowGate,
  CanvasMode,
  SnapSettings,
  AlignmentGuides,
  ContextMenuState,
  WaypointContextMenu,
  FloatingToolbarState,
  Point,
  EdgePosition,
  StateDimensions,
  ResizingState,
  TransitionEndpointDrag,
  SnappingResult
} from '../types'

// ==============================================
// Context Value Interface
// ==============================================

export interface WorkflowContextValue {
  // ---- Core Data ----
  workflows: WorkflowTemplate[]
  selectedWorkflow: WorkflowTemplate | null
  states: WorkflowState[]
  transitions: WorkflowTransition[]
  gates: Record<string, WorkflowGate[]>
  isLoading: boolean
  isAdmin: boolean
  
  // Data setters for optimistic updates
  setStates: React.Dispatch<React.SetStateAction<WorkflowState[]>>
  setTransitions: React.Dispatch<React.SetStateAction<WorkflowTransition[]>>
  setGates: React.Dispatch<React.SetStateAction<Record<string, WorkflowGate[]>>>
  setSelectedWorkflow: React.Dispatch<React.SetStateAction<WorkflowTemplate | null>>
  
  // ---- Canvas State ----
  canvasMode: CanvasMode
  zoom: number
  pan: Point
  mousePos: Point
  canvasRef: RefObject<HTMLDivElement | null>
  
  setCanvasMode: (mode: CanvasMode) => void
  setZoom: (zoom: number) => void
  setPan: (pan: Point) => void
  handleWheel: (e: React.WheelEvent) => void
  centerOnContent: (states: WorkflowState[]) => void
  screenToCanvas: (screenX: number, screenY: number) => Point
  canvasToScreen: (canvasX: number, canvasY: number) => Point
  
  // ---- Selection State ----
  selectedStateId: string | null
  selectedTransitionId: string | null
  hoveredStateId: string | null
  hoveredTransitionId: string | null
  hoveredWaypoint: { transitionId: string; waypointIndex: number } | null
  
  selectState: (id: string | null) => void
  selectTransition: (id: string | null) => void
  setHoveredStateId: (id: string | null) => void
  setHoveredTransitionId: (id: string | null) => void
  setHoveredWaypoint: (waypoint: { transitionId: string; waypointIndex: number } | null) => void
  clearSelection: () => void
  
  // ---- Dragging State ----
  draggingStateId: string | null
  dragOffset: Point
  hasDraggedRef: RefObject<boolean>
  dragStartPosRef: RefObject<Point | null>
  
  setDraggingStateId: (id: string | null) => void
  setDragOffset: (offset: Point) => void
  startDragging: (stateId: string, offsetX: number, offsetY: number, clientX: number, clientY: number) => void
  stopDragging: () => void
  checkDragThreshold: (clientX: number, clientY: number) => boolean
  markHasDragged: () => void
  
  // ---- Resizing State ----
  resizingState: ResizingState | null
  stateDimensions: Record<string, StateDimensions>
  
  setResizingState: (state: ResizingState | null) => void
  startResizing: (stateId: string, handle: ResizingState['handle'], mouseX: number, mouseY: number, width: number, height: number) => void
  stopResizing: () => void
  getDimensions: (stateId: string) => StateDimensions
  updateDimensions: (stateId: string, dims: StateDimensions) => void
  
  // ---- Transition Creation ----
  isCreatingTransition: boolean
  transitionStartId: string | null
  isDraggingToCreateTransition: boolean
  draggingTransitionEndpoint: TransitionEndpointDrag | null
  justCompletedTransitionRef: RefObject<boolean>
  transitionCompletedAtRef: RefObject<number>
  
  setIsCreatingTransition: (creating: boolean) => void
  setTransitionStartId: (id: string | null) => void
  setIsDraggingToCreateTransition: (dragging: boolean) => void
  setDraggingTransitionEndpoint: (endpoint: TransitionEndpointDrag | null) => void
  cancelTransitionCreation: () => void
  
  // ---- Waypoint State ----
  waypoints: Record<string, Point[]>
  draggingCurveControl: string | null
  draggingWaypointIndex: number | null
  draggingWaypointAxis: 'x' | 'y' | null
  tempCurvePos: Point | null
  waypointHasDraggedRef: RefObject<boolean>
  
  setWaypoints: React.Dispatch<React.SetStateAction<Record<string, Point[]>>>
  setDraggingCurveControl: (transitionId: string | null) => void
  setDraggingWaypointIndex: (index: number | null) => void
  setDraggingWaypointAxis: (axis: 'x' | 'y' | null) => void
  setTempCurvePos: (pos: Point | null) => void
  addWaypoint: (transitionId: string, point: Point, insertIndex?: number) => void
  stopWaypointDrag: () => void
  
  // ---- Label State ----
  labelOffsets: Record<string, Point>
  pinnedLabelPositions: Record<string, Point>
  draggingLabel: string | null
  tempLabelPos: Point | null
  
  setLabelOffsets: React.Dispatch<React.SetStateAction<Record<string, Point>>>
  setPinnedLabelPositions: React.Dispatch<React.SetStateAction<Record<string, Point>>>
  setDraggingLabel: (transitionId: string | null) => void
  setTempLabelPos: (pos: Point | null) => void
  stopLabelDrag: () => void
  
  // ---- Edge Positions ----
  edgePositions: Record<string, { start: EdgePosition | null; end: EdgePosition | null }>
  setEdgePositions: React.Dispatch<React.SetStateAction<Record<string, { start: EdgePosition | null; end: EdgePosition | null }>>>
  updateEdgePosition: (transitionId: string, endpoint: 'start' | 'end', position: EdgePosition) => void
  
  // ---- Snap Settings ----
  snapSettings: SnapSettings
  showSnapSettings: boolean
  alignmentGuides: AlignmentGuides
  
  setSnapSettings: React.Dispatch<React.SetStateAction<SnapSettings>>
  setShowSnapSettings: (show: boolean) => void
  setAlignmentGuides: (guides: AlignmentGuides) => void
  clearAlignmentGuides: () => void
  applySnapping: (stateId: string, x: number, y: number) => SnappingResult
  
  // ---- Context Menus ----
  contextMenu: ContextMenuState | null
  waypointContextMenu: WaypointContextMenu | null
  floatingToolbar: FloatingToolbarState | null
  
  setContextMenu: (menu: ContextMenuState | null) => void
  setWaypointContextMenu: (menu: WaypointContextMenu | null) => void
  setFloatingToolbar: (toolbar: FloatingToolbarState | null) => void
  showStateToolbar: (x: number, y: number, stateId: string) => void
  showTransitionToolbar: (x: number, y: number, transitionId: string) => void
  closeContextMenu: () => void
  closeAll: () => void
  
  // ---- Dialogs ----
  showCreateWorkflow: boolean
  showEditWorkflow: boolean
  showEditState: boolean
  showEditTransition: boolean
  editingState: WorkflowState | null
  editingTransition: WorkflowTransition | null
  
  setShowCreateWorkflow: (show: boolean) => void
  setShowEditWorkflow: (show: boolean) => void
  setShowEditState: (show: boolean) => void
  setShowEditTransition: (show: boolean) => void
  setEditingState: (state: WorkflowState | null) => void
  setEditingTransition: (transition: WorkflowTransition | null) => void
  openEditState: (state: WorkflowState) => void
  closeEditState: () => void
  openEditTransition: (transition: WorkflowTransition) => void
  closeEditTransition: () => void
  
  // ---- Undo/Redo ----
  clipboard: { type: 'state' | 'transition'; data: unknown } | null
  setClipboard: (data: { type: 'state' | 'transition'; data: unknown } | null) => void
  
  // ---- Utility ----
  addToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
}

// ==============================================
// Context Creation
// ==============================================

const WorkflowContext = createContext<WorkflowContextValue | null>(null)

// ==============================================
// Provider Props
// ==============================================

export interface WorkflowProviderProps {
  children: ReactNode
  // Core data - managed externally by useWorkflowData hook
  workflows: WorkflowTemplate[]
  selectedWorkflow: WorkflowTemplate | null
  states: WorkflowState[]
  transitions: WorkflowTransition[]
  gates: Record<string, WorkflowGate[]>
  isLoading: boolean
  isAdmin: boolean
  setStates: React.Dispatch<React.SetStateAction<WorkflowState[]>>
  setTransitions: React.Dispatch<React.SetStateAction<WorkflowTransition[]>>
  setGates: React.Dispatch<React.SetStateAction<Record<string, WorkflowGate[]>>>
  setSelectedWorkflow: React.Dispatch<React.SetStateAction<WorkflowTemplate | null>>
}

// ==============================================
// Constants
// ==============================================

const DEFAULT_STATE_WIDTH = 120
const DEFAULT_STATE_HEIGHT = 50
const DRAG_THRESHOLD = 5 // pixels before considering it a drag

// ==============================================
// Provider Component
// ==============================================

export function WorkflowProvider({
  children,
  workflows,
  selectedWorkflow,
  states,
  transitions,
  gates,
  isLoading,
  isAdmin,
  setStates,
  setTransitions,
  setGates,
  setSelectedWorkflow
}: WorkflowProviderProps) {
  const { addToast } = usePDMStore()
  
  // ---- Canvas State ----
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('select')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [mousePos] = useState<Point>({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)
  
  // ---- Selection State ----
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null)
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null)
  const [hoveredStateId, setHoveredStateId] = useState<string | null>(null)
  const [hoveredTransitionId, setHoveredTransitionId] = useState<string | null>(null)
  const [hoveredWaypoint, setHoveredWaypoint] = useState<{ transitionId: string; waypointIndex: number } | null>(null)
  
  const selectState = useCallback((id: string | null) => {
    setSelectedStateId(id)
    setSelectedTransitionId(null)
  }, [])
  
  const selectTransition = useCallback((id: string | null) => {
    setSelectedTransitionId(id)
    setSelectedStateId(null)
  }, [])
  
  const clearSelection = useCallback(() => {
    setSelectedStateId(null)
    setSelectedTransitionId(null)
  }, [])
  
  // ---- Dragging State ----
  const [draggingStateId, setDraggingStateId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 })
  const hasDraggedRef = useRef(false)
  const dragStartPosRef = useRef<Point | null>(null)
  
  const startDragging = useCallback((stateId: string, offsetX: number, offsetY: number, clientX: number, clientY: number) => {
    setDraggingStateId(stateId)
    setDragOffset({ x: offsetX, y: offsetY })
    hasDraggedRef.current = false
    dragStartPosRef.current = { x: clientX, y: clientY }
  }, [])
  
  const stopDragging = useCallback(() => {
    setDraggingStateId(null)
    hasDraggedRef.current = false
    dragStartPosRef.current = null
  }, [])
  
  const checkDragThreshold = useCallback((clientX: number, clientY: number) => {
    if (!dragStartPosRef.current) return false
    const dx = clientX - dragStartPosRef.current.x
    const dy = clientY - dragStartPosRef.current.y
    return Math.hypot(dx, dy) > DRAG_THRESHOLD
  }, [])
  
  const markHasDragged = useCallback(() => {
    hasDraggedRef.current = true
  }, [])
  
  // ---- Resizing State ----
  const [resizingState, setResizingState] = useState<ResizingState | null>(null)
  const [stateDimensions, setStateDimensions] = useState<Record<string, StateDimensions>>({})
  
  const startResizing = useCallback((
    stateId: string, 
    handle: ResizingState['handle'], 
    mouseX: number, 
    mouseY: number, 
    width: number, 
    height: number
  ) => {
    setResizingState({
      stateId,
      handle,
      startMouseX: mouseX,
      startMouseY: mouseY,
      startWidth: width,
      startHeight: height
    })
  }, [])
  
  const stopResizing = useCallback(() => {
    setResizingState(null)
  }, [])
  
  const getDimensions = useCallback((stateId: string): StateDimensions => {
    return stateDimensions[stateId] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }
  }, [stateDimensions])
  
  const updateDimensions = useCallback((stateId: string, dims: StateDimensions) => {
    setStateDimensions(prev => ({ ...prev, [stateId]: dims }))
  }, [])
  
  // ---- Transition Creation ----
  const [isCreatingTransition, setIsCreatingTransition] = useState(false)
  const [transitionStartId, setTransitionStartId] = useState<string | null>(null)
  const [isDraggingToCreateTransition, setIsDraggingToCreateTransition] = useState(false)
  const [draggingTransitionEndpoint, setDraggingTransitionEndpoint] = useState<TransitionEndpointDrag | null>(null)
  const justCompletedTransitionRef = useRef(false)
  const transitionCompletedAtRef = useRef(0)
  
  const cancelTransitionCreation = useCallback(() => {
    setIsCreatingTransition(false)
    setTransitionStartId(null)
    setIsDraggingToCreateTransition(false)
    setHoveredStateId(null)
  }, [])
  
  // ---- Waypoint State ----
  const [waypoints, setWaypoints] = useState<Record<string, Point[]>>({})
  const [draggingCurveControl, setDraggingCurveControl] = useState<string | null>(null)
  const [draggingWaypointIndex, setDraggingWaypointIndex] = useState<number | null>(null)
  const [draggingWaypointAxis, setDraggingWaypointAxis] = useState<'x' | 'y' | null>(null)
  const [tempCurvePos, setTempCurvePos] = useState<Point | null>(null)
  const waypointHasDraggedRef = useRef(false)
  
  const addWaypoint = useCallback((transitionId: string, point: Point, insertIndex?: number) => {
    setWaypoints(prev => {
      const current = prev[transitionId] || []
      const newWaypoints = [...current]
      if (insertIndex !== undefined) {
        newWaypoints.splice(insertIndex, 0, point)
      } else {
        newWaypoints.push(point)
      }
      return { ...prev, [transitionId]: newWaypoints }
    })
  }, [])
  
  const stopWaypointDrag = useCallback(() => {
    setDraggingCurveControl(null)
    setDraggingWaypointIndex(null)
    setDraggingWaypointAxis(null)
    setTempCurvePos(null)
    waypointHasDraggedRef.current = false
  }, [])
  
  // ---- Label State ----
  const [labelOffsets, setLabelOffsets] = useState<Record<string, Point>>({})
  const [pinnedLabelPositions, setPinnedLabelPositions] = useState<Record<string, Point>>({})
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null)
  const [tempLabelPos, setTempLabelPos] = useState<Point | null>(null)
  
  const stopLabelDrag = useCallback(() => {
    setDraggingLabel(null)
    setTempLabelPos(null)
  }, [])
  
  // ---- Edge Positions ----
  const [edgePositions, setEdgePositions] = useState<Record<string, { start: EdgePosition | null; end: EdgePosition | null }>>({})
  
  const updateEdgePosition = useCallback((transitionId: string, endpoint: 'start' | 'end', position: EdgePosition) => {
    setEdgePositions(prev => ({
      ...prev,
      [transitionId]: {
        ...prev[transitionId],
        [endpoint]: position
      }
    }))
  }, [])
  
  // ---- Snap Settings ----
  const [snapSettings, setSnapSettings] = useState<SnapSettings>({
    gridSize: 20,
    snapToGrid: false,
    snapToAlignment: true,
    alignmentThreshold: 8
  })
  const [showSnapSettings, setShowSnapSettings] = useState(false)
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({ vertical: null, horizontal: null })
  
  const clearAlignmentGuides = useCallback(() => {
    setAlignmentGuides({ vertical: null, horizontal: null })
  }, [])
  
  // Snapping function
  const applySnapping = useCallback((
    currentStateId: string,
    rawX: number,
    rawY: number
  ): SnappingResult => {
    let x = rawX
    let y = rawY
    let verticalGuide: number | null = null
    let horizontalGuide: number | null = null
    
    // First apply grid snapping
    if (snapSettings.snapToGrid) {
      const gridSize = snapSettings.gridSize
      x = Math.round(x / gridSize) * gridSize
      y = Math.round(y / gridSize) * gridSize
    }
    
    // Then check alignment with other states (takes priority over grid)
    if (snapSettings.snapToAlignment) {
      const threshold = snapSettings.alignmentThreshold
      
      for (const state of states) {
        if (state.id === currentStateId) continue
        
        // Check vertical alignment (same X coordinate)
        if (Math.abs(state.position_x - x) <= threshold) {
          x = state.position_x
          verticalGuide = state.position_x
        }
        
        // Check horizontal alignment (same Y coordinate)
        if (Math.abs(state.position_y - y) <= threshold) {
          y = state.position_y
          horizontalGuide = state.position_y
        }
      }
    }
    
    return { x, y, verticalGuide, horizontalGuide }
  }, [states, snapSettings])
  
  // ---- Canvas Interaction Functions ----
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    
    // Mouse position relative to canvas element
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    // Calculate new zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomFactor))
    
    // Calculate the point in canvas coordinates that should stay under the mouse
    const canvasX = (mouseX - pan.x) / zoom
    const canvasY = (mouseY - pan.y) / zoom
    
    const newPanX = mouseX - canvasX * newZoom
    const newPanY = mouseY - canvasY * newZoom
    
    setZoom(newZoom)
    setPan({ x: newPanX, y: newPanY })
  }, [zoom, pan])
  
  const centerOnContent = useCallback((contentStates: WorkflowState[]) => {
    if (contentStates.length === 0) return
    
    const minX = Math.min(...contentStates.map(s => s.position_x))
    const maxX = Math.max(...contentStates.map(s => s.position_x))
    const minY = Math.min(...contentStates.map(s => s.position_y))
    const maxY = Math.max(...contentStates.map(s => s.position_y))
    
    const contentCenterX = (minX + maxX) / 2
    const contentCenterY = (minY + maxY) / 2
    
    const canvasWidth = canvasRef.current?.clientWidth || 800
    const canvasHeight = canvasRef.current?.clientHeight || 600
    
    const panX = (canvasWidth / 2) - (contentCenterX * zoom)
    const panY = (canvasHeight / 2) - (contentCenterY * zoom)
    
    setPan({ x: panX, y: panY })
  }, [zoom])
  
  const screenToCanvas = useCallback((screenX: number, screenY: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: screenX, y: screenY }
    
    return {
      x: (screenX - rect.left - pan.x) / zoom,
      y: (screenY - rect.top - pan.y) / zoom
    }
  }, [pan, zoom])
  
  const canvasToScreen = useCallback((canvasX: number, canvasY: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: canvasX, y: canvasY }
    
    return {
      x: rect.left + pan.x + canvasX * zoom,
      y: rect.top + pan.y + canvasY * zoom
    }
  }, [pan, zoom])
  
  // ---- Context Menus ----
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [waypointContextMenu, setWaypointContextMenu] = useState<WaypointContextMenu | null>(null)
  const [floatingToolbar, setFloatingToolbar] = useState<FloatingToolbarState | null>(null)
  
  const showStateToolbar = useCallback((x: number, y: number, stateId: string) => {
    setFloatingToolbar({ canvasX: x, canvasY: y, type: 'state', targetId: stateId })
  }, [])
  
  const showTransitionToolbar = useCallback((x: number, y: number, transitionId: string) => {
    setFloatingToolbar({ canvasX: x, canvasY: y, type: 'transition', targetId: transitionId })
  }, [])
  
  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
    setWaypointContextMenu(null)
  }, [])
  
  const closeAll = useCallback(() => {
    setContextMenu(null)
    setWaypointContextMenu(null)
    setFloatingToolbar(null)
  }, [])
  
  // ---- Dialogs ----
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false)
  const [showEditWorkflow, setShowEditWorkflow] = useState(false)
  const [showEditState, setShowEditState] = useState(false)
  const [showEditTransition, setShowEditTransition] = useState(false)
  const [editingState, setEditingState] = useState<WorkflowState | null>(null)
  const [editingTransition, setEditingTransition] = useState<WorkflowTransition | null>(null)
  
  const openEditState = useCallback((state: WorkflowState) => {
    setEditingState(state)
    setShowEditState(true)
  }, [])
  
  const closeEditState = useCallback(() => {
    setShowEditState(false)
    setEditingState(null)
  }, [])
  
  const openEditTransition = useCallback((transition: WorkflowTransition) => {
    setEditingTransition(transition)
    setShowEditTransition(true)
  }, [])
  
  const closeEditTransition = useCallback(() => {
    setShowEditTransition(false)
    setEditingTransition(null)
  }, [])
  
  // ---- Clipboard ----
  const [clipboard, setClipboard] = useState<{ type: 'state' | 'transition'; data: unknown } | null>(null)
  
  // ---- Build context value ----
  const value = useMemo<WorkflowContextValue>(() => ({
    // Core Data
    workflows,
    selectedWorkflow,
    states,
    transitions,
    gates,
    isLoading,
    isAdmin,
    setStates,
    setTransitions,
    setGates,
    setSelectedWorkflow,
    
    // Canvas
    canvasMode,
    zoom,
    pan,
    mousePos,
    canvasRef,
    setCanvasMode,
    setZoom,
    setPan,
    handleWheel,
    centerOnContent,
    screenToCanvas,
    canvasToScreen,
    
    // Selection
    selectedStateId,
    selectedTransitionId,
    hoveredStateId,
    hoveredTransitionId,
    hoveredWaypoint,
    selectState,
    selectTransition,
    setHoveredStateId,
    setHoveredTransitionId,
    setHoveredWaypoint,
    clearSelection,
    
    // Dragging
    draggingStateId,
    dragOffset,
    hasDraggedRef,
    dragStartPosRef,
    setDraggingStateId,
    setDragOffset,
    startDragging,
    stopDragging,
    checkDragThreshold,
    markHasDragged,
    
    // Resizing
    resizingState,
    stateDimensions,
    setResizingState,
    startResizing,
    stopResizing,
    getDimensions,
    updateDimensions,
    
    // Transition Creation
    isCreatingTransition,
    transitionStartId,
    isDraggingToCreateTransition,
    draggingTransitionEndpoint,
    justCompletedTransitionRef,
    transitionCompletedAtRef,
    setIsCreatingTransition,
    setTransitionStartId,
    setIsDraggingToCreateTransition,
    setDraggingTransitionEndpoint,
    cancelTransitionCreation,
    
    // Waypoints
    waypoints,
    draggingCurveControl,
    draggingWaypointIndex,
    draggingWaypointAxis,
    tempCurvePos,
    waypointHasDraggedRef,
    setWaypoints,
    setDraggingCurveControl,
    setDraggingWaypointIndex,
    setDraggingWaypointAxis,
    setTempCurvePos,
    addWaypoint,
    stopWaypointDrag,
    
    // Labels
    labelOffsets,
    pinnedLabelPositions,
    draggingLabel,
    tempLabelPos,
    setLabelOffsets,
    setPinnedLabelPositions,
    setDraggingLabel,
    setTempLabelPos,
    stopLabelDrag,
    
    // Edge Positions
    edgePositions,
    setEdgePositions,
    updateEdgePosition,
    
    // Snap Settings
    snapSettings,
    showSnapSettings,
    alignmentGuides,
    setSnapSettings,
    setShowSnapSettings,
    setAlignmentGuides,
    clearAlignmentGuides,
    applySnapping,
    
    // Context Menus
    contextMenu,
    waypointContextMenu,
    floatingToolbar,
    setContextMenu,
    setWaypointContextMenu,
    setFloatingToolbar,
    showStateToolbar,
    showTransitionToolbar,
    closeContextMenu,
    closeAll,
    
    // Dialogs
    showCreateWorkflow,
    showEditWorkflow,
    showEditState,
    showEditTransition,
    editingState,
    editingTransition,
    setShowCreateWorkflow,
    setShowEditWorkflow,
    setShowEditState,
    setShowEditTransition,
    setEditingState,
    setEditingTransition,
    openEditState,
    closeEditState,
    openEditTransition,
    closeEditTransition,
    
    // Clipboard
    clipboard,
    setClipboard,
    
    // Utility
    addToast
  }), [
    // Core Data
    workflows, selectedWorkflow, states, transitions, gates, isLoading, isAdmin,
    setStates, setTransitions, setGates, setSelectedWorkflow,
    // Canvas
    canvasMode, zoom, pan, mousePos,
    handleWheel, centerOnContent, screenToCanvas, canvasToScreen,
    // Selection
    selectedStateId, selectedTransitionId, hoveredStateId, hoveredTransitionId, hoveredWaypoint,
    selectState, selectTransition, clearSelection,
    // Dragging
    draggingStateId, dragOffset, startDragging, stopDragging, checkDragThreshold, markHasDragged,
    // Resizing
    resizingState, stateDimensions, startResizing, stopResizing, getDimensions, updateDimensions,
    // Transition Creation
    isCreatingTransition, transitionStartId, isDraggingToCreateTransition, draggingTransitionEndpoint,
    cancelTransitionCreation,
    // Waypoints
    waypoints, draggingCurveControl, draggingWaypointIndex, draggingWaypointAxis, tempCurvePos,
    addWaypoint, stopWaypointDrag,
    // Labels
    labelOffsets, pinnedLabelPositions, draggingLabel, tempLabelPos, stopLabelDrag,
    // Edge Positions
    edgePositions, updateEdgePosition,
    // Snap Settings
    snapSettings, showSnapSettings, alignmentGuides, clearAlignmentGuides, applySnapping,
    // Context Menus
    contextMenu, waypointContextMenu, floatingToolbar,
    showStateToolbar, showTransitionToolbar, closeContextMenu, closeAll,
    // Dialogs
    showCreateWorkflow, showEditWorkflow, showEditState, showEditTransition,
    editingState, editingTransition, openEditState, closeEditState, openEditTransition, closeEditTransition,
    // Clipboard
    clipboard,
    // Utility
    addToast
  ])
  
  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  )
}

// ==============================================
// Hook
// ==============================================

export function useWorkflowContext() {
  const context = useContext(WorkflowContext)
  if (!context) {
    throw new Error('useWorkflowContext must be used within WorkflowProvider')
  }
  return context
}

export { WorkflowContext }
