---
name: Supabase Folder Refactoring
overview: Parallel agent execution plan for refactoring src/lib/supabase folder. 4 agents with clear boundaries and dependencies.
todos:
  - id: agent1-database
    content: "AGENT 1: Database schema changes - RPC functions and partial index (RUNS FIRST)"
    status: pending
  - id: agent2-queries
    content: "AGENT 2: Extract 11 query functions to files/queries.ts, remove debug code"
    status: pending
  - id: agent3-checkout
    content: "AGENT 3: Extract 5 checkout functions to files/checkout.ts, use atomic RPC"
    status: pending
  - id: agent4-mutations
    content: "AGENT 4: Extract mutations to files/mutations.ts and trash to files/trash.ts"
    status: pending
---

# Supabase Folder Refactoring - Parallel Agent Execution Plan

## Execution Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXECUTION DEPENDENCY GRAPH                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐                                                          │
│   │   AGENT 1    │  ◄─── RUNS FIRST (blocking)                              │
│   │  Database    │       Other agents WAIT for this to complete             │
│   │   Schema     │                                                          │
│   └──────┬───────┘                                                          │
│          │                                                                  │
│          ▼                                                                  │
│   ┌──────────────────────────────────────────────────────────────────┐      │
│   │              AGENTS 2, 3, 4 RUN IN PARALLEL                      │      │
│   │                                                                  │      │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │      │
│   │  │   AGENT 2    │  │   AGENT 3    │  │   AGENT 4    │            │      │
│   │  │   Queries    │  │   Checkout   │  │  Mutations   │            │      │
│   │  │   Module     │  │   Module     │  │ + Trash      │            │      │
│   │  └──────────────┘  └──────────────┘  └──────────────┘            │      │
│   │                                                                  │      │
│   │  NO OVERLAP - Each agent owns specific functions                 │      │
│   └──────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# AGENT 1: Database Schema Changes

## Priority: RUNS FIRST (Blocking)

Other agents depend on the RPC functions created here. This agent must complete before Agents 2-4 begin.

## Scope

**Files to modify:**

- `supabase/modules/10-source-files.sql` (add new functions)
- Create new migration file if needed

**Files NOT to touch:**

- Any TypeScript files
- Any files in `src/`

## Tasks

### Task 1.1: Create Atomic Checkout RPC Function

Create a PostgreSQL function that atomically checks out a file:

```sql
-- Add to supabase/modules/10-source-files.sql

CREATE OR REPLACE FUNCTION checkout_file(
  p_file_id UUID,
  p_user_id UUID,
  p_machine_id TEXT DEFAULT NULL,
  p_machine_name TEXT DEFAULT NULL,
  p_lock_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_file RECORD;
  v_checked_out_user RECORD;
  v_result JSONB;
BEGIN
  -- Lock the row and check status atomically
  SELECT id, file_name, checked_out_by, org_id
  INTO v_file
  FROM files
  WHERE id = p_file_id
  FOR UPDATE;  -- Row-level lock prevents race conditions
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'File not found');
  END IF;
  
  -- Check if already checked out by someone else
  IF v_file.checked_out_by IS NOT NULL AND v_file.checked_out_by != p_user_id THEN
    -- Get the other user's info
    SELECT email, full_name INTO v_checked_out_user
    FROM users WHERE id = v_file.checked_out_by;
    
    RETURN jsonb_build_object(
      'success', false,
      'error', format('File is already checked out by %s', 
        COALESCE(v_checked_out_user.full_name, v_checked_out_user.email, 'another user'))
    );
  END IF;
  
  -- Perform the checkout
  UPDATE files
  SET 
    checked_out_by = p_user_id,
    checked_out_at = NOW(),
    lock_message = p_lock_message,
    checked_out_by_machine_id = p_machine_id,
    checked_out_by_machine_name = p_machine_name,
    updated_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_file_id;
  
  -- Return success with file data
  SELECT jsonb_build_object(
    'success', true,
    'file', row_to_json(f.*)
  ) INTO v_result
  FROM files f
  WHERE f.id = p_file_id;
  
  RETURN v_result;
END;
$$;
```

### Task 1.2: Create Partial Unique Index for Soft Deletes

Fix the unique constraint to exclude soft-deleted files:

```sql
-- Drop existing constraint if it exists
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_vault_id_file_path_key;

-- Create partial unique index (only for non-deleted files)
CREATE UNIQUE INDEX IF NOT EXISTS files_vault_path_unique_active 
ON files (vault_id, file_path) 
WHERE deleted_at IS NULL;
```

### Task 1.3: Create Atomic Checkin RPC Function (Optional Enhancement)

