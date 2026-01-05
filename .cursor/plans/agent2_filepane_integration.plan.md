# Agent 2: FilePane + Integration

## Overview

You are responsible for:
1. **Waiting** for Agent 1 to complete the shared foundation
2. **Renaming** FileBrowser → FilePane
3. **Integrating** the shared utilities into FilePane
4. **Deleting** duplicate code

---

## SYNC POINT: Wait for Agent 1

**DO NOT START** until Agent 1 signals completion. They are creating:
- `src/lib/fileOperations/*` (shared utilities)
- `src/hooks/useClipboard.ts`
- `src/hooks/useSelectionCategories.ts`
- `src/hooks/useDragDrop.ts`
- `src/components/shared/FileContextMenu/`

---

## Part 1: Rename FileBrowser → FilePane

### 1.1 Rename Directory

```
BEFORE: src/features/source/browser/
AFTER:  src/features/source/pane/
```

All subdirectories move with it:
- `browser/components/` → `pane/components/`
- `browser/hooks/` → `pane/hooks/`
- `browser/context/` → `pane/context/`
- `browser/utils/` → `pane/utils/`

### 1.2 Rename Main Component

```
BEFORE: src/features/source/browser/FileBrowser.tsx
AFTER:  src/features/source/pane/FilePane.tsx
```

Update component name:
```typescript
// BEFORE
interface FileBrowserProps {
  onRefresh: (silent?: boolean) => void
}

export function FileBrowser({ onRefresh }: FileBrowserProps) {

// AFTER
interface FilePaneProps {
  onRefresh: (silent?: boolean) => void
}

export function FilePane({ onRefresh }: FilePaneProps) {
```

### 1.3 Rename Context

In `src/features/source/pane/context/`:

```typescript
// FileBrowserContext.tsx → FilePaneContext.tsx

// BEFORE
export const FileBrowserContext = createContext<FileBrowserContextValue | null>(null)
export function FileBrowserProvider({ ... }) { ... }
export function useFileBrowserContext() { ... }

// AFTER
export const FilePaneContext = createContext<FilePaneContextValue | null>(null)
export function FilePaneProvider({ ... }) { ... }
export function useFilePaneContext() { ... }
```

Also update `FileBrowserHandlersContext.tsx` → `FilePaneHandlersContext.tsx`

### 1.4 Update All Imports (27 files)

Files that reference FileBrowser:

| File | Changes Needed |
|------|----------------|
| `src/components/TabWindow.tsx` | Import path + component name |
| `src/components/layout/MainContent.tsx` | Import path + component name |
| `src/features/source/index.ts` | Export path |
| `src/features/source/pane/index.ts` | All internal exports |
| `src/features/source/pane/context/index.ts` | Context exports |
| All files in `pane/components/` | Context imports |
| All files in `pane/hooks/` | Context imports |

Use find-and-replace:
- `FileBrowser` → `FilePane`
- `fileBrowser` → `filePane`
- `browser/` → `pane/` (in import paths)
- `useFileBrowserContext` → `useFilePaneContext`
- `FileBrowserProvider` → `FilePaneProvider`

---

## Part 2: Integrate Shared Utilities

### 2.1 Use Shared Clipboard Hook

**Location:** `src/features/source/pane/FilePane.tsx`

```typescript
// BEFORE - local state and handlers
const [clipboard, setClipboard] = useState<{ files: LocalFile[]; operation: 'copy' | 'cut' } | null>(null)

const handleCopy = () => {
  const selectedFileObjects = files.filter(f => selectedFiles.includes(f.path))
  if (selectedFileObjects.length > 0) {
    setClipboard({ files: selectedFileObjects, operation: 'copy' })
    addToast('info', `Copied ${selectedFileObjects.length} item${selectedFileObjects.length > 1 ? 's' : ''}`)
  }
}

const handleCut = () => { ... }
const handlePaste = async () => { ... }

// AFTER - shared hook
import { useClipboard } from '@/hooks/useClipboard'

const {
  clipboard,
  handleCopy,
  handleCut,
  handlePaste,
  hasClipboard
} = useClipboard({
  files,
  selectedFiles,
  userId: user?.id,
  onRefresh,
  addToast
})
```

### 2.2 Use Shared Selection Categories

**Location:** `src/features/source/pane/FilePane.tsx` and hooks

```typescript
// BEFORE - multiple useMemo calculations
const selectedDownloadableFiles = useMemo(() => {
  if (selectedFiles.length <= 1) return []
  return files.filter(f => 
    selectedFiles.includes(f.path) && 
    !f.isDirectory && 
    (f.diffStatus === 'cloud' || f.diffStatus === 'cloud_new' || f.diffStatus === 'outdated')
  )
}, [files, selectedFiles])

const selectedCheckoutableFiles = useMemo(() => { ... }, [...])
const selectedCheckinableFiles = useMemo(() => { ... }, [...])
// etc.

// AFTER - single shared hook
import { useSelectionCategories } from '@/hooks/useSelectionCategories'

const categories = useSelectionCategories({
  files,
  selectedFiles,
  userId: user?.id
})

// Use as:
// categories.downloadable (was selectedDownloadableFiles)
// categories.checkoutable (was selectedCheckoutableFiles)
// categories.checkinable (was selectedCheckinableFiles)
// categories.uploadable (was selectedUploadableFiles)
// categories.updatable (was selectedUpdatableFiles)
```

