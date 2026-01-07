import { StateCreator } from 'zustand'
import type { PDMStoreState, WorkflowsSlice } from '../types'

export const createWorkflowsSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  WorkflowsSlice
> = (set, get) => ({
  // State - Workflow list
  workflows: [],
  workflowsLoading: false,
  workflowsLoaded: false,
  
  // State - Selected workflow
  selectedWorkflowId: null,
  
  // State - Workflow details (for selected workflow)
  workflowStates: [],
  workflowTransitions: [],
  workflowGates: {},
  
  // ═══════════════════════════════════════════════════════════════
  // Workflow List Actions
  // ═══════════════════════════════════════════════════════════════
  
  setWorkflows: (workflows) => set({ workflows, workflowsLoaded: true }),
  setWorkflowsLoading: (loading) => set({ workflowsLoading: loading }),
  
  addWorkflow: (workflow) => set((state) => ({ 
    workflows: [...state.workflows, workflow] 
  })),
  
  updateWorkflow: (id, updates) => set((state) => ({
    workflows: state.workflows.map(w => w.id === id ? { ...w, ...updates } : w)
  })),
  
  removeWorkflow: (id) => set((state) => ({
    workflows: state.workflows.filter(w => w.id !== id),
    selectedWorkflowId: state.selectedWorkflowId === id ? null : state.selectedWorkflowId,
    // Clear workflow details if removed workflow was selected
    workflowStates: state.selectedWorkflowId === id ? [] : state.workflowStates,
    workflowTransitions: state.selectedWorkflowId === id ? [] : state.workflowTransitions,
    workflowGates: state.selectedWorkflowId === id ? {} : state.workflowGates,
  })),
  
  // ═══════════════════════════════════════════════════════════════
  // Selection Actions
  // ═══════════════════════════════════════════════════════════════
  
  setSelectedWorkflowId: (id) => set({ selectedWorkflowId: id }),
  
  // ═══════════════════════════════════════════════════════════════
  // Workflow Details Actions
  // ═══════════════════════════════════════════════════════════════
  
  setWorkflowStates: (states) => set({ workflowStates: states }),
  setWorkflowTransitions: (transitions) => set({ workflowTransitions: transitions }),
  setWorkflowGates: (gates) => set({ workflowGates: gates }),
  
  // ═══════════════════════════════════════════════════════════════
  // State CRUD
  // ═══════════════════════════════════════════════════════════════
  
  addWorkflowState: (state) => set((s) => ({ 
    workflowStates: [...s.workflowStates, state] 
  })),
  
  updateWorkflowState: (id, updates) => set((s) => ({
    workflowStates: s.workflowStates.map(st => st.id === id ? { ...st, ...updates } : st)
  })),
  
  removeWorkflowState: (id) => set((s) => ({
    workflowStates: s.workflowStates.filter(st => st.id !== id)
  })),
  
  // ═══════════════════════════════════════════════════════════════
  // Transition CRUD
  // ═══════════════════════════════════════════════════════════════
  
  addWorkflowTransition: (transition) => set((s) => ({ 
    workflowTransitions: [...s.workflowTransitions, transition] 
  })),
  
  updateWorkflowTransition: (id, updates) => set((s) => ({
    workflowTransitions: s.workflowTransitions.map(t => t.id === id ? { ...t, ...updates } : t)
  })),
  
  removeWorkflowTransition: (id) => set((s) => ({
    workflowTransitions: s.workflowTransitions.filter(t => t.id !== id),
    // Also remove gates for this transition
    workflowGates: Object.fromEntries(
      Object.entries(s.workflowGates).filter(([key]) => key !== id)
    )
  })),
  
  // ═══════════════════════════════════════════════════════════════
  // Gate CRUD
  // ═══════════════════════════════════════════════════════════════
  
  setTransitionGates: (transitionId, gates) => set((s) => ({
    workflowGates: { ...s.workflowGates, [transitionId]: gates }
  })),
  
  // ═══════════════════════════════════════════════════════════════
  // Clear/Reset
  // ═══════════════════════════════════════════════════════════════
  
  clearWorkflowData: () => set({
    selectedWorkflowId: null,
    workflowStates: [],
    workflowTransitions: [],
    workflowGates: {},
  }),
  
  clearWorkflowsSlice: () => set({
    workflows: [],
    workflowsLoading: false,
    workflowsLoaded: false,
    selectedWorkflowId: null,
    workflowStates: [],
    workflowTransitions: [],
    workflowGates: {},
  }),
  
  // ═══════════════════════════════════════════════════════════════
  // Getters
  // ═══════════════════════════════════════════════════════════════
  
  getSelectedWorkflow: () => {
    const state = get()
    return state.workflows.find(w => w.id === state.selectedWorkflowId) || null
  },
})
