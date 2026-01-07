# Agent 4: Workflows & Suppliers Slice

## Overview

Create slices for workflow data and suppliers. These are feature-specific data stores that benefit from centralization because:
- Workflow templates/states are used across the workflow designer
- Suppliers are referenced in RFQs, orders, and the supplier portal

## Scope

| Feature | Source File | Current State | Target |
|---------|-------------|---------------|--------|
| Workflows | `useWorkflowData.ts` | Multiple `useState` | `workflowsSlice` |
| Suppliers | `SuppliersView.tsx` | `useState<Supplier[]>` | `suppliersSlice` |
| Org Vaults | `VaultsSettings.tsx` | `useState<Vault[]>` | Consider consolidating with `vaultsSlice` |

## Part 1: Workflows Slice

### Step 1: Create Workflows Slice

**Create:** `src/stores/slices/workflowsSlice.ts`

```typescript
import { StateCreator } from 'zustand'
import type { PDMStoreState, WorkflowsSlice } from '../types'
import type { 
  WorkflowTemplate, 
  WorkflowState, 
  WorkflowTransition, 
  WorkflowGate 
} from '../../types/workflow'

export const createWorkflowsSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  WorkflowsSlice
> = (set, get) => ({
  // State
  workflows: [],
  workflowsLoading: false,
  workflowsLoaded: false,
  selectedWorkflowId: null,
  workflowStates: [],
  workflowTransitions: [],
  workflowGates: {},
  
  // Workflow List Actions
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
    selectedWorkflowId: state.selectedWorkflowId === id ? null : state.selectedWorkflowId
  })),
  
  // Selection Actions
  setSelectedWorkflowId: (id) => set({ selectedWorkflowId: id }),
  
  // Workflow Details Actions
  setWorkflowStates: (states) => set({ workflowStates: states }),
  setWorkflowTransitions: (transitions) => set({ workflowTransitions: transitions }),
  setWorkflowGates: (gates) => set({ workflowGates: gates }),
  
  // State CRUD
  addWorkflowState: (state) => set((s) => ({ 
    workflowStates: [...s.workflowStates, state] 
  })),
  updateWorkflowState: (id, updates) => set((s) => ({
    workflowStates: s.workflowStates.map(st => st.id === id ? { ...st, ...updates } : st)
  })),
  removeWorkflowState: (id) => set((s) => ({
    workflowStates: s.workflowStates.filter(st => st.id !== id)
  })),
  
  // Transition CRUD
  addWorkflowTransition: (transition) => set((s) => ({ 
    workflowTransitions: [...s.workflowTransitions, transition] 
  })),
  updateWorkflowTransition: (id, updates) => set((s) => ({
    workflowTransitions: s.workflowTransitions.map(t => t.id === id ? { ...t, ...updates } : t)
  })),
  removeWorkflowTransition: (id) => set((s) => ({
    workflowTransitions: s.workflowTransitions.filter(t => t.id !== id),
    workflowGates: Object.fromEntries(
      Object.entries(s.workflowGates).filter(([key]) => key !== id)
    )
  })),
  
  // Gate CRUD
  setTransitionGates: (transitionId, gates) => set((s) => ({
    workflowGates: { ...s.workflowGates, [transitionId]: gates }
  })),
  
  // Clear
  clearWorkflowData: () => set({
    selectedWorkflowId: null,
    workflowStates: [],
    workflowTransitions: [],
    workflowGates: {},
  }),
  
  // Getters
  getSelectedWorkflow: () => {
    const state = get()
    return state.workflows.find(w => w.id === state.selectedWorkflowId) || null
  },
})
```

### Step 2: Add Workflow Types

**Update:** `src/stores/types.ts`

```typescript
import type { 
  WorkflowTemplate, 
  WorkflowState, 
  WorkflowTransition, 
  WorkflowGate 
} from '../types/workflow'

export interface WorkflowsSlice {
  // Workflow list
  workflows: WorkflowTemplate[]
  workflowsLoading: boolean
  workflowsLoaded: boolean
  setWorkflows: (workflows: WorkflowTemplate[]) => void
  setWorkflowsLoading: (loading: boolean) => void
  addWorkflow: (workflow: WorkflowTemplate) => void
  updateWorkflow: (id: string, updates: Partial<WorkflowTemplate>) => void
  removeWorkflow: (id: string) => void
  
  // Selection
  selectedWorkflowId: string | null
  setSelectedWorkflowId: (id: string | null) => void
  
  // Workflow details (for selected workflow)
  workflowStates: WorkflowState[]
  workflowTransitions: WorkflowTransition[]
  workflowGates: Record<string, WorkflowGate[]>
  setWorkflowStates: (states: WorkflowState[]) => void
  setWorkflowTransitions: (transitions: WorkflowTransition[]) => void
  setWorkflowGates: (gates: Record<string, WorkflowGate[]>) => void
  
  // State CRUD
  addWorkflowState: (state: WorkflowState) => void
  updateWorkflowState: (id: string, updates: Partial<WorkflowState>) => void
  removeWorkflowState: (id: string) => void
  
  // Transition CRUD
  addWorkflowTransition: (transition: WorkflowTransition) => void
  updateWorkflowTransition: (id: string, updates: Partial<WorkflowTransition>) => void
  removeWorkflowTransition: (id: string) => void
  
  // Gate CRUD
  setTransitionGates: (transitionId: string, gates: WorkflowGate[]) => void
  
  // Clear/Reset
  clearWorkflowData: () => void
  
  // Getters
  getSelectedWorkflow: () => WorkflowTemplate | null
}
```

