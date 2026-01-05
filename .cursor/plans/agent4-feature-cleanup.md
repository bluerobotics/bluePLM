# Agent 4: Feature Layer Cleanup & Technical Debt

## Objective
Consolidate FileContextMenu implementations and resolve technical debt (eslint-disable comments, TODO/FIXME items).

## Problem Summary
1. FileContextMenu exists in 3 locations with overlapping functionality
2. 41 `eslint-disable` comments across 22 files
3. 4 TODO/FIXME comments that need resolution

---

## Part A: FileContextMenu Consolidation

### Current State
Three separate implementations:

| Location | Lines | Purpose |
|----------|-------|---------|
| `src/features/source/browser/components/ContextMenu/FileContextMenu.tsx` | ~240 | Browser-specific, uses action components |
| `src/components/shared/FileContextMenu/` | Multiple files | Generic implementation |
| `src/features/source/context-menu/` | Re-exports | Feature-level barrel exports |

### Task A1: Audit Implementations

Compare the three implementations to identify:
- Unique features in each
- Which is most complete/well-structured
- What needs to be merged

Based on the codebase structure, `src/features/source/browser/components/ContextMenu/` appears to be the most sophisticated with:
- Composable action components (OpenActions, SyncActions, etc.)
- Proper separation of concerns
- Integration with FilePaneHandlersContext

### Task A2: Consolidate to Browser Implementation

The browser implementation at `src/features/source/browser/components/ContextMenu/` should be the canonical version.

**Steps:**

1. Review `src/components/shared/FileContextMenu/` for any unique features
2. Merge any missing functionality into the browser implementation
3. Delete `src/components/shared/FileContextMenu/` directory

### Task A3: Update Feature Exports

**File: `src/features/source/context-menu/index.ts`**

Update to re-export from browser:
```typescript
// Re-export context menu from browser implementation
export { 
  FileContextMenu,
  ColumnContextMenu,
  ConfigContextMenu,
  EmptyContextMenu,
} from '../browser/components/ContextMenu'

// Re-export action components for customization
export {
  ClipboardItems,
  FileOperationItems,
  PDMItems,
  CollaborationItems,
  NavigationItems,
  AdminItems,
  DeleteItems,
} from '../browser/components/ContextMenu/actions'

// Re-export utilities
export { useMenuPosition } from '../browser/components/ContextMenu/actions'

// Re-export dialogs
export {
  DeleteLocalConfirmDialog,
  ForceCheckinDialog,
  PropertiesDialog,
  ReviewRequestDialog,
  CheckoutRequestDialog,
  MentionDialog,
  ShareLinkDialog,
  AddToECODialog
} from './dialogs'

// Constants
export { 
  SW_EXTENSIONS,
  MENU_PADDING,
  SUBMENU_WIDTH,
  DEFAULT_SHARE_EXPIRY_DAYS,
  MAX_VISIBLE_FILES
} from '../browser/constants'
```

### Task A4: Update Shared Index

**File: `src/components/shared/index.ts`**

Remove the FileContextMenu export:
```typescript
// REMOVE this line:
export { FileContextMenu } from './FileContextMenu'
export type { FileContextMenuProps, DialogState, DialogName } from './FileContextMenu'

// Components should import from '@/features/source/context-menu' or '@/features/source/browser'
```

### Task A5: Update Import References

Search for imports from the deleted location and update:
```bash
# Files that may import from shared/FileContextMenu:
# Search: from '@/components/shared/FileContextMenu'
# Replace: from '@/features/source/context-menu'
```

### Task A6: Delete Shared FileContextMenu

After all imports are updated:
```
Delete directory: src/components/shared/FileContextMenu/
```

---

## Part B: Technical Debt - ESLint Disables

### Files with eslint-disable comments (41 total across 22 files)

Review each and fix properly:

### Task B1: React Hooks Dependency Fixes

**File: `src/app/App.tsx` (1 disable)**
- Line with `// eslint-disable-next-line react-hooks/exhaustive-deps`
- Review the effect and add proper dependencies or wrap in useCallback

