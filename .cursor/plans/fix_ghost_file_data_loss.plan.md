---
name: Fix ghost file data loss
overview: Fix a cascade of bugs where renaming a folder creates ghost files, deleting ghosts destroys the real server records, and restore silently fails -- causing permanent data loss.
todos:
  - id: fix-updatefolderpath
    content: "Fix 2 (do first): Harden updateFolderPath -- normalize inputs, safe prefix '/%', deleted_at IS NULL filter, error logging per failure, return success:false on any failure"
    status: completed
  - id: fix-rename-pdmdata
    content: "Fix 1: Update pdmData.file_path for nested items in renameCommand. Insert BETWEEN renameFileInStore (line 280) and server updates (line 288). Replicate move command pattern."
    status: completed
  - id: fix-updatefolderpath-callers
    content: "Fix 3: Check updateFolderPath result in BOTH renameCommand (line 290) and moveCommand (line 691), warn user on partial failure"
    status: completed
  - id: fix-restore-flow
    content: "Fix 4: Log warning in addCloudFile when vaultPath null. Check stale parent BEFORE addCloudFile (not after), excluding cloud-only dirs. Verify file added to store."
    status: completed
  - id: fix-batch-restore-errors
    content: "Fix 5: Collect per-file error messages in batch restore and display in toast"
    status: completed
  - id: check-filepane-rename
    content: "Follow-up: Verify FilePane.tsx and useFileOperations.ts -- both call renameFileInStore without pdmData updates. useFileOperations also missing updateFolderServerPath."
    status: completed
  - id: fix-restore-stale-path
    content: "Follow-up (Bug 6 full): Restore currently uses old file_path. Add user prompt or auto-detect renamed parent folder and update path on restore. More important now that deleted_at IS NULL filter freezes trashed paths."
    status: completed
  - id: updatefolderpath-rpc
    content: "Follow-up: Wrap updateFolderPath in a Supabase RPC for true DB transaction (requires migration)"
    status: completed
  - id: fix-race-window
    content: "Follow-up: Mitigate race between renameFileInStore (instant) and updateFolderPath (async) -- suppress loadFiles during rename or debounce realtime"
    status: completed
  - id: fix-updatefilesinstore-side-effect
    content: "Follow-up: Fix updateFilesInStore clearing persistedPendingMetadata/persistedCopySource when only pdmData is updated. Use 'key in obj' check instead of === undefined. Affects both rename and move."
    status: completed
  - id: add-tests
    content: "Follow-up: Add tests for renameFileInStore, updateFolderPath, and restore flow -- currently zero test coverage"
    status: completed
isProject: false
---

# Fix Ghost File Data Loss on Folder Rename + Delete + Restore

## What happened to David (reconstructed timeline)

1. David renamed folder "Thruster-Boi" to "BR Equipment"
2. Locally, all files moved successfully. The store updated `path` and `relativePath` to `BR Equipment/...`
3. `updateFolderPath()` ran to update DB records one-by-one -- but some updates likely **failed silently** (no transaction, no error surfaced to user)
4. David did more reorganization ("reorganized a bunch of stuff")
5. On next sync/refresh, `useLoadFiles` built a `pdmMap` keyed by `file_path.toLowerCase()`. Files whose DB records **still had** `Thruster-Boi/...` paths had no matching local file at that path -- they appeared as **ghost files** in a phantom "Thruster-Boi" folder
6. David deleted the ghost files via "Delete from Server" (`softDeleteFile(ghost.pdmData.id)`)
7. **Critical**: those ghost DB records are the **same records** as the files David sees under "BR Equipment". Soft-deleting them effectively deleted the server records for his real files
8. The BR Equipment files lost their server backing -- on next sync they became orphaned local files (or vanished if they were cloud-only)
9. David went to Trash to restore. The `restoreFile()` function succeeded in the DB (cleared `deleted_at`), but `addCloudFile()` placed the file at the **old** path `Thruster-Boi/...` -- not at `BR Equipment/...` where David expected it. David saw files "disappear from trash" but never appear in his vault

## Root causes (7 bugs, in severity order)

### Bug 1 (Critical): `renameFileInStore` does NOT update `pdmData.file_path` for nested items

The **move** command explicitly collects nested synced files before `renameFileInStore`, then updates their `pdmData.file_path` afterward:

