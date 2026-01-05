# Agent 6: Settings Reorganization

## Mission
Reorganize 30+ settings files into logical domain groups within `features/settings/`.

## Ownership Boundaries

**FILES YOU OWN (only you touch these):**
- All files in `src/components/settings/` → Move to `src/features/settings/`
- `src/components/SettingsContent.tsx` → Move to feature
- `src/components/sidebar/SettingsNavigation.tsx` → Move to feature

**FILES YOU MUST NOT TOUCH:**
- `src/components/core/` (Agent 1)
- `src/components/shared/` (Agent 2)
- `src/features/seasonal-effects/` (Agent 3)
- `src/lib/utils/` (Agent 4)
- `src/features/file-browser/` (Agent 5)
- Store files, lib files (except reading)

---

## Current State Analysis

### Existing Settings Files (30 files)
```
src/components/settings/
├── AboutSettings.tsx
├── AccountSettings.tsx
├── ApiSettings.tsx
├── AuthProvidersSettings.tsx
├── BackupSettings.tsx
├── CompanyProfileSettings.tsx
├── ContributionHistory.tsx
├── DeleteAccountSettings.tsx
├── DevToolsSettings.tsx
├── ExportSettings.tsx
├── GoogleDriveSettings.tsx
├── index.ts
├── KeybindingsSettings.tsx
├── LogsSettings.tsx
├── MetadataColumnsSettings.tsx
├── ModulesEditor.tsx
├── ModulesSettings.tsx
├── OdooSettings.tsx
├── PerformanceSettings.tsx
├── PermissionsEditor.tsx
├── PreferencesSettings.tsx
├── ProfileSettings.tsx
├── RecoveryCodeSettings.tsx
├── RFQSettings.tsx
├── SerializationSettings.tsx
├── SlackSettings.tsx
├── SolidWorksSettings.tsx
├── SupabaseSettings.tsx
├── team-members/          # Already a folder with 23 files
├── UserProfileModal.tsx
├── VaultsSettings.tsx
├── WebhooksSettings.tsx
└── WooCommerceSettings.tsx
```

---

## Target Structure

```
src/features/settings/
├── components/
│   ├── SettingsContent.tsx        # Main settings router
│   ├── SettingsNavigation.tsx     # Settings sidebar nav
│   └── index.ts
│
├── account/
│   ├── AccountSettings.tsx
│   ├── ProfileSettings.tsx
│   ├── UserProfileModal.tsx
│   ├── DeleteAccountSettings.tsx
│   ├── KeybindingsSettings.tsx
│   ├── PreferencesSettings.tsx
│   └── index.ts
│
├── organization/
│   ├── CompanyProfileSettings.tsx
│   ├── VaultsSettings.tsx
│   ├── ModulesSettings.tsx
│   ├── ModulesEditor.tsx
│   ├── MetadataColumnsSettings.tsx
│   ├── AuthProvidersSettings.tsx
│   ├── PermissionsEditor.tsx
│   ├── team-members/              # Keep existing structure
│   │   └── [existing 23 files]
│   └── index.ts
│
├── integrations/
│   ├── ApiSettings.tsx
│   ├── WebhooksSettings.tsx
│   ├── google-drive/
│   │   └── GoogleDriveSettings.tsx
│   ├── solidworks/
│   │   └── SolidWorksSettings.tsx
│   ├── odoo/
│   │   └── OdooSettings.tsx
│   ├── slack/
│   │   └── SlackSettings.tsx
│   ├── woocommerce/
│   │   └── WooCommerceSettings.tsx
│   └── index.ts
│
├── system/
│   ├── PerformanceSettings.tsx
│   ├── DevToolsSettings.tsx
│   ├── LogsSettings.tsx
│   ├── BackupSettings.tsx
│   ├── ExportSettings.tsx
│   ├── SerializationSettings.tsx
│   ├── RFQSettings.tsx
│   ├── SupabaseSettings.tsx
│   ├── RecoveryCodeSettings.tsx
│   ├── AboutSettings.tsx
│   ├── ContributionHistory.tsx
│   └── index.ts
│
├── types.ts
├── constants.ts
└── index.ts
```

---

## Phase 1: Create Directory Structure

### Task 1.1: Create Feature Directories
```
src/features/settings/
src/features/settings/components/
src/features/settings/account/
src/features/settings/organization/
src/features/settings/integrations/
src/features/settings/integrations/google-drive/
src/features/settings/integrations/solidworks/
src/features/settings/integrations/odoo/
src/features/settings/integrations/slack/
src/features/settings/integrations/woocommerce/
src/features/settings/system/
```

---

## Phase 2: Move Account Settings

