# Agent 2: Fix Subfolder Spinner Tracking

## Problem

When uploading files via the vault inline upload button:
- Files in the root folder show spinners correctly
- Subfolders containing files being uploaded do NOT show spinners
- Only the explicitly selected folder shows a spinner, not its child folders

## Root Cause

In `src/lib/commands/handlers/sync.ts` lines 298-304:

```typescript
// Track folders and files being processed (for spinner display)
const foldersBeingProcessed = files
  .filter(f => f.isDirectory)
  .map(f => f.relativePath)
const filesBeingProcessed = filesToSync.map(f => f.relativePath)
const allPathsBeingProcessed = [...new Set([...foldersBeingProcessed, ...filesBeingProcessed])]
ctx.addProcessingFolders(allPathsBeingProcessed)
```

This only includes:
1. Folders from the original selection (`files` parameter)
2. Individual files being uploaded

**Missing**: Parent folders of files being uploaded. When uploading `FolderA/SubfolderB/file.txt`, the code adds `file.txt` but not `SubfolderB`.

Compare to `download.ts` lines 237-249 which correctly finds child folders.

## Solution

Add logic to extract all parent folder paths from files being synced and include them in the processing set.

### File to Modify

`src/lib/commands/handlers/sync.ts` - the `execute` function

### Changes Required

Replace lines 298-304 with expanded logic:

```typescript
// Track folders and files being processed (for spinner display)
const foldersBeingProcessed = files
  .filter(f => f.isDirectory)
  .map(f => f.relativePath)
const filesBeingProcessed = filesToSync.map(f => f.relativePath)

// NEW: Find all parent folders that contain files being synced
// This ensures subfolders show spinners, not just the selected root
const parentFolderPaths = new Set<string>()
for (const file of filesToSync) {
  const parts = file.relativePath.replace(/\\/g, '/').split('/')
  // Build each parent path level (skip the filename itself)
  for (let i = 1; i < parts.length; i++) {
    parentFolderPaths.add(parts.slice(0, i).join('/'))
  }
}

// Also find child folders of selected folders that contain local-only files
const childFolderPaths: string[] = []
for (const selectedFolder of foldersBeingProcessed) {
  const normalizedSelected = selectedFolder.replace(/\\/g, '/')
  // Find folders that are children of this selected folder and contain uploadable files
  const childFolders = ctx.files.filter(f => {
    if (!f.isDirectory) return false
    const normalizedPath = f.relativePath.replace(/\\/g, '/')
    return normalizedPath.startsWith(normalizedSelected + '/')
  }).map(f => f.relativePath)
  childFolderPaths.push(...childFolders)
}

// Combine all paths that need spinners (deduplicated)
const allPathsBeingProcessed = [
  ...new Set([
    ...foldersBeingProcessed,
    ...filesBeingProcessed,
    ...parentFolderPaths,
    ...childFolderPaths
  ])
]
ctx.addProcessingFolders(allPathsBeingProcessed)
```

### Also Check: checkin.ts

Apply the same pattern to `src/lib/commands/handlers/checkin.ts` if it has similar spinner tracking. Look for `addProcessingFolders` calls and ensure parent folders are included.

Current checkin.ts pattern (around line 405-410):
```typescript
const foldersBeingProcessed = files
  .filter(f => f.isDirectory)
  .map(f => f.relativePath)
const filesBeingProcessed = filesToCheckin.map(f => f.relativePath)
const allPathsBeingProcessed = [...new Set([...foldersBeingProcessed, ...filesBeingProcessed])]
ctx.addProcessingFolders(allPathsBeingProcessed)
```

Apply the same parent folder extraction logic here.

## How Spinner Display Works

For reference, the spinner display logic is in:
- `src/features/source/browser/utils/processingStatus.ts` - `isPathBeingProcessed()` function
- This checks if a path OR any of its parents are in `processingFolders`

The current logic already handles parent-to-child inheritance (if parent is processing, child shows spinner). But it doesn't work the other way - we need to explicitly add parent folders when their children are being processed.

## Testing

1. Upload files in nested folders (e.g., `Projects/Assembly/Parts/file.sldprt`)
   - Verify ALL parent folders show spinners: `Projects`, `Assembly`, `Parts`
2. Upload mix of root and subfolder files
   - Verify all relevant folders show spinners
3. Upload from a selected subfolder
   - Verify the subfolder and its children show spinners
4. After upload completes, verify all spinners clear

## Success Criteria

- All folders containing files being uploaded show spinners
- All ancestor folders of uploading files show spinners
- Spinners clear correctly when upload completes
- No performance impact (Set operations are O(1) for add/lookup)