```709:746:src/lib/commands/handlers/fileOps.ts
        // For directory moves, collect nested synced files BEFORE renameFileInStore
        let nestedSyncedFiles = []
        if (file.isDirectory) {
          const nestedFiles = getFilesInFolder(ctx.files, file.relativePath)
          nestedSyncedFiles = nestedFiles
            .filter(f => f.pdmData?.file_path)
            .map(f => ({ oldRelPath: f.relativePath, newRelPath: ..., pdmData: f.pdmData }))
        }
        ctx.renameFileInStore(file.path, newPath, newRelPath, true)
        if (file.isDirectory && nestedSyncedFiles.length > 0) {
          // ... builds pdmDataUpdates with new file_path, calls ctx.updateFilesInStore()
        }
```

The **rename** command does NOT do this. `renameFileInStore` (lines 828-839 of `filesSlice.ts`) only updates `path` and `relativePath` for nested items -- `pdmData` is carried forward unchanged via `...f`:

```828:839:src/stores/slices/filesSlice.ts
      if (isDirectory && fPathLower.startsWith(oldPathWithSep)) {
        nestedUpdatedCount++
        const newNestedPath = newPath + f.path.slice(oldPath.length)
        const newNestedRelPath = newRelPathForItem + f.relativePath.slice(oldRelPath.length)
        return {
          ...f,
          path: newNestedPath,
          relativePath: newNestedRelPath
          // BUG: pdmData.file_path is NOT updated -- still has old folder prefix
        }
      }
```

After a folder rename, `useLoadFiles` builds a `pdmMap` keyed by `file_path.toLowerCase()` (line 223 of `useLoadFiles.ts`). Files whose `pdmData.file_path` still has the old prefix can't match their `relativePath` (which was updated). They appear as ghost files.

### Bug 2 (Critical): `updateFolderPath` updates files one-by-one with no transaction

```647:660:src/lib/supabase/files/mutations.ts
  for (const file of files) {
    const newFilePath = file.file_path.replace(oldFolderPath, newFolderPath)
    const { error } = await client
      .from('files')
      .update({ file_path: newFilePath, updated_at: new Date().toISOString() })
      .eq('id', file.id)
    if (!error) {
      updated++
    }
    // Silent failure -- no logging, no user feedback, no rollback
  }
```

- No transaction: partial failure leaves some files at old path, some at new
- Errors silently swallowed (only `updated` count is incremented on success)
- `renameCommand` (line 290) does NOT check the return value at all
- `moveCommand` (line 691) also does NOT check it (only `useFileOperations.ts` line 360 checks `folderResult.success`)
- The `success` field always returns `true` even when some file updates failed

### Bug 3 (High): `updateFolderPath` uses unsafe prefix matching

```634:634:src/lib/supabase/files/mutations.ts
    .ilike('file_path', `${oldFolderPath}%`)
```

No trailing separator. Renaming folder `A` would also match and corrupt `AB/file.sldprt`. Since the `files` table only contains file records (folders are in the separate `folders` table, updated via `updateFolderServerPath`), the fix is simply `oldFolderPath + '/%'` -- no exact-match case needed.

### Bug 4 (High): `updateFolderPath` doesn't filter by `deleted_at`

```634:634:src/lib/supabase/files/mutations.ts
    .ilike('file_path', `${oldFolderPath}%`)
    // no .is('deleted_at', null) -- touches trashed files too
```

Could match already-deleted files and update their paths to the new prefix. The unique constraint `idx_files_vault_path_unique_active ON files(vault_id, LOWER(file_path)) WHERE deleted_at IS NULL` protects active files only, so updating trashed files won't cause constraint violations, but it corrupts their stored path for no reason.

### Bug 5 (Medium): `addCloudFile` silently returns when `vaultPath` is null

```791:793:src/stores/slices/filesSlice.ts
  addCloudFile: (pdmFile) => {
    const { files, vaultPath } = get()
    if (!vaultPath) return  // void -- no indication of failure
```

During restore, DB is updated (file removed from trash), then `addCloudFile` is called. If `vaultPath` is null, the file vanishes from both trash and vault with zero feedback. `addCloudFile` returns `void` so the caller cannot distinguish success from silent no-op.

### Bug 6 (Medium): Restore places files at their OLD path

`restoreFile()` in `trash.ts` (line 152) only clears `deleted_at` and `deleted_by` -- it does NOT modify `file_path`. If the parent folder was renamed since deletion, the restored file has a `file_path` pointing to a folder that no longer exists in the user's vault. The user sees it "disappear from trash" but never appear in their current folder structure.