### Task 2.1: Move Account Files
Move these files to `src/features/settings/account/`:
- `AccountSettings.tsx`
- `ProfileSettings.tsx`
- `UserProfileModal.tsx`
- `DeleteAccountSettings.tsx`
- `KeybindingsSettings.tsx`
- `PreferencesSettings.tsx`

### Task 2.2: Update Imports in Moved Files
Each file needs import path updates. Example for ProfileSettings.tsx:
```typescript
// Before
import { usePDMStore } from '../../stores/pdmStore'
import { supabase } from '../../lib/supabase'

// After  
import { usePDMStore } from '@/stores/pdmStore'
import { supabase } from '@/lib/supabase'
```

### Task 2.3: Create Account Index
```typescript
// src/features/settings/account/index.ts
export { AccountSettings } from './AccountSettings'
export { ProfileSettings } from './ProfileSettings'
export { UserProfileModal } from './UserProfileModal'
export { DeleteAccountSettings } from './DeleteAccountSettings'
export { KeybindingsSettings } from './KeybindingsSettings'
export { PreferencesSettings } from './PreferencesSettings'
```

---

## Phase 3: Move Organization Settings

### Task 3.1: Move Organization Files
Move these files to `src/features/settings/organization/`:
- `CompanyProfileSettings.tsx`
- `VaultsSettings.tsx`
- `ModulesSettings.tsx`
- `ModulesEditor.tsx`
- `MetadataColumnsSettings.tsx`
- `AuthProvidersSettings.tsx`
- `PermissionsEditor.tsx`

### Task 3.2: Move team-members Folder
Copy entire `team-members/` folder to `src/features/settings/organization/team-members/`
- Update all imports in team-members files to use @/ aliases

### Task 3.3: Create Organization Index
```typescript
// src/features/settings/organization/index.ts
export { CompanyProfileSettings } from './CompanyProfileSettings'
export { VaultsSettings } from './VaultsSettings'
export { ModulesSettings } from './ModulesSettings'
export { ModulesEditor } from './ModulesEditor'
export { MetadataColumnsSettings } from './MetadataColumnsSettings'
export { AuthProvidersSettings } from './AuthProvidersSettings'
export { PermissionsEditor } from './PermissionsEditor'

// Team members (re-export from subfolder)
export * from './team-members'
```

---

## Phase 4: Move Integration Settings

### Task 4.1: Move API Settings
Move to `src/features/settings/integrations/`:
- `ApiSettings.tsx`
- `WebhooksSettings.tsx`

### Task 4.2: Move Integration-Specific Files
Create subfolders for each integration:

```typescript
// src/features/settings/integrations/google-drive/GoogleDriveSettings.tsx
// (moved from settings/GoogleDriveSettings.tsx)

// src/features/settings/integrations/google-drive/index.ts
export { GoogleDriveSettings } from './GoogleDriveSettings'
```

Repeat for:
- `solidworks/SolidWorksSettings.tsx`
- `odoo/OdooSettings.tsx`
- `slack/SlackSettings.tsx`
- `woocommerce/WooCommerceSettings.tsx`

### Task 4.3: Create Integrations Index
```typescript
// src/features/settings/integrations/index.ts
export { ApiSettings } from './ApiSettings'
export { WebhooksSettings } from './WebhooksSettings'
export { GoogleDriveSettings } from './google-drive'
export { SolidWorksSettings } from './solidworks'
export { OdooSettings } from './odoo'
export { SlackSettings } from './slack'
export { WooCommerceSettings } from './woocommerce'
```

---

## Phase 5: Move System Settings

### Task 5.1: Move System Files
Move these files to `src/features/settings/system/`:
- `PerformanceSettings.tsx`
- `DevToolsSettings.tsx`
- `LogsSettings.tsx`
- `BackupSettings.tsx`
- `ExportSettings.tsx`
- `SerializationSettings.tsx`
- `RFQSettings.tsx`
- `SupabaseSettings.tsx`
- `RecoveryCodeSettings.tsx`
- `AboutSettings.tsx`
- `ContributionHistory.tsx`

### Task 5.2: Create System Index
```typescript
// src/features/settings/system/index.ts
export { PerformanceSettings } from './PerformanceSettings'
export { DevToolsSettings } from './DevToolsSettings'
export { LogsSettings } from './LogsSettings'
export { BackupSettings } from './BackupSettings'
export { ExportSettings, getEffectiveExportSettings } from './ExportSettings'
export { SerializationSettings } from './SerializationSettings'
export { RFQSettings } from './RFQSettings'
export { SupabaseSettings } from './SupabaseSettings'
export { RecoveryCodeSettings } from './RecoveryCodeSettings'
export { AboutSettings } from './AboutSettings'
export { ContributionHistory } from './ContributionHistory'
```

---

## Phase 6: Move Main Components

