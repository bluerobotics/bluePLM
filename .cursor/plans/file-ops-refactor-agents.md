# File Operations Architecture Refactor - Parallel Agent Plan

## Executive Summary

Second pass refactoring of the file operations layer. First pass (Agents 1-5) completed the `src/lib/supabase/files/` reorganization and created atomic RPCs. This second pass addresses remaining issues: API race conditions, legacy `fileService.ts`, inconsistent concurrency patterns, and utility duplication.

## Current State (Post First Pass)

```
src/lib/supabase/files/
├── index.ts          # Barrel exports
├── queries.ts        # 11 read-only query functions
├── checkout.ts       # 5 checkout/checkin functions (uses atomic RPCs)
├── mutations.ts      # syncFile, updateFileMetadata, updateFilePath, updateFolderPath
└── trash.ts          # 9 soft-delete/restore/permanent-delete functions

supabase/modules/10-source-files.sql
├── checkout_file RPC    # Atomic checkout with FOR UPDATE lock
└── checkin_file RPC     # Atomic checkin with version increment
```

## Remaining Issues

1. **API Routes Race Conditions**: `api/routes/files.ts` checkout/checkin still use manual 2-query pattern
2. **Legacy fileService.ts**: `src/lib/fileService.ts` (522 lines) duplicates checkout/checkin with race conditions
3. **Inconsistent Concurrency**: `checkout.ts` uses `Promise.all` without limits; `sync.ts` uses `processWithConcurrency(20)`
4. **Utility Duplication**: `getFileTypeFromExtension` exists in both `mutations.ts` and `api/utils/files.ts`
5. **Sequential Batch Ops**: `updateFolderPath` processes files sequentially instead of in batches

## Concurrency Standards (Per User Request)

| Operation | Concurrency Limit | Chunk Size |
|-----------|------------------|------------|
| File uploads (sync) | 20 | N/A |
| Checkout/checkin | 20 | N/A |
| DB queries | 20 | N/A |
| Batch deletes | N/A | 100 |
| Activity log inserts | N/A | 100 |

---

