# FileBrowser Feature Module

This module contains all components, hooks, and utilities for the file browser view in BluePLM. It provides a full-featured file management interface with list/grid views, drag-and-drop, context menus, and PDM operations.

## Directory Structure

```
browser/
├── FilePane.tsx              # Main orchestrator component (composes 26+ hooks)
├── types.ts                  # TypeScript interfaces and types
├── constants.ts              # Shared constants (sizes, extensions, delays)
├── index.ts                  # Barrel export (public API)
├── README.md                 # This file
├── context/
│   ├── FilePaneContext.tsx     # Shared state provider for child components
│   └── index.ts
├── hooks/                    # React hooks (modular architecture)
│   ├── index.ts              # Barrel export with categorized hooks
│   │
│   │ State Management Hooks
│   ├── useContextMenuState.ts    # Context menu visibility and position
│   ├── useDialogState.ts         # Confirmation dialogs state
│   ├── useConfigState.ts         # SolidWorks configuration expansion
│   ├── useRenameState.ts         # File rename and inline editing
│   ├── useInlineActionHover.ts   # Multi-select button hover states
│   ├── useDragState.ts           # Drag-and-drop state and handlers
│   │
│   │ File Operation Hooks
│   ├── useFileOperations.ts      # Download, upload, checkout, checkin
│   ├── useFileSelection.ts       # Row selection with shift/ctrl
│   ├── useDeleteHandler.ts       # Delete confirmation and execution
│   ├── useAddFiles.ts            # Add files/folders with conflict resolution
│   │
│   │ Handler Hooks
│   ├── useColumnHandlers.ts      # Column resize, reorder, context menu
│   ├── useContextMenuHandlers.ts # File and empty area context menus
│   ├── useFileEditHandlers.ts    # Create folder, rename, inline editing
│   ├── useConfigHandlers.ts      # SolidWorks configuration management
│   ├── useModalHandlers.ts       # Review, notify, share, ECO modals
│   ├── useKeyboardNav.ts         # Keyboard shortcuts and navigation
│   │
│   │ Modal State Hooks
│   ├── useReviewModal.ts         # Review request modal state
│   ├── useCheckoutRequestModal.ts # Checkout request modal state
│   ├── useMentionModal.ts        # Mention/notify modal state
│   ├── useShareModal.ts          # Share link modal state
│   ├── useECOModal.ts            # ECO assignment modal state
│   │
│   │ Performance Hooks
│   ├── useFolderMetrics.ts       # Pre-computed folder stats (O(n) optimization)
│   ├── useSorting.ts             # Memoized file sorting and filtering
│   │
│   │ Utility Hooks
│   ├── useFileStatus.ts          # Centralized file status logic
│   ├── useNavigationHistory.ts   # Back/forward folder navigation
│   ├── useFilePaneOperations.ts  # Composite hook for operations
│   └── useFilePaneView.ts        # Composite hook for view state
│
├── components/
│   ├── index.ts              # Barrel export for all components
│   │
│   ├── ColumnHeaders/        # Table column headers with sort/resize
│   │   ├── ColumnHeaders.tsx
│   │   └── index.ts
│   │
│   ├── ContextMenu/          # Right-click context menus
│   │   ├── FileContextMenu.tsx   # Main file context menu (~240 lines)
│   │   ├── ColumnContextMenu.tsx # Column visibility toggle
│   │   ├── ConfigContextMenu.tsx # SW configuration context menu
│   │   ├── EmptyContextMenu.tsx  # Empty area context menu
│   │   ├── actions/              # Composable action components
│   │   │   ├── OpenActions.tsx       # Open file/folder actions
│   │   │   ├── SyncActions.tsx       # Download, ignore, first check in
│   │   │   ├── FileSystemActions.tsx # Show in explorer, copy path, pin
│   │   │   ├── ClipboardActions.tsx  # Copy, cut, paste
│   │   │   ├── CheckoutActions.tsx   # Checkout, checkin, discard, state
│   │   │   ├── CollaborationActions.tsx # History, review, notify, share
│   │   │   ├── DeleteActions.tsx     # Delete local/server/both, undo
│   │   │   ├── useContextMenuState.ts # Selection state computation
│   │   │   ├── types.ts              # Action component prop types
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── Dialogs/              # Confirmation dialogs
│   │   ├── CustomConfirmDialog.tsx
│   │   ├── ConflictDialog.tsx
│   │   ├── DeleteConfirmDialog.tsx
│   │   ├── DeleteLocalCheckoutDialog.tsx
│   │   └── index.ts
│   │
│   ├── DragDrop/             # Drag-and-drop overlay
│   │   ├── DragOverlay.tsx
│   │   └── index.ts
│   │
│   ├── FileGrid/             # Icon/grid view components
│   │   ├── FileCard.tsx          # Individual file card
│   │   ├── FileGridView.tsx      # Grid container
│   │   └── index.ts
│   │
│   ├── FileList/             # List view components
│   │   ├── CellRenderer.tsx      # Strategy pattern cell dispatcher (~90 lines)
│   │   ├── FileListBody.tsx      # Table body with rows
│   │   ├── FileRow.tsx           # Individual file row
│   │   ├── ConfigRow.tsx         # SW configuration child row
│   │   ├── ListRowIcon.tsx       # File/folder icon with status
│   │   ├── cells/                # Column-specific cell components
│   │   │   ├── NameCell.tsx          # Name with inline actions
│   │   │   ├── StateCell.tsx         # Workflow state badge
│   │   │   ├── RevisionCell.tsx      # Revision display
│   │   │   ├── VersionCell.tsx       # Version number
│   │   │   ├── ItemNumberCell.tsx    # Item/part number
│   │   │   ├── DescriptionCell.tsx   # Editable description
│   │   │   ├── FileStatusCell.tsx    # Sync status indicator
│   │   │   ├── CheckedOutByCell.tsx  # User avatar/name
│   │   │   ├── EcoTagsCell.tsx       # ECO assignment tags
│   │   │   ├── ExtensionCell.tsx     # File extension
│   │   │   ├── SizeCell.tsx          # File size
│   │   │   ├── ModifiedTimeCell.tsx  # Last modified
│   │   │   ├── CustomCell.tsx        # Custom metadata columns
│   │   │   ├── types.ts              # Cell prop types
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── Modals/               # Modal dialogs for collaboration
│   │   ├── ReviewRequestModal.tsx
│   │   ├── CheckoutRequestModal.tsx
│   │   ├── NotifyModal.tsx
│   │   ├── ShareLinkModal.tsx
│   │   ├── ECOModal.tsx
│   │   └── index.ts
│   │
│   ├── Selection/            # Selection box for multi-select
│   │   ├── SelectionBox.tsx
│   │   └── index.ts
│   │
│   ├── States/               # Empty, loading, error states
│   │   ├── EmptyState.tsx
│   │   ├── LoadingState.tsx
│   │   ├── ErrorState.tsx
│   │   └── index.ts
│   │
│   └── Toolbar/              # Top toolbar components
│       ├── FileToolbar.tsx       # Main toolbar container
│       ├── ViewToggle.tsx        # List/grid view toggle
│       ├── SizeSlider.tsx        # Icon size slider
│       ├── AddMenu.tsx           # Add files/folder menu
│       ├── PathActions.tsx       # Navigation buttons
│       ├── SearchIndicator.tsx   # Search results indicator
│       └── index.ts
│
└── utils/                    # Pure utility functions
    ├── index.ts              # Barrel export
    ├── sorting.ts            # File sorting comparators
    ├── filtering.ts          # Search and file filtering
    ├── selection.ts          # Selection box geometry
    ├── fileStatus.ts         # Diff status helpers
    ├── processingStatus.ts   # Processing path detection
    ├── keybindings.ts        # Keyboard shortcut matching
    ├── configTree.ts         # SW configuration tree builder
    └── formatting.ts         # Bytes, speed, duration formatters
```

