# Performance Optimization Multi-Agent Plan

## Objective

Eliminate rendering latency in the file tree and file explorer by implementing selective Zustand subscriptions, virtualization, and component memoization. All changes are for version **3.3.1**.

## Agent Overview

| Agent | Responsibility | Owns | Dependencies |

|-------|---------------|------|--------------|

| Agent 1 | Selective Zustand Selectors | FileTree.tsx, FilePane.tsx store usage | None |

| Agent 2 | File Tree Virtualization | FileTree component architecture | Agent 1 |

| Agent 3 | File List Virtualization | FilePane list rendering | Agent 1 |

| Agent 4 | Component Memoization | Tree/list item components | Agent 1 |

**Parallelization:** Agent 1 runs first. Agents 2, 3, 4 run in parallel after Agent 1 completes.

## Shared Files

| File | Owner | Rule |

|------|-------|------|

| `package.json` | Agent 2 | Add `@tanstack/react-virtual` dependency |

| `src/stores/selectors.ts` | Agent 1 | Agents 2-4 may import new selectors |

| `CHANGELOG.md` | Agent 4 | Add 3.3.1 entry after all agents complete |

---

## Agent 1: Selective Selectors

### Prompt

> Implement selective Zustand selectors for FileTree and FilePane to eliminate unnecessary re-renders with enterprise-level code quality.

>

> **Context:**

> Currently `FileTree.tsx` (lines 58-91) and `FilePane.tsx` (lines 106-162) destructure 30+ values from a single `usePDMStore()` call. ANY store change triggers full re-renders.

>

> **Scope:**

> 1. Split monolithic `usePDMStore()` calls into individual selectors

> 2. Use `shallow` comparison from `zustand/shallow` for object/array selections

> 3. Group related selectors into custom hooks where logical

> 4. Add new memoized selectors to `src/stores/selectors.ts` for derived state

>

> **Boundaries:**

> - OWNS: Store usage patterns in `src/features/source/explorer/FileTree.tsx`, `src/features/source/browser/FilePane.tsx`

> - OWNS: `src/stores/selectors.ts` (add new selectors)

> - Do NOT modify: Store slice implementations, component logic/JSX

>

> **Pattern to follow:**

> ```typescript

> // ❌ BEFORE - triggers re-render on ANY state change

> const { files, selectedFiles, expandedFolders, ... } = usePDMStore()

>

> // ✅ AFTER - only re-renders when specific values change

> import { shallow } from 'zustand/shallow'

> const files = usePDMStore(s => s.files)

> const selectedFiles = usePDMStore(s => s.selectedFiles, shallow)

> const { toggleFolder, setCurrentFolder } = usePDMStore(

>   s => ({ toggleFolder: s.toggleFolder, setCurrentFolder: s.setCurrentFolder }),

>   shallow

> )

> ```

>

> **Quality Requirements:**

> - Enterprise-level code quality and organization

> - Proper TypeScript types (no `any`)

> - Follow existing selector patterns in `src/stores/selectors.ts`

> - Maintain exact same component behavior

>

> **Deliverables:**

> - Updated FileTree.tsx with selective selectors

> - Updated FilePane.tsx with selective selectors

> - New selectors in selectors.ts if needed

> - Report in `AGENT1_SELECTORS_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** Store selector patterns in:
  - `src/features/source/explorer/FileTree.tsx` (lines 58-91 store destructure)
  - `src/features/source/browser/FilePane.tsx` (lines 106-162 store destructure)
  - `src/stores/selectors.ts` (new selectors)
- **READS (no modify):** `src/stores/pdmStore.ts`, `src/stores/types.ts`

### Tasks

- [ ] Audit FileTree.tsx store usage and identify selector groups
- [ ] Split FileTree.tsx usePDMStore into selective individual selectors
- [ ] Audit FilePane.tsx store usage and identify selector groups
- [ ] Split FilePane.tsx usePDMStore into selective individual selectors
- [ ] Add any new derived selectors to selectors.ts
- [ ] Run typecheck and verify no regressions

### Deliverables

- Selective selectors in place for Agents 2-4 to build upon
- Same component behavior with fewer re-renders

---

## Agent 2: Tree Virtualization

### Prompt

> Implement virtualization for the FileTree component using @tanstack/react-virtual with enterprise-level code quality.

>

> **Context:**

> The FileTree currently renders ALL tree items to DOM via recursive `renderTreeItem()`. A vault with 5000 files creates 5000+ DOM nodes causing latency.

>

> **Scope:**

> 1. Add `@tanstack/react-virtual` to package.json

> 2. Flatten the tree structure into a virtualized list with depth tracking

> 3. Replace recursive rendering with virtualized rows

> 4. Maintain all existing functionality: expand/collapse, selection, drag-drop, context menus

>

> **Boundaries:**

> - OWNS: `src/features/source/explorer/FileTree.tsx` (rendering architecture)

> - OWNS: `src/features/source/explorer/file-tree/` (may add new files)

> - OWNS: `package.json` (add dependency)

> - Do NOT modify: Store slices, other feature modules

>

> **Virtualization approach:**

> ```typescript

