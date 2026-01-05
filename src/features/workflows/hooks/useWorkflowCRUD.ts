// CRUD operations for workflow states, transitions, and gates
import { useCallback } from 'react'
import type { 
  WorkflowTemplate, 
  WorkflowState, 
  WorkflowTransition, 
  WorkflowGate 
} from '@/types/workflow'
import type { HistoryEntry } from '../types'
import { stateService, transitionService } from '../services'

interface UseWorkflowCRUDOptions {
  // Core data
  selectedWorkflow: WorkflowTemplate | null
  states: WorkflowState[]
  transitions: WorkflowTransition[]
  gates: Record<string, WorkflowGate[]>
  isAdmin: boolean
  
  // Setters
  setStates: React.Dispatch<React.SetStateAction<WorkflowState[]>>
  setTransitions: React.Dispatch<React.SetStateAction<WorkflowTransition[]>>
  setGates: React.Dispatch<React.SetStateAction<Record<string, WorkflowGate[]>>>
  setSelectedStateId: (id: string | null) => void
  setSelectedTransitionId: (id: string | null) => void
  setEditingState: (state: WorkflowState | null) => void
  setEditingTransition: (transition: WorkflowTransition | null) => void
  setEditingGate: (gate: WorkflowGate | null) => void
  setShowEditState: (show: boolean) => void
  setShowEditTransition: (show: boolean) => void
  setShowEditGate: (show: boolean) => void
  setFloatingToolbar: (toolbar: { canvasX: number; canvasY: number; type: 'state' | 'transition'; targetId: string } | null) => void
  
  // Transition creation state
  setIsCreatingTransition: (creating: boolean) => void
  setTransitionStartId: (id: string | null) => void
  setIsDraggingToCreateTransition: (dragging: boolean) => void
  setHoveredStateId: (id: string | null) => void
  transitionStartId: string | null
  justCompletedTransitionRef: React.MutableRefObject<boolean>
  transitionCompletedAtRef: React.MutableRefObject<number>
  
  // Waypoints
  setWaypoints: React.Dispatch<React.SetStateAction<Record<string, Array<{ x: number; y: number }>>>>
  
  // Notifications
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void
  
  // Undo/redo support
  pushToUndo?: (entry: HistoryEntry) => void
}