### Bug 7 (Low): Batch restore swallows per-file errors

```455:468:src/features/source/trash/TrashView.tsx
        try {
          const result = await restoreFile(fileId, user.id)
          if (result.success) { ... restored++ }
          else { failed++ }   // result.error is available but never captured
        } catch {
          failed++             // exception message never captured
        }
```

User sees "Restored X/Y files (Z failed)" with no explanation of why individual files failed.

## Fix plan

### Fix 1: Update `pdmData.file_path` for nested items during rename (Bug 1)

**File:** [src/lib/commands/handlers/fileOps.ts](src/lib/commands/handlers/fileOps.ts) -- rename command handler (lines 104-320)

Replicate the exact pattern from the move command (lines 709-746). The implementation order is **critical** -- the existing comment at lines 276-279 says "Must run before updateFolderPath because server updates trigger realtime events that trickle in one-by-one."

**Step 1. BEFORE `renameFileInStore` (before line 280):** Collect nested synced files from `ctx.files`. Note: `ctx.files` is a snapshot taken when `buildCommandContext()` runs (line 202 of `executor.ts`), so it always has the old paths regardless of when you read it. The rename command already calls `getFilesInFolder(ctx.files, file.relativePath)` at line 198 for expected file changes -- reuse this or collect nearby:

```typescript
let nestedSyncedFiles: Array<{ oldRelPath: string; newRelPath: string; pdmData: LocalFile['pdmData'] }> = []
if (file.isDirectory) {
  const nestedFiles = getFilesInFolder(ctx.files, file.relativePath)
  nestedSyncedFiles = nestedFiles
    .filter(f => f.pdmData?.file_path)
    .map(f => ({
      oldRelPath: f.relativePath,
      newRelPath: newRelPath + f.relativePath.substring(oldRelPath.length),
      pdmData: f.pdmData
    }))
}
```

**Step 2. Line 280 stays as-is:** `ctx.renameFileInStore(oldPath, newPath, finalName, false)` -- this updates `path` and `relativePath` in the store immediately. Note: the 4th arg is `isMove=false`, so `finalName` is treated as the new NAME (not a full relative path). The path math below accounts for this.

**Step 3. IMMEDIATELY after `renameFileInStore` (line 281), BEFORE the toast and server updates:** Call `ctx.updateFilesInStore()` with updates that use the NEW paths (since the store now has them). This MUST go before line 288 (`if (file.pdmData?.id)`) because server updates trigger realtime events:

```typescript
if (file.isDirectory && nestedSyncedFiles.length > 0) {
  const vaultPath = ctx.vaultPath || ''
  const sep = vaultPath.includes('\\') ? '\\' : '/'
  const pdmDataUpdates = nestedSyncedFiles.map(nested => ({
    path: `${vaultPath}${sep}${nested.newRelPath.replace(/\//g, sep)}`,
    updates: {
      pdmData: {
        ...nested.pdmData,
        file_path: nested.newRelPath
      }
    }
  }))
  ctx.updateFilesInStore(pdmDataUpdates as Array<{ path: string; updates: Partial<LocalFile> }>)
}
```

The correct insertion order in the rename command is:

1. Line 280: `ctx.renameFileInStore(...)` -- updates path/relativePath
2. **NEW: `ctx.updateFilesInStore(...)` -- updates pdmData.file_path**
3. Line 283: `ctx.setLastOperationCompletedAt(...)`
4. Line 285: toast
5. Line 288+: server updates (`updateFolderPath`, `updateFolderServerPath`)

**Why this is safe:** This is the same proven pattern from the move command. `updateFilesInStore` matches by `f.path.toLowerCase()` against the store's current state, which has the post-rename paths. The path construction (`vaultPath + sep + newRelPath`) produces the same full path that `renameFileInStore` set. Verified by tracing through a concrete example: `Thruster-Boi/sub/file.txt` -> `BR Equipment/sub/file.txt`.

**Known side effect (pre-existing, also in move command):** `updateFilesInStore` has logic (lines 262-287 of `filesSlice.ts`) that clears `persistedPendingMetadata` when `fileUpdates.pendingMetadata === undefined`. Since our update only includes `pdmData`, this condition is true, and any unsaved pending metadata for these files gets cleared. The move command (line 741) has this exact same behavior. This should be fixed separately in `updateFilesInStore` by changing `=== undefined` to `'pendingMetadata' in fileUpdates` (see follow-ups).

### Fix 2: Harden `updateFolderPath` (Bugs 2, 3, 4) -- DO THIS FIRST

**File:** [src/lib/supabase/files/mutations.ts](src/lib/supabase/files/mutations.ts) -- `updateFolderPath()` (lines 624-665)

Changes to make (no RPC needed -- better error reporting is sufficient for now; RPC is a follow-up):

- **Normalize inputs (new, from review):** Strip trailing slashes from both `oldFolderPath` and `newFolderPath` at the top of the function. Without this, the `/%` suffix fix below could produce `Thruster-Boi//%` if the input already ends with `/`. Note: `updateFolderServerPath` in `folders.ts` already normalizes its input (line 208) -- `updateFolderPath` should do the same:

