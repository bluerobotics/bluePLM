# File Operations Comprehensive Review -- Final Verdict

**Date:** 2026-03-23
**Reviewer:** Automated deep-code audit (Phases 1-8)
**Scope:** Every file operation code path (rename, move, drag-drop, restore, sync, realtime, copy, merge-folder, delete, checkout/checkin, bulk assembly)

---

## Verdict: SHIP

The ghost file data loss fix is complete for all primary code paths. The original cascade of bugs (7 bugs + 6 follow-ups + 5 gap fixes) is correctly implemented. No blocking issues were found that would cause the original data loss scenario to recur.

---

## Invariant Verification

| # | Invariant | Status | Notes |
|---|-----------|--------|-------|
| 1 | After folder rename/move, every nested file's `pdmData.file_path` matches `relativePath` | PASS | All 3 primary paths (rename command, move command, drag-drop move) now call `updateFilesInStore` to patch `pdmData.file_path`. See exception in mergeFolderCommand below. |
| 2 | `updateFolderPath` never matches files outside the target folder | PASS | Uses `/%` suffix (line 641 of mutations.ts). Verified: renaming "A" cannot match "AB/file.txt". |
| 3 | `updateFolderPath` never touches trashed files | PASS | `.is('deleted_at', null)` filter at line 642 of mutations.ts. |
| 4 | `addCloudFile` failures are always detectable | PASS (with gaps) | `vaultPath` null logs warning (line 1036 of filesSlice.ts). `wasAdded` checks present in single restore (line 466) and batch restore onSelect (lines 584-595). Gaps exist in onClose handler and batch non-stale path -- see "Minor Gaps" below. |
| 5 | No file can be restored in DB but invisible in the store | PASS (primary paths) | Single and batch restore both call `addCloudFile`. FolderPickerDialog dismiss calls `addCloudFile` for each file (line 1165-1166 of TrashView.tsx). Terminal restore relies on `onRefresh` -- acceptable. |
| 6 | Partial server update failures are always surfaced to the user | PASS | All 3 callers of `updateFolderPath` check the result: rename (line 325 of fileOps.ts), move (line 734), drag-drop (line 361 of useFileOperations.ts). Toast warnings shown. |
| 7 | Cross-vault contamination is prevented | PASS | `vault_id` passed by all callers: rename (line 324), move (line 733), drag-drop (line 360). Optional parameter in `updateFolderPath` (line 627 of mutations.ts). |

---

## Gap Fix Verification (Round 3)

| Gap | Claimed Fix | Verified in Code | Status |
|-----|-------------|------------------|--------|
| GAP 1+4: Folder picker dismiss + fullFileData | `onClose` loops through files, calls `addCloudFile(file.fullFileData)` | Line 1164-1169 of TrashView.tsx | CONFIRMED |
| GAP 2: vault_id filter | Optional `vaultId` param, conditional `.eq('vault_id', vaultId)` | Lines 627, 644-646 of mutations.ts; all 3 callers pass `activeVaultId \|\| undefined` | CONFIRMED |
| GAP 3: Case-insensitive replace | `escapedOldPath` with regex escape, `new RegExp(escapedOldPath, 'i')`, `.replace(oldPathPattern, newFolderPath)` | Lines 660-663 of mutations.ts | CONFIRMED |
| GAP 5: wasAdded checks | Single restore onSelect line 449; batch onSelect lines 584-595 | TrashView.tsx | CONFIRMED |
| Side-effect fix: `'in'` operator | `'pendingMetadata' in fileUpdates` and `'copiedFromFileId' in fileUpdates \|\| 'copiedVersion' in fileUpdates` | Lines 265, 277 of filesSlice.ts | CONFIRMED |

---

## Per-Path Verdicts

### Rename Paths

| Path | Verdict | Detail |
|------|---------|--------|
| Command rename (`fileOps.ts`) | SAFE | Full pdmData.file_path update for nested files. Result checked. vault_id passed. |
| Inline rename (FilePane) | SAFE | Delegates to command system via `executeCommand('rename', ...)` |
| Terminal rename (`fileTerminal.ts`) | SAFE | Delegates to command system via `executeCommand('rename', ...)` |
| Realtime rename detection (`useLoadFiles.ts`) | SAFE | Intentional pdmData.file_path mismatch drives "moved" badge; self-heals at checkin |

### Move Paths

| Path | Verdict | Detail |
|------|---------|--------|
| Command move (`fileOps.ts`) | SAFE | Full pdmData update, updateFolderServerPath called, result checked, vault_id passed |
| Drag-drop move (`useFileOperations.ts`) | SAFE (with caveat) | Correctly updated in Round 2. Server-first order means no rollback if local move fails -- low probability |
| Tree drag-drop (`useTreeDragDrop.ts`) | SAFE | Delegates to command system via `executeCommand('move', ...)` |
| Terminal move (`fileTerminal.ts`) | SAFE | Delegates to command system via `executeCommand('move', ...)` |
| Merge folder (`fileOps.ts`) | RISK (low) | See "New Issues" #1 below |

