# Zustand Final Loose Ends

## Overview

Two remaining files still have local state that should use the Zustand store:

1. `useECOModal.ts` - Has redundant `activeECOs` state (ecosSlice now exists)
2. `useContextMenuState.ts` - Has `orgUsers` state (should use `members` from organizationDataSlice)

---

## Issue 1: useECOModal.ts

### File
`src/features/source/browser/hooks/useECOModal.ts`

### Problem
This hook has local `activeECOs` and `loadingECOs` state, but the ecosSlice now provides this centrally.

### Solution
This hook is used by FilePane.tsx for modal UI state. We should:
1. Remove `activeECOs` and `loadingECOs` local state
2. Use `getActiveECOs()` from the store instead
3. Keep UI state (showECOModal, ecoFile, selectedECO, etc.) as local

### Updated Hook Should:
```typescript
import { usePDMStore } from '@/stores/pdmStore'

export function useECOModal() {
  const { getActiveECOs, ecosLoading } = usePDMStore()
  const activeECOs = getActiveECOs()
  
  // Keep local UI state
  const [showECOModal, setShowECOModal] = useState(false)
  const [ecoFile, setEcoFile] = useState<LocalFile | null>(null)
  const [selectedECO, setSelectedECO] = useState<string | null>(null)
  // ...
  
  return {
    // From store
    activeECOs,
    loadingECOs: ecosLoading,
    // Local UI state
    showECOModal, setShowECOModal,
    // ...
  }
}
```

---

## Issue 2: useContextMenuState.ts

### File
`src/features/source/context-menu/hooks/useContextMenuState.ts`

### Problem
Has local `orgUsers` and `loadingUsers` state for the mention/review dialogs.

### Solution
Use `members` from organizationDataSlice instead.

### Changes Needed:
1. Import `members`, `membersLoaded` from store
2. Remove local `orgUsers` state and `loadOrgUsers` callback
3. Filter out current user from members for the dialog

---

## Files to Modify

| File | Change |
|------|--------|
| `src/features/source/browser/hooks/useECOModal.ts` | Use ecosSlice instead of local state |
| `src/features/source/context-menu/hooks/useContextMenuState.ts` | Use members from store |

---

## Verification

1. Run `npm run typecheck`
2. Test file context menu > "Request Review" - should show org users
3. Test file context menu > "Add to ECO" - should show active ECOs
4. Test ECO modal from file browser - should use cached ECO data
