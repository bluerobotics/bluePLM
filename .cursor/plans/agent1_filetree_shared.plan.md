# Agent 1: FileTree + Shared Foundation

## Overview

You are responsible for:
1. **Renaming** ExplorerView → FileTree
2. **Creating** shared utilities that both components will use
3. **Updating** FileTree to use shared code

Agent 2 will handle FilePane (formerly FileBrowser) and will start after you signal completion.

---

## Part 1: Rename ExplorerView → FileTree

### 1.1 Rename Directory

```
BEFORE: src/components/sidebar/explorer/
AFTER:  src/components/sidebar/file-tree/
```

Contents to rename:
- `explorer/constants.ts` → `file-tree/constants.ts`
- `explorer/hooks/` → `file-tree/hooks/`
- `explorer/VaultTreeItem.tsx` → `file-tree/VaultTreeItem.tsx`
- `explorer/PinnedFoldersSection.tsx` → `file-tree/PinnedFoldersSection.tsx`
- `explorer/RecentVaultsSection.tsx` → `file-tree/RecentVaultsSection.tsx`
- `explorer/TreeItemActions.tsx` → `file-tree/TreeItemActions.tsx`
- `explorer/index.ts` → `file-tree/index.ts`

### 1.2 Rename Main Component

```
BEFORE: src/components/sidebar/ExplorerView.tsx
AFTER:  src/components/sidebar/FileTree.tsx
```

Update component:
```typescript
// BEFORE
export function ExplorerView({ ... }: ExplorerViewProps) {

// AFTER
export function FileTree({ ... }: FileTreeProps) {
```

### 1.3 Update All Imports (7 files)

| File | Change |
|------|--------|
| `src/components/Sidebar.tsx` | `ExplorerView` → `FileTree` |
| `src/components/TabWindow.tsx` | `ExplorerView` → `FileTree` |
| `src/components/sidebar/explorer/index.ts` | Update path + exports |
| `src/features/source/browser/components/FileList/ListRowIcon.tsx` | Check if needs update |
| `src/components/shared/FileItem/FileItemComponents.tsx` | Check if needs update |
| `src/lib/commands/types.ts` | Check if type references exist |

---

## Part 2: Create Shared Utilities

### 2.1 Create Directory Structure

```
src/lib/fileOperations/
├── index.ts
├── types.ts
├── selection.ts
└── clipboard.ts
```

### 2.2 Create Types (`src/lib/fileOperations/types.ts`)

```typescript
import type { LocalFile } from '@/stores/pdmStore'

// Clipboard
export interface Clipboard {
  files: LocalFile[]
  operation: 'copy' | 'cut'
}

// Selection categories for multi-select operations
export interface SelectionCategories {
  downloadable: LocalFile[]    // cloud-only or outdated
  checkoutable: LocalFile[]    // synced, not checked out
  checkinable: LocalFile[]     // checked out by current user
  uploadable: LocalFile[]      // local-only, not synced
  updatable: LocalFile[]       // outdated (subset of downloadable)
}

// Checkout user info for avatars
export interface CheckoutUser {
  id: string
  name: string
  avatar_url?: string
  isMe: boolean
  count?: number
}

// Drag-drop mode
export type DragDropMode = 'tree' | 'list' | 'grid'

// Drag-drop data type constant
export const PDM_FILES_DATA_TYPE = 'application/x-pdm-files'
```

### 2.3 Create Selection Utilities (`src/lib/fileOperations/selection.ts`)

Extract the repeated selection logic from both components:

