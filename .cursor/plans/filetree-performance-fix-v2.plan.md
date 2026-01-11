# File Tree Performance Fix - Comprehensive

## Problem Summary

The previous fix using `useDeferredValue` does NOT solve the issue because:

1. `useDeferredValue` only delays WHEN computation runs - it doesn't make it non-blocking
2. When the deferred value finally updates, `folderMetrics` still runs synchronously for ~5 seconds
3. The "wrong state" period (both clouds visible) is the defer delay
4. The freeze is the actual synchronous computation

## Root Cause

The `folderMetrics` useMemo in [useVaultTree.ts](bluePLM/src/features/source/explorer/file-tree/hooks/useVaultTree.ts) is O(N x depth) and runs synchronously. With 8000 files, this blocks the UI for ~5 seconds regardless of when it runs.

## Solution: Incremental Updates Everywhere

**Philosophy:** Instead of recomputing ALL folder metrics when ANY file changes, we:

1. Track which files actually changed
2. Update ONLY the affected folders' metrics
3. This is O(changed_files x depth) instead of O(all_files x depth)

**Apply this to ALL file operations, not just downloads.**

---

## File Operations Audit

### Current State Analysis

| Handler | Current Pattern | Issue | Fix Needed |

|---------|----------------|-------|------------|

| `download.ts` | `updateFilesAndClearProcessing()` | Already atomic | Add `lastOperationCompletedAt`, delay clear |

| `getLatest.ts` | `updateFilesAndClearProcessing()` | Already atomic | Add `lastOperationCompletedAt`, delay clear |

| `delete.ts` | `updateFilesInStore()` + `removeProcessingFolders()` | 2 renders | Convert to atomic |

| `checkin.ts` | `updateFilesInStore()` + `removeProcessingFolders()` | 2 renders | Convert to atomic |

| `checkout.ts` | `updateFilesInStore()` + `removeProcessingFolders()` | 2 renders | Convert to atomic |

| `discard.ts` | `updateFilesInStore()` + `removeProcessingFolders()` + **`onRefresh()`** | 2 renders + FULL RELOAD | Convert to atomic, REMOVE onRefresh |

| `sync.ts` | `updateFilesInStore()` + `removeProcessingFolders()` | 2 renders | Convert to atomic |

| `forceRelease.ts` | `updateFilesInStore()` only | No processing cleanup | Convert to atomic |

| `syncSwMetadata.ts` | `updateFilesInStore()` + `removeProcessingFolders()` | 2 renders | Convert to atomic |

### Operations That Call `onRefresh()` (FULL RELOAD - BAD!)

These trigger a complete filesystem rescan + folderMetrics recomputation:

| Handler | Location | Why It's Called | Should Be Removed? |

|---------|----------|-----------------|-------------------|

| `discard.ts` | Line 359 | "Force a full refresh after discard" | YES - use incremental |

| `backupOps.ts` | Multiple | After restore/rollback | Maybe - structural change |

| `vaultOps.ts` | `handleRefresh()` | Explicit user refresh | No - user requested |

| `info.ts` | `handleSetState()` | After state change | YES - use incremental |

| `misc.ts` | Line 231 | After operation | YES - use incremental |

---

## Implementation

### Phase 1: Remove useDeferredValue (making state consistent)

Remove `useDeferredValue` from `useVaultTree.ts`. This causes the wrong dual-state display. The tree and metrics should use the same `files` reference.

### Phase 2: Add Performance Diagnostic Logging

Add comprehensive logging to track the exact timing and flow of operations:

#### 2a. folderMetrics Computation Timing ([useVaultTree.ts](bluePLM/src/features/source/explorer/file-tree/hooks/useVaultTree.ts))

```typescript
const folderMetrics = useMemo<FolderMetricsMap>(() => {
  const startTime = performance.now()
  window.electronAPI?.log('debug', '[FolderMetrics] Starting computation', { 
    fileCount: files.length,
    timestamp: Date.now()
  })
  
  // ... existing computation ...
  
  const duration = performance.now() - startTime
  window.electronAPI?.log('info', '[FolderMetrics] Computation complete', {
    fileCount: files.length,
    folderCount: metrics.size,
    durationMs: duration.toFixed(2),
    timestamp: Date.now()
  })
  
  return metrics
}, [files, ...])
```

