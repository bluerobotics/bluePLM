# Agent 6: FileBrowser Decomposition Completion Plan

> **Status:** Ready for execution  
> **Priority:** High  
> **Estimated Time:** 2-3 hours  
> **Target:** Reduce `FileBrowser.tsx` from 2,758 → ~1,500-2,000 lines

---

## Executive Summary

Agent 5 made excellent progress reducing `FileBrowser.tsx` from ~7,000 lines to **2,758 lines** and created a comprehensive feature module. However, the agent stopped before completing **Phases 3-7** of the original plan:

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Extract Delete Dialog | ✅ Completed |
| Phase 2 | Extract FileToolbar | ✅ Completed |
| **Phase 3** | Extract moveFilesToFolder | ❌ **NOT DONE** |
| **Phase 4** | Extract drag handlers to useDragState | ❌ **NOT DONE** |
| **Phase 5** | Extract FileGridView component | ❌ **NOT DONE** |
| **Phase 6** | Move helper functions to utils | ❌ **NOT DONE** |
| **Phase 7** | Extract handleAddFiles/handleAddFolder | ❌ **NOT DONE** |

Additionally, there are **2 TypeScript errors** that must be fixed first.

---

## Pre-Requisite: Fix TypeScript Errors

Before starting any phase, fix these errors:

### Error 1: Unused Import (Line 12)
```typescript
// REMOVE this line - copyToClipboard is never used
import { copyToClipboard } from '../lib/clipboard'
```

### Error 2: Type Mismatch (Line 2358)
```typescript
// isSearching is `string | boolean` but prop expects `boolean`
// Change:
isSearching={isSearching}
// To:
isSearching={!!isSearching}
```

### Verification
```bash
npm run typecheck
```
**Must pass before proceeding.**

---

## Phase 3: Extract moveFilesToFolder to useFileOperations

> **Goal:** Add move file functionality to the existing `useFileOperations` hook  
> **Lines Saved:** ~100 lines  
> **Expected Result:** 2,758 → ~2,658 lines

### Current Location in FileBrowser.tsx
Look for a handler that moves files between folders. Search for:
- `moveFilesToFolder`
- Function that calls `executeCommand('move', ...)`

### Implementation

**Modify:** `src/features/file-browser/hooks/useFileOperations.ts`

Add to the hook:
```typescript
// Add to UseFileOperationsOptions interface
vaultPath: string | null

// Add to UseFileOperationsReturn interface  
handleMoveFiles: (filesToMove: LocalFile[], targetFolder: string) => Promise<void>

// Add implementation
const handleMoveFiles = useCallback(async (filesToMove: LocalFile[], targetFolder: string) => {
  if (!vaultPath) {
    addToast('error', 'No vault connected')
    return
  }
  
  // Move logic from FileBrowser.tsx
  await executeCommand('move', { 
    files: filesToMove, 
    targetFolder 
  }, { onRefresh, silent: true })
}, [vaultPath, onRefresh, addToast])
```

### Steps
1. Read the moveFilesToFolder handler in FileBrowser.tsx (search for it)
2. Add the handler to `useFileOperations.ts`
3. Add `handleMoveFiles` to the return object
4. Update FileBrowser.tsx to use the hook's handler
5. Remove the inline handler from FileBrowser.tsx
6. Update exports in `hooks/index.ts` if needed
7. Run `npm run typecheck`

---

## Phase 4: Extract Drag Handlers to useDragState

> **Goal:** Move drag event handlers into the existing `useDragState` hook  
> **Lines Saved:** ~280 lines  
> **Expected Result:** ~2,658 → ~2,378 lines

### Current State
`useDragState` currently only manages **state** (draggedFiles, isDraggingOver, etc.) but not the **handlers** (handleDragStart, handleDragOver, handleDrop, etc.).

### Handlers to Extract from FileBrowser.tsx

