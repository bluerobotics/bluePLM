// Dialog state management hook
import { useState, useCallback } from 'react'
import type { WorkflowState, WorkflowTransition, WorkflowGate } from '../types'

export function useDialogState() {
  // Workflow dialogs
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false)
  const [showEditWorkflow, setShowEditWorkflow] = useState(false)
  
  // State dialogs
  const [showEditState, setShowEditState] = useState(false)
  const [editingState, setEditingState] = useState<WorkflowState | null>(null)
  
  // Transition dialogs
  const [showEditTransition, setShowEditTransition] = useState(false)
  const [editingTransition, setEditingTransition] = useState<WorkflowTransition | null>(null)
  
  // Gate dialogs
  const [showEditGate, setShowEditGate] = useState(false)
  const [editingGate, setEditingGate] = useState<WorkflowGate | null>(null)

  /**
   * Open create workflow dialog
   */
  const openCreateWorkflow = useCallback(() => {
    setShowCreateWorkflow(true)
  }, [])

  /**
   * Close create workflow dialog
   */
  const closeCreateWorkflow = useCallback(() => {
    setShowCreateWorkflow(false)
  }, [])

  /**
   * Open edit workflow dialog
   */
  const openEditWorkflow = useCallback(() => {
    setShowEditWorkflow(true)
  }, [])

  /**
   * Close edit workflow dialog
   */
  const closeEditWorkflow = useCallback(() => {
    setShowEditWorkflow(false)
  }, [])

  /**
   * Open edit state dialog
   */
  const openEditState = useCallback((state: WorkflowState) => {
    setEditingState(state)
    setShowEditState(true)
  }, [])

  /**
   * Close edit state dialog
   */
  const closeEditState = useCallback(() => {
    setShowEditState(false)
    setEditingState(null)
  }, [])

  /**
   * Open edit transition dialog
   */
  const openEditTransition = useCallback((transition: WorkflowTransition) => {
    setEditingTransition(transition)
    setShowEditTransition(true)
  }, [])

  /**
   * Close edit transition dialog
   */
  const closeEditTransition = useCallback(() => {
    setShowEditTransition(false)
    setEditingTransition(null)
  }, [])

  /**
   * Open edit gate dialog
   */
  const openEditGate = useCallback((gate: WorkflowGate) => {
    setEditingGate(gate)
    setShowEditGate(true)
  }, [])

  /**
   * Close edit gate dialog
   */
  const closeEditGate = useCallback(() => {
    setShowEditGate(false)
    setEditingGate(null)
  }, [])

  /**
   * Close all dialogs
   */
  const closeAllDialogs = useCallback(() => {
    setShowCreateWorkflow(false)
    setShowEditWorkflow(false)
    setShowEditState(false)
    setShowEditTransition(false)
    setShowEditGate(false)
    setEditingState(null)
    setEditingTransition(null)
    setEditingGate(null)
  }, [])

  return {
    // State
    showCreateWorkflow,
    showEditWorkflow,
    showEditState,
    showEditTransition,
    showEditGate,
    editingState,
    editingTransition,
    editingGate,

    // Setters
    setShowCreateWorkflow,
    setShowEditWorkflow,
    setShowEditState,
    setShowEditTransition,
    setShowEditGate,
    setEditingState,
    setEditingTransition,
    setEditingGate,

    // Actions
    openCreateWorkflow,
    closeCreateWorkflow,
    openEditWorkflow,
    closeEditWorkflow,
    openEditState,
    closeEditState,
    openEditTransition,
    closeEditTransition,
    openEditGate,
    closeEditGate,
    closeAllDialogs
  }
}
