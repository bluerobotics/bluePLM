# File Tree State Management Fixes - Multi-Agent Plan

## Objective

Fix two related bugs: (1) folders disappearing after "Delete local files" when they contain cloud-only files, and (2) download operations not updating the UI until navigation refresh. Both issues stem from incorrect state management in command handlers and duplicate folderMetrics computation.

## Agent Overview

| Agent | Responsibility | Owns | Dependencies |

|-------|---------------|------|--------------|

| Agent A | Fix delete command logic | `src/lib/commands/handlers/delete.ts` | None |

| Agent B | Consolidate folderMetrics computation | `src/features/source/browser/hooks/useFolderMetrics.ts` | None |

| Agent C | Verification & CHANGELOG | CHANGELOG.md, verification | Agent A, Agent B |

## Shared Files

| File | Owner | Rule |

|------|-------|------|

| `src/stores/slices/filesSlice.ts` | Neither | Read-only for both agents |

| `src/features/source/explorer/file-tree/hooks/useVaultTree.ts` | Agent B | Agent B reads, may add exports |

---

## Root Cause Analysis

### Issue 1: Folder Disappearing After "Delete Local Files"

**Location:** `src/lib/commands/handlers/delete.ts` lines 377-396

When deleting files from a folder:

1. Synced files get updated to `diffStatus: 'cloud'` (remain in store)
2. The folder entry itself gets removed via `removeFilesFromStore(deletedFolderPaths)` in a fire-and-forget `.then()` callback
3. Tree building requires folder ENTRY to exist for it to appear
4. **Result:** Cloud files become orphaned - exist in store but have no visible parent folder

### Issue 2: Download Not Updating UI

**Contributing factors:**

1. Fire-and-forget callbacks in delete.ts cause race conditions with state updates
2. Duplicate `folderMetrics` computation in `useVaultTree.ts` AND `useFolderMetrics.ts` causes potential inconsistency
3. Both compute ~17ms each on every files change (seen in logs: FolderMetrics computed twice)

---

## Agent A: Fix Delete Command Logic

### Prompt

> Fix the delete-local command in BluePLM to properly handle folders containing cloud-only files with enterprise-level code quality.

>

> **Context:** When deleting local files from a folder that contains synced files, those files become `diffStatus: 'cloud'`. Currently, the folder entry is removed from the store, making the cloud files orphaned (invisible in file tree).

>

> **Scope:**

> 1. When deleting a folder that will have cloud-only children remaining, update the folder to `diffStatus: 'cloud'` instead of removing it

> 2. Replace fire-and-forget `.then()` callback (lines 377-396) with proper async/await

> 3. Ensure folder state updates happen synchronously with file updates

>

> **Implementation Details:**

> - Before calling `removeFilesFromStore(deletedFolderPaths)`, check if any child files will remain as cloud-only

> - If cloud children exist, call `updateFileInStore(folderPath, { diffStatus: 'cloud' })` instead

> - Convert the `.then()` callback to awaited code within the main execute function

>

> **Boundaries:**

> - OWNS: `src/lib/commands/handlers/delete.ts`

> - Do NOT modify: `src/stores/slices/filesSlice.ts`, any other command handlers

>

> **Quality Requirements:**

> - Enterprise-level code quality and organization

> - Proper TypeScript types (no `any`)

> - Add JSDoc comments explaining the folder preservation logic

> - Proper error handling

> - Add logging for folder state transitions

>

> **Deliverables:**

> - Updated delete.ts with folder preservation logic

> - Report in `DELETE_FIX_AGENT_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/lib/commands/handlers/delete.ts`
- **READS (no modify):** `src/stores/slices/filesSlice.ts`, `src/lib/commands/types.ts`

### Tasks

- [ ] Analyze current folder deletion logic (lines 377-396)
- [ ] Add helper function to check if folder will have cloud-only children after delete
- [ ] Replace `removeFilesFromStore(deletedFolderPaths)` with conditional logic
- [ ] Convert fire-and-forget `.then()` to awaited async code
- [ ] Add logging for folder state transitions (cloud vs removed)
- [ ] Run typecheck and verify no errors
- [ ] Create report documenting changes

### Implementation Sketch

```typescript
// Before deleting folders, check which ones should become cloud-only vs removed
const foldersToMakeCloudOnly: string[] = []
const foldersToRemove: string[] = []

for (const folderPath of selectedFolderPaths) {
  // Check if any synced files inside this folder will become cloud-only
  const hasCloudChildren = syncedFileUpdates.some(update => 
    update.path.startsWith(folderPath + '/') || update.path.startsWith(folderPath + '\\')
  )
  
  if (hasCloudChildren) {
    foldersToMakeCloudOnly.push(folderPath)
  } else {
    foldersToRemove.push(folderPath)
  }
}

// Update folders that have cloud children
if (foldersToMakeCloudOnly.length > 0) {
  const folderUpdates = foldersToMakeCloudOnly.map(path => ({
    path,
    updates: { diffStatus: 'cloud' as const }
  }))
  ctx.updateFilesInStore(folderUpdates)
}

// Delete folders that have no remaining children (awaited, not fire-and-forget)
if (foldersToRemove.length > 0) {
  const batchResult = await window.electronAPI?.deleteBatch(foldersToRemove, true)
  // ... handle result
}
```

### Deliverables

- Fixed delete.ts that preserves folders as cloud-only when they contain cloud children
- No fire-and-forget callbacks - all state updates are synchronous/awaited
- Report documenting the fix

---

## Agent B: Consolidate FolderMetrics Computation

### Prompt

> Consolidate duplicate folderMetrics computation in BluePLM with enterprise-level code quality.

>

