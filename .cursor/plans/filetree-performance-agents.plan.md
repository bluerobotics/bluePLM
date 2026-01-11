# File Tree Performance Optimization - Multi-Agent Plan

## Objective

Fix the 10-second UI freeze after downloads by consolidating `getDiffCounts` into the pre-computed `folderMetrics` Map, reducing complexity from O(N × folders) to O(N) + O(1) lookups.

## Agent Overview

| Agent | Responsibility | Owns | Dependencies |

|-------|---------------|------|--------------|

| Agent 1 | Core Metrics Optimization | `useVaultTree.ts` | None |

| Agent 2 | Integration & Prop Passing | `FileTree.tsx`, `PinnedFoldersSection.tsx` | Agent 1 (interface) |

**Parallelization:** Agent 2 can start once Agent 1 commits the `FolderMetrics` interface extension (~5 min in). Agent 2 prepares prop infrastructure while Agent 1 completes computation logic.

## Shared Files

| File | Owner | Rule |

|------|-------|------|

| `useVaultTree.ts` | Agent 1 | Agent 2 imports types only |

| `FileTree.tsx` | Agent 2 | Agent 1 does not modify |

| `PinnedFoldersSection.tsx` | Agent 2 | Agent 1 does not modify |

---

## Agent 1: Core Metrics Optimization

### Prompt

> Optimize the `useVaultTree` hook to include diff counts in the pre-computed `folderMetrics` Map, with enterprise-level code quality.

>

> **Context:**

> Currently, `getDiffCounts()` calls `getFolderDiffCountsFromStore()` which iterates through ALL files (O(N)) for EVERY visible folder, causing O(N × folders) complexity. The `folderMetrics` useMemo already does a single O(N) pass - we need to add diff counting to it.

>

> **Scope:**

> 1. In `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`:

>    - Extend `FolderMetrics` interface with diff count fields:

>      ```typescript

>      // Add to FolderMetrics interface:

>      addedCount: number

>      modifiedCount: number

>      movedCount: number

>      deletedCount: number

>      deletedRemoteCount: number

>      // Note: outdatedFilesCount and cloudFilesCount already exist

>      ```

>    - In the `folderMetrics` useMemo (starting ~line 111), add diff status counting in the existing loop

>    - Update `getDiffCounts` callback (~line 378) to return from `folderMetrics` Map instead of calling `getFolderDiffCountsFromStore`

>

> **Boundaries:**

> - OWNS: `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`

> - READS: `src/stores/slices/filesSlice.ts` (for reference on existing logic)

> - Do NOT modify: `FileTree.tsx`, `PinnedFoldersSection.tsx`, store files

>

> **Quality Requirements:**

> - Enterprise-level code quality and organization

> - Proper TypeScript types (no `any`)

> - Maintain exact same return values from `getDiffCounts`

> - Add JSDoc comment explaining the O(1) optimization

>

> **Implementation Details:**

> The existing loop in `folderMetrics` useMemo iterates through all non-directory files and accumulates stats per parent folder. Add diff status counting here:

> ```typescript

> // In the single-pass loop, add:

> if (file.diffStatus === 'added') m.addedCount++

> else if (file.diffStatus === 'modified') m.modifiedCount++

> else if (file.diffStatus === 'moved') m.movedCount++

> else if (file.diffStatus === 'deleted') m.deletedCount++

> else if (file.diffStatus === 'deleted_remote') m.deletedRemoteCount++

> // outdatedFilesCount and cloudFilesCount already tracked

> ```

>

> **Deliverables:**

> - Updated `useVaultTree.ts` with O(1) diff count lookups

> - Report in `.cursor/reports/AGENT_1_METRICS_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`
- **READS (no modify):** `src/stores/slices/filesSlice.ts`, `src/features/source/explorer/file-tree/types.ts`

### Tasks

