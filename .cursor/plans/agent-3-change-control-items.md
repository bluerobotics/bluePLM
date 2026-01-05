# Agent 3: Change Control & Items Features Migration

## Objective
Create the `features/change-control/` and `features/items/` domains, moving all related views from `src/components/sidebar/`.

## Risk Level
**Medium** - Multiple views but straightforward moves.

## Dependencies
None - This work can proceed independently.

## Context
Maps to database modules:
- `supabase/modules/20-change-control.sql` - ECOs, Reviews, Deviations, Process Templates
- Items module (future: BOMs, Products)

---

## Part 1: Change Control Feature

### Files to Move

| Source | Destination |
|--------|-------------|
| `components/sidebar/ECOView.tsx` | `features/change-control/eco/ECOView.tsx` |
| `components/sidebar/ECRView.tsx` | `features/change-control/ecr/ECRView.tsx` |
| `components/sidebar/ReviewsView.tsx` | `features/change-control/reviews/ReviewsView.tsx` |
| `components/sidebar/DeviationsView.tsx` | `features/change-control/deviations/DeviationsView.tsx` |
| `components/sidebar/ProcessView.tsx` | `features/change-control/process/ProcessView.tsx` |
| `components/sidebar/ScheduleView.tsx` | `features/change-control/schedule/ScheduleView.tsx` |

### Step 1: Create folder structure
```powershell
New-Item -ItemType Directory -Path "src/features/change-control/eco" -Force
New-Item -ItemType Directory -Path "src/features/change-control/ecr" -Force
New-Item -ItemType Directory -Path "src/features/change-control/reviews" -Force
New-Item -ItemType Directory -Path "src/features/change-control/deviations" -Force
New-Item -ItemType Directory -Path "src/features/change-control/process" -Force
New-Item -ItemType Directory -Path "src/features/change-control/schedule" -Force
```

### Step 2: Move view files
```powershell
Move-Item -Path "src/components/sidebar/ECOView.tsx" -Destination "src/features/change-control/eco/ECOView.tsx"
Move-Item -Path "src/components/sidebar/ECRView.tsx" -Destination "src/features/change-control/ecr/ECRView.tsx"
Move-Item -Path "src/components/sidebar/ReviewsView.tsx" -Destination "src/features/change-control/reviews/ReviewsView.tsx"
Move-Item -Path "src/components/sidebar/DeviationsView.tsx" -Destination "src/features/change-control/deviations/DeviationsView.tsx"
Move-Item -Path "src/components/sidebar/ProcessView.tsx" -Destination "src/features/change-control/process/ProcessView.tsx"
Move-Item -Path "src/components/sidebar/ScheduleView.tsx" -Destination "src/features/change-control/schedule/ScheduleView.tsx"
```

### Step 3: Create index.ts barrel exports

**`src/features/change-control/eco/index.ts`**:
```typescript
export { ECOView } from './ECOView'
```

**`src/features/change-control/ecr/index.ts`**:
```typescript
export { ECRView } from './ECRView'
```

**`src/features/change-control/reviews/index.ts`**:
```typescript
export { ReviewsView } from './ReviewsView'
```

**`src/features/change-control/deviations/index.ts`**:
```typescript
export { DeviationsView } from './DeviationsView'
```

**`src/features/change-control/process/index.ts`**:
```typescript
export { ProcessView } from './ProcessView'
```

**`src/features/change-control/schedule/index.ts`**:
```typescript
export { ScheduleView } from './ScheduleView'
```

### Step 4: Create main change-control index.ts

**`src/features/change-control/index.ts`**:
```typescript
/**
 * Change Control Feature
 * 
 * ECRs, ECOs, Reviews, Deviations, and Process Management
 */

export * from './eco'
export * from './ecr'
export * from './reviews'
export * from './deviations'
export * from './process'
export * from './schedule'
```

---

## Part 2: Items Feature

### Files to Move

| Source | Destination |
|--------|-------------|
| `components/sidebar/ProductsView.tsx` | `features/items/products/ProductsView.tsx` |

