# Database Agent Report: SOLIDWORKS License Management

**Date:** 2026-01-13  
**Agent:** Database Agent  
**Plan:** `solidworks-license-manager-agents.plan.md`

## Summary

Successfully implemented the SOLIDWORKS license management database schema, adding enterprise-level license tracking and user assignment capabilities to BluePLM.

## Changes Made

### 1. Schema Files Modified

| File | Change |
|------|--------|
| `supabase/modules/40-integrations.sql` | Added SOLIDWORKS license management section (enum, tables, RLS, functions) |
| `supabase/core.sql` | Bumped version from 43 → 44 |
| `src/lib/schemaVersion.ts` | Bumped EXPECTED_SCHEMA_VERSION from 43 → 44, added version description |

### 2. New Database Objects

#### Enum
- **`solidworks_license_type`**: `'standalone'` | `'network'`

#### Tables

**`solidworks_licenses`**
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `org_id` | UUID | Organization reference (FK, CASCADE) |
| `serial_number` | TEXT | SOLIDWORKS serial number |
| `nickname` | TEXT | Friendly name (e.g., "Design Team License 1") |
| `license_type` | solidworks_license_type | Default 'standalone' |
| `product_name` | TEXT | e.g., "SOLIDWORKS Professional" |
| `seats` | INTEGER | Default 1 (for network licenses) |
| `purchase_date` | DATE | License purchase date |
| `expiry_date` | DATE | License expiration date |
| `notes` | TEXT | Additional notes |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `created_by` | UUID | User who created (FK) |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

- **Unique Constraint:** `(org_id, serial_number)`
- **Index:** `idx_solidworks_licenses_org_id`

**`solidworks_license_assignments`**
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `license_id` | UUID | License reference (FK, CASCADE) |
| `user_id` | UUID | User reference (FK, CASCADE) |
| `assigned_at` | TIMESTAMPTZ | Assignment timestamp |
| `assigned_by` | UUID | Admin who assigned (FK) |
| `is_active` | BOOLEAN | Whether pushed to registry |
| `activated_at` | TIMESTAMPTZ | Registry activation timestamp |
| `machine_id` | TEXT | Machine identifier |
| `machine_name` | TEXT | Machine hostname |
| `deactivated_at` | TIMESTAMPTZ | Deactivation timestamp |

- **Unique Constraint:** `(license_id, user_id)`
- **Indexes:** `idx_solidworks_license_assignments_license_id`, `idx_solidworks_license_assignments_user_id`

#### RLS Policies

**solidworks_licenses:**
| Policy | Access | Condition |
|--------|--------|-----------|
| Org members can view | SELECT | User in same org |
| Admins can insert | INSERT | User is org admin |
| Admins can update | UPDATE | User is org admin |
| Admins can delete | DELETE | User is org admin |

**solidworks_license_assignments:**
| Policy | Access | Condition |
|--------|--------|-----------|
| Users can view own | SELECT | Own assignment OR org member |
| Admins can insert | INSERT | Org admin |
| Admins can update | UPDATE | Org admin |
| Admins can delete | DELETE | Org admin |
| Users can update own activation | UPDATE | Own assignment |

#### Helper Functions (SECURITY DEFINER)

| Function | Description | Returns |
|----------|-------------|---------|
| `assign_solidworks_license(UUID, UUID)` | Assign license to user | JSON `{success, assignment_id}` or `{success, error}` |
| `unassign_solidworks_license(UUID)` | Remove license assignment | JSON `{success}` or `{success, error}` |
| `activate_solidworks_license(UUID, TEXT, TEXT)` | Mark license as active on machine | JSON `{success, activated_at}` or `{success, error}` |
| `deactivate_solidworks_license(UUID)` | Mark license as deactivated | JSON `{success, deactivated_at}` or `{success, error}` |

All functions:
- Use `SECURITY DEFINER` with proper auth checks
- Follow `is_org_admin()` pattern for admin validation
- Return JSON with success/error status
- Are granted to `authenticated` role

#### Realtime

Both tables enabled for Supabase Realtime:
- `ALTER TABLE ... REPLICA IDENTITY FULL`
- Added to `supabase_realtime` publication

### 3. Schema Version

- **Previous:** 43
- **New:** 44
- **Description:** "SOLIDWORKS license management: licenses table, assignments, RLS policies, helper functions"

## Quality Checklist

- [x] Idempotent DDL (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS, etc.)
- [x] All functions are SECURITY DEFINER with proper auth checks
- [x] Uses `is_org_admin()` pattern consistently
- [x] Proper error handling in functions returning JSON
- [x] Follows existing `40-integrations.sql` patterns exactly
- [x] Indexes on foreign keys and commonly queried columns
- [x] Realtime enabled for live updates
- [x] Table comments added

## Type Generation

Ran type generation command:
```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."; npx supabase gen types typescript --project-id vvyhpdzqdizvorrhjhvq > src/types/supabase.ts
```

**Note:** The generated types do not yet include the new tables because the schema hasn't been applied to the live database. Once an admin applies the schema SQL, re-running the type generation command will include:
- `solidworks_licenses` table type
- `solidworks_license_assignments` table type
- `solidworks_license_type` enum type
- Function signatures for all helper functions

## Next Steps (For Other Agents)

1. **Electron Agent:** Implement registry operations in `electron/handlers/solidworks.ts`
2. **Frontend Agent:** 
   - Wait for schema to be applied to database
   - Re-run type generation to get TypeScript types
   - Implement UI components in `src/features/settings/integrations/solidworks/LicenseManager/`

## Files Ready for Review

- `supabase/modules/40-integrations.sql` - SOLIDWORKS license section added at end
- `supabase/core.sql` - Version bump
- `src/lib/schemaVersion.ts` - Version bump + description

---

**Database Agent: Complete ✅**
