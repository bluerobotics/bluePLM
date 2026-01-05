# FileBrowser Decomposition - Fresh Agent Prompt

You are tasked with completing the decomposition of `src/components/FileBrowser.tsx` (currently 6,312 lines) into a clean, modular architecture.

## Current State

A previous agent created the `src/features/file-browser/` module with extracted components:

```
src/features/file-browser/
├── components/
│   ├── ColumnHeaders/     ✅ Used
│   ├── ContextMenu/       ⚠️ Only ColumnContextMenu & EmptyContextMenu (NOT main file menu)
│   ├── Dialogs/           ✅ Used (CustomConfirm, Conflict, DeleteLocalCheckout)
│   ├── DragDrop/          ✅ Used
│   ├── FileGrid/          ⚠️ Only FileCard (no container)
│   ├── FileList/          ⚠️ Only ListRowIcon (no FileRow, no container)
│   ├── Modals/            ✅ Used
│   ├── Selection/         ✅ Used
│   ├── States/            ✅ Used
│   └── Toolbar/           ✅ Created but NOT integrated
├── hooks/                 ✅ Created (8 hooks) but NOT integrated
├── utils/                 ✅ Created
├── types.ts               ✅ Created
├── constants.ts           ✅ Created
└── index.ts               ✅ Barrel exports
```

**Problem:** The helper components exist but `FileBrowser.tsx` still contains:
- 82 useState calls
- 55 handler functions  
- ~1000 lines of inline context menu JSX
- ~200 lines of `renderCellContent` function
- Inline file row and config row rendering

---

## YOUR MISSION

Extract the remaining large chunks from FileBrowser.tsx. Work in this order:

### Phase 1: Extract Main Context Menu (~1000 lines → FileContextMenu.tsx)

**Location in FileBrowser.tsx:** Search for `{contextMenu && (() => {` (around line 5100)

This is the massive file right-click context menu with:
- Sync/Download/Upload/Checkout actions
- Rename, Delete, Move operations
- Ignore patterns submenu
- State change submenu
- ECO operations
- Share link generation

**Create:** `src/features/file-browser/components/ContextMenu/FileContextMenu.tsx`

**Props needed:**
```typescript
interface FileContextMenuProps {
  contextMenu: { x: number; y: number; file: LocalFile } | null
  onClose: () => void
  // All the handler callbacks
  onRename: (file: LocalFile) => void
  onDelete: (file: LocalFile) => void
  onDownload: (files: LocalFile[]) => Promise<void>
  onUpload: (files: LocalFile[]) => Promise<void>
  onCheckout: (files: LocalFile[]) => Promise<void>
  onCheckin: (files: LocalFile[]) => Promise<void>
  // ... etc (look at what handlers are called in the menu)
  selectedFiles: string[]
  files: LocalFile[]  // For computing context (synced files, etc.)
  user: User | null
  // Submenu state
  showIgnoreSubmenu: boolean
  setShowIgnoreSubmenu: (v: boolean) => void
  showStateSubmenu: boolean
  setShowStateSubmenu: (v: boolean) => void
}
```

**Steps:**
1. Read the context menu JSX block (from `{contextMenu && (() => {` to its closing `})()}`)
2. Create FileContextMenu.tsx with all that JSX
3. Identify all handlers called (handleRename, handleDelete, etc.)
4. Pass them as props
5. Update FileBrowser.tsx to use `<FileContextMenu ... />`
6. Run `npm run typecheck`

---

### Phase 2: Extract renderCellContent (~200 lines → CellRenderer.tsx)

**Location:** Search for `const renderCellContent = (file: LocalFile, columnId: string) =>`

This function renders each cell in the file list table based on column type.

**Create:** `src/features/file-browser/components/FileList/CellRenderer.tsx`

```typescript
interface CellRendererProps {
  file: LocalFile
  columnId: string
  // Required state/callbacks for each cell type
  listRowSize: number
  lowercaseExtensions: boolean
  renamingFile: LocalFile | null
  renameValue: string
  onRenameChange: (value: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  // ... identify all dependencies by reading the function
}

export function CellRenderer({ file, columnId, ...props }: CellRendererProps): React.ReactNode
```