### 2.3 Use Shared Drag-Drop Hook

**Location:** `src/features/source/pane/FilePane.tsx`

```typescript
// BEFORE
import { useDragState } from './hooks/useDragState'

const {
  isDraggingOver,
  isExternalDrag,
  dragOverFolder,
  draggingColumn, setDraggingColumn,  // KEEP - column-specific
  dragOverColumn, setDragOverColumn,  // KEEP - column-specific
  selectionBox, setSelectionBox,      // KEEP - selection box
  resizingColumn, setResizingColumn,  // KEEP - column resize
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleFolderDragOver,
  handleFolderDragLeave,
  handleDropOnFolder,
} = useDragState({ ... })

// AFTER - split into shared hook + local state
import { useDragDrop } from '@/hooks/useDragDrop'

// File drag-drop (shared)
const {
  isDraggingOver,
  isExternalDrag,
  dragOverFolder,
  draggedFilesRef,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDragLeave,
  handleFolderDragOver,
  handleFolderDragLeave,
  handleDropOnFolder
} = useDragDrop({
  mode: viewMode === 'icons' ? 'grid' : 'list',
  files,
  selectedFiles,
  onRefresh,
  currentFolder
})

// Column handling (keep local - not shared with FileTree)
const [draggingColumn, setDraggingColumn] = useState<string | null>(null)
const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
const [resizingColumn, setResizingColumn] = useState<string | null>(null)

// Selection box (keep local)
const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
```

### 2.4 Use Shared Context Menu

```typescript
// BEFORE
import { FileContextMenu } from './components/ContextMenu/FileContextMenu'

// AFTER
import { FileContextMenu } from '@/components/shared/FileContextMenu'
```

The shared context menu has the same interface, so the JSX usage should remain similar. The main difference is that dialogs are now built into the shared component.

---

## Part 3: Delete Duplicate Code

### 3.1 Delete Duplicate Hooks

After migration, delete these files from `src/features/source/pane/hooks/`:

| File | Reason |
|------|--------|
| `useFileSelection.ts` | Replaced by `@/hooks/useSelectionCategories` |
| `useInlineActionHover.ts` | Merged into shared inline actions |
| `useDragState.ts` | Replaced by `@/hooks/useDragDrop` (keep column parts if complex) |

### 3.2 Delete Duplicate Context Menu

Delete the entire directory:
```
src/features/source/pane/components/ContextMenu/
```

This removes ~15 files that are now in the shared location.

### 3.3 Update Hook Index

Update `src/features/source/pane/hooks/index.ts` to remove deleted exports.

---

## Part 4: Testing

### 4.1 FilePane Functionality Checklist

**List View:**
- [ ] Files display correctly
- [ ] Column headers work (sort, resize, reorder)
- [ ] Row selection (click, Ctrl+click, Shift+click)
- [ ] Context menu opens and all actions work
- [ ] Inline action buttons work
- [ ] Drag files to folders
- [ ] External file drop

**Grid View:**
- [ ] Icons display correctly
- [ ] Selection works
- [ ] Context menu works
- [ ] Drag-drop works

**Dialogs/Modals:**
- [ ] Delete confirmation
- [ ] Review request modal
- [ ] Checkout request modal
- [ ] Mention/notify modal
- [ ] Share link modal
- [ ] ECO modal

**Keyboard:**
- [ ] Navigation (arrow keys)
- [ ] Delete key
- [ ] Ctrl+C / Ctrl+X / Ctrl+V
- [ ] F2 (rename)

### 4.2 Cross-Component Testing

- [ ] Selection syncs between FileTree and FilePane
- [ ] Clipboard works between components
- [ ] Navigating in FileTree updates FilePane

---

## Part 5: Final Cleanup

### 5.1 Update Feature Index

`src/features/source/index.ts`:
```typescript
// BEFORE
export { FileBrowser } from './browser'

// AFTER
export { FilePane } from './pane'
```

### 5.2 Update Any Remaining References

Search codebase for any remaining references to:
- `FileBrowser`
- `browser/` (in source feature context)
- Old context names

### 5.3 Clean Up Unused Imports

Run TypeScript check and fix any import errors:
```bash
npm run typecheck
```

---

## Files Summary

### Renamed
- `src/features/source/browser/` → `src/features/source/pane/`
- `FileBrowser.tsx` → `FilePane.tsx`
- `FileBrowserContext.tsx` → `FilePaneContext.tsx`
- `FileBrowserHandlersContext.tsx` → `FilePaneHandlersContext.tsx`

### Modified
- `src/components/TabWindow.tsx`
- `src/components/layout/MainContent.tsx`
- `src/features/source/index.ts`
- All files in `pane/` directory (import updates)

### Deleted
- `src/features/source/pane/components/ContextMenu/` (entire directory)
- `src/features/source/pane/hooks/useFileSelection.ts`
- `src/features/source/pane/hooks/useInlineActionHover.ts`
- `src/features/source/pane/hooks/useDragState.ts` (or partial)

---

## Coordination Notes

- Agent 1 owns: `src/components/sidebar/file-tree/`, shared hooks, shared context menu
- You own: `src/features/source/pane/`
- Both components now use: `src/hooks/`, `src/lib/fileOperations/`, `src/components/shared/`