## Parallel Agent Execution Plan

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PARALLEL EXECUTION                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │     AGENT 1      │  │     AGENT 2      │  │     AGENT 3      │              │
│  │   API Routes     │  │  fileService.ts  │  │ Command Handlers │              │
│  │    Refactor      │  │    Cleanup       │  │   Consistency    │              │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘              │
│                                                                                 │
│  Files:                Files:                Files:                             │
│  - api/routes/files.ts - src/lib/          - src/lib/commands/handlers/*.ts    │
│  - api/utils/files.ts    fileService.ts    - NO OVERLAP with API or supabase/  │
│                        - Caller files                                           │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                            AGENT 4                                       │  │
│  │         Shared Utilities + Batch Consistency + Final Cleanup             │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  Files: src/lib/concurrency.ts (new), src/lib/supabase/files/mutations.ts,     │
│         src/lib/supabase/files/trash.ts, constants consolidation               │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Maximum Recommended Agents: 4**

Why not more? The file operations code has interdependencies. More agents would create merge conflicts and coordination overhead.

---

# AGENT 1: API Routes Refactor

## Priority: Run in parallel with Agents 2, 3

## Scope

**Files to MODIFY:**
- `api/routes/files.ts`
- `api/utils/files.ts` (if needed)

**Files NOT to touch:**
- Anything in `src/lib/`
- Anything in `supabase/`

## Background

The API routes currently have race conditions in checkout/checkin:

```typescript
// CURRENT (race condition - 2 separate queries):
// 1. Fetch file and check status
const { data: file } = await request.supabase!.from('files').select(...).single()
if (file.checked_out_by && file.checked_out_by !== request.user!.id) {
  return sendError(reply, 409, 'Already checked out', ...)
}
// 2. Update file (race window between queries!)
await request.supabase!.from('files').update({...}).eq('id', id)
```

## Tasks

### Task 1.1: Update Checkout Route to Use Atomic RPC

File: `api/routes/files.ts`, lines ~103-179

**Replace the 2-query checkout with atomic RPC:**

```typescript
// POST /files/:id/checkout - REFACTORED
fastify.post('/files/:id/checkout', {
  // ... existing schema ...
  preHandler: fastify.authenticate
}, async (request, reply) => {
  const { id } = request.params as { id: string }
  const { message } = (request.body as { message?: string }) || {}
  
  // Use atomic RPC (prevents race conditions with FOR UPDATE lock)
  const { data, error } = await request.supabase!.rpc('checkout_file', {
    p_file_id: id,
    p_user_id: request.user!.id,
    p_machine_id: null,  // API clients don't have machine ID
    p_machine_name: 'API',
    p_lock_message: message || null
  })
  
  if (error) throw error
  
  const result = data as { success: boolean; error?: string; file?: any }
  
  if (!result.success) {
    return sendError(reply, 409, 'Checkout failed', result.error || 'Unknown error')
  }
  
  // Trigger webhooks (file data is in result.file)
  await triggerWebhooks(request.user!.org_id!, 'file.checkout', {
    file_id: id,
    file_path: result.file.file_path,
    file_name: result.file.file_name,
    user_id: request.user!.id,
    user_email: request.user!.email
  }, fastify.log)
  
  return { success: true, file: result.file }
})
```

### Task 1.2: Update Checkin Route to Use Atomic RPC

File: `api/routes/files.ts`, lines ~181-310

**Replace the multi-step checkin with atomic RPC:**

```typescript
// POST /files/:id/checkin - REFACTORED
fastify.post('/files/:id/checkin', {
  // ... existing schema ...
  preHandler: fastify.authenticate
}, async (request, reply) => {
  const { id } = request.params as { id: string }
  const { comment, content_hash, file_size, content } = request.body as { ... }
  
  let newHash = content_hash
  let newSize = file_size
  
  // Handle content upload if provided
  if (content) {
    const binaryContent = Buffer.from(content, 'base64')
    newHash = computeHash(binaryContent)
    newSize = binaryContent.length
    
    const storagePath = `${request.user!.org_id}/${newHash.substring(0, 2)}/${newHash}`
    await request.supabase!.storage
      .from('vault')
      .upload(storagePath, binaryContent, {
        contentType: 'application/octet-stream',
        upsert: false
      }).catch(() => {}) // Ignore if already exists
  }
  
  // Use atomic RPC for checkin
  const { data, error } = await request.supabase!.rpc('checkin_file', {
    p_file_id: id,
    p_user_id: request.user!.id,
    p_new_content_hash: newHash || null,
    p_new_file_size: newSize || null,
    p_comment: comment || null
  })
  
  if (error) throw error
  
  const result = data as { success: boolean; error?: string; file?: any; new_version?: number }
  
  if (!result.success) {
    return sendError(reply, 403, 'Checkin failed', result.error || 'Unknown error')
  }
  
  const contentChanged = newHash && newHash !== result.file.content_hash
  
  // Trigger webhooks
  if (contentChanged) {
    await triggerWebhooks(request.user!.org_id!, 'file.version', {
      file_id: id,
      file_path: result.file.file_path,
      file_name: result.file.file_name,
      version: result.new_version,
      user_id: request.user!.id,
      user_email: request.user!.email
    }, fastify.log)
  }
  
  await triggerWebhooks(request.user!.org_id!, 'file.checkin', {
    file_id: id,
    file_path: result.file.file_path,
    file_name: result.file.file_name,
    user_id: request.user!.id,
    user_email: request.user!.email,
    content_changed: contentChanged
  }, fastify.log)
  
  return { success: true, file: result.file, contentChanged }
})
```

### Task 1.3: Remove Manual Activity Logging

The RPCs now handle activity logging internally (added by Agent 5 in first pass). Remove redundant activity inserts from:
- Checkout route (line ~161-167)
- Checkin route (line ~291-298)

### Task 1.4: Clean Up Undo-Checkout Route

File: `api/routes/files.ts`, lines ~312-354

The undo-checkout can also be simplified. Consider whether to create an RPC or keep as-is (acceptable since it's a simple single update with ownership check).

## Completion Report

Create `AGENT1_API_REPORT.md` in project root:

```markdown
# Agent 1: API Routes Refactor Report

## Status: COMPLETE / INCOMPLETE

## Changes Made:
- [ ] Refactored POST /files/:id/checkout to use checkout_file RPC
- [ ] Refactored POST /files/:id/checkin to use checkin_file RPC
- [ ] Removed redundant activity logging (RPCs handle this)
- [ ] Verified webhooks still trigger correctly

## Race Conditions Fixed:
- Checkout: Now uses FOR UPDATE lock via RPC
- Checkin: Now uses ownership verification + lock via RPC

## Files Modified:
- api/routes/files.ts

## API Behavior Changes:
- None - same request/response format
- Internal implementation now atomic

## Testing Notes:
1. Test concurrent checkout attempts on same file
2. Test checkin with content upload
3. Test checkin without content (just release lock)
4. Verify webhook payloads unchanged

## Blockers:
- None / List any issues
```

---

# AGENT 2: fileService.ts Cleanup

## Priority: Run in parallel with Agents 1, 3

## Scope

**Files to ANALYZE:**
- `src/lib/fileService.ts` (determine what's still used)
- Files that import from `fileService.ts`

**Files to MODIFY:**
- `src/lib/fileService.ts` (deprecate or delete)
- Any files importing from it

**Files NOT to touch:**
- `api/` folder
- `src/lib/supabase/files/` (except updating imports)
- `src/lib/commands/handlers/` (Agent 3's scope)

## Background

`src/lib/fileService.ts` contains 522 lines with functions that duplicate the supabase/files layer:
- `checkoutFile` - uses non-atomic 2-query pattern (HAS RACE CONDITION)
- `checkinFile` - manual version increment (HAS RACE CONDITION)
- `undoCheckout` - simple, could be kept or merged
- `forceUnlock` - admin function
- `addFile` - similar to syncFile
- `getFileVersion`, `getFileHistory` - query functions
- `rollbackToVersion` - complex version switching
- `transitionFileState` - workflow transitions

## Tasks

### Task 2.1: Audit fileService.ts Callers

Find all imports:

```bash
grep -r "from.*fileService" src/
grep -r "import.*fileService" src/
```

Document each caller and what functions they use.

### Task 2.2: Determine Migration Strategy

For each function in fileService.ts:

| Function | Replacement | Action |
|----------|-------------|--------|
| `checkoutFile` | `supabase/files/checkout.ts::checkoutFile` | Redirect callers |
| `checkinFile` | `supabase/files/checkout.ts::checkinFile` | Redirect callers |
| `undoCheckout` | `supabase/files/checkout.ts::undoCheckout` | Redirect callers |
| `forceUnlock` | `supabase/files/checkout.ts::adminForceDiscardCheckout` | Redirect callers |
| `addFile` | `supabase/files/mutations.ts::syncFile` | Redirect or keep |
| `getFileVersion` | Keep in fileService or move to queries | Evaluate |
| `getFileHistory` | `supabase/files/queries.ts::getFileVersions` | Redirect callers |
| `rollbackToVersion` | Keep (complex, UI-specific) | Evaluate |
| `transitionFileState` | Keep (workflow-specific) | Evaluate |

### Task 2.3: Update Callers

For each caller found in Task 2.1:
1. Change import from `fileService` to `supabase/files`
2. Verify function signatures match (they should)
3. Test the import works

### Task 2.4: Deprecate or Delete fileService.ts

**Option A (Safer):** Add deprecation notice and keep unique functions:

```typescript
/**
 * @deprecated This file is being phased out. 
 * Use imports from 'src/lib/supabase/files' instead.
 * 
 * Remaining functions here are legacy or have unique functionality
 * not yet migrated.
 */

