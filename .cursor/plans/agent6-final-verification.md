# Agent 6: Final Verification & Integration

## Objective
Verify all refactoring work from Agents 1-5 integrates correctly, fix any remaining issues, and ensure the application runs without errors.

## Prerequisites
This plan runs AFTER all other agents have completed:
- Agent 1: Utility Consolidation ✓
- Agent 2: Store Architecture ✓
- Agent 3: Layout Refactoring ✓
- Agent 4: Feature Cleanup ✓
- Agent 5: PDM Utility Extraction ✓

## Tasks

### Task 1: Run TypeScript Compilation

```powershell
npm run typecheck
```

Fix any compilation errors. Common issues to watch for:
- Missing imports after utility moves
- Type mismatches from store changes
- Circular dependencies from utility reorganization

### Task 2: Run ESLint

```powershell
npm run lint
```

Ensure no new warnings were introduced. The target is <10 eslint-disable comments remaining (down from 41).

### Task 3: Verify Import Consistency

Search for any remaining imports from deleted/moved locations:

```powershell
# Should return 0 results:
grep -r "from '@/features/source/browser/utils/formatting'" src/
grep -r "from '@/components/shared/FileContextMenu'" src/
grep -r "formatFileSize.*from '@/types/pdm'" src/
grep -r "getInitials.*from '@/types/pdm'" src/
```

### Task 4: Build Application

```powershell
npm run build
```

Ensure production build completes without errors.

### Task 5: Start Development Server

```powershell
npm run dev
```

Manually verify core functionality:

**File Browser:**
- [ ] Files load correctly
- [ ] File sizes display properly (formatFileSize working)
- [ ] File icons display correctly (getFileIconType working)
- [ ] Context menu appears and works
- [ ] Selection count labels work (getCountLabel working)

**User Avatars:**
- [ ] Avatars display with correct initials
- [ ] Avatar colors are consistent for same user
- [ ] Profile pictures load when available

**Navigation:**
- [ ] Sidebar views switch correctly
- [ ] Settings tab persists across refresh
- [ ] Opening vault works
- [ ] Recent vaults work

**Store Persistence:**
- [ ] Settings persist after refresh
- [ ] UI state (sidebar width, panel visibility) persists
- [ ] No console errors about store migrations

### Task 6: Verify Deleted Files Are Gone

Confirm these files/directories no longer exist:
- [ ] `src/features/source/browser/utils/formatting.ts` - DELETED
- [ ] `src/components/shared/FileContextMenu/` - DELETED (entire directory)

### Task 7: Verify New Files Exist

Confirm these files were created:
- [ ] `src/lib/utils/avatar.ts` - Contains getInitials, getAvatarColor, getEffectiveAvatarUrl
- [ ] `src/lib/utils/file.ts` - Contains getFileType, getFileIconType, isCADFile
- [ ] `src/stores/migrations.ts` - Contains migration system
- [ ] `src/constants/moduleLabels.ts` - Contains MODULE_LABELS, MODULE_TITLES

### Task 8: Check for Orphaned Code

Search for any functions that are now unused:

```powershell
# Check if formatFileSize still exists in pdm.ts (should be removed)
grep -n "export function formatFileSize" src/types/pdm.ts

# Check if old utilities are referenced anywhere
grep -r "browser/utils/formatting" src/
```

### Task 9: Document Any Remaining Technical Debt

If any issues couldn't be resolved, document them:

1. Create a `TECH_DEBT.md` file or GitHub issues
2. Note why the issue exists
3. Suggest future fix approach

### Task 10: Update Plan Status

After all verification passes, mark the master plan as complete.

## Verification Checklist

### Build & Type Safety
- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm run lint` passes (with minimal warnings)
- [ ] `npm run build` completes successfully

### Runtime Verification
- [ ] App starts without console errors
- [ ] File browser loads and displays files
- [ ] Context menus work
- [ ] Settings persist
- [ ] Avatars display correctly

### Code Quality
- [ ] No imports from deleted paths
- [ ] No duplicate utility implementations remain
- [ ] Store migrations work (tested by clearing _storeVersion)
- [ ] Sidebar uses MODULE_LABELS constants

### Final Metrics

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Duplicate utility functions | 12+ | ? | 0 |
| eslint-disable comments | 41 | ? | <10 |
| Prop drilling depth | 4 levels | ? | 1 |
| Sidebar.tsx lines | ~550 | ? | ~150 |
| FileContextMenu implementations | 3 | ? | 1 |

Fill in "After" column during verification.

## Common Issues & Fixes

### Issue: "Cannot find module '@/lib/utils/avatar'"
**Fix**: Ensure `src/lib/utils/index.ts` exports the new module:
```typescript
export * from './avatar'
```

### Issue: "Property 'settingsTab' does not exist on store"
**Fix**: Verify Agent 2 added settingsTab to UISlice and types.ts

### Issue: Circular dependency warning
**Fix**: Ensure `src/lib/utils/file.ts` only imports TYPES from pdm.ts:
```typescript
import type { PDMFile, FileIconType } from '@/types/pdm'  // OK
import { someFunction } from '@/types/pdm'  // BAD - don't import functions
```

### Issue: Store not persisting correctly
**Fix**: Check pdmStore.ts partialize includes all new fields

## Files to Review
- `src/lib/utils/index.ts` - Verify all exports
- `src/stores/pdmStore.ts` - Verify partialize and merge
- `src/types/pdm.ts` - Verify utility functions removed
- `src/app/App.tsx` - Verify prop drilling eliminated
- `src/components/layout/Sidebar/Sidebar.tsx` - Verify uses MODULE_LABELS