```sql
CREATE OR REPLACE FUNCTION checkin_file(
  p_file_id UUID,
  p_user_id UUID,
  p_new_content_hash TEXT DEFAULT NULL,
  p_new_file_size BIGINT DEFAULT NULL,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_file RECORD;
  v_new_version INT;
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
  
  -- Calculate new version
  SELECT COALESCE(MAX(version), v_file.version) + 1 INTO v_new_version
  FROM file_versions WHERE file_id = p_file_id;
  
  -- Update file
  UPDATE files SET
    checked_out_by = NULL,
    checked_out_at = NULL,
    lock_message = NULL,
    checked_out_by_machine_id = NULL,
    checked_out_by_machine_name = NULL,
    content_hash = COALESCE(p_new_content_hash, content_hash),
    file_size = COALESCE(p_new_file_size, file_size),
    version = v_new_version,
    updated_by = p_user_id,
    updated_at = NOW()
  WHERE id = p_file_id;
  
  -- Create version record
  INSERT INTO file_versions (file_id, version, revision, content_hash, file_size, state, created_by, comment)
  SELECT p_file_id, v_new_version, revision, 
         COALESCE(p_new_content_hash, content_hash),
         COALESCE(p_new_file_size, file_size),
         COALESCE(state, 'not_tracked'), p_user_id, p_comment
  FROM files WHERE id = p_file_id;
  
  -- Return updated file
  SELECT jsonb_build_object('success', true, 'file', row_to_json(f.*))
  INTO v_file
  FROM files f WHERE f.id = p_file_id;
  
  RETURN v_file;
END;
$$;
```

## Completion Report Template

When finished, create a file `AGENT1_REPORT.md` in the project root:

```markdown
# Agent 1 Completion Report

## Status: COMPLETE / INCOMPLETE

## Changes Made:
- [ ] Created checkout_file RPC function
- [ ] Created partial unique index files_vault_path_unique_active
- [ ] Created checkin_file RPC function (optional)

## Files Modified:
- supabase/modules/10-source-files.sql

## Migration Required:
- Yes/No - describe any migration steps

## Testing Notes:
- How to verify the functions work

## Blockers for Other Agents:
- None / List any issues
```

---

# AGENT 2: Query Functions Module

## Priority: Runs AFTER Agent 1 completes

## Scope

**Files to CREATE:**

- `src/lib/supabase/files/queries.ts`

**Files to MODIFY:**

- `src/lib/supabase/files.ts` (remove functions that are moved)
- `src/lib/supabase/index.ts` (update exports)

**Functions OWNED by this agent (DO NOT let other agents touch these):**

- `getFiles` (lines 12-64)
- `getFilesLightweight` (lines 72-190) - ALSO REMOVE DEBUG CODE
- `getCheckedOutUsers` (lines 196-244)
- `getUserBasicInfo` (lines 250-274)
- `getFile` (lines 276-290)
- `getFileByPath` (lines 292-302)
- `getFileVersions` (lines 308-320)
- `getWhereUsed` (lines 326-339)
- `getContains` (lines 341-354)
- `getMyCheckedOutFiles` (lines 360-369)
- `getAllCheckedOutFiles` (lines 371-384)

## Tasks

### Task 2.1: Create files/queries.ts

Create `src/lib/supabase/files/queries.ts` with the following structure:

```typescript
/**
 * File Query Operations
 * Read-only operations for fetching file data
 */

import { getSupabaseClient } from '../client'

// Move all the functions listed above here
// Keep exact same function signatures for compatibility
```

### Task 2.2: Remove Debug Code from getFilesLightweight

**CRITICAL:** Remove lines 81-119 from `getFilesLightweight`. This is the debug code:

```typescript
// DELETE THIS ENTIRE BLOCK (lines 81-119):
// DEBUG: First check what files exist for this vault (ignoring org_id AND deleted_at)
if (vaultId) {
  // Query WITHOUT deleted_at filter to see if files exist but are soft-deleted
  const { data: allVaultFiles, error: allErr } = await client
    .from('files')
    // ... all this debug code ...
}
```

### Task 2.3: Update Exports

In `src/lib/supabase/index.ts`, update the file exports section:

```typescript
// ============================================
// File exports (queries)
// ============================================
export {
  getFiles,
  getFilesLightweight,
  getCheckedOutUsers,
  getUserBasicInfo,
  getFile,
  getFileByPath,
  getFileVersions,
  getWhereUsed,
  getContains,
  getMyCheckedOutFiles,
  getAllCheckedOutFiles
} from './files/queries'
```

### Task 2.4: Create Barrel Export