// Re-export from new location for backwards compatibility
export { checkoutFile, checkinFile, undoCheckout } from './supabase/files'

// Keep only truly unique functions
export async function rollbackToVersion(...) { ... }
export async function transitionFileState(...) { ... }
```

**Option B (Clean):** If no unique functions remain, delete the file entirely.

### Task 2.5: Move Unique Functions If Needed

If `rollbackToVersion` or `transitionFileState` are still needed:
- Move to `src/lib/supabase/files/versions.ts` (new file)
- Or move to appropriate existing module

## Completion Report

Create `AGENT2_FILESERVICE_REPORT.md`:

```markdown
# Agent 2: fileService.ts Cleanup Report

## Status: COMPLETE / INCOMPLETE

## Audit Results:

### Callers Found:
- [ file path ]: uses [ functions ]
- ...

### Functions Disposition:
| Function | Action | New Location |
|----------|--------|--------------|
| checkoutFile | Redirected | supabase/files/checkout.ts |
| ... | ... | ... |

## Changes Made:
- [ ] Audited all callers
- [ ] Updated imports in [ N ] files
- [ ] Deprecated/deleted fileService.ts
- [ ] Moved unique functions to [ location ]

## Files Modified:
- src/lib/fileService.ts
- [ list other files ]

## Breaking Changes:
- None (backwards compatible) / List any