> import { useVirtualizer } from '@tanstack/react-virtual'

>

> // Flatten tree into array with depth info

> const flattenedTree = useMemo(() => {

>   const result: Array<{ file: LocalFile; depth: number }> = []

>   const addItems = (items: LocalFile[], depth: number) => {

>     for (const item of sortChildren(items)) {

>       result.push({ file: item, depth })

>       if (item.isDirectory && expandedFolders.has(item.relativePath)) {

>         addItems(tree[item.relativePath] || [], depth + 1)

>       }

>     }

>   }

>   addItems(tree[''] || [], 0)

>   return result

> }, [tree, expandedFolders, sortChildren])

>

> const virtualizer = useVirtualizer({

>   count: flattenedTree.length,

>   getScrollElement: () => scrollContainerRef.current,

>   estimateSize: () => 28, // row height

>   overscan: 10

> })

> ```

>

> **Quality Requirements:**

> - Enterprise-level code quality and organization

> - Proper TypeScript types (no `any`)

> - Maintain all existing UX: keyboard nav, drag-drop, selection box

> - Smooth scrolling performance

>

> **Deliverables:**

> - Virtualized FileTree component

> - Updated package.json with @tanstack/react-virtual

> - Report in `AGENT2_TREE_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):**
  - `src/features/source/explorer/FileTree.tsx`
  - `src/features/source/explorer/file-tree/` (new files allowed)
  - `package.json` (add @tanstack/react-virtual)
- **READS (no modify):** Store, hooks from Agent 1

### Tasks

- [ ] Add @tanstack/react-virtual to package.json
- [ ] Create flattenTree utility to convert tree to virtualized array
- [ ] Implement useVirtualizer for the tree items
- [ ] Update rendering to use virtualizer.getVirtualItems()
- [ ] Ensure drag-drop, selection, keyboard nav still work
- [ ] Test with large file sets

### Deliverables

- Virtualized tree that only renders visible items
- Smooth scrolling regardless of file count

---

## Agent 3: List Virtualization

### Prompt

> Implement virtualization for the FilePane list view using @tanstack/react-virtual with enterprise-level code quality.

>

> **Context:**

> FileListBody.tsx uses `displayFiles.flatMap()` to render all rows without virtualization. Large directories create many DOM nodes.

>

> **Scope:**

> 1. Replace flatMap rendering with @tanstack/react-virtual

> 2. Handle variable row heights (configs expand under files)

> 3. Maintain all existing functionality: selection, drag-drop, context menus, inline editing

>

> **Boundaries:**

> - OWNS: `src/features/source/browser/components/FileList/FileListBody.tsx`

> - OWNS: `src/features/source/browser/components/FileList/` (may add new files)

> - Do NOT modify: FilePane.tsx (except passing ref if needed), store slices

>

> **Virtualization approach:**

> ```typescript

> import { useVirtualizer } from '@tanstack/react-virtual'

>

> // Calculate rows including expanded configs

> const rows = useMemo(() => {

>   return displayFiles.flatMap(file => {

>     const fileRow = { type: 'file' as const, file }

>     if (expandedConfigFiles.has(file.path)) {

>       const configs = fileConfigurations.get(file.path) || []

>       return [fileRow, ...configs.map(c => ({ type: 'config' as const, file, config: c }))]

>     }

>     return [fileRow]

>   })

> }, [displayFiles, expandedConfigFiles, fileConfigurations])

>

> const virtualizer = useVirtualizer({

>   count: rows.length,

>   getScrollElement: () => tableRef.current,

>   estimateSize: () => listRowSize + 8,

>   overscan: 5

> })

> ```

>

> **Quality Requirements:**

> - Enterprise-level code quality and organization

> - Proper TypeScript types (no `any`)

> - Maintain table structure for column alignment

> - Handle config row expansion correctly

>

> **Deliverables:**

> - Virtualized FileListBody component