| Handler | Line | Description |
|---------|------|-------------|
| `handleDragStart` | ~1416 | Initiates drag with file data |
| `handleDragEnd` | ~1489 | Clears drag state |
| `canMoveFiles` | ~1495 | Validates if files can be moved |
| `handleFolderDragOver` | ~1515 | Handles drag over folder rows |
| `handleFolderDragLeave` | ~1566 | Clears folder drag target |
| `handleDropOnFolder` | ~1573 | Drops files onto a folder |
| `handleDragOver` | ~2027 | Global drag over handler |
| `handleDragLeave` | ~2051 | Global drag leave handler |
| `handleDrop` | ~2062 | Global drop handler |

### Implementation

**Modify:** `src/features/file-browser/hooks/useDragState.ts`

The hook needs to become a more comprehensive drag manager:

```typescript
export interface UseDragStateOptions {
  files: LocalFile[]
  selectedFiles: string[]
  user: User | null
  vaultPath: string | null
  onRefresh: (silent?: boolean) => void
  addToast: ToastFn
  setStatusMessage: (msg: string) => void
}

export interface UseDragStateReturn {
  // Existing state...
  draggedFiles: LocalFile[]
  setDraggedFiles: (files: LocalFile[]) => void
  isDraggingOver: boolean
  // ... other state
  
  // NEW: Handlers
  handleDragStart: (e: React.DragEvent, file: LocalFile) => void
  handleDragEnd: () => void
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => Promise<void>
  handleFolderDragOver: (e: React.DragEvent, folder: LocalFile) => void
  handleFolderDragLeave: (e: React.DragEvent) => void
  handleDropOnFolder: (e: React.DragEvent, targetFolder: LocalFile) => Promise<void>
  canMoveFiles: (filesToCheck: LocalFile[]) => boolean
}
```

### Steps
1. Read each handler in FileBrowser.tsx (lines ~1416-2150)
2. Identify all dependencies (state, callbacks, props)
3. Add options interface to `useDragState`
4. Move each handler to the hook as `useCallback`
5. Update the return type and object
6. Update FileBrowser.tsx to pass options and use returned handlers
7. Remove inline handlers from FileBrowser.tsx
8. Run `npm run typecheck`

### ⚠️ Important Notes
- The handlers use `executeCommand` - import from `@/lib/commands`
- They use `logDragDrop` - import from `@/lib/userActionLogger`
- Some handlers access `window.electronAPI` - keep that access

---

## Phase 5: Extract FileGridView Component

> **Goal:** Extract the icon grid view into a separate component  
> **Lines Saved:** ~100 lines  
> **Expected Result:** ~2,378 → ~2,278 lines

### Current Location in FileBrowser.tsx
```typescript
{viewMode === 'icons' && (
  <div className="p-4 grid gap-3" style={{ ... }}>
    {sortedFiles.map((file, index) => (
      <FileIconCard ... />
    ))}
  </div>
)}
```

### Create New Component

**Create:** `src/features/file-browser/components/FileGrid/FileGridView.tsx`

```typescript
import { FileIconCard } from './FileCard'
import type { LocalFile } from '@/stores/pdmStore'

export interface FileGridViewProps {
  files: LocalFile[]
  allFiles: LocalFile[]
  iconSize: number
  selectedFiles: string[]
  clipboard: { files: LocalFile[]; operation: 'copy' | 'cut' } | null
  processingPaths: Set<string>
  userId: string | undefined
  onSelect: (e: React.MouseEvent, file: LocalFile, index: number) => void
  onDoubleClick: (file: LocalFile) => void
  onContextMenu: (e: React.MouseEvent, file: LocalFile) => void
  onDragStart: (e: React.DragEvent, file: LocalFile) => void
  onDragEnd: () => void
}

export function FileGridView({
  files,
  allFiles,
  iconSize,
  selectedFiles,
  clipboard,
  processingPaths,
  userId,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDragEnd
}: FileGridViewProps) {
  return (
    <div 
      className="p-4 grid gap-3"
      style={{ 
        gridTemplateColumns: `repeat(auto-fill, minmax(${iconSize + 24}px, 1fr))` 
      }}
    >
      {files.map((file, index) => (
        <FileIconCard
          key={file.path}
          file={file}
          iconSize={iconSize}
          isSelected={selectedFiles.includes(file.path)}
          isCut={clipboard?.operation === 'cut' && clipboard.files.some(f => f.path === file.path)}
          allFiles={allFiles}
          processingPaths={processingPaths}
          userId={userId}
          onSelect={(e) => onSelect(e, file, index)}
          onDoubleClick={() => onDoubleClick(file)}
          onContextMenu={(e) => onContextMenu(e, file)}
          onDragStart={(e) => onDragStart(e, file)}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  )
}
```

