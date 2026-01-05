// Workflow data management hook
import { useState, useCallback, useEffect } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import type { 
  WorkflowTemplate, 
  WorkflowState, 
  WorkflowTransition, 
  WorkflowGate 
} from '@/types/workflow'
import { workflowService, stateService, transitionService } from '../services'

interface UseWorkflowDataOptions {
  onWorkflowSelect?: (workflow: WorkflowTemplate, states: WorkflowState[]) => void
  onSelectionClear?: () => void
}

export function useWorkflowData(options: UseWorkflowDataOptions = {}) {
  const { organization, user, addToast, getEffectiveRole } = usePDMStore()
  
  // Core data state
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowTemplate | null>(null)
  const [states, setStates] = useState<WorkflowState[]>([])
  const [transitions, setTransitions] = useState<WorkflowTransition[]>([])
  const [gates, setGates] = useState<Record<string, WorkflowGate[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  
  // Admin check based on effective role
  const effectiveRole = getEffectiveRole()
  const isAdmin = effectiveRole === 'admin' || effectiveRole === 'owner'

  /**
   * Load all workflows for the organization
   */
  const loadWorkflows = useCallback(async () => {
    if (!organization) return
    
    setIsLoading(true)
    
    const { data, error } = await workflowService.getAll(organization.id)
    
    if (error) {
      console.error('Failed to load workflows:', error)
      addToast('error', 'Failed to load workflows')
      setIsLoading(false)
      return []
    }
    
    const workflowList = (data || []) as WorkflowTemplate[]
    setWorkflows(workflowList)
    setIsLoading(false)
    
    // Return data for caller to handle auto-select if needed
    return workflowList
  }, [organization, addToast])

  /**
   * Load workflow details (states, transitions, gates)
   * Returns the loaded data for canvas positioning
   */
  const loadWorkflowDetails = useCallback(async (workflow: WorkflowTemplate): Promise<{
    states: WorkflowState[]
    transitions: WorkflowTransition[]
    gates: Record<string, WorkflowGate[]>
  }> => {
    // Load states - cast through unknown since DB row may differ from interface
    const statesResult = await stateService.getByWorkflow(workflow.id)
    const statesData = (statesResult.data || []) as unknown as WorkflowState[]
    setStates(statesData)
    
    // Load transitions
    const transitionsResult = await transitionService.getByWorkflow(workflow.id)
    const transitionsData = (transitionsResult.data || []) as WorkflowTransition[]
    setTransitions(transitionsData)
    
    // Load gates for each transition
    let gatesByTransition: Record<string, WorkflowGate[]> = {}
    if (transitionsData.length > 0) {
      const transitionIds = transitionsData.map(t => t.id)
      const gatesResult = await transitionService.getGatesGroupedByTransition(transitionIds)
      gatesByTransition = (gatesResult.data || {}) as Record<string, WorkflowGate[]>
      setGates(gatesByTransition)
    } else {
      setGates({})
    }
    
    return {
      states: statesData,
      transitions: transitionsData,
      gates: gatesByTransition
    }
  }, [])

  /**
   * Select a workflow and load its details
   */
  const selectWorkflow = useCallback(async (workflow: WorkflowTemplate) => {
    setSelectedWorkflow(workflow)
    options.onSelectionClear?.()
    
    const details = await loadWorkflowDetails(workflow)
    options.onWorkflowSelect?.(workflow, details.states)
    
    return details
  }, [loadWorkflowDetails, options])

  /**
   * Create a new workflow
   */
  const createWorkflow = useCallback(async (name: string, description: string): Promise<boolean> => {
    if (!organization || !user) return false
    
    // Create the workflow using the default workflow function
    const { data: workflowId, error } = await workflowService.createDefault(organization.id, user.id)
    
    if (error || !workflowId) {
      console.error('Failed to create workflow:', error)
      addToast('error', 'Failed to create workflow')
      return false
    }
    
    // Update the name if different from default
    if (name !== 'Standard Release Process') {
      await workflowService.update(workflowId, { name, description })
    }
    
    addToast('success', 'Workflow created successfully')
    await loadWorkflows()
    return true
  }, [organization, user, addToast, loadWorkflows])

  /**
   * Update a workflow
   */
  const updateWorkflow = useCallback(async (
    workflowId: string, 
    updates: { name: string; description: string }
  ): Promise<boolean> => {
    const { error } = await workflowService.update(workflowId, updates)
    
    if (error) {
      console.error('Failed to update workflow:', error)
      addToast('error', 'Failed to update workflow')
      return false
    }
    
    // Update local state
    setWorkflows(prev => prev.map(w => 
      w.id === workflowId ? { ...w, ...updates } : w
    ))
    if (selectedWorkflow?.id === workflowId) {
      setSelectedWorkflow(prev => prev ? { ...prev, ...updates } : null)
    }
    
    addToast('success', 'Workflow updated')
    return true
  }, [selectedWorkflow, addToast])

  /**
   * Delete a workflow
   */
  const deleteWorkflow = useCallback(async (workflowId: string): Promise<boolean> => {
    const { error } = await workflowService.softDelete(workflowId)
    
    if (error) {
      console.error('Failed to delete workflow:', error)
      addToast('error', 'Failed to delete workflow')
      return false
    }
    
    addToast('success', 'Workflow deleted')
    
    // Clear selection if deleted workflow was selected
    if (selectedWorkflow?.id === workflowId) {
      setSelectedWorkflow(null)
      setStates([])
      setTransitions([])
      setGates({})
    }
    
    await loadWorkflows()
    return true
  }, [selectedWorkflow, addToast, loadWorkflows])

  /**
   * Reload current workflow details
   */
  const reloadCurrentWorkflow = useCallback(async () => {
    if (selectedWorkflow) {
      await loadWorkflowDetails(selectedWorkflow)
    }
  }, [selectedWorkflow, loadWorkflowDetails])

  // Auto-load workflows when organization changes
  useEffect(() => {
    if (!organization) {
      setWorkflows([])
      setIsLoading(false)
      return
    }
    
    loadWorkflows()
  }, [organization, loadWorkflows])

  return {
    // State
    workflows,
    selectedWorkflow,
    states,
    transitions,
    gates,
    isLoading,
    isAdmin,
    
    // Setters (for external manipulation like undo/redo)
    setStates,
    setTransitions,
    setGates,
    setSelectedWorkflow,
    
    // Actions
    loadWorkflows,
    selectWorkflow,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    reloadCurrentWorkflow
  }
}