#### 2b. Store Update Timing ([filesSlice.ts](bluePLM/src/stores/slices/filesSlice.ts))

```typescript
updateFilesAndClearProcessing: (updates, pathsToClearProcessing) => {
  const startTime = performance.now()
  window.electronAPI?.log('debug', '[Store] updateFilesAndClearProcessing START', {
    updateCount: updates.length,
    pathsToClearCount: pathsToClearProcessing.length,
    timestamp: Date.now()
  })
  
  // ... existing logic ...
  
  const duration = performance.now() - startTime
  window.electronAPI?.log('info', '[Store] updateFilesAndClearProcessing COMPLETE', {
    durationMs: duration.toFixed(2),
    timestamp: Date.now()
  })
}
```

#### 2c. File Watcher Debug Logging ([App.tsx](bluePLM/src/app/App.tsx))

```typescript
window.electronAPI.onFilesChanged((changedFiles) => {
  const eventTime = Date.now()
  window.electronAPI?.log('debug', '[FileWatcher] Event received', {
    changedCount: changedFiles.length,
    timestamp: eventTime
  })
  
  const { processingOperations, lastOperationCompletedAt, expectedFileChanges } = usePDMStore.getState()
  
  window.electronAPI?.log('debug', '[FileWatcher] State check', {
    processingOpsCount: processingOperations.size,
    expectedChangesCount: expectedFileChanges.size,
    lastOpCompletedAt: lastOperationCompletedAt,
    msSinceLastOp: eventTime - lastOperationCompletedAt,
    withinSuppressionWindow: eventTime - lastOperationCompletedAt < SUPPRESSION_WINDOW_MS,
    timestamp: eventTime
  })
  
  window.electronAPI?.log('debug', '[FileWatcher] Decision', {
    unexpectedCount: unexpectedChanges.length,
    willTriggerRefresh: unexpectedChanges.length > 0,
    timestamp: eventTime
  })
})
```

### Phase 3: Convert All Handlers to Atomic Updates

Each handler that modifies files should:

1. Use `updateFilesAndClearProcessing()` instead of separate calls
2. Set `lastOperationCompletedAt` on completion
3. Delay `clearExpectedFileChanges()` by 5 seconds
4. Add operation-specific logging

#### Template for Converting a Handler:

```typescript
// BEFORE (causes 2 renders):
ctx.updateFilesInStore(pendingUpdates)
ctx.removeProcessingFolders(allPathsBeingProcessed)

// AFTER (single render):
const operationEndTime = Date.now()
log[OperationName]('info', 'Operation complete, updating store', {
  operationId,
  updateCount: pendingUpdates.length,
  timestamp: operationEndTime
})

ctx.updateFilesAndClearProcessing(pendingUpdates, allPathsBeingProcessed)
ctx.setLastOperationCompletedAt(operationEndTime)

// If this operation creates/modifies files on disk, delay clearing expected changes
if (affectedFilePaths.length > 0) {
  setTimeout(() => {
    ctx.clearExpectedFileChanges(affectedFilePaths)
  }, 5000)
}
```

### Phase 4: Fix File Watcher Race Condition

Add `setLastOperationCompletedAt` action and ensure all file operations call it.

### Phase 5: Remove Unnecessary `onRefresh()` Calls

The following handlers call `onRefresh()` unnecessarily - convert them to incremental:

1. **`discard.ts`** - Remove line 359 `ctx.onRefresh?.(false)` - the incremental update is sufficient
2. **`info.ts`** - Remove `onRefresh` call in `handleSetState()` - use incremental update
3. **`misc.ts`** - Remove `onRefresh` call - use incremental update

Keep `onRefresh()` only for:

- Explicit user-requested refresh (`vaultOps.ts handleRefresh`)
- Vault switching (structural change)
- Backup restore/rollback (may add/remove files from disk)

---

## Key Files to Modify

### Core Infrastructure

