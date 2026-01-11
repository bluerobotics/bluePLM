# Performance Fix Multi-Agent Plan

## Objective

Fix remaining performance issues in the file tree and file pane by:

1. Making inline action buttons always visible (user requirement)
2. Fixing folder display in the file grid (path normalization issue)
3. Converting remaining monolithic store selectors to selective selectors

**Note:** Agent 1 (Hover Context Fix) is already complete - `VirtualizedTreeRow.tsx` no longer consumes `useTreeHover()` directly; it's properly consumed only in `FileActionButtons`.

## Agent Overview

| Agent | Responsibility | Owns | Dependencies |

|-------|---------------|------|--------------|

| Agent 1 | Always-Visible Buttons CSS | src/index.css | None |

| Agent 2 | Folder Display Fix | filtering.ts, useSorting.ts | None |

| Agent 3 | Remaining Selector Optimizations | Explorer hooks | None |

**Parallelization:** All agents can run in parallel - no dependencies between them.

## Shared Files

| File | Owner | Rule |

|------|-------|------|

| `CHANGELOG.md` | Agent 3 | Add 3.3.2 entry after all agents complete |

---

## Agent 1: Always-Visible Buttons CSS

### Prompt

> Update CSS to make inline action buttons always visible in the file tree with enterprise-level code quality.

>

> **Context:**

> Currently, tree item action buttons are hidden by default (`opacity: 0`) and only shown on hover. The user wants buttons visible all the time for better discoverability.

>

> **Scope:**

> 1. In `src/index.css`, find the tree-item action button styles (around lines 1283-1329)

> 2. Change `.tree-item > .truncate ~ button` and `.tree-item > .truncate ~ span.flex` default opacity from `0` to `0.5`

> 3. Change default `pointer-events` from `none` to `auto`

> 4. Reduce transition time from `0.15s` to `0.05s ease-out` for snappier feel

> 5. Keep hover/selected/current-folder states at `opacity: 1`

>

> **Boundaries:**

> - OWNS: `src/index.css` (lines 1277-1329 tree-item action button styles only)

> - Do NOT modify: Any TypeScript/React files

>

> **Quality Requirements:**

> - Buttons should be subtle when not hovered (opacity 0.5) but clearly visible

> - Hover should still provide clear feedback (opacity 1)

> - No janky transitions - use 0.05s ease-out

>

> **Expected CSS Changes:**

> ```css

> /* File action buttons - always visible but subtle */

> .tree-item > .truncate ~ button {

>   opacity: 0.5;

>   transition: opacity 0.05s ease-out;

>   pointer-events: auto;

> }

>

> /* Folder action buttons - always visible but subtle */

> .tree-item > .truncate ~ span.flex {

>   opacity: 0.5;

>   transition: opacity 0.05s ease-out;

>   pointer-events: auto;

> }

>

> /* Full opacity on hover */

> .tree-item:hover > .truncate ~ button,

> .tree-item:hover > .truncate ~ span.flex {

>   opacity: 1;

> }

> /* ... keep selected, current-folder, processing states at opacity: 1 ... */

> ```

>

> **Deliverables:**

> - Updated `src/index.css` with always-visible buttons

> - Report in `CSS_BUTTONS_AGENT_REPORT.md`

### Boundary

- **OWNS (exclusive write):** `src/index.css` (tree-item action button section only, lines ~1277-1329)
- **READS (no modify):** None

### Tasks

- [ ] Change default button opacity from 0 to 0.5
- [ ] Change pointer-events from none to auto by default
- [ ] Reduce transition time to 0.05s ease-out
- [ ] Keep full opacity on hover/selected/current-folder/processing
- [ ] Verify visually that buttons are visible and hover works

### Deliverables

- Buttons always visible in file tree (subtle at 0.5 opacity, full on hover)

---

## Agent 2: Folder Display Fix

### Prompt

> Fix folder display in the file grid view by adding path normalization with enterprise-level code quality.

>

> **Context:**