## Testing Notes:
1. Verify all former callers still work
2. Check no runtime import errors

## Blockers:
- None / List any issues
```

---

# AGENT 3: Command Handlers Consistency

## Priority: Run in parallel with Agents 1, 2

## Scope

**Files to MODIFY:**
- `src/lib/commands/handlers/checkout.ts`
- `src/lib/commands/handlers/checkin.ts`
- `src/lib/commands/handlers/getLatest.ts`
- `src/lib/commands/handlers/download.ts`
- `src/lib/commands/handlers/forceRelease.ts`
- `src/lib/commands/handlers/discard.ts`

**Files NOT to touch:**
- `api/` folder (Agent 1's scope)
- `src/lib/fileService.ts` (Agent 2's scope)
- `src/lib/supabase/files/` (except imports)

## Background

The command handlers have inconsistent concurrency patterns:
- `sync.ts`: Uses `processWithConcurrency(items, 20, processor)` - GOOD
- `checkout.ts`: Uses raw `Promise.all(files.map(...))` - COULD OVERLOAD
- `checkin.ts`: Uses raw `Promise.all(files.map(...))` - COULD OVERLOAD
- `getLatest.ts`: Uses raw `Promise.all` - COULD OVERLOAD
- Others: Mixed patterns

## Tasks

### Task 3.1: Add Concurrency Limiting to checkout.ts

File: `src/lib/commands/handlers/checkout.ts`, around line 262

**Before:**
```typescript
const results = await Promise.all(filesToCheckout.map(async (file) => {
  // ... checkout logic
}))
```

**After:**
```typescript
// Import the concurrency utility (Agent 4 will extract this)
// For now, copy the pattern from sync.ts
const CONCURRENT_CHECKOUTS = 20

const results = await processWithConcurrency(filesToCheckout, CONCURRENT_CHECKOUTS, async (file) => {
  // ... same checkout logic
})
```

Either:
1. Copy `processWithConcurrency` function locally (temporary)
2. Import from sync.ts (if exported)
3. Wait for Agent 4 to extract to shared utility, then import

### Task 3.2: Add Concurrency Limiting to checkin.ts

Similar refactor for checkin command handler.

### Task 3.3: Add Concurrency Limiting to getLatest.ts

Similar refactor for get-latest/download operations.

### Task 3.4: Add Concurrency Limiting to forceRelease.ts

Similar refactor.

### Task 3.5: Verify All Handlers Use Atomic RPCs

Check that command handlers are importing from `supabase/files/checkout.ts` (which uses atomic RPCs) and NOT from `fileService.ts`.

### Task 3.6: Standardize Error Handling and Logging

Ensure all command handlers follow the same pattern:
- Use `logXxx('debug'|'info'|'warn'|'error', message, context)` consistently
- Include `operationId` in all logs for tracing
- Handle errors uniformly

## Completion Report

Create `AGENT3_COMMANDS_REPORT.md`:

```markdown
# Agent 3: Command Handlers Consistency Report

## Status: COMPLETE / INCOMPLETE

## Concurrency Limits Applied:
| Handler | Before | After |
|---------|--------|-------|
| checkout.ts | Promise.all (unbounded) | processWithConcurrency(20) |
| checkin.ts | Promise.all (unbounded) | processWithConcurrency(20) |
| getLatest.ts | Promise.all (unbounded) | processWithConcurrency(20) |
| forceRelease.ts | Promise.all (unbounded) | processWithConcurrency(20) |
| discard.ts | [ check ] | [ result ] |

