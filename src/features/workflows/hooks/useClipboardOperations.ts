// Clipboard operations for workflow states and transitions
import { useCallback } from 'react'
import type { 
  WorkflowTemplate, 
  WorkflowState, 
  WorkflowTransition 
} from '@/types/workflow'
import type { ClipboardData, HistoryEntry } from '../types'
import { stateService, transitionService } from '../services'

interface UseClipboardOperationsOptions {
  // Core data
  selectedWorkflow: WorkflowTemplate | null
  states: WorkflowState[]
  transitions: WorkflowTransition[]
  isAdmin: boolean
  
  // Selection state
  selectedStateId: string | null
  selectedTransitionId: string | null
  
  // Clipboard
  clipboard: ClipboardData | null
  setClipboard: (data: ClipboardData | null) => void
  
  // Setters
  setStates: React.Dispatch<React.SetStateAction<WorkflowState[]>>
  setTransitions: React.Dispatch<React.SetStateAction<WorkflowTransition[]>>
  setSelectedStateId: (id: string | null) => void
  setSelectedTransitionId: (id: string | null) => void
  setFloatingToolbar: (toolbar: { canvasX: number; canvasY: number; type: 'state' | 'transition'; targetId: string } | null) => void
  
  // Notifications
  addToast: (type: 'success' | 'error' | 'info' | 'warning', message: string) => void
  
  // Undo/redo support
  pushToUndo: (entry: HistoryEntry) => void
}

