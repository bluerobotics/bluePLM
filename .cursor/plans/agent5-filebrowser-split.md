# Agent 5: FileBrowser Decomposition

## Mission
Split the massive 7000+ line `FileBrowser.tsx` into a well-organized feature module at `features/file-browser/`.

## Ownership Boundaries

**FILES YOU OWN (only you touch these):**
- `src/components/FileBrowser.tsx` → Split and move to feature
- `src/components/file-browser/` → Reorganize and expand
- Create new: `src/features/file-browser/`

**FILES YOU MUST NOT TOUCH:**
- `src/components/core/` (Agent 1)
- `src/components/shared/` (Agent 2)
- `src/features/seasonal-effects/` (Agent 3)
- `src/lib/utils/` (Agent 4)
- Settings, sidebar, backup, command-search folders
- Store files (read only)

---

## Critical Context

The current `FileBrowser.tsx` is approximately 7000 lines and includes:
- Main FileBrowser component
- File list rendering (list and grid views)
- Column headers and resizing
- File selection logic
- Drag and drop handling
- Context menu triggering
- Keyboard navigation
- File operations (checkout, checkin, etc.)
- Multiple inline dialogs
- Sorting logic
- Filtering logic

The `src/components/file-browser/` folder already has:
- `ColumnHeaders.tsx`
- `FileIconCard.tsx`
- `ListRowIcon.tsx`
- `constants.ts`
- `types.ts`
- `hooks/` with useFileSelection, useFileDragDrop, useKeyboardNav, useColumnResize, useFolderMetrics

---

## Target Structure

```
src/features/file-browser/
├── components/
│   ├── FileBrowser.tsx            # Main container (~400 lines max)
│   ├── FileList/
│   │   ├── FileList.tsx           # List view container
│   │   ├── FileRow.tsx            # Single file row
│   │   ├── FolderRow.tsx          # Folder row with expand
│   │   └── index.ts
│   ├── FileGrid/
│   │   ├── FileGrid.tsx           # Grid view container
│   │   ├── FileCard.tsx           # Grid card (existing FileIconCard)
│   │   └── index.ts
│   ├── ColumnHeaders/
│   │   ├── ColumnHeaders.tsx      # Existing
│   │   ├── ColumnResizer.tsx
│   │   └── index.ts
│   ├── Selection/
│   │   ├── SelectionBox.tsx       # Drag selection overlay
│   │   └── index.ts
│   ├── DragDrop/
│   │   ├── DragPreview.tsx
│   │   ├── DropIndicator.tsx
│   │   └── index.ts
│   ├── Toolbar/
│   │   ├── FileToolbar.tsx        # View toggle, actions
│   │   ├── ViewToggle.tsx
│   │   ├── SortDropdown.tsx
│   │   └── index.ts
│   ├── States/
│   │   ├── EmptyState.tsx
│   │   ├── LoadingState.tsx
│   │   ├── ErrorState.tsx
│   │   └── index.ts
│   ├── Dialogs/
│   │   ├── RenameDialog.tsx
│   │   ├── DeleteDialog.tsx
│   │   ├── MoveDialog.tsx
│   │   ├── NewFolderDialog.tsx
│   │   └── index.ts
│   └── index.ts
├── hooks/
│   ├── useFileSelection.ts        # Existing
│   ├── useFileDragDrop.ts         # Existing
│   ├── useKeyboardNav.ts          # Existing
│   ├── useColumnResize.ts         # Existing
│   ├── useFolderMetrics.ts        # Existing
│   ├── useFileOperations.ts       # NEW: checkout, checkin calls
│   ├── useFileContextMenu.ts      # NEW: context menu state
│   ├── useSorting.ts              # NEW: sort logic extraction
│   ├── useFiltering.ts            # NEW: filter logic extraction
│   └── index.ts
├── utils/
│   ├── sorting.ts                 # Column sort comparators
│   ├── filtering.ts               # File filtering logic
│   ├── selection.ts               # Selection math utilities
│   ├── fileStatus.ts              # Status color/icon logic
│   └── index.ts
├── types.ts
├── constants.ts
└── index.ts
```

---

## Phase 1: Setup and Analysis

### Task 1.1: Analyze Current Structure
1. Read `src/components/FileBrowser.tsx` completely
2. Identify all distinct sections:
   - Imports
   - Type definitions
   - Helper functions
   - Main component
   - Sub-components (inline)
   - Event handlers
   - Render sections

### Task 1.2: Create Feature Directory
```bash
mkdir -p src/features/file-browser/components
mkdir -p src/features/file-browser/hooks
mkdir -p src/features/file-browser/utils
```

