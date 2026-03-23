# Fix 4: Guard `addCloudFile` and Restore Flow

## Summary
Added diagnostics to `addCloudFile` when `vaultPath` is null, and added stale-path detection + file-added verification to the restore flow in `TrashView.tsx`.

## Changes Made
| File | Change |
|---|-----|
| `src/stores/slices/filesSlice.ts` | Log warning when `addCloudFile` is called with no `vaultPath` |
| `src/features/source/trash/TrashView.tsx` | Single restore: stale path check + file-added verification |
| `src/features/source/trash/TrashView.tsx` | Batch restore: stale path check + file-added verification per file |

### `addCloudFile` guard (Bug 5)
When `vaultPath` is null, the function now logs a warning via `electronAPI.log('warn', ...)` with the file ID, path, and name. This makes the previously silent no-op diagnosable in logs. The file still won't be added (correct behavior when no vault is connected), but the failure is now visible.

### Restore flow stale-path detection (Bug 6 partial)
For both single and batch restore:

1. **BEFORE `addCloudFile`**: Check if the restored file's parent folder exists locally as a non-cloud directory
2. **AFTER `addCloudFile`**: Verify the file was actually added to the store by checking `usePDMStore.getState().files`
3. **Warn user**: If the file was added but its parent doesn't exist locally, show a warning toast about the stale path

Key implementation details:
- `diffStatus !== 'cloud'` excludes phantom cloud folders from satisfying the parent check
- The stale-path check runs BEFORE `addCloudFile` because `addCloudFile` auto-creates cloud parent folders
- Both `wasAdded` and stale-path warnings are independent checks

## Verification
- [x] Linter passes (0 errors)
- [x] Single and batch restore both have the same defensive checks
- [x] `addCloudFile` logs are actionable for debugging

## Limitation
This does NOT fully solve Bug 6 (restoring to the correct renamed path). A complete fix would require tracking folder rename history or letting the user pick a new location. Deferred as follow-up.
