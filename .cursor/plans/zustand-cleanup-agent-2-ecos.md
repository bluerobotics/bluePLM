# Agent 2: Create ECOs Slice

## Objective

Create a new Zustand slice to centralize ECO (Engineering Change Order) data that is currently fetched independently in multiple places.

## Problem

ECO data is fetched separately in 5+ locations:
- `ECOView.tsx` - Main ECO list view
- `AddToECODialog.tsx` - Dialog to add file to ECO
- `useContextMenuState.ts` - Context menu actions
- `useModalHandlers.ts` - File browser modals
- `collaboration.ts` - CLI commands

This causes redundant network requests and no shared state.

## Implementation Steps

### Step 1: Add Types to `src/stores/types.ts`

Add ECO interface and slice interface:

```typescript
// Add near other interfaces (around line 720-740)

export interface ECO {
  id: string
  eco_number: string
  title: string | null
  description: string | null
  status: 'open' | 'in_progress' | 'completed' | 'cancelled' | null
  created_at: string | null
  created_by: string
  file_count?: number
  created_by_name?: string | null
  created_by_email?: string
}

export interface ECOsSlice {
  // State
  ecos: ECO[]
  ecosLoading: boolean
  ecosLoaded: boolean
  
  // Actions
  setECOs: (ecos: ECO[]) => void
  setECOsLoading: (loading: boolean) => void
  addECO: (eco: ECO) => void
  updateECO: (id: string, updates: Partial<ECO>) => void
  removeECO: (id: string) => void
  clearECOs: () => void
  
  // Getter
  getActiveECOs: () => ECO[]
}
```

Add `ECOsSlice` to the `PDMStoreState` type intersection:
```typescript
export type PDMStoreState = 
  ToastsSlice & 
  // ... existing slices ...
  ECOsSlice  // ADD THIS
```

### Step 2: Create `src/stores/slices/ecosSlice.ts`

```typescript
import { StateCreator } from 'zustand'
import type { PDMStoreState, ECOsSlice } from '../types'

export const createECOsSlice: StateCreator<
  PDMStoreState,
  [['zustand/persist', unknown]],
  [],
  ECOsSlice
> = (set, get) => ({
  // Initial state
  ecos: [],
  ecosLoading: false,
  ecosLoaded: false,
  
  // Actions
  setECOs: (ecos) => set({ ecos, ecosLoaded: true }),
  setECOsLoading: (loading) => set({ ecosLoading: loading }),
  
  addECO: (eco) => set((state) => ({ 
    ecos: [...state.ecos, eco] 
  })),
  
  updateECO: (id, updates) => set((state) => ({
    ecos: state.ecos.map(e => e.id === id ? { ...e, ...updates } : e)
  })),
  
  removeECO: (id) => set((state) => ({
    ecos: state.ecos.filter(e => e.id !== id)
  })),
  
  clearECOs: () => set({ 
    ecos: [], 
    ecosLoaded: false,
    ecosLoading: false
  }),
  
  // Getter for active ECOs (open or in_progress)
  getActiveECOs: () => {
    const { ecos } = get()
    return ecos.filter(e => e.status === 'open' || e.status === 'in_progress')
  }
})
```

### Step 3: Export from `src/stores/slices/index.ts`

Add:
```typescript
export { createECOsSlice } from './ecosSlice'
```

### Step 4: Register in `src/stores/pdmStore.ts`

Add import:
```typescript
import {
  // ... existing imports ...
  createECOsSlice,
} from './slices'
```

Add to store composition (after other slices):
```typescript
...createECOsSlice(...a),
```

**Do NOT add to `partialize`** - ECOs should not be persisted.

### Step 5: Update `src/features/change-control/eco/ECOView.tsx`

Replace local state with store:

```typescript
// Remove:
const [ecos, setEcos] = useState<ECO[]>([])
const [isLoading, setIsLoading] = useState(false)

// Add to store destructuring:
const {
  // ... existing ...
  ecos,
  ecosLoading,
  ecosLoaded,
  setECOs,
  setECOsLoading,
  addECO,
  updateECO,
} = usePDMStore()

// Update loadECOs to use store actions
// Only load if !ecosLoaded
```

Import ECO type from store types instead of local definition.

### Step 6: Update `src/features/source/context-menu/dialogs/AddToECODialog.tsx`

```typescript
// Remove:
const [activeECOs, setActiveECOs] = useState<ECO[]>([])
const [loadingECOs, setLoadingECOs] = useState(false)

// Add:
const { ecos, ecosLoaded, getActiveECOs } = usePDMStore()
const activeECOs = getActiveECOs()

// Update useEffect to only fetch if !ecosLoaded
```

### Step 7: Update `src/features/source/context-menu/hooks/useContextMenuState.ts`

Replace the local `activeECOs` state and `getActiveECOs` call with store state.

### Step 8: Update `src/features/source/browser/hooks/useModalHandlers.ts`

Replace the `getActiveECOs` call with store's `getActiveECOs()`.

## Files to Modify

| File | Change |
|------|--------|
| `src/stores/types.ts` | Add ECO type, ECOsSlice interface, update PDMStoreState |
| `src/stores/slices/ecosSlice.ts` | **Create** new slice file |
| `src/stores/slices/index.ts` | Export createECOsSlice |
| `src/stores/pdmStore.ts` | Import and compose slice |
| `src/features/change-control/eco/ECOView.tsx` | Use store state |
| `src/features/source/context-menu/dialogs/AddToECODialog.tsx` | Use store state |
| `src/features/source/context-menu/hooks/useContextMenuState.ts` | Use store state |
| `src/features/source/browser/hooks/useModalHandlers.ts` | Use store state |

## Important Notes

1. ECOs should NOT be persisted (not added to `partialize`)
2. Keep local UI state (expandedECO, searchQuery, statusFilter) as local useState
3. The CLI (`collaboration.ts`) can continue to fetch directly since it may run before UI loads
4. Import `ECO` type from `@/stores/types` in components that need it

## Verification

1. Run `npm run typecheck` - should pass with 0 errors
2. Navigate to ECO view - should load ECOs
3. Right-click a file > "Add to ECO" - should show active ECOs without refetching
4. Open ECO modal from file browser - should use cached data

## Report

After completion, create a report at `.cursor/plans/zustand-cleanup-agent-2-report.md` with:
1. Files created/modified
2. TypeScript check results
3. Summary of changes made
4. Any issues encountered
