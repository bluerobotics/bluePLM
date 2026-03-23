---
name: Ghost file followups
overview: "Address deferred follow-ups from the ghost file data loss fix: fix drag-drop folder moves and build a folder picker dialog for stale-path restores. Supabase RPC and race window mitigation deferred -- schema changes would break users on older app versions."
todos:
  - id: phase1-dragdrop-pdmdata
    content: "Phase 1A: Add nested pdmData.file_path update to useFileOperations.ts handleMoveFiles (same pattern as Fix 1)"
    status: completed
  - id: phase1-dragdrop-folderserver
    content: "Phase 1B: Add updateFolderServerPath call for drag-drop folder moves in useFileOperations.ts"
    status: completed
  - id: phase1-dragdrop-ismove
    content: "Phase 1C: Fix isMove flag for directory moves in useFileOperations.ts -- pass true for cross-folder moves"
    status: completed
  - id: phase2-folderpicker
    content: "Phase 2A: Build FolderPickerDialog component in src/features/source/trash/"
    status: completed
  - id: phase2-single-restore
    content: "Phase 2B: Integrate folder picker into single-file restore flow in TrashView.tsx"
    status: completed
  - id: phase2-batch-restore
    content: "Phase 2C: Integrate folder picker into batch restore flow in TrashView.tsx (single dialog for all stale files)"
    status: completed
isProject: false
---

# Ghost File Data Loss -- Follow-up Fixes

## Phase 1: Fix Drag-Drop Folder Moves

**Priority: Medium -- same ghost file pattern as Bug 1, different code path**

[src/features/source/browser/hooks/useFileOperations.ts](src/features/source/browser/hooks/useFileOperations.ts) `handleMoveFiles` (line ~390) has three bugs:

### 1A. Missing nested `pdmData.file_path` update

After `renameFileInStore(file.path, newFullPath, newRelPath, markAsMoved)`, nested files' `pdmData.file_path` is stale. Same pattern as Fix 1 -- collect nested synced files before rename, then call `updateFilesInStore` after.

- `files` is available via the hook's options (line 34)
- `updateFilesInStore` is available via `usePDMStore.getState().updateFilesInStore`
- `getFilesInFolder` can be imported from `@/lib/commands/types`
- Insert the collection BEFORE `renameFileInStore` (line ~390), update AFTER

### 1B. Missing `updateFolderServerPath` call

Drag-drop folder moves call `updateFolderPath` (files table) but never `updateFolderServerPath` (folders table). The folder record in the `folders` table is never updated.

- Import `updateFolderServerPath` from `@/lib/supabase/files`
- Call it after `updateFolderPath` when `file.isDirectory && file.pdmData?.id`

### 1C. `isMove` flag for directories

`markAsMoved = !file.isDirectory && !file.pdmData?.id` -- for directories, `markAsMoved` is always `false`. This causes `renameFileInStore` to treat the 3rd argument as a NAME rather than a full relative path. For cross-folder moves, this produces wrong `relativePath` for nested items.

- For synced directories, `markAsMoved` should still be `false` (server already updated). However, `renameFileInStore` is called with `newRelPath` (a full relative path) and `isMove=false` -- the function then replaces only the LAST path segment instead of using the full new path.
- Fix: pass `true` for `isMove` when moving directories across folders, i.e., `renameFileInStore(file.path, newFullPath, newRelPath, true)` for directories. Then set `diffStatus` to undefined separately if synced.
- Verify by tracing through `renameFileInStore` in [src/stores/slices/filesSlice.ts](src/stores/slices/filesSlice.ts) (line ~795) to confirm the `isMove` branch computes the correct nested paths.

---

## Phase 2: Folder Picker Dialog for Stale-Path Restores

**Priority: Medium-High -- trashed files are now guaranteed to have stale paths after folder renames**

### 2A. Build `FolderPickerDialog` component

**New file:** `src/features/source/trash/FolderPickerDialog.tsx`

Design based on existing patterns:

- **Dialog layout**: Same as `MatchGhostFileDialog` -- fixed overlay, `max-w-md`, backdrop click to close
- **Data**: Filter `usePDMStore.getState().files` to `isDirectory` entries, build a simple tree using the same `TreeMap` approach from `useVaultTree` (path -> children mapping)
- **UI**: Recursive expandable tree of folders. Each row: folder icon + name, click to select, double-click to expand. Highlight selected folder.
- **Props**: `isOpen`, `onClose`, `title`, `message`, `onSelect(relativePath: string)`, `defaultPath?: string`
- **Special entries**: "Vault Root" option at top (selects empty string `""`)
- Keep it simple -- no virtualization needed since folder counts are typically small (< 500)

### 2B. Modify single-file restore flow

In [src/features/source/trash/TrashView.tsx](src/features/source/trash/TrashView.tsx), the single-file restore handler (line ~420):

1. After `restoreFile()` succeeds and stale path is detected (`!parentExistsLocally && parentPath`):
  - Instead of just showing a warning toast, open the `FolderPickerDialog`
  - Pre-select the old parent path (or vault root if it doesn't exist)
2. When user picks a new folder:
  - Compute new `file_path`: `selectedFolder + '/' + result.file.file_name` (or just `file_name` if vault root)
  - Call `updateFilePath(result.file.id, newFilePath)` from [src/lib/supabase/files/mutations.ts](src/lib/supabase/files/mutations.ts) to update the DB
  - Call `addCloudFile()` with the **updated** file (using the returned file from `updateFilePath`)
3. If user dismisses the dialog, fall back to current behavior (restore at old path with warning)

### 2C. Modify batch restore flow

For batch restores, showing a dialog per file would be terrible UX. Instead:

1. Collect all stale-path files into a list during the loop
2. After the loop completes, if there are stale files, show a **single** `FolderPickerDialog` with the message: "N restored file(s) were in folders that no longer exist. Choose a destination folder for all of them, or dismiss to keep them at their original paths."
3. If user picks a folder, call `updateFilePath` for each stale file
4. If dismissed, show the existing warning toast

### 2D. Add `FolderPickerDialog` state to TrashView

- Add `useState` for the dialog state:

```typescript
  const [folderPickerState, setFolderPickerState] = useState<{
    files: Array<{ id: string; fileName: string; oldPath: string }>
    onSelect: (folder: string) => Promise<void>
  } | null>(null)
  

```

- Render `FolderPickerDialog` at the bottom of the component, driven by this state

---

## Deferred: Supabase RPC + Race Window

Phases 3 (Supabase RPC for atomic `updateFolderPath`) and Phase 4 (race window mitigation via `folderOperationInProgress` flag) are **removed from this plan**. Reason: the SQL schema change would bump `EXPECTED_SCHEMA_VERSION`, triggering "database newer than app" warnings for all users on older app versions. The existing hardened loop (Fix 2) with per-file error reporting is sufficient.

These can be revisited when a coordinated schema migration + app release is feasible. See `.cursor/reports/updatefolderpath-rpc.md` and `.cursor/reports/fix-race-window.md` for the full designs.

---

## Implementation Order

- **Phase 1** first -- highest-risk bug, same ghost file pattern as the original Bug 1
- **Phase 2** after Phase 1 -- depends on Phase 1 being stable, independent code path

