# Consolidate Metadata Commands & Fix Auto-Triggers

## Implementation Status: COMPLETED

All items have been implemented. See detailed report at the end of this file.

---

## Desired Metadata Flow

```
PULL from SolidWorks (Drawings are source of truth):
 - WHEN: User right-clicks drawing and selects "Sync Metadata"
 - WHAT: Read part number, description, revision FROM drawing -> update pendingMetadata

PUSH to SolidWorks (BluePLM is source of truth):
 - WHEN: User right-clicks part/assembly and selects "Sync Metadata"  
 - WHAT: Write part number, description FROM BluePLM -> into the SW file

REQUIREMENTS:
 - Only works on checked-out files (need edit access)
 - NEVER auto-trigger on check-in, checkout, move, navigation, FileWatcher, downloads
```

## Problem: Two Confusing Commands

Currently there are two separate commands:

- `refresh-local-metadata` - Reads SW -> updates pendingMetadata
- `sync-sw-metadata` - Reads SW -> updates database

This is confusing. We need ONE command: **sync-metadata** that:

- For **drawings**: PULL (read from SW file -> update pendingMetadata)
- For **parts/assemblies**: PUSH (write from pendingMetadata/pdmData -> into SW file)
- Only works on **checked-out files**

## Implementation

### 1. Create new consolidated sync-metadata command ✅

Create `src/lib/commands/handlers/syncMetadata.ts`:

The command should:

- Validate files are SolidWorks files (.sldprt, .sldasm, .slddrw)
- Validate files are checked out by current user
- For each file:
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - If **drawing** (.slddrw): PULL - call `getProperties()` -> `updatePendingMetadata()`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - If **part/assembly** (.sldprt/.sldasm): PUSH - call `setProperties()` with values from pendingMetadata or pdmData

Can reuse extraction logic from existing `refreshLocalMetadata.ts` for the PULL path (drawings).

Can reuse the `setProperties` pattern from `DetailsPanel.tsx` for the PUSH path (parts/assemblies).

### 2. Delete old command files ✅

- [x] Delete `src/lib/commands/handlers/refreshLocalMetadata.ts`
- [x] Delete `src/lib/commands/handlers/syncSwMetadata.ts`

### 3. Update command registration ✅

In `src/lib/commands/index.ts`:

- Remove imports for old commands
- Add import for new `syncMetadataCommand`
- Update `initializeCommands()` to register `sync-metadata`
- Update convenience export function

### 4. Update command types ✅

In `src/lib/commands/types.ts`:

- [x] Remove `RefreshLocalMetadataParams` interface
- [x] Remove `SyncSwMetadataParams` interface
- [x] Add `SyncMetadataParams` interface
- [x] Update `CommandId` union: remove old IDs, add `'sync-metadata'`
- [x] Update `CommandMap` type

### 5. Update context menus ✅

**MetadataActions.tsx:**

- Change `executeCommand('refresh-local-metadata', ...)` to `executeCommand('sync-metadata', ...)`
- Add validation that files are checked out

**CollaborationActions.tsx:**

- Change `executeCommand('sync-sw-metadata', ...)` to `executeCommand('sync-metadata', ...)`
- This section may need consolidation with MetadataActions

### 6. Update FileTree vault context menu ✅

In `src/features/source/explorer/FileTree.tsx`:

- [x] Change `executeCommand('sync-sw-metadata', ...)` to `executeCommand('sync-metadata', ...)`
- [x] Filter to only files checked out by current user

### 7. Update ServiceTab sync button ✅

In `src/features/settings/integrations/solidworks/tabs/ServiceTab.tsx`:

- Change `executeCommand('sync-sw-metadata', ...)` to `executeCommand('sync-metadata', ...)`

### 8. Remove auto-refresh from FileWatcher ✅

In `src/app/App.tsx`:

- [x] Deleted the auto-refresh block that triggered `refresh-local-metadata` on file changes

### 9. Remove metadata extraction from checkout ✅

In `src/lib/commands/handlers/checkout.ts`:

- [x] Remove the `extractSolidWorksMetadata` function
- [x] Remove the call to it
- [x] Keep `SW_EXTENSIONS` constant (still used for other purposes)

### 10. Add guard in updatePendingMetadata ✅

In `src/stores/slices/filesSlice.ts`, add guard at start of `updatePendingMetadata`:

```typescript
updatePendingMetadata: (path, metadata) => {
  const state = get()
  const file = state.files.find(f => f.path === path)
  
  // Guard: Never set pendingMetadata on non-editable files
  if (file?.pdmData?.id) {
    const checkedOutBy = file.pdmData.checked_out_by
    const currentUserId = state.user?.id
    
    if (!checkedOutBy || checkedOutBy !== currentUserId) {
      console.warn('[filesSlice] updatePendingMetadata: Skipping non-editable file', path)
      window.electronAPI?.log('warn', '[filesSlice] Attempted to set pendingMetadata on non-editable file', {
        path,
        checkedOutBy,
        currentUserId,
        reason: !checkedOutBy ? 'not_checked_out' : 'checked_out_by_other'
      })
      return
    }
  }
  
  // ... rest of existing logic
}
```

### 11. Remove autoRefreshMetadataOnSave setting ✅

**src/stores/types.ts:**

- [x] Remove `autoRefreshMetadataOnSave: boolean` from SettingsSlice
- [x] Remove `setAutoRefreshMetadataOnSave` action

**src/stores/slices/settingsSlice.ts:**

- [x] Remove initial state: `autoRefreshMetadataOnSave: true,`
- [x] Remove setter action

**src/features/settings/integrations/solidworks/tabs/SettingsTab.tsx:**

- [x] Remove the "Auto-refresh on file save" toggle UI section

**src/features/settings/integrations/solidworks/hooks/useSolidWorksSettings.ts:**

- [x] Remove from destructured state and return object

## Files to Modify (Complete List)

**New file:**

- `src/lib/commands/handlers/syncMetadata.ts` - CREATE new consolidated command

**Delete files:**

- `src/lib/commands/handlers/refreshLocalMetadata.ts` - DELETE
- `src/lib/commands/handlers/syncSwMetadata.ts` - DELETE

**Modify files:**

- `src/lib/commands/index.ts` - Update registrations and exports
- `src/lib/commands/types.ts` - Update command types
- `src/app/App.tsx` - Remove FileWatcher auto-refresh block
- `src/lib/commands/handlers/checkout.ts` - Remove metadata extraction
- `src/stores/slices/filesSlice.ts` - Add guard in updatePendingMetadata
- `src/stores/types.ts` - Remove autoRefreshMetadataOnSave
- `src/stores/slices/settingsSlice.ts` - Remove autoRefreshMetadataOnSave
- `src/features/settings/integrations/solidworks/tabs/SettingsTab.tsx` - Remove toggle + update sync button
- `src/features/settings/integrations/solidworks/hooks/useSolidWorksSettings.ts` - Remove setting
- `src/features/source/browser/components/ContextMenu/actions/MetadataActions.tsx` - Use sync-metadata
- `src/features/source/browser/components/ContextMenu/actions/CollaborationActions.tsx` - Use sync-metadata
- `src/features/source/explorer/FileTree.tsx` - Use sync-metadata

---

## Implementation Report

### Summary

All plan items have been successfully implemented. The consolidation replaced two confusing commands (`refresh-local-metadata` and `sync-sw-metadata`) with a single unified `sync-metadata` command that:

- For **drawings** (.slddrw): PULL - reads metadata from the SW file (with PRP resolution from parent models) and updates `pendingMetadata`
- For **parts/assemblies** (.sldprt, .sldasm): PUSH - writes metadata from `pendingMetadata`/`pdmData` into the SW file
- **Only works on files checked out by the current user**

### Files Created

1. **`src/lib/commands/handlers/syncMetadata.ts`** - New consolidated command handler (~430 lines)
   - Implements PULL logic for drawings with PRP (Part Reference Property) resolution
   - Implements PUSH logic for parts/assemblies using `setProperties` API
   - Validates files are SolidWorks files and checked out by current user
   - Includes comprehensive logging for debugging