### Steps
1. Read the icon grid JSX in FileBrowser.tsx (around line 2448)
2. Identify all props passed to FileIconCard
3. Create `FileGridView.tsx` with proper interface
4. Add export to `FileGrid/index.ts`
5. Add export to `components/index.ts`
6. Add export to `features/file-browser/index.ts`
7. Import and use in FileBrowser.tsx
8. Remove inline JSX from FileBrowser.tsx
9. Run `npm run typecheck`

---

## Phase 6: Move Helper Functions to Utils

> **Goal:** Use existing utils instead of inline functions  
> **Lines Saved:** ~100 lines  
> **Expected Result:** ~2,278 → ~2,178 lines

### Key Observation
The helper functions **already exist** in `src/features/file-browser/utils/fileStatus.ts`:
- `isFolderSynced(folderPath, files)`
- `getFolderCheckoutStatus(folderPath, files, userId)`

But FileBrowser.tsx has its own inline versions that use `folderMetrics` for O(1) lookup.

### Functions Still Inline in FileBrowser.tsx

| Function | Line | Action |
|----------|------|--------|
| `isFolderSynced` | ~1043 | Use from utils or keep if perf-critical |
| `getFolderCheckoutStatus` | ~1051 | Use from utils or keep if perf-critical |
| `isBeingProcessed` | ~1062 | Move to utils/processingStatus.ts |
| `matchesKeybinding` | ~1355 | Move to utils/keybindings.ts |
| `buildConfigTreeFlat` | ~365 | Move to utils/configTree.ts |

### New Utility: processingStatus.ts

**Create:** `src/features/file-browser/utils/processingStatus.ts`

```typescript
/**
 * Check if a file/folder is being processed by any operation
 */
export function isBeingProcessed(
  relativePath: string,
  processingFolders: Set<string>
): boolean {
  const normalizedPath = relativePath.replace(/\\/g, '/')
  
  if (processingFolders.has(relativePath)) return true
  if (processingFolders.has(normalizedPath)) return true
  
  for (const processingPath of processingFolders) {
    const normalizedProcessingPath = processingPath.replace(/\\/g, '/')
    if (normalizedPath.startsWith(normalizedProcessingPath + '/')) return true
  }
  return false
}
```

### New Utility: keybindings.ts

**Create:** `src/features/file-browser/utils/keybindings.ts`

```typescript
interface Keybinding {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

export function matchesKeybinding(
  e: KeyboardEvent,
  binding: Keybinding
): boolean {
  const ctrlOrMeta = e.ctrlKey || e.metaKey
  const bindingCtrlOrMeta = binding.ctrlKey || binding.metaKey
  
  if (bindingCtrlOrMeta && !ctrlOrMeta) return false
  if (!bindingCtrlOrMeta && ctrlOrMeta) return false
  if (!!binding.altKey !== e.altKey) return false
  if (!!binding.shiftKey !== e.shiftKey) return false
  
  return e.key.toLowerCase() === binding.key.toLowerCase()
}
```

### New Utility: configTree.ts

**Create:** `src/features/file-browser/utils/configTree.ts`