## Changes Made:
- [ ] Added concurrency limiting to checkout.ts
- [ ] Added concurrency limiting to checkin.ts
- [ ] Added concurrency limiting to getLatest.ts
- [ ] Added concurrency limiting to forceRelease.ts
- [ ] Verified all handlers use atomic RPCs (supabase/files imports)
- [ ] Standardized logging patterns

## Files Modified:
- src/lib/commands/handlers/checkout.ts
- src/lib/commands/handlers/checkin.ts
- ...

## Concurrency Standard:
- All file operations now limited to 20 concurrent
- Prevents Supabase connection pool exhaustion

## Testing Notes:
1. Test checkout of 50+ files - should process in waves of 20
2. Test checkin of many files - same
3. Verify no timeout errors under load

## Blockers:
- None / List any issues
```

---

# AGENT 4: Shared Utilities and Final Cleanup

## Priority: Run in parallel, complete last for final verification

## Scope

**Files to CREATE:**
- `src/lib/concurrency.ts` (shared concurrency utilities)

**Files to MODIFY:**
- `src/lib/supabase/files/mutations.ts` (batch folder updates)
- `src/lib/supabase/files/trash.ts` (verify CHUNK_SIZE consistency)
- `src/lib/commands/handlers/sync.ts` (extract utility)
- `api/utils/files.ts` (consolidate getFileTypeFromExtension)

**Files NOT to touch:**
- API routes (Agent 1's scope)
- fileService.ts (Agent 2's scope)
- Command handlers except sync.ts (Agent 3's scope)

## Tasks

### Task 4.1: Create Shared Concurrency Utility

Create `src/lib/concurrency.ts`:

```typescript
/**
 * Concurrency Utilities for BluePLM
 * 
 * Standard limits:
 * - CONCURRENT_OPERATIONS = 20 (file uploads, downloads, checkouts)
 * - BATCH_CHUNK_SIZE = 100 (DB batch operations like deletes)
 */

export const CONCURRENT_OPERATIONS = 20
export const BATCH_CHUNK_SIZE = 100

/**
 * Process items with bounded concurrency to prevent resource exhaustion.
 * Used for Supabase operations to avoid connection pool issues.
 * 
 * @param items - Array of items to process
 * @param maxConcurrent - Maximum concurrent operations (default: 20)
 * @param processor - Async function to process each item
 * @returns Array of results in same order as input items
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  maxConcurrent: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await processor(items[index])
    }
  }
  
  // Start maxConcurrent workers
  await Promise.all(
    Array.from({ length: Math.min(maxConcurrent, items.length) }, () => worker())
  )
  
  return results
}

/**
 * Process items in batches for bulk database operations.
 * Used for batch inserts, updates, deletes.
 * 
 * @param items - Array of items to process
 * @param chunkSize - Size of each batch (default: 100)
 * @param processor - Async function to process each batch
 * @param onProgress - Optional progress callback
 */
export async function processBatched<T, R>(
  items: T[],
  chunkSize: number,
  processor: (batch: T[]) => Promise<R>,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = []
  
  for (let i = 0; i < items.length; i += chunkSize) {
    const batch = items.slice(i, i + chunkSize)
    const result = await processor(batch)
    results.push(result)
    onProgress?.(Math.min(i + chunkSize, items.length), items.length)
  }
  
  return results
}
```

### Task 4.2: Update sync.ts to Import Shared Utility

File: `src/lib/commands/handlers/sync.ts`

```typescript
// Remove local definition of processWithConcurrency and CONCURRENT_UPLOADS
// Replace with import:
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'

// Update usage:
const results = await processWithConcurrency(filesToSync, CONCURRENT_OPERATIONS, async (file) => {
  // ...
})
```

### Task 4.3: Update mutations.ts Folder Update to Use Batching

File: `src/lib/supabase/files/mutations.ts`, function `updateFolderPath`

**Before (sequential):**
```typescript
for (const file of files) {
  const { error } = await client.from('files').update({...}).eq('id', file.id)
  if (!error) updated++
}
```

**After (batched with concurrency):**
```typescript
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'