## Architecture Overview

### Orchestrator Pattern

The `FilePane.tsx` component (~1,400 lines) serves as the **orchestrator** that:

1. Composes 26+ hooks for state and handlers
2. Wires up all event handlers to UI
3. Renders the layout with child components

This is intentional - the complexity is managed through **composition** rather than inheritance or deep component trees.

### Hook Organization

Hooks are organized into five categories:

#### 1. State Management Hooks

These hooks manage local UI state:

| Hook | Purpose | Key State |
|------|---------|-----------|
| `useContextMenuState` | Context menu visibility | `contextMenu`, `emptyContextMenu`, `columnContextMenu` |
| `useDialogState` | Confirmation dialogs | `deleteConfirm`, `customConfirm`, `conflictDialog` |
| `useConfigState` | SW configuration expansion | `expandedConfigFiles`, `fileConfigurations` |
| `useRenameState` | File rename editing | `renamingFile`, `renameValue`, `editingCell` |
| `useDragState` | Drag-and-drop | `isDraggingOver`, `dragOverFolder`, `selectionBox` |

#### 2. File Operation Hooks

These hooks handle PDM file operations:

| Hook | Purpose | Key Methods |
|------|---------|-------------|
| `useFileOperations` | Core file ops | `handleDownload`, `handleCheckout`, `handleCheckin`, `handleUpload` |
| `useFileSelection` | Row selection | `handleRowClick`, `lastClickedIndex` |
| `useDeleteHandler` | Delete workflow | `handleConfirmDelete`, `handleCancelDelete` |
| `useAddFiles` | Add files/folders | `handleAddFiles`, `handleAddFolder` |