```typescript
import type { ConfigWithDepth } from '../types'

interface ConfigInput {
  name: string
  isActive?: boolean
  parentConfiguration?: string | null
  tabNumber?: string
  description?: string
}

export function buildConfigTreeFlat(configs: ConfigInput[]): ConfigWithDepth[] {
  interface TreeNode {
    config: ConfigInput
    children: TreeNode[]
    depth: number
  }
  
  const nodeMap = new Map<string, TreeNode>()
  const roots: TreeNode[] = []
  
  configs.forEach(config => {
    nodeMap.set(config.name, { config, children: [], depth: 0 })
  })
  
  configs.forEach(config => {
    const node = nodeMap.get(config.name)!
    if (config.parentConfiguration && nodeMap.has(config.parentConfiguration)) {
      const parent = nodeMap.get(config.parentConfiguration)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  
  const flatten = (nodes: TreeNode[]): ConfigWithDepth[] => {
    const result: ConfigWithDepth[] = []
    nodes.forEach(node => {
      result.push({ ...node.config, depth: node.depth })
      result.push(...flatten(node.children))
    })
    return result
  }
  
  return flatten(roots)
}
```

### Steps
1. Create `utils/processingStatus.ts`
2. Create `utils/keybindings.ts`
3. Create `utils/configTree.ts`
4. Update `utils/index.ts` to export all
5. Update `features/file-browser/index.ts` to export all
6. Import utilities in FileBrowser.tsx
7. Remove/replace inline functions
8. Run `npm run typecheck`

---

## Phase 7: Extract handleAddFiles/handleAddFolder

> **Goal:** Extract file/folder addition handlers into a hook  
> **Lines Saved:** ~180 lines  
> **Expected Result:** ~2,178 → ~2,000 lines

### Current Location in FileBrowser.tsx

| Handler | Line | Description |
|---------|------|-------------|
| `handleAddFiles` | ~1749 | Opens file dialog, copies files to vault |
| `handleAddFolder` | ~1880 | Opens folder dialog, copies folder to vault |

### Create New Hook

**Create:** `src/features/file-browser/hooks/useAddFiles.ts`

```typescript
import { useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface UseAddFilesOptions {
  vaultPath: string | null
  currentPath: string
  files: LocalFile[]
  addToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
  setStatusMessage: (msg: string) => void
  onRefresh: (silent?: boolean) => void
}

export interface UseAddFilesReturn {
  handleAddFiles: () => Promise<void>
  handleAddFolder: () => Promise<void>
}

export function useAddFiles({
  vaultPath,
  currentPath,
  files,
  addToast,
  setStatusMessage,
  onRefresh
}: UseAddFilesOptions): UseAddFilesReturn {
  
  const handleAddFiles = useCallback(async () => {
    if (!vaultPath || !window.electronAPI) {
      addToast('error', 'No vault connected')
      return
    }
    
    // Move logic from FileBrowser.tsx handleAddFiles
    // ...
  }, [vaultPath, currentPath, files, addToast, setStatusMessage, onRefresh])
  
  const handleAddFolder = useCallback(async () => {
    if (!vaultPath || !window.electronAPI) {
      addToast('error', 'No vault connected')
      return
    }
    
    // Move logic from FileBrowser.tsx handleAddFolder
    // ...
  }, [vaultPath, currentPath, addToast, setStatusMessage, onRefresh])
  
  return { handleAddFiles, handleAddFolder }
}
```

### Steps
1. Read `handleAddFiles` in FileBrowser.tsx (line ~1749)
2. Read `handleAddFolder` in FileBrowser.tsx (line ~1880)
3. Identify all dependencies
4. Create `useAddFiles.ts` hook
5. Add export to `hooks/index.ts`
6. Add export to `features/file-browser/index.ts`
7. Import and use in FileBrowser.tsx
8. Remove inline handlers from FileBrowser.tsx
9. Run `npm run typecheck`

---

## Bonus Phase 8: Extract Clipboard Operations

> **Optional but recommended**  
> **Lines Saved:** ~70 lines  
> **Expected Result:** ~2,000 → ~1,930 lines

### Handlers to Extract

| Handler | Line | Description |
|---------|------|-------------|
| `handleCopy` | ~1248 | Copy selected files to clipboard |
| `handleCut` | ~1257 | Cut selected files (with checkout validation) |
| `handlePaste` | ~1288 | Paste files (copy or move) |

### Create New Hook

**Create:** `src/features/file-browser/hooks/useClipboard.ts`

