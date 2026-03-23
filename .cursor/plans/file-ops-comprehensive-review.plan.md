---
name: File operations comprehensive review
overview: Full-system audit of every file operation code path (rename, move, drag-drop, restore, sync, realtime, copy, merge-folder) to verify the ghost file data loss fix is complete and no other file operation bugs exist.
todos:
  - id: review-plans-reports
    content: "Phase 1: Read and internalize all plans and reports. Verify every claimed fix matches the actual code."
    status: pending
  - id: review-rename-paths
    content: "Phase 2: Trace every rename code path end-to-end (command rename, inline rename, terminal rename) through store, server, and realtime."
    status: pending
  - id: review-move-paths
    content: "Phase 3: Trace every move code path end-to-end (command move, drag-drop, terminal move, merge-folder) through store, server, and realtime."
    status: pending
  - id: review-restore-paths
    content: "Phase 4: Trace every restore code path (single, batch, terminal restore) through DB, store, folder picker, and edge cases."
    status: pending
  - id: review-sync-realtime
    content: "Phase 5: Audit useLoadFiles pdmMap reconciliation, useRealtimeSubscriptions file path updates, and race conditions between store and server."
    status: pending
  - id: review-delete-copy-other
    content: "Phase 6: Audit delete, copy, checkout/checkin, and any other operation that modifies file_path or relativePath."
    status: pending
  - id: review-gap-fixes
    content: "Phase 7: Verify the 5 gap fixes from the final review (folder picker dismiss, vault_id filter, case-insensitive replace, wasAdded checks) are correctly implemented."
    status: pending
  - id: write-verdict
    content: "Phase 8: Write final verdict with any new issues found, or confirm the system is ship-ready."
    status: pending
isProject: false
---

# File Operations Comprehensive Review

## Purpose

This is a full-system audit of every code path that creates, renames, moves, deletes, restores, or synchronizes files in BluePLM. The goal is to verify that the ghost file data loss fix (7 bugs + 6 follow-ups + 5 gap fixes) is complete, and that no other file operation bugs exist anywhere in the system.

You are the final gate before this ships to production. Be thorough. Be skeptical. Trace every path.

---

## Context: What Was Fixed

A cascade of bugs caused permanent data loss when a user renamed a folder:

1. Rename folder locally -> store updates path/relativePath but NOT pdmData.file_path
2. Server update (updateFolderPath) runs one-by-one with no transaction, some fail silently
3. On next sync, stale pdmData.file_path creates "ghost files" in the old folder
4. User deletes ghost files -> actually deletes the REAL server records
5. User tries to restore from trash -> file placed at old path, silently disappears

Three rounds of fixes were applied:

- **Round 1** (7 bugs): Core fixes in fileOps.ts, mutations.ts, filesSlice.ts, TrashView.tsx
- **Round 2** (6 follow-ups): Drag-drop fixes in useFileOperations.ts, FolderPickerDialog, updateFilesInStore side-effect
- **Round 3** (5 gaps): Folder picker dismiss, vault_id filter, case-insensitive replace, wasAdded checks

---

## Documents to Read First

Read ALL of these before starting code review. They contain the reasoning, trade-offs, and known limitations:

### Plans

- `.cursor/plans/fix_ghost_file_data_loss.plan.md` -- Original 7-bug plan with detailed root cause analysis
- `.cursor/plans/ghost_file_followups_8c370328.plan.md` -- Follow-up plan for drag-drop and folder picker
- `.cursor/plans/ghost_file_final_review_a11de9e4.plan.md` -- Final review that found 5 remaining gaps

### Reports (all in `.cursor/reports/`)

- `SUMMARY.md` -- Overview of all Round 1 changes
- `fix-updatefolderpath.md` -- Fix 2: Hardened updateFolderPath
- `fix-rename-pdmdata.md` -- Fix 1: pdmData update in rename
- `fix-updatefolderpath-callers.md` -- Fix 3: Caller result checking
- `fix-restore-flow.md` -- Fix 4: addCloudFile guard + stale path detection
- `fix-batch-restore-errors.md` -- Fix 5: Batch error reporting
- `check-filepane-rename.md` -- FilePane verification (safe, uses command system)
- `fix-restore-stale-path.md` -- Bug 6 documentation (stale paths on restore)
- `updatefolderpath-rpc.md` -- Deferred: Supabase RPC proposal
- `fix-race-window.md` -- Deferred: Race window analysis
- `fix-updatefilesinstore-side-effect.md` -- Side-effect fix ('in' operator)
- `add-tests.md` -- Test plan (no framework exists yet)
- `ghost-file-followups.md` -- Round 2 implementation report

