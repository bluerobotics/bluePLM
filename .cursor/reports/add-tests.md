# Follow-up: Add Tests for Affected Functions

## Summary
No test framework is currently configured in the BluePLM project. Adding tests for the affected functions requires setting up a test runner first. This report documents what should be tested and a recommended approach.

## Current State
- **Zero test files** in `src/`
- **No test framework** (no vitest.config, jest.config, or similar)
- **No test dependencies** in package.json

## Setup Required
1. Install vitest (recommended for Vite-based projects):
   ```bash
   npm install -D vitest @testing-library/react jsdom
   ```
2. Add vitest config
3. Add test script to package.json

## Test Plan

### `updateFolderPath` (mutations.ts)
These require mocking the Supabase client:
- **Normalizes trailing slashes**: Input `"folder/"` should query `"folder/%"` not `"folder//%"`
- **Uses `/%` prefix**: Input `"A"` should NOT match `"AB/file.txt"`
- **Filters `deleted_at IS NULL`**: Trashed files should not be updated
- **Collects errors**: When one update fails, `success` is `false`, `errors` array populated
- **Returns accurate counts**: `total` and `updated` reflect actual state
- **Empty folder**: Returns `{ success: true, updated: 0, total: 0, errors: [] }`

### `renameFileInStore` + pdmData update (filesSlice.ts + fileOps.ts)
These are pure-ish functions that can be tested with a mock store:
- **Nested files get updated pdmData.file_path**: After rename, all nested files have correct `pdmData.file_path`
- **Path math is correct**: `"Thruster-Boi/sub/file.txt"` -> `"BR Equipment/sub/file.txt"`
- **Non-synced files unaffected**: Files without `pdmData` are not touched
- **Prefix safety**: Renaming `"A"` doesn't affect `"AB/file.txt"`

### `updateFilesInStore` side-effect fix (filesSlice.ts)
- **pdmData-only update**: Does NOT clear `persistedPendingMetadata`
- **Explicit `pendingMetadata: undefined`**: DOES clear `persistedPendingMetadata`
- **Copy fields**: Same pattern for `copiedFromFileId`/`copiedVersion`

### Restore flow (TrashView.tsx)
Requires mocking the Supabase client and store:
- **Stale path detected**: When parent folder doesn't exist, warning shown
- **File added verified**: When `addCloudFile` silently fails, warning shown
- **Batch error collection**: Error messages collected and displayed
- **Cloud-only parent excluded**: `diffStatus === 'cloud'` parent doesn't satisfy parent check

## Priority
**Medium** -- Setting up the test framework is a separate initiative. The tests documented here should be among the first written.

## Recommended First Tests
Start with `updateFilesInStore` side-effect tests (pure logic, easy to test) and `updateFolderPath` tests (most critical for data safety).