```typescript
import type { LocalFile } from '@/stores/pdmStore'
import type { SelectionCategories } from './types'

/**
 * Calculate all selection categories in a single pass (O(n) instead of O(5n))
 */
export function getSelectionCategories(
  files: LocalFile[],
  selectedPaths: string[],
  userId?: string
): SelectionCategories {
  // Return empty if not multi-select
  if (selectedPaths.length <= 1) {
    return {
      downloadable: [],
      checkoutable: [],
      checkinable: [],
      uploadable: [],
      updatable: []
    }
  }

  const selectedSet = new Set(selectedPaths)
  const result: SelectionCategories = {
    downloadable: [],
    checkoutable: [],
    checkinable: [],
    uploadable: [],
    updatable: []
  }

  for (const file of files) {
    if (!selectedSet.has(file.path) || file.isDirectory) continue

    const { diffStatus, pdmData } = file

    // Downloadable: cloud-only or outdated
    if (diffStatus === 'cloud' || diffStatus === 'cloud_new' || diffStatus === 'outdated') {
      result.downloadable.push(file)
    }

    // Updatable: outdated only
    if (diffStatus === 'outdated') {
      result.updatable.push(file)
    }

    // Checkoutable: synced, not checked out, not cloud-only, not deleted
    if (pdmData && !pdmData.checked_out_by && diffStatus !== 'cloud' && diffStatus !== 'deleted') {
      result.checkoutable.push(file)
    }

    // Checkinable: checked out by current user
    if (pdmData?.checked_out_by === userId && diffStatus !== 'deleted') {
      result.checkinable.push(file)
    }

    // Uploadable: local-only (no pdmData or added status)
    if ((!pdmData || diffStatus === 'added') && diffStatus !== 'cloud') {
      result.uploadable.push(file)
    }
  }

  return result
}
```

### 2.4 Create Clipboard Utilities (`src/lib/fileOperations/clipboard.ts`)

```typescript
import type { LocalFile } from '@/stores/pdmStore'
import type { Clipboard } from './types'
import { executeCommand } from '@/lib/commands'

/**
 * Check if files can be cut (must be directories, local-only, or checked out by user)
 */
export function canCutFiles(files: LocalFile[], userId?: string): boolean {
  return files.every(f => 
    f.isDirectory || 
    !f.pdmData || 
    f.pdmData.checked_out_by === userId
  )
}

/**
 * Get files that block cut operation
 */
export function getCutBlockers(files: LocalFile[], userId?: string): LocalFile[] {
  return files.filter(f => 
    !f.isDirectory && 
    f.pdmData && 
    f.pdmData.checked_out_by !== userId
  )
}

/**
 * Execute paste operation
 */
export async function executePaste(
  clipboard: Clipboard,
  targetFolder: string,
  onRefresh?: (silent?: boolean) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    const command = clipboard.operation === 'cut' ? 'move' : 'copy'
    await executeCommand(command, {
      files: clipboard.files,
      targetFolder
    }, { onRefresh, silent: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}
```

### 2.5 Create Index (`src/lib/fileOperations/index.ts`)

```typescript
export * from './types'
export * from './selection'
export * from './clipboard'
```

---

## Part 3: Create Shared Hooks

### 3.1 Create Clipboard Hook (`src/hooks/useClipboard.ts`)

```typescript
import { useState, useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { 
  type Clipboard, 
  canCutFiles, 
  getCutBlockers, 
  executePaste 
} from '@/lib/fileOperations'

interface UseClipboardOptions {
  files: LocalFile[]
  selectedFiles: string[]
  userId?: string
  onRefresh?: (silent?: boolean) => void
  addToast?: (type: string, message: string) => void
}

export function useClipboard(options: UseClipboardOptions) {
  const { files, selectedFiles, userId, onRefresh, addToast } = options
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)

  const getSelectedFileObjects = useCallback(() => {
    return files.filter(f => selectedFiles.includes(f.path))
  }, [files, selectedFiles])

  const handleCopy = useCallback(() => {
    const selected = getSelectedFileObjects()
    if (selected.length === 0) return

    setClipboard({ files: selected, operation: 'copy' })
    addToast?.('info', `Copied ${selected.length} item${selected.length > 1 ? 's' : ''}`)
  }, [getSelectedFileObjects, addToast])

  const handleCut = useCallback(() => {
    const selected = getSelectedFileObjects()
    if (selected.length === 0) return

    const blockers = getCutBlockers(selected, userId)
    if (blockers.length > 0) {
      const checkedOutByOthers = blockers.filter(f => 
        f.pdmData?.checked_out_by && f.pdmData.checked_out_by !== userId
      )
      if (checkedOutByOthers.length > 0) {
        addToast?.('error', `Cannot move: ${checkedOutByOthers.length} file${checkedOutByOthers.length > 1 ? 's are' : ' is'} checked out by others`)
      } else {
        addToast?.('error', `Cannot move: files not checked out by you`)
      }
      return
    }

    setClipboard({ files: selected, operation: 'cut' })
    addToast?.('info', `Cut ${selected.length} item${selected.length > 1 ? 's' : ''}`)
  }, [getSelectedFileObjects, userId, addToast])

  const handlePaste = useCallback(async (targetFolder: string) => {
    if (!clipboard) {
      addToast?.('info', 'Nothing to paste')
      return
    }

    const result = await executePaste(clipboard, targetFolder, onRefresh)
    
    if (clipboard.operation === 'cut') {
      setClipboard(null) // Clear after cut
    }

    if (!result.success) {
      addToast?.('error', result.error || 'Paste failed')
    }
  }, [clipboard, onRefresh, addToast])

  return {
    clipboard,
    setClipboard,
    handleCopy,
    handleCut,
    handlePaste,
    hasClipboard: clipboard !== null
  }
}
```

