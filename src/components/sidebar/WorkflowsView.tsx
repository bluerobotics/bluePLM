// @ts-nocheck - Supabase type inference issues with Database generics
import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Plus, 
  Edit3,
  Trash2,
  X,
  Circle,
  Pencil,
  Eye,
  CheckCircle,
  XCircle,
  Archive,
  Clock,
  AlertTriangle,
  Star,
  Flag,
  Lock,
  Unlock,
  Send,
  Inbox,
  FileCheck,
  FileX,
  ThumbsUp,
  ThumbsDown,
  UserCheck,
  Users,
  ShieldCheck,
  BadgeCheck,
  ClipboardCheck,
  ListChecks,
  ArrowRight,
  Zap,
  GitBranch,
  ZoomIn,
  ZoomOut,
  Move,
  MousePointer,
  GripHorizontal,
  Palette,
  Minus,
  MoreHorizontal,
  Copy,
  ChevronDown,
  RotateCcw,
  Grid,
  Settings2,
  Magnet,
  AlignVerticalJustifyCenter,
  AlignHorizontalJustifyCenter,
  Download,
  Upload
} from 'lucide-react'
import { usePDMStore } from '../../stores/pdmStore'
import { supabase } from '../../lib/supabase'
import type { 
  WorkflowTemplate, 
  WorkflowState, 
  WorkflowTransition, 
  WorkflowGate,
  TransitionLineStyle,
  TransitionPathType,
  TransitionArrowHead,
  TransitionLineThickness,
  UserRole,
  CanvasMode
} from '../../types/workflow'
import { STATE_COLORS, getContrastColor } from '../../types/workflow'

// Icon mapping for state icons
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'circle': Circle,
  'pencil': Pencil,
  'eye': Eye,
  'check-circle': CheckCircle,
  'x-circle': XCircle,
  'archive': Archive,
  'clock': Clock,
  'alert-triangle': AlertTriangle,
  'star': Star,
  'flag': Flag,
  'lock': Lock,
  'unlock': Unlock,
  'send': Send,
  'inbox': Inbox,
  'file-check': FileCheck,
  'file-x': FileX,
  'thumbs-up': ThumbsUp,
  'thumbs-down': ThumbsDown,
  'user-check': UserCheck,
  'users': Users,
  'shield-check': ShieldCheck,
  'badge-check': BadgeCheck,
  'clipboard-check': ClipboardCheck,
  'list-checks': ListChecks,
}