### Task 6.1: Move SettingsContent
1. Read `src/components/SettingsContent.tsx`
2. Create `src/features/settings/components/SettingsContent.tsx`
3. Update all imports to use new feature paths:
```typescript
// Before
import { AccountSettings } from './settings/AccountSettings'

// After
import { AccountSettings } from '../account'
```

### Task 6.2: Move SettingsNavigation
1. Read `src/components/sidebar/SettingsNavigation.tsx`
2. Create `src/features/settings/components/SettingsNavigation.tsx`
3. Update imports

### Task 6.3: Create Components Index
```typescript
// src/features/settings/components/index.ts
export { SettingsContent } from './SettingsContent'
export { SettingsNavigation } from './SettingsNavigation'
```

---

## Phase 7: Create Types and Constants

### Task 7.1: Create Types File
```typescript
// src/features/settings/types.ts
export type SettingsTab = 
  // Account
  | 'profile'
  | 'account' 
  | 'keybindings'
  | 'preferences'
  // Organization
  | 'company'
  | 'team'
  | 'vaults'
  | 'modules'
  | 'metadata'
  | 'permissions'
  | 'auth-providers'
  // Integrations
  | 'api'
  | 'webhooks'
  | 'google-drive'
  | 'solidworks'
  | 'odoo'
  | 'slack'
  | 'woocommerce'
  // System
  | 'performance'
  | 'devtools'
  | 'logs'
  | 'backup'
  | 'export'
  | 'serialization'
  | 'rfq'
  | 'supabase'
  | 'recovery'
  | 'about'

export interface SettingsNavItem {
  id: SettingsTab
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  category: 'account' | 'organization' | 'integrations' | 'system'
  requiresAdmin?: boolean
  requiresFeature?: string
}
```

### Task 7.2: Create Constants File
```typescript
// src/features/settings/constants.ts
import { User, Building, Plug, Settings } from 'lucide-react'
import type { SettingsNavItem } from './types'

export const SETTINGS_CATEGORIES = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'organization', label: 'Organization', icon: Building },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'system', label: 'System', icon: Settings },
] as const

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  // Define all nav items with their categories
  // ...
]
```

---

## Phase 8: Create Feature Index and Stubs

### Task 8.1: Create Main Feature Index
```typescript
// src/features/settings/index.ts
// Components
export { SettingsContent, SettingsNavigation } from './components'

// Account settings
export * from './account'

// Organization settings
export * from './organization'

// Integration settings
export * from './integrations'

// System settings
export * from './system'

// Types
export type { SettingsTab, SettingsNavItem } from './types'

// Constants
export { SETTINGS_CATEGORIES, SETTINGS_NAV_ITEMS } from './constants'
```

### Task 8.2: Create Re-export Stubs
Create stub files at original locations for backward compatibility:

```typescript
// src/components/SettingsContent.tsx
export { SettingsContent } from '@/features/settings'
```

```typescript
// src/components/sidebar/SettingsNavigation.tsx
export { SettingsNavigation } from '@/features/settings'
```

```typescript
// src/components/settings/index.ts
// Re-export everything from feature for backward compatibility
export * from '@/features/settings'
```

Create individual stubs for each settings file:
```typescript
// src/components/settings/AccountSettings.tsx
export { AccountSettings } from '@/features/settings/account'
```

---

## Phase 9: Update SettingsContent Router

### Task 9.1: Update Import Paths
The SettingsContent.tsx needs to import from new locations:

```typescript
// src/features/settings/components/SettingsContent.tsx
import { 
  AccountSettings,
  ProfileSettings,
  // ... etc
} from '../account'

import {
  CompanyProfileSettings,
  // ... etc  
} from '../organization'

import {
  ApiSettings,
  GoogleDriveSettings,
  // ... etc
} from '../integrations'

import {
  PerformanceSettings,
  // ... etc
} from '../system'
```

---

## Verification Checklist

- [ ] `src/features/settings/` structure complete
- [ ] All 30+ settings files moved to appropriate subfolders
- [ ] `team-members/` folder moved with all 23 files
- [ ] All imports updated to use @/ aliases
- [ ] Barrel exports working for each category
- [ ] Main feature index exports everything
- [ ] Re-export stubs created at original locations
- [ ] SettingsContent routing still works
- [ ] SettingsNavigation highlighting still works
- [ ] `npm run typecheck` passes
- [ ] All settings pages accessible and functional

---

## Notes for Agent

1. **Preserve team-members structure** - It's already well-organized, just move it
2. **Watch for circular dependencies** - Settings files may import from each other
3. **Check for exported utilities** - Some settings files export helper functions (like `getEffectiveExportSettings`)
4. **Test each category** - After moving each category, verify imports work
5. **Use @/ aliases** - Don't use relative paths that go up multiple directories
