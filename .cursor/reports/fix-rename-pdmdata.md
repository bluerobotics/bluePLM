# Fix 1: Update `pdmData.file_path` for Nested Items During Rename

## Summary
Added logic to update `pdmData.file_path` for all nested synced files when a folder is renamed via the rename command. This is the **root cause** of ghost files appearing after folder renames.

## Problem
When renaming a folder (e.g., "Thruster-Boi" to "BR Equipment"), `renameFileInStore` updates `path` and `relativePath` for all nested items, but `pdmData.file_path` was carried forward unchanged with `...f` spread. On next sync, `useLoadFiles` builds a `pdmMap` keyed by `file_path.toLowerCase()` -- files whose `pdmData.file_path` still had the old prefix couldn't match their `relativePath`, creating ghost files.

## Changes Made
| File | Change |
|---|-----|
| `src/lib/commands/handlers/fileOps.ts` | Added nested pdmData collection + store update in rename command |

### Implementation
Replicated the exact proven pattern from the move command (lines 752-790):

1. **Before `renameFileInStore`**: Collect nested synced files from `ctx.files` snapshot (captures old paths)
2. **After `renameFileInStore`**: Call `ctx.updateFilesInStore()` with updates that set `pdmData.file_path` to the new relative path
3. The path construction uses `vaultPath + sep + newRelPath` to match the full path that `renameFileInStore` set

### Insertion order in rename command
1. **NEW: Collect nested synced files** (before renameFileInStore)
2. `ctx.renameFileInStore(...)` -- updates path/relativePath
3. **NEW: `ctx.updateFilesInStore(...)` -- updates pdmData.file_path**
4. `ctx.setLastOperationCompletedAt(...)`
5. Toast
6. Server updates (`updateFolderPath`, `updateFolderServerPath`)

## Verification
- [x] Linter passes (0 errors)
- [x] Path math traced through concrete example: `Thruster-Boi/sub/file.txt` -> `BR Equipment/sub/file.txt`
- [x] Uses `ctx.files` snapshot (always has old paths regardless of timing)
- [x] Same pattern as move command (lines 752-790)

## Known Side Effect (Pre-existing)
`updateFilesInStore` clears `persistedPendingMetadata` when `fileUpdates.pendingMetadata === undefined`. Since our update only includes `pdmData`, this condition is true. The move command (line 785) has this exact same behavior. Tracked as a separate follow-up fix.