- [useVaultTree.ts](bluePLM/src/features/source/explorer/file-tree/hooks/useVaultTree.ts) - Remove defer, add timing logs
- [filesSlice.ts](bluePLM/src/stores/slices/filesSlice.ts) - Add timing logs to atomic update
- [stores/types.ts](bluePLM/src/stores/types.ts) - Add `setLastOperationCompletedAt` action
- [operationsSlice.ts](bluePLM/src/stores/slices/operationsSlice.ts) - Implement `setLastOperationCompletedAt`
- [executor.ts](bluePLM/src/lib/commands/executor.ts) - Add `setLastOperationCompletedAt` to context
- [types.ts](bluePLM/src/lib/commands/types.ts) - Add `setLastOperationCompletedAt` to CommandContext
- [App.tsx](bluePLM/src/app/App.tsx) - Enhanced file watcher logging

### Command Handlers to Convert

- [download.ts](bluePLM/src/lib/commands/handlers/download.ts) - Add timestamps, delay clear
- [getLatest.ts](bluePLM/src/lib/commands/handlers/getLatest.ts) - Add timestamps, delay clear
- [delete.ts](bluePLM/src/lib/commands/handlers/delete.ts) - Convert to atomic
- [checkin.ts](bluePLM/src/lib/commands/handlers/checkin.ts) - Convert to atomic
- [checkout.ts](bluePLM/src/lib/commands/handlers/checkout.ts) - Convert to atomic
- [discard.ts](bluePLM/src/lib/commands/handlers/discard.ts) - Convert to atomic, REMOVE onRefresh
- [sync.ts](bluePLM/src/lib/commands/handlers/sync.ts) - Convert to atomic
- [forceRelease.ts](bluePLM/src/lib/commands/handlers/forceRelease.ts) - Convert to atomic
- [syncSwMetadata.ts](bluePLM/src/lib/commands/handlers/syncSwMetadata.ts) - Convert to atomic
- [info.ts](bluePLM/src/lib/commands/handlers/info.ts) - Remove onRefresh
- [misc.ts](bluePLM/src/lib/commands/handlers/misc.ts) - Remove onRefresh

---

## Diagnostic Log Tags

All logs use consistent tags for easy filtering:

| Tag | Description |

|-----|-------------|

| `[FolderMetrics]` | folderMetrics computation timing |

| `[Store]` | Store update operations |

| `[Download]` | Download command flow |

| `[GetLatest]` | Get-latest command flow |

| `[Checkin]` | Check-in command flow |

| `[Checkout]` | Checkout command flow |

| `[Delete]` | Delete command flow |

| `[Discard]` | Discard command flow |

| `[Sync]` | Sync command flow |

| `[FileWatcher]` | File watcher events and decisions |

---

## Verification Checklist

After implementation, verify in logs for EACH operation:

1. `[{Operation}] Operation complete, updating store` shows operation finished
2. `[Store] updateFilesAndClearProcessing COMPLETE` shows fast update (<100ms)
3. `[FolderMetrics] Computation complete` shows fast recompute
4. `[FileWatcher] withinSuppressionWindow: true` after operation (suppression working)
5. `[FileWatcher] willTriggerRefresh: false` (no unnecessary reload)
6. UI updates immediately with correct state

## Log Sequence for Successful Operation

Expected log sequence after fix (using Download as example):

```
[Download] Downloads finished, starting store update        {operationId, timestamp}
[Store] updateFilesAndClearProcessing START                {updateCount, timestamp}
[Store] updateFilesAndClearProcessing COMPLETE             {durationMs: <100, timestamp}
[FolderMetrics] Starting computation                       {fileCount, timestamp}
[FolderMetrics] Computation complete                       {durationMs: <5000, timestamp}
[Download] Store update complete                           {operationId, timestamp}
[FileWatcher] Event received                               {changedCount, timestamp}
[FileWatcher] State check                                  {withinSuppressionWindow: true}
[FileWatcher] Decision                                     {willTriggerRefresh: false}
... (5 seconds later) ...
[Download] Expected file changes cleared (delayed)         {operationId, timestamp}
```

---

## Expected Result

After all changes:

- ALL file operations use atomic store updates
- File watcher correctly suppressed for ALL operations
- UI updates immediately with correct state
- No freeze for any operation
- Comprehensive logs for diagnosing any future issues