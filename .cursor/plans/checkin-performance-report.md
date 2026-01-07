# Check-in Performance Fix Report

## Date: 2026-01-07

## Summary

Fixed the critical `fs:hash-file` IPC handler bug and implemented key performance optimizations for batch check-in operations.

---

## Phase 1: Critical Bug Fix ✅

### Root Cause

Stale compiled `.js` files in `electron/handlers/` were shadowing the TypeScript source files. When Vite/Rollup resolved imports, it was using these outdated JavaScript files instead of the current TypeScript source.

**Key finding:** The `electron/handlers/fs.js` file was dated 2026-01-06 5:12 PM, while `fs.ts` was dated 2026-01-07 12:38 AM. The `.js` file was missing the `fs:hash-file` handler that had been added to the TypeScript source.

### Fix Applied

1. Removed all stale `.js` and `.d.ts` files from `electron/handlers/`
2. Removed all stale `.js` and `.d.ts` files from `electron/`
3. Rebuilt `dist-electron/main.js` with fresh TypeScript compilation

### Verification

```
SUCCESS: fs:hash-file handler found in dist-electron/main.js!
SUCCESS: hashFileAsync (minified as UU) is present
```

---

## Phase 2: Performance Optimizations ✅

### Changes Made

#### 1. Added SW_CONCURRENT_OPERATIONS Constant (`src/lib/concurrency.ts`)

```typescript
/**
 * Lower concurrency for SolidWorks operations.
 * The SW service uses a serial stdin/stdout pipe, so high concurrency
 * just creates contention. 3 workers allows some parallelism for
 * queueing while respecting the serial nature of the service.
 */
export const SW_CONCURRENT_OPERATIONS = 3
```

This constant is available for future use in other SW-intensive operations.

#### 2. Skip SolidWorks Calls When Not Needed (`src/lib/commands/handlers/checkin.ts`)

**Before:** Every SolidWorks file would call `getDocumentInfo` regardless of whether it needed to.

**After:** Compute upfront whether SW calls are needed:
```typescript
// If we have a cached hash AND no pending metadata, skip all SW calls
const isSolidWorksFile = SW_EXTENSIONS.includes(file.extension.toLowerCase())
const hasPendingMetadata = !!file.pendingMetadata
const canUseCachedHash = !hasPendingMetadata && !!file.localHash
const skipSolidWorksOps = !isSolidWorksFile || (canUseCachedHash && !hasPendingMetadata)
```

**Impact:** For files with cached hashes and no datacard changes:
- Eliminates `getDocumentInfo` IPC call
- Eliminates `saveDocument` IPC call  
- Eliminates `setProperties` / `setPropertiesBatch` IPC calls

For a batch of 80 files where most haven't been modified:
- Previous: ~240 SW service IPC calls (3+ per file)
- Optimized: Only calls for files that actually need SW interaction

### Cancelled Tasks

1. **Pre-batch getDocumentInfo calls** - The SW service is serial, so pre-batching provides no benefit. The skip optimization is more impactful.

2. **Lower concurrency for SW operations** - The per-file SW calls are already awaited sequentially within each worker. The serial pipe is the bottleneck, not worker count.

---

## Phase 3: Verification ✅

```bash
npm run typecheck
> tsc --noEmit
# No errors
```

---

## Files Modified

| File | Change |
|------|--------|
| `electron/handlers/*.js` | Deleted stale files |
| `electron/handlers/*.d.ts` | Deleted stale files |
| `electron/*.js` | Deleted stale files |
| `electron/*.d.ts` | Deleted stale files |
| `src/lib/concurrency.ts` | Added `SW_CONCURRENT_OPERATIONS` constant |
| `src/lib/commands/handlers/checkin.ts` | Added upfront SW skip optimization |

---

## Expected Performance Improvement

For a typical batch check-in of 80 files:

| Scenario | Previous | Optimized |
|----------|----------|-----------|
| Files with cached hash, no metadata | 3-5 SW calls each | 0 SW calls |
| Files needing hash recompute | Full SW flow | Full SW flow |
| Files with pending metadata | Full SW flow | Full SW flow |

**Typical case:** Most files in a check-in haven't been modified since the last scan (they just had their checkout released). These files now skip all SW service interaction entirely.

---

## Recommendations

1. **Add `.js` to `.gitignore` for electron folder** - Prevent stale compiled files from being committed
2. **Consider build script cleanup** - Add a pre-build step to remove stale `.js`/`.d.ts` files from `electron/`
