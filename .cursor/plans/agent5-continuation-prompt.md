# Agent 5: FileBrowser Decomposition - CONTINUATION PROMPT

You previously started the FileBrowser refactoring and made good progress. You created:

## What's Already Done

- `src/features/file-browser/components/` (ColumnHeaders, DragDrop, FileGrid, FileList, Selection, States, Toolbar)
- `src/features/file-browser/hooks/` (8 hooks: useFileSelection, useFileDragDrop, useKeyboardNav, useColumnResize, useFolderMetrics, useFileOperations, useFileContextMenu, useSorting)
- `src/features/file-browser/utils/` (sorting.ts, filtering.ts, selection.ts, fileStatus.ts)
- `src/features/file-browser/types.ts`, `constants.ts`, `index.ts`
- Deleted old `src/components/file-browser/` directory

## What's NOT Done

**CRITICAL: `src/components/FileBrowser.tsx` is STILL 7077 LINES - it needs to be split!**

The main component still contains all the rendering logic instead of using your extracted components.

---

## YOUR TASK: Complete the FileBrowser decomposition

The goal is to make `src/components/FileBrowser.tsx` a SLIM orchestrator (~400-500 lines max) that imports and uses your already-extracted components.

---

## Step 1: Analyze what's still in FileBrowser.tsx

Read `src/components/FileBrowser.tsx` and identify these sections that need extraction:

1. **File row rendering logic** → should use `features/file-browser/components/FileList/`
2. **Grid card rendering logic** → should use `features/file-browser/components/FileGrid/`
3. **Context menu state/handlers** → should use `useFileContextMenu` hook
4. **Sorting logic** → should use `useSorting` hook
5. **Selection rendering** → should use `features/file-browser/components/Selection/`
6. **Toolbar/header rendering** → should use `features/file-browser/components/Toolbar/`
7. **Empty/loading states** → should use `features/file-browser/components/States/`
8. **Inline dialogs** (rename, delete, move, etc.) → extract to `features/file-browser/components/Dialogs/`

---

## Step 2: Create missing components in the feature module

You may need to create these additional components that weren't extracted yet:

```
src/features/file-browser/components/
├── FileList/
│   ├── FileList.tsx       # NEW: Main list container
│   ├── FileRow.tsx        # NEW: Single file row rendering
│   ├── FolderRow.tsx      # NEW: Folder row with expand/collapse
│   └── index.ts           # UPDATE: Export new components
├── FileGrid/
│   ├── FileGrid.tsx       # NEW: Main grid container
│   └── index.ts           # UPDATE: Export new components
├── Dialogs/               # NEW FOLDER
│   ├── RenameDialog.tsx
│   ├── DeleteConfirmDialog.tsx
│   ├── MoveDialog.tsx
│   ├── NewFolderDialog.tsx
│   ├── ConflictDialog.tsx
│   └── index.ts
└── index.ts               # UPDATE: Export all
```

---

## Step 3: Rewrite the main FileBrowser.tsx

The new FileBrowser.tsx should be structured like this (TARGET: ~400-500 lines):

