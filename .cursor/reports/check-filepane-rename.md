# Follow-up: Verify FilePane.tsx and useFileOperations.ts

## Summary
Verified the code paths. FilePane.tsx is safe for renames (delegates to command system). useFileOperations.ts has its own Bug 1 equivalent for drag-and-drop folder moves -- documented as a separate issue.

## Findings

### FilePane.tsx -- SAFE
- Gets `renameFileInStore` from the store at line 197
- Passes it to `useFileOperations` at line 356 (only for drag-and-drop moves)
- Inline rename operations go through `executeCommand('rename', ...)` via the command system, which now includes Fix 1's pdmData update
- **No change needed for renames**

### useFileOperations.ts -- PRE-EXISTING BUG (separate PR)
The `handleMoveFiles` function (line 390) has the same Bug 1 pattern for drag-and-drop folder moves:

```typescript
renameFileInStore(file.path, newFullPath, newRelPath, markAsMoved)
// No updateFilesInStore() call for nested pdmData.file_path
// No updateFolderServerPath() call for the folders table
```

Issues:
1. **Missing pdmData update**: After `renameFileInStore`, nested files' `pdmData.file_path` is stale (same ghost file risk)
2. **Missing `updateFolderServerPath`**: The `folders` table record is never updated for drag-drop folder moves
3. **`isMove` flag issue**: `markAsMoved = !file.isDirectory && !file.pdmData?.id` -- for directories, `markAsMoved` is always `false`, causing `renameFileInStore` to treat the 3rd argument as a NAME rather than a full relative path

These are pre-existing bugs in a separate code path from the command-based move in `fileOps.ts`. They should be fixed in a separate PR to keep this changeset focused.

## Recommendation
File a separate issue/PR to fix drag-and-drop folder moves in `useFileOperations.ts`:
1. Add nested pdmData.file_path update (same pattern as Fix 1)
2. Add `updateFolderServerPath` call
3. Fix the `isMove` flag for directories

## Verification
- [x] FilePane.tsx inline rename confirmed safe (uses command system)
- [x] useFileOperations.ts pre-existing bugs documented
- [x] No code changes needed for this follow-up (documentation only)
