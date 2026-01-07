# Trash Deletion Consistency Refactor

## Objective

Refactor permanent trash deletion to use `processWithConcurrency` with individual file operations, matching the pattern used by checkout, sync, download, and all other file operations in the codebase.

---

## Scope

### OWNS (exclusive write)

- [`src/lib/supabase/files/trash.ts`](src/lib/supabase/files/trash.ts) - `permanentlyDeleteFiles()` function

### READS (no modify)

- [`src/lib/concurrency.ts`](src/lib/concurrency.ts) - Import `processWithConcurrency`, `CONCURRENT_OPERATIONS`
- [`src/features/source/trash/TrashView.tsx`](src/features/source/trash/TrashView.tsx) - Verify progress callback compatibility

---

## Current vs Target

### Current Implementation (lines 268-392)

```typescript
// Sequential batch processing - 100 files at a time
const CHUNK_SIZE = 100
for (let i = 0; i < validFileIds.length; i += CHUNK_SIZE) {
  const chunkIds = validFileIds.slice(i, i + CHUNK_SIZE)
  // 5 sequential bulk DB operations per batch
  await client.from('activity').insert(activityLogs)
  await client.from('file_versions').delete().in('file_id', chunkIds)
  await client.from('file_references').delete().in('parent_file_id', chunkIds)
  await client.from('file_references').delete().in('child_file_id', chunkIds)
  await client.from('files').delete().in('id', chunkIds)
  onProgress?.(i + chunkIds.length, validFileIds.length)
}
```

**Problem**: Progress jumps by 100, feels "stuck" between batches.

### Target Implementation

```typescript
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'

export async function permanentlyDeleteFiles(
  fileIds: string[],
  userId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<{ success: boolean; deleted: number; failed: number; errors: string[] }> {
  if (fileIds.length === 0) {
    return { success: true, deleted: 0, failed: 0, errors: [] }
  }

  let completed = 0
  const errors: string[] = []

  const results = await processWithConcurrency(
    fileIds,
    CONCURRENT_OPERATIONS,
    async (fileId) => {
      const result = await permanentlyDeleteFile(fileId, userId)
      completed++
      onProgress?.(completed, fileIds.length)
      return result
    }
  )

  const deleted = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  // Collect first few errors for reporting
  for (const r of results) {
    if (!r.success && r.error && errors.length < 5) {
      errors.push(r.error)
    }
  }
  if (failed > errors.length) {
    errors.push(`...and ${failed - errors.length} more errors`)
  }

  return { success: failed === 0, deleted, failed, errors }
}
```

**Benefits**:

- Consistent with all other file operations (20 concurrent)
- Smooth per-file progress (1, 2, 3... not 100, 200, 300...)
- Simpler code - removes batch chunking, reuses existing `permanentlyDeleteFile()`

---

## Tasks

- [x] Add import for `processWithConcurrency` and `CONCURRENT_OPERATIONS` from `../../concurrency`
- [x] Replace `permanentlyDeleteFiles()` implementation with concurrent individual operations
- [x] Remove the `CHUNK_SIZE = 100` local constant (keep `BATCH_CHUNK_SIZE` export in concurrency.ts)
- [x] Verify `emptyTrash()` continues to work (it calls `permanentlyDeleteFiles()`)

---

## Quality Requirements

- No `any` types introduced
- Proper TypeScript types maintained
- Error handling preserved (collect first 5 errors, summarize rest)
- Progress callback signature unchanged (`completed: number, total: number`)
- Follows existing patterns from other command handlers

---

## Deliverables

1. Refactored `permanentlyDeleteFiles()` using `processWithConcurrency`
2. `npm run typecheck` passes
3. Brief completion report

---

## Verification

- [x] `npm run typecheck` passes
- [ ] Manual test: Select multiple files in trash, delete - verify smooth progress
- [ ] Manual test: Empty trash with many files - verify smooth progress
- [ ] No regressions in trash functionality

---

## Completion Report

**Status**: ✅ Complete

**Changes Made**:

1. Added import for `processWithConcurrency` and `CONCURRENT_OPERATIONS` from `../../concurrency` (line 2)
2. Replaced the batch-based `permanentlyDeleteFiles()` implementation with concurrent individual operations (lines 268-305)
3. Removed local `CHUNK_SIZE = 100` constant - no longer needed
4. The `emptyTrash()` function continues to work unchanged as it delegates to `permanentlyDeleteFiles()`

**Before**: Sequential batch processing (100 files at a time, 5 DB operations per batch). Progress jumped by 100.

**After**: Concurrent individual operations (20 concurrent via `processWithConcurrency`). Progress increments by 1 for each file.

**Code Reduction**: ~80 lines → ~35 lines (simplified by reusing existing `permanentlyDeleteFile()`)

**Verification**: `npm run typecheck` passes with exit code 0

---

## Notes

- This is a single-agent task - no parallelization needed
- `emptyTrash()` doesn't need changes - it already delegates to `permanentlyDeleteFiles()`
- UI code (`TrashView.tsx`) doesn't need changes - progress callback signature is unchanged