// Process updates with bounded concurrency
const results = await processWithConcurrency(files, CONCURRENT_OPERATIONS, async (file) => {
  const newFilePath = file.file_path.replace(oldFolderPath, newFolderPath)
  const { error } = await client.from('files').update({
    file_path: newFilePath,
    updated_at: new Date().toISOString()
  }).eq('id', file.id)
  return !error
})

const updated = results.filter(Boolean).length
```

### Task 4.4: Consolidate getFileTypeFromExtension

Currently exists in:
- `src/lib/supabase/files/mutations.ts` (lines 9-65)
- `api/utils/files.ts`

**Option A:** Keep both (API and frontend have separate deployments)
**Option B:** Extract to shared types package (if one exists)

Recommendation: Keep both for now (separate deployments), but ensure they're identical.

Verify the two implementations match. If they differ, reconcile to use the more complete version.

### Task 4.5: Verify CHUNK_SIZE Consistency in trash.ts

File: `src/lib/supabase/files/trash.ts`

Verify `CHUNK_SIZE = 100` matches `BATCH_CHUNK_SIZE` from the new concurrency utility.

### Task 4.6: Run Final Type Check and Lint

```bash
npm run typecheck
npm run lint
```

Fix any issues introduced by all agents.

## Completion Report

Create `AGENT4_UTILITIES_REPORT.md`:

```markdown
# Agent 4: Shared Utilities and Final Cleanup Report

## Status: COMPLETE / INCOMPLETE

## Changes Made:
- [ ] Created src/lib/concurrency.ts with shared utilities
- [ ] Updated sync.ts to use shared concurrency utility
- [ ] Updated mutations.ts updateFolderPath to use batched concurrency
- [ ] Verified getFileTypeFromExtension consistency
- [ ] Verified CHUNK_SIZE consistency in trash.ts
- [ ] Ran final typecheck - PASS / [ N errors ]

## New Shared Utilities:
| Export | Value | Purpose |
|--------|-------|---------|
| CONCURRENT_OPERATIONS | 20 | Max concurrent Supabase operations |
| BATCH_CHUNK_SIZE | 100 | Batch size for bulk DB operations |
| processWithConcurrency | function | Bounded parallel processing |
| processBatched | function | Chunked sequential processing |

## Files Created:
- src/lib/concurrency.ts

## Files Modified:
- src/lib/commands/handlers/sync.ts
- src/lib/supabase/files/mutations.ts
- ...

## Consistency Verification:
- [ ] All command handlers use CONCURRENT_OPERATIONS = 20
- [ ] All batch deletes use BATCH_CHUNK_SIZE = 100
- [ ] getFileTypeFromExtension identical in frontend and API

## Testing Notes:
1. Test folder rename with 100+ files
2. Verify no regression in sync performance
3. Run full typecheck

## Blockers:
- None / List any issues
```

---

# Post-Execution: Coordinator Review

After all agents complete:

## 1. Collect All Reports

- `AGENT1_API_REPORT.md`
- `AGENT2_FILESERVICE_REPORT.md`
- `AGENT3_COMMANDS_REPORT.md`
- `AGENT4_UTILITIES_REPORT.md`

## 2. Run Final Verification

```bash
npm run typecheck
npm run lint
npm run build
```

## 3. Test Critical Paths

| Test | Expected Result |
|------|-----------------|
| Checkout race (2 users, same file) | Second user gets clear error |
| Checkin with content | Version increments, content stored |
| Sync 50 files | Processes in waves of 20 |
| Delete 200 files | Processes in batches of 100 |
| Folder rename (100 files) | Completes without timeout |

## 4. Delete Redundant Files

If all callers updated:
- Delete `src/lib/fileService.ts` (if fully deprecated)
- Remove any dead code identified

## 5. Update Documentation

- Update any developer docs mentioning fileService.ts
- Document the concurrency standards

---

# Summary: Key Architectural Decisions

1. **Atomic Operations**: All checkout/checkin use PostgreSQL RPCs with FOR UPDATE locks
2. **Concurrency Standard**: 20 concurrent operations max for Supabase
3. **Batch Standard**: 100 items per batch for bulk DB operations
4. **Activity Logging**: Handled by RPCs, not application code
5. **Single Source of Truth**: `src/lib/supabase/files/` is the canonical file operations layer