> Folders show correctly in the file tree (left panel) but not in the main file grid/list area (right panel). The tree uses `useFlattenedTree` while the FilePane uses `sortedFiles` from `useSorting` which filters via `getFilesInFolder`. The issue is likely path separator mismatch (Windows uses `\`, but the code splits on `/`).

>

> **Scope:**

> 1. In `src/features/source/browser/utils/filtering.ts`, update `getFilesInFolder` function

> 2. Add path normalization to convert `\` to `/` before splitting

> 3. Normalize both `currentPath` and `file.relativePath`

>

> **Boundaries:**

> - OWNS: `src/features/source/browser/utils/filtering.ts`

> - READS: `FilePane.tsx`, `useSorting.ts` (understand data flow)

> - Do NOT modify: `useVaultTree.ts`, `useFlattenedTree.ts`

>

> **Fix:**

> ```typescript

> export function getFilesInFolder(

>   files: LocalFile[],

>   currentPath: string

> ): LocalFile[] {

>   // Normalize path separators for cross-platform compatibility

>   const normalizedCurrentPath = currentPath.replace(/\\/g, '/')

>

>   return files.filter(file => {

>     const normalizedPath = file.relativePath.replace(/\\/g, '/')

>     const fileParts = normalizedPath.split('/')

>

>     if (normalizedCurrentPath === '') {

>       // Root level - show only top-level items

>       return fileParts.length === 1

>     } else {

>       // In a subfolder - show direct children

>       const currentParts = normalizedCurrentPath.split('/')

>

>       // File must be exactly one level deeper than current path

>       if (fileParts.length !== currentParts.length + 1) return false

>

>       // File must start with current path

>       for (let i = 0; i < currentParts.length; i++) {

>         if (fileParts[i] !== currentParts[i]) return false

>       }

>

>       return true

>     }

>   })

> }

> ```

>

> **Quality Requirements:**

> - Enterprise-level code quality

> - Add comment explaining the normalization

> - Maintain exact same filtering logic, just normalize paths first

>

> **Deliverables:**

> - Fixed `filtering.ts` with path normalization

> - Report in `FOLDER_FIX_AGENT_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/features/source/browser/utils/filtering.ts`
- **READS (no modify):** `FilePane.tsx`, `useSorting.ts`

### Tasks

- [ ] Add path normalization to getFilesInFolder function
- [ ] Convert backslashes to forward slashes before path operations
- [ ] Verify folders appear in grid view after fix
- [ ] Run typecheck

### Deliverables

- Folders visible in file grid view
- Consistent behavior between tree and grid

---

## Agent 3: Remaining Selector Optimizations

### Prompt

> Convert remaining monolithic `usePDMStore()` calls to selective selectors in explorer hooks with enterprise-level code quality.

>

> **Context:**

> Several hooks in the explorer feature still use `usePDMStore()` without selectors, causing unnecessary re-renders on any store change. These need to be converted to selective selectors.

>

> **Files to fix:**

> 1. `src/features/source/explorer/file-tree/hooks/useVaultTree.ts` (lines 17-25)

> 2. `src/features/source/explorer/file-tree/hooks/useTreeKeyboardNav.ts` (lines 17-22)

> 3. `src/features/source/explorer/file-tree/hooks/useTreeDragDrop.ts` (lines 29-40)

> 4. `src/features/source/explorer/file-tree/hooks/useTreeExpansion.ts` (lines 9-14)

> 5. `src/features/source/explorer/file-tree/PinnedFoldersSection.tsx` (lines 56-64)

>

> **Scope:**

> 1. Replace `usePDMStore()` with individual `usePDMStore(s => s.value)` selectors

> 2. Use `useShallow` from `zustand/react/shallow` for object/array selections

> 3. Group related action functions with `useShallow`

>

> **Pattern:**

> ```typescript

> // ❌ BEFORE

> const { files, expandedFolders, toggleFolder, user } = usePDMStore()

>

> // ✅ AFTER

> import { useShallow } from 'zustand/react/shallow'

>

> // Primitives - individual selectors

> const files = usePDMStore(s => s.files)

> const expandedFolders = usePDMStore(s => s.expandedFolders)

> const user = usePDMStore(s => s.user)

>

> // Actions - group with useShallow

> const { toggleFolder, setSelectedFiles } = usePDMStore(

>   useShallow(s => ({ toggleFolder: s.toggleFolder, setSelectedFiles: s.setSelectedFiles }))

> )

> ```

>

> **Boundaries:**

> - OWNS: All 5 files listed above

> - OWNS: `CHANGELOG.md` (add 3.3.2 entry)

> - Do NOT modify: `FileTree.tsx`, `VirtualizedTreeRow.tsx`, `TreeItemActions.tsx` (already optimized)

>

> **Quality Requirements:**

> - Enterprise-level code quality

> - Proper TypeScript types (no `any`)

> - Maintain exact same behavior

> - Add `useShallow` import where needed

>

> **CHANGELOG entry:**

> ```markdown

> ## [3.3.2] - YYYY-MM-DD

>

> ### Performance

> - Made inline action buttons always visible in file tree for better discoverability

> - Fixed folder display in file grid view (path normalization)

> - Applied selective Zustand selectors to remaining explorer hooks

> ```

>

> **Deliverables:**

> - All 5 files converted to selective selectors

> - Updated CHANGELOG.md with 3.3.2 entry

> - Report in `SELECTORS_AGENT_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):**
  - `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`
  - `src/features/source/explorer/file-tree/hooks/useTreeKeyboardNav.ts`
  - `src/features/source/explorer/file-tree/hooks/useTreeDragDrop.ts`
  - `src/features/source/explorer/file-tree/hooks/useTreeExpansion.ts`
  - `src/features/source/explorer/file-tree/PinnedFoldersSection.tsx`
  - `CHANGELOG.md`

### Tasks

- [ ] Fix useVaultTree.ts selectors
- [ ] Fix useTreeKeyboardNav.ts selectors
- [ ] Fix useTreeDragDrop.ts selectors
- [ ] Fix useTreeExpansion.ts selectors
- [ ] Fix PinnedFoldersSection.tsx selectors
- [ ] Add CHANGELOG entry for 3.3.2
- [ ] Run typecheck and verify no regressions

### Deliverables

- All explorer hooks using selective selectors
- CHANGELOG.md updated

---

## Execution Order

```
    ┌─────────┬─────────┬─────────┐
    v         v         v         
Agent 1   Agent 2   Agent 3
 (CSS)   (Folders) (Selectors)
```

**All agents run in parallel** - no dependencies between them.

---

## Validation

After all agents complete:

1. Run `npm run typecheck` - must pass
2. Run `npm run build` - must succeed
3. Manual testing:

   - Open vault with many files
   - Verify inline buttons are always visible (subtle, full on hover)
   - Verify folders show in grid view
   - Hover over tree items - verify no lag
   - Navigate folders - verify grid updates correctly

---

## Cleanup

When complete and verified:

- Rename to `COMPLETE-performance-fix-agents.plan.md`