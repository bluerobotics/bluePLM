# Fix 3: Check `updateFolderPath` Result in Both Callers

## Summary
Both callers of `updateFolderPath` in `fileOps.ts` now check the return value and warn the user on partial failure, surfacing previously silent data loss.

## Changes Made
| File | Change |
|---|-----|
| `src/lib/commands/handlers/fileOps.ts` | Rename command: capture result, warn on partial failure |
| `src/lib/commands/handlers/fileOps.ts` | Move command: capture result, warn on partial failure |

### Rename command (was line 290)
Previously: `await updateFolderPath(oldRelPath, newRelPath)` -- return value discarded.

Now: captures result, checks `!folderResult.success || folderResult.updated < folderResult.total`, logs warning with details, and shows user a toast with the count of failed files.

### Move command (was line 691, now ~734)
Same pattern applied. Previously ignored the return value entirely.

### `useFileOperations.ts` (line 360)
Already checks `folderResult.success` correctly -- no change needed. Verified backward compatible with new return type (uses `folderResult.error` which is still present).

## Verification
- [x] Linter passes (0 errors)
- [x] Both callers now surface failures to user
- [x] `useFileOperations.ts` unchanged and backward compatible
