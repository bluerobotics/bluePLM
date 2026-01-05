# FileBrowser Completion Plan - Deep Analysis

## Current State Analysis

**File:** `src/components/FileBrowser.tsx`
**Lines:** 3,118
**Target:** 1,500-2,000 lines

### Code Breakdown by Section

| Section | Lines | Description |
|---------|-------|-------------|
| Imports & Constants | 1-113 | ~113 lines |
| Hook Calls & State | 114-700 | ~586 lines (31 hooks, 9 useState) |
| Helper Functions | 700-1340 | ~640 lines (useMemo, useCallback) |
| Inline Handlers | 1340-2000 | ~660 lines (handlers not yet extracted) |
| Drag/Move Logic | 2000-2330 | ~330 lines |
| Return JSX | 2332-3118 | ~786 lines |

### What's Been Done (Good Progress!)

**Extracted Hooks (5 new):**
- `useColumnHandlers` - 7 column handlers
- `useContextMenuHandlers` - 2 context menu handlers  
- `useFileEditHandlers` - 8 edit handlers
- `useConfigHandlers` - 9 config handlers
- `useModalHandlers` - 13 modal handlers

**Pre-existing Hooks (11):**
- `useContextMenuState`, `useDialogState`, `useDragState`, `useRenameState`
- `useInlineActionHover`, `useFileOperations`, `useKeyboardNav`, `useFileSelection`
- `useNavigationHistory`, `useConfigState`
- Modal hooks: `useReviewModal`, `useCheckoutRequestModal`, `useMentionModal`, `useShareModal`, `useECOModal`

**Extracted Components:**
- `CellRenderer`, `FileListBody`, `FileIconCard`
- `EmptyState`, `LoadingState`, `DragOverlay`, `SelectionBoxOverlay`
- `ColumnHeaders`, `FileContextMenu`, `EmptyContextMenu`, `ColumnContextMenu`
- All modal components, dialog components

---

## Remaining Extraction Opportunities

### Priority 1: Inline Delete Dialog (~150 lines, HIGH IMPACT)

**Location:** Lines 2915-3100

There's a HUGE inline delete confirmation dialog that wasn't extracted! It has:
- Complex logic for counting files/folders
- Server deletion warnings
- Multi-file display
- Async delete operation

**Action:** Extract to `DeleteConfirmationDialog.tsx` component (different from existing `DeleteConfirmDialog`)

```typescript
// New component
interface DeleteConfirmationDialogProps {
  file: LocalFile | null
  selectedFiles: string[]
  sortedFiles: LocalFile[]
  files: LocalFile[]
  deleteEverywhere: boolean
  setDeleteConfirm: (file: LocalFile | null) => void
  setDeleteEverywhere: (value: boolean) => void
  clearSelection: () => void
  onDelete: (files: LocalFile[], deleteFromServer: boolean) => Promise<void>
}
```

---

### Priority 2: FileBrowserToolbar Component (~200 lines)

**Location:** Lines 2346-2545

The entire toolbar section is inline JSX:
- Breadcrumb/search indicator
- Path copy/open buttons
- Add dropdown (files/folder)
- View mode toggle (list/icons)
- Size slider

**Action:** Extract to `FileBrowserToolbar.tsx`

```typescript
interface FileBrowserToolbarProps {
  isSearching: boolean
  searchQuery: string
  searchType: string
  sortedFilesCount: number
  currentPath: string
  vaultPath: string | null
  vaultName: string
  viewMode: 'list' | 'icons'
  iconSize: number
  listRowSize: number
  platform: string
  onNavigate: (path: string) => void
  onNavigateRoot: () => void
  onNavigateUp: () => void
  onBack: () => void
  onForward: () => void
  canGoBack: boolean
  canGoForward: boolean
  onRefresh: () => void
  onAddFiles: () => void
  onAddFolder: () => void
  onViewModeChange: (mode: 'list' | 'icons') => void
  onIconSizeChange: (size: number) => void
  onListRowSizeChange: (size: number) => void
  addToast: ToastFn
}
```

---

### Priority 3: moveFilesToFolder Handler (~100 lines)

**Location:** Lines 2158-2254

This is a large async handler that should be in a hook.

**Action:** Add to `useFileOperations` hook or create `useMoveFiles` hook

---

### Priority 4: handleAddFiles & handleAddFolder (~100 lines combined)

**Location:** Look for these in the file - they handle file dialog and folder dialog operations.

**Action:** Create `useAddFiles` hook or add to `useFileOperations`

---

### Priority 5: Drag Handlers (~60 lines)

**Location:** Lines 2027-2150

- `handleDragOver`
- `handleDragLeave`  
- `handleDrop`

**Action:** Add to `useDragState` hook (it already exists, just needs these handlers)

---

### Priority 6: Icon Grid View (~100 lines)

**Location:** Inside the return JSX, look for `{viewMode === 'icons' && ...}`

**Action:** Extract to `FileGridView.tsx` component

