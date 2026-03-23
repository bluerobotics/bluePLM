# Follow-up: Fix `updateFilesInStore` Clearing `persistedPendingMetadata`/`persistedCopySource`

## Summary
Fixed a side effect in `updateFilesInStore` where unrelated updates (e.g., only updating `pdmData`) would inadvertently clear `persistedPendingMetadata` and `persistedCopySource` for affected files.

## Problem
`updateFilesInStore` had logic that cleared persisted metadata when `fileUpdates.pendingMetadata === undefined`. Since `undefined` is the default for any property not present in a JS object, an update like `{ pdmData: {...} }` (which doesn't include `pendingMetadata` at all) would trigger the clearing logic. This affected both the rename and move commands when they call `updateFilesInStore` to update nested files' `pdmData.file_path`.

## Changes Made
| File | Change |
|---|-----|
| `src/stores/slices/filesSlice.ts` | Changed `=== undefined` checks to `'key' in obj` checks |

### Before
```typescript
if (fileUpdates.pendingMetadata === undefined) { ... clear ... }
if (fileUpdates.copiedFromFileId === undefined && fileUpdates.copiedVersion === undefined) { ... clear ... }
```

### After
```typescript
if ('pendingMetadata' in fileUpdates && fileUpdates.pendingMetadata === undefined) { ... clear ... }
if (('copiedFromFileId' in fileUpdates || 'copiedVersion' in fileUpdates) &&
    fileUpdates.copiedFromFileId === undefined && fileUpdates.copiedVersion === undefined) { ... clear ... }
```

## How It Works
- `'pendingMetadata' in fileUpdates` returns `true` only when the property was **explicitly included** in the update object (even if its value is `undefined`)
- When a caller passes `{ pdmData: {...} }`, `'pendingMetadata' in fileUpdates` is `false`, so the clearing logic is skipped
- When a caller explicitly passes `{ pendingMetadata: undefined }` (e.g., after check-in), both conditions are `true` and the clearing happens correctly

## Impact
- **Fix 1** (rename pdmData update): No longer clears pending metadata for nested files during rename
- **Move command** (line 785): No longer clears pending metadata for nested files during move
- **Check-in flow**: Continues to work correctly since it explicitly includes `pendingMetadata: undefined`

## Verification
- [x] Linter passes (0 errors)
- [x] `'in' operator` is the correct JS mechanism for distinguishing "property not present" from "property set to undefined"
- [x] Backward compatible with callers that explicitly set `pendingMetadata: undefined`