**Steps:**
1. Read the entire `renderCellContent` function
2. List all state/callbacks it uses
3. Create CellRenderer component
4. Replace inline function with imported component
5. Run `npm run typecheck`

---

### Phase 3: Extract File Row (~100 lines → FileRow.tsx)

**Location:** Inside the `sortedFiles.flatMap()` - the `<tr>` element for each file

**Create:** `src/features/file-browser/components/FileList/FileRow.tsx`

```typescript
interface FileRowProps {
  file: LocalFile
  index: number
  columns: Column[]
  isSelected: boolean
  isProcessing: boolean
  isCut: boolean
  isDragTarget: boolean
  listRowSize: number
  onClick: (e: React.MouseEvent, file: LocalFile, index: number) => void
  onDoubleClick: (file: LocalFile) => void
  onContextMenu: (e: React.MouseEvent, file: LocalFile) => void
  onDragStart: (e: React.DragEvent, file: LocalFile) => void
  onDragEnd: () => void
  onDragOver?: (e: React.DragEvent, file: LocalFile) => void
  onDragLeave?: () => void
  onDrop?: (e: React.DragEvent, file: LocalFile) => void
  renderCell: (file: LocalFile, columnId: string) => React.ReactNode
}
```

---

### Phase 4: Extract Config Row (~80 lines → ConfigRow.tsx)

**Location:** Inside the `if (isConfigExpanded && configs.length > 0)` block

**Create:** `src/features/file-browser/components/FileList/ConfigRow.tsx`

---

### Phase 5: Create FileList Container

**Create:** `src/features/file-browser/components/FileList/FileList.tsx`

This will:
- Map over sortedFiles
- Render FileRow for each file
- Render ConfigRow for expanded configs
- Handle the new folder input row

---

### Phase 6: Consolidate State with Hooks

Group related useState calls into custom hooks:

**Create/Update hooks:**
```typescript
// useDialogState.ts
export function useDialogState() {
  const [customConfirm, setCustomConfirm] = useState<CustomConfirmState | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<LocalFile | null>(null)
  const [deleteEverywhere, setDeleteEverywhere] = useState(false)
  // ... other dialog state
  return { customConfirm, setCustomConfirm, deleteConfirm, ... }
}

// useContextMenuState.ts  
export function useContextMenuState() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [emptyContextMenu, setEmptyContextMenu] = useState<EmptyContextMenuState | null>(null)
  const [showIgnoreSubmenu, setShowIgnoreSubmenu] = useState(false)
  const [showStateSubmenu, setShowStateSubmenu] = useState(false)
  // ...
  return { ... }
}

// useConfigState.ts
export function useConfigState() {
  const [expandedConfigFiles, setExpandedConfigFiles] = useState<Set<string>>(new Set())
  const [fileConfigurations, setFileConfigurations] = useState<Map<string, ConfigWithDepth[]>>(new Map())
  const [loadingConfigs, setLoadingConfigs] = useState<Set<string>>(new Set())
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(new Set())
  // ...
  return { ... }
}
```

---

## Rules

1. **Work in phases** - Complete each phase, run typecheck, verify it works before moving to next
2. **Don't break functionality** - Every feature must still work after each extraction
3. **Preserve all handlers** - Make sure every onClick, onContextMenu, etc. is preserved
4. **No `any` types** - Keep strict TypeScript
5. **Update exports** - After each extraction, update index.ts files

---

## Expected Outcome

After all phases:
- FileBrowser.tsx: ~800-1200 lines (orchestration + remaining tightly-coupled logic)
- FileContextMenu.tsx: ~1000 lines
- CellRenderer.tsx: ~250 lines
- FileRow.tsx: ~100 lines
- ConfigRow.tsx: ~80 lines
- FileList.tsx: ~150 lines
- 3-4 new state hooks: ~200 lines total

---

## START HERE

1. Read `src/components/FileBrowser.tsx` lines 5000-6000 to find the context menu
2. Read `src/features/file-browser/components/ContextMenu/index.ts` to see current exports
3. Create `FileContextMenu.tsx` with the extracted JSX
4. Update FileBrowser.tsx to use it
5. Run `npm run typecheck`
6. Proceed to Phase 2

**Take it one phase at a time. Test after each phase.**