```typescript
  oldFolderPath = oldFolderPath.replace(/\/+$/, '')
  newFolderPath = newFolderPath.replace(/\/+$/, '')
  

```

- **Fix prefix matching (Bug 3):** Change `.ilike('file_path',` ${oldFolderPath}%`)` to `.ilike('file_path',` ${oldFolderPath}/%`)`. Folders are NOT in the `files` table (they're in `folders`, updated separately via `updateFolderServerPath`), so `/%` is correct and sufficient. This prevents renaming folder `A` from matching and corrupting `AB/file.sldprt`.
- **Add deleted_at filter (Bug 4):** Add `.is('deleted_at', null)` to the select query. Trashed files should keep their frozen paths. **Trade-off:** this means trashed files will NOT have their paths updated during rename, so restoring them later will place them at the old (stale) path. This is still the correct choice because: (a) if we DID update trashed paths, `restoreFile`'s duplicate check would find the matching active file at the new path and BLOCK the restore entirely, and (b) the alternative is worse -- silently corrupting trashed records that the user may never restore. The Bug 6 follow-up becomes more important with this change.
- **Log and collect errors (Bug 2):** On each per-file update failure, log the error with `file.id` and `file.file_path`. Collect all error messages into an array.
- **Return accurate status:** Return `{ success: updated === files.length, updated, total: files.length, errors: [...] }`. Update the return type to include `total` and `errors` fields. Currently `success` is always `true` even when every single update fails.

**Pre-existing note (document only):** `file.file_path.replace(oldFolderPath, newFolderPath)` on line 647 is case-sensitive JS `String.replace()`, but the query uses `ilike` (case-insensitive). If the DB path has different casing than `oldFolderPath`, the replace would be a no-op while the update "succeeds" with the unchanged value. Low risk in practice since paths originate from the same local filesystem, but worth noting.

### Fix 3: Check `updateFolderPath` result in BOTH callers (Bug 2 surface)

**File:** [src/lib/commands/handlers/fileOps.ts](src/lib/commands/handlers/fileOps.ts)

Two callers currently ignore the return value:

- **Rename command (line 290):** `await updateFolderPath(oldRelPath, newRelPath)` -- no result check
- **Move command (line 691):** `await updateFolderPath(file.relativePath, newRelPath)` -- no result check

Note: `useFileOperations.ts` (line 360) already checks `folderResult.success` correctly -- no change needed there.

For both callers in `fileOps.ts`, capture the result and warn the user:

```typescript
const folderResult = await updateFolderPath(oldRelPath, newRelPath)
if (!folderResult.success || folderResult.updated < folderResult.total) {
  const failCount = (folderResult.total || 0) - folderResult.updated
  log.warn('[Rename]', 'Some server file paths failed to update', {
    updated: folderResult.updated,
    total: folderResult.total,
    errors: folderResult.errors
  })
  ctx.addToast('warning', `${failCount} file(s) may not have updated on the server. Try refreshing.`)
}
```

### Fix 4: Guard `addCloudFile` and restore flow (Bugs 5, 6)

**File:** [src/stores/slices/filesSlice.ts](src/stores/slices/filesSlice.ts) -- `addCloudFile` (line 1034)

- Add a `console.warn` / `electronAPI.log('warn', ...)` when `vaultPath` is null, so the silent no-op becomes diagnosable in logs.

**File:** [src/features/source/trash/TrashView.tsx](src/features/source/trash/TrashView.tsx) -- restore handlers (lines 399-420 for single, 422+ for batch)

**CRITICAL (corrected from original plan):** The stale path check MUST run BEFORE `addCloudFile`, not after. This is because `addCloudFile` (lines 1086-1106 of `filesSlice.ts`) automatically creates cloud parent folders for any file it adds. If the restored file has path `Thruster-Boi/file.txt` and that folder no longer exists, `addCloudFile` will create a cloud-only `Thruster-Boi` directory first, then add the file. A post-call check would find this phantom folder and never warn the user.

The correct flow for both single and batch restore:

```typescript
// 1. Check stale path BEFORE addCloudFile (uses pre-add store state)
const parentPath = result.file.file_path.substring(0, result.file.file_path.lastIndexOf('/'))
let parentExistsLocally = true
if (parentPath) {
  const preRestoreFiles = usePDMStore.getState().files
  parentExistsLocally = preRestoreFiles.some(
    f => f.isDirectory && f.diffStatus !== 'cloud' && f.relativePath.toLowerCase() === parentPath.toLowerCase()
  )
}

// 2. Add to store
addCloudFile(result.file)

// 3. Verify file was added
const storeFiles = usePDMStore.getState().files
const wasAdded = storeFiles.some(f => f.pdmData?.id === result.file.id)
if (!wasAdded) {
  addToast('warning', `"${result.file.file_name}" was restored in the database but could not be added to the file browser. Try refreshing.`)
}

// 4. Warn about stale path (only if add succeeded but parent is wrong)
if (wasAdded && !parentExistsLocally && parentPath) {
  addToast('warning', `Restored file's original folder "${parentPath}" no longer exists locally. The file may appear as cloud-only in an unexpected location.`)
}
```

Key details:

- `diffStatus !== 'cloud'` excludes phantom cloud folders from satisfying the parent check
- The check runs before `addCloudFile` so it sees the real store state, not the auto-created cloud folders
- Both the `wasAdded` check and the stale path warning are independent and should both run

**Note:** This does not fully solve Bug 6 (restoring to the correct renamed path). A complete fix would require tracking folder rename history or letting the user pick a new location. That is deferred as a follow-up. With the Bug 4 fix adding `deleted_at IS NULL` to `updateFolderPath`, trashed files are now guaranteed to have stale paths after a folder rename, making this follow-up more important.

### Fix 5: Improve batch restore error reporting (Bug 7)

**File:** [src/features/source/trash/TrashView.tsx](src/features/source/trash/TrashView.tsx) -- batch restore (lines 436+)

Collect specific error messages from each failed restore:

```typescript
const errorMessages: string[] = []

