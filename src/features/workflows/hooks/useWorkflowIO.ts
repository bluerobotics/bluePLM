// Import/Export operations for workflows
import { useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { 
  WorkflowTemplate, 
  WorkflowState, 
  WorkflowTransition 
} from '@/types/workflow'
import { stateService, transitionService, workflowService } from '../services'

interface UseWorkflowIOOptions {
  // Core data
  selectedWorkflow: WorkflowTemplate | null
  states: WorkflowState[]
  transitions: WorkflowTransition[]
  isAdmin: boolean
  
  // Setters
  setStates: React.Dispatch<React.SetStateAction<WorkflowState[]>>
  setTransitions: React.Dispatch<React.SetStateAction<WorkflowTransition[]>>
  setSelectedStateId: (id: string | null) => void
  setSelectedTransitionId: (id: string | null) => void
  
  // Notifications
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void
}

export function useWorkflowIO(options: UseWorkflowIOOptions) {
  const {
    selectedWorkflow,
    states,
    transitions,
    isAdmin,
    setStates,
    setTransitions,
    setSelectedStateId,
    setSelectedTransitionId,
    addToast
  } = options

  // File input ref for import
  const importInputRef = useRef<HTMLInputElement>(null)

  /**
   * Export workflow to JSON file
   */
  const exportWorkflow = useCallback(() => {
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
          line_path_type: t.line_path_type,
          line_arrow_head: t.line_arrow_head,
          line_thickness: t.line_thickness,
          line_color: t.line_color,
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
  }, [selectedWorkflow, states, transitions, addToast])

  /**
   * Import workflow from JSON file
   */
  const importWorkflow = useCallback(async (file: File) => {
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
      // Use raw supabase for bulk deletes since services don't have this
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
        const { data: newState, error } = await stateService.create({
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
        
        if (error || !newState) throw error
        
        // Map the original state name/key to new ID
        stateIdMap[stateData._key || stateData.name] = newState.id
        // Cast through unknown since DB row type may differ from interface
        newStates.push(newState as unknown as WorkflowState)
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
          
          const { data: newTrans, error } = await transitionService.create({
            workflow_id: selectedWorkflow.id,
            from_state_id: fromStateId,
            to_state_id: toStateId,
            name: transData.name,
            description: transData.description,
            line_style: transData.line_style || 'solid',
          })
          
          if (error || !newTrans) throw error
          // Cast through unknown since DB row type may differ from interface
          newTransitions.push(newTrans as unknown as WorkflowTransition)
        }
      }
      
      // Update workflow metadata if provided
      if (importData.workflow) {
        await workflowService.update(selectedWorkflow.id, {
          description: importData.workflow.description,
          canvas_config: importData.workflow.canvas_config,
        })
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
  }, [selectedWorkflow, isAdmin, setStates, setTransitions, setSelectedStateId, setSelectedTransitionId, addToast])

  /**
   * Trigger file input for import
   */
  const triggerImport = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  /**
   * Handle file input change
   */
  const handleImportFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      importWorkflow(file)
      // Reset input so same file can be selected again
      e.target.value = ''
    }
  }, [importWorkflow])

  return {
    exportWorkflow,
    importWorkflow,
    importInputRef,
    triggerImport,
    handleImportFileChange
  }
}
