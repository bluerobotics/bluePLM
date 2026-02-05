---
name: Delete Performance Fix
overview: Fix the 12+ second delay during file deletion by removing blocking yields in delete.ts, and consolidate all delete paths to use the command system (eliminating duplicate useDeleteHandler logic).
todos:
  - id: fix-delete-commands
    content: Remove blocking `await setTimeout(0)` patterns in delete.ts command handlers (delete-local and delete-server)
    status: pending
  - id: migrate-keyboard-delete
    content: Update useKeyboardNav.ts to use executeCommand() for file deletion instead of setDeleteConfirm()
    status: pending
  - id: migrate-browser-context-menu
    content: Update DeleteActions.tsx to use executeCommand() for local file deletion instead of setDeleteConfirm()
    status: pending
  - id: remove-legacy-hook
    content: Delete useDeleteHandler.ts and remove its usage from FilePane.tsx after migration is complete
    status: pending
  - id: cleanup-dialogs
    content: Remove the legacy DeleteConfirmDialog from browser components (keep the context-menu one if needed)
    status: pending
---

# Delete Performance Fix - Root Cause Analysis and Solution

## Problem 1: Duplicate Delete Implementations

There are **two separate implementations** of delete logic:

```
Command System (proper):              Legacy Hook (duplicate):
src/lib/commands/handlers/delete.ts   src/features/source/browser/hooks/useDeleteHandler.ts
├── deleteLocalCommand                ├── handleConfirmDelete (300+ lines)
└── deleteServerCommand               └── (duplicates command logic!)
```

### Current Inconsistent Usage

| Trigger | File | Implementation |

|---------|------|----------------|

| Context menu (new) | `DeleteItems.tsx` | Command system |

| Context menu (browser) - server delete | `DeleteActions.tsx` | Command system |

| Context menu (browser) - local delete | `DeleteActions.tsx` | **useDeleteHandler** (legacy) |

| Keyboard Delete - folders | `useKeyboardNav.ts` | Command system |

| Keyboard Delete - files | `useKeyboardNav.ts` | **useDeleteHandler** (legacy) |

## Problem 2: Blocking Yield Pattern

The deletion **appears** slow (12+ seconds), but actual file deletion is fast (283ms). The blocking pattern:

```typescript
// In delete.ts (and useDeleteHandler.ts):
removeFilesFromStore(allPathsToRemove)  // Triggers re-render of 24K files
await new Promise(resolve => setTimeout(resolve, 0))  // BLOCKS 12+ seconds!
// ... actual deletion only happens after re-render completes
```

### Timeline from Logs

```
22:01:55.271Z - removeFilesFromStore (optimistic update)
   |
   |  <-- 12.6 SECOND GAP - React re-rendering 24,217 files -->
   |
22:02:07.865Z - DeleteBatch #1 START
22:02:08.148Z - DeleteBatch #1 END (283ms actual deletion!)
```

## Solution: Consolidate + Fix Performance

### Part 1: Fix Blocking Yields in delete.ts

Remove or replace blocking `await setTimeout(0)` patterns:

```typescript
// Before: Blocks for 12+ seconds
removeFilesFromStore(allPathsToRemove)
await new Promise(resolve => setTimeout(resolve, 0))

// After: Non-blocking - deletion proceeds immediately
removeFilesFromStore(allPathsToRemove)
// Deletion starts immediately, UI updates async
```

Locations in [delete.ts](src/lib/commands/handlers/delete.ts):

- Line 282: After modal close yield
- Line 382: After optimistic update yield
- Line 449: After optimistic update yield
- Line 745: After optimistic update yield
- Line 833: After yield
- Line 849: After yield

### Part 2: Migrate All Paths to Command System

**Step 2a: Fix useKeyboardNav.ts**

```typescript
// Before (line 259-260):
setDeleteEverywhere(false)
setDeleteConfirm(selectedFile)

// After:
executeCommand('delete-local', { files: selectedItems }, { onRefresh })
```

**Step 2b: Fix DeleteActions.tsx**

```typescript
// Before (line 166-167):
setDeleteEverywhere(false)
setDeleteConfirm(firstFile)

// After:
executeCommand('delete-local', { files: contextFiles }, { onRefresh })
```

**Step 2c: Remove Legacy Code**

After migration, delete:

- `src/features/source/browser/hooks/useDeleteHandler.ts` (300+ lines)
- Remove `useDeleteHandler` usage from `FilePane.tsx`
- Remove legacy `DeleteConfirmDialog` from browser components

## Files to Modify

1. **[src/lib/commands/handlers/delete.ts](src/lib/commands/handlers/delete.ts)**

   - Remove blocking yields (6 locations)

2. **[src/features/source/browser/hooks/useKeyboardNav.ts](src/features/source/browser/hooks/useKeyboardNav.ts)**

   - Line 259-260: Use `executeCommand()` instead of `setDeleteConfirm()`

3. **[src/features/source/browser/components/ContextMenu/actions/DeleteActions.tsx](src/features/source/browser/components/ContextMenu/actions/DeleteActions.tsx)**

   - Lines 166-167 and 252-253: Use `executeCommand()` instead of `setDeleteConfirm()`

4. **[src/features/source/browser/FilePane.tsx](src/features/source/browser/FilePane.tsx)**

   - Remove `useDeleteHandler` import and usage (lines 88, 812-837)
   - Remove `DeleteConfirmDialog` rendering (lines 1605-1614)

5. **Delete these files:**

   - `src/features/source/browser/hooks/useDeleteHandler.ts`
   - Update `src/features/source/browser/hooks/index.ts` to remove export

## Benefits

1. **Single source of truth** - All delete logic in `delete.ts`
2. **Consistent behavior** - Same UX regardless of how delete is triggered
3. **Easier maintenance** - Bug fixes apply everywhere
4. **Performance fix** - Removing blocking yields fixes the 12+ second delay