# FileBrowser Final Push - Agent Prompt

## Current State

Previous agents have made great progress:
- **Lines:** 3,780 (down from 7,000+)
- **useState calls:** 9 (down from 82!)
- **Handler functions:** 51 remaining

But the target is ~1,500-2,000 lines. We need to extract more.

---

## Remaining useState (Keep These)

These 9 are fine to keep:
```typescript
const [_isDeleting, _setIsDeleting] = useState(false)
const [platform, setPlatform] = useState<string>('win32')
const [undoStack, setUndoStack] = useState<...>([])
const [currentMachineId, setCurrentMachineId] = useState<string | null>(null)
const [clipboard, setClipboard] = useState<...>(null)
const [watchingFiles, setWatchingFiles] = useState<Set<string>>(new Set())
const [isTogglingWatch, setIsTogglingWatch] = useState(false)
const [customMetadataColumns, setCustomMetadataColumns] = useState<...>([])
const [addMenuOpen, setAddMenuOpen] = useState(false)
```

---

## YOUR MISSION: Extract Handler Groups

The 51 handlers need to be grouped into hooks. Work on these categories:

### 1. useConfigHandlers (~5 handlers, ~200 lines)

**Create:** `src/features/file-browser/hooks/useConfigHandlers.ts`

Extract these handlers:
- `handleConfigTabChange`
- `handleConfigDescriptionChange`  
- `handleConfigRowClick`
- `handleConfigContextMenu`
- `handleExportConfigs`

```typescript
export function useConfigHandlers(deps: ConfigHandlersDeps) {
  const handleConfigTabChange = useCallback(...) 
  const handleConfigDescriptionChange = useCallback(...)
  const handleConfigRowClick = useCallback(...)
  const handleConfigContextMenu = useCallback(...)
  const handleExportConfigs = useCallback(...)
  
  return {
    handleConfigTabChange,
    handleConfigDescriptionChange,
    handleConfigRowClick,
    handleConfigContextMenu,
    handleExportConfigs
  }
}
```

### 2. useColumnHandlers (~6 handlers, ~100 lines)

**Create:** `src/features/file-browser/hooks/useColumnHandlers.ts`

Extract these handlers:
- `handleColumnResize`
- `handleColumnDragStart`
- `handleColumnDragOver`
- `handleColumnDragLeave`
- `handleColumnDrop`
- `handleColumnDragEnd`
- `handleColumnHeaderContextMenu`

### 3. useModalHandlers (~15 handlers, ~400 lines)

**Create:** `src/features/file-browser/hooks/useModalHandlers.ts`

Extract ALL modal-related handlers:
- `handleOpenReviewModal`, `handleToggleReviewer`, `handleSubmitReviewRequest`
- `handleOpenCheckoutRequestModal`, `handleSubmitCheckoutRequest`
- `handleOpenMentionModal`, `handleToggleMentionUser`, `handleSubmitMention`
- `handleToggleWatch`, `handleQuickShareLink`, `handleCopyShareLink`
- `handleOpenECOModal`, `handleAddToECO`

### 4. useContextMenuHandlers (~3 handlers, ~50 lines)

**Create:** `src/features/file-browser/hooks/useContextMenuHandlers.ts`

Extract:
- `handleContextMenu`
- `handleEmptyContextMenu`
- Already have context menu state hook - add handlers to it

### 5. useFileEditHandlers (~5 handlers, ~200 lines)

**Create:** `src/features/file-browser/hooks/useFileEditHandlers.ts`

Extract:
- `handleCreateFolder`
- `handleRename`
- `handleStartCellEdit`
- `handleCellEdit`
- `handleCancelCellEdit`

---

## Integration Pattern

For each hook:

1. **Identify dependencies** - What state/callbacks does each handler need?
2. **Create the hook** with a deps interface
3. **Move handlers** from FileBrowser.tsx to the hook
4. **Import and use** the hook in FileBrowser.tsx
5. **Delete the old handlers** from FileBrowser.tsx
6. **Run typecheck**

Example integration:
```typescript
// In FileBrowser.tsx
const configHandlers = useConfigHandlers({
  files,
  user,
  expandedConfigFiles,
  fileConfigurations,
  setCustomConfirm,
  addToast,
  // ... other deps
})

const { 
  handleConfigTabChange,
  handleConfigDescriptionChange,
  handleConfigRowClick,
  handleConfigContextMenu,
  handleExportConfigs
} = configHandlers
```

---

## Expected Results

After extracting handlers:
- FileBrowser.tsx: ~2,000-2,500 lines
- 5 new handler hooks: ~1,000 lines total

---

## Order of Operations

1. Start with `useColumnHandlers` (smallest, ~100 lines)
2. Then `useContextMenuHandlers` (~50 lines)  
3. Then `useFileEditHandlers` (~200 lines)
4. Then `useConfigHandlers` (~200 lines)
5. Finally `useModalHandlers` (largest, ~400 lines)

Run `npm run typecheck` after each hook integration.

---

## Rules

1. **Keep handler signatures identical** - Just move the function body
2. **Pass all dependencies via deps object** - Don't access global state
3. **Use useCallback** - All handlers should be memoized
4. **Export the hook and types** from hooks/index.ts
5. **Test after each extraction**

---

## START HERE

1. Read FileBrowser.tsx to find `handleColumnResize` and related column handlers
2. Create `useColumnHandlers.ts`
3. Move the 7 column handlers
4. Import and integrate in FileBrowser.tsx
5. Delete old handlers, run typecheck
6. Move to next group

**Work one group at a time. Test after each.**
