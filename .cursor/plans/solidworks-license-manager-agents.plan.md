# SOLIDWORKS License Manager Multi-Agent Plan

## Objective

Build a comprehensive SOLIDWORKS license management system within the existing SolidWorksSettings page, enabling organizations to store license keys in the database, assign licenses to users, and push activation to local machines via Windows registry operations.

## Agent Overview

| Agent | Responsibility | Owns | Dependencies |

|-------|---------------|------|--------------|

| Database Agent | Schema, tables, RLS, functions | `supabase/modules/40-integrations.sql` (license section) | None |

| Electron Agent | Registry operations, IPC handlers | `electron/handlers/solidworks.ts` (license section), `electron/preload.ts` (license APIs) | None |

| Frontend Agent | UI components, integration | `src/features/settings/integrations/solidworks/LicenseManager/*` | Database Agent (for types) |

## Shared Files

| File | Owner | Rule |

|------|-------|------|

| `src/types/supabase.ts` | Database Agent | Auto-generated after schema, Frontend reads |

| `src/features/settings/integrations/solidworks/SolidWorksSettings.tsx` | Frontend Agent | Only Frontend modifies |

| `bluePLM/supabase/modules/40-integrations.sql` | Database Agent | Only Database modifies |

| `electron/handlers/solidworks.ts` | Electron Agent | Only Electron modifies |

| `electron/preload.ts` | Electron Agent | Only Electron modifies |

## Execution Order

```
┌─────────────────┐     ┌─────────────────┐
│ Database Agent  │     │ Electron Agent  │
│   (parallel)    │     │   (parallel)    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
            ┌─────────────────┐
            │ Frontend Agent  │
            │   (after both)  │
            └─────────────────┘
```

---

## Agent 1: Database Agent

### Prompt

> Implement the SOLIDWORKS license management database schema for BluePLM with enterprise-level code quality.

>

> **Read First:**

> - `.cursor/rules/database.mdc` for Supabase patterns

> - `supabase/modules/40-integrations.sql` for existing integration patterns

> - `supabase/core.sql` for RLS patterns and function conventions

>

> **Scope:**

> Add to `supabase/modules/40-integrations.sql` (append after existing content):

>

> 1. **Enum:** `solidworks_license_type` ('standalone', 'network')

>

> 2. **Table:** `solidworks_licenses`

>    - `id` UUID PRIMARY KEY

>    - `org_id` UUID NOT NULL REFERENCES organizations(id)

>    - `serial_number` TEXT NOT NULL (the SOLIDWORKS serial)

>    - `nickname` TEXT (friendly name like "Design Team License 1")

>    - `license_type` solidworks_license_type DEFAULT 'standalone'

>    - `product_name` TEXT (e.g., "SOLIDWORKS Professional")

>    - `seats` INTEGER DEFAULT 1 (for network licenses)

>    - `purchase_date` DATE

>    - `expiry_date` DATE

>    - `notes` TEXT

>    - `created_at` TIMESTAMPTZ DEFAULT NOW()

>    - `created_by` UUID REFERENCES users(id)

>    - `updated_at` TIMESTAMPTZ DEFAULT NOW()

>    - UNIQUE(org_id, serial_number)

>

> 3. **Table:** `solidworks_license_assignments`

>    - `id` UUID PRIMARY KEY

>    - `license_id` UUID NOT NULL REFERENCES solidworks_licenses(id) ON DELETE CASCADE

>    - `user_id` UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE

>    - `assigned_at` TIMESTAMPTZ DEFAULT NOW()

>    - `assigned_by` UUID REFERENCES users(id)

>    - `is_active` BOOLEAN DEFAULT false (whether pushed to registry)

>    - `activated_at` TIMESTAMPTZ

>    - `machine_id` TEXT (which machine has the activation)

>    - `machine_name` TEXT

>    - `deactivated_at` TIMESTAMPTZ

>    - UNIQUE(license_id, user_id)

>

> 4. **RLS Policies:**

>    - Org members can SELECT licenses in their org

>    - Only admins can INSERT/UPDATE/DELETE licenses

>    - Users can SELECT their own assignments

>    - Only admins can manage assignments

>

> 5. **Functions:**

