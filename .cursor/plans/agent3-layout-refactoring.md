# Agent 3: Layout Layer Refactoring

## Objective
Eliminate prop drilling in layout components by having them call hooks directly, and refactor Sidebar.tsx to use data-driven patterns.

## Problem Summary
1. Callbacks like `loadFiles`, `onOpenVault`, `onRefresh` are drilled through 4+ component levels
2. Settings tab state is passed as props instead of accessed from store
3. Sidebar.tsx has ~400 lines of duplicate switch statements for `viewNames` and `getTitle()`

## Prerequisites
Agent 2 will add `settingsTab` and `setSettingsTab` to the Zustand store. This agent can work in parallel assuming that state exists.

## Tasks

### Task 1: Create Module Labels Constants

**Create new file: `src/constants/moduleLabels.ts`**

Extract the view names and titles from Sidebar.tsx:

```typescript
/**
 * Human-readable labels for sidebar modules
 * Used by Sidebar, ActivityBar, and other UI components
 */

import type { SidebarView } from '@/stores/types'

/** Display names for modules (sentence case) */
export const MODULE_LABELS: Record<SidebarView, string> = {
  // Source Files
  'explorer': 'Explorer',
  'pending': 'Pending Changes',
  'history': 'History',
  'workflows': 'File Workflows',
  'trash': 'Trash',
  // Items
  'items': 'Item Browser',
  'boms': 'BOMs',
  'products': 'Products',
  // Change Control
  'ecr': 'ECRs / Issues',
  'eco': 'ECOs',
  'notifications': 'Notifications',
  'deviations': 'Deviations',
  'release-schedule': 'Release Schedule',
  'process': 'Process Editor',
  // Supply Chain - Suppliers
  'supplier-database': 'Supplier Database',
  'supplier-portal': 'Supplier Portal',
  // Supply Chain - Purchasing
  'purchase-requests': 'Purchase Requests',
  'purchase-orders': 'Purchase Orders',
  'invoices': 'Invoices',
  // Supply Chain - Logistics
  'shipping': 'Shipping',
  'receiving': 'Receiving',
  // Production
  'manufacturing-orders': 'Manufacturing Orders',
  'travellers': 'Travellers',
  'work-instructions': 'Work Instructions',
  'production-schedule': 'Production Schedule',
  'routings': 'Routings',
  'work-centers': 'Work Centers',
  'process-flows': 'Process Flows',
  'equipment': 'Equipment',
  // Production - Analytics
  'yield-tracking': 'Yield Tracking',
  'error-codes': 'Error Codes',
  'downtime': 'Downtime',
  'oee': 'OEE Dashboard',
  'scrap-tracking': 'Scrap Tracking',
  // Quality
  'fai': 'First Article Inspection (FAI)',
  'ncr': 'Non-Conformance Report (NCR)',
  'imr': 'Incoming Material Report (IMR)',
  'scar': 'Supplier Corrective Action (SCAR)',
  'capa': 'Corrective & Preventive Action (CAPA)',
  'rma': 'Return Material Authorization (RMA)',
  'certificates': 'Certificates',
  'calibration': 'Calibration',
  'quality-templates': 'Templates',
  // Accounting
  'accounts-payable': 'Accounts Payable',
  'accounts-receivable': 'Accounts Receivable',
  'general-ledger': 'General Ledger',
  'cost-tracking': 'Cost Tracking',
  'budgets': 'Budgets',
  // Integrations
  'google-drive': 'Google Drive',
  // System
  'terminal': 'Terminal',
  'settings': 'Settings',
}

/** Header titles for sidebar (uppercase) */
export const MODULE_TITLES: Record<SidebarView, string> = Object.fromEntries(
  Object.entries(MODULE_LABELS).map(([key, value]) => [key, value.toUpperCase()])
) as Record<SidebarView, string>

/** Get module label with fallback */
export function getModuleLabel(view: SidebarView): string {
  return MODULE_LABELS[view] || view
}

/** Get module title (uppercase) with fallback */
export function getModuleTitle(view: SidebarView): string {
  return MODULE_TITLES[view] || view.toUpperCase()
}
```

