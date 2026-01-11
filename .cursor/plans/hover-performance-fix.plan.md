# Hover Performance Fix - Context Subscription Correction

## Background

The hover performance optimization (reviewed in `.cursor/reports/HOVER_PERFORMANCE_REVIEW_REPORT.md`) was partially completed by 3 agents. One architectural issue was identified that limits the performance benefit.

## Problem

`VirtualizedTreeRow.tsx` currently subscribes to the hover context via `useTreeHover()`. This means ALL visible tree rows re-render when any hover state changes - defeating the optimization goal.

**Current (Wrong):**
```
FileTree → TreeHoverProvider
  └─ VirtualizedTreeRow (subscribes to context) ← ALL rows re-render on hover
       └─ FileActionButtons (receives props from VirtualizedTreeRow)
```

**Required (Correct):**
```
FileTree → TreeHoverProvider
  └─ VirtualizedTreeRow (no context subscription) ← Rows DON'T re-render on hover
       └─ FileActionButtons (subscribes to context) ← Only buttons re-render
```

## Agent Prompt

> **AGENT: Hover Context Fix**
>
> Fix the hover context subscription location to complete the performance optimization.
>
> **Review Document:** Read `.cursor/reports/HOVER_PERFORMANCE_REVIEW_REPORT.md` first for full context.
>
> **Problem:** `VirtualizedTreeRow.tsx` subscribes to the hover context, causing all tree rows to re-render when hover state changes. The subscription should be in `FileActionButtons` instead.
>
> **Files to Modify:**
> 1. `src/features/source/explorer/file-tree/VirtualizedTreeRow.tsx`
> 2. `src/features/source/explorer/file-tree/TreeItemActions.tsx`
>
> **Task 1: Remove context consumption from VirtualizedTreeRow.tsx**
>
> - Remove the `useTreeHover` import
> - Remove the `useTreeHover()` hook call (lines ~165-176)
> - Remove the hover props being passed to `FileActionButtons` (lines ~344-354):
>   - `isDownloadHovered`
>   - `isUploadHovered`
>   - `isCheckoutHovered`
>   - `isCheckinHovered`
>   - `isUpdateHovered`
>   - `setIsDownloadHovered`
>   - `setIsUploadHovered`
>   - `setIsCheckoutHovered`
>   - `setIsCheckinHovered`
>   - `setIsUpdateHovered`
>
> **Task 2: Add context consumption to FileActionButtons in TreeItemActions.tsx**
>
> - Import `useTreeHover` from `./TreeHoverContext`
> - In the `FileActionButtons` function component, call `useTreeHover()` to get hover state
> - Remove the hover-related props from the `FileActionButtonsProps` interface (lines ~33-43):
>   - `isDownloadHovered: boolean`
>   - `isUploadHovered: boolean`
>   - `isCheckoutHovered: boolean`
>   - `isCheckinHovered: boolean`
>   - `isUpdateHovered: boolean`
>   - `setIsDownloadHovered: (v: boolean) => void`
>   - `setIsUploadHovered: (v: boolean) => void`
>   - `setIsCheckoutHovered: (v: boolean) => void`
>   - `setIsCheckinHovered: (v: boolean) => void`
>   - `setIsUpdateHovered: (v: boolean) => void`
> - Remove hover props from the function's destructuring (lines ~60-69)
> - Add: `const { isDownloadHovered, isUploadHovered, isCheckoutHovered, isCheckinHovered, isUpdateHovered, setIsDownloadHovered, setIsUploadHovered, setIsCheckoutHovered, setIsCheckinHovered, setIsUpdateHovered } = useTreeHover()`
>
> **Boundaries:**
> - ONLY modify `VirtualizedTreeRow.tsx` and `TreeItemActions.tsx`
> - Do NOT modify `FileTree.tsx`, `TreeHoverContext.tsx`, or any other files
> - Do NOT change any functionality - only move where the context is consumed
>
> **Verification:**
> - Run `npm run typecheck` - must pass
> - The hover highlighting for multi-select should still work
> - Action buttons should still appear/disappear on hover (CSS handles visibility)
>
> **When Complete:**
> - Report changes made
> - Confirm typecheck passes
> - The reviewer will then rename the plan to `COMPLETE-hover-performance-fix.plan.md`

## Expected Result

After this fix:
- `VirtualizedTreeRow` will NOT re-render when hover state changes
- Only `FileActionButtons` will re-render (and only when its specific file's button is hovered)
- Multi-select hover highlighting will still work correctly
- CSS-only visibility for buttons continues to work

## Files Reference

| File | Action |
|------|--------|
| `VirtualizedTreeRow.tsx` | Remove context consumption, remove hover props to FileActionButtons |
| `TreeItemActions.tsx` | Add context consumption in FileActionButtons, remove hover props from interface |
