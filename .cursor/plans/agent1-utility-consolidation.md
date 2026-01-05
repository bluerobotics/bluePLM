# Agent 1: Utility Consolidation

## Objective
Consolidate all duplicate formatting utilities into a single source of truth in `src/lib/utils/`.

## Problem Summary
The same utility functions are implemented in 3-4 different locations with slight variations:

| Function | Duplicate Locations |
|----------|---------------------|
| `formatFileSize` | `src/types/pdm.ts` (line 1053) |
| `formatSize` | `src/components/shared/FileContextMenu/utils.ts` |
| `formatBytes` | `src/features/source/browser/utils/formatting.ts`, `src/lib/utils/format.ts` |
| `formatSpeed` | `src/features/source/browser/utils/formatting.ts`, `src/lib/utils/format.ts` |
| `formatDuration` | `src/features/source/browser/utils/formatting.ts`, `src/lib/utils/format.ts` |
| `getCountLabel` | `src/features/source/browser/utils/formatting.ts`, `src/components/shared/FileContextMenu/utils.ts` |
| `plural` | `src/components/shared/FileContextMenu/utils.ts` |

## Tasks

### Task 1: Enhance `src/lib/utils/format.ts`
The canonical `src/lib/utils/format.ts` already has good implementations. Ensure it has:
- `formatFileSize(bytes, decimals?)` - already exists
- `formatBytes(bytes)` - already exists  
- `formatSpeed(bytesPerSecond)` - already exists
- `formatDuration(ms)` - already exists (note: takes ms, not seconds)

### Task 2: Verify utilities exist in `src/lib/utils/string.ts`

**NOTE**: `getCountLabel` and `plural` already exist in `src/lib/utils/string.ts` (lines 191-219).

No new functions needed - just verify they're exported and update imports to use them.

### Task 3: Update `src/lib/utils/index.ts`
Ensure all utilities are exported:
```typescript
export * from './format'
export * from './string'
export * from './date'
export * from './path'
export * from './validation'
```

### Task 4: Remove `formatFileSize` from `src/types/pdm.ts`
- Line ~1053 has a duplicate `formatFileSize` function
- Delete this function
- The type file should only contain types, interfaces, and constants - not utility functions

### Task 5: Delete duplicate utility file

Delete this file:
- `src/features/source/browser/utils/formatting.ts`

**NOTE**: Do NOT delete `src/components/shared/FileContextMenu/utils.ts` - Agent 4 will delete the entire `FileContextMenu/` directory as part of component consolidation.

### Task 6: Update imports across codebase
Search for and update all imports. Files that need updating:

**For `formatFileSize` / `formatSize` / `formatBytes`:**
- `src/components/shared/Screens/WelcomeScreen.tsx`
- `src/features/source/context-menu/dialogs/PropertiesDialog.tsx`
- `src/features/dev-tools/logs/LogViewer.tsx`
- `src/features/source/details/DetailsPanel.tsx`
- `src/features/source/explorer/FileTree.tsx`
- `src/components/layout/RightPanel/RightPanel.tsx`
- `src/features/integrations/google-drive/GoogleDrivePanel.tsx`
- `src/features/source/browser/components/FileList/cells/SizeCell.tsx`
- `src/lib/commands/handlers/info.ts`
- `src/components/shared/Dialogs/UpdateModal.tsx`
- `src/features/settings/system/PerformanceSettings.tsx`
- `src/features/source/browser/hooks/useDownloadOperation.ts`
- `src/features/settings/system/SupabaseSettings.tsx`
- `src/features/dev-tools/telemetry/TelemetryGraph.tsx`
- `src/components/shared/SystemStats/SystemStats.tsx`
- `src/components/core/Toast/Toast.tsx`

**For `getCountLabel` / `plural`:**
- `src/features/source/index.ts`
- `src/features/source/context-menu/index.ts`
- `src/components/shared/FileContextMenu/index.ts`
- Any file importing from the deleted utils files

### Task 7: Update barrel exports
Update these index files to remove references to deleted utils:
- `src/features/source/browser/utils/index.ts` - remove formatting exports
- `src/features/source/context-menu/index.ts` - update to import from `@/lib/utils`
- `src/components/shared/FileContextMenu/index.ts` - update exports

## Import Pattern
All imports should use the central path:
```typescript
import { formatFileSize, formatBytes, formatSpeed, getCountLabel, plural } from '@/lib/utils'
```

## Testing Checklist
- [ ] `npm run typecheck` passes
- [ ] App builds without errors
- [ ] File sizes display correctly in file browser
- [ ] Context menu count labels work
- [ ] Download/upload speed displays correctly

## Files Modified Summary
- Modified: ~25 files (import updates)
- Deleted: 2 files
- Created: 0 files (just enhancing existing)