### 3.2 Create Selection Categories Hook (`src/hooks/useSelectionCategories.ts`)

```typescript
import { useMemo } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { getSelectionCategories, type SelectionCategories } from '@/lib/fileOperations'

interface UseSelectionCategoriesOptions {
  files: LocalFile[]
  selectedFiles: string[]
  userId?: string
}

export function useSelectionCategories(options: UseSelectionCategoriesOptions): SelectionCategories {
  const { files, selectedFiles, userId } = options

  return useMemo(
    () => getSelectionCategories(files, selectedFiles, userId),
    [files, selectedFiles, userId]
  )
}
```

### 3.3 Create Drag-Drop Hook (`src/hooks/useDragDrop.ts`)

```typescript
import { useState, useRef, useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { PDM_FILES_DATA_TYPE, type DragDropMode } from '@/lib/fileOperations'
import { executeCommand } from '@/lib/commands'

interface UseDragDropOptions {
  mode: DragDropMode
  files: LocalFile[]
  selectedFiles: string[]
  onRefresh?: (silent?: boolean) => void
  currentFolder?: string
}

export function useDragDrop(options: UseDragDropOptions) {
  const { mode, files, selectedFiles, onRefresh, currentFolder = '' } = options

  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isExternalDrag, setIsExternalDrag] = useState(false)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const draggedFilesRef = useRef<LocalFile[]>([])

  const handleDragStart = useCallback((
    e: React.DragEvent,
    filesToDrag: LocalFile[],
    primaryFile: LocalFile
  ) => {
    const draggable = filesToDrag.filter(f => f.diffStatus !== 'cloud')
    if (draggable.length === 0) {
      e.preventDefault()
      return
    }

    draggedFilesRef.current = draggable
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(PDM_FILES_DATA_TYPE, JSON.stringify(draggable.map(f => f.path)))
  }, [])

  const handleDragEnd = useCallback(() => {
    draggedFilesRef.current = []
    setDragOverFolder(null)
    setIsDraggingOver(false)
    setIsExternalDrag(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const hasPdm = e.dataTransfer.types.includes(PDM_FILES_DATA_TYPE)
    const hasFiles = e.dataTransfer.types.includes('Files') && !hasPdm

    if (hasPdm || draggedFilesRef.current.length > 0) {
      e.dataTransfer.dropEffect = 'move'
      setIsDraggingOver(true)
      setIsExternalDrag(false)
    } else if (hasFiles) {
      e.dataTransfer.dropEffect = 'copy'
      setIsDraggingOver(true)
      setIsExternalDrag(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement
    if (!related || !e.currentTarget.contains(related)) {
      setIsDraggingOver(false)
      setIsExternalDrag(false)
      setDragOverFolder(null)
    }
  }, [])

  const handleFolderDragOver = useCallback((e: React.DragEvent, folder: LocalFile) => {
    e.preventDefault()
    e.stopPropagation()

    const dragged = draggedFilesRef.current
    const isDroppingOnSelf = dragged.some(f =>
      f.relativePath === folder.relativePath ||
      folder.relativePath.startsWith(f.relativePath + '/')
    )

    if (isDroppingOnSelf) {
      e.dataTransfer.dropEffect = 'none'
      return
    }

    e.dataTransfer.dropEffect = 'move'
    setDragOverFolder(folder.relativePath)
  }, [])

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as HTMLElement
    if (!related || !e.currentTarget.contains(related)) {
      setDragOverFolder(null)
    }
  }, [])

  const handleDropOnFolder = useCallback(async (e: React.DragEvent, folder: LocalFile) => {
    e.preventDefault()
    e.stopPropagation()

    setDragOverFolder(null)
    setIsDraggingOver(false)
    setIsExternalDrag(false)

    const filesToMove = draggedFilesRef.current
    if (filesToMove.length > 0) {
      await executeCommand('move', {
        files: filesToMove,
        targetFolder: folder.relativePath
      }, { onRefresh })
    }

    draggedFilesRef.current = []
  }, [onRefresh])

  return {
    isDraggingOver,
    isExternalDrag,
    dragOverFolder,
    draggedFilesRef,
    setDragOverFolder,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleFolderDragOver,
    handleFolderDragLeave,
    handleDropOnFolder
  }
}
```

