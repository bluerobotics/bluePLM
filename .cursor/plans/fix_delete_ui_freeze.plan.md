---
name: Fix Delete UI Freeze
overview: Fix the UI freeze during file deletion by storing tree/metrics in Zustand and updating incrementally instead of full O(N) recomputation.
todos:
  - id: add-tree-metrics-state
    content: Add fileTree and folderMetrics Maps to FilesSlice state in types.ts
    status: pending
  - id: implement-incremental-updates
    content: Implement removeFromTreeAndMetrics() in filesSlice.ts for O(affected) updates
    status: pending
  - id: update-remove-files
    content: Modify removeFilesFromStore() to call incremental update
    status: pending
  - id: update-use-vault-tree
    content: Change useVaultTree.ts to read from state instead of useMemo
    status: pending
  - id: add-rebuild-on-load
    content: Add rebuildTreeAndMetrics() call after initial file load
    status: pending
  - id: test-incremental
    content: Test delete operation in vault with 20K+ files - should be instant
    status: pending
---

# Fix Delete UI Freeze - Incremental Tree/Metrics Updates

## Problem

When deleting 4 files in a vault with ~24,843 files, the UI freezes for 2-5 seconds. The entire file tree and folder metrics are recomputed even though only 4 files changed.

## Root Cause: Full Recomputation on Every Change

Currently, when `removeFilesFromStore(paths)` runs:

1. **Files array**: Creates new array via `.filter()` - new reference triggers all subscribers
2. **`useVaultTree.tree`**: useMemo depends on `files` - O(N) full rebuild
3. **`useVaultTree.folderMetrics`**: useMemo depends on `files` - O(N x depth) full rebuild
4. **`useFlattenedTree.flattenedItems`**: useMemo depends on `tree` - O(visible) rebuild

**The problem**: Deleting 4 files causes 24K+ files to be re-processed, even though 24,839 files are unchanged.

## Solution: Store Tree/Metrics in State + Incremental Updates

Instead of recomputing everything via useMemo, store the derived data in Zustand and update only affected entries.

### Data Flow Change

```
BEFORE (O(N) on every change):
files[] --useMemo--> tree{} --useMemo--> folderMetrics{}
         ^ full rebuild        ^ full rebuild

AFTER (O(affected) on change):
files[] + tree{} + folderMetrics{} all in Zustand
         | incremental update on mutation
removeFilesFromStore() updates only affected tree entries + parent metrics
```

## Implementation

### Phase 1: Add tree and folderMetrics to FilesSlice state

**File: [src/stores/types.ts](src/stores/types.ts)**

Add to FilesSlice interface:

```typescript
// Derived state (incrementally updated instead of useMemo recomputation)
fileTree: Map<string, string[]>  // folderPath -> array of child relativePaths
folderMetrics: Map<string, FolderMetrics>  // folderPath -> metrics

// Incremental update actions
rebuildTreeAndMetrics: () => void  // Full rebuild (on initial load, vault switch)
removeFromTreeAndMetrics: (paths: string[]) => void  // Incremental removal
addToTreeAndMetrics: (files: LocalFile[]) => void  // Incremental addition
```

### Phase 2: Implement incremental update functions

**File: [src/stores/slices/filesSlice.ts](src/stores/slices/filesSlice.ts)**

```typescript
removeFromTreeAndMetrics: (relativePaths: string[]) => {
  set(state => {
    const newTree = new Map(state.fileTree)
    const newMetrics = new Map(state.folderMetrics)
    
    // Group paths by parent folder
    const affectedFolders = new Map<string, string[]>()
    for (const path of relativePaths) {
      const parts = path.split('/')
      const parentPath = parts.slice(0, -1).join('/')
      if (!affectedFolders.has(parentPath)) {
        affectedFolders.set(parentPath, [])
      }
      affectedFolders.get(parentPath)!.push(path)
    }
    
    // Update only affected folder entries in tree
    for (const [folderPath, removedPaths] of affectedFolders) {
      const children = newTree.get(folderPath)
      if (children) {
        const removedSet = new Set(removedPaths)
        newTree.set(folderPath, children.filter(p => !removedSet.has(p)))
      }
    }
    
    // Decrement metrics for affected folder chains
    for (const path of relativePaths) {
      const file = state.files.find(f => f.relativePath === path)
      if (file && !file.isDirectory) {
        decrementFolderMetrics(newMetrics, file)
      }
    }
    
    return { fileTree: newTree, folderMetrics: newMetrics }
  })
}
```