**Create: `src/constants/index.ts`**
```typescript
export * from './moduleLabels'
```

### Task 2: Refactor App.tsx - Remove Local State and Prop Drilling

**File: `src/app/App.tsx`**

Changes to make:

1. Remove local `settingsTab` state - use store instead:
```typescript
// REMOVE this:
const [settingsTab, setSettingsTab] = useState<SettingsTab>('profile')

// REPLACE with:
const settingsTab = usePDMStore(s => s.settingsTab)
const setSettingsTab = usePDMStore(s => s.setSettingsTab)
```

2. Remove the CustomEvent listener for settings tab navigation (lines ~69-75) - components will use store directly

3. Simplify AppShell props - remove callback props that components can get from hooks:
```typescript
// BEFORE (many props):
<AppShell
  showWelcome={showWelcome}
  isSignInScreen={isSignInScreen}
  settingsTab={settingsTab}
  onSettingsTabChange={setSettingsTab}
  onOpenVault={handleOpenVault}
  onOpenRecentVault={handleOpenRecentVault}
  onChangeOrg={handleChangeOrg}
  loadFiles={loadFiles}
  stagedConflicts={stagedConflicts}
  onClearStagedConflicts={clearStagedConflicts}
  vaultNotFoundPath={vaultNotFoundPath}
  vaultNotFoundName={vaultNotFoundName}
  onCloseVaultNotFound={handleCloseVaultNotFound}
  onVaultNotFoundSettings={handleVaultNotFoundSettings}
  onVaultNotFoundBrowse={handleVaultNotFoundBrowse}
/>

// AFTER (minimal props - only things that truly need to come from App):
<AppShell
  showWelcome={showWelcome}
  isSignInScreen={isSignInScreen}
/>
```

### Task 3: Refactor AppShell.tsx

**File: `src/components/layout/AppShell.tsx`**

1. Simplify the interface:
```typescript
interface AppShellProps {
  showWelcome: boolean
  isSignInScreen: boolean
}
```

2. Call hooks directly inside AppShell:
```typescript
import { useLoadFiles, useVaultManagement, useStagedCheckins } from '@/hooks'

export function AppShell({ showWelcome, isSignInScreen }: AppShellProps) {
  // Get state from store
  const settingsTab = usePDMStore(s => s.settingsTab)
  const setSettingsTab = usePDMStore(s => s.setSettingsTab)
  
  // Call hooks directly instead of receiving as props
  const { loadFiles } = useLoadFiles()
  const {
    handleOpenVault,
    handleOpenRecentVault,
    handleVaultNotFoundBrowse,
    handleVaultNotFoundSettings,
    handleCloseVaultNotFound,
    vaultNotFoundPath,
    vaultNotFoundName,
  } = useVaultManagement(setSettingsTab)
  
  const { stagedConflicts, clearStagedConflicts } = useStagedCheckins(loadFiles)
  
  // ... rest of component
}
```

3. Update child component calls to not pass unnecessary props:
```typescript
<MainContent
  showWelcome={showWelcome}
  activeView={activeView}
  detailsPanelVisible={detailsPanelVisible}
  isResizingSidebar={isResizingSidebar}
  isResizingRightPanel={isResizingRightPanel}
  onResizeDetailsStart={() => setIsResizingDetails(true)}
/>

<Sidebar />  // No props needed - it calls hooks directly
```

### Task 4: Refactor MainContent.tsx

**File: `src/components/layout/MainContent.tsx`**

1. Simplify interface:
```typescript
interface MainContentProps {
  showWelcome: boolean
  activeView: string
  detailsPanelVisible: boolean
  isResizingSidebar: boolean
  isResizingRightPanel: boolean
  onResizeDetailsStart: () => void
}
```

2. Call hooks directly:
```typescript
import { useLoadFiles, useAuth, useVaultManagement } from '@/hooks'

export function MainContent({ ... }: MainContentProps) {
  const settingsTab = usePDMStore(s => s.settingsTab)
  const { loadFiles } = useLoadFiles()
  const { handleChangeOrg } = useAuth()
  const { handleOpenRecentVault } = useVaultManagement()
  
  // ... use these directly
}
```