```typescript
export interface UseClipboardOptions {
  files: LocalFile[]
  selectedFiles: string[]
  currentPath: string
  vaultPath: string | null
  user: User | null
  addToast: ToastFn
  setStatusMessage: (msg: string) => void
  onRefresh: (silent?: boolean) => void
}

export interface UseClipboardReturn {
  clipboard: { files: LocalFile[]; operation: 'copy' | 'cut' } | null
  setClipboard: (clipboard: { files: LocalFile[]; operation: 'copy' | 'cut' } | null) => void
  handleCopy: () => void
  handleCut: () => void
  handlePaste: () => Promise<void>
}
```

---

## Bonus Phase 9: Extract Config Context Menu

> **Optional but recommended**  
> **Lines Saved:** ~100 lines  
> **Expected Result:** ~1,930 → ~1,830 lines

### Current Location
Lines ~2612-2718 in FileBrowser.tsx - an inline config context menu JSX block.

### Create Component

**Create:** `src/features/file-browser/components/ContextMenu/ConfigContextMenu.tsx`

---

## File Summary

### Files to Create
| File | Phase | Lines |
|------|-------|-------|
| `utils/processingStatus.ts` | 6 | ~20 |
| `utils/keybindings.ts` | 6 | ~20 |
| `utils/configTree.ts` | 6 | ~45 |
| `components/FileGrid/FileGridView.tsx` | 5 | ~50 |
| `hooks/useAddFiles.ts` | 7 | ~180 |
| `hooks/useClipboard.ts` | 8 | ~70 |
| `components/ContextMenu/ConfigContextMenu.tsx` | 9 | ~100 |

### Files to Modify
| File | Phases | Changes |
|------|--------|---------|
| `FileBrowser.tsx` | All | Remove extracted code |
| `hooks/useFileOperations.ts` | 3 | Add moveFilesToFolder |
| `hooks/useDragState.ts` | 4 | Add drag handlers |
| `hooks/index.ts` | 7, 8 | Add exports |
| `utils/index.ts` | 6 | Add exports |
| `components/FileGrid/index.ts` | 5 | Add export |
| `components/index.ts` | 5, 9 | Add exports |
| `features/file-browser/index.ts` | All | Add exports |

---

## Expected Final State

| Metric | Before Agent 5 | After Agent 5 | After Agent 6 |
|--------|----------------|---------------|---------------|
| FileBrowser.tsx Lines | ~7,000 | 2,758 | ~1,500-2,000 |
| Inline handlers | 55+ | 18 | ~5 |
| TypeScript errors | 0 | 2 | 0 |

---

## Verification Checklist

After **each phase**, verify:

- [ ] `npm run typecheck` passes
- [ ] App starts without console errors (`npm run dev`)
- [ ] File browser loads correctly
- [ ] **Specific feature still works** (see below)

### Feature Tests by Phase

| Phase | Test |
|-------|------|
| Pre-req | App compiles, no TS errors |
| 3 | Can move files via paste or drag |
| 4 | Drag and drop files works (internal + external) |
| 5 | Icon/grid view displays correctly |
| 6 | Processing indicator shows, keyboard shortcuts work |
| 7 | "Add Files" and "Add Folder" buttons work |
| 8 | Ctrl+C, Ctrl+X, Ctrl+V work |
| 9 | Right-click on config shows context menu |

---

## Rules for Success

1. **Fix TypeScript errors FIRST** - Nothing else until `npm run typecheck` passes
2. **One phase at a time** - Complete and verify before moving on
3. **Test after each phase** - Don't stack changes
4. **Update all exports** - Barrel files must stay in sync
5. **Preserve functionality** - Every feature must still work
6. **No `any` types** - Keep TypeScript strict
7. **Follow existing patterns** - Look at how other hooks are structured

---

## Quick Start

```bash
# 1. Fix TypeScript errors
# Edit FileBrowser.tsx lines 12 and 2358

# 2. Verify
npm run typecheck

# 3. Start Phase 3
# Read FileBrowser.tsx to find moveFilesToFolder
# Add to useFileOperations.ts
# Test: drag file to folder, should still work

# 4. Continue through phases...
```

**Take it slow. One phase at a time. Test after each extraction.**