>    - `assign_solidworks_license(p_license_id UUID, p_user_id UUID)` - Assigns license, returns JSON

>    - `unassign_solidworks_license(p_assignment_id UUID)` - Unassigns, returns JSON

>    - `activate_solidworks_license(p_assignment_id UUID, p_machine_id TEXT, p_machine_name TEXT)` - Marks as active

>    - `deactivate_solidworks_license(p_assignment_id UUID)` - Marks as deactivated

>

> 6. **Indexes:** org_id, license_id, user_id

>

> 7. **Realtime:** Enable for both tables

>

> 8. **Schema Version:** Bump version in both:

>    - `supabase/core.sql` INSERT INTO schema_version

>    - `src/lib/schemaVersion.ts` EXPECTED_SCHEMA_VERSION

>

> **Boundaries:**

> - OWNS: License section in `supabase/modules/40-integrations.sql`

> - MODIFY: `supabase/core.sql` (version bump only), `src/lib/schemaVersion.ts`

> - Do NOT modify: Any other files

>

> **Quality Requirements:**

> - Follow existing patterns in `40-integrations.sql` exactly

> - All functions must be SECURITY DEFINER with proper auth checks

> - Use is_org_admin() pattern for admin checks

> - Proper error handling in functions returning JSON

> - Idempotent DDL (CREATE TABLE IF NOT EXISTS, etc.)

>

> **Deliverables:**

> - Schema additions to `40-integrations.sql`

> - Version bumps in both files

> - Report in `DATABASE_AGENT_REPORT.md`

>

> **When complete:**

> 1. Run the Supabase type generation command found in the memory about Supabase credentials

> 2. Report results

### Boundary

- **OWNS (exclusive write):** License section in `supabase/modules/40-integrations.sql`
- **MODIFIES:** `supabase/core.sql` (version number only), `src/lib/schemaVersion.ts`
- **READS (no modify):** `supabase/core.sql` (for patterns), existing `40-integrations.sql`

### Tasks

- [ ] Create `solidworks_license_type` enum
- [ ] Create `solidworks_licenses` table with all columns and constraints
- [ ] Create `solidworks_license_assignments` table
- [ ] Add RLS policies for both tables
- [ ] Create helper functions for assign/unassign/activate/deactivate
- [ ] Add indexes for performance
- [ ] Enable realtime for both tables
- [ ] Bump schema version in `core.sql`
- [ ] Bump EXPECTED_SCHEMA_VERSION in `src/lib/schemaVersion.ts`
- [ ] Regenerate Supabase types

### Deliverables

- `solidworks_licenses` and `solidworks_license_assignments` tables
- RLS policies and helper functions
- Updated `src/types/supabase.ts` with new types
- `DATABASE_AGENT_REPORT.md`

---

## Agent 2: Electron Agent

### Prompt

> Implement Windows registry operations for SOLIDWORKS license management in BluePLM with enterprise-level code quality.

>

> **Read First:**

> - `.cursor/rules/electron.mdc` for IPC patterns

> - `electron/handlers/solidworks.ts` for existing patterns (especially the registry helpers section around line 1164)

> - `electron/preload.ts` for API exposure patterns

>

> **Context:**

> SOLIDWORKS stores license serial numbers in the Windows Registry at:

> `HKEY_LOCAL_MACHINE\Software\SolidWorks\Licenses\Serial Numbers`

>

> Writing to HKLM requires administrator privileges. The handlers should detect if elevation is needed and provide appropriate feedback.

>

> **Scope:**

>

> 1. **Add to `electron/handlers/solidworks.ts`** (after the File Locations section):

>

>    New helper functions:

>    ```typescript

>    // ============================================

>    // SOLIDWORKS License Registry Operations

>    // ============================================

>

>    const SW_LICENSE_REGISTRY_PATH = 'HKEY_LOCAL_MACHINE\\Software\\SolidWorks\\Licenses\\Serial Numbers'

>

>    function getSolidWorksLicenseFromRegistry(): { success: boolean; serialNumbers?: string[]; error?: string }

>    function setSolidWorksLicenseInRegistry(serialNumber: string): { success: boolean; error?: string; requiresAdmin?: boolean }

>    function removeSolidWorksLicenseFromRegistry(serialNumber: string): { success: boolean; error?: string; requiresAdmin?: boolean }

>    function checkLicenseInRegistry(serialNumber: string): { success: boolean; found: boolean; error?: string }

>    ```