**File: `src/hooks/useVaultManagement.ts` (1 disable)**
- Review dependency array and fix

**File: `src/stores/slices/filesSlice.ts` (4 disables)**
- Multiple dependency issues in the slice
- These may be intentional for Zustand patterns - document if so

### Task B2: Component-Specific Fixes

**File: `src/features/settings/account/ProfileSettings.tsx` (3 disables)**
- Review and fix type or dependency issues

**File: `src/features/settings/account/UserProfileModal.tsx` (2 disables)**
- Review and fix

**File: `src/features/settings/organization/ModulesEditor.tsx` (3 disables)**
- Review and fix

**File: `src/features/settings/organization/ModulesSettings.tsx` (2 disables)**
- Review and fix

**File: `src/features/settings/system/SupabaseSettings.tsx` (2 disables)**
- Review and fix

**File: `src/features/settings/system/ContributionHistory.tsx` (4 disables)**
- Review and fix

**File: `src/components/shared/IconPicker/IconPicker.tsx` (3 disables)**
- Review and fix

**File: `src/components/layout/ActivityBar/utils.tsx` (1 disable)**
- Review and fix

**File: `src/lib/serialization.ts` (5 disables)**
- Review and fix - this file has the most, likely type-related

### Task B3: Integration/Feature Files

**File: `src/features/supply-chain/portal/SupplierPortalView.tsx` (1 disable)**

**File: `src/features/supply-chain/rfq/RFQView.tsx` (1 disable)**

**File: `src/features/settings/integrations/WebhooksSettings.tsx` (1 disable)**

**File: `src/features/settings/integrations/solidworks/SolidWorksSettings.tsx` (1 disable)**

**File: `src/features/settings/integrations/ApiSettings.tsx` (1 disable)**

### Task B4: Organization/Team Settings

**File: `src/features/settings/organization/team-members/components/user/UserPermissionsDialog.tsx` (1 disable)**

**File: `src/features/settings/organization/team-members/components/user/CreateUserDialog.tsx` (1 disable)**

**File: `src/features/settings/organization/team-members/hooks/supabaseHelpers.ts` (1 disable)**

**File: `src/features/settings/organization/MetadataColumnsSettings.tsx` (1 disable)**

### Task B5: Sessions

**File: `src/lib/supabase/sessions.ts` (1 disable)**

---

## Part C: TODO/FIXME Resolution

**Note**: Only 1 TODO comment was found in the codebase (not 4 as originally estimated).

### Task C1: `src/lib/commands/handlers/search.ts`

Find the TODO comment and either:
- Implement the missing functionality
- Remove if no longer relevant
- Convert to a GitHub issue reference with tracking number

---

## Approach for ESLint Fixes

For each `eslint-disable`:

1. **Read the code** - Understand why the disable was added
2. **Categorize**:
   - Type issue → Add proper types
   - Dependency array → Fix or use useCallback/useMemo
   - Intentional pattern → Add explanatory comment
3. **Fix or document**:
   - If fixable, fix it and remove the disable
   - If intentional (e.g., Zustand patterns), change to:
     ```typescript
     // Zustand actions are stable references, deps intentionally omitted
     // eslint-disable-next-line react-hooks/exhaustive-deps
     ```

---

## Testing Checklist
- [ ] `npm run typecheck` passes
- [ ] No new eslint warnings introduced
- [ ] Context menus work in file browser
- [ ] Context menus work in all locations that used shared component
- [ ] App functions normally after changes

## Files Modified Summary
- Deleted: `src/components/shared/FileContextMenu/` (entire directory)
- Modified: `src/features/source/context-menu/index.ts`
- Modified: `src/components/shared/index.ts`
- Modified: ~22 files with eslint-disable fixes
- Modified: 1 file with TODO resolution

## Coordination Notes
- Does not conflict with Agent 1 (utilities) 
- Does not conflict with Agent 2 (store)
- Does not conflict with Agent 3 (layout) - different directories
- Note: `src/components/shared/FileContextMenu/utils.ts` deletion is handled by Agent 1 as part of utility consolidation
