# Fix 2: Harden `updateFolderPath` Report

## Summary
Hardened the `updateFolderPath` function in `src/lib/supabase/files/mutations.ts` to prevent ghost file creation and silent data loss during folder renames.

## Changes Made
| File | Change |
|---|-----|
| `src/lib/supabase/files/mutations.ts` | Rewrote `updateFolderPath` with 4 defensive improvements |

### Details

1. **Normalize inputs**: Strip trailing slashes from `oldFolderPath` and `newFolderPath` at the top of the function, preventing double-slash issues with the `/%` suffix.

2. **Safe prefix matching (Bug 3)**: Changed `.ilike('file_path', `${oldFolderPath}%`)` to `.ilike('file_path', `${oldFolderPath}/%`)`. This prevents renaming folder `A` from matching and corrupting `AB/file.sldprt`. Only files in the `files` table need matching (folders are in the separate `folders` table).

3. **`deleted_at IS NULL` filter (Bug 4)**: Added `.is('deleted_at', null)` to the select query. Trashed files now keep their frozen paths, preventing corruption of records the user may later restore.

4. **Error logging and accurate return status (Bug 2)**: On each per-file update failure, the error is now logged with `console.warn` including file ID and path. All error messages are collected into an array. The return type now includes `total` and `errors` fields, and `success` is `false` when any update fails (previously always `true`).

### Return type change
```typescript
// Before
Promise<{ success: boolean; updated: number; error?: string }>

// After
Promise<{ success: boolean; updated: number; total: number; errors: string[]; error?: string }>
```

## Backward Compatibility
- `useFileOperations.ts` (line 360) already checks `folderResult.success` and `folderResult.error` -- both preserved. No change needed.
- `fileOps.ts` rename/move callers currently ignore the return value entirely -- Fix 3 will add proper checking.

## Verification
- [x] Linter passes (0 errors)
- [x] Return type backward-compatible with existing callers
- [x] Follows existing code patterns

## Trade-offs
- Trashed files no longer have their paths updated during rename, meaning restoring them later places them at the old (stale) path. This is the correct choice: updating trashed paths would cause `restoreFile`'s duplicate check to block the restore entirely. The Bug 6 follow-up (stale path on restore) becomes more important.
