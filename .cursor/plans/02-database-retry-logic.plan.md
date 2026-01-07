---
name: Add Retry Logic to Database Operations
overview: Wrap database operations in syncFile() with retry logic to handle transient failures
todos:
  - id: import-withretry
    content: Import withRetry from network.ts into files.ts
    status: completed
  - id: wrap-db-operations
    content: Wrap critical DB operations with withRetry() calls
    status: completed
  - id: test-and-report
    content: Verify the change compiles and generate completion report
    status: completed
---

# Task: Add Retry Logic to Database Operations

## Objective

Modify `src/lib/supabase/files.ts` to add retry logic to database operations in the `syncFile()` function.

## Why

Storage uploads have retry logic (3 attempts), but database operations don't. A single transient failure during file insert/update causes the entire file sync to fail.

---

## Implementation Steps

### Step 1: Import withRetry

At the top of `src/lib/supabase/files.ts`, add the import:

```typescript
import { withRetry } from '../network'
```

### Step 2: Create a helper for DB operations with retry

Add this helper function before the `syncFile` function:

```typescript
// Helper to wrap Supabase DB calls with retry logic
async function dbWithRetry<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  context: string,
  logFn: (level: string, msg: string, data?: any) => void
): Promise<{ data: T | null; error: any }> {
  let lastResult: { data: T | null; error: any } = { data: null, error: null }
  
  try {
    await withRetry(
      async () => {
        lastResult = await operation()
        if (lastResult.error) {
          throw lastResult.error
        }
        return lastResult
      },
      {
        maxAttempts: 3,
        baseDelay: 500,
        onRetry: (attempt, err) => {
          logFn('warn', `[syncFile] ${context} failed, retrying (${attempt}/3)`, { 
            error: err instanceof Error ? err.message : String(err) 
          })
        }
      }
    )
  } catch {
    // withRetry exhausted - lastResult contains the final error
  }
  
  return lastResult
}
```

### Step 3: Wrap the file insert operation

Find the file insert (around line 701-722):

```typescript
const { data, error } = await client
  .from('files')
  .insert({...})
  .select()
  .single()
```

Replace with:

```typescript
const { data, error } = await dbWithRetry(
  () => client
    .from('files')
    .insert({...})
    .select()
    .single(),
  'File insert',
  logFn
)
```

### Step 4: Wrap the file update operations

Find file updates (around lines 560-565 and 653-677) and wrap similarly:

```typescript
const { data, error } = await dbWithRetry(
  () => client
    .from('files')
    .update({...})
    .eq('id', activeFile.id)
    .select()
    .single(),
  'File update',
  logFn
)
```

### Step 5: Wrap version record inserts

Find version inserts (around lines 572-582, 686-694, 733-741):

```typescript
await dbWithRetry(
  () => client.from('file_versions').insert({...}),
  'Version insert',
  logFn
)
```

Note: Version inserts don't need to capture data, just ensure they succeed.

---

## Completion Report Template

When done, generate a report like this:

```
## Database Retry Logic - Complete

### Changes Made
- Added `import { withRetry } from '../network'`
- Added `dbWithRetry()` helper function
- Wrapped file insert with retry (1 location)
- Wrapped file updates with retry (2 locations)
- Wrapped version inserts with retry (3 locations)

### Files Modified
- src/lib/supabase/files.ts

### Verification
- [ ] TypeScript compiles without errors
- [ ] All DB operations in syncFile() now have retry logic

### Expected Behavior
- Transient DB failures now retry up to 3 times with 500ms/1s/2s backoff
- Retry attempts are logged as warnings
- More resilient to connection blips during large batch uploads
```

---

## Database Retry Logic - Complete

**Completed:** January 6, 2026

### Changes Made
- Added `import { withRetry } from '../network'`
- Added `dbWithRetry()` helper function (uses `PromiseLike` to accept Supabase's PostgrestBuilder)
- Wrapped file insert with retry (1 location)
- Wrapped file updates with retry (2 locations)
- Wrapped version inserts with retry (3 locations)
- Wrapped version delete with retry (1 location)

### Files Modified
- `src/lib/supabase/files.ts`

### Verification
- [x] TypeScript compiles without errors in files.ts
- [x] All DB operations in syncFile() now have retry logic

### Implementation Details
- Used `PromiseLike<{ data: T | null; error: any }>` instead of `Promise` to properly type Supabase's PostgrestBuilder
- Added type assertions after null checks to satisfy TypeScript's type narrowing
- Retry configuration: 3 attempts with 500ms base delay (exponential backoff with jitter)
- Retry attempts are logged as warnings with context and error details

### Expected Behavior
- Transient DB failures now retry up to 3 times with 500ms/1s/2s backoff
- Retry attempts are logged as warnings
- More resilient to connection blips during large batch uploads