>

>    New IPC handlers:

>    - `solidworks:get-license-registry` - Returns current serial numbers from registry

>    - `solidworks:set-license-registry` - Writes serial number to registry

>    - `solidworks:remove-license-registry` - Removes serial number from registry

>    - `solidworks:check-license-registry` - Checks if specific serial exists

>

> 2. **Add to `electron/preload.ts`** (in the solidworks object):

>    ```typescript

>    // License registry operations

>    getLicenseRegistry: () => ipcRenderer.invoke('solidworks:get-license-registry'),

>    setLicenseRegistry: (serialNumber: string) => ipcRenderer.invoke('solidworks:set-license-registry', serialNumber),

>    removeLicenseRegistry: (serialNumber: string) => ipcRenderer.invoke('solidworks:remove-license-registry', serialNumber),

>    checkLicenseRegistry: (serialNumber: string) => ipcRenderer.invoke('solidworks:check-license-registry', serialNumber),

>    ```

>

> 3. **Add TypeScript interface** in preload.ts solidworks type declaration

>

> **Boundaries:**

> - OWNS: License registry section in `electron/handlers/solidworks.ts`, license APIs in `electron/preload.ts`

> - Do NOT modify: Any other files

>

> **Quality Requirements:**

> - Follow existing registry helper patterns (see `readRegistryValue`, `writeRegistryValue` functions)

> - Handle admin permission errors gracefully with `requiresAdmin: true` in response

> - Proper error messages for common failures

> - Windows-only guards (`process.platform !== 'win32'`)

> - Add handlers to `unregisterSolidWorksHandlers()` cleanup list

>

> **Deliverables:**

> - Registry helper functions

> - IPC handlers registered

> - Preload API exposed