### Step 5: Create folder structure
```powershell
New-Item -ItemType Directory -Path "src/features/items/products" -Force
New-Item -ItemType Directory -Path "src/features/items/boms" -Force  # Placeholder for future
```

### Step 6: Move ProductsView
```powershell
Move-Item -Path "src/components/sidebar/ProductsView.tsx" -Destination "src/features/items/products/ProductsView.tsx"
```

### Step 7: Create index.ts barrel exports

**`src/features/items/products/index.ts`**:
```typescript
export { ProductsView } from './ProductsView'
```

**`src/features/items/boms/index.ts`** (placeholder):
```typescript
// BOMs feature - Coming Soon
// export { BOMsView } from './BOMsView'
```

### Step 8: Create main items index.ts

**`src/features/items/index.ts`**:
```typescript
/**
 * Items Feature
 * 
 * Item Master, BOMs, and Product Structures
 */

export * from './products'
// export * from './boms'  // Coming soon
```

---

## Part 3: Fix Imports

### Step 9: Fix imports in moved files

All moved files will need import path updates:

```typescript
// Before
import { usePDMStore } from '../../stores/pdmStore'
import { supabase } from '../../lib/supabase'

// After
import { usePDMStore } from '@/stores/pdmStore'
import { supabase } from '@/lib/supabase'
```

### Step 10: Update Sidebar.tsx lazy imports

In `Sidebar.tsx`:

```typescript
// Before
const ECOView = lazy(() => import('./sidebar/ECOView').then(m => ({ default: m.ECOView })))
const ECRView = lazy(() => import('./sidebar/ECRView').then(m => ({ default: m.ECRView })))
const DeviationsView = lazy(() => import('./sidebar/DeviationsView').then(m => ({ default: m.DeviationsView })))
const ProductsView = lazy(() => import('./sidebar/ProductsView').then(m => ({ default: m.ProductsView })))
const ProcessView = lazy(() => import('./sidebar/ProcessView').then(m => ({ default: m.ProcessView })))
const ScheduleView = lazy(() => import('./sidebar/ScheduleView').then(m => ({ default: m.ScheduleView })))

// After
const ECOView = lazy(() => import('@/features/change-control/eco').then(m => ({ default: m.ECOView })))
const ECRView = lazy(() => import('@/features/change-control/ecr').then(m => ({ default: m.ECRView })))
const DeviationsView = lazy(() => import('@/features/change-control/deviations').then(m => ({ default: m.DeviationsView })))
const ProductsView = lazy(() => import('@/features/items/products').then(m => ({ default: m.ProductsView })))
const ProcessView = lazy(() => import('@/features/change-control/process').then(m => ({ default: m.ProcessView })))
const ScheduleView = lazy(() => import('@/features/change-control/schedule').then(m => ({ default: m.ScheduleView })))
```

### Step 11: Update features/index.ts

**`src/features/index.ts`**:
```typescript
/**
 * Feature Modules Index
 * 
 * Re-exports all feature modules for convenient access
 */

export * from './seasonal-effects'
export * from './source'
export * from './change-control'
export * from './items'
```

---

## Verification

```powershell
npm run typecheck
```

Then manually verify:
1. ECO view loads and displays ECOs
2. ECR view loads
3. Deviations view loads
4. Reviews view loads (if implemented)
5. Process editor view loads
6. Schedule view loads
7. Products view loads

---

## Files Affected Summary

### Created:
- `src/features/change-control/` (entire structure)
- `src/features/items/` (entire structure)
- 8 index.ts files

### Moved:
- ECOView.tsx
- ECRView.tsx
- ReviewsView.tsx
- DeviationsView.tsx
- ProcessView.tsx
- ScheduleView.tsx
- ProductsView.tsx

### Modified:
- `src/features/index.ts`
- `src/components/layout/Sidebar/Sidebar.tsx` (lazy imports)
- All 7 moved view files (import paths)