### Files Deleted

1. **`src/lib/commands/handlers/refreshLocalMetadata.ts`** - Old "read SW -> update pendingMetadata" command
2. **`src/lib/commands/handlers/syncSwMetadata.ts`** - Old "read SW -> update database" command

### Files Modified

1. **`src/lib/commands/types.ts`** - Updated command types
2. **`src/lib/commands/index.ts`** - Updated command registration and exports
3. **`src/lib/commands/handlers/index.ts`** - Updated handler exports
4. **`src/lib/commands/parser.ts`** - Updated terminal command aliases
5. **`src/lib/permissions.ts`** - Updated permission mapping
6. **`src/lib/commands/handlers/terminal.ts`** - Updated help text
7. **`src/lib/commands/handlers/checkout.ts`** - Removed metadata extraction on checkout
8. **`src/app/App.tsx`** - Removed FileWatcher auto-refresh block
9. **`src/stores/slices/filesSlice.ts`** - Added guard in `updatePendingMetadata`
10. **`src/stores/types.ts`** - Removed `autoRefreshMetadataOnSave` setting
11. **`src/stores/slices/settingsSlice.ts`** - Removed `autoRefreshMetadataOnSave` state and setter
12. **`src/features/settings/integrations/solidworks/tabs/SettingsTab.tsx`** - Removed auto-refresh toggle UI
13. **`src/features/settings/integrations/solidworks/tabs/ServiceTab.tsx`** - Updated bulk sync button
14. **`src/features/settings/integrations/solidworks/hooks/useSolidWorksSettings.ts`** - Removed setting
15. **`src/features/source/browser/components/ContextMenu/actions/MetadataActions.tsx`** - Updated to use `sync-metadata`
16. **`src/features/source/browser/components/ContextMenu/actions/CollaborationActions.tsx`** - Updated to use `sync-metadata`
17. **`src/features/source/explorer/FileTree.tsx`** - Updated vault context menu
18. **`src/features/source/context-menu/items/PDMItems.tsx`** - Updated permission check and command

### Root Cause Analysis

The original problem stemmed from two distinct issues:

1. **Confusing dual commands**: `refresh-local-metadata` and `sync-sw-metadata` had overlapping functionality but different targets (pendingMetadata vs database). Users didn't know which to use.

2. **Unwanted auto-triggers**: Metadata was being extracted automatically during:
   - File checkout (small batches only, but still unexpected)
   - FileWatcher events (when SW files changed on disk)
   
   This caused issues because:
   - Files that weren't checked out could have their pendingMetadata set
   - Auto-extraction could overwrite intentional user changes
   - Performance impact from unexpected SW service calls

### Potential Gaps / Considerations

1. **Removed bulk database sync functionality**: The old `sync-sw-metadata` command could sync metadata from SW files directly to the database (creating new versions). The new `sync-metadata` command doesn't do this - it only works on checked-out files. The "Sync All Vault Metadata" button in ServiceTab now only works on checked-out files.

   **Impact**: If users need to bulk-backfill metadata from SW files to the database, they would need to:
   1. Check out the files
   2. Run sync-metadata (which PULLs for drawings, but PUSHes for parts/assemblies)
   3. Check in to persist to database
   
   For drawings this works well (PULL updates pendingMetadata, check-in saves to DB).
   For parts/assemblies, this is a bit odd - PUSH writes BluePLM data TO the file, not FROM the file.

2. **Drawing revision handling**: The PULL logic for drawings keeps the drawing's own revision (from revision table) while inheriting part_number and description from the parent model. This is correct behavior per the plan.

3. **Legacy aliases preserved**: The old command names (`sync-sw-metadata`, `refresh-local-metadata`, `sw-sync`) are preserved as aliases in the new command, ensuring backward compatibility for users who may have memorized the old commands.

### Verification

- TypeScript compilation: ✅ Passed (`npm run typecheck`)
- Linter errors: ✅ None found