3. Remove from props: `settingsTab`, `onOpenRecentVault`, `onChangeOrg`, `onRefresh`

### Task 5: Refactor Sidebar.tsx

**File: `src/components/layout/Sidebar/Sidebar.tsx`**

Major refactoring to reduce from ~550 lines to ~150 lines:

1. Remove props entirely - call hooks directly:
```typescript
import { useLoadFiles, useVaultManagement } from '@/hooks'
import { getModuleTitle, MODULE_LABELS } from '@/constants/moduleLabels'

export function Sidebar() {
  const { activeView, sidebarWidth, connectedVaults, moduleConfig } = usePDMStore()
  const settingsTab = usePDMStore(s => s.settingsTab)
  const setSettingsTab = usePDMStore(s => s.setSettingsTab)
  
  const { loadFiles } = useLoadFiles()
  const { handleOpenVault, handleOpenRecentVault } = useVaultManagement()
  
  // ... rest
}
```

2. Replace `getTitle()` function with data lookup:
```typescript
// REMOVE the entire getTitle() switch statement (~120 lines)

// REPLACE with:
const title = getModuleTitle(activeView)
```

3. Replace `viewNames` object with import:
```typescript
// REMOVE the viewNames object (~60 lines)

// REPLACE with:
import { MODULE_LABELS } from '@/constants/moduleLabels'
// Use MODULE_LABELS[activeView] where needed
```

4. Consider extracting view rendering to a separate component (optional but recommended):

**Create: `src/components/layout/Sidebar/SidebarViewRenderer.tsx`**
```typescript
import { lazy, Suspense } from 'react'
import { MODULE_LABELS } from '@/constants/moduleLabels'
// ... lazy imports ...

interface SidebarViewRendererProps {
  activeView: SidebarView
  moduleConfig: ModuleConfig
}

export function SidebarViewRenderer({ activeView, moduleConfig }: SidebarViewRendererProps) {
  // The switch statement for rendering views, extracted from Sidebar.tsx
}
```

### Task 6: Update Hook Exports

**File: `src/hooks/index.ts`**

Ensure `useAuth` exports `handleChangeOrg`:
```typescript
export { useAuth } from './useAuth'
```

Verify `useAuth.ts` exposes the method:
```typescript
// In useAuth.ts, ensure handleChangeOrg is returned
return {
  supabaseReady,
  handleSupabaseConfigured,
  handleChangeOrg,  // <-- This needs to be returned
}
```

### Task 7: Update useVaultManagement Hook

**File: `src/hooks/useVaultManagement.ts`**

The hook currently takes `setSettingsTab` as a parameter. Update to get it from store:
```typescript
export function useVaultManagement() {
  const setSettingsTab = usePDMStore(s => s.setSettingsTab)
  // ... rest of hook
  
  return {
    handleOpenVault,
    handleOpenRecentVault,
    handleVaultNotFoundBrowse,
    handleVaultNotFoundSettings,
    handleCloseVaultNotFound,
    vaultNotFoundPath,
    vaultNotFoundName,
    lastLoadKey,
  }
}
```

## Testing Checklist
- [ ] `npm run typecheck` passes
- [ ] App launches without errors
- [ ] Opening a vault works
- [ ] Recent vaults work
- [ ] Settings tab navigation works
- [ ] Sidebar views switch correctly
- [ ] Settings persist across refresh
- [ ] All dialogs (vault not found, staged conflicts) work

## Files Modified Summary
- Created: `src/constants/moduleLabels.ts`
- Created: `src/constants/index.ts`
- Modified: `src/app/App.tsx`
- Modified: `src/components/layout/AppShell.tsx`
- Modified: `src/components/layout/MainContent.tsx`
- Modified: `src/components/layout/Sidebar/Sidebar.tsx`
- Modified: `src/hooks/useVaultManagement.ts`
- Optional: Created `src/components/layout/Sidebar/SidebarViewRenderer.tsx`

## Coordination Notes
- Depends on Agent 2 adding `settingsTab` to store (can work in parallel assuming it exists)
- Does not conflict with Agent 1 (utilities) or Agent 4 (features)
