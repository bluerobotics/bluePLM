# FileBrowser Hook Integration - Agent Prompt

## The Problem

A previous agent extracted components and **created hooks** but **never integrated them** into FileBrowser.tsx.

**Current state:**
- `src/components/FileBrowser.tsx`: 4,362 lines with **82 useState calls**
- `src/features/file-browser/hooks/`: 6 state management hooks that are **NOT being used**

The hooks were created to replace those useState calls, but the integration step was skipped!

---

## Your Mission

Integrate the existing hooks into FileBrowser.tsx to:
1. Replace 82 individual useState calls with ~6 hook calls
2. Reduce FileBrowser.tsx to ~1,500-2,000 lines
3. Make the code maintainable

---

## Available Hooks (Already Created)

These hooks exist in `src/features/file-browser/hooks/` and export all the state you need:

### 1. useContextMenuState
Replaces: `contextMenu`, `emptyContextMenu`, `columnContextMenu`, `configContextMenu`, `contextMenuAdjustedPos`, `showIgnoreSubmenu`, `showStateSubmenu`, refs, timeout refs

```typescript
const {
  contextMenu, setContextMenu,
  emptyContextMenu, setEmptyContextMenu,
  columnContextMenu, setColumnContextMenu,
  configContextMenu, setConfigContextMenu,
  contextMenuAdjustedPos, setContextMenuAdjustedPos,
  contextMenuRef,
  showIgnoreSubmenu, setShowIgnoreSubmenu,
  showStateSubmenu, setShowStateSubmenu,
  ignoreSubmenuTimeoutRef, stateSubmenuTimeoutRef
} = useContextMenuState()
```

### 2. useDialogState
Replaces: `customConfirm`, `deleteConfirm`, `deleteEverywhere`, `deleteLocalCheckoutConfirm`, `conflictDialog`

```typescript
const {
  customConfirm, setCustomConfirm,
  deleteConfirm, setDeleteConfirm,
  deleteEverywhere, setDeleteEverywhere,
  deleteLocalCheckoutConfirm, setDeleteLocalCheckoutConfirm,
  conflictDialog, setConflictDialog,
  clearAllDialogs
} = useDialogState()
```

### 3. useConfigState
Replaces: `expandedConfigFiles`, `fileConfigurations`, `loadingConfigs`, `selectedConfigs`, `lastClickedConfigRef`, `isExportingConfigs`, `savingConfigsToSW`, `justSavedConfigs`

```typescript
const {
  expandedConfigFiles, setExpandedConfigFiles,
  fileConfigurations, setFileConfigurations,
  loadingConfigs, setLoadingConfigs,
  selectedConfigs, setSelectedConfigs,
  lastClickedConfigRef,
  isExportingConfigs, setIsExportingConfigs,
  savingConfigsToSW, setSavingConfigsToSW,
  justSavedConfigs,
  toggleFileConfigExpansion,
  clearConfigSelection
} = useConfigState()
```

### 4. useInlineActionHover
Replaces: `isDownloadHovered`, `isUploadHovered`, `isCheckoutHovered`, `isCheckinHovered`, `isUpdateHovered`

```typescript
const {
  isDownloadHovered, setIsDownloadHovered,
  isUploadHovered, setIsUploadHovered,
  isCheckoutHovered, setIsCheckoutHovered,
  isCheckinHovered, setIsCheckinHovered,
  isUpdateHovered, setIsUpdateHovered,
  clearAllHovers
} = useInlineActionHover()
```

### 5. useDragState
Replaces: `isDraggingOver`, `isExternalDrag`, `draggedFiles`, `dragOverFolder`, `selectionBox`, `isSelecting`, `resizingColumn`, `draggingColumn`, `dragOverColumn`