export function useWorkflowCRUD(options: UseWorkflowCRUDOptions) {
  const {
    selectedWorkflow,
    states,
    transitions,
    gates,
    isAdmin,
    setStates,
    setTransitions,
    setGates,
    setSelectedStateId,
    setSelectedTransitionId,
    setEditingState,
    setEditingTransition,
    setEditingGate,
    setShowEditState,
    setShowEditTransition,
    setShowEditGate,
    setFloatingToolbar,
    setIsCreatingTransition,
    setTransitionStartId,
    setIsDraggingToCreateTransition,
    setHoveredStateId,
    transitionStartId,
    justCompletedTransitionRef,
    transitionCompletedAtRef,
    setWaypoints,
    addToast,
    pushToUndo
  } = options

  /**
   * Add a new state to the workflow
   */
  const addState = useCallback(async () => {
    if (!selectedWorkflow || !isAdmin) return null
    
    const newState = {
      workflow_id: selectedWorkflow.id,
      shape: 'rectangle' as const,
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
    
    const { data, error } = await stateService.create(newState)
    
    if (error || !data) {
      console.error('Failed to add state:', error)
      addToast('error', 'Failed to add state')
      return null
    }
    
    // Cast through unknown since DB row type may differ from interface
    const createdState = data as unknown as WorkflowState
    setStates(prev => [...prev, createdState])
    setSelectedStateId(createdState.id)
    setEditingState(createdState)
    setShowEditState(true)
    
    return createdState
  }, [selectedWorkflow, isAdmin, states.length, setStates, setSelectedStateId, setEditingState, setShowEditState, addToast])

  /**
   * Delete a state from the workflow
   */
  const deleteState = useCallback(async (stateId: string) => {
    if (!isAdmin) return false
    
    // Check if state has transitions
    const hasTransitions = transitions.some(
      t => t.from_state_id === stateId || t.to_state_id === stateId
    )
    
    if (hasTransitions) {
      addToast('error', 'Remove all transitions first')
      return false
    }
    
    const state = states.find(s => s.id === stateId)
    
    const { error } = await stateService.delete(stateId)
    
    if (error) {
      console.error('Failed to delete state:', error)
      addToast('error', 'Failed to delete state')
      return false
    }
    
    setStates(prev => prev.filter(s => s.id !== stateId))
    setSelectedStateId(null)
    setFloatingToolbar(null)
    addToast('success', 'State deleted')
    
    // Push to undo stack if available
    if (pushToUndo && state) {
      pushToUndo({ type: 'state_delete', data: { state } })
    }
    
    return true
  }, [isAdmin, transitions, states, setStates, setSelectedStateId, setFloatingToolbar, addToast, pushToUndo])

  /**
   * Update state position (for drag operations)
   */
  const updateStatePosition = useCallback(async (stateId: string, x: number, y: number) => {
    const { error } = await stateService.updatePosition(stateId, Math.round(x), Math.round(y))
    
    if (error) {
      console.error('Failed to update state position:', error)
      return
    }
    
    // Use functional updater to avoid stale closure issues
    setStates(prev => prev.map(s => 
      s.id === stateId ? { ...s, position_x: Math.round(x), position_y: Math.round(y) } : s
    ))
  }, [setStates])

  /**
   * Start creating a transition from a state
   */
  const startTransition = useCallback((fromStateId: string) => {
    if (!isAdmin) return
    setIsCreatingTransition(true)
    setTransitionStartId(fromStateId)
  }, [isAdmin, setIsCreatingTransition, setTransitionStartId])

  /**
   * Complete transition creation by connecting to target state
   */
  const completeTransition = useCallback(async (toStateId: string) => {
    if (!selectedWorkflow || !transitionStartId || !isAdmin) return null
    
    // Mark immediately that we're completing a transition to prevent subsequent events
    justCompletedTransitionRef.current = true
    transitionCompletedAtRef.current = Date.now()
    
    // Don't allow self-transitions
    if (transitionStartId === toStateId) {
      setIsCreatingTransition(false)
      setTransitionStartId(null)
      return null
    }
    
    // Check if transition already exists
    const exists = transitions.some(
      t => t.from_state_id === transitionStartId && t.to_state_id === toStateId
    )
    
    if (exists) {
      addToast('error', 'Transition already exists')
      setIsCreatingTransition(false)
      setTransitionStartId(null)
      return null
    }
    
    const newTransition = {
      workflow_id: selectedWorkflow.id,
      from_state_id: transitionStartId,
      to_state_id: toStateId,
      line_style: 'solid' as const,
    }
    
    const { data, error } = await transitionService.create(newTransition)
    
    if (error || !data) {
      console.error('Failed to create transition:', error)
      addToast('error', 'Failed to create transition')
      
      setIsCreatingTransition(false)
      setTransitionStartId(null)
      setIsDraggingToCreateTransition(false)
      setHoveredStateId(null)
      
      return null
    }
    
    const createdTransition = data as WorkflowTransition
    
    // Use functional updater to avoid stale closure issues
    setTransitions(prev => [...prev, createdTransition])
    setSelectedTransitionId(createdTransition.id)
    setEditingTransition(createdTransition)
    setShowEditTransition(true)
    
    // Create a default waypoint for the new spline transition
    const fromState = states.find(s => s.id === transitionStartId)
    const toState = states.find(s => s.id === toStateId)
    if (fromState && toState) {
      const midX = (fromState.position_x + toState.position_x) / 2
      const midY = (fromState.position_y + toState.position_y) / 2 - 40 // Offset up for natural curve
      setWaypoints(prev => ({
        ...prev,
        [createdTransition.id]: [{ x: midX, y: midY }]
      }))
    }
    
    setIsCreatingTransition(false)
    setTransitionStartId(null)
    setIsDraggingToCreateTransition(false)
    setHoveredStateId(null)
    
    return createdTransition
  }, [
    selectedWorkflow, transitionStartId, isAdmin, transitions, states,
    justCompletedTransitionRef, transitionCompletedAtRef,
    setTransitions, setSelectedTransitionId, setEditingTransition, setShowEditTransition,
    setWaypoints, setIsCreatingTransition, setTransitionStartId, 
    setIsDraggingToCreateTransition, setHoveredStateId, addToast
  ])

  /**
   * Delete a transition
   */
  const deleteTransition = useCallback(async (transitionId: string) => {
    if (!isAdmin) return false
    
    const transition = transitions.find(t => t.id === transitionId)
    
    const { error } = await transitionService.delete(transitionId)
    
    if (error) {
      console.error('Failed to delete transition:', error)
      addToast('error', 'Failed to delete transition')
      return false
    }
    
    setTransitions(prev => prev.filter(t => t.id !== transitionId))
    setSelectedTransitionId(null)
    setFloatingToolbar(null)
    addToast('success', 'Transition deleted')
    
    // Push to undo stack if available
    if (pushToUndo && transition) {
      pushToUndo({ type: 'transition_delete', data: { transition } })
    }
    
    return true
  }, [isAdmin, transitions, setTransitions, setSelectedTransitionId, setFloatingToolbar, addToast, pushToUndo])

  /**
   * Add a gate (approval requirement) to a transition
   */
  const addTransitionGate = useCallback(async (transitionId: string) => {
    if (!isAdmin) return null
    
    const newGate = {
      transition_id: transitionId,
      name: 'New Gate',
      gate_type: 'approval' as const,
      required_approvals: 1,
      approval_mode: 'any' as const,
      is_blocking: true,
      can_be_skipped_by: [] as ('admin' | 'engineer' | 'viewer')[],
      checklist_items: [] as { id: string; label: string; required: boolean }[],
      sort_order: (gates[transitionId]?.length || 0),
    }
    
    const { data, error } = await transitionService.createGate(newGate)
    
    if (error || !data) {
      console.error('Failed to add gate:', error)
      addToast('error', 'Failed to add gate')
      return null
    }
    
    const createdGate = data as WorkflowGate
    
    setGates(prev => ({
      ...prev,
      [transitionId]: [...(prev[transitionId] || []), createdGate]
    }))
    setEditingGate(createdGate)
    setShowEditGate(true)
    
    return createdGate
  }, [isAdmin, gates, setGates, setEditingGate, setShowEditGate, addToast])

  /**
   * Cancel connect mode / creating transition
   */
  const cancelConnectMode = useCallback(() => {
    setIsCreatingTransition(false)
    setTransitionStartId(null)
    setIsDraggingToCreateTransition(false)
    setHoveredStateId(null)
  }, [setIsCreatingTransition, setTransitionStartId, setIsDraggingToCreateTransition, setHoveredStateId])

  return {
    // State operations
    addState,
    deleteState,
    updateStatePosition,
    
    // Transition operations
    startTransition,
    completeTransition,
    deleteTransition,
    cancelConnectMode,
    
    // Gate operations
    addTransitionGate
  }
}
