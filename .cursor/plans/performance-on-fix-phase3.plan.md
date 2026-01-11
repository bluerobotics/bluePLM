# Performance O(N) Fix - Phase 3 (Enterprise Integration)

## Status

| Agent | Status | Files |
|-------|--------|-------|
| Agent 1 | **COMPLETE** | `useVaultTree.ts` - O(N) folder metrics pre-computation |
| Agent 2 | **COMPLETE** | `VirtualizedTreeRow.tsx` - Custom memo comparator |
| **Agent 3** | **PENDING** | `FileTree.tsx` + `VirtualizedTreeRow.tsx` - Enterprise integration |
| Agent 4 | Pending | Verification & CHANGELOG |

---

## Review Summary (Agents 1 & 2)

### Agent 1 Accomplishments
- Added `FolderMetrics` type with 14 fields
- Pre-computed `folderMetrics` Map in single O(N) pass
- Updated 5 callback functions to O(1) Map lookups with fallbacks
- Exported `folderMetrics` from hook
- TypeScript: PASS (0 errors)

### Agent 2 Accomplishments  
- Added `arePropsEqual` custom comparator (~15 relevant props)
- Removed `allFiles` from `FolderActionButtons` (uses `diffCounts`)
- Cleaned up `FolderTreeItem.tsx` and `PinnedFoldersSection.tsx`
- Kept `files` prop for drag-and-drop (memo comparator skips it)
- TypeScript: PASS (0 errors)

---

## Agent 3: Enterprise-Level Integration

### Enterprise Architecture Principles

1. **Data flows DOWN** - Pass pre-computed objects, not callbacks
2. **Minimize prop surface** - Consolidate related data into single objects
3. **Stable references** - Map.get() returns stable objects for memoization
4. **Clear ownership** - Components receive data they need, not functions to fetch it

### Prompt

```
Follow the plan in `.cursor/plans/performance-on-fix-phase3.plan.md` and execute Agent 3: Enterprise-Level Integration.

**Context:**
- Agent 1: `useVaultTree` exports `folderMetrics` Map (O(N) pre-computed)
- Agent 2: `VirtualizedTreeRow` has custom memo comparator

**Your job:** Pass pre-computed data directly instead of calling callbacks in render loop.

**Files to modify:**

1. **FileTree.tsx:**
   - Import `folderMetrics` from useVaultTree
   - Add `selectedFilesSet = useMemo(() => new Set(selectedFiles), [selectedFiles])`
   - In render loop, replace callback calls with Map lookup:
     ```typescript
     const metrics = file.isDirectory ? folderMetrics.get(file.relativePath) : null
     ```
   - Pass `folderMetrics={metrics}` instead of separate props
   - Pass `isSelected={selectedFilesSet.has(file.path)}`

2. **VirtualizedTreeRow.tsx:**
   - Update props interface: add `folderMetrics: FolderMetrics | null`
   - Remove separate props: `localOnlyCount`, `folderStats` (extract from folderMetrics)
   - Keep `diffCounts` if from different source
   - Update component to extract values from `folderMetrics`
   - Update memo comparator to compare `folderMetrics`

**Boundaries:**
- OWNS: `FileTree.tsx`, `VirtualizedTreeRow.tsx`
- Do NOT modify: `useVaultTree.ts`, `TreeItemActions.tsx`

**Quality Requirements:**
- Enterprise-level code organization
- JSDoc comments explaining data flow
- Proper TypeScript types
- Preserve all existing functionality

**Deliverables:**
- Updated FileTree.tsx with pre-computed data passing
- Updated VirtualizedTreeRow.tsx with consolidated `folderMetrics` prop  
- Report in `.cursor/reports/AGENT_3_FILETREE_INTEGRATION_REPORT.md`

**When complete:** Run `npm run typecheck` and report results.
```

### Boundary
- **OWNS:** `src/features/source/explorer/FileTree.tsx`
- **OWNS:** `src/features/source/explorer/file-tree/VirtualizedTreeRow.tsx`
- **Do NOT modify:** `useVaultTree.ts`, `TreeItemActions.tsx`

### Tasks
- [ ] Import `folderMetrics` Map from useVaultTree in FileTree
- [ ] Add `selectedFilesSet` with useMemo
- [ ] Replace render loop callback calls with Map lookup
- [ ] Update VirtualizedTreeRowProps: add `folderMetrics`, remove redundant props
- [ ] Update VirtualizedTreeRow to extract values from `folderMetrics`
- [ ] Update memo comparator to compare `folderMetrics`
- [ ] Run typecheck and report

### Implementation Details

**FileTree.tsx render loop - BEFORE:**
```typescript
const diffCounts = file.isDirectory ? getDiffCounts(file.relativePath) : null
const localOnlyCountVal = file.isDirectory ? getLocalOnlyCount(file.relativePath) : 0
const folderStats = file.isDirectory ? getFolderCheckoutStats(file.relativePath) : null

<VirtualizedTreeRow
  diffCounts={diffCounts}
  localOnlyCount={localOnlyCountVal}
  folderStats={folderStats}
  isSelected={selectedFiles.includes(file.path)}
/>
```

**FileTree.tsx render loop - AFTER:**
```typescript
const metrics = file.isDirectory ? folderMetrics.get(file.relativePath) : null

<VirtualizedTreeRow
  folderMetrics={metrics}
  diffCounts={diffCounts}  // Keep if from store's getDiffCounts
  isSelected={selectedFilesSet.has(file.path)}
/>
```

**VirtualizedTreeRow.tsx - Extract from folderMetrics:**
```typescript
// Inside component:
const localOnlyCount = folderMetrics?.localOnlyFilesCount ?? 0
const folderStats = folderMetrics ? {
  checkoutUsers: folderMetrics.checkoutUsers,
  checkedOutByMeCount: folderMetrics.myCheckedOutFilesCount,
  totalCheckouts: folderMetrics.totalCheckedOutFilesCount,
  syncedCount: folderMetrics.syncedFilesCount
} : null
```

---

## Agent 4: Verification (After Agent 3)

### Prompt

```
Follow the plan in `.cursor/plans/performance-on-fix-phase3.plan.md` and execute Agent 4: Verification.

**Scope:**
1. Run `npm run typecheck` - fix ALL errors
2. Update CHANGELOG.md with performance entry
3. Verify UI works correctly

**CHANGELOG Entry (add to 3.4.0 or 3.5.0):**
### Performance
- Fixed O(N²) folder metrics computation - now O(N) single pass via pre-computed Map
- Added custom memo comparator to VirtualizedTreeRow (15 relevant props vs 40+)
- Consolidated folder metrics into single prop for cleaner data flow
- Added Set-based O(1) selection checks in FileTree
- Removed unnecessary `allFiles` prop from FolderActionButtons

**Deliverables:**
- 0 TypeScript errors
- Updated CHANGELOG.md
- Report in `.cursor/reports/AGENT_4_VERIFICATION_REPORT.md`
```

---

## Expected Performance Impact

| Metric | Before | After |
|--------|--------|-------|
| Folder metrics per render | 250,000 iterations (O(N²)) | 1,000 iterations (O(N)) |
| Render loop function calls | 4 per folder | 1 Map lookup per folder |
| VirtualizedTreeRow re-renders | ALL rows on any change | Only affected rows |
| Selection check | O(N) array.includes | O(1) Set.has |
| Props per row | 40+ with separate metrics | Consolidated `folderMetrics` |

## Success Criteria1. `npm run typecheck` passes with 0 errors
2. File tree hover/click feels responsive
3. Checkin of 20+ files doesn't freeze UI
4. No visual regressions
