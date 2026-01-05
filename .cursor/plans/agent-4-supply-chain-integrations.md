# Agent 4: Supply Chain & Integrations Features Migration

## Objective
Create the `features/supply-chain/` and `features/integrations/` domains, moving all related views and panels from `src/components/`.

## Risk Level
**Medium** - Multiple components across different locations.

## Dependencies
None - This work can proceed independently.

## Context
Maps to database modules:
- `supabase/modules/30-supply-chain.sql` - Suppliers, RFQs
- `supabase/modules/40-integrations.sql` - Odoo, WooCommerce, Webhooks

Note: Settings/integrations (configuration UIs) stay in `features/settings/integrations/`. This is for the **runtime views/panels** of integrations.

---

## Part 1: Supply Chain Feature

### Files to Move

| Source | Destination |
|--------|-------------|
| `components/sidebar/SuppliersView.tsx` | `features/supply-chain/suppliers/SuppliersView.tsx` |
| `components/sidebar/SupplierPortalView.tsx` | `features/supply-chain/portal/SupplierPortalView.tsx` |
| `components/sidebar/RFQView.tsx` | `features/supply-chain/rfq/RFQView.tsx` |

### Step 1: Create folder structure
```powershell
New-Item -ItemType Directory -Path "src/features/supply-chain/suppliers" -Force
New-Item -ItemType Directory -Path "src/features/supply-chain/portal" -Force
New-Item -ItemType Directory -Path "src/features/supply-chain/rfq" -Force
```

### Step 2: Move view files
```powershell
Move-Item -Path "src/components/sidebar/SuppliersView.tsx" -Destination "src/features/supply-chain/suppliers/SuppliersView.tsx"
Move-Item -Path "src/components/sidebar/SupplierPortalView.tsx" -Destination "src/features/supply-chain/portal/SupplierPortalView.tsx"
Move-Item -Path "src/components/sidebar/RFQView.tsx" -Destination "src/features/supply-chain/rfq/RFQView.tsx"
```

### Step 3: Create index.ts barrel exports

**`src/features/supply-chain/suppliers/index.ts`**:
```typescript
export { SuppliersView } from './SuppliersView'
```

**`src/features/supply-chain/portal/index.ts`**:
```typescript
export { SupplierPortalView } from './SupplierPortalView'
```

**`src/features/supply-chain/rfq/index.ts`**:
```typescript
export { RFQView } from './RFQView'
```

### Step 4: Create main supply-chain index.ts

**`src/features/supply-chain/index.ts`**:
```typescript
/**
 * Supply Chain Feature
 * 
 * Suppliers, Supplier Portal, and RFQ Management
 */

export * from './suppliers'
export * from './portal'
export * from './rfq'
```

---

## Part 2: Integrations Feature

### Files to Move

| Source | Destination |
|--------|-------------|
| `components/sidebar/GoogleDriveView.tsx` | `features/integrations/google-drive/GoogleDriveView.tsx` |
| `components/GoogleDrivePanel.tsx` | `features/integrations/google-drive/GoogleDrivePanel.tsx` |
| `components/SolidWorksPanel.tsx` | `features/integrations/solidworks/SolidWorksPanel.tsx` |
| `components/SWDatacardPanel.tsx` | `features/integrations/solidworks/SWDatacardPanel.tsx` |
| `components/sidebar/GSDView.tsx` | `features/integrations/gsd/GSDView.tsx` |
| `components/sidebar/IntegrationsView.tsx` | `features/integrations/IntegrationsView.tsx` |

### Step 5: Create folder structure
```powershell
New-Item -ItemType Directory -Path "src/features/integrations/google-drive" -Force
New-Item -ItemType Directory -Path "src/features/integrations/solidworks" -Force
New-Item -ItemType Directory -Path "src/features/integrations/gsd" -Force
```

### Step 6: Move Google Drive files
```powershell
Move-Item -Path "src/components/sidebar/GoogleDriveView.tsx" -Destination "src/features/integrations/google-drive/GoogleDriveView.tsx"
Move-Item -Path "src/components/GoogleDrivePanel.tsx" -Destination "src/features/integrations/google-drive/GoogleDrivePanel.tsx"
```

### Step 7: Move SolidWorks files
```powershell
Move-Item -Path "src/components/SolidWorksPanel.tsx" -Destination "src/features/integrations/solidworks/SolidWorksPanel.tsx"
Move-Item -Path "src/components/SWDatacardPanel.tsx" -Destination "src/features/integrations/solidworks/SWDatacardPanel.tsx"
```