---

## Phase 1: Verify Plans Match Code

For each claimed fix, read the plan description, then read the actual code and verify they match.

### Files to diff (ghost file changes only, filter out SolidWorks/unrelated changes):


| File                                                     | What to verify                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/supabase/files/mutations.ts`                    | `updateFolderPath`: trailing slash normalization, `/%` prefix, `deleted_at IS NULL`, `vault_id` filter when provided, case-insensitive regex replace, error logging, accurate return type `{success, updated, total, errors}`. Also verify `updateFilePath` function.                                                                                                                    |
| `src/lib/commands/handlers/fileOps.ts`                   | Rename command: nestedSyncedFiles collected BEFORE renameFileInStore, updateFilesInStore AFTER, updateFolderPath result checked with vault_id passed. Move command: same result checking pattern with vault_id.                                                                                                                                                                          |
| `src/stores/slices/filesSlice.ts`                        | `addCloudFile`: vaultPath null warning logged. `updateFilesInStore`: `'pendingMetadata' in fileUpdates` check (not `=== undefined`). Same for copiedFromFileId/copiedVersion. `renameFileInStore`: confirm nested items still only update path/relativePath (pdmData handled separately by callers).                                                                                     |
| `src/features/source/trash/TrashView.tsx`                | Single restore: stale path detected BEFORE addCloudFile, folder picker opened, wasAdded check in onSelect, fullFileData stored in state, addCloudFile called on dismiss. Batch restore: same pattern, stalePathFiles has fullFileData, no `as any` cast, wasAdded count check, error messages collected. FolderPickerDialog rendered with onClose that calls addCloudFile for each file. |
| `src/features/source/trash/FolderPickerDialog.tsx`       | Filters `isDirectory && diffStatus !== 'cloud'`. Tree builds correctly. Vault Root option. Keyboard handling.                                                                                                                                                                                                                                                                            |
| `src/features/source/browser/hooks/useFileOperations.ts` | `handleMoveFiles`: isMove=true for directories, nestedSyncedFiles collected before renameFileInStore, updateFilesInStore after, updateFolderServerPath called, updateFolderPath called with vault_id.                                                                                                                                                                                    |


---

## Phase 2: Trace Every Rename Path

There are multiple code paths that rename files. Trace each one end-to-end.

### Path A: Command-based rename (`renameCommand` in fileOps.ts)

- Entry: `executeCommand('rename', { file, newName })`
- Flow: validate -> local rename via electronAPI -> renameFileInStore -> updateFilesInStore (pdmData) -> toast -> server updates (updateFolderPath, updateFolderServerPath, updateFilePath)
- Verify: pdmData.file_path updated for ALL nested files, not just the renamed item
- Verify: cloud-only file early return (line ~212) handles single files only, directories fall through to main path

### Path B: Inline rename in FilePane

- Entry: `FilePane.tsx` -> `useFileEditHandlers` -> `executeCommand('rename', ...)`
- Verify: Goes through command system (Path A). No direct renameFileInStore call for renames.

### Path C: Terminal rename (`handleRename` in fileTerminal.ts)

- Read `src/lib/commands/handlers/fileTerminal.ts` `handleRename`
- Verify: Does it update pdmData.file_path? Does it call updateFolderPath? Or is it local-only?

### Path D: Realtime rename detection (useLoadFiles inode matching)

- Read `src/hooks/useLoadFiles.ts` inode-based rename detection
- Verify: When a file is detected as renamed via inode, does it update pdmData.file_path correctly?
- Verify: The `updateFileLocationFromServer` / `batchUpdateFileLocationsFromServer` actions in filesSlice.ts

### Questions to answer:

- Can a rename happen through any path that does NOT update pdmData.file_path?
- After a folder rename, if loadFiles runs before updateFolderPath completes, what happens? (Race window -- should be documented as accepted risk)

---

## Phase 3: Trace Every Move Path

### Path A: Command-based move (`moveCommand` in fileOps.ts)

- Entry: `executeCommand('move', { files, destination })`
- Flow: For directories -- collect nestedSyncedFiles -> renameFileInStore(isMove=true) -> updateFilesInStore(pdmData) -> server updates
- Verify: Same pattern as rename but with isMove=true. Verify path math differs correctly.

### Path B: Drag-drop move (`handleMoveFiles` in useFileOperations.ts)

- Entry: `handleMoveFiles(filesToMove, targetFolderPath)`
- Flow: Server updates FIRST (updateFolderPath + updateFolderServerPath), then local move, then renameFileInStore(isMove=true), then updateFilesInStore
- Verify: Order is server-first (opposite of command system). What happens if local move fails after server succeeds? (Known pre-existing risk)
- Verify: vault_id passed to updateFolderPath

### Path C: Tree drag-drop (`useTreeDragDrop.ts`)

- Read `src/features/source/explorer/file-tree/hooks/useTreeDragDrop.ts`
- Verify: Does it call handleMoveFiles or has its own implementation?

### Path D: Terminal move (`handleMove` in fileTerminal.ts)

- Read the terminal move handler
- Verify: Does it update pdmData and server paths?

### Path E: Merge folder (`mergeFolderCommand` in fileOps.ts)

- Verify: The plan says "Only moves individual files with isMove=true, no nested pdmData issue"
- Confirm this by reading the code

### Questions to answer:

- Can a move happen through any path that does NOT update pdmData.file_path?
- Can a folder move happen that does NOT call updateFolderServerPath?

---

## Phase 4: Trace Every Restore Path

### Path A: Single file restore (TrashView.tsx)

- Flow: restoreFile(DB) -> stale path check -> folder picker OR direct addCloudFile -> wasAdded check
- Verify: On folder picker dismiss, addCloudFile is called with fullFileData
- Verify: On folder picker select, updateFilePath + addCloudFile + wasAdded check
- Edge case: What if restoreFile succeeds but result.file is null? (Line 468 handles this)

### Path B: Batch file restore (TrashView.tsx)

- Flow: Loop restoreFile for each -> collect stale files -> show single folder picker for all
- Verify: stalePathFiles has fullFileData, no `as any` cast
- Verify: On dismiss, addCloudFile called for each stale file
- Verify: Error messages collected and displayed
- Edge case: What if user cancels progress toast mid-restore? (isProgressToastCancelled check)

### Path C: Terminal restore (`handleRestore` in backupOps.ts and restore.ts)

- Read both handlers
- Verify: Do they go through the same restoreFile path? Do they handle stale paths?

### Questions to answer:

- Can a restore happen through any path that leaves files invisible (not in store)?
- Is the duplicate file check in restoreFile (line ~128) correct for case-insensitive Windows paths?
- What happens if vault is disconnected during restore? (addCloudFile returns void with warning)

---

## Phase 5: Audit Sync and Realtime

### useLoadFiles pdmMap reconciliation

- Read `src/hooks/useLoadFiles.ts` thoroughly, focusing on:
  - `pdmMap` construction (line ~223): keyed by `file_path.toLowerCase()`
  - Ghost file creation: cloud-only loop (line ~779) -- when does a server file become a ghost?
  - Ghost-orphan cross-referencing (line ~838): safety net for missed renames
  - Move detection via inode (line ~452) and content hash (line ~793)
- Verify: After the fixes, can a stale pdmData.file_path still create ghost files?
- Verify: The `inodeMatchedServerPaths` and `wasMoved` checks correctly suppress ghost creation

### useRealtimeSubscriptions

- Read `src/hooks/useRealtimeSubscriptions.ts`
- Verify: When a file INSERT/UPDATE arrives via realtime, does it call addCloudFile or updateFileLocationFromServer?
- Verify: Can a realtime event overwrite the store's correct pdmData.file_path with stale server data during the race window?

### updateFileLocationFromServer / batchUpdateFileLocationsFromServer

- Read these actions in `src/stores/slices/filesSlice.ts`
- Verify: Do they update pdmData.file_path? Can they create inconsistencies?

---

## Phase 6: Audit Other Operations

### Delete (softDeleteFile, softDeleteFiles)

- Verify: `softDeleteFile` only sets `deleted_at`, doesn't modify paths
- Verify: The UI correctly removes files from store after delete

### Copy (`copyCommand` in fileOps.ts)

- Verify: Copy creates new files with new paths, not path updates
- Verify: `copiedFromFileId` and `copiedVersion` handling

### Checkout / Checkin

- Verify: These don't modify file_path
- Verify: `checkinFile` in checkout.ts doesn't change paths

### updateFolderServerPath (folders table)

- Read `src/lib/supabase/files/folders.ts` `updateFolderServerPath`
- Verify: It already uses `/%` and `deleted_at IS NULL` for child folders (plan claims this)
- Verify: Does it also need a vault_id filter?

### Bulk assembly operations

- Read `src/lib/commands/handlers/bulkAssembly.ts`
- Verify: Bulk operations don't modify file paths

---

## Phase 7: Verify Gap Fixes

Read the actual code (not the plan) and verify each gap fix:

### GAP 1+4: Folder picker dismiss + fullFileData

In `TrashView.tsx`:

- `folderPickerState` type includes `fullFileData: any`
- Single restore: `fullFileData: restoredFile` in setFolderPickerState
- Batch restore: `stalePathFiles` type includes `fullFileData: any`
- Batch restore: `fullFileData: result.file` in push
- Batch restore onSelect fallback: `addCloudFile(file.fullFileData)` not `as any`
- FolderPickerDialog onClose: loops through files and calls `addCloudFile(file.fullFileData)`
- Toast message on dismiss says "kept at their original paths" (not "stale")

### GAP 2: vault_id filter

In `mutations.ts`:

- `updateFolderPath` has optional `vaultId?: string` parameter
- Query built with conditional `.eq('vault_id', vaultId)` when provided
- `let query = client.from('files')...` pattern (not chained directly to `await`)

In callers:

- `fileOps.ts` rename: `ctx.activeVaultId || undefined` passed
- `fileOps.ts` move: `ctx.activeVaultId || undefined` passed
- `useFileOperations.ts`: `usePDMStore.getState().activeVaultId || undefined` passed

### GAP 3: Case-insensitive replace

In `mutations.ts`:

- `escapedOldPath` uses regex escape pattern
- `oldPathPattern = new RegExp(escapedOldPath, 'i')`
- `file.file_path.replace(oldPathPattern, newFolderPath)` used instead of string replace

### GAP 5: wasAdded checks

In `TrashView.tsx`:

- Single restore onSelect: `wasAdded` check after addCloudFile
- Batch restore onSelect: `notAdded` count loop after all addCloudFile calls

---

## Phase 8: Write Verdict

After completing all phases, write a verdict:

1. **Ship or block?** Is the ghost file fix complete?
2. **New issues found** -- list any new bugs discovered during the review
3. **Accepted risks** -- list known limitations that are documented and acceptable
4. **Recommendations** -- anything that should be done in the next release

Write the verdict to `.cursor/reports/comprehensive-review-verdict.md`.

---

## Key Invariants to Verify

These invariants must hold true across ALL code paths:

1. **After any folder rename/move, every nested file's `pdmData.file_path` matches its `relativePath`**
2. `**updateFolderPath` never matches files outside the target folder** (the `/%` prefix ensures this)
3. `**updateFolderPath` never touches trashed files** (`deleted_at IS NULL` filter)
4. `**addCloudFile` failures are always detectable** (wasAdded check or vaultPath warning)
5. **No file can be restored in DB but invisible in the store** (addCloudFile always called)
6. **Partial server update failures are always surfaced to the user** (toast warnings)
7. **Cross-vault contamination is prevented** (vault_id filter in updateFolderPath)

---

## Files to Read (Complete List)

Core file operations:

- `src/lib/commands/handlers/fileOps.ts` (~1578 lines)
- `src/lib/supabase/files/mutations.ts` (~1419 lines)
- `src/stores/slices/filesSlice.ts` (~1928 lines)
- `src/features/source/trash/TrashView.tsx` (~1175 lines)
- `src/features/source/trash/FolderPickerDialog.tsx` (~240 lines)
- `src/features/source/browser/hooks/useFileOperations.ts` (~478 lines)
- `src/hooks/useLoadFiles.ts` (~1325 lines)

Supporting files:

- `src/hooks/useRealtimeSubscriptions.ts`
- `src/lib/supabase/files/trash.ts`
- `src/lib/supabase/files/folders.ts`
- `src/lib/supabase/files/move.ts`
- `src/lib/commands/handlers/fileTerminal.ts`
- `src/lib/commands/handlers/matchGhostFile.ts`
- `src/features/source/browser/FilePane.tsx`
- `src/features/source/browser/hooks/useFileEditHandlers.ts`
- `src/features/source/explorer/file-tree/hooks/useTreeDragDrop.ts`
- `src/stores/types.ts` (FilesSlice type definitions)