> **Context:** Currently, folder metrics are computed independently in two places:

> - `useVaultTree.ts` (lines 128-338) - computes full FolderMetrics with 14+ fields

> - `useFolderMetrics.ts` (lines 26-156) - computes similar metrics independently

>

> Logs show both running on every files change (~17-20ms each), causing unnecessary work and potential inconsistency.

>

> **Scope:**

> 1. Make `useFolderMetrics.ts` import and re-export metrics from `useVaultTree` instead of computing its own

> 2. OR deprecate `useFolderMetrics.ts` and update consumers to use `useVaultTree` directly

> 3. Ensure single source of truth for folder metrics

>

> **Boundaries:**

> - OWNS: `src/features/source/browser/hooks/useFolderMetrics.ts`

> - READS: `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`

> - May need to update: `src/features/source/browser/hooks/useFilePaneView.ts` (consumer)

>

> **Quality Requirements:**

> - Enterprise-level code quality and organization

> - Preserve all existing functionality

> - Ensure type compatibility

> - Add JSDoc comments explaining the consolidated architecture

>

> **Deliverables:**

> - Consolidated folderMetrics with single computation source

> - Report in `METRICS_CONSOLIDATION_AGENT_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/features/source/browser/hooks/useFolderMetrics.ts`
- **MAY MODIFY:** `src/features/source/browser/hooks/useFilePaneView.ts` (to update consumer)
- **READS (no modify):** `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`

### Tasks

- [ ] Analyze differences between the two folderMetrics computations
- [ ] Determine best consolidation approach (re-export vs deprecate)
- [ ] Update `useFolderMetrics.ts` to use single source
- [ ] Update any consumers if needed
- [ ] Verify logs show single computation instead of duplicate
- [ ] Run typecheck and verify no errors
- [ ] Create report documenting changes

### Analysis Notes

**useVaultTree.ts FolderMetrics fields:**

- cloudFilesCount, cloudNewFilesCount, localOnlyFilesCount
- checkoutableFilesCount, outdatedFilesCount
- hasCheckoutableFiles, hasMyCheckedOutFiles, hasOthersCheckedOutFiles, hasUnsyncedFiles
- myCheckedOutFilesCount, totalCheckedOutFilesCount, syncedFilesCount
- checkoutUsers, isSynced, checkoutStatus
- addedCount, modifiedCount, movedCount, deletedCount, deletedRemoteCount

**useFolderMetrics.ts FolderMetrics fields:**

- cloudFilesCount, cloudNewFilesCount, localOnlyFilesCount
- checkoutableFilesCount, outdatedFilesCount
- hasCheckoutableFiles, hasMyCheckedOutFiles, hasOthersCheckedOutFiles, hasUnsyncedFiles
- myCheckedOutFilesCount, totalCheckedOutFilesCount
- checkoutUsers, isSynced

The useVaultTree version is more complete. Recommend making useFolderMetrics a thin wrapper or deprecating it.

### Deliverables

- Single source of truth for folderMetrics computation
- No duplicate FolderMetrics logs on state changes
- Report documenting consolidation approach

---

## Agent C: Verification & CHANGELOG

### Prompt

> Verify the file tree state management fixes and update CHANGELOG.md with enterprise-level documentation.

>

> **Context:** Agent A fixed delete command folder preservation, Agent B consolidated folderMetrics computation.

>

> **Scope:**

> 1. Run `npm run typecheck` - fix ALL errors

> 2. Manual verification:

>    - Delete local files from folder with synced files -> folder should show as cloud-only (gray)

>    - Download a cloud file -> status should update immediately (no navigation needed)

>    - Check logs for single FolderMetrics computation (not duplicate)

> 3. Update CHANGELOG.md with fixes

>

> **CHANGELOG Entry (add to appropriate version):**

> ```markdown

> ### Fixed

> - Fixed folder disappearing after "Delete local files" when folder contains synced files

> - Fixed download operations not updating UI until navigation refresh

> - Consolidated duplicate folderMetrics computation for better performance and consistency

>

> ### Changed

> - Delete command now preserves folders as cloud-only when they contain cloud files

> - Removed fire-and-forget callbacks in delete command for reliable state updates

> ```

>

> **Boundaries:**

> - OWNS: `CHANGELOG.md`

> - Do NOT modify: Any source files (only verify and document)

>

> **Deliverables:**

> - 0 TypeScript errors

> - Updated CHANGELOG.md

> - Report in `VERIFICATION_AGENT_REPORT.md` with test results

>

> **When complete:** List all verification steps performed and results.

### Boundary

- **OWNS (exclusive write):** `CHANGELOG.md`, verification report
- **READS (no modify):** All source files modified by Agent A and Agent B

### Tasks

- [ ] Run `npm run typecheck` and report results
- [ ] Test: Delete local files from folder with synced files
- [ ] Test: Download cloud file and verify immediate UI update
- [ ] Test: Check logs for single FolderMetrics computation
- [ ] Update CHANGELOG.md with fixes
- [ ] Create verification report with test results

### Deliverables

- Verified 0 TypeScript errors
- All manual tests passing
- Updated CHANGELOG.md
- Comprehensive verification report

---

## Success Criteria

| Test | Expected Result |

|------|-----------------|

| Delete local files from folder with synced files | Folder shows as cloud-only (gray icon), not disappeared |

| Download cloud file | Status updates immediately, no navigation refresh needed |

| FolderMetrics logs | Single "Computation complete" per state change, not duplicate |

| TypeScript | `npm run typecheck` passes with 0 errors |

## Notes

- These fixes address root causes, not symptoms
- No hot-fixes or workarounds - proper enterprise-level solutions
- All state updates should be synchronous/awaited, not fire-and-forget