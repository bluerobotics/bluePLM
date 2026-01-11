# FileTree & FileGrid Deep Performance Audit

## Status: UPDATED - Reflecting Completed Work

**Last Updated:** 2026-01-09

---

## Completed Work Summary

Previous agents have already implemented significant optimizations:

| Issue | Status | Report |

|-------|--------|--------|

| getDiffCounts O(N) → O(1) | **COMPLETED** | AGENT_1_METRICS_REPORT.md |

| Store subscriptions in TreeItemActions | **COMPLETED** | AGENT_2_TREE_ITEM_ACTIONS_REPORT.md |

| Hover state causing re-renders | **COMPLETED** (ref-based) | HOVER_AGENT2_CONTEXT_REPORT.md |

| CSS-only button visibility | **COMPLETED** | HOVER_AGENT3_CSS_REPORT.md |

| File tree virtualization | **COMPLETED** | AGENT2_TREE_REPORT.md |

| File list virtualization | **COMPLETED** | AGENT3_LIST_REPORT.md |

| Component memoization | **COMPLETED** | AGENT4_MEMO_REPORT.md |

| Selective Zustand selectors | **COMPLETED** | AGENT1_SELECTORS_REPORT.md |

---

## Established Architecture Pattern (CORRECT - Do Not Change)

The previous agents established a deliberate pattern that should be followed:

```
┌─────────────────────────────────────────────────────────────────┐
│ TOP LEVEL: FileTree.tsx, FilePane.tsx                           │
│ - Subscribe to Zustand store with selective selectors           │
│ - Use useShallow for grouped selections                         │
│ - This is the ONLY place store subscriptions should happen      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ PROPS (not context, not store)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ MIDDLE: VirtualizedTreeRow, FileRow, etc.                       │
│ - Receives ALL data via props from parent                       │
│ - NO usePDMStore calls - eliminated 500+ subscriptions          │
│ - Wrapped in React.memo with custom comparator                  │
│ - Passes props down to children                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ PROPS (not context, not store)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LEAF: FileActionButtons, FolderActionButtons                    │
│ - Pure presentational components                                │
│ - ZERO store subscriptions                                      │
│ - All data via props                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Why Props (Not Context) for Data Passing

**Context would recreate the subscription problem:**

- All context consumers re-render when context value changes
- With 100 visible rows, ANY context change = 100 re-renders

**Props + React.memo prevents cascading re-renders:**

- Each row only re-renders if its specific props change
- Custom `arePropsEqual` comparator in VirtualizedTreeRow ensures minimal re-renders

### Special Case: TreeHoverContext

The hover context uses **refs** specifically to avoid re-renders:

```typescript
// TreeHoverContext.tsx uses refs, NOT useState
downloadHoveredRef: MutableRefObject<boolean>
// Reading from refs doesn't trigger re-renders
```

---

## Remaining Issues to Address

### PRIORITY 1: O(N) Per-Folder Operations

#### Issue 2: PinnedFoldersSection Has 6 Separate O(N) Filters (STILL PENDING)

**Location:** [`PinnedFoldersSection.tsx:164-203`](bluePLM/src/features/source/explorer/file-tree/PinnedFoldersSection.tsx)

**Current:** Each pinned folder runs 6 separate `files.filter()` calls

**Impact:** With 10 pinned folders x 6 filters x 1000 files = 60,000 iterations

**Fix:** Pass `getDiffCounts` and `folderMetrics` as props from FileTree - use O(1) Map lookups

#### Issue 3: renderVaultSection Has 6 O(N) Filters (STILL PENDING)

**Location:** [`FileTree.tsx:612-624`](bluePLM/src/features/source/explorer/FileTree.tsx)

**Current:** Calculates cloudFiles, outdatedFilesCount, etc. with separate filters

**Impact:** 6 x 1000 files = 6,000 iterations per vault

**Fix:** Create a `useVaultStats` hook or extend `folderMetrics` to include vault-level ("") aggregates

---

### PRIORITY 2: Duplicate Computations

#### Issue 4: Duplicate FolderMetrics Computation (NEEDS REVIEW)

**Location:**

- [`useVaultTree.ts:126-315`](bluePLM/src/features/source/explorer/file-tree/hooks/useVaultTree.ts) (FileTree)
- [`useFolderMetrics.ts:26-156`](bluePLM/src/features/source/browser/hooks/useFolderMetrics.ts) (FilePane)

**Current:** Nearly identical O(N) computations in two separate hooks

**Impact:** Double computation on every files change

**Fix:** Consolidate - either:

- Move computation to Zustand as derived state
- Or have FilePane import the folderMetrics from useVaultTree somehow
- Note: Do NOT use context here (per established pattern)

#### Issue 5: Store's `getFolderDiffCounts` is O(N) per call (PARTIALLY ADDRESSED)

**Location:** [`filesSlice.ts:801-828`](bluePLM/src/stores/slices/filesSlice.ts)

**Current:** Iterates through all files on each call

**Note:** Agent 1 fixed `getDiffCounts` in useVaultTree to use Map. However, `getFolderDiffCounts` in the store is still O(N) and called by PinnedFoldersSection directly.

**Fix:** PinnedFoldersSection should receive `getDiffCounts` as prop (from filetree-performance-agents.plan.md Agent 2)

---

### PRIORITY 3: Rendering Inefficiencies

#### Issue 6: FileGridView Lacks Virtualization (NOT YET ADDRESSED)

**Location:** [`FileGridView.tsx:51-83`](bluePLM/src/features/source/browser/components/FileGrid/FileGridView.tsx)

**Current:** Renders all files directly with `.map()`

**Impact:** With 500+ files, creates 500+ React elements

**Fix:** Implement `@tanstack/react-virtual` with row virtualization:

```typescript
const rowVirtualizer = useVirtualizer({
  count: Math.ceil(files.length / columnsPerRow),
  getScrollElement: () => containerRef.current,
  estimateSize: () => iconSize + 60,
  overscan: 3
})
```

#### Issue 8: selectedFiles.includes() in FileListBody (MINOR)

**Location:** [`FileListBody.tsx:169`](bluePLM/src/features/source/browser/components/FileList/FileListBody.tsx)

**Current:** `selectedFiles.includes(file.path)` is O(N) per check

**Impact:** With 100 visible rows x 50 selected files = 5,000 comparisons

**Fix:** Convert to Set before the loop, or pass `selectedFilesSet` as prop

---

### PRIORITY 4: Algorithmic Improvements

#### Issue 9: Second Pass for Checkout Users (LOW PRIORITY)

**Location:** [`useVaultTree.ts:260-294`](bluePLM/src/features/source/explorer/file-tree/hooks/useVaultTree.ts)

**Current:** Second full iteration through files just for deduplication

**Impact:** 2x iterations through all files

**Fix:** Dedupe during first pass using a temporary Map per folder

---

## Implementation Priority

| Priority | Issues | Status |

|----------|--------|--------|

| **P0** | 1 (getDiffCounts) | **COMPLETED** |

| **P0** | 2 (PinnedFolders), 3 (VaultStats) | **IN PROGRESS** (filetree-performance-agents.plan.md) |

| P1 | 4, 5 (duplicate metrics) | Pending |

| P2 | 6 (grid virtualization) | Pending |

| P3 | 8, 9 (micro-optimizations) | Low priority |

---

## Key Architectural Decisions (DO NOT CHANGE)

### 1. Props over Context for Data Passing

**Reason:** Context causes all consumers to re-render. Props + memo allows per-row optimization.

**Established by:** Agent 2 (AGENT_2_TREE_ITEM_ACTIONS_REPORT.md)

### 2. Store Subscriptions Only at Top Level

**Reason:** 100 rows with store subscriptions = 100 re-renders on any store change.

**Established by:** Agent 1 (performance-optimization-agents.plan.md)

### 3. Ref-Based Hover Context

**Reason:** Hover changes frequently but shouldn't cause re-renders.

**Established by:** Agent 3 (HOVER_AGENT3_CSS_REPORT.md)

### 4. Custom React.memo Comparators

**Reason:** Default shallow comparison isn't enough for complex props.

**Established by:** Agent 4 (AGENT4_MEMO_REPORT.md)

---

## Validation Checklist

After implementing remaining fixes:

- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] Open vault with 500+ files - no freeze
- [ ] Download 10+ files - UI remains responsive
- [ ] Expand/collapse folders - instant response
- [ ] Profile with React DevTools - < 16ms renders

---

## Related Plans

- [`filetree-performance-agents.plan.md`](filetree-performance-agents.plan.md) - Currently being executed for Issues 2 and 3
- [`performance-optimization-agents.plan.md`](performance-optimization-agents.plan.md) - Completed base optimization work
- [`hover-performance-fix.plan.md`](hover-performance-fix.plan.md) - Completed hover optimization