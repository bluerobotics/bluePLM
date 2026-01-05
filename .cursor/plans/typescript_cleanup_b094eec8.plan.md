# TypeScript Cleanup Plan

Generated: 2026-01-05
Updated: 2026-01-05

## Summary

| Issue | Count | Status |
|-------|-------|--------|
| Blocking TypeScript Errors | ~72 → ~35 | In Progress |
| @ts-nocheck files | 4 | Pending |
| `as any` casts | 186 across 64 files | Pending |
| Legacy single-vault code | ~5 files | Pending |
| console.* statements | 756 across 136 files | Pending |

## Progress Log

### Session 1 (2026-01-05)

**Errors Fixed (72 → 35):**

1. **Type Alignment (`src/types/workflow.ts`)**:
   - Fixed `ApprovalMode` to include `'majority'` from Supabase
   - Fixed `AvailableTransition` to make fields optional that aren't returned by RPC
   - Fixed `GateType` to match Supabase enum (removed `'notification'`)

2. **Workflow Functions (`src/lib/workflows.ts`)**:
   - Fixed `getFullWorkflow` to properly destructure Supabase responses
   - Fixed `executeTransition` to use proper join hints for workflow_states/templates
   - Added proper type casts for `canvas_config`, `approval_mode`, `checklist_items`
   - Fixed insert functions to require proper fields

3. **Admin Commands (`src/lib/commands/handlers/admin.ts`)**:
   - Fixed `pending_org_members` insert to use correct fields (`invited_by` not `created_by`)
   - Fixed `user_workflow_roles` insert to use `workflow_role_id` not `role_id`
   - Fixed team permissions null handling for `actions` field
   - Removed references to non-existent columns (`full_name`, `created_at`)

4. **File Operations (`src/lib/supabase/files.ts`)**:
   - Fixed user ID filtering with proper type guard
   - Fixed `contentChanged` to be properly boolean (not `string | false | undefined`)
   - Fixed version insert with fallback values
   - Fixed `checkedOutUser` type to allow null `full_name`
   - Changed `admin_force_discard` action to `update` with details

5. **File Service (`src/lib/fileService.ts`)**:
   - Changed `rollback`/`roll_forward` actions to `revision_change` with details

6. **Vaults (`src/lib/supabase/vaults.ts`)**:
   - Updated `getAccessibleVaults` return type to allow nullable fields

7. **Delete Handler (`src/lib/commands/handlers/delete.ts`)**:
   - Fixed `details` field to be `string[]` instead of object

**Remaining Errors (~35):**
- UI components with null handling (DeviationsView, ECOView, PermissionsEditor, etc.)
- Missing RPC functions: `update_org_branding`, `preview_next_serial_number`
- Type definitions need updating: `FileVersion`, `Vault`, `PermissionPreset`, `PDMFile`
- Settings components with Json type mismatches
- Backup.ts file_type and created_at issues

## Task 1: Fix @ts-nocheck Files

Files with `@ts-nocheck`:
1. `src/lib/schemaVersion.ts`
2. `src/features/settings/organization/team-members/components/user/UserPermissionsDialog.tsx`
3. `src/features/settings/organization/team-members/components/user/CreateUserDialog.tsx`
4. `src/features/settings/organization/team-members/hooks/supabaseHelpers.ts`

## Task 2: Fix `as any` Casts (Priority Files)

Top files by cast count:
1. `src/hooks/useAuth.ts` - 18 casts
2. `src/lib/storage.ts` - 18 casts
3. `src/features/settings/organization/CompanyProfileSettings.tsx` - 9 casts
4. `src/stores/slices/modulesSlice.ts` - 6 casts
5. `src/features/settings/integrations/google-drive/GoogleDriveSettings.tsx` - 6 casts
6. `src/features/change-control/deviations/DeviationsView.tsx` - 6 casts
7. `src/features/change-control/eco/ECOView.tsx` - 5 casts
8. `src/lib/supabase/files.ts` - 5 casts

## Task 3: Audit Legacy Single-Vault Code

Files with vault-related patterns to audit:
- Check for hardcoded vault assumptions
- Look for `selectedVault` patterns that may need multi-vault support

## Task 4: Migrate Console Statements

Migrate `console.log/warn/error/debug` to `electronAPI.log()` across 136 files.
Total: 756 statements

## Next Steps

1. Finish fixing remaining ~35 TypeScript errors (focus on type definitions)
2. Move to @ts-nocheck files
3. Then `as any` casts
4. Console statement migration
