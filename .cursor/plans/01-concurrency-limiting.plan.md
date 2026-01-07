---
name: Add Concurrency Limiting to Sync Command
overview: Add 20-concurrent upload limiting to prevent random failures during large batch uploads
todos:
  - id: add-limiter-function
    content: Add processWithConcurrency() helper function to sync.ts
    status: pending
  - id: replace-promise-all
    content: Replace Promise.all with processWithConcurrency(20) call
    status: pending
  - id: test-and-report
    content: Verify the change compiles and generate completion report
    status: pending
---

# Task: Add Concurrency Limiting to Sync Command

## Objective

Modify `src/lib/commands/handlers/sync.ts` to limit concurrent uploads to 20 instead of unbounded parallelism.

## Why

Uploading 920 files with `Promise.all()` creates ~5000 concurrent API requests, causing random failures due to connection pool exhaustion and rate limiting.

---

## Implementation Steps

### Step 1: Add the concurrency limiter function

Add this function near the top of the file (after imports, before `syncCommand`):

```typescript
// Concurrency limiter - processes items with max N concurrent operations
async function processWithConcurrency<T, R>(
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

// Maximum concurrent file uploads (prevents connection pool exhaustion)
const CONCURRENT_UPLOADS = 20
```

### Step 2: Replace Promise.all

Find this code (around line 328):

```typescript
const results = await Promise.all(filesToSync.map(async (file) => {
```

Replace with:

```typescript
const results = await processWithConcurrency(filesToSync, CONCURRENT_UPLOADS, async (file) => {
```

The rest of the async function body stays exactly the same - just change `Promise.all(...map(` to `processWithConcurrency(..., async (file) =>`.

---

## Completion Report Template

When done, generate a report like this:

```
## Concurrency Limiting - Complete

### Changes Made
- Added `processWithConcurrency()` helper function
- Added `CONCURRENT_UPLOADS = 20` constant
- Replaced `Promise.all(filesToSync.map(...))` with `processWithConcurrency(filesToSync, 20, ...)`

### Files Modified
- src/lib/commands/handlers/sync.ts

### Verification
- [ ] TypeScript compiles without errors
- [ ] Function signature unchanged (same inputs/outputs)

### Expected Behavior
- Uploads now process max 20 files concurrently
- Same speed as before (browser only allows ~6 actual connections anyway)
- No more random failures on large batches
```