### Step 3: Update useWorkflowData Hook

**Update:** `src/features/source/workflows/hooks/useWorkflowData.ts`

Replace `useState` with store selectors and update methods to use store actions.

## Part 2: Suppliers Slice

### Step 4: Create Suppliers Slice

**Create:** `src/stores/slices/suppliersSlice.ts`

```typescript
import { StateCreator } from 'zustand'
import type { PDMStoreState, SuppliersSlice } from '../types'

export interface Supplier {
  id: string
  name: string
  code: string | null
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  city: string | null
  state: string | null
  country: string | null
  is_active: boolean | null
  is_approved: boolean | null
  erp_id: string | null
  erp_synced_at: string | null
  created_at: string | null
}

export const createSuppliersSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  SuppliersSlice
> = (set) => ({
  // State
  suppliers: [],
  suppliersLoading: false,
  suppliersLoaded: false,
  
  // Actions
  setSuppliers: (suppliers) => set({ suppliers, suppliersLoaded: true }),
  setSuppliersLoading: (loading) => set({ suppliersLoading: loading }),
  addSupplier: (supplier) => set((state) => ({ 
    suppliers: [...state.suppliers, supplier] 
  })),
  updateSupplier: (id, updates) => set((state) => ({
    suppliers: state.suppliers.map(s => s.id === id ? { ...s, ...updates } : s)
  })),
  removeSupplier: (id) => set((state) => ({
    suppliers: state.suppliers.filter(s => s.id !== id)
  })),
  clearSuppliers: () => set({ 
    suppliers: [], 
    suppliersLoaded: false 
  }),
})
```

### Step 5: Add Supplier Types

**Update:** `src/stores/types.ts`

```typescript
export interface SuppliersSlice {
  suppliers: Supplier[]
  suppliersLoading: boolean
  suppliersLoaded: boolean
  setSuppliers: (suppliers: Supplier[]) => void
  setSuppliersLoading: (loading: boolean) => void
  addSupplier: (supplier: Supplier) => void
  updateSupplier: (id: string, updates: Partial<Supplier>) => void
  removeSupplier: (id: string) => void
  clearSuppliers: () => void
}
```

### Step 6: Update SuppliersView

**Update:** `src/features/supply-chain/suppliers/SuppliersView.tsx`

Replace `useState<Supplier[]>` with store selectors.

## Part 3: Org Vaults Consolidation (Optional)

### Step 7: Evaluate Vault Settings

Check `src/features/settings/organization/VaultsSettings.tsx`:
- It uses `useState<Vault[]>` for `orgVaults`
- The existing `vaultsSlice` has `connectedVaults` (local connections)

Options:
1. **Add `orgVaults` to `vaultsSlice`** - All vault data in one place
2. **Keep separate** - Local connections vs org-level management are different concerns

Recommendation: Add `orgVaults` to `vaultsSlice` for consistency.

## Files to Modify

| File | Action |
|------|--------|
| `src/stores/slices/workflowsSlice.ts` | **Create** |
| `src/stores/slices/suppliersSlice.ts` | **Create** |
| `src/stores/slices/index.ts` | Export new slices |
| `src/stores/types.ts` | Add WorkflowsSlice, SuppliersSlice |
| `src/stores/pdmStore.ts` | Compose new slices |
| `src/features/source/workflows/hooks/useWorkflowData.ts` | Use store |
| `src/features/supply-chain/suppliers/SuppliersView.tsx` | Use store |
| `src/stores/slices/vaultsSlice.ts` | Add orgVaults (optional) |
| `src/features/settings/organization/VaultsSettings.tsx` | Use store (optional) |

## Persistence Consideration

- **Workflows**: NOT persisted - fetch fresh
- **Suppliers**: NOT persisted - fetch fresh
- **Org Vaults**: NOT persisted - fetch fresh

## Coordination with Other Agents

- **Agent 2**: Working on workflow roles - ensure no conflicts with workflow states/transitions

## Testing Checklist

### Workflows
- [ ] Workflows list loads correctly
- [ ] Selecting a workflow loads states/transitions
- [ ] Creating a workflow adds to list
- [ ] Editing workflow name updates list
- [ ] Deleting workflow removes from list
- [ ] State/transition CRUD works
- [ ] Data persists when navigating within workflow designer

### Suppliers
- [ ] Suppliers list loads correctly
- [ ] Sync from ERP works
- [ ] Supplier details display correctly
- [ ] Filter/search works
- [ ] Data persists when navigating away and back

### Org Vaults (if implemented)
- [ ] Org vaults load in settings
- [ ] Create vault works
- [ ] Delete vault works
- [ ] No conflict with connected vaults

## Report Generation

After completing this work, generate a report file at `.cursor/plans/zustand-agent-4-report.md` containing:
1. Summary of changes made
2. Decisions on optional items (org vaults)
3. Files created/modified with brief descriptions
4. Any issues encountered and how they were resolved
5. Testing results
6. Coordination notes with other agents