export function WorkflowsView() {
  const { organization, user, addToast, getEffectiveRole } = usePDMStore()
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowTemplate | null>(null)
  const [states, setStates] = useState<WorkflowState[]>([])
  const [transitions, setTransitions] = useState<WorkflowTransition[]>([])
  const [gates, setGates] = useState<Record<string, WorkflowGate[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Update isAdmin when role changes (including impersonation)
  const effectiveRole = getEffectiveRole()
  
  // Canvas state
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('select')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null)
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null)
  const [isCreatingTransition, setIsCreatingTransition] = useState(false)
  const [transitionStartId, setTransitionStartId] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  
  // Dragging state
  const [draggingStateId, setDraggingStateId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const hasDraggedRef = useRef(false) // Track if actual dragging occurred (vs just click)
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null) // Initial click position for threshold check
  const DRAG_THRESHOLD = 5 // Pixels of movement before drag starts
  
  // Dragging transition endpoint
  const [draggingTransitionEndpoint, setDraggingTransitionEndpoint] = useState<{
    transitionId: string
    endpoint: 'start' | 'end'
    originalStateId: string
  } | null>(null)
  const [hoveredStateId, setHoveredStateId] = useState<string | null>(null)
  
  // Resizing state boxes
  const [resizingState, setResizingState] = useState<{
    stateId: string
    handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
    startMouseX: number
    startMouseY: number
    startWidth: number
    startHeight: number
  } | null>(null)
  // Store custom dimensions per state (default is 120x60)
  const [stateDimensions, setStateDimensions] = useState<Record<string, { width: number; height: number }>>({})
  const DEFAULT_STATE_WIDTH = 120
  const DEFAULT_STATE_HEIGHT = 60
  
  // Hover state for showing connection points and effects
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [hoveredTransitionId, setHoveredTransitionId] = useState<string | null>(null)
  
  // Hover state for control points (for highlight effect)
  const [hoveredWaypoint, setHoveredWaypoint] = useState<{ transitionId: string; index: number } | null>(null)
  
  // Floating toolbar state (stores canvas coordinates, screen position computed dynamically)
  const [floatingToolbar, setFloatingToolbar] = useState<{
    canvasX: number  // Canvas coordinate (not screen)
    canvasY: number  // Canvas coordinate (not screen)
    type: 'state' | 'transition'
    targetId: string
  } | null>(null)
  
  // Dragging curve control point (waypoint handle)
  const [draggingCurveControl, setDraggingCurveControl] = useState<string | null>(null) // transitionId
  const [draggingWaypointIndex, setDraggingWaypointIndex] = useState<number | null>(null) // which waypoint index
  // Store waypoints per transition (array of points the curve passes through)
  const [waypoints, setWaypoints] = useState<Record<string, Array<{ x: number; y: number }>>>({})
  // Temp position while dragging curve control
  const [tempCurvePos, setTempCurvePos] = useState<{ x: number; y: number } | null>(null)
  const waypointDragStartRef = useRef<{ x: number; y: number } | null>(null) // Track start pos for drag threshold
  const waypointHasDraggedRef = useRef(false) // Track if actual dragging occurred
  const justFinishedWaypointDragRef = useRef(false) // Track if we just finished a waypoint drag (to prevent deselection)
  
  // Dragging label position
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null) // transitionId
  // Store custom label offsets per transition (relative to curve midpoint)
  const [labelOffsets, setLabelOffsets] = useState<Record<string, { x: number; y: number }>>({})
  // Temp position while dragging label
  const [tempLabelPos, setTempLabelPos] = useState<{ x: number; y: number } | null>(null)
  
  // Store custom edge connection points (as a fraction 0-1 along each edge)
  // Key format: "transitionId-start" or "transitionId-end"
  const [edgePositions, setEdgePositions] = useState<Record<string, { 
    edge: 'left' | 'right' | 'top' | 'bottom'
    fraction: number // 0-1 position along that edge
  }>>({})
  
  // Snap settings
  const [snapSettings, setSnapSettings] = useState({
    gridSize: 40,          // Grid cell size in pixels
    snapToGrid: false,     // Whether to snap to grid when dragging
    snapToAlignment: true, // Whether to snap to vertical/horizontal alignment with other states
    alignmentThreshold: 10 // How close (in pixels) before snapping to alignment
  })
  const [showSnapSettings, setShowSnapSettings] = useState(false)
  const [alignmentGuides, setAlignmentGuides] = useState<{
    vertical: number | null    // X coordinate for vertical alignment guide
    horizontal: number | null  // Y coordinate for horizontal alignment guide
  }>({ vertical: null, horizontal: null })
  
  // LocalStorage key for visual customizations
  const getStorageKey = (workflowId: string) => `workflow-visual-${workflowId}`
  
  // Load visual customizations from localStorage when workflow changes
  useEffect(() => {
    if (!selectedWorkflow?.id) return
    
    try {
      const stored = localStorage.getItem(getStorageKey(selectedWorkflow.id))
      if (stored) {
        const data = JSON.parse(stored)
        // Support both old curveMidpoints (single point) and new waypoints (array)
        if (data.waypoints) {
          setWaypoints(data.waypoints)
        } else if (data.curveMidpoints) {
          // Migrate old format: convert single midpoint to array with one waypoint
          const migrated: Record<string, Array<{ x: number; y: number }>> = {}
          for (const [key, value] of Object.entries(data.curveMidpoints)) {
            migrated[key] = [value as { x: number; y: number }]
          }
          setWaypoints(migrated)
        }
        if (data.labelOffsets) setLabelOffsets(data.labelOffsets)
        if (data.edgePositions) setEdgePositions(data.edgePositions)
        if (data.snapSettings) setSnapSettings(prev => ({ ...prev, ...data.snapSettings }))
      }
    } catch (e) {
      console.warn('Failed to load workflow visual data:', e)
    }
  }, [selectedWorkflow?.id])
  
  // Save visual customizations to localStorage when they change
  useEffect(() => {
    if (!selectedWorkflow?.id) return
    
    try {
      localStorage.setItem(getStorageKey(selectedWorkflow.id), JSON.stringify({
        waypoints,
        labelOffsets,
        edgePositions,
        snapSettings
      }))
    } catch (e) {
      console.warn('Failed to save workflow visual data:', e)
    }
  }, [selectedWorkflow?.id, waypoints, labelOffsets, edgePositions, snapSettings])
  
  // Editing state
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false)
  const [showEditWorkflow, setShowEditWorkflow] = useState(false)
  const [showEditState, setShowEditState] = useState(false)
  const [showEditTransition, setShowEditTransition] = useState(false)
  const [showEditGate, setShowEditGate] = useState(false)
  const [editingState, setEditingState] = useState<WorkflowState | null>(null)
  const [editingTransition, setEditingTransition] = useState<WorkflowTransition | null>(null)
  const [editingGate, setEditingGate] = useState<WorkflowGate | null>(null)
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: 'state' | 'transition'
    targetId: string
  } | null>(null)
  
  // Waypoint context menu (for adding/deleting control points on lines)
  const [waypointContextMenu, setWaypointContextMenu] = useState<{
    x: number          // Screen position
    y: number          // Screen position
    canvasX: number    // Canvas position for adding waypoint
    canvasY: number    // Canvas position for adding waypoint
    transitionId: string
    waypointIndex: number | null  // null = clicked on line (add only), number = clicked on waypoint (delete option)
  } | null>(null)
  
  const canvasRef = useRef<HTMLDivElement>(null)
  
  // Check if user is admin (respects role impersonation)
  useEffect(() => {
    setIsAdmin(effectiveRole === 'admin')
  }, [effectiveRole])
  
  // Handle ESC key to cancel connect mode or creating transition
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreatingTransition) {
          setIsCreatingTransition(false)
          setTransitionStartId(null)
        }
        if (canvasMode === 'connect') {
          setCanvasMode('select')
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCreatingTransition, canvasMode])
  
  // Load workflows
  useEffect(() => {
    if (!organization) {
      setWorkflows([])
      setIsLoading(false)
      return
    }
    
    loadWorkflows()
  }, [organization])
  
  const loadWorkflows = async () => {
    if (!organization) return
    
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('*')
        .eq('org_id', organization.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name')
      
      if (error) throw error
      setWorkflows(data || [])
      
      // Auto-select default workflow
      if (data && data.length > 0 && !selectedWorkflow) {
        const defaultWorkflow = data.find(w => w.is_default) || data[0]
        await selectWorkflow(defaultWorkflow)
      }
    } catch (err) {
      console.error('Failed to load workflows:', err)
      addToast('error', 'Failed to load workflows')
    } finally {
      setIsLoading(false)
    }
  }
  
  const selectWorkflow = async (workflow: WorkflowTemplate) => {
    setSelectedWorkflow(workflow)
    setSelectedStateId(null)
    setSelectedTransitionId(null)
    
    // Load states
    try {
      const { data: statesData } = await supabase
        .from('workflow_states')
        .select('*')
        .eq('workflow_id', workflow.id)
        .order('sort_order')
      
      setStates(statesData || [])
      
      // Load transitions
      const { data: transitionsData } = await supabase
        .from('workflow_transitions')
        .select('*')
        .eq('workflow_id', workflow.id)
      
      setTransitions(transitionsData || [])
      
      // Load gates for each transition
      if (transitionsData && transitionsData.length > 0) {
        const { data: gatesData } = await supabase
          .from('workflow_gates')
          .select('*')
          .in('transition_id', transitionsData.map(t => t.id))
          .order('sort_order')
        
        // Group gates by transition
        const gatesByTransition: Record<string, WorkflowGate[]> = {}
        gatesData?.forEach(gate => {
          if (!gatesByTransition[gate.transition_id]) {
            gatesByTransition[gate.transition_id] = []
          }
          gatesByTransition[gate.transition_id].push(gate)
        })
        setGates(gatesByTransition)
      }
      
      // Apply canvas config
      if (workflow.canvas_config) {
        setZoom(workflow.canvas_config.zoom || 1)
        setPan({ x: workflow.canvas_config.panX || 0, y: workflow.canvas_config.panY || 0 })
      }
    } catch (err) {
      console.error('Failed to load workflow details:', err)
    }
  }
  
  // Create new workflow
  const createWorkflow = async (name: string, description: string) => {
    if (!organization || !user) return
    
    try {
      // Create the workflow using the default workflow function
      const { data, error } = await supabase
        .rpc('create_default_workflow', {
          p_org_id: organization.id,
          p_created_by: user.id
        })
      
      if (error) throw error
      
      // Update the name if different from default
      if (name !== 'Standard Release Process') {
        await supabase
          .from('workflow_templates')
          .update({ name, description })
          .eq('id', data)
      }
      
      addToast('success', 'Workflow created successfully')
      await loadWorkflows()
      setShowCreateWorkflow(false)
    } catch (err) {
      console.error('Failed to create workflow:', err)
      addToast('error', 'Failed to create workflow')
    }
  }
  
  // Add new state
  const addState = async () => {
    if (!selectedWorkflow || !isAdmin) return
    
    const newState: Partial<WorkflowState> = {
      workflow_id: selectedWorkflow.id,
      name: 'New State',
      label: 'New State',
      description: '',
      color: '#6B7280',
      icon: 'circle',
      position_x: 250 + states.length * 50,
      position_y: 200,
      is_editable: true,
      requires_checkout: true,
      auto_increment_revision: false,
      sort_order: states.length,
    }
    
    try {
      const { data, error } = await supabase
        .from('workflow_states')
        .insert(newState)
        .select()
        .single()
      
      if (error) throw error
      
      setStates([...states, data])
      setSelectedStateId(data.id)
      setEditingState(data)
      setShowEditState(true)
    } catch (err) {
      console.error('Failed to add state:', err)
      addToast('error', 'Failed to add state')
    }
  }
  
  // Export workflow to JSON
  const exportWorkflow = () => {
    if (!selectedWorkflow) return
    
    // Create export data structure
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workflow: {
        name: selectedWorkflow.name,
        description: selectedWorkflow.description,
        canvas_config: selectedWorkflow.canvas_config,
      },
      states: states.map(s => ({
        name: s.name,
        label: s.label,
        description: s.description,
        color: s.color,
        icon: s.icon,
        position_x: s.position_x,
        position_y: s.position_y,
        is_editable: s.is_editable,
        requires_checkout: s.requires_checkout,
        auto_increment_revision: s.auto_increment_revision,
        sort_order: s.sort_order,
        // Use name as reference key for transitions
        _key: s.name
      })),
      transitions: transitions.map(t => {
        const fromState = states.find(s => s.id === t.from_state_id)
        const toState = states.find(s => s.id === t.to_state_id)
        return {
          from_state: fromState?.name,
          to_state: toState?.name,
          name: t.name,
          description: t.description,
          line_style: t.line_style,
          path_type: t.path_type,
          arrow_head: t.arrow_head,
          line_thickness: t.line_thickness,
          color: t.color,
          label_position: t.label_position,
        }
      })
    }
    
    // Download as JSON file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workflow-${selectedWorkflow.name.toLowerCase().replace(/\s+/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    addToast('success', 'Workflow exported')
  }
  
  // Import workflow from JSON
  const importWorkflow = async (file: File) => {
    if (!selectedWorkflow || !isAdmin) return
    
    try {
      const text = await file.text()
      const importData = JSON.parse(text)
      
      // Validate import data
      if (!importData.version || !importData.states || !Array.isArray(importData.states)) {
        addToast('error', 'Invalid workflow file format')
        return
      }
      
      // Confirm import (will replace existing states/transitions)
      const confirmed = window.confirm(
        `Import workflow from "${file.name}"?\n\nThis will replace all existing states and transitions in "${selectedWorkflow.name}".`
      )
      if (!confirmed) return
      
      // Delete existing transitions first (due to foreign key constraints)
      await supabase
        .from('workflow_transitions')
        .delete()
        .eq('workflow_id', selectedWorkflow.id)
      
      // Delete existing states
      await supabase
        .from('workflow_states')
        .delete()
        .eq('workflow_id', selectedWorkflow.id)
      
      // Create new states and build ID mapping
      const stateIdMap: Record<string, string> = {}
      const newStates: WorkflowState[] = []
      
      for (const stateData of importData.states) {
        const { data: newState, error } = await supabase
          .from('workflow_states')
          .insert({
            workflow_id: selectedWorkflow.id,
            name: stateData.name,
            label: stateData.label,
            description: stateData.description,
            color: stateData.color || '#6B7280',
            icon: stateData.icon || 'circle',
            position_x: stateData.position_x || 100,
            position_y: stateData.position_y || 100,
            is_editable: stateData.is_editable ?? true,
            requires_checkout: stateData.requires_checkout ?? true,
            auto_increment_revision: stateData.auto_increment_revision ?? false,
            sort_order: stateData.sort_order || 0,
          })
          .select()
          .single()
        
        if (error) throw error
        
        // Map the original state name/key to new ID
        stateIdMap[stateData._key || stateData.name] = newState.id
        newStates.push(newState)
      }
      
      // Create transitions using the ID mapping
      const newTransitions: WorkflowTransition[] = []
      
      if (importData.transitions && Array.isArray(importData.transitions)) {
        for (const transData of importData.transitions) {
          const fromStateId = stateIdMap[transData.from_state]
          const toStateId = stateIdMap[transData.to_state]
          
          if (!fromStateId || !toStateId) {
            console.warn(`Skipping transition: state not found (${transData.from_state} -> ${transData.to_state})`)
            continue
          }
          
          const { data: newTrans, error } = await supabase
            .from('workflow_transitions')
            .insert({
              workflow_id: selectedWorkflow.id,
              from_state_id: fromStateId,
              to_state_id: toStateId,
              name: transData.name,
              description: transData.description,
              line_style: transData.line_style || 'solid',
              path_type: transData.path_type || 'straight',
              arrow_head: transData.arrow_head || 'end',
              line_thickness: transData.line_thickness || 'normal',
              color: transData.color,
              label_position: transData.label_position || 50,
            })
            .select()
            .single()
          
          if (error) throw error
          newTransitions.push(newTrans)
        }
      }
      
      // Update workflow metadata if provided
      if (importData.workflow) {
        await supabase
          .from('workflow_templates')
          .update({
            description: importData.workflow.description,
            canvas_config: importData.workflow.canvas_config,
          })
          .eq('id', selectedWorkflow.id)
      }
      
      // Update local state
      setStates(newStates)
      setTransitions(newTransitions)
      setSelectedStateId(null)
      setSelectedTransitionId(null)
      
      addToast('success', `Imported ${newStates.length} states and ${newTransitions.length} transitions`)
    } catch (err) {
      console.error('Failed to import workflow:', err)
      addToast('error', `Failed to import workflow: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }
  
  // File input ref for import
  const importInputRef = useRef<HTMLInputElement>(null)
  
  // Update state position (drag)
  const updateStatePosition = async (stateId: string, x: number, y: number) => {
    try {
      await supabase
        .from('workflow_states')
        .update({ position_x: Math.round(x), position_y: Math.round(y) })
        .eq('id', stateId)
      
      setStates(states.map(s => 
        s.id === stateId ? { ...s, position_x: Math.round(x), position_y: Math.round(y) } : s
      ))
    } catch (err) {
      console.error('Failed to update state position:', err)
    }
  }
  
  // Delete state
  const deleteState = async (stateId: string) => {
    if (!isAdmin) return
    
    try {
      // Check if state has transitions
      const hasTransitions = transitions.some(
        t => t.from_state_id === stateId || t.to_state_id === stateId
      )
      
      if (hasTransitions) {
        addToast('error', 'Remove all transitions first')
        return
      }
      
      await supabase
        .from('workflow_states')
        .delete()
        .eq('id', stateId)
      
      setStates(states.filter(s => s.id !== stateId))
      setSelectedStateId(null)
      addToast('success', 'State deleted')
    } catch (err) {
      console.error('Failed to delete state:', err)
      addToast('error', 'Failed to delete state')
    }
  }
  
  // Start creating transition
  const startTransition = (fromStateId: string) => {
    if (!isAdmin) return
    setIsCreatingTransition(true)
    setTransitionStartId(fromStateId)
  }
  
  // Complete transition
  const completeTransition = async (toStateId: string) => {
    if (!selectedWorkflow || !transitionStartId || !isAdmin) return
    
    // Don't allow self-transitions
    if (transitionStartId === toStateId) {
      setIsCreatingTransition(false)
      setTransitionStartId(null)
      return
    }
    
    // Check if transition already exists
    const exists = transitions.some(
      t => t.from_state_id === transitionStartId && t.to_state_id === toStateId
    )
    
    if (exists) {
      addToast('error', 'Transition already exists')
      setIsCreatingTransition(false)
      setTransitionStartId(null)
      return
    }
    
    try {
      const newTransition: Partial<WorkflowTransition> = {
        workflow_id: selectedWorkflow.id,
        from_state_id: transitionStartId,
        to_state_id: toStateId,
        name: 'New Transition',
        line_style: 'solid',
        allowed_roles: ['admin', 'engineer'],
      }
      
      const { data, error } = await supabase
        .from('workflow_transitions')
        .insert(newTransition)
        .select()
        .single()
      
      if (error) throw error
      
      const newTransitions = [...transitions, data]
      setTransitions(newTransitions)
      setSelectedTransitionId(data.id)
      setEditingTransition(data)
      setShowEditTransition(true)
      
      // Create a default waypoint for the new spline transition
      const fromState = states.find(s => s.id === transitionStartId)
      const toState = states.find(s => s.id === toStateId)
      if (fromState && toState) {
        const midX = (fromState.position_x + toState.position_x) / 2
        const midY = (fromState.position_y + toState.position_y) / 2 - 40 // Offset up for natural curve
        setWaypoints(prev => ({
          ...prev,
          [data.id]: [{ x: midX, y: midY }]
        }))
      }
    } catch (err) {
      console.error('Failed to create transition:', err)
      addToast('error', 'Failed to create transition')
    }
    
    setIsCreatingTransition(false)
    setTransitionStartId(null)
  }
  
  // Delete transition
  const deleteTransition = async (transitionId: string) => {
    if (!isAdmin) return
    
    try {
      await supabase
        .from('workflow_transitions')
        .delete()
        .eq('id', transitionId)
      
      setTransitions(transitions.filter(t => t.id !== transitionId))
      setSelectedTransitionId(null)
      addToast('success', 'Transition deleted')
    } catch (err) {
      console.error('Failed to delete transition:', err)
      addToast('error', 'Failed to delete transition')
    }
  }
  
  // Add gate to transition
  const addGate = async (transitionId: string) => {
    if (!isAdmin) return
    
    try {
      const newGate: Partial<WorkflowGate> = {
        transition_id: transitionId,
        name: 'New Gate',
        gate_type: 'approval',
        required_approvals: 1,
        approval_mode: 'any',
        is_blocking: true,
        can_be_skipped_by: [],
        checklist_items: [],
        sort_order: (gates[transitionId]?.length || 0),
      }
      
      const { data, error } = await supabase
        .from('workflow_gates')
        .insert(newGate)
        .select()
        .single()
      
      if (error) throw error
      
      setGates({
        ...gates,
        [transitionId]: [...(gates[transitionId] || []), data]
      })
      setEditingGate(data)
      setShowEditGate(true)
    } catch (err) {
      console.error('Failed to add gate:', err)
      addToast('error', 'Failed to add gate')
    }
  }
  
  // Cancel connect mode / creating transition
  const cancelConnectMode = useCallback(() => {
    setIsCreatingTransition(false)
    setTransitionStartId(null)
  }, [])
  
  // Snap position to grid
  const snapToGridPosition = useCallback((x: number, y: number): { x: number; y: number } => {
    if (!snapSettings.snapToGrid) return { x, y }
    const gridSize = snapSettings.gridSize
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize
    }
  }, [snapSettings.snapToGrid, snapSettings.gridSize])
  
  // Check alignment with other states and return snapped position + alignment guides
  const checkAlignment = useCallback((
    currentStateId: string,
    x: number,
    y: number
  ): { 
    snappedX: number
    snappedY: number
    verticalGuide: number | null
    horizontalGuide: number | null 
  } => {
    if (!snapSettings.snapToAlignment) {
      return { snappedX: x, snappedY: y, verticalGuide: null, horizontalGuide: null }
    }
    
    const threshold = snapSettings.alignmentThreshold
    let snappedX = x
    let snappedY = y
    let verticalGuide: number | null = null
    let horizontalGuide: number | null = null
    
    // Check alignment with each other state's center
    for (const state of states) {
      if (state.id === currentStateId) continue
      
      // Check vertical alignment (same X coordinate - centers aligned)
      if (Math.abs(state.position_x - x) <= threshold) {
        snappedX = state.position_x
        verticalGuide = state.position_x
      }
      
      // Check horizontal alignment (same Y coordinate - centers aligned)
      if (Math.abs(state.position_y - y) <= threshold) {
        snappedY = state.position_y
        horizontalGuide = state.position_y
      }
    }
    
    return { snappedX, snappedY, verticalGuide, horizontalGuide }
  }, [snapSettings.snapToAlignment, snapSettings.alignmentThreshold, states])
  
  // Apply all snapping logic and return final position
  const applySnapping = useCallback((
    currentStateId: string,
    rawX: number,
    rawY: number
  ): { x: number; y: number; verticalGuide: number | null; horizontalGuide: number | null } => {
    // First apply grid snapping
    let { x, y } = snapToGridPosition(rawX, rawY)
    
    // Then check alignment (alignment takes priority over grid)
    const alignment = checkAlignment(currentStateId, x, y)
    
    return {
      x: alignment.snappedX,
      y: alignment.snappedY,
      verticalGuide: alignment.verticalGuide,
      horizontalGuide: alignment.horizontalGuide
    }
  }, [snapToGridPosition, checkAlignment])
  
  // Start dragging a state
  const startDraggingState = useCallback((stateId: string, e: React.MouseEvent) => {
    if (!isAdmin || canvasMode === 'connect') return
    
    const state = states.find(s => s.id === stateId)
    if (!state) return
    
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    
    // Calculate mouse position in canvas coordinates
    const mouseX = (e.clientX - rect.left - pan.x) / zoom
    const mouseY = (e.clientY - rect.top - pan.y) / zoom
    
    // Calculate offset from state center to mouse position
    setDragOffset({
      x: state.position_x - mouseX,
      y: state.position_y - mouseY
    })
    
    hasDraggedRef.current = false // Reset drag tracking
    dragStartPosRef.current = { x: e.clientX, y: e.clientY } // Store initial click position for threshold
    setDraggingStateId(stateId)
    setSelectedStateId(stateId)
    setSelectedTransitionId(null)
  }, [isAdmin, canvasMode, states, pan, zoom])
  
  // Canvas mouse handlers
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (canvasMode === 'pan') {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }
  
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    
    // Calculate mouse position in canvas coordinates
    const mouseX = (e.clientX - rect.left - pan.x) / zoom
    const mouseY = (e.clientY - rect.top - pan.y) / zoom
    
    setMousePos({ x: mouseX, y: mouseY })
    
    // Handle pan dragging
    if (isDragging && canvasMode === 'pan') {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
    
    // Handle state dragging
    if (draggingStateId && dragStartPosRef.current) {
      // Check if we've exceeded the drag threshold
      const dx = e.clientX - dragStartPosRef.current.x
      const dy = e.clientY - dragStartPosRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance >= DRAG_THRESHOLD) {
        // First time exceeding threshold - hide toolbar
        if (!hasDraggedRef.current) {
          setFloatingToolbar(null)
        }
        hasDraggedRef.current = true // Mark that actual dragging occurred
        
        const rawX = mouseX + dragOffset.x
        const rawY = mouseY + dragOffset.y
        
        // Apply snapping (grid and/or alignment)
        const snapped = applySnapping(draggingStateId, rawX, rawY)
        
        // Update alignment guides for visual feedback
        setAlignmentGuides({
          vertical: snapped.verticalGuide,
          horizontal: snapped.horizontalGuide
        })
        
        // Update state position in local state (for smooth dragging)
        setStates(prevStates => prevStates.map(s => 
          s.id === draggingStateId 
            ? { ...s, position_x: Math.round(snapped.x), position_y: Math.round(snapped.y) }
            : s
        ))
      }
    }
    
    // Handle transition endpoint dragging - find state if mouse is over/near box
    if (draggingTransitionEndpoint) {
      const transition = transitions.find(t => t.id === draggingTransitionEndpoint.transitionId)
      if (transition) {
        // Find the closest state (excluding the state at the other end of the transition)
        const otherEndStateId = draggingTransitionEndpoint.endpoint === 'start' 
          ? transition.to_state_id 
          : transition.from_state_id
        
        let hoveredState: WorkflowState | null = null
        const BOX_WIDTH = 120
        const BOX_HEIGHT = 60
        const SNAP_PADDING = 15 // Only snap when within 15px of the box edge
        
        for (const state of states) {
          // Don't snap to the state at the other end (would make a self-loop)
          if (state.id === otherEndStateId) continue
          
          // Check if mouse is inside or very close to the box boundary
          const hw = BOX_WIDTH / 2 + SNAP_PADDING
          const hh = BOX_HEIGHT / 2 + SNAP_PADDING
          
          const inX = mouseX >= state.position_x - hw && mouseX <= state.position_x + hw
          const inY = mouseY >= state.position_y - hh && mouseY <= state.position_y + hh
          
          if (inX && inY) {
            hoveredState = state
            break // Take the first match
          }
        }
        
        setHoveredStateId(hoveredState?.id || null)
      }
    }
    
    // Handle curve control dragging (with threshold to allow double-click)
    if (draggingCurveControl && waypointDragStartRef.current) {
      const dx = e.clientX - waypointDragStartRef.current.x
      const dy = e.clientY - waypointDragStartRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      // Only start actual dragging after exceeding threshold
      if (distance >= DRAG_THRESHOLD) {
        waypointHasDraggedRef.current = true
        setTempCurvePos({ x: mouseX, y: mouseY })
      }
    }
    
    // Handle label dragging
    if (draggingLabel) {
      setTempLabelPos({ x: mouseX, y: mouseY })
    }
    
    // Handle state resizing
    if (resizingState) {
      const state = states.find(s => s.id === resizingState.stateId)
      if (state) {
        const dx = mouseX - resizingState.startMouseX
        const dy = mouseY - resizingState.startMouseY
        const handle = resizingState.handle
        
        let newWidth = resizingState.startWidth
        let newHeight = resizingState.startHeight
        let newX = state.position_x
        let newY = state.position_y
        
        const MIN_WIDTH = 80
        const MIN_HEIGHT = 40
        
        // Handle horizontal resizing
        if (handle.includes('e')) {
          newWidth = Math.max(MIN_WIDTH, resizingState.startWidth + dx * 2)
        }
        if (handle.includes('w')) {
          newWidth = Math.max(MIN_WIDTH, resizingState.startWidth - dx * 2)
        }
        
        // Handle vertical resizing
        if (handle.includes('s')) {
          newHeight = Math.max(MIN_HEIGHT, resizingState.startHeight + dy * 2)
        }
        if (handle.includes('n')) {
          newHeight = Math.max(MIN_HEIGHT, resizingState.startHeight - dy * 2)
        }
        
        setStateDimensions(prev => ({
          ...prev,
          [resizingState.stateId]: { width: newWidth, height: newHeight }
        }))
      }
    }
  }
  
  const handleCanvasMouseUp = async () => {
    // Clear alignment guides when drag ends
    setAlignmentGuides({ vertical: null, horizontal: null })
    
    // Save dragged state position to database
    if (draggingStateId) {
      const state = states.find(s => s.id === draggingStateId)
      if (state && hasDraggedRef.current) {
        // Only save position if actual dragging occurred (threshold exceeded)
        await updateStatePosition(draggingStateId, state.position_x, state.position_y)
        // Re-show toolbar after drag ends
        setFloatingToolbar({
          canvasX: state.position_x,
          canvasY: state.position_y - 34, // Top of the state box
          type: 'state',
          targetId: state.id
        })
      }
      setDraggingStateId(null)
      dragStartPosRef.current = null
    }
    
    // Handle transition endpoint drop
    if (draggingTransitionEndpoint) {
      if (hoveredStateId) {
        // Dropped on a valid state - reconnect
        const transition = transitions.find(t => t.id === draggingTransitionEndpoint.transitionId)
        const hoverState = states.find(s => s.id === hoveredStateId)
        
        if (transition && hoverState && hoveredStateId !== draggingTransitionEndpoint.originalStateId) {
          // Calculate edge position where the user dropped
          const edgePos = getNearestPointOnBoxEdge(
            hoverState.position_x, hoverState.position_y,
            mousePos.x, mousePos.y
          )
          
          // Update the transition in the database
          try {
            const updates = draggingTransitionEndpoint.endpoint === 'start'
              ? { from_state_id: hoveredStateId }
              : { to_state_id: hoveredStateId }
            
            await supabase
              .from('workflow_transitions')
              .update(updates)
              .eq('id', transition.id)
            
            // Update local state
            setTransitions(transitions.map(t => 
              t.id === transition.id ? { ...t, ...updates } : t
            ))
            
            // Save the edge position where the user dropped
            const posKey = `${transition.id}-${draggingTransitionEndpoint.endpoint}`
            setEdgePositions(prev => ({
              ...prev,
              [posKey]: { edge: edgePos.edge, fraction: edgePos.fraction }
            }))
            
            addToast('success', 'Transition reconnected')
          } catch (err) {
            console.error('Failed to update transition:', err)
            addToast('error', 'Failed to reconnect transition')
          }
        } else if (transition && hoverState) {
          // Dropped on the same state - just save the new edge position
          const edgePos = getNearestPointOnBoxEdge(
            hoverState.position_x, hoverState.position_y,
            mousePos.x, mousePos.y
          )
          const posKey = `${transition.id}-${draggingTransitionEndpoint.endpoint}`
          setEdgePositions(prev => ({
            ...prev,
            [posKey]: { edge: edgePos.edge, fraction: edgePos.fraction }
          }))
        }
      } else {
        // Dropped in empty space - show error, don't save
        addToast('error', 'Drop on a state to reconnect, or press Escape to cancel')
      }
    }
    
    // Re-show toolbar after transition endpoint drag ends
    if (draggingTransitionEndpoint) {
      const transition = transitions.find(t => t.id === draggingTransitionEndpoint.transitionId)
      if (transition) {
        const fromState = states.find(s => s.id === transition.from_state_id)
        const toState = states.find(s => s.id === transition.to_state_id)
        if (fromState && toState) {
          // Calculate line bounds from states and waypoints
          const transitionWaypoints = waypoints[transition.id] || []
          const allPoints = [
            { x: fromState.position_x, y: fromState.position_y },
            { x: toState.position_x, y: toState.position_y },
            ...transitionWaypoints
          ]
          const lineMinY = Math.min(...allPoints.map(p => p.y))
          const lineCenterX = (Math.min(...allPoints.map(p => p.x)) + Math.max(...allPoints.map(p => p.x))) / 2
          setFloatingToolbar({
            canvasX: lineCenterX,
            canvasY: lineMinY,
            type: 'transition',
            targetId: transition.id
          })
        }
      }
    }
    
    setDraggingTransitionEndpoint(null)
    setHoveredStateId(null)
    
    // Handle waypoint drop - save the waypoint position (only if actual dragging occurred)
    if (draggingCurveControl && draggingWaypointIndex !== null) {
      const transitionId = draggingCurveControl
      
      // Only save position if actual dragging occurred (threshold was exceeded)
      if (waypointHasDraggedRef.current && tempCurvePos) {
        // Update the specific waypoint at the dragged index
        setWaypoints(prev => {
          const transitionWaypoints = [...(prev[transitionId] || [])]
          transitionWaypoints[draggingWaypointIndex] = { x: tempCurvePos.x, y: tempCurvePos.y }
          return {
            ...prev,
            [transitionId]: transitionWaypoints
          }
        })
        
        // Re-show toolbar after waypoint drag ends
        const transition = transitions.find(t => t.id === transitionId)
        if (transition) {
          const fromState = states.find(s => s.id === transition.from_state_id)
          const toState = states.find(s => s.id === transition.to_state_id)
          if (fromState && toState) {
            // Calculate line bounds - use tempCurvePos for the waypoint we just dropped
            const updatedWaypoints = [...(waypoints[transitionId] || [])]
            if (draggingWaypointIndex !== null && draggingWaypointIndex < updatedWaypoints.length) {
              updatedWaypoints[draggingWaypointIndex] = { x: tempCurvePos.x, y: tempCurvePos.y }
            }
            const allPoints = [
              { x: fromState.position_x, y: fromState.position_y },
              { x: toState.position_x, y: toState.position_y },
              ...updatedWaypoints
            ]
            const lineMinY = Math.min(...allPoints.map(p => p.y))
            const lineCenterX = (Math.min(...allPoints.map(p => p.x)) + Math.max(...allPoints.map(p => p.x))) / 2
            setFloatingToolbar({
              canvasX: lineCenterX,
              canvasY: lineMinY,
              type: 'transition',
              targetId: transitionId
            })
          }
        }
      }
      
      // Reset drag tracking
      setDraggingCurveControl(null)
      setDraggingWaypointIndex(null)
      setTempCurvePos(null)
      waypointDragStartRef.current = null
      waypointHasDraggedRef.current = false
      // Mark that we just finished a waypoint drag to prevent deselection in handleCanvasClick
      justFinishedWaypointDragRef.current = true
    }
    
    // Handle label drop - save the label position
    if (draggingLabel && tempLabelPos) {
      const transition = transitions.find(t => t.id === draggingLabel)
      if (transition) {
        const fromState = states.find(s => s.id === transition.from_state_id)
        const toState = states.find(s => s.id === transition.to_state_id)
        if (fromState && toState) {
          // Calculate the default label position (curve midpoint)
          const startPoint = getClosestPointOnBox(fromState.position_x, fromState.position_y, toState.position_x, toState.position_y)
          const endPoint = getClosestPointOnBox(toState.position_x, toState.position_y, fromState.position_x, fromState.position_y)
          const lineMidX = (startPoint.x + endPoint.x) / 2
          const lineMidY = (startPoint.y + endPoint.y) / 2
          
          // Save offset from the line midpoint
          setLabelOffsets(prev => ({
            ...prev,
            [draggingLabel]: {
              x: tempLabelPos.x - lineMidX,
              y: tempLabelPos.y - lineMidY
            }
          }))
        }
      }
      setDraggingLabel(null)
      setTempLabelPos(null)
    }
    
    // Handle resize completion
    if (resizingState) {
      // Re-show toolbar after resize ends
      const state = states.find(s => s.id === resizingState.stateId)
      if (state) {
        const dims = stateDimensions[state.id] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }
        setFloatingToolbar({
          canvasX: state.position_x,
          canvasY: state.position_y - dims.height / 2, // Top of the state box
          type: 'state',
          targetId: state.id
        })
      }
      setResizingState(null)
    }
    
    setIsDragging(false)
  }
  
  const handleCanvasClick = (e: React.MouseEvent) => {
    // Don't process click if we were dragging a state
    if (draggingStateId) return
    
    // Don't deselect if we just finished dragging a waypoint
    if (justFinishedWaypointDragRef.current) {
      justFinishedWaypointDragRef.current = false
      return
    }
    
    // Close context menu if open
    if (contextMenu) {
      setContextMenu(null)
    }
    
    // Close waypoint context menu if open
    if (waypointContextMenu) {
      setWaypointContextMenu(null)
    }
    
    // Close floating toolbar if open
    if (floatingToolbar) {
      setFloatingToolbar(null)
    }
    
    // Close snap settings dropdown if open
    if (showSnapSettings) {
      setShowSnapSettings(false)
    }
    
    // If clicking on canvas background (not a state/transition), cancel creating transition
    if (isCreatingTransition) {
      cancelConnectMode()
    }
    // Deselect when clicking background
    setSelectedStateId(null)
    setSelectedTransitionId(null)
    setHoverNodeId(null)
  }
  
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    
    // Mouse position relative to canvas element
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    // Calculate new zoom
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.25, Math.min(2, zoom * zoomFactor))
    
    // Calculate the point in canvas coordinates that should stay under the mouse
    // Before zoom: (mouseX - pan.x) / zoom = canvasX
    // After zoom: (mouseX - newPan.x) / newZoom = canvasX (same point)
    // Therefore: newPan.x = mouseX - canvasX * newZoom
    
    const canvasX = (mouseX - pan.x) / zoom
    const canvasY = (mouseY - pan.y) / zoom
    
    const newPanX = mouseX - canvasX * newZoom
    const newPanY = mouseY - canvasY * newZoom
    
    setZoom(newZoom)
    setPan({ x: newPanX, y: newPanY })
  }
  
  // Render state node
  const renderStateNode = (state: WorkflowState) => {
    const isSelected = selectedStateId === state.id
    const isTransitionStart = transitionStartId === state.id
    const isDraggingThis = draggingStateId === state.id
    const isResizingThis = resizingState?.stateId === state.id
    const isSnapTarget = hoveredStateId === state.id && draggingTransitionEndpoint !== null
    const isHovered = hoverNodeId === state.id
    // Only show connection points when selected or in connect mode (not on hover)
    const showConnectionPoints = isAdmin && (isSelected || canvasMode === 'connect')
    const showResizeHandles = isAdmin && isSelected && canvasMode === 'select'
    const textColor = getContrastColor(state.color)
    
    // Get custom dimensions or use defaults
    const dims = stateDimensions[state.id] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }
    const hw = dims.width / 2
    const hh = dims.height / 2
    
    // Handle size constants
    const RESIZE_HANDLE_SIZE = 4
    const CONNECTION_HANDLE_SIZE = 4
    const CONNECTION_OFFSET = 12 // How far connection points float outside the box
    
    // Start resizing handler
    const startResize = (handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw', e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const mouseX = (e.clientX - rect.left - pan.x) / zoom
      const mouseY = (e.clientY - rect.top - pan.y) / zoom
      setFloatingToolbar(null)
      setResizingState({
        stateId: state.id,
        handle,
        startMouseX: mouseX,
        startMouseY: mouseY,
        startWidth: dims.width,
        startHeight: dims.height
      })
    }
    
    return (
      <g
        key={state.id}
        transform={`translate(${state.position_x}, ${state.position_y})`}
        style={{ cursor: isDraggingThis ? 'grabbing' : isResizingThis ? 'grabbing' : (isAdmin && canvasMode === 'select' ? 'grab' : 'pointer') }}
        onMouseEnter={() => {
          if (!draggingStateId && !draggingTransitionEndpoint && !resizingState) {
            setHoverNodeId(state.id)
          }
        }}
        onMouseLeave={() => {
          if (hoverNodeId === state.id) {
            setHoverNodeId(null)
          }
        }}
        onMouseDown={(e) => {
          e.stopPropagation()
          if (canvasMode === 'select' && isAdmin && !resizingState) {
            startDraggingState(state.id, e)
          }
        }}
        onClick={(e) => {
          e.stopPropagation()
          // Don't process click if we just finished dragging (actual movement occurred)
          if (hasDraggedRef.current) return
          
          if (isCreatingTransition) {
            completeTransition(state.id)
          } else {
            setSelectedStateId(state.id)
            setSelectedTransitionId(null)
            // Show floating toolbar above the state box (store canvas coordinates)
            setFloatingToolbar({
              canvasX: state.position_x,
              canvasY: state.position_y - hh, // Top of the state box
              type: 'state',
              targetId: state.id
            })
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (isAdmin) {
            setEditingState(state)
            setShowEditState(true)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          // Right-click also shows floating toolbar
          setSelectedStateId(state.id)
          setSelectedTransitionId(null)
          setFloatingToolbar({
            canvasX: state.position_x,
            canvasY: state.position_y - hh, // Top of the state box
            type: 'state',
            targetId: state.id
          })
        }}
      >
        {/* Selection glow / drag glow / snap target glow */}
        {(isSelected || isTransitionStart || isDraggingThis || isSnapTarget) && (
          <rect
            x={-hw - 4}
            y={-hh - 4}
            width={dims.width + 8}
            height={dims.height + 8}
            rx="12"
            fill={isSnapTarget ? 'rgba(96, 165, 250, 0.2)' : 'none'}
            stroke={isSnapTarget ? '#60a5fa' : isDraggingThis ? '#60a5fa' : isSelected ? '#fff' : '#22c55e'}
            strokeWidth={isSnapTarget ? 3 : 2}
            opacity={isSnapTarget ? 1 : isDraggingThis ? 0.8 : 0.6}
            strokeDasharray={isDraggingThis ? '4,2' : 'none'}
          />
        )}
        
        {/* Snap target indicator */}
        {isSnapTarget && (
          <text
            x="0"
            y={-hh - 12}
            textAnchor="middle"
            fontSize="10"
            fill="#60a5fa"
            fontWeight="600"
            className="select-none pointer-events-none"
          >
            Drop here
          </text>
        )}
        
        {/* Drop shadow when dragging */}
        {isDraggingThis && (
          <rect
            x={-hw + 4}
            y={-hh + 4}
            width={dims.width}
            height={dims.height}
            rx="8"
            fill="rgba(0,0,0,0.3)"
            transform="translate(4, 4)"
          />
        )}
        
        {/* Hover glow effect - subtle brightness increase */}
        {isHovered && !isSelected && !isDraggingThis && (
          <rect
            x={-hw - 2}
            y={-hh - 2}
            width={dims.width + 4}
            height={dims.height + 4}
            rx="10"
            fill="none"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="2"
            className="pointer-events-none"
            style={{ 
              transition: 'opacity 0.15s ease-out',
            }}
          />
        )}
        
        {/* Node background */}
        {(() => {
          // Parse fill color and apply opacity
          const baseFillOpacity = state.fill_opacity ?? 1
          // Slightly increase opacity on hover for subtle effect
          const fillOpacity = isHovered && !isSelected ? Math.min(1, baseFillOpacity + 0.1) : baseFillOpacity
          const borderOpacity = state.border_opacity ?? 1
          const borderThickness = state.border_thickness ?? 2
          const borderColor = state.border_color || state.color
          
          // Convert hex to rgba for fill
          const hexToRgba = (hex: string, alpha: number) => {
            const r = parseInt(hex.slice(1, 3), 16)
            const g = parseInt(hex.slice(3, 5), 16)
            const b = parseInt(hex.slice(5, 7), 16)
            return `rgba(${r}, ${g}, ${b}, ${alpha})`
          }
          
          // Determine the stroke color based on selection state
          let strokeColor: string
          let strokeWidth: number
          if (isDraggingThis) {
            strokeColor = '#60a5fa'
            strokeWidth = 2
          } else if (isSelected) {
            strokeColor = '#fff'
            strokeWidth = 2
          } else if (isTransitionStart) {
            strokeColor = '#22c55e'
            strokeWidth = 2
          } else {
            strokeColor = hexToRgba(borderColor, borderOpacity)
            strokeWidth = borderThickness
          }
          
          return (
            <rect
              x={-hw}
              y={-hh}
              width={dims.width}
              height={dims.height}
              rx="8"
              fill={hexToRgba(state.color, fillOpacity)}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              style={{ transition: 'fill 0.15s ease-out' }}
            />
          )
        })()}
        
        {/* Label */}
        <text
          x="0"
          y="0"
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fill={textColor}
          className="select-none pointer-events-none"
        >
          {state.label || state.name}
        </text>
        
        {/* State config indicators */}
        <text
          x="0"
          y="16"
          textAnchor="middle"
          fontSize="9"
          fill={textColor}
          opacity="0.7"
          className="select-none pointer-events-none"
        >
          {state.is_editable ? '✎ Editable' : '🔒 Locked'}
        </text>
        
        {/* Resize handles - appear when selected */}
        {showResizeHandles && (
          <g className="resize-handles">
            {/* Corner handles */}
            {/* Top-left */}
            <rect
              x={-hw - RESIZE_HANDLE_SIZE}
              y={-hh - RESIZE_HANDLE_SIZE}
              width={RESIZE_HANDLE_SIZE * 2}
              height={RESIZE_HANDLE_SIZE * 2}
              fill="#fff"
              stroke="#6b7280"
              strokeWidth="1"
              className="cursor-nwse-resize"
              onMouseDown={(e) => startResize('nw', e)}
            />
            {/* Top-right */}
            <rect
              x={hw - RESIZE_HANDLE_SIZE}
              y={-hh - RESIZE_HANDLE_SIZE}
              width={RESIZE_HANDLE_SIZE * 2}
              height={RESIZE_HANDLE_SIZE * 2}
              fill="#fff"
              stroke="#6b7280"
              strokeWidth="1"
              className="cursor-nesw-resize"
              onMouseDown={(e) => startResize('ne', e)}
            />
            {/* Bottom-left */}
            <rect
              x={-hw - RESIZE_HANDLE_SIZE}
              y={hh - RESIZE_HANDLE_SIZE}
              width={RESIZE_HANDLE_SIZE * 2}
              height={RESIZE_HANDLE_SIZE * 2}
              fill="#fff"
              stroke="#6b7280"
              strokeWidth="1"
              className="cursor-nesw-resize"
              onMouseDown={(e) => startResize('sw', e)}
            />
            {/* Bottom-right */}
            <rect
              x={hw - RESIZE_HANDLE_SIZE}
              y={hh - RESIZE_HANDLE_SIZE}
              width={RESIZE_HANDLE_SIZE * 2}
              height={RESIZE_HANDLE_SIZE * 2}
              fill="#fff"
              stroke="#6b7280"
              strokeWidth="1"
              className="cursor-nwse-resize"
              onMouseDown={(e) => startResize('se', e)}
            />
            
            {/* Side handles */}
            {/* Top */}
            <rect
              x={-RESIZE_HANDLE_SIZE}
              y={-hh - RESIZE_HANDLE_SIZE}
              width={RESIZE_HANDLE_SIZE * 2}
              height={RESIZE_HANDLE_SIZE * 2}
              fill="#fff"
              stroke="#6b7280"
              strokeWidth="1"
              className="cursor-ns-resize"
              onMouseDown={(e) => startResize('n', e)}
            />
            {/* Bottom */}
            <rect
              x={-RESIZE_HANDLE_SIZE}
              y={hh - RESIZE_HANDLE_SIZE}
              width={RESIZE_HANDLE_SIZE * 2}
              height={RESIZE_HANDLE_SIZE * 2}
              fill="#fff"
              stroke="#6b7280"
              strokeWidth="1"
              className="cursor-ns-resize"
              onMouseDown={(e) => startResize('s', e)}
            />
            {/* Left */}
            <rect
              x={-hw - RESIZE_HANDLE_SIZE}
              y={-RESIZE_HANDLE_SIZE}
              width={RESIZE_HANDLE_SIZE * 2}
              height={RESIZE_HANDLE_SIZE * 2}
              fill="#fff"
              stroke="#6b7280"
              strokeWidth="1"
              className="cursor-ew-resize"
              onMouseDown={(e) => startResize('w', e)}
            />
            {/* Right */}
            <rect
              x={hw - RESIZE_HANDLE_SIZE}
              y={-RESIZE_HANDLE_SIZE}
              width={RESIZE_HANDLE_SIZE * 2}
              height={RESIZE_HANDLE_SIZE * 2}
              fill="#fff"
              stroke="#6b7280"
              strokeWidth="1"
              className="cursor-ew-resize"
              onMouseDown={(e) => startResize('e', e)}
            />
          </g>
        )}
        
        {/* Connection points - floating outside the box as small blue circles */}
        {showConnectionPoints && (
          <g className="connection-points">
            {/* Right point - floating outside */}
            <circle
              cx={hw + CONNECTION_OFFSET}
              cy="0"
              r={CONNECTION_HANDLE_SIZE}
              fill="#3b82f6"
              stroke="#fff"
              strokeWidth="1.5"
              className="cursor-crosshair"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
              onClick={(e) => {
                e.stopPropagation()
                if (!isCreatingTransition) {
                  startTransition(state.id)
                } else if (transitionStartId !== state.id) {
                  completeTransition(state.id)
                }
              }}
            />
            {/* Left point - floating outside */}
            <circle
              cx={-hw - CONNECTION_OFFSET}
              cy="0"
              r={CONNECTION_HANDLE_SIZE}
              fill="#3b82f6"
              stroke="#fff"
              strokeWidth="1.5"
              className="cursor-crosshair"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
              onClick={(e) => {
                e.stopPropagation()
                if (!isCreatingTransition) {
                  startTransition(state.id)
                } else if (transitionStartId !== state.id) {
                  completeTransition(state.id)
                }
              }}
            />
            {/* Top point - floating outside */}
            <circle
              cx="0"
              cy={-hh - CONNECTION_OFFSET}
              r={CONNECTION_HANDLE_SIZE}
              fill="#3b82f6"
              stroke="#fff"
              strokeWidth="1.5"
              className="cursor-crosshair"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
              onClick={(e) => {
                e.stopPropagation()
                if (!isCreatingTransition) {
                  startTransition(state.id)
                } else if (transitionStartId !== state.id) {
                  completeTransition(state.id)
                }
              }}
            />
            {/* Bottom point - floating outside */}
            <circle
              cx="0"
              cy={hh + CONNECTION_OFFSET}
              r={CONNECTION_HANDLE_SIZE}
              fill="#3b82f6"
              stroke="#fff"
              strokeWidth="1.5"
              className="cursor-crosshair"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
              onClick={(e) => {
                e.stopPropagation()
                if (!isCreatingTransition) {
                  startTransition(state.id)
                } else if (transitionStartId !== state.id) {
                  completeTransition(state.id)
                }
              }}
            />
          </g>
        )}
      </g>
    )
  }
  
  // Find the absolute closest point on any edge of the box to a given point
  // Also returns the fraction (0-1) along that edge for storage
  const getNearestPointOnBoxEdge = (
    boxCenterX: number, boxCenterY: number,
    pointX: number, pointY: number,
    boxWidth: number = 120,
    boxHeight: number = 60
  ): { x: number; y: number; edge: 'left' | 'right' | 'top' | 'bottom'; fraction: number } => {
    const hw = boxWidth / 2
    const hh = boxHeight / 2
    
    const left = boxCenterX - hw
    const right = boxCenterX + hw
    const top = boxCenterY - hh
    const bottom = boxCenterY + hh
    
    // Calculate closest point on each edge with fraction
    const candidates: { x: number; y: number; edge: 'left' | 'right' | 'top' | 'bottom'; dist: number; fraction: number }[] = []
    
    // Right edge - clamp Y to edge bounds
    const rightY = Math.max(top, Math.min(bottom, pointY))
    const rightFraction = (rightY - top) / (bottom - top)
    candidates.push({ x: right, y: rightY, edge: 'right', dist: Math.hypot(right - pointX, rightY - pointY), fraction: rightFraction })
    
    // Left edge
    const leftY = Math.max(top, Math.min(bottom, pointY))
    const leftFraction = (leftY - top) / (bottom - top)
    candidates.push({ x: left, y: leftY, edge: 'left', dist: Math.hypot(left - pointX, leftY - pointY), fraction: leftFraction })
    
    // Bottom edge
    const bottomX = Math.max(left, Math.min(right, pointX))
    const bottomFraction = (bottomX - left) / (right - left)
    candidates.push({ x: bottomX, y: bottom, edge: 'bottom', dist: Math.hypot(bottomX - pointX, bottom - pointY), fraction: bottomFraction })
    
    // Top edge
    const topX = Math.max(left, Math.min(right, pointX))
    const topFraction = (topX - left) / (right - left)
    candidates.push({ x: topX, y: top, edge: 'top', dist: Math.hypot(topX - pointX, top - pointY), fraction: topFraction })
    
    // Return the closest
    candidates.sort((a, b) => a.dist - b.dist)
    return { x: candidates[0].x, y: candidates[0].y, edge: candidates[0].edge, fraction: candidates[0].fraction }
  }
  
  // Convert stored edge position back to coordinates
  const getPointFromEdgePosition = (
    boxCenterX: number, boxCenterY: number,
    edgePos: { edge: 'left' | 'right' | 'top' | 'bottom'; fraction: number },
    boxWidth: number = 120,
    boxHeight: number = 60
  ): { x: number; y: number } => {
    const hw = boxWidth / 2
    const hh = boxHeight / 2
    
    const left = boxCenterX - hw
    const right = boxCenterX + hw
    const top = boxCenterY - hh
    const bottom = boxCenterY + hh
    
    switch (edgePos.edge) {
      case 'right':
        return { x: right, y: top + edgePos.fraction * (bottom - top) }
      case 'left':
        return { x: left, y: top + edgePos.fraction * (bottom - top) }
      case 'bottom':
        return { x: left + edgePos.fraction * (right - left), y: bottom }
      case 'top':
        return { x: left + edgePos.fraction * (right - left), y: top }
    }
  }
  
  // Calculate the actual midpoint of a quadratic bezier curve (at t=0.5)
  const getBezierMidpoint = (
    startX: number, startY: number,
    controlX: number, controlY: number,
    endX: number, endY: number
  ): { x: number; y: number } => {
    // B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2
    return {
      x: 0.25 * startX + 0.5 * controlX + 0.25 * endX,
      y: 0.25 * startY + 0.5 * controlY + 0.25 * endY
    }
  }
  
  // Calculate the control point needed to make the curve pass through a given midpoint
  const getControlPointFromMidpoint = (
    startX: number, startY: number,
    midX: number, midY: number,
    endX: number, endY: number
  ): { x: number; y: number } => {
    // If M = 0.25*P0 + 0.5*P1 + 0.25*P2, then P1 = 2*M - 0.5*(P0 + P2)
    return {
      x: 2 * midX - 0.5 * (startX + endX),
      y: 2 * midY - 0.5 * (startY + endY)
    }
  }
  
  // Get perpendicular direction vector based on box edge
  const getPerpendicularDirection = (edge: 'left' | 'right' | 'top' | 'bottom'): { x: number; y: number } => {
    switch (edge) {
      case 'left': return { x: -1, y: 0 }
      case 'right': return { x: 1, y: 0 }
      case 'top': return { x: 0, y: -1 }
      case 'bottom': return { x: 0, y: 1 }
    }
  }
  
  // Generate a smooth SVG path through multiple waypoints with perpendicular box exits
  const generateSplinePath = (
    start: { x: number; y: number; edge?: 'left' | 'right' | 'top' | 'bottom' },
    waypointsList: Array<{ x: number; y: number }>,
    end: { x: number; y: number; edge?: 'left' | 'right' | 'top' | 'bottom' }
  ): string => {
    // Calculate perpendicular clearance distance (how far to extend before curving)
    const dist = Math.hypot(end.x - start.x, end.y - start.y)
    const clearance = Math.min(40, dist * 0.25) // At least 40px or 25% of distance
    
    // Create phantom control points for perpendicular exits
    const startDir = start.edge ? getPerpendicularDirection(start.edge) : { x: 0, y: 0 }
    const endDir = end.edge ? getPerpendicularDirection(end.edge) : { x: 0, y: 0 }
    
    // Phantom points that force perpendicularity
    const startPhantom = start.edge 
      ? { x: start.x + startDir.x * clearance, y: start.y + startDir.y * clearance }
      : null
    const endPhantom = end.edge
      ? { x: end.x + endDir.x * clearance, y: end.y + endDir.y * clearance }
      : null
    
    // Build the full point list with phantom points
    const points: Array<{ x: number; y: number }> = [start]
    if (startPhantom) points.push(startPhantom)
    points.push(...waypointsList)
    if (endPhantom) points.push(endPhantom)
    points.push(end)
    
    if (points.length === 2) {
      // Just start and end, no phantoms - straight line
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
    }
    
    if (points.length === 3) {
      // One control point (either phantom or waypoint)
      const cp = points[1]
      return `M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`
    }
    
    if (points.length === 4) {
      // Two control points - use cubic bezier
      const cp1 = points[1]
      const cp2 = points[2]
      return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`
    }
    
    // Multiple points - use Catmull-Rom spline converted to cubic Bezier
    const tension = 0.5
    
    let path = `M ${points[0].x} ${points[0].y}`
    
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[Math.min(points.length - 1, i + 2)]
      
      // Convert Catmull-Rom segment to cubic Bezier control points
      const cp1x = p1.x + (p2.x - p0.x) * tension / 3
      const cp1y = p1.y + (p2.y - p0.y) * tension / 3
      const cp2x = p2.x - (p3.x - p1.x) * tension / 3
      const cp2y = p2.y - (p3.y - p1.y) * tension / 3
      
      path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`
    }
    
    return path
  }
  
  // Get a point on the spline at parameter t (0-1) for placing labels/gates
  const getPointOnSpline = (
    start: { x: number; y: number },
    waypointsList: Array<{ x: number; y: number }>,
    end: { x: number; y: number },
    t: number = 0.5
  ): { x: number; y: number } => {
    const points = [start, ...waypointsList, end]
    
    if (points.length === 2) {
      // No waypoints - use same default curve as generateSplinePath
      const dx = end.x - start.x
      const dy = end.y - start.y
      const dist = Math.hypot(dx, dy)
      
      if (dist === 0) {
        return { x: start.x, y: start.y }
      }
      
      // Same perpendicular offset as in generateSplinePath
      const curveAmount = dist * 0.15
      const perpX = -dy / dist
      const perpY = dx / dist
      
      // Midpoint with perpendicular offset (this is the curve midpoint)
      const midX = (start.x + end.x) / 2 + perpX * curveAmount
      const midY = (start.y + end.y) / 2 + perpY * curveAmount
      
      // Calculate control point from midpoint
      const cp = getControlPointFromMidpoint(start.x, start.y, midX, midY, end.x, end.y)
      
      // Quadratic bezier at t
      const mt = 1 - t
      return {
        x: mt * mt * start.x + 2 * mt * t * cp.x + t * t * end.x,
        y: mt * mt * start.y + 2 * mt * t * cp.y + t * t * end.y
      }
    }
    
    if (points.length === 3) {
      // Quadratic bezier at t
      const wp = waypointsList[0]
      const cp = getControlPointFromMidpoint(start.x, start.y, wp.x, wp.y, end.x, end.y)
      const mt = 1 - t
      return {
        x: mt * mt * start.x + 2 * mt * t * cp.x + t * t * end.x,
        y: mt * mt * start.y + 2 * mt * t * cp.y + t * t * end.y
      }
    }
    
    // For multiple waypoints, approximate by finding the segment and interpolating
    const totalSegments = points.length - 1
    const segmentT = t * totalSegments
    const segmentIndex = Math.min(Math.floor(segmentT), totalSegments - 1)
    const localT = segmentT - segmentIndex
    
    const p1 = points[segmentIndex]
    const p2 = points[segmentIndex + 1]
    
    // Simple linear interpolation within segment for approximation
    return {
      x: p1.x + localT * (p2.x - p1.x),
      y: p1.y + localT * (p2.y - p1.y)
    }
  }
  
  // Find the closest point on the path to insert a new waypoint
  const findInsertionIndex = (
    waypointsList: Array<{ x: number; y: number }>,
    start: { x: number; y: number },
    end: { x: number; y: number },
    clickPoint: { x: number; y: number }
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
    // If bestSegment is 0, insert at index 0 (after start, before first waypoint)
    // If bestSegment is 1, insert at index 1 (after first waypoint)
    return bestSegment
  }
  
  // Calculate connection point using ray from center to target (for non-dragging cases)
  const getClosestPointOnBox = (
    boxCenterX: number, boxCenterY: number,  // Center of the box
    targetX: number, targetY: number,         // Point to connect to
    boxWidth: number = 120,
    boxHeight: number = 60
  ): { x: number; y: number; edge: 'left' | 'right' | 'top' | 'bottom' } => {
    const hw = boxWidth / 2
    const hh = boxHeight / 2
    
    // Box edges
    const left = boxCenterX - hw
    const right = boxCenterX + hw
    const top = boxCenterY - hh
    const bottom = boxCenterY + hh
    
    // Calculate intersection point with each edge
    const dx = targetX - boxCenterX
    const dy = targetY - boxCenterY
    
    // If target is at same position, default to right edge
    if (dx === 0 && dy === 0) {
      return { x: right, y: boxCenterY, edge: 'right' }
    }
    
    // Find where the line from center to target intersects each edge
    const candidates: { x: number; y: number; edge: 'left' | 'right' | 'top' | 'bottom'; dist: number }[] = []
    
    // Right edge (x = right)
    if (dx > 0) {
      const t = (right - boxCenterX) / dx
      const y = boxCenterY + t * dy
      if (y >= top && y <= bottom) {
        candidates.push({ x: right, y, edge: 'right', dist: Math.hypot(right - targetX, y - targetY) })
      }
    }
    
    // Left edge (x = left)
    if (dx < 0) {
      const t = (left - boxCenterX) / dx
      const y = boxCenterY + t * dy
      if (y >= top && y <= bottom) {
        candidates.push({ x: left, y, edge: 'left', dist: Math.hypot(left - targetX, y - targetY) })
      }
    }
    
    // Bottom edge (y = bottom)
    if (dy > 0) {
      const t = (bottom - boxCenterY) / dy
      const x = boxCenterX + t * dx
      if (x >= left && x <= right) {
        candidates.push({ x, y: bottom, edge: 'bottom', dist: Math.hypot(x - targetX, bottom - targetY) })
      }
    }
    
    // Top edge (y = top)
    if (dy < 0) {
      const t = (top - boxCenterY) / dy
      const x = boxCenterX + t * dx
      if (x >= left && x <= right) {
        candidates.push({ x, y: top, edge: 'top', dist: Math.hypot(x - targetX, top - targetY) })
      }
    }
    
    // Return the closest intersection point
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist)
      return { x: candidates[0].x, y: candidates[0].y, edge: candidates[0].edge }
    }
    
    // Fallback: determine edge based on angle
    const angle = Math.atan2(dy, dx)
    const absAngle = Math.abs(angle)
    
    if (absAngle <= Math.PI / 4) {
      return { x: right, y: boxCenterY, edge: 'right' }
    } else if (absAngle >= 3 * Math.PI / 4) {
      return { x: left, y: boxCenterY, edge: 'left' }
    } else if (angle > 0) {
      return { x: boxCenterX, y: bottom, edge: 'bottom' }
    } else {
      return { x: boxCenterX, y: top, edge: 'top' }
    }
  }

  // Render transition line
  const renderTransition = (transition: WorkflowTransition) => {
    const fromState = states.find(s => s.id === transition.from_state_id)
    const toState = states.find(s => s.id === transition.to_state_id)
    
    if (!fromState || !toState) return null
    
    const isSelected = selectedTransitionId === transition.id
    const transitionGates = gates[transition.id] || []
    const isDraggingThisTransition = draggingTransitionEndpoint?.transitionId === transition.id
    const draggingEndpoint = isDraggingThisTransition ? draggingTransitionEndpoint?.endpoint : null
    
    // Determine actual source and target positions (considering drag state)
    let sourceStatePos = { x: fromState.position_x, y: fromState.position_y }
    let targetStatePos = { x: toState.position_x, y: toState.position_y }
    
    // Get custom dimensions for each state
    const fromDims = stateDimensions[fromState.id] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }
    const toDims = stateDimensions[toState.id] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }
    
    // Check for stored edge positions
    const storedStartPos = edgePositions[`${transition.id}-start`]
    const storedEndPos = edgePositions[`${transition.id}-end`]
    
    // Calculate default connection points (for fallback) using custom dimensions
    const defaultStartPoint = getClosestPointOnBox(sourceStatePos.x, sourceStatePos.y, targetStatePos.x, targetStatePos.y, fromDims.width, fromDims.height)
    const defaultEndPoint = getClosestPointOnBox(targetStatePos.x, targetStatePos.y, sourceStatePos.x, sourceStatePos.y, toDims.width, toDims.height)
    
    // Get the fixed points (either stored or default)
    const fixedStartPoint = storedStartPos 
      ? { ...getPointFromEdgePosition(sourceStatePos.x, sourceStatePos.y, storedStartPos, fromDims.width, fromDims.height), edge: storedStartPos.edge }
      : defaultStartPoint
    const fixedEndPoint = storedEndPos
      ? { ...getPointFromEdgePosition(targetStatePos.x, targetStatePos.y, storedEndPos, toDims.width, toDims.height), edge: storedEndPos.edge }
      : defaultEndPoint
    
    let startPoint: { x: number; y: number; edge: 'left' | 'right' | 'top' | 'bottom' }
    let endPoint: { x: number; y: number; edge: 'left' | 'right' | 'top' | 'bottom' }
    
    if (draggingEndpoint === 'start') {
      // Keep END fixed, only move START
      endPoint = fixedEndPoint
      
      if (hoveredStateId) {
        const hoverState = states.find(s => s.id === hoveredStateId)
        if (hoverState) {
          // Snap start to nearest point on hovered box edge
          const hoverDims = stateDimensions[hoverState.id] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }
          startPoint = getNearestPointOnBoxEdge(hoverState.position_x, hoverState.position_y, mousePos.x, mousePos.y, hoverDims.width, hoverDims.height)
        } else {
          startPoint = { x: mousePos.x, y: mousePos.y, edge: 'right', fraction: 0.5 }
        }
      } else {
        // Dragging freely - start follows mouse
        startPoint = { x: mousePos.x, y: mousePos.y, edge: 'right', fraction: 0.5 }
      }
    } else if (draggingEndpoint === 'end') {
      // Keep START fixed, only move END
      startPoint = fixedStartPoint
      
      if (hoveredStateId) {
        const hoverState = states.find(s => s.id === hoveredStateId)
        if (hoverState) {
          // Snap end to nearest point on hovered box edge
          const hoverDims = stateDimensions[hoverState.id] || { width: DEFAULT_STATE_WIDTH, height: DEFAULT_STATE_HEIGHT }
          endPoint = getNearestPointOnBoxEdge(hoverState.position_x, hoverState.position_y, mousePos.x, mousePos.y, hoverDims.width, hoverDims.height)
        } else {
          endPoint = { x: mousePos.x, y: mousePos.y, edge: 'left', fraction: 0.5 }
        }
      } else {
        // Dragging freely - end follows mouse
        endPoint = { x: mousePos.x, y: mousePos.y, edge: 'left', fraction: 0.5 }
      }
    } else {
      // Not dragging - use the fixed points (stored or default)
      startPoint = fixedStartPoint
      endPoint = fixedEndPoint
    }
    
    const startX = startPoint.x
    const startY = startPoint.y
    const endX = endPoint.x
    const endY = endPoint.y
    
    // Line midpoint (center between endpoints)
    const lineMidX = (startX + endX) / 2
    const lineMidY = (startY + endY) / 2
    
    // Calculate bounding box for toolbar positioning (to appear above the line)
    const allLinePoints = [
      { x: startX, y: startY },
      { x: endX, y: endY },
      ...(waypoints[transition.id] || [])
    ]
    const lineMinY = Math.min(...allLinePoints.map(p => p.y)) // Topmost point
    const lineCenterX = (Math.min(...allLinePoints.map(p => p.x)) + Math.max(...allLinePoints.map(p => p.x))) / 2
    
    // Check if we're dragging this transition's curve control
    const isDraggingThisCurve = draggingCurveControl === transition.id
    const isDraggingThisLabel = draggingLabel === transition.id
    
    // Get stored waypoints for this transition
    const storedWaypoints = waypoints[transition.id] || []
    
    // Build the effective waypoints list (considering drag state)
    let effectiveWaypoints: Array<{ x: number; y: number }> = [...storedWaypoints]
    
    if (isDraggingThisCurve && tempCurvePos && draggingWaypointIndex !== null) {
      // Update the waypoint being dragged
      effectiveWaypoints = [...storedWaypoints]
      if (draggingWaypointIndex < effectiveWaypoints.length) {
        effectiveWaypoints[draggingWaypointIndex] = { x: tempCurvePos.x, y: tempCurvePos.y }
      }
    }
    
    // Generate path based on path type setting
    const start = { x: startX, y: startY, edge: startPoint.edge }
    const end = { x: endX, y: endY, edge: endPoint.edge }
    const pathType = transition.line_path_type || 'spline'
    
    let pathD: string
    let curveMid: { x: number; y: number }
    
    if (pathType === 'straight') {
      // Simple straight line
      pathD = `M ${startX} ${startY} L ${endX} ${endY}`
      curveMid = { x: (startX + endX) / 2, y: (startY + endY) / 2 }
    } else if (pathType === 'elbow') {
      // Orthogonal elbow path - always exits perpendicular to start edge, enters perpendicular to end edge
      // Uses the edge information from the connection points
      const startEdge = startPoint.edge
      const endEdge = endPoint.edge
      
      // Minimum distance to travel before turning (clearance from box)
      const TURN_OFFSET = 30
      
      // Build path segments based on exit/entry directions
      const segments: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]
      
      // Determine exit direction and first waypoint
      let exitX = startX
      let exitY = startY
      
      if (startEdge === 'right') {
        exitX = startX + TURN_OFFSET
        exitY = startY
      } else if (startEdge === 'left') {
        exitX = startX - TURN_OFFSET
        exitY = startY
      } else if (startEdge === 'top') {
        exitX = startX
        exitY = startY - TURN_OFFSET
      } else if (startEdge === 'bottom') {
        exitX = startX
        exitY = startY + TURN_OFFSET
      }
      
      // Determine entry direction and approach point
      let entryX = endX
      let entryY = endY
      
      if (endEdge === 'right') {
        entryX = endX + TURN_OFFSET
        entryY = endY
      } else if (endEdge === 'left') {
        entryX = endX - TURN_OFFSET
        entryY = endY
      } else if (endEdge === 'top') {
        entryX = endX
        entryY = endY - TURN_OFFSET
      } else if (endEdge === 'bottom') {
        entryX = endX
        entryY = endY + TURN_OFFSET
      }
      
      // Add exit point
      segments.push({ x: exitX, y: exitY })
      
      // Connect exit to entry with orthogonal segments
      // Determine if we need 1 or 2 intermediate turns
      const exitHorizontal = startEdge === 'left' || startEdge === 'right'
      const entryHorizontal = endEdge === 'left' || endEdge === 'right'
      
      if (exitHorizontal && entryHorizontal) {
        // Both horizontal - need vertical connector in middle
        const midX = (exitX + entryX) / 2
        segments.push({ x: midX, y: exitY })
        segments.push({ x: midX, y: entryY })
      } else if (!exitHorizontal && !entryHorizontal) {
        // Both vertical - need horizontal connector in middle
        const midY = (exitY + entryY) / 2
        segments.push({ x: exitX, y: midY })
        segments.push({ x: entryX, y: midY })
      } else if (exitHorizontal && !entryHorizontal) {
        // Exit horizontal, entry vertical - one corner
        segments.push({ x: entryX, y: exitY })
      } else {
        // Exit vertical, entry horizontal - one corner
        segments.push({ x: exitX, y: entryY })
      }
      
      // Add approach point and end
      segments.push({ x: entryX, y: entryY })
      segments.push({ x: endX, y: endY })
      
      // Build path string
      pathD = segments.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
      
      // Calculate midpoint for label positioning (middle segment)
      const midIdx = Math.floor(segments.length / 2)
      curveMid = {
        x: (segments[midIdx - 1].x + segments[midIdx].x) / 2,
        y: (segments[midIdx - 1].y + segments[midIdx].y) / 2
      }
    } else {
      // Spline (curved) - use existing spline function with waypoints
      pathD = generateSplinePath(start, effectiveWaypoints, end)
      curveMid = getPointOnSpline(start, effectiveWaypoints, end, 0.5)
    }
    const curveMidX = curveMid.x
    const curveMidY = curveMid.y
    
    // Label position - can be dragged separately
    const storedLabelOffset = labelOffsets[transition.id]
    let labelX: number, labelY: number
    
    if (isDraggingThisLabel && tempLabelPos) {
      labelX = tempLabelPos.x
      labelY = tempLabelPos.y
    } else if (storedLabelOffset) {
      labelX = lineMidX + storedLabelOffset.x
      labelY = lineMidY + storedLabelOffset.y
    } else {
      // Default: above the curve midpoint
      labelX = curveMidX
      labelY = curveMidY - 20
    }
    
    // Position for gate indicator (below curve midpoint)
    const gateX = curveMidX
    const gateY = curveMidY + 15
    
    return (
      <g key={transition.id}>
        {/* Clickable wider path for selection */}
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth="20"
          className="cursor-pointer"
          onMouseEnter={() => setHoveredTransitionId(transition.id)}
          onMouseLeave={() => setHoveredTransitionId(null)}
          onClick={(e) => {
            e.stopPropagation()
            setSelectedTransitionId(transition.id)
            setSelectedStateId(null)
            // Show floating toolbar above the topmost point of the line (store canvas coordinates)
            setFloatingToolbar({
              canvasX: lineCenterX,
              canvasY: lineMinY, // Topmost point of line
              type: 'transition',
              targetId: transition.id
            })
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            if (isAdmin) {
              // Get click position in canvas coordinates
              const rect = canvasRef.current?.getBoundingClientRect()
              if (rect) {
                const clickX = (e.clientX - rect.left - pan.x) / zoom
                const clickY = (e.clientY - rect.top - pan.y) / zoom
                
                // Find where to insert the new waypoint
                const currentWaypoints = waypoints[transition.id] || []
                const insertIndex = findInsertionIndex(
                  currentWaypoints,
                  { x: startX, y: startY },
                  { x: endX, y: endY },
                  { x: clickX, y: clickY }
                )
                
                // Insert new waypoint at click position
                const newWaypoints = [...currentWaypoints]
                newWaypoints.splice(insertIndex, 0, { x: clickX, y: clickY })
                
                setWaypoints(prev => ({
                  ...prev,
                  [transition.id]: newWaypoints
                }))
                
                addToast('info', 'Control point added')
              }
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            // Right-click shows waypoint context menu for adding control points
            setSelectedTransitionId(transition.id)
            setSelectedStateId(null)
            
            // Get click position in canvas coordinates
            const rect = canvasRef.current?.getBoundingClientRect()
            if (rect) {
              const clickX = (e.clientX - rect.left - pan.x) / zoom
              const clickY = (e.clientY - rect.top - pan.y) / zoom
              
              setWaypointContextMenu({
                x: e.clientX,
                y: e.clientY,
                canvasX: clickX,
                canvasY: clickY,
                transitionId: transition.id,
                waypointIndex: null // null = clicking on line, not on existing waypoint
              })
            }
          }}
        />
        
        {/* Visible path */}
        {(() => {
          // Just change color when selected, no weight change or background highlight
          const lineColor = isDraggingThisTransition ? '#60a5fa' : isSelected ? '#60a5fa' : transition.line_color || '#6b7280'
          const strokeWidth = transition.line_thickness || 2
          const arrowHead = transition.line_arrow_head || 'end'
          
          // Determine markers based on arrow head setting
          let markerStart: string | undefined
          let markerEnd: string | undefined
          
          if (isSelected || isDraggingThisTransition) {
            if (arrowHead === 'end' || arrowHead === 'both') {
              markerEnd = 'url(#arrowhead-selected)'
            }
            if (arrowHead === 'start' || arrowHead === 'both') {
              markerStart = 'url(#arrowhead-start-selected)'
            }
          } else {
            if (arrowHead === 'end' || arrowHead === 'both') {
              markerEnd = `url(#arrowhead-${transition.id})`
            }
            if (arrowHead === 'start' || arrowHead === 'both') {
              markerStart = `url(#arrowhead-start-${transition.id})`
            }
          }
          
          return (
            <path
              d={pathD}
              fill="none"
              stroke={lineColor}
              strokeWidth={strokeWidth}
              strokeDasharray={isDraggingThisTransition ? '6,3' : transition.line_style === 'dashed' ? '8,4' : transition.line_style === 'dotted' ? '2,4' : 'none'}
              markerStart={markerStart}
              markerEnd={markerEnd}
              className="pointer-events-none"
            />
          )
        })()}
        
        {/* Handles are rendered in a separate layer above states */}
        
        {/* Transition label - positioned near the curve (hidden when selected since handles layer shows it) */}
        {transition.name && !isDraggingThisTransition && !isSelected && (
          <g transform={`translate(${labelX}, ${labelY})`}>
            <rect
              x={-(transition.name.length * 3.5 + 8)}
              y="-10"
              width={transition.name.length * 7 + 16}
              height="18"
              rx="4"
              fill="rgba(31, 41, 55, 0.9)"
              stroke="rgba(75, 85, 99, 0.5)"
              strokeWidth="1"
            />
            <text
              x="0"
              y="3"
              textAnchor="middle"
              fontSize="10"
              fill="#d1d5db"
              className="select-none pointer-events-none"
            >
              {transition.name}
            </text>
          </g>
        )}
        
        {/* Gate indicator - clickable, positioned separately */}
        {transitionGates.length > 0 && !isDraggingThisTransition && (
          <g 
            transform={`translate(${gateX}, ${gateY})`}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              setSelectedTransitionId(transition.id)
              setSelectedStateId(null)
            }}
          >
            <circle 
              r="12" 
              fill="#f59e0b" 
              stroke="#fff" 
              strokeWidth="2"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="11"
              fontWeight="700"
              fill="#000"
              className="select-none pointer-events-none"
            >
              {transitionGates.length}
            </text>
            {/* Tooltip hint */}
            <title>{transitionGates.length} gate{transitionGates.length > 1 ? 's' : ''} - click to view</title>
          </g>
        )}
      </g>
    )
  }
  
  // Render creating transition line
  const renderCreatingTransition = () => {
    if (!isCreatingTransition || !transitionStartId) return null
    
    const fromState = states.find(s => s.id === transitionStartId)
    if (!fromState) return null
    
    // Find nearest point on source box edge to the mouse
    const startPoint = getNearestPointOnBoxEdge(
      fromState.position_x, fromState.position_y,
      mousePos.x, mousePos.y
    )
    
    // Calculate midpoint for curved path
    const midX = (startPoint.x + mousePos.x) / 2
    const midY = (startPoint.y + mousePos.y) / 2
    const curveOffset = 30
    
    // Curve the line slightly
    let controlX = midX
    let controlY = midY - curveOffset
    
    if (startPoint.edge === 'bottom' || startPoint.edge === 'top') {
      controlX = midX + curveOffset
      controlY = midY
    }
    
    const pathD = `M ${startPoint.x} ${startPoint.y} Q ${controlX} ${controlY} ${mousePos.x} ${mousePos.y}`
    
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
  
  // Render transition handles in a separate layer (above states)
  const renderTransitionHandles = () => {
    if (!isAdmin) return null
    
    return transitions.map(transition => {
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
      // Always show waypoints when selected (even for non-spline) so user can manage them
      const transitionWaypoints = waypoints[transition.id] || []
      const lineMidX = (startPoint.x + endPoint.x) / 2
      const lineMidY = (startPoint.y + endPoint.y) / 2
      
      // Calculate curve midpoint for label positioning
      const curveMid = pathType === 'spline' 
        ? getPointOnSpline(
            { x: startPoint.x, y: startPoint.y },
            transitionWaypoints,
            { x: endPoint.x, y: endPoint.y },
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
          {/* Start handle - small sleek circle */}
          <g
            transform={`translate(${startPoint.x}, ${startPoint.y})`}
            className="cursor-grab"
            style={{ pointerEvents: 'all' }}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setFloatingToolbar(null) // Hide toolbar when dragging starts
              setDraggingTransitionEndpoint({
                transitionId: transition.id,
                endpoint: 'start',
                originalStateId: transition.from_state_id
              })
            }}
          >
            {/* Invisible hit area */}
            <circle r="12" fill="transparent" />
            {/* Sleek visible handle */}
            <circle
              r="5"
              fill="#60a5fa"
              stroke="#fff"
              strokeWidth="1.5"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            />
            <title>Drag to reconnect start</title>
          </g>
          
          {/* Waypoint handles - one for each waypoint (always shown when selected) */}
          {transitionWaypoints.map((waypoint, index) => {
            const isDraggingThisWaypoint = draggingCurveControl === transition.id && draggingWaypointIndex === index
            const wpX = isDraggingThisWaypoint && tempCurvePos ? tempCurvePos.x : waypoint.x
            const wpY = isDraggingThisWaypoint && tempCurvePos ? tempCurvePos.y : waypoint.y
            const isActiveForPathType = pathType === 'spline'
            const lineColor = transition.line_color || '#6b7280'
            const isHovered = hoveredWaypoint?.transitionId === transition.id && hoveredWaypoint?.index === index
            
            return (
              <g
                key={`waypoint-${index}`}
                transform={`translate(${wpX}, ${wpY})`}
                className="cursor-move"
                style={{ pointerEvents: 'all', opacity: isActiveForPathType ? 1 : 0.5 }}
                onMouseEnter={() => setHoveredWaypoint({ transitionId: transition.id, index })}
                onMouseLeave={() => setHoveredWaypoint(null)}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setFloatingToolbar(null) // Hide toolbar when dragging starts
                  setWaypointContextMenu(null) // Close waypoint menu if open
                  setDraggingCurveControl(transition.id)
                  setDraggingWaypointIndex(index)
                  setTempCurvePos({ x: wpX, y: wpY })
                  waypointDragStartRef.current = { x: e.clientX, y: e.clientY }
                  waypointHasDraggedRef.current = false
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  // Only delete if we haven't dragged
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
                  // Show context menu for this waypoint (with delete option)
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
                {/* Invisible hit area */}
                <circle r="12" fill="transparent" />
                {/* Hover highlight ring */}
                {isHovered && !isDraggingThisWaypoint && (
                  <circle
                    r="9"
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="2"
                    opacity="0.3"
                  />
                )}
                {/* White circle with line color border */}
                <circle
                  r="5"
                  fill={isDraggingThisWaypoint ? lineColor : (isHovered ? '#f0f0f0' : '#ffffff')}
                  stroke={isActiveForPathType ? lineColor : '#888'}
                  strokeWidth={isHovered || isDraggingThisWaypoint ? 2.5 : 2}
                  strokeDasharray={isActiveForPathType ? undefined : '2,2'}
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
                />
                <title>
                  {isActiveForPathType 
                    ? `Drag to adjust • Double-click or right-click to remove`
                    : `Control point (inactive - only used for spline paths)`
                  }
                </title>
              </g>
            )
          })}
          
          {/* Show "add waypoint" hint when no waypoints exist (spline mode only) */}
          {pathType === 'spline' && transitionWaypoints.length === 0 && (
            <g
              transform={`translate(${curveMidX}, ${curveMidY})`}
              className="pointer-events-none"
            >
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
          
          {/* Label as draggable handle - the label itself is the handle */}
          {transition.name && (
            <g
              transform={`translate(${actualLabelX}, ${actualLabelY})`}
              className="cursor-move"
              style={{ pointerEvents: 'all' }}
              onMouseDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setDraggingLabel(transition.id)
                setTempLabelPos({ x: actualLabelX, y: actualLabelY })
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                // Reset label position
                setLabelOffsets(prev => {
                  const next = { ...prev }
                  delete next[transition.id]
                  return next
                })
                addToast('info', 'Label position reset')
              }}
            >
              {/* Label background - this is the draggable element */}
              <rect
                x={-(transition.name.length * 3.5 + 8)}
                y="-10"
                width={transition.name.length * 7 + 16}
                height="18"
                rx="4"
                fill="rgba(31, 41, 55, 0.95)"
                stroke={isDraggingThisLabel ? '#60a5fa' : 'rgba(96, 165, 250, 0.6)'}
                strokeWidth={isDraggingThisLabel ? 2 : 1}
                style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.3))' }}
              />
              <text
                x="0"
                y="3"
                textAnchor="middle"
                fontSize="10"
                fill="#d1d5db"
                className="select-none pointer-events-none"
              >
                {transition.name}
              </text>
              <title>Drag to move label (double-click to reset)</title>
            </g>
          )}
          
          {/* End handle - small sleek circle with arrow indicator */}
          <g
            transform={`translate(${endPoint.x}, ${endPoint.y})`}
            className="cursor-grab"
            style={{ pointerEvents: 'all' }}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setFloatingToolbar(null) // Hide toolbar when dragging starts
              setDraggingTransitionEndpoint({
                transitionId: transition.id,
                endpoint: 'end',
                originalStateId: transition.to_state_id
              })
            }}
          >
            {/* Invisible hit area */}
            <circle r="12" fill="transparent" />
            {/* Sleek visible handle */}
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
    })
  }
  
  if (!organization) {
    return (
      <div className="p-4 text-sm text-plm-fg-muted text-center">
        Sign in to manage workflows
      </div>
    )
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="spinner" />
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Unified header bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-plm-border bg-plm-bg-light overflow-visible relative z-20">
        {/* Workflow selector */}
        <select
          value={selectedWorkflow?.id || ''}
          onChange={(e) => {
            const workflow = workflows.find(w => w.id === e.target.value)
            if (workflow) selectWorkflow(workflow)
          }}
          className="bg-plm-input border border-plm-border rounded px-2 py-1 text-sm min-w-[140px]"
          title={selectedWorkflow?.description || 'Select workflow'}
        >
          <option value="">Select workflow...</option>
          {workflows.map(w => (
            <option key={w.id} value={w.id}>
              {w.name} {w.is_default ? '(default)' : ''}
            </option>
          ))}
        </select>
        
        {isAdmin && (
          <button
            onClick={() => setShowCreateWorkflow(true)}
            className="p-1 hover:bg-plm-bg rounded text-plm-accent"
            title="Create new workflow"
          >
            <Plus size={14} />
          </button>
        )}
        
        {isAdmin && selectedWorkflow && (
          <button
            onClick={() => setShowEditWorkflow(true)}
            className="p-1 hover:bg-plm-bg rounded text-plm-fg-muted hover:text-plm-fg"
            title="Edit workflow name & description"
          >
            <Edit3 size={14} />
          </button>
        )}
        
        {selectedWorkflow && (
          <>
            <div className="w-px h-4 bg-plm-border mx-1" />
          <button
            onClick={() => {
              setCanvasMode('select')
              cancelConnectMode()
            }}
            className={`p-1.5 rounded ${canvasMode === 'select' && !isCreatingTransition ? 'bg-plm-accent text-white' : 'hover:bg-plm-bg'}`}
            title="Select mode (Esc)"
          >
            <MousePointer size={14} />
          </button>
          <button
            onClick={() => {
              setCanvasMode('pan')
              cancelConnectMode()
            }}
            className={`p-1.5 rounded ${canvasMode === 'pan' ? 'bg-plm-accent text-white' : 'hover:bg-plm-bg'}`}
            title="Pan mode"
          >
            <Move size={14} />
          </button>
          {isAdmin && (
            <button
              onClick={() => setCanvasMode('connect')}
              className={`p-1.5 rounded ${canvasMode === 'connect' || isCreatingTransition ? 'bg-green-600 text-white' : 'hover:bg-plm-bg'}`}
              title="Connect mode - draw transitions"
            >
              <ArrowRight size={14} />
            </button>
          )}
          
          {/* Cancel button when connecting */}
          {isCreatingTransition && (
            <button
              onClick={cancelConnectMode}
              className="p-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400"
              title="Cancel (Esc)"
            >
              <X size={14} />
            </button>
          )}
          
          <div className="w-px h-4 bg-plm-border mx-1" />
          
          <button
            onClick={() => setZoom(Math.min(2, zoom * 1.2))}
            className="p-1.5 hover:bg-plm-bg rounded"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <span className="text-xs text-plm-fg-muted min-w-[40px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(Math.max(0.25, zoom * 0.8))}
            className="p-1.5 hover:bg-plm-bg rounded"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => {
              setZoom(1)
              setPan({ x: 0, y: 0 })
            }}
            className="p-1.5 hover:bg-plm-bg rounded text-xs"
            title="Reset view"
          >
            1:1
          </button>
          
          <div className="w-px h-4 bg-plm-border mx-1" />
          
          {/* Snap settings button */}
          <div className="relative overflow-visible">
            <button
              onClick={() => setShowSnapSettings(!showSnapSettings)}
              className={`p-1.5 rounded flex items-center gap-1 ${
                (snapSettings.snapToGrid || snapSettings.snapToAlignment) 
                  ? 'bg-plm-accent/20 text-plm-accent' 
                  : 'hover:bg-plm-bg'
              }`}
              title="Snap settings"
            >
              <Magnet size={14} />
              <ChevronDown size={10} className={showSnapSettings ? 'rotate-180' : ''} />
            </button>
            
            {/* Snap settings dropdown */}
            {showSnapSettings && (
              <div className="absolute top-full left-0 mt-1 w-52 bg-plm-bg-light border border-plm-border rounded-lg shadow-lg z-[100] p-2.5">
                <div className="text-xs font-medium text-plm-fg mb-2 flex items-center gap-1.5">
                  <Settings2 size={11} />
                  Snap Settings
                </div>
                
                {/* Snap to Grid */}
                <label className="flex items-center gap-1.5 mb-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={snapSettings.snapToGrid}
                    onChange={(e) => setSnapSettings(prev => ({ ...prev, snapToGrid: e.target.checked }))}
                    className="rounded border-plm-border bg-plm-bg text-plm-accent focus:ring-plm-accent w-3 h-3"
                  />
                  <Grid size={11} className="text-plm-fg-muted group-hover:text-plm-fg shrink-0" />
                  <span className="text-[11px] text-plm-fg">Snap to Grid</span>
                </label>
                
                {/* Grid Size */}
                <div className="mb-1.5 pl-4">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="10"
                      value={snapSettings.gridSize}
                      onChange={(e) => setSnapSettings(prev => ({ ...prev, gridSize: parseInt(e.target.value) }))}
                      className="flex-1 h-1 bg-plm-border rounded appearance-none cursor-pointer min-w-0"
                    />
                    <span className="text-[10px] text-plm-fg-muted w-9 text-right shrink-0">{snapSettings.gridSize}px</span>
                  </div>
                </div>
                
                <div className="w-full h-px bg-plm-border my-1.5" />
                
                {/* Snap to Alignment */}
                <label className="flex items-center gap-1.5 mb-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={snapSettings.snapToAlignment}
                    onChange={(e) => setSnapSettings(prev => ({ ...prev, snapToAlignment: e.target.checked }))}
                    className="rounded border-plm-border bg-plm-bg text-plm-accent focus:ring-plm-accent w-3 h-3"
                  />
                  <AlignVerticalJustifyCenter size={11} className="text-plm-fg-muted group-hover:text-plm-fg shrink-0" />
                  <span className="text-[11px] text-plm-fg">Snap to Alignment</span>
                </label>
                
                {/* Alignment Threshold */}
                <div className="pl-4">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min="5"
                      max="30"
                      step="5"
                      value={snapSettings.alignmentThreshold}
                      onChange={(e) => setSnapSettings(prev => ({ ...prev, alignmentThreshold: parseInt(e.target.value) }))}
                      className="flex-1 h-1 bg-plm-border rounded appearance-none cursor-pointer min-w-0"
                    />
                    <span className="text-[10px] text-plm-fg-muted w-9 text-right shrink-0">{snapSettings.alignmentThreshold}px</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex-1" />
          
          {/* Export/Import buttons */}
          <button
            onClick={exportWorkflow}
            className="p-1.5 hover:bg-plm-bg rounded"
            title="Export workflow to JSON"
          >
            <Download size={14} />
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => importInputRef.current?.click()}
                className="p-1.5 hover:bg-plm-bg rounded"
                title="Import workflow from JSON"
              >
                <Upload size={14} />
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    importWorkflow(file)
                    e.target.value = '' // Reset input
                  }
                }}
              />
            </>
          )}
          
          <div className="w-px h-4 bg-plm-border mx-1" />
          
          {isAdmin && (
            <button
              onClick={addState}
              className="flex items-center gap-1 px-2 py-1 bg-plm-accent hover:bg-plm-accent-hover rounded text-white text-xs"
            >
              <Plus size={12} />
              Add State
            </button>
          )}
          </>
        )}
      </div>
      
      {/* Visual canvas */}
      {selectedWorkflow && (
        <div 
          ref={canvasRef}
          className="flex-1 overflow-hidden bg-plm-bg relative"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={() => {
            handleCanvasMouseUp()
            // Cancel dragging if mouse leaves canvas
            if (draggingStateId) {
              setDraggingStateId(null)
            }
            if (draggingTransitionEndpoint) {
              setDraggingTransitionEndpoint(null)
              setHoveredStateId(null)
            }
          }}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          style={{ 
            cursor: draggingStateId || draggingTransitionEndpoint
              ? 'grabbing'
              : canvasMode === 'pan' 
                ? (isDragging ? 'grabbing' : 'grab') 
                : isCreatingTransition 
                  ? 'crosshair' 
                  : 'default' 
          }}
        >
          {/* Mode indicator */}
          {(isCreatingTransition || canvasMode === 'connect' || draggingTransitionEndpoint || (isAdmin && canvasMode === 'select' && states.length > 0)) && (
            <div className="absolute top-2 left-2 z-10 bg-plm-bg-light/95 border border-plm-border rounded px-2 py-1 text-xs text-plm-fg-muted flex items-center gap-2 backdrop-blur-sm">
              {draggingTransitionEndpoint ? (
                <>
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <span>{hoveredStateId ? 'Release to connect' : 'Drag to a state to reconnect'}</span>
                </>
              ) : isCreatingTransition ? (
                <>
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span>Click a state to connect, or press ESC to cancel</span>
                </>
              ) : canvasMode === 'connect' ? (
                <>
                  <ArrowRight size={12} className="text-green-500" />
                  <span>Click green dots to create transitions</span>
                </>
              ) : draggingStateId ? (
                <>
                  <GripHorizontal size={12} className="text-blue-400" />
                  <span>Release to place state</span>
                </>
              ) : selectedTransitionId ? (
                <>
                  <ArrowRight size={12} className="text-blue-400" />
                  <span>Drag blue handles to reconnect arrow endpoints</span>
                </>
              ) : (
                <>
                  <GripHorizontal size={12} />
                  <span>Drag states to reposition • Select arrows to edit</span>
                </>
              )}
            </div>
          )}
          
          {/* Grid pattern */}
          <svg 
            className="absolute inset-0 w-full h-full"
            style={{ 
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0'
            }}
          >
            {/* Definitions */}
            <defs>
              {/* Grid pattern - uses configurable grid size */}
              <pattern id="grid" width={snapSettings.gridSize} height={snapSettings.gridSize} patternUnits="userSpaceOnUse">
                <path 
                  d={`M ${snapSettings.gridSize} 0 L 0 0 0 ${snapSettings.gridSize}`} 
                  fill="none" 
                  stroke="#374151" 
                  strokeWidth="0.5" 
                  opacity={snapSettings.snapToGrid ? "0.5" : "0.3"} 
                />
              </pattern>
              
              {/* Arrow marker - end (default) */}
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
              </marker>
              
              {/* Arrow marker - end (selected) */}
              <marker
                id="arrowhead-selected"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#60a5fa" />
              </marker>
              
              {/* Arrow marker - start (default) - points backwards */}
              <marker
                id="arrowhead-start"
                markerWidth="10"
                markerHeight="7"
                refX="1"
                refY="3.5"
                orient="auto"
              >
                <polygon points="10 0, 0 3.5, 10 7" fill="#6b7280" />
              </marker>
              
              {/* Arrow marker - start (selected) */}
              <marker
                id="arrowhead-start-selected"
                markerWidth="10"
                markerHeight="7"
                refX="1"
                refY="3.5"
                orient="auto"
              >
                <polygon points="10 0, 0 3.5, 10 7" fill="#60a5fa" />
              </marker>
              
              {/* Arrow marker - creating (green) */}
              <marker
                id="arrowhead-creating"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e" />
              </marker>
              
              {/* Generate color-specific markers for each transition */}
              {transitions.map(t => {
                const color = t.line_color || '#6b7280'
                return (
                  <g key={`markers-${t.id}`}>
                    <marker
                      id={`arrowhead-${t.id}`}
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill={color} />
                    </marker>
                    <marker
                      id={`arrowhead-start-${t.id}`}
                      markerWidth="10"
                      markerHeight="7"
                      refX="1"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="10 0, 0 3.5, 10 7" fill={color} />
                    </marker>
                  </g>
                )
              })}
            </defs>
            
            {/* Grid background */}
            <rect width="2000" height="2000" x="-500" y="-500" fill="url(#grid)" />
            
            {/* Alignment guide lines */}
            {alignmentGuides.vertical !== null && (
              <line
                x1={alignmentGuides.vertical}
                y1={-500}
                x2={alignmentGuides.vertical}
                y2={2000}
                stroke="#60a5fa"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.8"
              />
            )}
            {alignmentGuides.horizontal !== null && (
              <line
                x1={-500}
                y1={alignmentGuides.horizontal}
                x2={2000}
                y2={alignmentGuides.horizontal}
                stroke="#60a5fa"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.8"
              />
            )}
            
            {/* Transitions (render first so they're behind states) */}
            {transitions.map(renderTransition)}
            
            {/* Creating transition line */}
            {renderCreatingTransition()}
            
            {/* States */}
            {states.map(renderStateNode)}
            
            {/* Transition handles (rendered last so they appear above everything) */}
            {renderTransitionHandles()}
          </svg>
          
          {/* Empty state */}
          {states.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-plm-fg-muted">
                <GitBranch size={48} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No states defined</p>
                {isAdmin && (
                  <button
                    onClick={addState}
                    className="mt-2 text-plm-accent hover:underline text-sm"
                  >
                    Add your first state
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Context menu for states and transitions */}
      {contextMenu && (
        <WorkflowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          isAdmin={isAdmin}
          targetState={contextMenu.type === 'state' ? states.find(s => s.id === contextMenu.targetId) : undefined}
          targetTransition={contextMenu.type === 'transition' ? transitions.find(t => t.id === contextMenu.targetId) : undefined}
          gates={contextMenu.type === 'transition' ? gates[contextMenu.targetId] || [] : []}
          allStates={states}
          hasWaypoints={contextMenu.type === 'transition' && (waypoints[contextMenu.targetId]?.length || 0) > 0}
          onEdit={() => {
            if (contextMenu.type === 'state') {
              const state = states.find(s => s.id === contextMenu.targetId)
              if (state) {
                setEditingState(state)
                setShowEditState(true)
              }
            } else {
              const transition = transitions.find(t => t.id === contextMenu.targetId)
              if (transition) {
                setEditingTransition(transition)
                setShowEditTransition(true)
              }
            }
            setContextMenu(null)
          }}
          onDelete={() => {
            if (contextMenu.type === 'state') {
              deleteState(contextMenu.targetId)
            } else {
              deleteTransition(contextMenu.targetId)
            }
            setContextMenu(null)
          }}
          onAddGate={() => {
            if (contextMenu.type === 'transition') {
              addGate(contextMenu.targetId)
            }
            setContextMenu(null)
          }}
          onResetWaypoints={() => {
            if (contextMenu.type === 'transition') {
              setWaypoints(prev => {
                const next = { ...prev }
                delete next[contextMenu.targetId]
                return next
              })
              addToast('info', 'Control points reset')
            }
            setContextMenu(null)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
      
      {/* Waypoint context menu (for adding/deleting control points) */}
      {waypointContextMenu && (
        <div
          className="fixed bg-plm-bg-light border border-plm-border rounded-lg shadow-xl z-[100] py-1 min-w-[160px]"
          style={{
            left: waypointContextMenu.x,
            top: waypointContextMenu.y,
            transform: 'translate(-50%, 8px)' // Center horizontally, offset down
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Add control point option (always show when clicking on line) */}
          {waypointContextMenu.waypointIndex === null && (
            <button
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-plm-bg flex items-center gap-2"
              onClick={() => {
                const transition = transitions.find(t => t.id === waypointContextMenu.transitionId)
                if (transition) {
                  const fromState = states.find(s => s.id === transition.from_state_id)
                  const toState = states.find(s => s.id === transition.to_state_id)
                  if (fromState && toState) {
                    const currentWaypoints = waypoints[waypointContextMenu.transitionId] || []
                    const insertIndex = findInsertionIndex(
                      currentWaypoints,
                      { x: fromState.position_x, y: fromState.position_y },
                      { x: toState.position_x, y: toState.position_y },
                      { x: waypointContextMenu.canvasX, y: waypointContextMenu.canvasY }
                    )
                    
                    const newWaypoints = [...currentWaypoints]
                    newWaypoints.splice(insertIndex, 0, { 
                      x: waypointContextMenu.canvasX, 
                      y: waypointContextMenu.canvasY 
                    })
                    
                    setWaypoints(prev => ({
                      ...prev,
                      [waypointContextMenu.transitionId]: newWaypoints
                    }))
                    addToast('info', 'Control point added')
                  }
                }
                setWaypointContextMenu(null)
              }}
            >
              <Plus size={14} />
              Add control point
            </button>
          )}
          
          {/* Delete control point option (only show when clicking on existing waypoint) */}
          {waypointContextMenu.waypointIndex !== null && (
            <button
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-plm-bg flex items-center gap-2 text-red-400 hover:text-red-300"
              onClick={() => {
                const idx = waypointContextMenu.waypointIndex
                if (idx !== null) {
                  setWaypoints(prev => {
                    const currentWaypoints = [...(prev[waypointContextMenu.transitionId] || [])]
                    currentWaypoints.splice(idx, 1)
                    if (currentWaypoints.length === 0) {
                      const next = { ...prev }
                      delete next[waypointContextMenu.transitionId]
                      return next
                    }
                    return { ...prev, [waypointContextMenu.transitionId]: currentWaypoints }
                  })
                  addToast('info', 'Control point removed')
                }
                setWaypointContextMenu(null)
              }}
            >
              <Trash2 size={14} />
              Delete control point
            </button>
          )}
        </div>
      )}
      
      {/* Floating toolbar */}
      {floatingToolbar && (() => {
        // Compute screen position from canvas coordinates (updates with pan/zoom)
        const rect = canvasRef.current?.getBoundingClientRect()
        const screenX = rect ? rect.left + pan.x + floatingToolbar.canvasX * zoom : 0
        // Position above the element with a gap (50px in screen space)
        const screenY = rect ? rect.top + pan.y + floatingToolbar.canvasY * zoom - 50 : 0
        return (
        <FloatingToolbar
          x={screenX}
          y={screenY}
          type={floatingToolbar.type}
          isAdmin={isAdmin}
          targetState={floatingToolbar.type === 'state' ? states.find(s => s.id === floatingToolbar.targetId) : undefined}
          targetTransition={floatingToolbar.type === 'transition' ? transitions.find(t => t.id === floatingToolbar.targetId) : undefined}
          onColorChange={async (color: string) => {
            if (floatingToolbar.type === 'state') {
              try {
                await supabase
                  .from('workflow_states')
                  .update({ color })
                  .eq('id', floatingToolbar.targetId)
                setStates(states.map(s => 
                  s.id === floatingToolbar.targetId ? { ...s, color } : s
                ))
              } catch (err) {
                console.error('Failed to update state color:', err)
              }
            } else {
              try {
                await supabase
                  .from('workflow_transitions')
                  .update({ line_color: color })
                  .eq('id', floatingToolbar.targetId)
                setTransitions(transitions.map(t => 
                  t.id === floatingToolbar.targetId ? { ...t, line_color: color } : t
                ))
              } catch (err) {
                console.error('Failed to update transition color:', err)
              }
            }
          }}
          onLineStyleChange={async (style: TransitionLineStyle) => {
            if (floatingToolbar.type === 'transition') {
              try {
                await supabase
                  .from('workflow_transitions')
                  .update({ line_style: style })
                  .eq('id', floatingToolbar.targetId)
                setTransitions(transitions.map(t => 
                  t.id === floatingToolbar.targetId ? { ...t, line_style: style } : t
                ))
              } catch (err) {
                console.error('Failed to update line style:', err)
              }
            }
          }}
          onPathTypeChange={async (pathType: TransitionPathType) => {
            if (floatingToolbar.type === 'transition') {
              try {
                await supabase
                  .from('workflow_transitions')
                  .update({ line_path_type: pathType })
                  .eq('id', floatingToolbar.targetId)
                setTransitions(transitions.map(t => 
                  t.id === floatingToolbar.targetId ? { ...t, line_path_type: pathType } : t
                ))
                // When switching TO spline, ensure there's at least one waypoint
                if (pathType === 'spline') {
                  const existingWaypoints = waypoints[floatingToolbar.targetId]
                  if (!existingWaypoints || existingWaypoints.length === 0) {
                    // Create a default waypoint at the midpoint
                    const transition = transitions.find(t => t.id === floatingToolbar.targetId)
                    if (transition) {
                      const fromState = states.find(s => s.id === transition.from_state_id)
                      const toState = states.find(s => s.id === transition.to_state_id)
                      if (fromState && toState) {
                        const midX = (fromState.position_x + toState.position_x) / 2
                        const midY = (fromState.position_y + toState.position_y) / 2 - 40 // Offset up for curve
                        setWaypoints(prev => ({
                          ...prev,
                          [floatingToolbar.targetId]: [{ x: midX, y: midY }]
                        }))
                      }
                    }
                  }
                }
                // Note: We preserve waypoints when switching away from spline
                // so user can switch back and still have their curve adjustments
              } catch (err) {
                console.error('Failed to update path type:', err)
              }
            }
          }}
          onArrowHeadChange={async (arrowHead: TransitionArrowHead) => {
            if (floatingToolbar.type === 'transition') {
              try {
                await supabase
                  .from('workflow_transitions')
                  .update({ line_arrow_head: arrowHead })
                  .eq('id', floatingToolbar.targetId)
                setTransitions(transitions.map(t => 
                  t.id === floatingToolbar.targetId ? { ...t, line_arrow_head: arrowHead } : t
                ))
              } catch (err) {
                console.error('Failed to update arrow head:', err)
              }
            }
          }}
          onThicknessChange={async (thickness: TransitionLineThickness) => {
            if (floatingToolbar.type === 'transition') {
              try {
                await supabase
                  .from('workflow_transitions')
                  .update({ line_thickness: thickness })
                  .eq('id', floatingToolbar.targetId)
                setTransitions(transitions.map(t => 
                  t.id === floatingToolbar.targetId ? { ...t, line_thickness: thickness } : t
                ))
              } catch (err) {
                console.error('Failed to update thickness:', err)
              }
            }
          }}
          onFillOpacityChange={async (opacity: number) => {
            if (floatingToolbar.type === 'state') {
              try {
                await supabase
                  .from('workflow_states')
                  .update({ fill_opacity: opacity })
                  .eq('id', floatingToolbar.targetId)
                setStates(states.map(s => 
                  s.id === floatingToolbar.targetId ? { ...s, fill_opacity: opacity } : s
                ))
              } catch (err) {
                console.error('Failed to update fill opacity:', err)
              }
            }
          }}
          onBorderColorChange={async (color: string | null) => {
            if (floatingToolbar.type === 'state') {
              try {
                await supabase
                  .from('workflow_states')
                  .update({ border_color: color })
                  .eq('id', floatingToolbar.targetId)
                setStates(states.map(s => 
                  s.id === floatingToolbar.targetId ? { ...s, border_color: color } : s
                ))
              } catch (err) {
                console.error('Failed to update border color:', err)
              }
            }
          }}
          onBorderOpacityChange={async (opacity: number) => {
            if (floatingToolbar.type === 'state') {
              try {
                await supabase
                  .from('workflow_states')
                  .update({ border_opacity: opacity })
                  .eq('id', floatingToolbar.targetId)
                setStates(states.map(s => 
                  s.id === floatingToolbar.targetId ? { ...s, border_opacity: opacity } : s
                ))
              } catch (err) {
                console.error('Failed to update border opacity:', err)
              }
            }
          }}
          onBorderThicknessChange={async (thickness: number) => {
            if (floatingToolbar.type === 'state') {
              try {
                await supabase
                  .from('workflow_states')
                  .update({ border_thickness: thickness })
                  .eq('id', floatingToolbar.targetId)
                setStates(states.map(s => 
                  s.id === floatingToolbar.targetId ? { ...s, border_thickness: thickness } : s
                ))
              } catch (err) {
                console.error('Failed to update border thickness:', err)
              }
            }
          }}
          onEdit={() => {
            if (floatingToolbar.type === 'state') {
              const state = states.find(s => s.id === floatingToolbar.targetId)
              if (state) {
                setEditingState(state)
                setShowEditState(true)
              }
            } else {
              const transition = transitions.find(t => t.id === floatingToolbar.targetId)
              if (transition) {
                setEditingTransition(transition)
                setShowEditTransition(true)
              }
            }
            setFloatingToolbar(null)
          }}
          onDuplicate={() => {
            if (floatingToolbar.type === 'state') {
              const state = states.find(s => s.id === floatingToolbar.targetId)
              if (state) {
                // Create duplicate state at offset position
                const newState: Partial<WorkflowState> = {
                  workflow_id: state.workflow_id,
                  name: state.name + ' (copy)',
                  label: (state.label || state.name) + ' (copy)',
                  description: state.description,
                  color: state.color,
                  icon: state.icon,
                  position_x: state.position_x + 40,
                  position_y: state.position_y + 40,
                  is_editable: state.is_editable,
                  requires_checkout: state.requires_checkout,
                  auto_increment_revision: state.auto_increment_revision,
                  sort_order: states.length,
                }
                supabase
                  .from('workflow_states')
                  .insert(newState)
                  .select()
                  .single()
                  .then(({ data, error }) => {
                    if (!error && data) {
                      setStates([...states, data])
                      addToast('success', 'State duplicated')
                    }
                  })
              }
            }
            setFloatingToolbar(null)
          }}
          onDelete={() => {
            if (floatingToolbar.type === 'state') {
              deleteState(floatingToolbar.targetId)
            } else {
              deleteTransition(floatingToolbar.targetId)
            }
            setFloatingToolbar(null)
          }}
          onAddGate={() => {
            if (floatingToolbar.type === 'transition') {
              addGate(floatingToolbar.targetId)
            }
            setFloatingToolbar(null)
          }}
          onClose={() => setFloatingToolbar(null)}
        />
        )
      })()}
      
      {/* No workflow selected */}
      {!selectedWorkflow && workflows.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center text-plm-fg-muted">
            <GitBranch size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm mb-2">No workflows defined</p>
            {isAdmin && (
              <button
                onClick={() => setShowCreateWorkflow(true)}
                className="text-plm-accent hover:underline text-sm"
              >
                Create your first workflow
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Create workflow dialog */}
      {showCreateWorkflow && (
        <CreateWorkflowDialog
          onClose={() => setShowCreateWorkflow(false)}
          onCreate={createWorkflow}
        />
      )}
      
      {/* Edit workflow dialog */}
      {showEditWorkflow && selectedWorkflow && (
        <EditWorkflowDialog
          workflow={selectedWorkflow}
          onClose={() => setShowEditWorkflow(false)}
          onSave={async (name, description) => {
            try {
              const { error } = await supabase
                .from('workflow_templates')
                .update({ name, description })
                .eq('id', selectedWorkflow.id)
              
              if (error) throw error
              
              // Update local state
              setWorkflows(workflows.map(w => 
                w.id === selectedWorkflow.id 
                  ? { ...w, name, description } 
                  : w
              ))
              setSelectedWorkflow({ ...selectedWorkflow, name, description })
              setShowEditWorkflow(false)
              addToast('success', 'Workflow updated')
            } catch (err) {
              console.error('Failed to update workflow:', err)
              addToast('error', 'Failed to update workflow')
            }
          }}
          onDelete={async () => {
            if (!window.confirm(`Delete "${selectedWorkflow.name}"? This will delete all states and transitions.`)) {
              return
            }
            try {
              const { error } = await supabase
                .from('workflow_templates')
                .delete()
                .eq('id', selectedWorkflow.id)
              
              if (error) throw error
              
              setWorkflows(workflows.filter(w => w.id !== selectedWorkflow.id))
              setSelectedWorkflow(null)
              setStates([])
              setTransitions([])
              setShowEditWorkflow(false)
              addToast('success', 'Workflow deleted')
            } catch (err) {
              console.error('Failed to delete workflow:', err)
              addToast('error', 'Failed to delete workflow')
            }
          }}
        />
      )}
      
      {/* Edit state dialog */}
      {showEditState && editingState && (
        <EditStateDialog
          state={editingState}
          onClose={() => {
            setShowEditState(false)
            setEditingState(null)
          }}
          onSave={async (updates) => {
            try {
              await supabase
                .from('workflow_states')
                .update(updates)
                .eq('id', editingState.id)
              
              setStates(states.map(s => 
                s.id === editingState.id ? { ...s, ...updates } : s
              ))
              setShowEditState(false)
              setEditingState(null)
              addToast('success', 'State updated')
            } catch (err) {
              console.error('Failed to update state:', err)
              addToast('error', 'Failed to update state')
            }
          }}
        />
      )}
      
      {/* Edit transition dialog */}
      {showEditTransition && editingTransition && (
        <EditTransitionDialog
          transition={editingTransition}
          onClose={() => {
            setShowEditTransition(false)
            setEditingTransition(null)
          }}
          onSave={async (updates) => {
            try {
              await supabase
                .from('workflow_transitions')
                .update(updates)
                .eq('id', editingTransition.id)
              
              setTransitions(transitions.map(t => 
                t.id === editingTransition.id ? { ...t, ...updates } : t
              ))
              setShowEditTransition(false)
              setEditingTransition(null)
              addToast('success', 'Transition updated')
            } catch (err) {
              console.error('Failed to update transition:', err)
              addToast('error', 'Failed to update transition')
            }
          }}
        />
      )}
    </div>
  )
}

// ============================================
// Sub-components
// ============================================

interface WorkflowContextMenuProps {
  x: number
  y: number
  type: 'state' | 'transition'
  isAdmin: boolean
  targetState?: WorkflowState
  targetTransition?: WorkflowTransition
  gates: WorkflowGate[]
  allStates: WorkflowState[]
  hasWaypoints?: boolean
  onEdit: () => void
  onDelete: () => void
  onAddGate: () => void
  onResetWaypoints?: () => void
  onClose: () => void
}

function WorkflowContextMenu({ 
  x, 
  y, 
  type, 
  isAdmin, 
  targetState, 
  targetTransition,
  gates,
  allStates,
  hasWaypoints,
  onEdit, 
  onDelete, 
  onAddGate,
  onResetWaypoints,
  onClose 
}: WorkflowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    
    // Close on escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])
  
  // Adjust position to keep menu on screen
  const [adjustedPos, setAdjustedPos] = useState({ x, y })
  
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      let newX = x
      let newY = y
      
      if (x + rect.width > window.innerWidth) {
        newX = window.innerWidth - rect.width - 8
      }
      if (y + rect.height > window.innerHeight) {
        newY = window.innerHeight - rect.height - 8
      }
      
      setAdjustedPos({ x: newX, y: newY })
    }
  }, [x, y])
  
  const fromState = targetTransition ? allStates.find(s => s.id === targetTransition.from_state_id) : null
  const toState = targetTransition ? allStates.find(s => s.id === targetTransition.to_state_id) : null
  
  return (
    <div
      ref={menuRef}
      className="fixed bg-plm-sidebar border border-plm-border rounded-lg shadow-xl py-1 min-w-[200px] z-50"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {/* Header showing what's selected */}
      <div className="px-3 py-2 border-b border-plm-border">
        {type === 'state' && targetState && (
          <div className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded flex items-center justify-center"
              style={{ backgroundColor: targetState.color }}
            />
            <span className="text-sm font-medium">{targetState.label || targetState.name}</span>
            <span className="text-xs text-plm-fg-muted">({targetState.is_editable ? 'Editable' : 'Locked'})</span>
          </div>
        )}
        {type === 'transition' && targetTransition && (
          <div>
            <div className="text-sm font-medium mb-1">{targetTransition.name || 'Unnamed transition'}</div>
            <div className="flex items-center gap-1.5 text-xs text-plm-fg-muted">
              <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: (fromState?.color || '#666') + '40' }}>
                {fromState?.name || '?'}
              </span>
              <ArrowRight size={10} />
              <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: (toState?.color || '#666') + '40' }}>
                {toState?.name || '?'}
              </span>
            </div>
            {gates.length > 0 && (
              <div className="mt-1 text-xs text-amber-400">
                {gates.length} gate{gates.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Menu items */}
      <div className="py-1">
        <button
          onClick={onEdit}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-plm-highlight transition-colors"
        >
          <Edit3 size={14} />
          Edit {type === 'state' ? 'State' : 'Transition'}...
        </button>
        
        {type === 'transition' && isAdmin && (
          <button
            onClick={onAddGate}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-plm-highlight transition-colors text-amber-400"
          >
            <Plus size={14} />
            Add Gate...
          </button>
        )}
        
        {type === 'transition' && isAdmin && hasWaypoints && onResetWaypoints && (
          <button
            onClick={onResetWaypoints}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-plm-highlight transition-colors text-plm-fg-muted"
          >
            <X size={14} />
            Reset Control Points
          </button>
        )}
        
        {isAdmin && (
          <>
            <div className="my-1 border-t border-plm-border" />
            <button
              onClick={onDelete}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-plm-error/20 text-plm-error transition-colors"
            >
              <Trash2 size={14} />
              Delete {type === 'state' ? 'State' : 'Transition'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================
// Floating Toolbar
// ============================================

// Color palette for toolbar - expanded with more organized colors
const TOOLBAR_COLORS = [
  // Row 1: Reds to Yellows
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  // Row 2: Greens
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  // Row 3: Blues
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  // Row 4: Purples to Pinks
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  // Row 5: Neutrals
  '#f5f5f4', '#a8a29e', '#6b7280', '#1f2937',
]

// LocalStorage key for saved colors
const SAVED_COLORS_KEY = 'blueplm_workflow_saved_colors'

// Get saved colors from localStorage
function getSavedColors(): string[] {
  try {
    const saved = localStorage.getItem(SAVED_COLORS_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

// Save colors to localStorage
function setSavedColors(colors: string[]): void {
  try {
    localStorage.setItem(SAVED_COLORS_KEY, JSON.stringify(colors.slice(0, 12))) // Max 12 saved colors
  } catch {
    // Ignore storage errors
  }
}

interface FloatingToolbarProps {
  x: number
  y: number
  type: 'state' | 'transition'
  isAdmin: boolean
  targetState?: WorkflowState
  targetTransition?: WorkflowTransition
  onColorChange: (color: string) => void
  onLineStyleChange?: (style: TransitionLineStyle) => void
  onPathTypeChange?: (pathType: TransitionPathType) => void
  onArrowHeadChange?: (arrowHead: TransitionArrowHead) => void
  onThicknessChange?: (thickness: TransitionLineThickness) => void
  // State-specific styling
  onFillOpacityChange?: (opacity: number) => void
  onBorderColorChange?: (color: string | null) => void
  onBorderOpacityChange?: (opacity: number) => void
  onBorderThicknessChange?: (thickness: number) => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onAddGate?: () => void
  onClose: () => void
}

function FloatingToolbar({
  x,
  y,
  type,
  isAdmin,
  targetState,
  targetTransition,
  onColorChange,
  onLineStyleChange,
  onPathTypeChange,
  onArrowHeadChange,
  onThicknessChange,
  onFillOpacityChange,
  onBorderColorChange,
  onBorderOpacityChange,
  onBorderThicknessChange,
  onEdit,
  onDuplicate,
  onDelete,
  onAddGate,
  onClose
}: FloatingToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showBorderColorPicker, setShowBorderColorPicker] = useState(false)
  const [showLineStyles, setShowLineStyles] = useState(false)
  const [showPathTypes, setShowPathTypes] = useState(false)
  const [showArrowHeads, setShowArrowHeads] = useState(false)
  const [showThickness, setShowThickness] = useState(false)
  const [showBoxStyles, setShowBoxStyles] = useState(false)
  const [adjustedPos, setAdjustedPos] = useState({ x, y })
  const [savedColors, setSavedColorsState] = useState<string[]>(getSavedColors)
  const [customColor, setCustomColor] = useState('#6b7280')
  const [customBorderColor, setCustomBorderColor] = useState('#6b7280')
  
  // Close all dropdowns
  const closeAllDropdowns = () => {
    setShowColorPicker(false)
    setShowBorderColorPicker(false)
    setShowLineStyles(false)
    setShowPathTypes(false)
    setShowArrowHeads(false)
    setShowThickness(false)
    setShowBoxStyles(false)
  }
  
  // Save a color to saved colors
  const saveColor = (color: string) => {
    const newSaved = [color, ...savedColors.filter(c => c !== color)].slice(0, 12)
    setSavedColorsState(newSaved)
    setSavedColors(newSaved)
  }
  
  // Remove a color from saved colors
  const removeSavedColor = (color: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newSaved = savedColors.filter(c => c !== color)
    setSavedColorsState(newSaved)
    setSavedColors(newSaved)
  }
  
  // Current color
  const currentColor = type === 'state' 
    ? targetState?.color || '#6b7280'
    : targetTransition?.line_color || '#6b7280'
  
  // State styling values
  const currentFillOpacity = targetState?.fill_opacity ?? 1
  const currentBorderColor = targetState?.border_color || null
  const currentBorderOpacity = targetState?.border_opacity ?? 1
  const currentStateBorderThickness = targetState?.border_thickness ?? 2
  
  // Current line style
  const currentLineStyle = targetTransition?.line_style || 'solid'
  const currentPathType = targetTransition?.line_path_type || 'spline'
  const currentArrowHead = targetTransition?.line_arrow_head || 'end'
  const currentThickness = targetTransition?.line_thickness || 2
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])
  
  // Adjust position to keep toolbar on screen
  useEffect(() => {
    if (toolbarRef.current) {
      const rect = toolbarRef.current.getBoundingClientRect()
      let newX = x - rect.width / 2 // Center horizontally
      let newY = y
      
      // Keep on screen
      if (newX + rect.width > window.innerWidth) {
        newX = window.innerWidth - rect.width - 8
      }
      if (newX < 8) newX = 8
      if (newY < 8) newY = 8
      if (newY + rect.height > window.innerHeight) {
        newY = window.innerHeight - rect.height - 8
      }
      
      setAdjustedPos({ x: newX, y: newY })
    }
  }, [x, y])
  
  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex flex-col items-center gap-1"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {/* Main horizontal toolbar */}
      <div className="flex items-center gap-0.5 bg-[#1e1e2e] rounded-lg shadow-2xl border border-[#313244] p-1">
        {/* Color button */}
        <div className="relative">
          <button
            onClick={() => {
              closeAllDropdowns()
              setShowColorPicker(!showColorPicker)
              setCustomColor(currentColor)
            }}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-[#313244] transition-colors"
            title={type === 'state' ? 'Fill color' : 'Line color'}
          >
            <div 
              className="w-5 h-5 rounded border-2 border-white/30"
              style={{ backgroundColor: currentColor }}
            />
          </button>
          
          {/* Enhanced color picker dropdown */}
          {showColorPicker && (
            <div 
              className="absolute top-full left-0 mt-1 p-3 bg-[#1e1e2e] rounded-lg shadow-xl border border-[#313244] min-w-[200px] z-50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Preset colors */}
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Colors</div>
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {TOOLBAR_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      onColorChange(color)
                      closeAllDropdowns()
                    }}
                    className={`w-7 h-7 rounded-md border-2 transition-all hover:scale-110 ${
                      currentColor === color ? 'border-white ring-2 ring-white/30' : 'border-transparent hover:border-white/30'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              
              {/* Saved colors */}
              {savedColors.length > 0 && (
                <>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Saved</div>
                  <div className="grid grid-cols-4 gap-1.5 mb-3">
                    {savedColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          onColorChange(color)
                          closeAllDropdowns()
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          removeSavedColor(color, e)
                        }}
                        className={`relative w-7 h-7 rounded-md border-2 transition-all hover:scale-110 group ${
                          currentColor === color ? 'border-white ring-2 ring-white/30' : 'border-transparent hover:border-white/30'
                        }`}
                        style={{ backgroundColor: color }}
                        title="Right-click to remove"
                      >
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-[8px] text-white opacity-0 group-hover:opacity-100 flex items-center justify-center">×</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              
              {/* Custom color */}
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Custom</div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-[#313244] bg-transparent"
                />
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => {
                    const val = e.target.value
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                      setCustomColor(val)
                    }
                  }}
                  className="flex-1 px-2 py-1.5 text-xs bg-[#313244] border border-[#414156] rounded font-mono text-gray-200"
                  placeholder="#000000"
                />
                <button
                  onClick={() => {
                    onColorChange(customColor)
                    closeAllDropdowns()
                  }}
                  className="px-2 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
                >
                  Apply
                </button>
              </div>
              
              {/* Save color button */}
              <button
                onClick={() => saveColor(customColor)}
                className="mt-2 w-full px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-[#313244] rounded flex items-center justify-center gap-1 transition-colors"
              >
                <Plus size={12} />
                Save current color
              </button>
            </div>
          )}
        </div>
        
        {/* Transition-specific options */}
        {type === 'transition' && (
          <>
            {/* Divider */}
            <div className="w-px h-5 bg-[#313244] mx-0.5" />
            
            {/* Path type (straight/spline/elbow) */}
            {onPathTypeChange && (
              <div className="relative">
                <button
                  onClick={() => {
                    closeAllDropdowns()
                    setShowPathTypes(!showPathTypes)
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded hover:bg-[#313244] transition-colors"
                  title="Line path type"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" className="text-gray-300">
                    {currentPathType === 'straight' && (
                      <line x1="2" y1="14" x2="16" y2="4" stroke="currentColor" strokeWidth="2" />
                    )}
                    {currentPathType === 'spline' && (
                      <path d="M2 14 Q9 2 16 8" fill="none" stroke="currentColor" strokeWidth="2" />
                    )}
                    {currentPathType === 'elbow' && (
                      <path d="M2 14 L2 9 L16 9 L16 4" fill="none" stroke="currentColor" strokeWidth="2" />
                    )}
                  </svg>
                </button>
                
                {showPathTypes && (
                  <div className="absolute top-full left-0 mt-1 p-1 bg-[#1e1e2e] rounded-lg shadow-xl border border-[#313244] flex flex-col gap-0.5 min-w-[130px]">
                    {(['straight', 'spline', 'elbow'] as TransitionPathType[]).map((pathType) => (
                      <button
                        key={pathType}
                        onClick={() => {
                          onPathTypeChange(pathType)
                          closeAllDropdowns()
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-[#313244] transition-colors ${
                          currentPathType === pathType ? 'bg-[#313244] text-white' : 'text-gray-400'
                        }`}
                      >
                        <svg width="24" height="16" viewBox="0 0 24 16">
                          {pathType === 'straight' && (
                            <line x1="2" y1="12" x2="22" y2="4" stroke="currentColor" strokeWidth="2" />
                          )}
                          {pathType === 'spline' && (
                            <path d="M2 12 Q12 0 22 8" fill="none" stroke="currentColor" strokeWidth="2" />
                          )}
                          {pathType === 'elbow' && (
                            <path d="M2 12 L2 8 L22 8 L22 4" fill="none" stroke="currentColor" strokeWidth="2" />
                          )}
                        </svg>
                        <span className="capitalize">{pathType}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Line style (solid/dashed/dotted) */}
            {onLineStyleChange && (
              <div className="relative">
                <button
                  onClick={() => {
                    closeAllDropdowns()
                    setShowLineStyles(!showLineStyles)
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded hover:bg-[#313244] transition-colors"
                  title="Line style"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" className="text-gray-300">
                    {currentLineStyle === 'solid' && (
                      <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="2" />
                    )}
                    {currentLineStyle === 'dashed' && (
                      <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="2" strokeDasharray="4,2" />
                    )}
                    {currentLineStyle === 'dotted' && (
                      <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="2" strokeDasharray="1,3" strokeLinecap="round" />
                    )}
                  </svg>
                </button>
                
                {showLineStyles && (
                  <div className="absolute top-full left-0 mt-1 p-1 bg-[#1e1e2e] rounded-lg shadow-xl border border-[#313244] flex flex-col gap-0.5 min-w-[110px]">
                    {(['solid', 'dashed', 'dotted'] as TransitionLineStyle[]).map((style) => (
                      <button
                        key={style}
                        onClick={() => {
                          onLineStyleChange(style)
                          closeAllDropdowns()
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-[#313244] transition-colors ${
                          currentLineStyle === style ? 'bg-[#313244] text-white' : 'text-gray-400'
                        }`}
                      >
                        <svg width="24" height="8" viewBox="0 0 24 8">
                          <line 
                            x1="0" y1="4" x2="24" y2="4" 
                            stroke="currentColor" 
                            strokeWidth="2"
                            strokeDasharray={style === 'dashed' ? '4,2' : style === 'dotted' ? '1,3' : 'none'}
                            strokeLinecap={style === 'dotted' ? 'round' : 'butt'}
                          />
                        </svg>
                        <span className="capitalize">{style}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Line thickness */}
            {onThicknessChange && (
              <div className="relative">
                <button
                  onClick={() => {
                    closeAllDropdowns()
                    setShowThickness(!showThickness)
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded hover:bg-[#313244] transition-colors"
                  title="Line thickness"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" className="text-gray-300">
                    <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth={currentThickness} />
                  </svg>
                </button>
                
                {showThickness && (
                  <div className="absolute top-full left-0 mt-1 p-1 bg-[#1e1e2e] rounded-lg shadow-xl border border-[#313244] flex flex-col gap-0.5 min-w-[90px]">
                    {([1, 2, 3, 4, 6] as TransitionLineThickness[]).map((thickness) => (
                      <button
                        key={thickness}
                        onClick={() => {
                          onThicknessChange(thickness)
                          closeAllDropdowns()
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-[#313244] transition-colors ${
                          currentThickness === thickness ? 'bg-[#313244] text-white' : 'text-gray-400'
                        }`}
                      >
                        <svg width="24" height="12" viewBox="0 0 24 12">
                          <line x1="0" y1="6" x2="24" y2="6" stroke="currentColor" strokeWidth={thickness} />
                        </svg>
                        <span>{thickness}px</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Arrow head position */}
            {onArrowHeadChange && (
              <div className="relative">
                <button
                  onClick={() => {
                    closeAllDropdowns()
                    setShowArrowHeads(!showArrowHeads)
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded hover:bg-[#313244] transition-colors"
                  title="Arrow head"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" className="text-gray-300">
                    <defs>
                      <marker id="toolbar-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                        <polygon points="0 0, 6 3, 0 6" fill="currentColor" />
                      </marker>
                    </defs>
                    {currentArrowHead === 'end' && (
                      <line x1="2" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="2" markerEnd="url(#toolbar-arrow)" />
                    )}
                    {currentArrowHead === 'start' && (
                      <line x1="16" y1="9" x2="4" y2="9" stroke="currentColor" strokeWidth="2" markerEnd="url(#toolbar-arrow)" />
                    )}
                    {currentArrowHead === 'both' && (
                      <>
                        <line x1="5" y1="9" x2="13" y2="9" stroke="currentColor" strokeWidth="2" />
                        <polygon points="2,9 6,6 6,12" fill="currentColor" />
                        <polygon points="16,9 12,6 12,12" fill="currentColor" />
                      </>
                    )}
                    {currentArrowHead === 'none' && (
                      <line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="2" />
                    )}
                  </svg>
                </button>
                
                {showArrowHeads && (
                  <div className="absolute top-full right-0 mt-1 p-1 bg-[#1e1e2e] rounded-lg shadow-xl border border-[#313244] flex flex-col gap-0.5 min-w-[110px]">
                    {([
                      { value: 'end', label: 'End →' },
                      { value: 'start', label: '← Start' },
                      { value: 'both', label: '← Both →' },
                      { value: 'none', label: 'None —' }
                    ] as { value: TransitionArrowHead; label: string }[]).map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => {
                          onArrowHeadChange(value)
                          closeAllDropdowns()
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm hover:bg-[#313244] transition-colors ${
                          currentArrowHead === value ? 'bg-[#313244] text-white' : 'text-gray-400'
                        }`}
                      >
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Divider */}
            <div className="w-px h-5 bg-[#313244] mx-0.5" />
          </>
        )}
        
        {/* State-specific box styling options */}
        {type === 'state' && (
          <>
            {/* Divider */}
            <div className="w-px h-5 bg-[#313244] mx-0.5" />
            
            {/* Box styling button */}
            <div className="relative">
              <button
                onClick={() => {
                  closeAllDropdowns()
                  setShowBoxStyles(!showBoxStyles)
                  setCustomBorderColor(currentBorderColor || currentColor)
                }}
                className="flex items-center justify-center w-8 h-8 rounded hover:bg-[#313244] transition-colors"
                title="Box styling"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" className="text-gray-300">
                  <rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
              
              {/* Box styling dropdown */}
              {showBoxStyles && (
                <div 
                  className="absolute top-full left-0 mt-1 p-3 bg-[#1e1e2e] rounded-lg shadow-xl border border-[#313244] min-w-[240px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Fill Opacity */}
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2 flex items-center justify-between">
                      <span>Fill Opacity</span>
                      <span className="text-gray-400">{Math.round(currentFillOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={currentFillOpacity * 100}
                      onChange={(e) => onFillOpacityChange?.(Number(e.target.value) / 100)}
                      className="w-full h-2 bg-[#313244] rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                  
                  {/* Border Color */}
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Border Color</div>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => onBorderColorChange?.(null)}
                        className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors ${
                          currentBorderColor === null 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-[#313244] text-gray-400 hover:bg-[#414156]'
                        }`}
                      >
                        Same as fill
                      </button>
                      <button
                        onClick={() => setShowBorderColorPicker(!showBorderColorPicker)}
                        className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors ${
                          currentBorderColor !== null 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-[#313244] text-gray-400 hover:bg-[#414156]'
                        }`}
                      >
                        <div 
                          className="w-4 h-4 rounded border border-white/30"
                          style={{ backgroundColor: currentBorderColor || currentColor }}
                        />
                        Custom
                      </button>
                    </div>
                    
                    {/* Border color picker (inline) */}
                    {showBorderColorPicker && currentBorderColor !== null && (
                      <div className="mt-2 p-2 bg-[#252536] rounded-lg">
                        <div className="grid grid-cols-5 gap-1 mb-2">
                          {TOOLBAR_COLORS.slice(0, 10).map((color) => (
                            <button
                              key={color}
                              onClick={() => onBorderColorChange?.(color)}
                              className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                                currentBorderColor === color ? 'border-white' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={customBorderColor}
                            onChange={(e) => {
                              setCustomBorderColor(e.target.value)
                              onBorderColorChange?.(e.target.value)
                            }}
                            className="w-6 h-6 rounded cursor-pointer border border-[#313244] bg-transparent"
                          />
                          <input
                            type="text"
                            value={customBorderColor}
                            onChange={(e) => {
                              const val = e.target.value
                              if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                                setCustomBorderColor(val)
                                if (val.length === 7) onBorderColorChange?.(val)
                              }
                            }}
                            className="flex-1 px-2 py-1 text-xs bg-[#313244] border border-[#414156] rounded font-mono text-gray-200"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Border Opacity */}
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2 flex items-center justify-between">
                      <span>Border Opacity</span>
                      <span className="text-gray-400">{Math.round(currentBorderOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={currentBorderOpacity * 100}
                      onChange={(e) => onBorderOpacityChange?.(Number(e.target.value) / 100)}
                      className="w-full h-2 bg-[#313244] rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                  
                  {/* Border Thickness */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Border Thickness</div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 6].map((thickness) => (
                        <button
                          key={thickness}
                          onClick={() => onBorderThicknessChange?.(thickness)}
                          className={`flex-1 py-1.5 rounded text-xs transition-colors ${
                            currentStateBorderThickness === thickness 
                              ? 'bg-blue-600 text-white' 
                              : 'bg-[#313244] text-gray-400 hover:bg-[#414156]'
                          }`}
                        >
                          {thickness}px
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        
        {/* Edit button */}
        <button
          onClick={onEdit}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-[#313244] transition-colors text-gray-300 hover:text-white"
          title={`Edit ${type}`}
        >
          <Edit3 size={16} />
        </button>
        
        {/* Duplicate button (states only) */}
        {type === 'state' && isAdmin && (
          <button
            onClick={onDuplicate}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-[#313244] transition-colors text-gray-300 hover:text-white"
            title="Duplicate"
          >
            <Copy size={16} />
          </button>
        )}
        
        {/* Add gate button (transitions only) */}
        {type === 'transition' && isAdmin && onAddGate && (
          <button
            onClick={onAddGate}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-[#313244] transition-colors text-amber-400 hover:text-amber-300"
            title="Add gate"
          >
            <Plus size={16} />
          </button>
        )}
        
        {/* Divider */}
        <div className="w-px h-5 bg-[#313244] mx-0.5" />
        
        {/* More options / Delete */}
        {isAdmin && (
          <button
            onClick={onDelete}
            className="flex items-center justify-center w-8 h-8 rounded hover:bg-red-500/20 transition-colors text-gray-400 hover:text-red-400"
            title={`Delete ${type}`}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      
      {/* Connection hint arrow pointing down to object */}
      <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#313244]" />
    </div>
  )
}

// ============================================
// Dialog Components
// ============================================

interface CreateWorkflowDialogProps {
  onClose: () => void
  onCreate: (name: string, description: string) => void
}

function CreateWorkflowDialog({ onClose, onCreate }: CreateWorkflowDialogProps) {
  const [name, setName] = useState('New Workflow')
  const [description, setDescription] = useState('')
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-plm-sidebar rounded-lg shadow-xl w-96 p-4">
        <h3 className="font-semibold mb-4">Create Workflow</h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm h-20 resize-none"
              placeholder="Optional description..."
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm hover:bg-plm-bg rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(name, description)}
            className="px-3 py-1.5 text-sm bg-plm-accent hover:bg-plm-accent-hover text-white rounded"
            disabled={!name.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

interface EditWorkflowDialogProps {
  workflow: WorkflowTemplate
  onClose: () => void
  onSave: (name: string, description: string) => void
  onDelete: () => void
}

function EditWorkflowDialog({ workflow, onClose, onSave, onDelete }: EditWorkflowDialogProps) {
  const [name, setName] = useState(workflow.name)
  const [description, setDescription] = useState(workflow.description || '')
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-plm-sidebar rounded-lg shadow-xl w-96 p-4">
        <h3 className="font-semibold mb-4">Edit Workflow</h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm h-20 resize-none"
              placeholder="Optional description..."
            />
          </div>
          
          {workflow.is_default && (
            <p className="text-xs text-plm-fg-muted bg-plm-bg-light rounded p-2">
              This is the default workflow for new files.
            </p>
          )}
        </div>
        
        <div className="flex justify-between mt-4">
          <button
            onClick={onDelete}
            className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20 rounded"
            title="Delete this workflow"
          >
            <Trash2 size={14} className="inline mr-1" />
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm hover:bg-plm-bg rounded"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(name, description)}
              className="px-3 py-1.5 text-sm bg-plm-accent hover:bg-plm-accent-hover text-white rounded"
              disabled={!name.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface EditStateDialogProps {
  state: WorkflowState
  onClose: () => void
  onSave: (updates: Partial<WorkflowState>) => void
}

function EditStateDialog({ state, onClose, onSave }: EditStateDialogProps) {
  const [name, setName] = useState(state.name)
  const [label, setLabel] = useState(state.label || '')
  const [description, setDescription] = useState(state.description || '')
  const [color, setColor] = useState(state.color)
  const [icon, setIcon] = useState(state.icon)
  const [isEditable, setIsEditable] = useState(state.is_editable)
  const [requiresCheckout, setRequiresCheckout] = useState(state.requires_checkout)
  const [autoRev, setAutoRev] = useState(state.auto_increment_revision)
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-plm-sidebar rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-auto p-4">
        <h3 className="font-semibold mb-4">Edit State</h3>
        
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-plm-fg-muted mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-plm-fg-muted mb-1">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm"
                placeholder={name}
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm h-16 resize-none"
            />
          </div>
          
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Color</label>
            <div className="flex flex-wrap gap-1">
              {STATE_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-6 h-6 rounded ${color === c.value ? 'ring-2 ring-white ring-offset-1 ring-offset-plm-sidebar' : ''}`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Icon</label>
            <div className="flex flex-wrap gap-1">
              {Object.entries(ICON_MAP).slice(0, 16).map(([key, IconComp]) => (
                <button
                  key={key}
                  onClick={() => setIcon(key)}
                  className={`w-8 h-8 rounded flex items-center justify-center ${
                    icon === key ? 'bg-plm-accent text-white' : 'bg-plm-bg hover:bg-plm-highlight'
                  }`}
                >
                  <IconComp size={16} />
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isEditable}
                onChange={(e) => setIsEditable(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Files can be edited in this state</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresCheckout}
                onChange={(e) => setRequiresCheckout(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Require checkout to edit</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRev}
                onChange={(e) => setAutoRev(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Auto-increment revision on transition</span>
            </label>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm hover:bg-plm-bg rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({
              name,
              label: label || null,
              description: description || null,
              color,
              icon,
              is_editable: isEditable,
              requires_checkout: requiresCheckout,
              auto_increment_revision: autoRev,
            })}
            className="px-3 py-1.5 text-sm bg-plm-accent hover:bg-plm-accent-hover text-white rounded"
            disabled={!name.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

interface EditTransitionDialogProps {
  transition: WorkflowTransition
  onClose: () => void
  onSave: (updates: Partial<WorkflowTransition>) => void
}

function EditTransitionDialog({ transition, onClose, onSave }: EditTransitionDialogProps) {
  const [name, setName] = useState(transition.name || '')
  const [description, setDescription] = useState(transition.description || '')
  const [lineStyle, setLineStyle] = useState(transition.line_style)
  const [allowedRoles, setAllowedRoles] = useState<UserRole[]>(transition.allowed_roles)
  
  const toggleRole = (role: UserRole) => {
    if (allowedRoles.includes(role)) {
      setAllowedRoles(allowedRoles.filter(r => r !== role))
    } else {
      setAllowedRoles([...allowedRoles, role])
    }
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-plm-sidebar rounded-lg shadow-xl w-96 p-4">
        <h3 className="font-semibold mb-4">Edit Transition</h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm"
              placeholder="e.g., Submit for Review"
            />
          </div>
          
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-plm-input border border-plm-border rounded px-2 py-1.5 text-sm h-16 resize-none"
            />
          </div>
          
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Line Style</label>
            <div className="flex gap-2">
              {(['solid', 'dashed', 'dotted'] as TransitionLineStyle[]).map(style => (
                <button
                  key={style}
                  onClick={() => setLineStyle(style)}
                  className={`px-3 py-1.5 rounded text-sm ${
                    lineStyle === style ? 'bg-plm-accent text-white' : 'bg-plm-bg hover:bg-plm-highlight'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-xs text-plm-fg-muted mb-1">Allowed Roles</label>
            <div className="flex gap-2">
              {(['admin', 'engineer', 'viewer'] as UserRole[]).map(role => (
                <label key={role} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowedRoles.includes(role)}
                    onChange={() => toggleRole(role)}
                    className="rounded"
                  />
                  <span className="text-sm capitalize">{role}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm hover:bg-plm-bg rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({
              name: name || null,
              description: description || null,
              line_style: lineStyle,
              allowed_roles: allowedRoles,
            })}
            className="px-3 py-1.5 text-sm bg-plm-accent hover:bg-plm-accent-hover text-white rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