```typescript
// src/components/FileBrowser.tsx
import { useMemo, useCallback, useRef, useState } from 'react'
import { usePDMStore } from '@/stores/pdmStore'

// Import from your feature module
import {
  // Components
  FileList,
  FileGrid,
  FileToolbar,
  ColumnHeaders,
  EmptyState,
  LoadingState,
  SelectionBoxOverlay,
  DragOverlay,
  RenameDialog,
  DeleteConfirmDialog,
  // Hooks
  useFileSelection,
  useFileDragDrop,
  useKeyboardNav,
  useSorting,
  useFileContextMenu,
  useColumnResize,
  useFolderMetrics,
  // Utils & Types
  filterValidFiles,
  applyFilters,
  type LocalFile,
} from '@/features/file-browser'

interface FileBrowserProps {
  onRefresh: (silent?: boolean) => void
}

export function FileBrowser({ onRefresh }: FileBrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Store state
  const files = usePDMStore(s => s.files)
  const viewMode = usePDMStore(s => s.viewMode)
  const isLoading = usePDMStore(s => s.isLoading)
  const currentFolder = usePDMStore(s => s.currentFolder)
  
  // Use extracted hooks
  const { sortedFiles, sortColumn, sortDirection, toggleSort } = useSorting(files)
  const { selectedIds, ...selection } = useFileSelection()
  const { contextMenu, openContextMenu, closeContextMenu } = useFileContextMenu()
  const dragDrop = useFileDragDrop({ onRefresh })
  const columnResize = useColumnResize()
  const folderMetrics = useFolderMetrics(files)
  
  // Filter and prepare files
  const visibleFiles = useMemo(() => {
    return applyFilters(filterValidFiles(sortedFiles), currentFolder)
  }, [sortedFiles, currentFolder])
  
  // Dialog state (keep minimal state in main component)
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; file: LocalFile | null }>({ open: false, file: null })
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; files: LocalFile[] }>({ open: false, files: [] })
  
  // Early returns for states
  if (isLoading) return <LoadingState />
  if (visibleFiles.length === 0) return <EmptyState currentFolder={currentFolder} />
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden" ref={containerRef}>
      {/* Toolbar */}
      <FileToolbar
        viewMode={viewMode}
        onRefresh={onRefresh}
      />
      
      {/* Content based on view mode */}
      {viewMode === 'list' ? (
        <>
          <ColumnHeaders
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={toggleSort}
            {...columnResize}
          />
          <FileList
            files={visibleFiles}
            selectedIds={selectedIds}
            onSelect={selection.selectFile}
            onContextMenu={openContextMenu}
            folderMetrics={folderMetrics}
            {...dragDrop}
          />
        </>
      ) : (
        <FileGrid
          files={visibleFiles}
          selectedIds={selectedIds}
          onSelect={selection.selectFile}
          onContextMenu={openContextMenu}
          {...dragDrop}
        />
      )}
      
      {/* Selection box overlay */}
      <SelectionBoxOverlay {...selection.selectionBox} />
      
      {/* Drag overlay */}
      <DragOverlay {...dragDrop.dragState} />
      
      {/* Dialogs */}
      <RenameDialog 
        {...renameDialog} 
        onClose={() => setRenameDialog({ open: false, file: null })} 
        onRefresh={onRefresh}
      />
      <DeleteConfirmDialog 
        {...deleteDialog} 
        onClose={() => setDeleteDialog({ open: false, files: [] })} 
        onRefresh={onRefresh}
      />
    </div>
  )
}
```

---

## Step 4: Extract the rendering logic

The biggest parts to extract from the current FileBrowser.tsx:

### 1. File row rendering (~500+ lines) → `FileList/FileRow.tsx`
- All the inline file row JSX
- Status icons, checkout indicators
- Inline action buttons

### 2. Folder row rendering (~200+ lines) → `FileList/FolderRow.tsx`
- Folder expand/collapse
- Folder metrics display

### 3. List container → `FileList/FileList.tsx`
- Maps over files and renders FileRow or FolderRow
- Handles virtualization if needed

### 4. Grid container → `FileGrid/FileGrid.tsx`
- Maps over files and renders FileCard
- Grid layout logic

### 5. Dialog logic (~300+ lines each) → `Dialogs/`
- Rename dialog with validation
- Delete confirmation
- Move dialog
- Conflict resolution dialog

---

## Step 5: Update exports

Update `src/features/file-browser/components/index.ts` to export all new components.

Update `src/features/file-browser/index.ts` to export everything needed by the main FileBrowser.

---

## Step 6: Verify

After refactoring, run `npm run typecheck` - it must pass.

Then test the file browser:
- [ ] List view renders files and folders
- [ ] Grid view renders cards
- [ ] File selection works (click, ctrl+click, shift+click, drag-select)
- [ ] Drag and drop files works
- [ ] Context menu appears on right-click
- [ ] Keyboard navigation works
- [ ] Column sorting works
- [ ] Column resizing works
- [ ] Expand/collapse folders works
- [ ] Rename dialog works
- [ ] Delete confirmation works

---

## CRITICAL RULES

1. **Don't lose functionality** - Every feature that works now must still work after
2. **Test incrementally** - After extracting each major piece, verify the app still works
3. **Preserve all event handlers** - Click, double-click, drag, context menu, keyboard
4. **Keep types strict** - No `any` types
5. **Target 400-500 lines** for the main FileBrowser.tsx

---

## START BY

1. Read the current `src/components/FileBrowser.tsx` (all 7077 lines)
2. Identify which JSX sections are the largest
3. Start by extracting FileRow rendering to `FileList/FileRow.tsx`
4. Then extract FolderRow to `FileList/FolderRow.tsx`
5. Create `FileList.tsx` that uses FileRow and FolderRow
6. Update main FileBrowser to use FileList
7. Verify it works
8. Continue with other extractions

**Take it one component at a time. Test after each extraction.**