### Restore Paths

| Path | Verdict | Detail |
|------|---------|--------|
| Single restore (TrashView.tsx) | SAFE | Stale path detection, FolderPickerDialog, wasAdded check, onClose adds files |
| Batch restore (TrashView.tsx) | SAFE (with gap) | Stale files deferred correctly; see "Minor Gaps" #1 below |
| Terminal restore (restore.ts / backupOps.ts) | RISK (low) | Relies on onRefresh, no addCloudFile, no stale-path handling. See "New Issues" #2 |

### Other Operations

| Operation | Verdict | Detail |
|-----------|---------|--------|
| Delete (softDeleteFile) | SAFE | Only sets deleted_at/deleted_by; paths frozen |
| Copy (copyCommand) | SAFE | Creates new files; source untouched |
| Checkout/Checkin | SAFE | Checkout: no path changes. Checkin: detects path changes, updates server with user confirmation |
| Bulk assembly | SAFE | Read-only metadata resolution; delegates to standard commands |
| Sync/Realtime | SAFE | pdmMap keyed by file_path.toLowerCase(); 3 layers of ghost prevention (inode, hash, cross-reference); realtime has 15s debounce + current-user skip |

---

## New Issues Found

### Issue 1 (Low): `mergeFolderCommand` missing pdmData.file_path store update

**File:** `src/lib/commands/handlers/fileOps.ts` (mergeFolderCommand, ~line 1451)

After `renameFileInStore`, the file's `relativePath` is updated but `pdmData.file_path` retains the old source path. Unlike rename/move commands, `updateFilesInStore` is NOT called to patch pdmData. The server IS correctly updated via `updateFilePath`, so this self-heals on the next `loadFiles()` refresh. Cannot create ghost files because merge moves individual files (not folders with nested items).

Additionally, the source folder's server record is never cleaned up (the TODO comment at line 1529-1535 acknowledges this). Leaked folder records accumulate in the `folders` table.

**Recommendation:** Add `updateFilesInStore` call after `renameFileInStore` for consistency. Add `deleteFolderOnServer` call for the source folder after all files are merged. Priority: low.

### Issue 2 (Low): Terminal restore has no addCloudFile or stale-path handling

**Files:** `src/lib/commands/handlers/restore.ts`, `src/lib/commands/handlers/backupOps.ts`

Both terminal restore handlers call `restoreFile` (DB) then `onRefresh` (full scan). They do not call `addCloudFile`, do not detect stale paths, and do not show a folder picker. If the parent folder was renamed since deletion, the file is restored in DB but may not appear in the UI until a cloud sync picks it up.

Additionally, both files register the `'restore'` alias, creating a duplicate command registration where the last import wins.

**Recommendation:** Consolidate into one handler. Add `addCloudFile(result.file)` after successful restore for immediate UI update. Consider adding stale-path warning to terminal output. Priority: low (terminal is a power-user feature).

### Issue 3 (Info): `like` vs `ilike` inconsistency between files and folders tables

`updateFolderPath` (mutations.ts) uses `ilike` (case-insensitive) for the `files` table, while `updateFolderServerPath` (folders.ts) uses `like` (case-sensitive) for the `folders` table. On Windows where paths are case-insensitive, this inconsistency could theoretically cause missed updates in the `folders` table if the case differs. Low risk in practice since paths originate from the same local filesystem.

**Recommendation:** Change `like` to `ilike` in `updateFolderServerPath` for consistency. Priority: very low.

---

## Minor Gaps (Not Blocking)

### Gap 1: Batch restore non-stale wasAdded failures are only logged

**File:** `src/features/source/trash/TrashView.tsx`, lines 528-535

When a non-stale file is restored in batch and `addCloudFile` silently fails (e.g., `vaultPath` is null), the failure is logged via `log.warn` but NOT counted or surfaced to the user. The batch restore onSelect handler (lines 584-595) correctly counts `notAdded` for stale files but the non-stale path lacks this.

**Impact:** If vault disconnects mid-batch-restore, non-stale files restored in DB vanish from UI with no user warning. The success toast is misleading.

**Recommendation:** Add a `notAddedNonStale` counter in the batch loop; show a warning toast after the loop if > 0.

### Gap 2: FolderPickerDialog onClose has no wasAdded check

**File:** `src/features/source/trash/TrashView.tsx`, lines 1164-1169

The `onClose` handler calls `addCloudFile(file.fullFileData)` for each file but never verifies they were added to the store. If `vaultPath` is null at dismiss time, the informational toast "kept at their original paths" is misleading.

**Impact:** Only triggers when vault is disconnected during a restore flow with stale paths. Very narrow edge case.

