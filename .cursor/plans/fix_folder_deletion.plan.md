---
name: Fix folder deletion
overview: Fix the delete-server command to properly delete folders from both server and local filesystem when deleting files and folders together.
todos:
  - id: expand-local-selection
    content: Expand local deletion to include files inside selected folders (not just folder paths)
    status: pending
  - id: sort-delete-paths
    content: Sort batch delete paths by depth (deepest first) so files delete before parent folders
    status: pending
  - id: add-server-folder-delete
    content: Add deleteFolderByPath calls for selected folders after file deletion
    status: pending
---

# Fix Folder Deletion in Delete Operations

## Problem

When selecting multiple files and folders and choosing "Delete from server and local":

1. **Files inside selected folders are NOT deleted locally** - the code only passes folder paths to `deleteBatch`, relying on `shell.trashItem` to recursively delete contents
2. If `shell.trashItem` fails on a folder (e.g., one locked file inside), the **entire folder AND all its contents remain**
3. **Folders are NOT deleted from the server** - the `deleteFolderByPath` call is missing for the main code path

## Root Cause

In [`src/lib/commands/handlers/delete.ts`](src/lib/commands/handlers/delete.ts), the `deleteServerCommand`:

**Local Deletion (STEP 1):**

```typescript
const localItemsToDelete = files.filter(f => f.diffStatus !== 'cloud')
// This only includes SELECTED items - NOT files inside selected folders!
```

- Only selected items are passed to `deleteBatch`
- Files inside selected folders are NOT explicitly deleted
- Relies entirely on `shell.trashItem` working recursively on folders
- If folder deletion fails (locked file, permission), nothing inside gets deleted

**Server Deletion (STEP 2):**

- Files inside folders ARE collected for server deletion (lines 658-677)
- But **folders themselves are never deleted** from server via `deleteFolderByPath()`

## Solution

### 1. Collect Files Inside Folders for Local Deletion

Before STEP 1, expand the selection to include files inside selected folders:

```typescript
// Expand selection to include files inside selected folders
const expandedLocalItems: LocalFile[] = []
for (const item of files.filter(f => f.diffStatus !== 'cloud')) {
  expandedLocalItems.push(item)
  if (item.isDirectory) {
    const folderPath = item.relativePath.replace(/\\/g, '/')
    const filesInFolder = ctx.files.filter(f => {
      if (f.isDirectory) return false
      if (f.diffStatus === 'cloud') return false
      const filePath = f.relativePath.replace(/\\/g, '/')
      return filePath.startsWith(folderPath + '/')
    })
    expandedLocalItems.push(...filesInFolder)
  }
}
const localItemsToDelete = [...new Map(expandedLocalItems.map(f => [f.path, f])).values()]
```

### 2. Sort Paths: Files Before Folders (Deepest First)

Sort the paths so files/deeper items are deleted before parent folders:

```typescript
// Sort by depth (deepest first) so children are deleted before parents
const sortedLocalPaths = localPaths.sort((a, b) => {
  const depthA = a.split(/[/\\]/).length
  const depthB = b.split(/[/\\]/).length
  return depthB - depthA
})
```

### 3. Add Server Folder Deletion

After deleting files from server (after STEP 2), delete folders from server:

```typescript
// Delete selected folders from server after files are deleted
const foldersToDeleteFromServer = files.filter(f => f.isDirectory)
if (foldersToDeleteFromServer.length > 0 && ctx.activeVaultId && user?.id) {
  for (const folder of foldersToDeleteFromServer) {
    try {
      await deleteFolderByPath(ctx.activeVaultId, folder.relativePath, user.id)
      logDelete('info', 'Deleted folder from server', { relativePath: folder.relativePath })
    } catch (err) {
      logDelete('warn', 'Failed to delete folder from server', { 
        relativePath: folder.relativePath,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }
}
```

## Files to Modify

- [`src/lib/commands/handlers/delete.ts`](src/lib/commands/handlers/delete.ts) - Fix local deletion to include files inside folders, sort paths properly, and add server folder deletion