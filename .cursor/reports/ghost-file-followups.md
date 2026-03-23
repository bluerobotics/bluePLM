# Ghost File Follow-ups -- Implementation Report

## Overview

Implemented all deferred follow-ups from `.cursor/plans/ghost_file_followups_8c370328.plan.md`: fixed drag-drop folder moves (Phase 1) and built a folder picker dialog for stale-path restores (Phase 2). Phases 3 & 4 (Supabase RPC, race window flag) were already removed from the plan to avoid schema version bumps that would break older clients.

## Files Modified (3 files)

| File | Changes |
|---|---|
| `src/features/source/browser/hooks/useFileOperations.ts` | Phase 1A, 1B, 1C: drag-drop folder move fixes |
| `src/features/source/trash/FolderPickerDialog.tsx` | Phase 2A: new component |
| `src/features/source/trash/TrashView.tsx` | Phase 2B, 2C: folder picker integration |

---

## Phase 1: Drag-Drop Folder Move Fix

**File:** `src/features/source/browser/hooks/useFileOperations.ts` — `handleMoveFiles`

### 1A. Nested `pdmData.file_path` update

**Problem:** When a folder is moved via drag-drop, `renameFileInStore` updates `relativePath` for nested files, but their `pdmData.file_path` stays frozen at the old location. On next sync, the stale `file_path` creates ghost files.

**Fix:** Same pattern as the original Fix 1 (rename handler in `fileOps.ts`):
1. Collect nested synced files (those with `pdmData.file_path`) **before** `renameFileInStore` changes paths
2. Compute their new relative paths
3. After `renameFileInStore`, call `updateFilesInStore` with updated `pdmData.file_path` for each

### 1B. Missing `updateFolderServerPath` call

**Problem:** Drag-drop folder moves call `updateFolderPath` (updates file records in the `files` table) but never call `updateFolderServerPath` (updates the folder record in the `folders` table). The folder's own server-side path is never updated.

**Fix:** After `updateFolderPath` succeeds, if the folder has `pdmData.id`, call `updateFolderServerPath(file.pdmData.id, newRelPath)`. Wrapped in try/catch with a warning log on failure (non-blocking — the files are already moved correctly).

### 1C. `isMove` flag for directories

**Problem:** `renameFileInStore` was called with `isMove=false` for directory moves. When `isMove=false`, the function treats the 3rd argument as a **name** (replaces only the last path segment), not a full relative path. For cross-folder moves like `A/subfolder` → `B/subfolder`, this produces the wrong `newRelPathForItem` and all nested paths are computed incorrectly.

**Fix:** Changed `renameFileInStore(file.path, newFullPath, newRelPath, markAsMoved)` to `renameFileInStore(file.path, newFullPath, newRelPath, true)`. The `isMove` flag only controls path computation — it does NOT set `diffStatus: 'moved'` — so passing `true` for synced directories is safe.

---

## Phase 2: Folder Picker Dialog for Stale-Path Restores

### 2A. `FolderPickerDialog` component

**New file:** `src/features/source/trash/FolderPickerDialog.tsx`

A modal dialog that lets users pick a destination folder from the vault:

- **Data source:** Filters `usePDMStore.files` to local directory entries (`isDirectory && diffStatus !== 'cloud'`)
- **Tree building:** `buildFolderTree` groups folders by parent path into a recursive `FolderNode[]` structure
- **UI:** Recursive `FolderTreeNode` with expand/collapse (chevron), folder icons, click-to-select, double-click-to-expand
- **Special entry:** "Vault Root" at the top (selects `""`)
- **Auto-expand:** Ancestors of `defaultPath` are pre-expanded on open
- **Keyboard:** Enter to confirm, Escape to close
- **Styling:** Matches `MatchGhostFileDialog` pattern — fixed overlay, `max-w-md`, backdrop-click-to-close, `plm-*` design tokens

### 2B. Single-file restore integration

**File:** `src/features/source/trash/TrashView.tsx` — single restore handler

When a restored file's parent folder no longer exists locally:
1. Instead of showing a warning toast, the `FolderPickerDialog` opens
2. User picks a destination → `updateFilePath(fileId, newPath)` updates the DB, then `addCloudFile` adds the file at the correct location
3. If `updateFilePath` fails, falls back to adding at the old path with a warning toast
4. If user dismisses ("Skip"), an info toast notes the file was kept at its original path

### 2C. Batch restore integration

**File:** `src/features/source/trash/TrashView.tsx` — batch restore handler

- Stale-path files are **deferred** from `addCloudFile` during the restore loop (collected into `stalePathFiles[]` instead)
- After the loop, if stale files exist, a **single** `FolderPickerDialog` opens with message: "N restored file(s) were in folders that no longer exist..."
- User picks a folder → `updateFilePath` + `addCloudFile` for each file at the new path
- If `updateFilePath` fails for a file, it's added at its old path as fallback
- If user dismisses, an info toast notes the files were kept at their original paths

### 2D. State management

Added `folderPickerState` to `TrashView`:
```typescript
const [folderPickerState, setFolderPickerState] = useState<{
  files: Array<{ id: string; fileName: string; oldPath: string }>
  onSelect: (folder: string) => Promise<void>
} | null>(null)
```

The dialog is rendered at the bottom of the component via a `<>` fragment wrapper, driven by this state. Both single and batch flows set/clear this state as appropriate.

---

## Deferred (Cancelled)

| Phase | Reason |
|---|---|
| Phase 3: Supabase RPC for atomic `updateFolderPath` | Schema version bump would trigger "database newer than app" warnings for users on older versions |
| Phase 4: `folderOperationInProgress` race window flag | Depends on Phase 3; existing hardened loop (Fix 2) with per-file error reporting is sufficient |

See `updatefolderpath-rpc.md` and `fix-race-window.md` for the full designs if these are revisited later.

---

## Verification

- [x] TypeScript typecheck: 0 new errors (6 pre-existing in `SolidWorksPanel.tsx` and `PendingView.tsx`)
- [x] Linter: 0 errors in all modified files
- [x] No new dependencies added
- [x] No schema or API version changes
- [x] No Supabase SQL changes
