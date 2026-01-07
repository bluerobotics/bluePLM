# File Operations Architecture Refactor v2 - Parallel Agent Plan (REVISED)

## Executive Summary

This is the second pass refactoring after the first pass (Agents 1-5) completed the `src/lib/supabase/files/` reorganization and created atomic RPCs. Critical gap identified: **`checkinFile` still doesn't use the atomic RPC**.

**Revision Notes:** This plan has been revised to fix gaps in the original plan:

- Extended RPC recommendation for custom_properties (config metadata)
- Simplified Agent 2 scope (only 2 callers exist)
- Removed unnecessary import updates from Agent 3
- Added proper API route guidance for storage/webhooks
- Added `syncSolidWorksFileMetadata` to Agent 4 scope

---

## Current State Analysis

### What First Pass Completed

| Component | Status | Notes |

|-----------|--------|-------|

| `checkout_file` RPC | DONE | Atomic with FOR UPDATE lock + activity logging |

| `checkin_file` RPC | DONE | Atomic with version logic + activity logging |

| `src/lib/supabase/files/checkout.ts::checkoutFile` | PARTIAL | Uses RPC but has DUPLICATE activity logging |

| `src/lib/supabase/files/checkout.ts::checkinFile` | **NOT DONE** | Still has manual logic, doesn't use RPC |

| `src/lib/supabase/files/checkout.ts::syncSolidWorksFileMetadata` | **NOT DONE** | Manual version logic + activity logging |

| `api/routes/files.ts` checkout/checkin | NOT DONE | Race conditions remain |

| `src/lib/fileService.ts` | NOT DONE | Still exists, duplicates logic |

### Critical Gap: checkinFile Doesn't Use RPC

The `checkinFile` function (src/lib/supabase/files/checkout.ts lines 70-289) still has:

- Manual version increment logic (lines 185-256)
- Separate queries for version history lookup
- Manual file_versions insert
- Manual activity logging (lines 270-287) - **DUPLICATES RPC logging**

The `checkin_file` RPC already handles all of this atomically:

- Content/metadata/version-switch detection
- Version increment calculation
- file_versions record creation
- Activity logging (including revision_change)

### Activity Logging Duplication

| Location | Logs Activity | Result |

|----------|--------------|--------|

| `checkout_file` RPC (SQL) | Yes (lines 1952-1964) | Good |

| `checkoutFile` (TypeScript) | Yes (lines 53-65) | **DUPLICATE - REMOVE** |

| `checkin_file` RPC (SQL) | Yes (lines 2069-2100) | Good |

| `checkinFile` (TypeScript) | Yes (lines 270-287) | **DUPLICATE - REMOVE** |

| `syncSolidWorksFileMetadata` (TypeScript) | Yes (lines 397-414) | **No RPC - needs fix** |

---

## Architecture Decisions

### Decision 1: Extend RPC for Custom Properties

The current `checkin_file` RPC lacks support for `config_tabs` and `config_descriptions` (stored in `custom_properties` JSONB field).

**Decision:** Extend the RPC with a `p_custom_properties JSONB DEFAULT NULL` parameter.

**Rationale:**

- Atomicity: All changes in one transaction
- Simpler client code
- Consistent with enterprise patterns (single source of truth for business logic)

### Decision 2: Webhooks Remain in API Layer

**Decision:** RPCs handle data integrity and audit logging. API routes handle external integrations (webhooks).

**Rationale:**

- Separation of concerns: Database handles data, application handles side effects
- Webhooks are HTTP calls that shouldn't run inside DB transactions
- Easier to test and modify webhook logic without DB migrations

### Decision 3: Breaking Changes Acceptable

This is a 3.0 release. No backward compatibility required with old app versions.

---

## Parallel Agent Execution Plan

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              PARALLEL EXECUTION                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │     AGENT 1      │  │     AGENT 2      │  │     AGENT 3      │              │
│  │   API Routes     │  │  fileService.ts  │  │   Concurrency    │              │
│  │    Refactor      │  │    Cleanup       │  │    Utilities     │              │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘              │
│         │                      │                      │                        │
│         │                      │                      │                        │
│  ┌──────┴──────────────────────┴──────────────────────┴──────┐                 │
│  │                          AGENT 4                          │                 │
│  │     Supabase Layer Fix + RPC Extension + Final Cleanup    │                 │
│  │  (CRITICAL: checkinFile + syncSolidWorksFileMetadata)     │                 │
│  └───────────────────────────────────────────────────────────┘                 │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Maximum Parallel Agents: 4**

---

# AGENT 1: API Routes Refactor

## Priority: Run in parallel

## Scope

**Files to MODIFY:**

- `api/routes/files.ts`

**Files NOT to touch:**

- Anything in `src/lib/`

## Tasks

### Task 1.1: Update Checkout Route to Use Atomic RPC

File: `api/routes/files.ts`, POST /files/:id/checkout (lines ~103-179)

**Current code has race condition:**

```typescript
// 1. Fetch and check (TIME GAP HERE)
const { data: file } = await request.supabase!.from('files').select(...).single()
if (file.checked_out_by) { return error }
// 2. Update (race window!)
await request.supabase!.from('files').update({...})
```