> - Report in `AGENT3_LIST_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):**
  - `src/features/source/browser/components/FileList/FileListBody.tsx`
  - `src/features/source/browser/components/FileList/` (new files allowed)
- **READS (no modify):** FilePane.tsx, store, @tanstack/react-virtual (from Agent 2)

### Tasks

- [ ] Create row data structure that includes file rows and config rows
- [ ] Implement useVirtualizer for the table body
- [ ] Update tbody rendering to use virtualizer
- [ ] Handle dynamic row heights for expanded configs
- [ ] Ensure selection, drag-drop, context menus work
- [ ] Test with large directories

### Deliverables

- Virtualized list that only renders visible rows
- Proper handling of config expansion

---

## Agent 4: Component Memoization

### Prompt

> Add React.memo to tree item and list row components to prevent unnecessary re-renders with enterprise-level code quality.

>

> **Context:**

> Tree and list item components re-render when parent re-renders, even if their props haven't changed. React.memo prevents this.

>

> **Scope:**

> 1. Wrap tree item components with React.memo

> 2. Wrap list row components with React.memo

> 3. Add proper comparison functions where needed

> 4. Update CHANGELOG.md with 3.3.1 entry

>

> **Boundaries:**

> - OWNS: `src/features/source/explorer/file-tree/FileTreeItem.tsx`

> - OWNS: `src/features/source/explorer/file-tree/FolderTreeItem.tsx`

> - OWNS: `src/features/source/explorer/file-tree/VaultTreeItem.tsx`

> - OWNS: `src/features/source/browser/components/FileList/FileRow.tsx`

> - OWNS: `src/features/source/browser/components/FileList/ConfigRow.tsx`

> - OWNS: `CHANGELOG.md` (add 3.3.1 entry)

> - Do NOT modify: Parent components, store slices

>

> **Pattern to follow:**

> ```typescript

> import { memo } from 'react'

>

> interface FileRowProps {

>   file: LocalFile

>   isSelected: boolean

>   // ... other props

> }

>

> export const FileRow = memo(function FileRow({

>   file,

>   isSelected,

>   // ... other props

> }: FileRowProps) {

>   // component implementation

> })

>

> // For complex props, add custom comparison:

> export const FileRow = memo(function FileRow(props: FileRowProps) {

>   // ...

> }, (prevProps, nextProps) => {

>   return prevProps.file.path === nextProps.file.path &&

>          prevProps.isSelected === nextProps.isSelected &&

>          // ... other comparisons

> })

> ```

>

> **Quality Requirements:**

> - Enterprise-level code quality and organization

> - Proper TypeScript types (no `any`)

> - Custom comparison functions only where beneficial

> - Don't break existing functionality

>

> **CHANGELOG entry for 3.3.1:**

> ```markdown

> ## [3.3.1] - YYYY-MM-DD

>

> ### Performance

> - Implemented selective Zustand selectors to reduce unnecessary re-renders

> - Added virtualization to file tree for improved performance with large vaults

> - Added virtualization to file list for improved performance with large directories

> - Memoized tree and list item components to prevent cascading re-renders

> ```

>

> **Deliverables:**

> - Memoized tree item components

> - Memoized list row components

> - Updated CHANGELOG.md

> - Report in `AGENT4_MEMO_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):**
  - `src/features/source/explorer/file-tree/FileTreeItem.tsx`
  - `src/features/source/explorer/file-tree/FolderTreeItem.tsx`
  - `src/features/source/explorer/file-tree/VaultTreeItem.tsx`
  - `src/features/source/browser/components/FileList/FileRow.tsx`
  - `src/features/source/browser/components/FileList/ConfigRow.tsx`
  - `CHANGELOG.md`
- **READS (no modify):** Parent components, store

### Tasks

- [ ] Add React.memo to FileTreeItem.tsx
- [ ] Add React.memo to FolderTreeItem.tsx (if exists)
- [ ] Add React.memo to VaultTreeItem.tsx
- [ ] Add React.memo to FileRow.tsx
- [ ] Add React.memo to ConfigRow.tsx
- [ ] Add custom comparison functions where beneficial
- [ ] Update CHANGELOG.md with 3.3.1 performance entry
- [ ] Run typecheck and verify no regressions

### Deliverables

- Memoized components that skip re-renders when props unchanged
- CHANGELOG.md updated for 3.3.1 release

---

## Execution Order

```
Agent 1 (Selective Selectors)
         |
         v
    ┌────┴────┬─────────┐
    v         v         v
Agent 2   Agent 3   Agent 4
(Tree)    (List)    (Memo)
```

**Phase 1:** Agent 1 completes selective selector refactoring

**Phase 2:** Agents 2, 3, 4 run in parallel

---

## Validation

After all agents complete:

1. Run `npm run typecheck` - must pass
2. Run `npm run build` - must succeed
3. Manual testing:

   - Open vault with 1000+ files
   - Navigate tree, expand/collapse folders
   - Scroll file list
   - Perform file operations (checkout, checkin, download)
   - Verify all functionality works as before

4. User feedback on perceived latency improvement

---

## Cleanup

When complete and verified:

- Rename to `COMPLETE-performance-optimization-agents.plan.md`
- Delete agent report files or move to completed folder