- [ ] Extend `FolderMetrics` interface with `addedCount`, `modifiedCount`, `movedCount`, `deletedCount`, `deletedRemoteCount`
- [ ] Initialize these fields in `initMetrics()` helper
- [ ] Add diff status counting in the single-pass loop (alongside existing metrics)
- [ ] Update `getDiffCounts` callback to return from `folderMetrics` Map with O(1) lookup
- [ ] Add fallback for folders not in Map (edge case)
- [ ] Run typecheck and verify no errors

### Deliverables

- `FolderMetrics` interface extended with diff count fields
- `getDiffCounts` returns O(1) lookup from pre-computed Map
- Exact same return shape as before (compatible with existing consumers)

---

## Agent 2: Integration & Prop Passing

### Prompt

> Update FileTree and PinnedFoldersSection to use optimized diff count lookups with enterprise-level code quality.

>

> **Context:**

> Agent 1 has optimized `useVaultTree`'s `getDiffCounts` to use O(1) Map lookups. However, `PinnedFoldersSection.tsx` still calls `getFolderDiffCounts` directly from the store (O(N) each call). We need to pass the optimized function as a prop.

>

> **Scope:**

> 1. In `src/features/source/explorer/FileTree.tsx`:

>    - Pass `getDiffCounts` from `useVaultTree()` to `PinnedFoldersSection` as a prop

>    - Verify `diffCounts` passed to `VirtualizedTreeRow` uses the optimized path

>

> 2. In `src/features/source/explorer/file-tree/PinnedFoldersSection.tsx`:

>    - Add `getDiffCounts` prop to interface

>    - Replace direct `getFolderDiffCounts` store call with the prop

>    - Remove the now-unused `getFolderDiffCounts` from the `usePDMStore` destructure

>

> **Boundaries:**

> - OWNS: `src/features/source/explorer/FileTree.tsx`, `src/features/source/explorer/file-tree/PinnedFoldersSection.tsx`

> - READS: `src/features/source/explorer/file-tree/hooks/useVaultTree.ts` (for types)

> - Do NOT modify: `useVaultTree.ts`, store files

>

> **Quality Requirements:**

> - Enterprise-level code quality and organization

> - Proper TypeScript types (no `any`)

> - Clean prop passing with descriptive names

> - Remove dead code (unused store imports)

>

> **Deliverables:**

> - Updated `FileTree.tsx` passing optimized function

> - Updated `PinnedFoldersSection.tsx` using prop instead of store

> - Report in `.cursor/reports/AGENT_2_INTEGRATION_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/features/source/explorer/FileTree.tsx`, `src/features/source/explorer/file-tree/PinnedFoldersSection.tsx`
- **READS (no modify):** `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`

### Tasks

- [ ] Add `getDiffCounts` prop to `PinnedFoldersSectionProps` interface
- [ ] Pass `getDiffCounts` from `useVaultTree()` result to `PinnedFoldersSection` in FileTree.tsx
- [ ] Update `PinnedFoldersSection` to use prop instead of store function
- [ ] Remove `getFolderDiffCounts` from usePDMStore destructure in PinnedFoldersSection
- [ ] Run typecheck and verify no errors

### Deliverables

- `PinnedFoldersSection` uses optimized O(1) diff counts via prop
- Clean removal of direct store calls for diff counts
- No breaking changes to component behavior

---

## Execution Order

```
Agent 1 (useVaultTree.ts)
    │
    ├─ [5 min] Interface extension ──► Agent 2 can START
    │                                     │
    ├─ [10 min] Computation logic         ├─ Prop infrastructure
    │                                     │
    └─ [15 min] Complete ────────────────►└─ Complete
```

**Parallelization:** Agent 2 can begin once Agent 1 commits the `FolderMetrics` interface changes. Agent 2 should prepare the prop-passing structure while Agent 1 finishes the computation logic.

---

## Validation

After all agents complete:

1. Run `npm run typecheck` - must pass
2. Run `npm run build` - must succeed
3. Manual testing:

   - Open vault with 500+ files
   - Download multiple cloud files
   - Verify UI does NOT freeze for 10 seconds
   - Folder expansion should be instant

---

## Cleanup

When complete and verified:

- Rename to `COMPLETE-filetree-performance-agents.plan.md`