### Task 1.3: Copy Existing file-browser to Feature
Move everything from `src/components/file-browser/` to `src/features/file-browser/`:
- Copy hooks to `features/file-browser/hooks/`
- Copy types.ts to `features/file-browser/types.ts`
- Copy constants.ts to `features/file-browser/constants.ts`
- Copy ColumnHeaders.tsx to `features/file-browser/components/ColumnHeaders/`
- Copy FileIconCard.tsx to `features/file-browser/components/FileGrid/FileCard.tsx`
- Copy ListRowIcon.tsx to `features/file-browser/components/FileList/`

---

## Phase 2: Extract Utilities

### Task 2.1: Create sorting.ts
Extract sort comparison functions from FileBrowser.tsx:
```typescript
// src/features/file-browser/utils/sorting.ts
import type { LocalFile } from '@/stores/types'

export type SortDirection = 'asc' | 'desc'
export type SortColumn = 'name' | 'extension' | 'size' | 'modified' | 'state' | 'revision' | 'partNumber'

export function compareFiles(
  a: LocalFile,
  b: LocalFile,
  column: SortColumn,
  direction: SortDirection
): number {
  // Extract comparison logic from FileBrowser.tsx
  // ...
}

export function sortFiles(
  files: LocalFile[],
  column: SortColumn,
  direction: SortDirection
): LocalFile[] {
  return [...files].sort((a, b) => compareFiles(a, b, column, direction))
}
```

### Task 2.2: Create filtering.ts
```typescript
// src/features/file-browser/utils/filtering.ts
import type { LocalFile } from '@/stores/types'

export interface FileFilter {
  search?: string
  extensions?: string[]
  states?: string[]
  showHidden?: boolean
}

export function filterFiles(files: LocalFile[], filter: FileFilter): LocalFile[] {
  // Extract filtering logic
}

export function matchesSearch(file: LocalFile, search: string): boolean {
  // Extract search matching logic
}
```

### Task 2.3: Create selection.ts
```typescript
// src/features/file-browser/utils/selection.ts

export interface SelectionBox {
  startX: number
  startY: number
  endX: number
  endY: number
}

export function getFilesInSelectionBox(
  box: SelectionBox,
  fileElements: Map<string, DOMRect>
): string[] {
  // Extract box selection logic
}

export function isPointInBox(
  x: number,
  y: number,
  box: SelectionBox
): boolean {
  // ...
}
```

### Task 2.4: Create fileStatus.ts
```typescript
// src/features/file-browser/utils/fileStatus.ts
import type { DiffStatus } from '@/stores/types'

export function getStatusColor(status: DiffStatus): string {
  // Extract status->color mapping
}

export function getStatusIcon(status: DiffStatus): React.ReactNode {
  // Extract status->icon mapping
}

export function getStatusLabel(status: DiffStatus): string {
  // Extract status->label mapping
}
```

---

## Phase 3: Extract Hooks

### Task 3.1: Create useFileOperations.ts
```typescript
// src/features/file-browser/hooks/useFileOperations.ts
import { useCallback } from 'react'
import { checkout, checkin, download, sync } from '@/lib/commands'
import type { LocalFile } from '@/stores/types'

interface UseFileOperationsProps {
  onRefresh: (silent?: boolean) => void
}

export function useFileOperations({ onRefresh }: UseFileOperationsProps) {
  const handleCheckout = useCallback(async (files: LocalFile[]) => {
    await checkout(files, onRefresh)
  }, [onRefresh])

  const handleCheckin = useCallback(async (files: LocalFile[]) => {
    await checkin(files, onRefresh)
  }, [onRefresh])

  const handleDownload = useCallback(async (files: LocalFile[]) => {
    await download(files, onRefresh)
  }, [onRefresh])

  const handleSync = useCallback(async (files: LocalFile[]) => {
    await sync(files, onRefresh)
  }, [onRefresh])

  return {
    handleCheckout,
    handleCheckin,
    handleDownload,
    handleSync,
  }
}
```

### Task 3.2: Create useFileContextMenu.ts
```typescript
// src/features/file-browser/hooks/useFileContextMenu.ts
import { useState, useCallback } from 'react'
import type { LocalFile } from '@/stores/types'

interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  file: LocalFile | null
  files: LocalFile[]
}

export function useFileContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    file: null,
    files: [],
  })

  const openContextMenu = useCallback((
    e: React.MouseEvent,
    file: LocalFile,
    selectedFiles: LocalFile[]
  ) => {
    e.preventDefault()
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      file,
      files: selectedFiles.length > 0 ? selectedFiles : [file],
    })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }))
  }, [])

  return { contextMenu, openContextMenu, closeContextMenu }
}
```

### Task 3.3: Create useSorting.ts
```typescript
// src/features/file-browser/hooks/useSorting.ts
import { useState, useMemo, useCallback } from 'react'
import { sortFiles, type SortColumn, type SortDirection } from '../utils/sorting'
import type { LocalFile } from '@/stores/types'

export function useSorting(files: LocalFile[]) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const toggleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }, [sortColumn])

  const sortedFiles = useMemo(
    () => sortFiles(files, sortColumn, sortDirection),
    [files, sortColumn, sortDirection]
  )

  return { sortedFiles, sortColumn, sortDirection, toggleSort }
}
```