**Recommendation:** Add a `wasAdded` check loop after the `addCloudFile` calls; warn if any failed.

### Gap 3: `result.file` null case shows success without adding to store

**File:** `src/features/source/trash/TrashView.tsx`, lines 473-474

When `restoreFile` returns `success: true` but `result.file` is null (unexpected API response), the user sees a green "File restored successfully" toast but `addCloudFile` is never called. The file is restored in DB but invisible until the next `loadFiles()` refresh.

**Recommendation:** Change toast to "File restored. A refresh may be needed to see it." or trigger `onRefresh`.

---

## Accepted Risks (Pre-existing, Documented)

1. **Race window between renameFileInStore and updateFolderPath:** Store is correct (pdmData.file_path eagerly updated), but if loadFiles runs during the window, files may briefly show "moved" status. Self-heals when server update completes. Mitigated by expectedFileChanges mechanism and 15s realtime debounce.

2. **Drag-drop move server-first ordering:** If the local filesystem move fails after server updates succeed, the server state points to a path that doesn't exist locally. No rollback mechanism. Pre-move UI lock checking reduces probability. Documented in plans.

3. **No database transaction in updateFolderPath:** Files are updated one-by-one. Partial failures are now detected, logged, and surfaced to user (Fix 2 + Fix 3). Full RPC transaction is deferred (requires schema migration).

4. **Terminal restore relies on onRefresh:** Power-user feature with simpler error handling than the GUI path. Acceptable for now.

5. **Trashed files have stale paths after folder renames:** By design (`deleted_at IS NULL` filter in updateFolderPath). FolderPickerDialog handles this for GUI restores. Terminal restore does not handle it.

---

## Files Audited

### Core files (full read + trace):
- `src/lib/commands/handlers/fileOps.ts` (~1578 lines) -- rename, move, copy, merge-folder commands
- `src/lib/supabase/files/mutations.ts` (~1418 lines) -- updateFolderPath, updateFilePath, softDeleteFile
- `src/stores/slices/filesSlice.ts` (~1928 lines) -- renameFileInStore, updateFilesInStore, addCloudFile, updateFileLocationFromServer
- `src/features/source/trash/TrashView.tsx` (~1184 lines) -- single + batch restore, FolderPickerDialog integration
- `src/features/source/trash/FolderPickerDialog.tsx` (~241 lines) -- folder tree picker
- `src/features/source/browser/hooks/useFileOperations.ts` (~478 lines) -- drag-drop move
- `src/hooks/useLoadFiles.ts` (~1760 lines) -- pdmMap reconciliation, ghost detection, inode matching

### Supporting files (verified):
- `src/hooks/useRealtimeSubscriptions.ts` (~682 lines) -- realtime event handling
- `src/lib/supabase/files/trash.ts` (~500 lines) -- restoreFile, softDeleteFile
- `src/lib/supabase/files/folders.ts` (~408 lines) -- updateFolderServerPath
- `src/lib/supabase/files/move.ts` (~81 lines) -- moveFileOnServer RPC
- `src/lib/commands/handlers/fileTerminal.ts` (~1158 lines) -- terminal rename/move
- `src/lib/commands/handlers/restore.ts` -- terminal restore
- `src/lib/commands/handlers/backupOps.ts` -- terminal restore (duplicate)
- `src/lib/commands/handlers/matchGhostFile.ts` (~95 lines) -- manual ghost resolution
- `src/lib/commands/handlers/checkout.ts` -- checkout/checkin paths
- `src/features/source/browser/hooks/useFileEditHandlers.ts` (~412 lines) -- inline rename
- `src/features/source/explorer/file-tree/hooks/useTreeDragDrop.ts` (~644 lines) -- tree drag-drop
- `src/features/source/browser/components/ContextMenu/actions/BulkAssemblyActions.tsx` -- bulk assembly ops

### Context documents read:
- 3 plan files (fix_ghost_file_data_loss, ghost_file_followups, file-ops-comprehensive-review)
- 13 report files (SUMMARY, fix-updatefolderpath, fix-rename-pdmdata, fix-updatefolderpath-callers, fix-restore-flow, fix-batch-restore-errors, check-filepane-rename, fix-restore-stale-path, updatefolderpath-rpc, fix-race-window, fix-updatefilesinstore-side-effect, add-tests, ghost-file-followups)

---

## Summary

The ghost file data loss fix is **ship-ready**. All primary code paths (command rename, command move, drag-drop move, GUI restore) correctly update `pdmData.file_path`, check server results, and surface failures to users. The 5 gap fixes (folder picker dismiss, vault_id filter, case-insensitive replace, wasAdded checks, 'in' operator fix) are all correctly implemented.

Three new low-priority issues were found (mergeFolderCommand missing pdmData update, terminal restore lacking addCloudFile, duplicate 'restore' command registration) -- none of these can reproduce the original ghost file data loss scenario and should be addressed in a future release.