export function useClipboardOperations(options: UseClipboardOperationsOptions) {
  const {
    selectedWorkflow,
    states,
    transitions,
    isAdmin,
    selectedStateId,
    selectedTransitionId,
    clipboard,
    setClipboard,
    setStates,
    setTransitions,
    setSelectedStateId,
    setSelectedTransitionId,
    setFloatingToolbar,
    addToast,
    pushToUndo
  } = options

  /**
   * Copy selected item to clipboard
   */
  const handleCopy = useCallback(() => {
    if (selectedStateId) {
      const state = states.find(s => s.id === selectedStateId)
      if (state) {
        setClipboard({ type: 'state', data: state })
        addToast('success', 'State copied')
      }
    } else if (selectedTransitionId) {
      const transition = transitions.find(t => t.id === selectedTransitionId)
      if (transition) {
        setClipboard({ type: 'transition', data: transition })
        addToast('success', 'Transition copied')
      }
    }
  }, [selectedStateId, selectedTransitionId, states, transitions, setClipboard, addToast])

  /**
   * Cut selected item (copy + delete)
   */
  const handleCut = useCallback(async () => {
    if (!isAdmin) return
    
    if (selectedStateId) {
      const state = states.find(s => s.id === selectedStateId)
      if (state) {
        // Check for transitions first
        const hasTransitions = transitions.some(
          t => t.from_state_id === selectedStateId || t.to_state_id === selectedStateId
        )
        if (hasTransitions) {
          addToast('error', 'Remove all transitions first')
          return
        }
        setClipboard({ type: 'state', data: state })
        // Delete the state
        try {
          await stateService.delete(selectedStateId)
          setStates(prev => prev.filter(s => s.id !== selectedStateId))
          pushToUndo({ type: 'state_delete', data: { state } })
          setSelectedStateId(null)
          setFloatingToolbar(null)
          addToast('success', 'State cut')
        } catch (err) {
          console.error('Cut failed:', err)
          addToast('error', 'Cut failed')
        }
      }
    } else if (selectedTransitionId) {
      const transition = transitions.find(t => t.id === selectedTransitionId)
      if (transition) {
        setClipboard({ type: 'transition', data: transition })
        // Delete the transition
        try {
          await transitionService.delete(selectedTransitionId)
          setTransitions(prev => prev.filter(t => t.id !== selectedTransitionId))
          pushToUndo({ type: 'transition_delete', data: { transition } })
          setSelectedTransitionId(null)
          setFloatingToolbar(null)
          addToast('success', 'Transition cut')
        } catch (err) {
          console.error('Cut failed:', err)
          addToast('error', 'Cut failed')
        }
      }
    }
  }, [isAdmin, selectedStateId, selectedTransitionId, states, transitions, setClipboard, setStates, setTransitions, setSelectedStateId, setSelectedTransitionId, setFloatingToolbar, addToast, pushToUndo])

  /**
   * Paste from clipboard
   */
  const handlePaste = useCallback(async () => {
    if (!clipboard || !isAdmin || !selectedWorkflow) return
    
    try {
      if (clipboard.type === 'state') {
        // Create a new state with offset position
        // Destructure to omit id, created_at
        const { id: _id, created_at: _created_at, ...stateData } = clipboard.data
        const newState = {
          ...stateData,
          workflow_id: selectedWorkflow.id,
          position_x: clipboard.data.position_x + 50,
          position_y: clipboard.data.position_y + 50,
          name: `${clipboard.data.name} (copy)`,
        }
        
        const { data, error } = await stateService.create(newState)
        
        if (error || !data) throw error
        
        // Cast through unknown since DB row type may differ from interface
        const createdState = data as unknown as WorkflowState
        setStates(prev => [...prev, createdState])
        pushToUndo({ type: 'state_add', data: { state: createdState } })
        setSelectedStateId(createdState.id)
        addToast('success', 'State pasted')
      } else if (clipboard.type === 'transition') {
        // Can only paste transition if both states exist
        const fromExists = states.some(s => s.id === clipboard.data.from_state_id)
        const toExists = states.some(s => s.id === clipboard.data.to_state_id)
        
        if (!fromExists || !toExists) {
          addToast('error', 'Cannot paste: source or target state not found')
          return
        }
        
        // Check if transition already exists
        const exists = transitions.some(
          t => t.from_state_id === clipboard.data.from_state_id && 
               t.to_state_id === clipboard.data.to_state_id
        )
        if (exists) {
          addToast('error', 'Transition already exists')
          return
        }
        
        // Destructure to omit id, created_at
        const { id: _tid, created_at: _tcreated_at, ...transitionData } = clipboard.data
        const newTransition = {
          ...transitionData,
          workflow_id: selectedWorkflow.id,
          name: `${clipboard.data.name} (copy)`,
        }
        
        const { data, error } = await transitionService.create(newTransition)
        
        if (error || !data) throw error
        
        // Cast through unknown since DB row type may differ from interface
        const createdTransition = data as unknown as WorkflowTransition
        setTransitions(prev => [...prev, createdTransition])
        pushToUndo({ type: 'transition_add', data: { transition: createdTransition } })
        setSelectedTransitionId(createdTransition.id)
        addToast('success', 'Transition pasted')
      }
    } catch (err) {
      console.error('Paste failed:', err)
      addToast('error', 'Paste failed')
    }
  }, [clipboard, isAdmin, selectedWorkflow, states, transitions, setStates, setTransitions, setSelectedStateId, setSelectedTransitionId, addToast, pushToUndo])

  /**
   * Delete selected item
   */
  const handleDeleteSelected = useCallback(async () => {
    if (!isAdmin) return
    
    if (selectedStateId) {
      const state = states.find(s => s.id === selectedStateId)
      if (!state) return
      
      // Check for transitions first
      const hasTransitions = transitions.some(
        t => t.from_state_id === selectedStateId || t.to_state_id === selectedStateId
      )
      if (hasTransitions) {
        addToast('error', 'Remove all transitions first')
        return
      }
      
      try {
        await stateService.delete(selectedStateId)
        setStates(prev => prev.filter(s => s.id !== selectedStateId))
        pushToUndo({ type: 'state_delete', data: { state } })
        setSelectedStateId(null)
        setFloatingToolbar(null)
        addToast('success', 'State deleted')
      } catch (err) {
        console.error('Delete failed:', err)
        addToast('error', 'Delete failed')
      }
    } else if (selectedTransitionId) {
      const transition = transitions.find(t => t.id === selectedTransitionId)
      if (!transition) return
      
      try {
        await transitionService.delete(selectedTransitionId)
        setTransitions(prev => prev.filter(t => t.id !== selectedTransitionId))
        pushToUndo({ type: 'transition_delete', data: { transition } })
        setSelectedTransitionId(null)
        setFloatingToolbar(null)
        addToast('success', 'Transition deleted')
      } catch (err) {
        console.error('Delete failed:', err)
        addToast('error', 'Delete failed')
      }
    }
  }, [isAdmin, selectedStateId, selectedTransitionId, states, transitions, setStates, setTransitions, setSelectedStateId, setSelectedTransitionId, setFloatingToolbar, addToast, pushToUndo])

  return {
    handleCopy,
    handleCut,
    handlePaste,
    handleDeleteSelected
  }
}