Create `src/lib/supabase/files/index.ts`:

```typescript
// Barrel export for files module
export * from './queries'
// Other agents will add their exports here
```

## Completion Report Template

Create `AGENT2_REPORT.md`:

```markdown
# Agent 2 Completion Report

## Status: COMPLETE / INCOMPLETE

## Changes Made:
- [ ] Created src/lib/supabase/files/queries.ts
- [ ] Moved 11 query functions
- [ ] Removed debug code from getFilesLightweight (lines 81-119)
- [ ] Created src/lib/supabase/files/index.ts
- [ ] Updated src/lib/supabase/index.ts exports

## Functions Moved:
- getFiles
- getFilesLightweight (debug code removed)
- getCheckedOutUsers
- getUserBasicInfo
- getFile
- getFileByPath
- getFileVersions
- getWhereUsed
- getContains
- getMyCheckedOutFiles
- getAllCheckedOutFiles

## Breaking Changes:
- None expected - same exports from index.ts

## Test Commands:
- npm run typecheck
```

---

# AGENT 3: Checkout Module

## Priority: Runs AFTER Agent 1 completes, PARALLEL with Agents 2 and 4

## Scope

**Files to CREATE:**

- `src/lib/supabase/files/checkout.ts`

**Files to MODIFY:**

- `src/lib/supabase/files.ts` (remove functions that are moved)
- `src/lib/supabase/index.ts` (update exports)

**Functions OWNED by this agent (DO NOT let other agents touch these):**

- `checkoutFile` (lines 826-908) - REFACTOR to use new RPC
- `checkinFile` (lines 910-1132)
- `syncSolidWorksFileMetadata` (lines 1138-1260)
- `undoCheckout` (lines 1262-1300)
- `adminForceDiscardCheckout` (lines 1310-1389)

## Tasks

### Task 3.1: Create files/checkout.ts

Create `src/lib/supabase/files/checkout.ts`:

```typescript
/**
 * File Checkout/Checkin Operations
 * Lock management for file editing
 */

import { getSupabaseClient } from '../client'
import { getCurrentUserEmail } from '../auth'
import { withRetry } from '../../network'

// Move checkout-related functions here
```

### Task 3.2: Refactor checkoutFile to Use Atomic RPC

Replace the current non-atomic implementation with:

```typescript
export async function checkoutFile(
  fileId: string, 
  userId: string, 
  userEmail: string,
  options?: {
    message?: string
    machineId?: string
    machineName?: string
  }
) {
  const client = getSupabaseClient()
  
  // Use pre-computed values if provided, otherwise fetch
  let machineId = options?.machineId
  let machineName = options?.machineName
  if (!machineId || !machineName) {
    const { getMachineId, getMachineName } = await import('../backup')
    machineId = machineId || await getMachineId()
    machineName = machineName || await getMachineName()
  }
  
  // Use atomic RPC function (created by Agent 1)
  const { data, error } = await client.rpc('checkout_file', {
    p_file_id: fileId,
    p_user_id: userId,
    p_machine_id: machineId,
    p_machine_name: machineName,
    p_lock_message: options?.message || null
  })
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  const result = data as { success: boolean; error?: string; file?: any }
  
  if (!result.success) {
    return { success: false, error: result.error }
  }
  
  // Log activity (make synchronous for audit reliability)
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
    console.error('[Checkout] Failed to log activity:', activityError)
    // Don't fail the checkout if activity logging fails
  }
  
  return { success: true, file: result.file, error: null }
}
```

### Task 3.3: Fix Activity Logging

Change fire-and-forget patterns to synchronous with error handling:

**Before:**

```typescript
client.from('activity').insert({...}).then(({ error }) => {
  if (error) console.warn(...)
})
```

**After:**

```typescript
try {
  await client.from('activity').insert({...})
} catch (error) {
  console.error('[Checkout] Activity logging failed:', error)
  // Consider: queue for retry, or accept the loss
}
```

### Task 3.4: Update Exports

Add to `src/lib/supabase/files/index.ts`:

```typescript
export * from './checkout'
```

Update `src/lib/supabase/index.ts`:

```typescript
// ============================================
// File exports (checkout)
// ============================================
export {
  checkoutFile,
  checkinFile,
  syncSolidWorksFileMetadata,
  undoCheckout,
  adminForceDiscardCheckout
} from './files/checkout'
```

## Completion Report Template

Create `AGENT3_REPORT.md`:

```markdown
# Agent 3 Completion Report

## Status: COMPLETE / INCOMPLETE

## Changes Made:
- [ ] Created src/lib/supabase/files/checkout.ts
- [ ] Refactored checkoutFile to use atomic RPC
- [ ] Fixed fire-and-forget activity logging
- [ ] Moved 5 checkout-related functions
- [ ] Updated exports

## Functions Moved:
- checkoutFile (refactored to use RPC)
- checkinFile
- syncSolidWorksFileMetadata
- undoCheckout
- adminForceDiscardCheckout

## RPC Integration:
- Using checkout_file RPC: YES/NO
- Using checkin_file RPC: YES/NO (optional)

## Breaking Changes:
- None expected

## Test Commands:
- npm run typecheck
- Manual test: checkout a file with two users simultaneously
```

---

# AGENT 4: Mutations and Trash Module

## Priority: Runs AFTER Agent 1 completes, PARALLEL with Agents 2 and 3

## Scope

**Files to CREATE:**

- `src/lib/supabase/files/mutations.ts`
- `src/lib/supabase/files/trash.ts`

**Files to MODIFY:**

- `src/lib/supabase/files.ts` (remove functions that are moved)
- `src/lib/supabase/index.ts` (update exports)

**Functions OWNED by this agent (DO NOT let other agents touch these):**

**For mutations.ts:**

- `getFileTypeFromExtension` (lines 390-446) - helper function
- `dbWithRetry` (lines 450-481) - helper function
- `syncFile` (lines 483-820)
- `updateFileMetadata` (lines 1395-1458)
- `updateFilePath` (lines 1460-1485)
- `updateFolderPath` (lines 1487-1526)

**For trash.ts:**

- `softDeleteFile` (lines 1535-1587)
- `softDeleteFiles` (lines 1592-1611)
- `restoreFile` (lines 1616-1686)
- `restoreFiles` (lines 1691-1710)
- `permanentlyDeleteFile` (lines 1716-1774)
- `permanentlyDeleteFiles` (lines 1781-1905)
- `getDeletedFiles` (lines 1912-1973)
- `getDeletedFilesCount` (lines 1979-2009)
- `emptyTrash` (lines 2017-2054)

## Tasks

### Task 4.1: Create files/mutations.ts

Create `src/lib/supabase/files/mutations.ts`:

```typescript
/**
 * File Mutation Operations
 * Create/update operations for files
 */

import { getSupabaseClient } from '../client'
import { withRetry } from '../../network'

// Helper function - keep private to this module
function getFileTypeFromExtension(ext: string): 'part' | 'assembly' | 'drawing' | 'pdf' | 'step' | 'other' {
  // ... existing implementation
}

// Database retry wrapper
async function dbWithRetry<T>(
  operation: () => PromiseLike<{ data: T | null; error: any }>,
  context: string,
  logFn: (level: string, msg: string, data?: any) => void
): Promise<{ data: T | null; error: any }> {
  // ... existing implementation
}

// Export public functions
export async function syncFile(...) { ... }
export async function updateFileMetadata(...) { ... }
export async function updateFilePath(...) { ... }
export async function updateFolderPath(...) { ... }
```

### Task 4.2: Create files/trash.ts

Create `src/lib/supabase/files/trash.ts`:

```typescript
/**
 * File Trash Operations
 * Soft delete, restore, and permanent deletion
 */

import { getSupabaseClient } from '../client'

export async function softDeleteFile(...) { ... }
export async function softDeleteFiles(...) { ... }
export async function restoreFile(...) { ... }
export async function restoreFiles(...) { ... }
export async function permanentlyDeleteFile(...) { ... }
export async function permanentlyDeleteFiles(...) { ... }
export async function getDeletedFiles(...) { ... }
export async function getDeletedFilesCount(...) { ... }
export async function emptyTrash(...) { ... }
```

### Task 4.3: Remove Soft-Delete Hard-Delete Workaround

In `syncFile`, since Agent 1 created the partial unique index, REMOVE this workaround code (lines 649-675):

```typescript
// DELETE THIS BLOCK - no longer needed with partial unique index:
// If soft-deleted files exist, permanently delete them first to clear the UNIQUE constraint
if (deletedFiles && deletedFiles.length > 0) {
  // ... all the hard delete code ...
}
```

Replace with a simpler check:

```typescript
// With partial unique index, soft-deleted files don't block insertion
// Just log a warning if we're about to overwrite a deleted file's path
if (deletedFiles && deletedFiles.length > 0) {
  logFn('info', '[syncFile] Note: A previously deleted file existed at this path', {
    filePath,
    deletedFileIds: deletedFiles.map(f => f.id)
  })
}
```

### Task 4.4: Update Exports

Add to `src/lib/supabase/files/index.ts`:

```typescript
export * from './mutations'
export * from './trash'
```