---

## Phase 4: Extract Components

### Task 4.1: Create FileRow Component
Extract single file row rendering:
```typescript
// src/features/file-browser/components/FileList/FileRow.tsx
```

### Task 4.2: Create FolderRow Component
Extract folder row with expand/collapse:
```typescript
// src/features/file-browser/components/FileList/FolderRow.tsx
```

### Task 4.3: Create FileList Container
```typescript
// src/features/file-browser/components/FileList/FileList.tsx
```

### Task 4.4: Create FileGrid Container
```typescript
// src/features/file-browser/components/FileGrid/FileGrid.tsx
```

### Task 4.5: Create State Components
```typescript
// src/features/file-browser/components/States/EmptyState.tsx
// src/features/file-browser/components/States/LoadingState.tsx
```

### Task 4.6: Extract Dialogs
Move inline dialogs to separate files:
```typescript
// src/features/file-browser/components/Dialogs/RenameDialog.tsx
// src/features/file-browser/components/Dialogs/DeleteDialog.tsx
// etc.
```

---

## Phase 5: Rewrite Main Component

### Task 5.1: Create Slim FileBrowser.tsx
The main FileBrowser.tsx should be ~400 lines max:

```typescript
// src/features/file-browser/components/FileBrowser.tsx
import { useMemo } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { FileList } from './FileList'
import { FileGrid } from './FileGrid'
import { ColumnHeaders } from './ColumnHeaders'
import { EmptyState, LoadingState } from './States'
import { 
  useFileSelection,
  useFileDragDrop,
  useKeyboardNav,
  useSorting,
  useFileOperations,
  useFileContextMenu,
} from '../hooks'

interface FileBrowserProps {
  onRefresh: (silent?: boolean) => void
}

export function FileBrowser({ onRefresh }: FileBrowserProps) {
  // Store state
  const files = usePDMStore(s => s.visibleFiles)
  const viewMode = usePDMStore(s => s.viewMode)
  const isLoading = usePDMStore(s => s.isLoading)
  
  // Hooks
  const { sortedFiles, sortColumn, sortDirection, toggleSort } = useSorting(files)
  const { selectedIds, selectFile, selectAll, clearSelection } = useFileSelection()
  const { contextMenu, openContextMenu, closeContextMenu } = useFileContextMenu()
  const operations = useFileOperations({ onRefresh })
  
  // ... keyboard nav, drag drop setup
  
  if (isLoading) return <LoadingState />
  if (sortedFiles.length === 0) return <EmptyState />
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {viewMode === 'list' && (
        <>
          <ColumnHeaders 
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={toggleSort}
          />
          <FileList 
            files={sortedFiles}
            selectedIds={selectedIds}
            onSelect={selectFile}
            onContextMenu={openContextMenu}
            operations={operations}
          />
        </>
      )}
      
      {viewMode === 'icons' && (
        <FileGrid 
          files={sortedFiles}
          selectedIds={selectedIds}
          onSelect={selectFile}
          onContextMenu={openContextMenu}
        />
      )}
      
      {/* Context Menu rendered separately */}
      {/* Dialogs rendered separately */}
    </div>
  )
}
```

---

## Phase 6: Create Exports and Stubs

### Task 6.1: Create Feature Index
```typescript
// src/features/file-browser/index.ts
export { FileBrowser } from './components/FileBrowser'
export * from './types'
export * from './constants'
```

### Task 6.2: Create Re-export Stub
```typescript
// src/components/FileBrowser.tsx
// Re-export from feature module
export { FileBrowser } from '@/features/file-browser'
```

### Task 6.3: Update components/file-browser/index.ts
```typescript
// src/components/file-browser/index.ts
// Re-export from feature module for backward compatibility
export * from '@/features/file-browser'
```

---

## Verification Checklist

- [ ] `src/features/file-browser/` structure complete
- [ ] All utility functions extracted and tested
- [ ] All hooks extracted with proper typing
- [ ] Main FileBrowser.tsx under 500 lines
- [ ] All inline dialogs moved to Dialogs/
- [ ] Re-export stubs working
- [ ] `npm run typecheck` passes
- [ ] File browser still works:
  - [ ] List view renders
  - [ ] Grid view renders
  - [ ] Selection works
  - [ ] Drag and drop works
  - [ ] Context menu works
  - [ ] Keyboard navigation works
  - [ ] Sorting works
  - [ ] File operations work

---

## Notes for Agent

1. **This is the largest task** - Take it in phases
2. **Don't break functionality** - Test after each phase
3. **Preserve all features** - The existing FileBrowser works; don't lose anything
4. **Keep existing hooks** - The hooks in file-browser/hooks are good, build on them
5. **Reference existing patterns** - Look at how backup/ and command-search/ are organized
6. **Type everything** - No `any` types