#### 3. Handler Hooks

These hooks provide event handlers:

| Hook | Purpose | Key Methods |
|------|---------|-------------|
| `useColumnHandlers` | Column interactions | `handleColumnResize`, `handleColumnDragStart` |
| `useContextMenuHandlers` | Context menu triggers | `handleContextMenu`, `handleEmptyContextMenu` |
| `useFileEditHandlers` | Edit operations | `handleCreateFolder`, `handleRename`, `handleSaveCellEdit` |
| `useConfigHandlers` | SW configurations | `handleConfigTabChange`, `handleExportConfigs` |
| `useModalHandlers` | Modal operations | `handleOpenReviewModal`, `handleSubmitReviewRequest` |
| `useKeyboardNav` | Keyboard shortcuts | Attaches global keyboard listeners |

#### 4. Modal State Hooks

These hooks manage modal dialog state:

| Hook | Purpose |
|------|---------|
| `useReviewModal` | Review request modal state and form data |
| `useCheckoutRequestModal` | Checkout request modal state |
| `useMentionModal` | Mention/notify modal state |
| `useShareModal` | Share link modal state |
| `useECOModal` | ECO assignment modal state |

#### 5. Performance Hooks

These hooks optimize rendering performance:

| Hook | Purpose | Optimization |
|------|---------|--------------|
| `useFolderMetrics` | Pre-compute folder stats | O(n) instead of O(n²) per folder |
| `useSorting` | Memoized sorting | Avoids re-sorting on unrelated updates |

### Component Patterns

#### Strategy Pattern (CellRenderer)

The `CellRenderer` uses a lookup table to dispatch to column-specific components:

```typescript
const cellRenderers: Record<string, React.FC<CellRendererBaseProps>> = {
  name: NameCell,
  state: StateCell,
  revision: RevisionCell,
  // ... 12 total
}
```

This provides O(1) component lookup and easy extensibility.

#### Composition Pattern (FileContextMenu)

The `FileContextMenu` composes 7 action components instead of inline logic:

```tsx
<FileContextMenu>
  <OpenActions />
  <SyncActions />
  <FileSystemActions />
  <ClipboardActions />
  <CheckoutActions />
  <CollaborationActions />
  <DeleteActions />
</FileContextMenu>
```

This reduced the component from ~1,400 to ~240 lines.

### Context Providers

The FilePane uses two context providers to separate UI state from action handlers:

#### FilePaneContext (UI State)

```tsx
<FilePaneProvider 
  onRefresh={onRefresh} 
  customMetadataColumns={columns}
>
  <FilePane />
</FilePaneProvider>
```

Key state provided (from Zustand store and local state):
- Files and selection state
- User and organization info
- All context menu states
- Drag-and-drop state
- Rename and editing state
- Refs for DOM elements
- Inline action hover states

#### FilePaneHandlersContext (Action Handlers)

```tsx
<FilePaneHandlersProvider handlers={handlersContextValue}>
  {/* Cell components can access handlers via useFilePaneHandlers() */}
</FilePaneHandlersProvider>
```