### Step 8: Move GSD and Integrations view
```powershell
Move-Item -Path "src/components/sidebar/GSDView.tsx" -Destination "src/features/integrations/gsd/GSDView.tsx"
Move-Item -Path "src/components/sidebar/IntegrationsView.tsx" -Destination "src/features/integrations/IntegrationsView.tsx"
```

### Step 9: Create index.ts barrel exports

**`src/features/integrations/google-drive/index.ts`**:
```typescript
export { GoogleDriveView } from './GoogleDriveView'
export { GoogleDrivePanel } from './GoogleDrivePanel'
```

**`src/features/integrations/solidworks/index.ts`**:
```typescript
export { SolidWorksPanel } from './SolidWorksPanel'
export { SWDatacardPanel } from './SWDatacardPanel'
```

**`src/features/integrations/gsd/index.ts`**:
```typescript
export { GSDView } from './GSDView'
```

### Step 10: Create main integrations index.ts

**`src/features/integrations/index.ts`**:
```typescript
/**
 * Integrations Feature
 * 
 * Runtime views and panels for external integrations
 * (Configuration UIs are in features/settings/integrations/)
 */

export { IntegrationsView } from './IntegrationsView'
export * from './google-drive'
export * from './solidworks'
export * from './gsd'
```

---

## Part 3: Fix Imports

### Step 11: Fix imports in moved files

All moved files will need import path updates:

```typescript
// Before
import { usePDMStore } from '../../stores/pdmStore'
import { supabase } from '../../lib/supabase'

// After
import { usePDMStore } from '@/stores/pdmStore'
import { supabase } from '@/lib/supabase'
```

### Step 12: Update Sidebar.tsx lazy imports

In `Sidebar.tsx`:

```typescript
// Before
const SuppliersView = lazy(() => import('./sidebar/SuppliersView').then(m => ({ default: m.SuppliersView })))
const SupplierPortalView = lazy(() => import('./sidebar/SupplierPortalView').then(m => ({ default: m.SupplierPortalView })))
const GoogleDriveView = lazy(() => import('./sidebar/GoogleDriveView').then(m => ({ default: m.GoogleDriveView })))

// After
const SuppliersView = lazy(() => import('@/features/supply-chain/suppliers').then(m => ({ default: m.SuppliersView })))
const SupplierPortalView = lazy(() => import('@/features/supply-chain/portal').then(m => ({ default: m.SupplierPortalView })))
const GoogleDriveView = lazy(() => import('@/features/integrations/google-drive').then(m => ({ default: m.GoogleDriveView })))
```

### Step 13: Update RightPanel.tsx imports

In `RightPanel.tsx` (for panels that appear on the right):

```typescript
// Before
import { GoogleDrivePanel } from '../GoogleDrivePanel'
import { SolidWorksPanel } from '../SolidWorksPanel'
import { SWDatacardPanel } from '../SWDatacardPanel'

// After
import { GoogleDrivePanel, SolidWorksPanel, SWDatacardPanel } from '@/features/integrations'
// Or import individually from subfolders
```

### Step 14: Update features/index.ts

**`src/features/index.ts`**:
```typescript
/**
 * Feature Modules Index
 */

export * from './seasonal-effects'
export * from './source'
export * from './change-control'
export * from './items'
export * from './supply-chain'
export * from './integrations'
```

---

## Verification

```powershell
npm run typecheck
```

Then manually verify:
1. Suppliers view loads and shows supplier list
2. Supplier Portal view loads
3. RFQ view loads
4. Google Drive view loads in sidebar
5. Google Drive panel opens correctly
6. SolidWorks panel works
7. SWDatacard panel works
8. GSD view loads

---

## Files Affected Summary

### Created:
- `src/features/supply-chain/` (entire structure)
- `src/features/integrations/` (entire structure)
- 7 index.ts files

### Moved:
- SuppliersView.tsx
- SupplierPortalView.tsx
- RFQView.tsx
- GoogleDriveView.tsx
- GoogleDrivePanel.tsx
- SolidWorksPanel.tsx
- SWDatacardPanel.tsx
- GSDView.tsx
- IntegrationsView.tsx

### Modified:
- `src/features/index.ts`
- `src/components/layout/Sidebar/Sidebar.tsx` (lazy imports)
- `src/components/layout/RightPanel/RightPanel.tsx` (imports)
- All 9 moved files (import paths)