```typescript
const {
  isDraggingOver, setIsDraggingOver,
  isExternalDrag, setIsExternalDrag,
  draggedFiles, setDraggedFiles,
  dragOverFolder, setDragOverFolder,
  selectionBox, setSelectionBox,
  isSelecting, setIsSelecting,
  resizingColumn, setResizingColumn,
  draggingColumn, setDraggingColumn,
  dragOverColumn, setDragOverColumn,
  startSelection, updateSelection, endSelection,
  clearDragState
} = useDragState()
```

### 6. useRenameState
Replaces: `renamingFile`, `renameValue`, `isCreatingFolder`, `newFolderName`, `editingCell`, `editingCellValue`, `renameInputRef`, `newFolderInputRef`

```typescript
const {
  renamingFile, setRenamingFile,
  renameValue, setRenameValue,
  isCreatingFolder, setIsCreatingFolder,
  newFolderName, setNewFolderName,
  editingCell, setEditingCell,
  editingCellValue, setEditingCellValue,
  renameInputRef, newFolderInputRef,
  startRename, cancelRename,
  startNewFolder, cancelNewFolder,
  startCellEdit, cancelCellEdit
} = useRenameState()
```

---

## Step-by-Step Integration

### Step 1: Add Hook Imports

At the top of FileBrowser.tsx, add:

```typescript
import {
  useContextMenuState,
  useDialogState,
  useConfigState,
  useInlineActionHover,
  useDragState,
  useRenameState
} from '@/features/file-browser/hooks'
```

### Step 2: Replace useState Blocks

Inside the `FileBrowser` function, replace the individual useState calls with hook calls.

**BEFORE (82 useState calls):**
```typescript
const [contextMenu, setContextMenu] = useState<...>(null)
const [emptyContextMenu, setEmptyContextMenu] = useState<...>(null)
const [columnContextMenu, setColumnContextMenu] = useState<...>(null)
// ... 79 more useState calls
```

**AFTER (6 hook calls):**
```typescript
// Context menu state
const contextMenuState = useContextMenuState()
const { contextMenu, setContextMenu, emptyContextMenu, ... } = contextMenuState

// Dialog state
const dialogState = useDialogState()
const { customConfirm, setCustomConfirm, deleteConfirm, ... } = dialogState

// Config state
const configState = useConfigState()
const { expandedConfigFiles, fileConfigurations, ... } = configState

// Inline action hover state
const hoverState = useInlineActionHover()
const { isDownloadHovered, isUploadHovered, ... } = hoverState

// Drag state
const dragState = useDragState()
const { isDraggingOver, selectionBox, ... } = dragState

// Rename state
const renameState = useRenameState()
const { renamingFile, renameValue, isCreatingFolder, ... } = renameState
```

### Step 3: Search and Delete Old useState Calls

After adding hooks, search for and DELETE these useState patterns:

```typescript
// DELETE all of these:
const [contextMenu, setContextMenu] = useState...
const [emptyContextMenu, setEmptyContextMenu] = useState...
const [columnContextMenu, setColumnContextMenu] = useState...
const [configContextMenu, setConfigContextMenu] = useState...
const [contextMenuAdjustedPos, setContextMenuAdjustedPos] = useState...
const [showIgnoreSubmenu, setShowIgnoreSubmenu] = useState...
const [showStateSubmenu, setShowStateSubmenu] = useState...
const contextMenuRef = useRef...
const ignoreSubmenuTimeoutRef = useRef...
const stateSubmenuTimeoutRef = useRef...

const [customConfirm, setCustomConfirm] = useState...
const [deleteConfirm, setDeleteConfirm] = useState...
const [deleteEverywhere, setDeleteEverywhere] = useState...
const [deleteLocalCheckoutConfirm, setDeleteLocalCheckoutConfirm] = useState...

const [expandedConfigFiles, setExpandedConfigFiles] = useState...
const [fileConfigurations, setFileConfigurations] = useState...
const [loadingConfigs, setLoadingConfigs] = useState...
const [selectedConfigs, setSelectedConfigs] = useState...
const lastClickedConfigRef = useRef...
const [isExportingConfigs, setIsExportingConfigs] = useState...
const [savingConfigsToSW, setSavingConfigsToSW] = useState...
const justSavedConfigs = useRef...

const [isDownloadHovered, setIsDownloadHovered] = useState...
const [isUploadHovered, setIsUploadHovered] = useState...
const [isCheckoutHovered, setIsCheckoutHovered] = useState...
const [isCheckinHovered, setIsCheckinHovered] = useState...
const [isUpdateHovered, setIsUpdateHovered] = useState...

const [isDraggingOver, setIsDraggingOver] = useState...
const [isExternalDrag, setIsExternalDrag] = useState...
const [draggedFiles, setDraggedFiles] = useState...
const [dragOverFolder, setDragOverFolder] = useState...
const [selectionBox, setSelectionBox] = useState...
const [isSelecting, setIsSelecting] = useState...
const [resizingColumn, setResizingColumn] = useState...
const [draggingColumn, setDraggingColumn] = useState...
const [dragOverColumn, setDragOverColumn] = useState...

const [renamingFile, setRenamingFile] = useState...
const [renameValue, setRenameValue] = useState...
const [isCreatingFolder, setIsCreatingFolder] = useState...
const [newFolderName, setNewFolderName] = useState...
const [editingCell, setEditingCell] = useState...
const [editingCellValue, setEditingCellValue] = useState...
const renameInputRef = useRef...
const newFolderInputRef = useRef...
```

### Step 4: Verify Nothing Broke

After each group of deletions:
1. Run `npm run typecheck`
2. Fix any type errors (variable names should match)
3. Test the app functionality

---

## Remaining State (Keep These)

Some useState calls are NOT covered by the hooks and should remain:

```typescript
// Navigation
const [navigationHistory, setNavigationHistory] = useState<string[]>([''])
const [historyIndex, setHistoryIndex] = useState(0)
const isNavigatingRef = useRef(false)

// Platform detection
const [platform, setPlatform] = useState<string>('win32')

// Machine ID
const [currentMachineId, setCurrentMachineId] = useState<string | null>(null)

// Undo stack
const [undoStack, setUndoStack] = useState<Array<...>>([])

// Modal states (for modals not covered by dialogs)
const [reviewModal, setReviewModal] = useState<...>(null)
const [checkoutRequestModal, setCheckoutRequestModal] = useState<...>(null)
const [notifyModal, setNotifyModal] = useState<...>(null)
const [shareLinkModal, setShareLinkModal] = useState<...>(null)
const [ecoModal, setEcoModal] = useState<...>(null)

// Clipboard
const [clipboard, setClipboard] = useState<...>(null)

// Last click tracking
const lastClickRef = useRef<...>(null)
```

These remaining ~20 useState calls are fine - they're specific to FileBrowser logic.

---

## Expected Result

After integration:
- **Before:** 82 useState + useRef calls
- **After:** ~6 hook calls + ~20 remaining useState calls
- **Line reduction:** 4,362 → ~2,500-3,000 lines

---

## Order of Operations

1. Read the hooks in `src/features/file-browser/hooks/` to understand what they provide
2. Add hook imports to FileBrowser.tsx
3. Add the 6 hook calls at the top of the component
4. Destructure what you need from each hook
5. Delete the old useState/useRef calls that are now redundant
6. Run `npm run typecheck` after each deletion group
7. Test the app

---

## Critical Rules

1. **Don't change hook implementations** - They're already working
2. **Keep variable names identical** - The hooks use the same names as the existing state
3. **Test after each change** - Don't batch too many deletions
4. **Preserve functionality** - Every feature must still work

---

## START HERE

1. Open `src/components/FileBrowser.tsx`
2. Find the block of useState calls (starts around line 180)
3. Add the hook imports and calls
4. Start deleting the context menu state (first group)
5. Run typecheck
6. Continue with dialog state, config state, etc.

**Work incrementally. Test after each hook integration.**