Key handlers provided:
- Inline action handlers: `handleInlineDownload`, `handleInlineCheckout`, etc.
- Computed selection arrays: `selectedDownloadableFiles`, `selectedCheckoutableFiles`, etc.
- Status functions: `isBeingProcessed`, `getFolderCheckoutStatus`, `isFileEditable`
- Config handlers: `canHaveConfigs`, `toggleFileConfigExpansion`, `saveConfigsToSWFile`
- Edit handlers: `handleRename`, `handleSaveCellEdit`, `handleStartCellEdit`

This separation eliminates prop drilling through `CellRenderer` to cell components. Previously, `CellRenderer` received 20+ props that were drilled down to 12 cell components. Now it receives just `file` and `columnId`, with cells accessing handlers via `useFilePaneHandlers()`.

## Type Definitions

### Core Domain Types

| Type | Purpose |
|------|---------|
| `LocalFile` | File with local and PDM data (from store) |
| `FolderMetrics` | Pre-computed folder statistics |
| `ConfigWithDepth` | SW configuration with tree depth |
| `CheckoutUser` | User info for checkout display |
| `FileConflict` | Conflict info for resolution dialog |

### State Types

| Type | Purpose |
|------|---------|
| `ContextMenuState` | Position and file for context menu |
| `SelectionBox` | Coordinates for multi-select box |
| `CustomConfirmState` | Custom confirmation dialog config |
| `ConflictDialogState` | File conflict resolution state |

### Component Props

| Type | Purpose |
|------|---------|
| `FilePaneProps` | Main component props |
| `FileRowProps` | File row rendering props |
| `CellRendererBaseProps` | Common cell component props |
| `ColumnConfig` | Column configuration |

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `DEFAULT_ROW_HEIGHT` | 28 | List row height in pixels |
| `DEFAULT_ICON_SIZE` | 96 | Default icon size for grid view |
| `MIN_COLUMN_WIDTH` | 50 | Minimum column width |
| `ICON_SIZE_MIN/MAX` | 48/256 | Icon size slider range |
| `LIST_ROW_SIZE_MIN/MAX` | 20/48 | Row size slider range |
| `SW_CONFIG_EXTENSIONS` | ['.sldprt', '.sldasm'] | Files with configurations |
| `THUMBNAIL_LOAD_DELAY` | 100 | Delay before loading thumbnails |

## Utility Functions

### Sorting (`utils/sorting.ts`)

| Function | Purpose |
|----------|---------|
| `compareFiles()` | Compare two files by column |
| `sortFiles()` | Sort file array by column/direction |
| `sortByRelevance()` | Sort by search relevance score |

### Filtering (`utils/filtering.ts`)

| Function | Purpose |
|----------|---------|
| `fuzzyMatch()` | Fuzzy string matching |
| `matchesSearch()` | Check if file matches search |
| `filterBySearch()` | Filter files by search query |
| `applyFilters()` | Apply all filters to file list |

### File Status (`utils/fileStatus.ts`)

| Function | Purpose |
|----------|---------|
| `getDiffStatusClass()` | Get CSS class for diff status |
| `getDiffStatusLabel()` | Get human-readable status |
| `isCheckedOutByMe()` | Check if file checked out by user |
| `getFolderCheckoutStatus()` | Get folder checkout status |

### Formatting (`utils/formatting.ts`)

| Function | Purpose |
|----------|---------|
| `formatBytes()` | Format bytes as KB/MB/GB |
| `formatSpeed()` | Format speed as KB/s, MB/s |
| `formatDuration()` | Format seconds as time |

## Usage Example

```tsx
import { FilePane, FilePaneProvider } from '@/features/source/browser'

function SourceFilesView() {
  const handleRefresh = useCallback((silent?: boolean) => {
    // Refresh file list from server
  }, [])

  return (
    <FilePaneProvider 
      onRefresh={handleRefresh}
      customMetadataColumns={customColumns}
    >
      <FilePane onRefresh={handleRefresh} />
    </FilePaneProvider>
  )
}
```

Note: SolidWorks configuration state (expandedConfigFiles, selectedConfigs, etc.)
is now managed in the Zustand store (usePDMStore) following the same pattern
as expandedFolders and selectedFiles.

## Exports

The main `index.ts` barrel export provides:

- `FilePane` - Main component
- All hooks with their return types
- All sub-components with their prop types
- All utility functions
- All constants
- `FilePaneProvider` and `useFilePaneContext`
- All TypeScript types and interfaces