// In the loop:
} else {
  failed++
  errorMessages.push(`${result.file?.file_name || fileId}: ${result.error || 'Unknown error'}`)
}
// ...
} catch (err) {
  failed++
  errorMessages.push(`File ${fileId}: ${err instanceof Error ? err.message : 'Unknown error'}`)
}
```

Show collected errors in the summary toast (or log them if too many):

```typescript
if (failed > 0 && errorMessages.length > 0) {
  const summary = errorMessages.length <= 3
    ? errorMessages.join('; ')
    : `${errorMessages.slice(0, 3).join('; ')} and ${errorMessages.length - 3} more`
  addToast('warning', `${failed} file(s) failed to restore: ${summary}`)
}
```

## Known limitations and follow-ups

### Deferred follow-ups

- **Bug 6 incomplete (more urgent now):** Restore still uses the old `file_path`. A full fix would need folder rename tracking or a user prompt to pick a new location. With the `deleted_at IS NULL` filter in Fix 2, trashed files are now guaranteed to have stale paths after a folder rename, making this follow-up more important than before.
- **No transaction in `updateFolderPath`:** A Supabase RPC wrapping the updates in a DB transaction would be ideal but requires a migration. Deferred -- the error reporting fix is sufficient to prevent silent data loss.
- `**updateFilesInStore` clears `persistedPendingMetadata` (pre-existing):** When `updateFilesInStore` is called with only `{ pdmData: ... }`, the side-effect logic at `filesSlice.ts` lines 262-287 checks `fileUpdates.pendingMetadata === undefined`. Since the property doesn't exist on the update object, this evaluates to `true` and clears `persistedPendingMetadata` for all affected files. The move command (line 741) already has this exact same behavior, so Fix 1 doesn't introduce a new regression. **Fix:** Change `fileUpdates.pendingMetadata === undefined` to `'pendingMetadata' in fileUpdates` (and same for `copiedFromFileId`/`copiedVersion`). This is a separate PR.
- **Race window:** Between `renameFileInStore` (instant) and `updateFolderPath` (async), a realtime event triggering `loadFiles` could rebuild the `pdmMap` from stale server data. Fix 1 mitigates this (store-side `pdmData.file_path` is now correct), but a full server refresh during this window could still create temporary mismatches. This is pre-existing and not worsened by these fixes.
- **No existing tests** for `renameFileInStore`, `updateFolderPath`, or the restore flow. Consider adding targeted tests as a follow-up.

### Pre-existing bugs discovered during review (separate PRs)

- `**useFileOperations.ts` (drag-and-drop moves) has its own Bug 1 equivalent:** The `handleMoveFiles` function at `useFileOperations.ts` line 390 calls `renameFileInStore` for directory moves but never follows up with `updateFilesInStore` for nested `pdmData.file_path`. It also does not call `updateFolderServerPath` (the `folders` table record is never updated for drag-drop folder moves). This is a separate code path from the command-based move in `fileOps.ts`.
- `**useFileOperations.ts` passes `isMove=false` for directory moves:** At line 389, `markAsMoved = !file.isDirectory && !file.pdmData?.id`, so for directories `isMove=false`. This means `renameFileInStore` treats the 3rd argument as a NAME instead of a relative path. For moves where the destination is a different parent folder, the computed `relativePath` would be wrong (it replaces the last path segment instead of using the full new relative path). This causes `relativePath` to diverge from `path` for nested items.
- `**FilePane.tsx` inline rename delegates to `executeCommand('rename', ...)`** via `useFileEditHandlers`, so it goes through the command system. It does NOT call `renameFileInStore` directly for renames. However, `FilePane.tsx` does pass `renameFileInStore` to `useFileOperations` for drag-and-drop moves, which has the issues above.
- `**string.replace()` case sensitivity vs `ilike`:** In `updateFolderPath` line 647, `file.file_path.replace(oldFolderPath, newFolderPath)` is case-sensitive, but the query uses `ilike` (case-insensitive). If the DB stored a path with different casing, the replace would be a no-op while the update "succeeds" with the same value. Low risk in practice.
- `**updateFolderServerPath` uses case-sensitive `like`** while `updateFolderPath` uses `ilike`. Inconsistency in case handling for Windows paths.

## Recommended implementation order

1. **Fix 2 first** (harden `updateFolderPath`) -- prevents new ghost files at the DB level. Lowest risk, purely defensive.
2. **Fix 1 second** (pdmData in rename) -- prevents ghost files at the store level. Same proven pattern as the move command.
3. **Fix 3 third** (caller checks) -- surfaces partial failures to users. Depends on Fix 2's return type changes.
4. **Fix 4 fourth** (restore flow) -- prevents silent restore failures. Corrected stale-path detection.
5. **Fix 5 last** (batch error reporting) -- lowest risk, purely additive UI improvement.

## Verified correct (from code review)

- **Fix 1 path math**: Traced through a full example (`Thruster-Boi/sub/file.txt` -> `BR Equipment/sub/file.txt`). The constructed full path matches what `renameFileInStore` produces.
- **Fix 1 uses `ctx.files` snapshot**: `buildCommandContext` captures files at command start, so nested file collection always sees old paths regardless of timing.
- **Fix 2 `/%` prefix**: Folders are tracked in the separate `folders` table (updated by `updateFolderServerPath`), so only files need matching. `/%` correctly excludes `AB/` prefix collisions.
- **Fix 3 caller identification**: Both callers in `fileOps.ts` (line 290 rename, line 691 move) confirmed. `useFileOperations.ts` line 360 already checks correctly.
- **Fix 5 error collection**: Straightforward and safe.
- `**getFilesInFolder` excludes directories**: Correct -- subdirectories have `folder_path` in pdmData (not `file_path`), and are matched through `serverFoldersMap` in `useLoadFiles`.
- **MergeFolder command**: Only moves individual files with `isMove=true`, no nested pdmData issue.
- `**updateFolderServerPath`** already uses `/%` and `deleted_at IS NULL` for child folders -- only `updateFolderPath` (for files) needs the fix.

## Immediate: Data recovery for David

The files may still be recoverable:

- Check if files are still soft-deleted in the DB (query `files` where `deleted_at IS NOT NULL` and `file_path LIKE 'Thruster-Boi/%'`)
- If David already clicked "Restore" and the DB restore succeeded, the files exist in the DB with `deleted_at = null` but at the old `Thruster-Boi/...` path -- they would show up as cloud-only files in that folder if the user refreshes
- If files were permanently deleted (via the "Delete Permanently" button in trash), they're gone from the DB -- check if David's local Recycle Bin still has them