```typescript
interface FileGridViewProps {
  files: LocalFile[]
  iconSize: number
  selectedFiles: string[]
  clipboard: ClipboardState | null
  onSelect: (e: React.MouseEvent, file: LocalFile, index: number) => void
  onDoubleClick: (file: LocalFile) => void
  onContextMenu: (e: React.MouseEvent, file: LocalFile) => void
  // ... other props
}
```

---

### Priority 7: Helper Functions to Utilities (~100 lines)

These functions could be moved to utilities:

```typescript
// Move to features/file-browser/utils/fileStatus.ts
const isBeingProcessed = (relativePath: string) => ...
const isFolderSynced = (folderPath: string): boolean => ...
const getFolderCheckoutStatus = (folderPath: string): 'mine' | 'others' | 'both' | null => ...

// Move to features/file-browser/utils/keybindings.ts  
const matchesKeybinding = (e: KeyboardEvent, action: keyof typeof keybindings): boolean => ...
```

---

## Execution Plan

### Phase 1: Extract Delete Dialog (~150 lines saved)

1. Create `src/features/file-browser/components/Dialogs/DeleteConfirmationDialog.tsx`
2. Move the entire delete dialog JSX block (lines 2915-3100)
3. Import and use in FileBrowser.tsx
4. Run `npm run typecheck`

**Expected:** 3,118 → ~2,970 lines

### Phase 2: Extract Toolbar (~200 lines saved)

1. Create `src/features/file-browser/components/Toolbar/FileBrowserToolbar.tsx`
2. Move toolbar JSX (lines 2346-2545)
3. Import and use in FileBrowser.tsx
4. Run `npm run typecheck`

**Expected:** ~2,970 → ~2,770 lines

### Phase 3: Extract moveFilesToFolder (~100 lines saved)

1. Add to `useFileOperations` hook or create new `useMoveFiles` hook
2. Move the handler logic
3. Import and use in FileBrowser.tsx
4. Run `npm run typecheck`

**Expected:** ~2,770 → ~2,670 lines

### Phase 4: Extract Drag Handlers (~60 lines saved)

1. Add `handleDragOver`, `handleDragLeave`, `handleDrop` to `useDragState` hook
2. Remove from FileBrowser.tsx
3. Run `npm run typecheck`

**Expected:** ~2,670 → ~2,610 lines

### Phase 5: Extract Icon Grid View (~100 lines saved)

1. Create `src/features/file-browser/components/FileGrid/FileGridView.tsx`
2. Move the icon grid JSX
3. Import and use in FileBrowser.tsx
4. Run `npm run typecheck`

**Expected:** ~2,610 → ~2,510 lines

### Phase 6: Move Helper Functions (~100 lines saved)

1. Move `isBeingProcessed`, `isFolderSynced`, `getFolderCheckoutStatus` to utils
2. Move `matchesKeybinding` to utils
3. Import and use in FileBrowser.tsx
4. Run `npm run typecheck`

**Expected:** ~2,510 → ~2,400 lines

### Phase 7: Extract handleAddFiles/handleAddFolder (~100 lines saved)

1. Create `useAddFiles` hook or add to existing hook
2. Move the handlers
3. Import and use in FileBrowser.tsx
4. Run `npm run typecheck`

**Expected:** ~2,400 → ~2,300 lines

---

## Final Expected Result

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Lines | 3,118 | ~2,000-2,300 | -800 to -1,100 |
| Inline handlers | 10+ | 0-2 | Most extracted |
| Inline JSX blocks | 3 | 0 | All componentized |

---

## Files to Create/Modify

**New Files:**
- `src/features/file-browser/components/Dialogs/DeleteConfirmationDialog.tsx`
- `src/features/file-browser/components/Toolbar/FileBrowserToolbar.tsx`
- `src/features/file-browser/components/FileGrid/FileGridView.tsx`

**Modify:**
- `src/features/file-browser/hooks/useDragState.ts` - Add drag handlers
- `src/features/file-browser/hooks/useFileOperations.ts` - Add moveFilesToFolder
- `src/features/file-browser/utils/fileStatus.ts` - Add helper functions
- `src/features/file-browser/components/index.ts` - Export new components
- `src/features/file-browser/index.ts` - Export new items

---

## Rules for the Agent

1. **Start with Phase 1** (Delete Dialog) - Highest impact, clearest extraction
2. **One phase at a time** - Run typecheck after each
3. **Keep prop interfaces clean** - Document what each component/hook needs
4. **Update barrel exports** - Keep index.ts files current
5. **Test after each extraction** - `npm run dev` and test the feature
6. **Preserve all functionality** - Nothing should break

---

## START HERE

1. Read FileBrowser.tsx lines 2915-3100 to understand the delete dialog
2. Create `DeleteConfirmationDialog.tsx` with the extracted JSX
3. Define the props interface based on what the dialog needs
4. Import and use in FileBrowser.tsx
5. Delete the inline code
6. Run `npm run typecheck`
7. Proceed to Phase 2

**Work one phase at a time. Test after each extraction.**