> - Report in `ELECTRON_AGENT_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** License registry section in `electron/handlers/solidworks.ts`, license APIs in `electron/preload.ts`
- **READS (no modify):** Existing patterns in both files

### Tasks

- [ ] Add `SW_LICENSE_REGISTRY_PATH` constant
- [ ] Implement `getSolidWorksLicenseFromRegistry()` helper
- [ ] Implement `setSolidWorksLicenseInRegistry()` helper with admin detection
- [ ] Implement `removeSolidWorksLicenseFromRegistry()` helper
- [ ] Implement `checkLicenseInRegistry()` helper
- [ ] Register IPC handlers for all four operations
- [ ] Add handlers to unregister list for cleanup
- [ ] Expose APIs in preload.ts solidworks object
- [ ] Add TypeScript types to preload.ts interface

### Deliverables

- Registry operation functions in `solidworks.ts`
- Four new IPC handlers
- Preload API exposure
- `ELECTRON_AGENT_REPORT.md`

---

## Agent 3: Frontend Agent

### Prompt

> Implement the SOLIDWORKS License Manager UI for BluePLM with enterprise-level code quality.

>

> **Read First:**

> - `.cursor/rules/react.mdc` for component patterns

> - `.cursor/rules/zustand.mdc` for state patterns

> - `src/features/settings/integrations/solidworks/SolidWorksSettings.tsx` for existing UI patterns

> - `src/types/supabase.ts` for database types (after Database Agent completes)

>

> **Wait For:** Database Agent and Electron Agent to complete first. Check for:

> - `DATABASE_AGENT_REPORT.md` exists

> - `ELECTRON_AGENT_REPORT.md` exists

> - `src/types/supabase.ts` contains `solidworks_licenses` type

>

> **Scope:**

>

> 1. **Create `src/features/settings/integrations/solidworks/LicenseManager/` folder:**

>

>    - `index.ts` - Barrel exports

>    - `LicenseManagerSection.tsx` - Main section component

>    - `LicenseTable.tsx` - Table showing all licenses

>    - `LicenseRow.tsx` - Individual license row with actions

>    - `AddLicenseModal.tsx` - Modal for adding new license

>    - `AssignLicenseModal.tsx` - Modal for assigning to user

>    - `useLicenseManager.ts` - Hook for license CRUD operations

>    - `types.ts` - Local types if needed

>

> 2. **LicenseManagerSection.tsx:**

>    - Section header: "SOLIDWORKS Licenses (Organization-wide)"

>    - Admin-only "Add License" button

>    - License table with columns: Nickname, Serial (masked), Type, Product, Assigned To, Status, Actions

>    - Empty state when no licenses

>    - Loading state

>

> 3. **LicenseTable.tsx and LicenseRow.tsx:**

>    - Mask serial numbers (show last 4 chars: `****-****-XXXX`)

>    - Click to reveal full serial (admin only)

>    - Status badge: Unassigned (gray), Assigned (yellow), Active (green)

>    - Actions: Edit, Assign/Unassign, Push to Registry, Deactivate, Delete

>    - Push button calls `window.electronAPI.solidworks.setLicenseRegistry()`

>

> 4. **AddLicenseModal.tsx:**

>    - Form fields: Serial Number, Nickname, Type (dropdown), Product Name, Seats, Purchase Date, Expiry Date, Notes

>    - Validation for serial number format

>    - Save to Supabase

>

> 5. **AssignLicenseModal.tsx:**

>    - User dropdown (filtered to org members)

>    - Show current assignment if exists

>    - Assign/Reassign functionality

>

> 6. **useLicenseManager.ts:**

>    - Fetch licenses for org

>    - CRUD operations via Supabase

>    - Realtime subscription for updates

>    - Integration with electronAPI for registry operations

>

> 7. **Integrate into SolidWorksSettings.tsx:**

>    - Import and render `<LicenseManagerSection />` after the Document Manager License section

>    - Only show for admins OR users with assigned licenses

>

> **Boundaries:**

> - OWNS: `src/features/settings/integrations/solidworks/LicenseManager/*`

> - MODIFIES: `src/features/settings/integrations/solidworks/SolidWorksSettings.tsx` (add import and render)

> - READS (no modify): `src/types/supabase.ts`, `src/stores/pdmStore.ts`

>

> **Quality Requirements:**

> - Follow existing SolidWorksSettings.tsx patterns exactly (styling, layout, toasts)

> - Use `usePDMStore` for organization, user, addToast, getEffectiveRole

> - Proper loading and error states

> - TypeScript types for all props and state

> - No `any` types

> - Accessible: proper labels, keyboard navigation

> - Responsive design matching existing settings

>

> **Deliverables:**

> - Complete LicenseManager folder with all components

> - Integration in SolidWorksSettings.tsx

> - Report in `FRONTEND_AGENT_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/features/settings/integrations/solidworks/LicenseManager/*`
- **MODIFIES:** `src/features/settings/integrations/solidworks/SolidWorksSettings.tsx`
- **READS (no modify):** `src/types/supabase.ts`, `src/stores/pdmStore.ts`, `electron/preload.ts` types

### Tasks

- [ ] Create `LicenseManager/` folder structure
- [ ] Implement `useLicenseManager.ts` hook with Supabase operations
- [ ] Implement `LicenseManagerSection.tsx` main component
- [ ] Implement `LicenseTable.tsx` with masked serials
- [ ] Implement `LicenseRow.tsx` with action buttons
- [ ] Implement `AddLicenseModal.tsx` with form validation
- [ ] Implement `AssignLicenseModal.tsx` with user dropdown
- [ ] Create barrel exports in `index.ts`
- [ ] Integrate into `SolidWorksSettings.tsx`
- [ ] Test push to registry functionality

### Deliverables

- Complete `LicenseManager/` component folder
- Integrated section in settings page
- `FRONTEND_AGENT_REPORT.md`

---

## Verification Checklist

After all agents complete:

- [ ] `npm run typecheck` passes
- [ ] Schema can be applied to Supabase without errors
- [ ] License CRUD operations work in UI
- [ ] License assignment to users works
- [ ] Push to registry writes serial correctly (test on Windows)
- [ ] RLS policies work (non-admin cannot see other org's licenses)
- [ ] Realtime updates when another user makes changes

## Final Integration

After verification, the coordinator should:

1. Review all three agent reports
2. Run full typecheck
3. Test end-to-end flow manually
4. Update CHANGELOG.md
5. Rename plan file to `COMPLETE-solidworks-license-manager-agents.plan.md`