### Phase 3: Update removeFilesFromStore to use incremental updates

**File: [src/stores/slices/filesSlice.ts](src/stores/slices/filesSlice.ts)**

Modify `removeFilesFromStore`:

```typescript
removeFilesFromStore: (paths) => {
  if (paths.length === 0) return
  const pathSet = new Set(paths.map(p => p.toLowerCase()))
  
  // Get relative paths before removing from files array
  const { files } = get()
  const relativePaths = paths
    .map(p => files.find(f => f.path.toLowerCase() === p.toLowerCase())?.relativePath)
    .filter((p): p is string => p !== undefined)
  
  // Update files array
  set(state => ({
    files: state.files.filter(f => !pathSet.has(f.path.toLowerCase())),
    selectedFiles: state.selectedFiles.filter(p => !pathSet.has(p.toLowerCase()))
  }))
  
  // Incrementally update tree and metrics (O(affected) instead of O(all))
  get().removeFromTreeAndMetrics(relativePaths)
}
```

### Phase 4: Update useVaultTree to read from state

**File: [src/features/source/explorer/file-tree/hooks/useVaultTree.ts](src/features/source/explorer/file-tree/hooks/useVaultTree.ts)**

Change from computing to subscribing:

```typescript
// BEFORE: Computed via useMemo (triggers on any files change)
const tree = useMemo<TreeMap>(() => { ... expensive O(N) ... }, [files, ...])
const folderMetrics = useMemo<FolderMetricsMap>(() => { ... expensive O(N x depth) ... }, [files, ...])

// AFTER: Subscribe to pre-computed state (only re-renders if specific entry changes)
const fileTree = usePDMStore(s => s.fileTree)
const folderMetrics = usePDMStore(s => s.folderMetrics)

// Convert Map to TreeMap format for compatibility
const tree = useMemo(() => {
  const result: TreeMap = { '': [] }
  for (const [folder, children] of fileTree) {
    result[folder] = children.map(path => 
      files.find(f => f.relativePath === path)
    ).filter((f): f is LocalFile => f !== undefined)
  }
  return result
}, [fileTree, files])
```

### Phase 5: Initialize tree/metrics on vault load

**File: [src/hooks/useLoadFiles.ts](src/hooks/useLoadFiles.ts)** (or wherever files are initially loaded)

After setting files, trigger full rebuild:

```typescript
setFiles(allFiles)
rebuildTreeAndMetrics()  // Full O(N) computation, but only on initial load
```

## Files to Modify

1. [src/stores/types.ts](src/stores/types.ts) - Add state types and action signatures
2. [src/stores/slices/filesSlice.ts](src/stores/slices/filesSlice.ts) - Add state, implement incremental updates
3. [src/features/source/explorer/file-tree/hooks/useVaultTree.ts](src/features/source/explorer/file-tree/hooks/useVaultTree.ts) - Read from state instead of useMemo
4. [src/hooks/useLoadFiles.ts](src/hooks/useLoadFiles.ts) - Trigger full rebuild on initial load

## Performance Comparison

| Operation | Before | After |

|-----------|--------|-------|

| Delete 4 files | O(24,843 x depth) | O(4 x depth) |

| Add 10 files | O(24,843 x depth) | O(10 x depth) |

| Initial load | O(N x depth) | O(N x depth) (same) |

## Expected Result

- Deleting 4 files updates only the parent folder's tree entry and metrics chain
- No full recomputation of 24K files
- UI remains responsive with no freeze
- Spinners animate smoothly until files disappear

## Testing

1. Delete 4 files in a vault with 20K+ files - should be instant
2. Verify folder metrics update correctly after deletion
3. Verify file tree structure is correct after deletion
4. Test edge cases: delete from root, delete nested files, delete entire folder