---

## Part 4: Move Context Menu to Shared Location

### 4.1 Create Directory Structure

```
src/components/shared/FileContextMenu/
├── index.ts
├── FileContextMenu.tsx
├── types.ts
├── hooks/
│   ├── index.ts
│   ├── useMenuPosition.ts
│   └── useContextMenuState.ts
├── items/
│   ├── index.ts
│   └── [existing item components]
└── dialogs/
    ├── index.ts
    └── [existing dialog components]
```

### 4.2 Move from `src/components/context-menu/` and `src/components/FileContextMenu.tsx`

The existing sidebar context menu is more complete. Move it to the shared location.

### 4.3 Update FileTree to Use Shared Context Menu

```typescript
// In FileTree.tsx
import { FileContextMenu } from '@/components/shared/FileContextMenu'
```

---

## Part 5: Update FileTree to Use Shared Hooks

### 5.1 Replace Clipboard Logic

```typescript
// BEFORE (inline in FileTree.tsx)
const [clipboard, setClipboard] = useState<{ files: LocalFile[]; operation: 'copy' | 'cut' } | null>(null)
const handleCopy = () => { ... }
const handleCut = () => { ... }
const handlePaste = async () => { ... }

// AFTER
import { useClipboard } from '@/hooks/useClipboard'

const { clipboard, handleCopy, handleCut, handlePaste } = useClipboard({
  files,
  selectedFiles,
  userId: user?.id,
  onRefresh,
  addToast
})
```

### 5.2 Replace Selection Calculations

```typescript
// BEFORE (inline useMemo calls)
const selectedCheckinableFiles = useMemo(() => { ... }, [...])
const selectedDownloadableFiles = useMemo(() => { ... }, [...])
// etc.

// AFTER
import { useSelectionCategories } from '@/hooks/useSelectionCategories'

const categories = useSelectionCategories({
  files,
  selectedFiles,
  userId: user?.id
})
// Access as: categories.checkinable, categories.downloadable, etc.
```

### 5.3 Replace Drag-Drop Hook

```typescript
// BEFORE
import { useTreeDragDrop } from './file-tree/hooks/useTreeDragDrop'
const { draggedFilesRef, dragOverFolder, ... } = useTreeDragDrop()

// AFTER
import { useDragDrop } from '@/hooks/useDragDrop'
const { draggedFilesRef, dragOverFolder, ... } = useDragDrop({
  mode: 'tree',
  files,
  selectedFiles,
  onRefresh,
  currentFolder
})
```

---

## Signal Completion

After completing all tasks:

1. Verify FileTree works correctly with all shared hooks
2. Test context menu in FileTree
3. Test drag-drop in FileTree
4. Test clipboard operations
5. **Signal Agent 2** that shared foundation is ready

Agent 2 will then:
- Rename FileBrowser → FilePane
- Update FilePane to use the same shared hooks
- Delete duplicate code

---

## Files Summary

### Created
- `src/lib/fileOperations/types.ts`
- `src/lib/fileOperations/selection.ts`
- `src/lib/fileOperations/clipboard.ts`
- `src/lib/fileOperations/index.ts`
- `src/hooks/useClipboard.ts`
- `src/hooks/useSelectionCategories.ts`
- `src/hooks/useDragDrop.ts`
- `src/components/shared/FileContextMenu/*`

### Renamed
- `src/components/sidebar/explorer/` → `src/components/sidebar/file-tree/`
- `src/components/sidebar/ExplorerView.tsx` → `src/components/sidebar/FileTree.tsx`

### Modified
- `src/components/Sidebar.tsx` (import update)
- `src/components/TabWindow.tsx` (import update)
- `src/hooks/index.ts` (add exports)

### Deleted (after migration)
- `src/components/sidebar/file-tree/hooks/useTreeDragDrop.ts` (replaced by shared)