Update `src/lib/supabase/index.ts`:

```typescript
// ============================================
// File exports (mutations)
// ============================================
export {
  syncFile,
  updateFileMetadata,
  updateFilePath,
  updateFolderPath
} from './files/mutations'

// ============================================
// File exports (trash)
// ============================================
export {
  softDeleteFile,
  softDeleteFiles,
  restoreFile,
  restoreFiles,
  permanentlyDeleteFile,
  permanentlyDeleteFiles,
  getDeletedFiles,
  getDeletedFilesCount,
  emptyTrash
} from './files/trash'
```

## Completion Report Template

Create `AGENT4_REPORT.md`:

```markdown
# Agent 4 Completion Report

## Status: COMPLETE / INCOMPLETE

## Changes Made:
- [ ] Created src/lib/supabase/files/mutations.ts
- [ ] Created src/lib/supabase/files/trash.ts
- [ ] Moved 4 mutation functions
- [ ] Moved 9 trash functions
- [ ] Removed soft-delete hard-delete workaround
- [ ] Updated exports

## Functions Moved to mutations.ts:
- syncFile (simplified - removed hard-delete workaround)
- updateFileMetadata
- updateFilePath
- updateFolderPath

## Functions Moved to trash.ts:
- softDeleteFile
- softDeleteFiles
- restoreFile
- restoreFiles
- permanentlyDeleteFile
- permanentlyDeleteFiles
- getDeletedFiles
- getDeletedFilesCount
- emptyTrash

## Breaking Changes:
- None expected

## Test Commands:
- npm run typecheck
- Manual test: sync a file to a path that was previously deleted
```

---

# Post-Execution: Coordinator Review

After all agents complete, a coordinator should:

## 1. Collect Reports

Gather all report files:

- `AGENT1_REPORT.md`
- `AGENT2_REPORT.md`
- `AGENT3_REPORT.md`
- `AGENT4_REPORT.md`

## 2. Verify No Conflicts

Check that the original `src/lib/supabase/files.ts` is now minimal or deleted:

```typescript
// files.ts should only contain re-exports or be deleted entirely
// All functions should now be in files/ subdirectory
```

## 3. Run Full Type Check

```bash
npm run typecheck
```

## 4. Test Critical Paths

1. **Checkout race condition test:** Two users try to checkout same file
2. **Sync to deleted path test:** Sync new file to previously deleted path
3. **Version increment test:** Check in file with changes
4. **Query performance test:** Load vault with 1000+ files

## 5. Update Version Numbers

Per workspace rules:

- Update `src/lib/schemaVersion.ts` if database changes were made
- Update `supabase/schema.sql` INSERT version

---

# Summary of Function Ownership

| Function | Owner Agent | New Location |

|----------|-------------|--------------|

| getFiles | Agent 2 | files/queries.ts |

| getFilesLightweight | Agent 2 | files/queries.ts |

| getCheckedOutUsers | Agent 2 | files/queries.ts |

| getUserBasicInfo | Agent 2 | files/queries.ts |

| getFile | Agent 2 | files/queries.ts |

| getFileByPath | Agent 2 | files/queries.ts |

| getFileVersions | Agent 2 | files/queries.ts |

| getWhereUsed | Agent 2 | files/queries.ts |

| getContains | Agent 2 | files/queries.ts |

| getMyCheckedOutFiles | Agent 2 | files/queries.ts |

| getAllCheckedOutFiles | Agent 2 | files/queries.ts |

| checkoutFile | Agent 3 | files/checkout.ts |

| checkinFile | Agent 3 | files/checkout.ts |

| syncSolidWorksFileMetadata | Agent 3 | files/checkout.ts |

| undoCheckout | Agent 3 | files/checkout.ts |

| adminForceDiscardCheckout | Agent 3 | files/checkout.ts |

| syncFile | Agent 4 | files/mutations.ts |

| updateFileMetadata | Agent 4 | files/mutations.ts |

| updateFilePath | Agent 4 | files/mutations.ts |

| updateFolderPath | Agent 4 | files/mutations.ts |

| softDeleteFile | Agent 4 | files/trash.ts |

| softDeleteFiles | Agent 4 | files/trash.ts |

| restoreFile | Agent 4 | files/trash.ts |

| restoreFiles | Agent 4 | files/trash.ts |

| permanentlyDeleteFile | Agent 4 | files/trash.ts |

| permanentlyDeleteFiles | Agent 4 | files/trash.ts |

| getDeletedFiles | Agent 4 | files/trash.ts |

| getDeletedFilesCount | Agent 4 | files/trash.ts |

| emptyTrash | Agent 4 | files/trash.ts |