**Replace with atomic RPC:**

```typescript
const { data, error } = await request.supabase!.rpc('checkout_file', {
  p_file_id: id,
  p_user_id: request.user!.id,
  p_machine_id: null,
  p_machine_name: 'API',
  p_lock_message: message || null
})

if (error) throw error
const result = data as { success: boolean; error?: string; file?: any }
if (!result.success) {
  return sendError(reply, 409, 'Checkout failed', result.error || 'Unknown error')
}

// RPC handles activity logging - DO NOT add manual logging here
// BUT keep the webhook trigger - webhooks are API layer responsibility
await triggerWebhooks(request.user!.org_id!, 'file.checkout', {
  file_id: id,
  file_path: result.file.file_path,
  file_name: result.file.file_name,
  user_id: request.user!.id,
  user_email: request.user!.email
}, fastify.log)

return { success: true, file: result.file }
```

**Key changes:**

- Remove manual activity logging (lines ~161-167) - RPC handles it
- KEEP webhook triggers - webhooks are API responsibility

### Task 1.2: Update Checkin Route to Use Atomic RPC

File: `api/routes/files.ts`, POST /files/:id/checkin (lines ~181-310)

**IMPORTANT:** The checkin route handles storage uploads. The sequence must be:

1. Upload content to storage (if provided)
2. Call atomic RPC with new hash
3. Trigger webhooks

**Replace with:**

```typescript
// Step 1: Handle content upload FIRST (before RPC)
let newHash = content_hash
let newSize = file_size

if (content) {
  const binaryContent = Buffer.from(content, 'base64')
  newHash = computeHash(binaryContent)
  newSize = binaryContent.length
  const storagePath = `${request.user!.org_id}/${newHash.substring(0, 2)}/${newHash}`
  
  const { error: uploadError } = await request.supabase!.storage
    .from('vault')
    .upload(storagePath, binaryContent, {
      contentType: 'application/octet-stream',
      upsert: false
    })
  
  // Ignore "already exists" - content-addressable storage deduplicates
  if (uploadError && !uploadError.message.includes('already exists')) {
    throw uploadError
  }
}

// Step 2: Call atomic RPC
const { data, error } = await request.supabase!.rpc('checkin_file', {
  p_file_id: id,
  p_user_id: request.user!.id,
  p_new_content_hash: newHash || null,
  p_new_file_size: newSize || null,
  p_comment: comment || null,
  p_part_number: null,
  p_description: null,
  p_revision: null,
  p_local_active_version: null
})

if (error) throw error
const result = data as { 
  success: boolean
  error?: string
  file?: any
  content_changed?: boolean
  version_incremented?: boolean
}

if (!result.success) {
  return sendError(reply, 409, 'Checkin failed', result.error || 'Unknown error')
}

// Step 3: Trigger webhooks (API layer responsibility)
// RPC handles activity logging - DO NOT duplicate

if (result.version_incremented) {
  await triggerWebhooks(request.user!.org_id!, 'file.version', {
    file_id: id,
    file_path: result.file.file_path,
    file_name: result.file.file_name,
    version: result.file.version,
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
  content_changed: result.content_changed
}, fastify.log)

return { success: true, file: result.file, contentChanged: result.content_changed }
```

### Task 1.3: Remove Manual Activity Logging

Remove these lines since RPCs handle activity logging:

- Lines ~161-167 (checkout activity insert)
- Lines ~291-298 (checkin activity insert)

**DO NOT remove webhook triggers** - those must stay.

## Completion Report

Create `AGENT1_API_REPORT.md`:

```markdown
# Agent 1: API Routes Refactor Report

## Status: COMPLETE / INCOMPLETE

## Changes Made:
- [ ] POST /files/:id/checkout uses checkout_file RPC
- [ ] POST /files/:id/checkin uses checkin_file RPC
- [ ] Removed manual activity logging (RPCs handle it)
- [ ] Preserved webhook triggers (API layer responsibility)
- [ ] Storage upload still happens before RPC call

## Race Conditions Fixed:
- Checkout: Now atomic via RPC
- Checkin: Now atomic via RPC

## Files Modified:
- api/routes/files.ts

## Testing Notes:
1. Test concurrent checkout on same file - should fail for second user
2. Test checkin with/without content
3. Verify activity logs show single entry (not duplicate)
4. Verify webhooks still fire correctly
```

---

# AGENT 2: fileService.ts Cleanup (SIMPLIFIED)

## Priority: Run in parallel

## Scope

**Actual callers (only 2!):**

- `src/features/source/details/DetailsPanel.tsx` → imports `rollbackToVersion`
- `src/lib/commands/handlers/backupOps.ts` → imports `rollbackToVersion`

**Files to MODIFY:**

- `src/lib/fileService.ts` (move functions, then delete)
- `src/lib/supabase/files/versions.ts` (create - new home for rollbackToVersion)
- `src/lib/supabase/files/index.ts` (add exports)
- `src/lib/supabase/index.ts` (add exports)
- The 2 callers above

**Files NOT to touch:**

- `api/` folder
- `src/lib/supabase/files/checkout.ts` (Agent 4's scope)

## Background

`src/lib/fileService.ts` contains these functions:

| Function | Callers | Action |

|----------|---------|--------|

| `checkoutFile` | **NONE** (all use supabase/files) | DELETE |

| `checkinFile` | **NONE** (all use supabase/files) | DELETE |

| `undoCheckout` | **NONE** | DELETE |

| `forceUnlock` | **NONE** | DELETE |

| `addFile` | **NONE** | DELETE |

| `getFileVersion` | **NONE** | DELETE |

| `getFileHistory` | **NONE** | DELETE |

| `rollbackToVersion` | 2 callers | MOVE to supabase/files/versions.ts |

| `transitionFileState` | **NONE** | MOVE (may be needed later) |

## Tasks

### Task 2.1: Create versions.ts Module

Create `src/lib/supabase/files/versions.ts`:

```typescript
/**
 * File Version Operations
 * 
 * Functions for version rollback, history, etc.
 */
import { getSupabaseClient } from '../client'
import { getCurrentUserEmail } from '../auth'

/**
 * Rollback file to a previous version (LOCAL ONLY)
 * Switches to a different version (rollback or roll forward)
 * Does NOT update the server - the server only updates on check-in
 * Returns the target version info so the caller can download the content
 */
export async function rollbackToVersion(
  fileId: string,
  userId: string,
  targetVersion: number,
  comment?: string
): Promise<{ success: boolean; targetVersionRecord?: any; maxVersion?: number; error?: string }> {
  const client = getSupabaseClient()
  
  // Get current file
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  // File must be checked out by user
  if (file.checked_out_by !== userId) {
    return { success: false, error: 'You must check out the file before switching versions' }
  }
  
  // Get target version
  const { data: targetVersionRecord, error: versionError } = await client
    .from('file_versions')
    .select('*')
    .eq('file_id', fileId)
    .eq('version', targetVersion)
    .single()
  
  if (versionError) {
    return { success: false, error: `Version ${targetVersion} not found` }
  }
  
  // Get max version for reference
  const { data: maxVersionData } = await client
    .from('file_versions')
    .select('version')
    .eq('file_id', fileId)
    .order('version', { ascending: false })
    .limit(1)
    .single()
  
  const maxVersion = maxVersionData?.version || file.version
  
  // Log activity (fire-and-forget)
  const isRollback = targetVersion < file.version
  getCurrentUserEmail().then(userEmail => {
    client.from('activity').insert({
      org_id: file.org_id,
      file_id: fileId,
      user_id: userId,
      user_email: userEmail,
      action: 'revision_change',
      details: { 
        version_action: isRollback ? 'rollback' : 'roll_forward',
        from_version: file.version, 
        to_version: targetVersion,
        comment: comment || null
      }
    })
  })
  
  return { success: true, targetVersionRecord, maxVersion }
}

/**
 * Transition file to a new workflow state
 */
export async function transitionFileState(
  fileId: string,
  userId: string,
  targetStateId: string,
  options: {
    incrementRevision?: boolean
    comment?: string
  } = {}
): Promise<{ success: boolean; file?: any; error?: string }> {
  const client = getSupabaseClient()
  
  // Implementation from fileService.ts...
  // (Copy the full implementation from src/lib/fileService.ts lines 450-520)
  
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('*, workflow_state:workflow_states(*)')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  const { data: targetState, error: targetError } = await client
    .from('workflow_states')
    .select('*')
    .eq('id', targetStateId)
    .single()
  
  if (targetError || !targetState) {
    return { success: false, error: 'Target state not found' }
  }
  
  // Calculate new revision if auto-increment is enabled
  const { getNextRevision } = await import('../../../types/pdm')
  const shouldIncrementRevision = options.incrementRevision || targetState.auto_increment_revision
  const newRevision = shouldIncrementRevision 
    ? getNextRevision(file.revision, 'letter')
    : file.revision
  
  const { data: updated, error: updateError } = await client
    .from('files')
    .update({
      workflow_state_id: targetStateId,
      state_changed_at: new Date().toISOString(),
      state_changed_by: userId,
      revision: newRevision,
      updated_at: new Date().toISOString(),
      updated_by: userId
    })
    .eq('id', fileId)
    .select('*, workflow_state:workflow_states(*)')
    .single()
  
  if (updateError) {
    return { success: false, error: updateError.message }
  }
  
  return { success: true, file: updated }
}
```

### Task 2.2: Update Barrel Exports

Add to `src/lib/supabase/files/index.ts`:

```typescript
// Version functions
export {
  rollbackToVersion,
  transitionFileState
} from './versions'
```

Add to `src/lib/supabase/index.ts`:

```typescript
export {
  rollbackToVersion,
  transitionFileState
} from './files'
```

### Task 2.3: Update Callers (Only 2!)

**File 1:** `src/features/source/details/DetailsPanel.tsx`

Change:

```typescript
import { rollbackToVersion } from '@/lib/fileService'
```

To:

```typescript
import { rollbackToVersion } from '@/lib/supabase'
```

**File 2:** `src/lib/commands/handlers/backupOps.ts`

Change:

```typescript
import { rollbackToVersion } from '../../fileService'
```

To:

```typescript
import { rollbackToVersion } from '../../supabase'
```

### Task 2.4: Delete fileService.ts

After verifying the 2 callers work:

```powershell
Remove-Item -Path "src/lib/fileService.ts"
```

## Completion Report

Create `AGENT2_FILESERVICE_REPORT.md`:

```markdown
# Agent 2: fileService.ts Cleanup Report

## Status: COMPLETE / INCOMPLETE

## Changes Made:
- [ ] Created src/lib/supabase/files/versions.ts
- [ ] Moved rollbackToVersion function
- [ ] Moved transitionFileState function  
- [ ] Updated barrel exports
- [ ] Updated 2 callers to use new import path
- [ ] Deleted src/lib/fileService.ts

## Callers Updated:
- src/features/source/details/DetailsPanel.tsx
- src/lib/commands/handlers/backupOps.ts

## Files Created:
- src/lib/supabase/files/versions.ts

## Files Deleted:
- src/lib/fileService.ts

## Testing Notes:
1. Test version rollback from file details panel
2. Test backup operations that use rollbackToVersion
```

---

# AGENT 3: Concurrency Utilities

## Priority: Run in parallel

## Scope

**Files to CREATE:**

- `src/lib/concurrency.ts`

**Files to MODIFY:**

- `src/lib/commands/handlers/sync.ts` (update import)
- `src/lib/commands/handlers/checkout.ts` (add concurrency limiting)
- `src/lib/commands/handlers/checkin.ts` (add concurrency limiting)
- `src/lib/commands/handlers/getLatest.ts` (add concurrency limiting)

**Files NOT to touch:**

- `api/` folder
- `src/lib/supabase/` (Agent 4's scope)
- `src/lib/fileService.ts` (Agent 2's scope)

## NOTE: Import Paths Are Already Correct

All command handlers already import from the correct location:

- `checkout.ts` → `import { checkoutFile } from '../../supabase'`
- `checkin.ts` → `import { checkinFile } from '../../supabase'`

**DO NOT change these imports** - they're already using the barrel export.

## Tasks

### Task 3.1: Create Shared Concurrency Utility

Create `src/lib/concurrency.ts`:

```typescript
/**
 * Concurrency Utilities for BluePLM
 * 
 * Provides controlled parallel execution to prevent overwhelming
 * the server or network with too many simultaneous requests.
 */

/** Default number of concurrent operations for file operations */
export const CONCURRENT_OPERATIONS = 20

/** Default batch size for bulk database operations */
export const BATCH_CHUNK_SIZE = 100

/**
 * Process items with limited concurrency using a worker pool pattern.
 * 
 * @param items - Array of items to process
 * @param maxConcurrent - Maximum number of concurrent operations
 * @param processor - Async function to process each item
 * @returns Array of results in the same order as input items
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
  
  // Create worker pool - min of maxConcurrent and items.length
  const workerCount = Math.min(maxConcurrent, items.length)
  await Promise.all(
    Array.from({ length: workerCount }, () => worker())
  )
  
  return results
}

/**
 * Split an array into chunks for batch processing
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
```

### Task 3.2: Update sync.ts to Import Shared Utility

Replace local definition with import in `src/lib/commands/handlers/sync.ts`:

Find and remove the local `processWithConcurrency` function (around line 237-251).

Add import at top:

```typescript
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'
```

Update usage (around line 388):

```typescript
const results = await processWithConcurrency(filesToSync, CONCURRENT_OPERATIONS, async (file) => {
```

### Task 3.3: Add Concurrency Limiting to checkout.ts

File: `src/lib/commands/handlers/checkout.ts`, around line 262

Replace:

```typescript
const results = await Promise.all(filesToCheckout.map(async (file) => {...}))
```

With:

```typescript
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'
// ... at top of file

const results = await processWithConcurrency(filesToCheckout, CONCURRENT_OPERATIONS, async (file) => {
  // ... existing file processing logic
})
```

### Task 3.4: Add Concurrency Limiting to checkin.ts

File: `src/lib/commands/handlers/checkin.ts`, around line 452

Replace:

```typescript
const results = await Promise.all(filesToCheckin.map(async (file) => {...}))
```

With:

```typescript
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'
// ... at top of file

const results = await processWithConcurrency(filesToCheckin, CONCURRENT_OPERATIONS, async (file) => {
  // ... existing file processing logic
})
```

### Task 3.5: Add Concurrency Limiting to getLatest.ts

Similar refactor if it uses unbounded Promise.all for file operations.

## Completion Report

Create `AGENT3_CONCURRENCY_REPORT.md`:

```markdown
# Agent 3: Concurrency Utilities Report

## Status: COMPLETE / INCOMPLETE

## Changes Made:
- [ ] Created src/lib/concurrency.ts
- [ ] Updated sync.ts to use shared utility
- [ ] Added concurrency limiting to checkout.ts
- [ ] Added concurrency limiting to checkin.ts
- [ ] Added concurrency limiting to getLatest.ts (if applicable)

## Files Created:
- src/lib/concurrency.ts

## Files Modified:
- src/lib/commands/handlers/sync.ts
- src/lib/commands/handlers/checkout.ts
- src/lib/commands/handlers/checkin.ts
- src/lib/commands/handlers/getLatest.ts

## Concurrency Settings:
- CONCURRENT_OPERATIONS = 20
- BATCH_CHUNK_SIZE = 100

## Testing Notes:
1. Test bulk checkout of 100+ files - should not overwhelm server
2. Test bulk checkin of 100+ files
3. Verify operations complete in reasonable time
```

---

# AGENT 4: Supabase Layer Fix + RPC Extension (CRITICAL)

## Priority: Run in parallel, finish last for final verification

## CRITICAL SCOPE

**SQL to MODIFY:**

- `supabase/modules/10-source-files.sql` - Extend `checkin_file` RPC

**TypeScript to MODIFY:**

- `src/lib/supabase/files/checkout.ts` - Fix checkinFile AND checkoutFile AND syncSolidWorksFileMetadata

**Files NOT to touch:**

- `api/` folder (Agent 1's scope)
- `src/lib/fileService.ts` (Agent 2's scope)
- `src/lib/commands/` (Agent 3's scope)

---

## Task 4.0: Extend checkin_file RPC for Custom Properties

File: `supabase/modules/10-source-files.sql`

Add `p_custom_properties` parameter to the RPC to support config_tabs and config_descriptions:

Find the `checkin_file` function (around line 1975) and modify:

```sql
CREATE OR REPLACE FUNCTION checkin_file(
  p_file_id UUID,
  p_user_id UUID,
  p_new_content_hash TEXT DEFAULT NULL,
  p_new_file_size BIGINT DEFAULT NULL,
  p_comment TEXT DEFAULT NULL,
  p_part_number TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_revision TEXT DEFAULT NULL,
  p_local_active_version INT DEFAULT NULL,
  p_custom_properties JSONB DEFAULT NULL  -- NEW: For config_tabs, config_descriptions, etc.
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_file RECORD;
  v_new_version INT;
  v_content_changed BOOLEAN;
  v_metadata_changed BOOLEAN;
  v_version_switched BOOLEAN;
  v_should_increment BOOLEAN;
  v_max_version INT;
  v_result JSONB;
  v_user_email TEXT;
  v_merged_custom_props JSONB;  -- NEW
BEGIN
  -- Lock and verify ownership
  SELECT * INTO v_file
  FROM files
  WHERE id = p_file_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'File not found');
  END IF;
  
  IF v_file.checked_out_by IS NULL OR v_file.checked_out_by != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not have this file checked out');
  END IF;
  
  -- Determine what changed
  v_content_changed := (p_new_content_hash IS NOT NULL AND p_new_content_hash != COALESCE(v_file.content_hash, ''));
  
  v_metadata_changed := (
    (p_part_number IS NOT NULL AND p_part_number IS DISTINCT FROM v_file.part_number) OR
    (p_description IS NOT NULL AND p_description IS DISTINCT FROM v_file.description) OR
    (p_revision IS NOT NULL AND p_revision IS DISTINCT FROM v_file.revision) OR
    (p_custom_properties IS NOT NULL)  -- NEW: custom_properties change triggers version
  );
  
  v_version_switched := (p_local_active_version IS NOT NULL AND p_local_active_version != v_file.version);
  
  v_should_increment := v_content_changed OR v_metadata_changed OR v_version_switched;
  
  -- Merge custom properties if provided
  IF p_custom_properties IS NOT NULL THEN
    v_merged_custom_props := COALESCE(v_file.custom_properties, '{}'::jsonb) || p_custom_properties;
  ELSE
    v_merged_custom_props := v_file.custom_properties;
  END IF;
  
  -- Calculate new version only if needed
  IF v_should_increment THEN
    SELECT COALESCE(MAX(version), v_file.version) + 1 INTO v_new_version
    FROM file_versions WHERE file_id = p_file_id;
  ELSE
    v_new_version := v_file.version;
  END IF;
  
  -- Update file
  UPDATE files SET
    checked_out_by = NULL,
    checked_out_at = NULL,
    lock_message = NULL,
    checked_out_by_machine_id = NULL,
    checked_out_by_machine_name = NULL,
    content_hash = COALESCE(p_new_content_hash, content_hash),
    file_size = COALESCE(p_new_file_size, file_size),
    part_number = COALESCE(p_part_number, part_number),
    description = COALESCE(p_description, description),
    revision = COALESCE(p_revision, revision),
    custom_properties = v_merged_custom_props,  -- NEW
    version = v_new_version,
    updated_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_file_id;
  
  -- Create version record ONLY if version incremented
  IF v_should_increment THEN
    INSERT INTO file_versions (file_id, version, revision, content_hash, file_size, workflow_state_id, state, created_by, comment)
    SELECT p_file_id, v_new_version, 
           COALESCE(p_revision, v_file.revision),
           COALESCE(p_new_content_hash, v_file.content_hash),
           COALESCE(p_new_file_size, v_file.file_size),
           v_file.workflow_state_id,
           COALESCE(v_file.state, 'not_tracked'), 
           p_user_id, 
           p_comment;
  END IF;
  
  -- Log activity
  SELECT email INTO v_user_email FROM users WHERE id = p_user_id;
  
  INSERT INTO activity (org_id, file_id, user_id, user_email, action, details)
  VALUES (
    v_file.org_id, 
    p_file_id, 
    p_user_id, 
    COALESCE(v_user_email, 'unknown'),
    'checkin',
    jsonb_build_object(
      'content_changed', v_content_changed,
      'metadata_changed', v_metadata_changed,
      'version_incremented', v_should_increment,
      'old_version', v_file.version,
      'new_version', v_new_version,
      'comment', p_comment
    )
  );
  
  -- Log revision change separately if revision changed
  IF p_revision IS NOT NULL AND p_revision IS DISTINCT FROM v_file.revision THEN
    INSERT INTO activity (org_id, file_id, user_id, user_email, action, details)
    VALUES (
      v_file.org_id, 
      p_file_id, 
      p_user_id, 
      COALESCE(v_user_email, 'unknown'),
      'revision_change',
      jsonb_build_object('from', v_file.revision, 'to', p_revision)
    );
  END IF;
  
  -- Return result
  SELECT jsonb_build_object(
    'success', true, 
    'file', row_to_json(f.*), 
    'new_version', v_new_version,
    'content_changed', v_content_changed,
    'metadata_changed', v_metadata_changed,
    'version_incremented', v_should_increment
  )
  INTO v_result
  FROM files f WHERE f.id = p_file_id;
  
  RETURN v_result;
END;
$$;

-- Update grant for new signature
GRANT EXECUTE ON FUNCTION checkin_file(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, INT, JSONB) TO authenticated;
```

**IMPORTANT:** Also update schema version after SQL changes:

- `supabase/schema.sql` → bump INSERT version
- `src/lib/schemaVersion.ts` → bump EXPECTED_SCHEMA_VERSION

---

## Task 4.1: Fix checkinFile to Use Atomic RPC (CRITICAL)

File: `src/lib/supabase/files/checkout.ts`, function `checkinFile` (lines 70-289)

**Replace the ENTIRE function with:**

```typescript
export async function checkinFile(
  fileId: string, 
  userId: string, 
  options?: {
    newContentHash?: string
    newFileSize?: number
    comment?: string
    newFilePath?: string  // For moved files - update the server path
    newFileName?: string  // For renamed files - update the server name
    localActiveVersion?: number  // If user rolled to a different version locally
    pendingMetadata?: {
      part_number?: string | null
      description?: string | null
      revision?: string
      config_tabs?: Record<string, string>
      config_descriptions?: Record<string, string>
    }
  }
): Promise<{ 
  success: boolean
  file?: any
  error?: string | null
  contentChanged?: boolean
  metadataChanged?: boolean
  machineMismatchWarning?: string | null 
}> {
  const client = getSupabaseClient()
  
  // Quick fetch for machine mismatch warning (doesn't need to be in RPC)
  const { data: fileCheck, error: fetchError } = await client
    .from('files')
    .select('checked_out_by_machine_id, checked_out_by_machine_name')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  // Check for machine mismatch warning
  let machineMismatchWarning: string | null = null
  if (fileCheck.checked_out_by_machine_id) {
    const { getMachineId } = await import('../../backup')
    const currentMachineId = await getMachineId()
    if (fileCheck.checked_out_by_machine_id !== currentMachineId) {
      machineMismatchWarning = `Warning: This file was checked out on ${fileCheck.checked_out_by_machine_name || 'another computer'}. You are checking it in from a different computer.`
    }
  }
  
  // Handle file path/name updates separately (RPC doesn't handle these)
  // This is intentional - path changes are a separate concern from checkin
  if (options?.newFilePath || options?.newFileName) {
    const pathUpdate: Record<string, any> = {}
    if (options.newFilePath) pathUpdate.file_path = options.newFilePath
    if (options.newFileName) pathUpdate.file_name = options.newFileName
    
    const { error: pathError } = await client
      .from('files')
      .update(pathUpdate)
      .eq('id', fileId)
    
    if (pathError) {
      console.warn('[Checkin] Failed to update file path:', pathError.message)
      // Continue with checkin - path update failure shouldn't block
    }
  }
  
  // Build custom_properties JSONB for config data
  let customPropsUpdate: Record<string, any> | null = null
  if (options?.pendingMetadata?.config_tabs || options?.pendingMetadata?.config_descriptions) {
    customPropsUpdate = {}
    if (options.pendingMetadata.config_tabs) {
      customPropsUpdate._config_tabs = options.pendingMetadata.config_tabs
    }
    if (options.pendingMetadata.config_descriptions) {
      customPropsUpdate._config_descriptions = options.pendingMetadata.config_descriptions
    }
  }
  
  // Use atomic RPC for checkin - handles versioning + activity logging
  const { data, error } = await client.rpc('checkin_file', {
    p_file_id: fileId,
    p_user_id: userId,
    p_new_content_hash: options?.newContentHash || null,
    p_new_file_size: options?.newFileSize || null,
    p_comment: options?.comment || null,
    p_part_number: options?.pendingMetadata?.part_number || null,
    p_description: options?.pendingMetadata?.description || null,
    p_revision: options?.pendingMetadata?.revision || null,
    p_local_active_version: options?.localActiveVersion || null,
    p_custom_properties: customPropsUpdate  // NEW parameter
  })
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  const result = data as { 
    success: boolean
    error?: string
    file?: any
    new_version?: number
    content_changed?: boolean
    metadata_changed?: boolean
    version_incremented?: boolean
  }
  
  if (!result.success) {
    return { success: false, error: result.error }
  }
  
  // DO NOT add manual activity logging - RPC handles it!
  
  return { 
    success: true, 
    file: result.file, 
    error: null, 
    contentChanged: result.content_changed,
    metadataChanged: result.metadata_changed,
    machineMismatchWarning 
  }
}
```

---

## Task 4.2: Remove Manual Activity Logging from checkoutFile

File: `src/lib/supabase/files/checkout.ts`, lines 53-65

**DELETE this entire block** (RPC already logs activity):

```typescript
// Log activity synchronously with try/catch
try {
  await client.from('activity').insert({
    org_id: result.file.org_id,
    file_id: fileId,
    user_id: userId,
    user_email: userEmail,
    action: 'checkout',
    details: options?.message ? { message: options.message } : {}
  })
} catch (activityError) {
  console.warn('[Checkout] Failed to log activity:', activityError)
}
```

---

## Task 4.3: Fix syncSolidWorksFileMetadata to Use RPC

File: `src/lib/supabase/files/checkout.ts`, function `syncSolidWorksFileMetadata` (lines 296-417)

This function also has manual version logic and activity logging. Convert it to use the checkin RPC pattern.

**Replace with RPC-based implementation:**

```typescript
/**
 * Sync SolidWorks file metadata and create a new version
 * This can be called without having the file checked out (for metadata-only updates from SW properties)
 * 
 * NOTE: Since this runs without checkout, we can't use the checkin_file RPC.
 * Instead, we use a dedicated RPC or manual logic with proper locking.
 * For now, keeping manual logic but ensuring proper error handling.
 */
export async function syncSolidWorksFileMetadata(
  fileId: string,
  userId: string,
  metadata: {
    part_number?: string | null
    description?: string | null
    revision?: string | null
    custom_properties?: Record<string, string | number | null>
  }
): Promise<{ success: boolean; file?: any; error?: string | null }> {
  const client = getSupabaseClient()
  
  // Get current file data with FOR UPDATE lock via RPC if available
  // For now, using regular fetch since this is a metadata-only operation
  const { data: file, error: fetchError } = await client
    .from('files')
    .select('*')
    .eq('id', fileId)
    .single()
  
  if (fetchError) {
    return { success: false, error: fetchError.message }
  }
  
  // Check if any metadata actually changed
  const partNumberChanged = metadata.part_number !== undefined && 
    (metadata.part_number || null) !== (file.part_number || null)
  const descriptionChanged = metadata.description !== undefined && 
    (metadata.description || null) !== (file.description || null)
  const revisionChanged = metadata.revision !== undefined && 
    (metadata.revision || null) !== (file.revision || null)
  const customPropsChanged = metadata.custom_properties !== undefined
  
  if (!partNumberChanged && !descriptionChanged && !revisionChanged && !customPropsChanged) {
    return { success: true, file, error: null }
  }
  
  // Build update data
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
    updated_by: userId
  }
  
  if (metadata.part_number !== undefined) {
    updateData.part_number = metadata.part_number
  }
  if (metadata.description !== undefined) {
    updateData.description = metadata.description
  }
  if (metadata.revision !== undefined && metadata.revision !== null) {
    updateData.revision = metadata.revision
  }
  if (metadata.custom_properties !== undefined) {
    updateData.custom_properties = metadata.custom_properties
  }
  
  // Create new version for metadata changes
  const { data: maxVersionData } = await client
    .from('file_versions')
    .select('version')
    .eq('file_id', fileId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  
  const maxVersionInHistory = maxVersionData?.version || file.version
  const newVersion = maxVersionInHistory + 1
  updateData.version = newVersion
  
  // Insert version record
  const { error: versionError } = await client.from('file_versions').insert({
    file_id: fileId,
    version: newVersion,
    revision: updateData.revision || file.revision || 'A',
    content_hash: file.content_hash || '',
    file_size: file.file_size,
    workflow_state_id: file.workflow_state_id,
    state: file.state || 'not_tracked',
    created_by: userId,
    comment: 'Metadata updated from SolidWorks file properties'
  })
  
  if (versionError) {
    return { success: false, error: `Failed to create version: ${versionError.message}` }
  }
  
  // Update file
  const { data, error } = await client
    .from('files')
    .update(updateData)
    .eq('id', fileId)
    .select()
    .single()
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  // Log activity
  const changedFields: string[] = []
  if (partNumberChanged) changedFields.push('part_number')
  if (descriptionChanged) changedFields.push('description')
  if (revisionChanged) changedFields.push('revision')
  if (customPropsChanged) changedFields.push('custom_properties')
  
  try {
    const userEmail = await getCurrentUserEmail()
    await client.from('activity').insert({
      org_id: file.org_id,
      file_id: fileId,
      user_id: userId,
      user_email: userEmail,
      action: 'checkin',
      details: { 
        metadataSync: true,
        changedFields,
        source: 'solidworks'
      }
    })
  } catch (activityError) {
    console.warn('[SyncMetadata] Failed to log activity:', activityError)
  }
  
  return { success: true, file: data, error: null }
}
```

**NOTE:** `syncSolidWorksFileMetadata` runs WITHOUT checkout, so it can't use `checkin_file` RPC (which requires checkout). Consider creating a separate `update_file_metadata` RPC in future if this becomes a race condition issue.

---

## Task 4.4: Final Type Check

```bash
npm run typecheck
```

Ensure no TypeScript errors after all changes.

---

## Completion Report

Create `AGENT4_SUPABASE_REPORT.md`:

```markdown
# Agent 4: Supabase Layer Fix + RPC Extension Report

## Status: COMPLETE / INCOMPLETE

## CRITICAL FIXES:
- [ ] Extended checkin_file RPC with p_custom_properties parameter
- [ ] Updated schema version (SQL + TypeScript)
- [ ] checkinFile now uses checkin_file RPC (NOT manual logic)
- [ ] Removed manual activity logging from checkoutFile
- [ ] Fixed syncSolidWorksFileMetadata activity logging

## RPC Changes:
- checkin_file: Added p_custom_properties JSONB DEFAULT NULL
- Updated GRANT for new function signature

## Activity Logging:
- Before: Double logging (RPC + TypeScript)
- After: Single logging (RPC only for checkout/checkin)
- Note: syncSolidWorksFileMetadata still logs manually (no checkout required)

## Files Modified:
- supabase/modules/10-source-files.sql
- supabase/schema.sql (version bump)
- src/lib/schemaVersion.ts (version bump)
- src/lib/supabase/files/checkout.ts

## Edge Cases Verified:
- [ ] discard.ts calls checkinFile with no params - should NOT create version
- [ ] checkinFile with only path change - should NOT create version
- [ ] checkinFile with metadata only - SHOULD create version

## Testing Notes:
1. Checkin file with content change - verify ONE activity entry
2. Checkin file with metadata only - verify ONE activity entry  
3. Checkout file - verify ONE activity entry (not two)
4. Discard changes - verify NO version created
5. Test config_tabs/config_descriptions survive checkin
```

---

# Post-Execution: Coordinator Review

## 1. Collect Reports

- AGENT1_API_REPORT.md
- AGENT2_FILESERVICE_REPORT.md
- AGENT3_CONCURRENCY_REPORT.md
- AGENT4_SUPABASE_REPORT.md

## 2. Verify Critical Fixes

- [ ] `checkinFile` uses `checkin_file` RPC
- [ ] No manual activity logging in TypeScript (except syncSolidWorksFileMetadata)
- [ ] API routes use atomic RPCs
- [ ] Webhooks still fire from API routes
- [ ] Schema version bumped

## 3. Run Final Verification

```bash
npm run typecheck
npm run lint
npm run build
```

## 4. Database Migration

Apply the SQL changes:

```bash
# Apply the updated RPC
psql -f supabase/modules/10-source-files.sql
```

Or if using Supabase CLI:

```bash
supabase db push
```

## 5. Test Activity Logging

Query the activity table after checkout/checkin - should see SINGLE entries, not duplicates:

```sql
SELECT file_id, action, created_at, details 
FROM activity 
WHERE file_id = 'YOUR_TEST_FILE_ID'
ORDER BY created_at DESC
LIMIT 10;
```

---

# Summary: Issues Fixed from Original Plan

| Issue | Original Plan | Fixed Plan |

|-------|---------------|------------|

| Missing config_tabs/config_descriptions | Not addressed | Extended RPC with p_custom_properties |

| fileService.ts "many callers" | Implied many | Clarified only 2 callers |

| Agent 3 "update imports" | Unnecessary task | Removed - imports already correct |

| API storage upload sequence | Not mentioned | Explicitly documented |

| API webhook responsibility | Not mentioned | Clarified - API layer responsibility |

| syncSolidWorksFileMetadata | Not mentioned | Added to Agent 4 scope |

| discard.ts edge case | Not mentioned | Added to testing notes |

## Key Architectural Decisions

1. **Atomic Operations**: All checkout/checkin MUST use PostgreSQL RPCs
2. **Single Activity Logging**: RPCs handle audit logging, TypeScript should NOT duplicate
3. **Webhook Responsibility**: API layer handles webhooks, RPCs handle data integrity
4. **Custom Properties**: Extended RPC supports config-specific metadata via JSONB merge
5. **Concurrency Standard**: 20 concurrent operations max (configurable)
6. **Batch Standard**: 100 items per batch for bulk DB operations