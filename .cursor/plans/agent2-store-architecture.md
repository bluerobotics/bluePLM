# Agent 2: Store & State Architecture

## Objective
Optimize the Zustand store architecture by adding missing UI state, creating a versioned migration system, and improving persistence organization.

## Problem Summary
1. Settings tab state is managed locally in App.tsx but consumed deep in component tree (prop drilling)
2. Store persistence partializes 60+ fields in one massive list
3. Complex merge function (~250 lines) with inline migrations
4. No versioning for persisted state schema

## Tasks

### Task 1: Add Settings Tab State to UISlice

**File: `src/stores/slices/uiSlice.ts`**

Add settings tab state and action:

```typescript
// Add to UISlice interface in src/stores/types.ts first
settingsTab: SettingsTab
setSettingsTab: (tab: SettingsTab) => void
```

In the slice implementation:
```typescript
// Initial state
settingsTab: 'profile' as SettingsTab,

// Action
setSettingsTab: (tab) => set({ settingsTab: tab }),
```

**File: `src/stores/types.ts`**

Add to `UISlice` interface:
```typescript
import type { SettingsTab } from '@/types/settings'

export interface UISlice {
  // ... existing fields ...
  
  // Settings navigation
  settingsTab: SettingsTab
  setSettingsTab: (tab: SettingsTab) => void
}
```

### Task 2: Add Settings Tab to Persistence

**File: `src/stores/pdmStore.ts`**

Add `settingsTab` to the partialize list (around line 94):
```typescript
partialize: (state) => ({
  // ... existing fields ...
  settingsTab: state.settingsTab,
}),
```

Add to merge function to restore with default:
```typescript
settingsTab: (persisted.settingsTab as SettingsTab) || 'profile',
```

### Task 3: Create Versioned Migration System

**Create new file: `src/stores/migrations.ts`**

```typescript
/**
 * Store Migration System
 * 
 * Each migration transforms persisted state from one version to the next.
 * Migrations run in order when the app loads with older persisted data.
 */

export interface StoreMigration {
  version: number
  description: string
  migrate: (state: Record<string, unknown>) => Record<string, unknown>
}

// Current schema version - increment when adding migrations
export const CURRENT_STORE_VERSION = 1

/**
 * All migrations in order. Each transforms state from previous version.
 */
export const migrations: StoreMigration[] = [
  // Example migration for future use:
  // {
  //   version: 2,
  //   description: 'Rename sidebarWidth to primarySidebarWidth',
  //   migrate: (state) => {
  //     const { sidebarWidth, ...rest } = state
  //     return { ...rest, primarySidebarWidth: sidebarWidth ?? 280 }
  //   }
  // }
]

/**
 * Run all necessary migrations on persisted state
 */
export function runMigrations(
  persistedState: Record<string, unknown>,
  fromVersion: number
): Record<string, unknown> {
  let state = { ...persistedState }
  
  for (const migration of migrations) {
    if (migration.version > fromVersion) {
      console.log(`[Store] Running migration v${migration.version}: ${migration.description}`)
      state = migration.migrate(state)
    }
  }
  
  // Always set current version after migrations
  state._storeVersion = CURRENT_STORE_VERSION
  
  return state
}

/**
 * Get the version from persisted state, defaulting to 0 for legacy data
 */
export function getPersistedVersion(state: Record<string, unknown>): number {
  return typeof state._storeVersion === 'number' ? state._storeVersion : 0
}
```

### Task 4: Organize Persistence Fields

**File: `src/stores/pdmStore.ts`**

Reorganize the partialize function with logical groupings and comments:

```typescript
partialize: (state) => ({
  // ═══════════════════════════════════════════════════════════════
  // Schema Version
  // ═══════════════════════════════════════════════════════════════
  _storeVersion: CURRENT_STORE_VERSION,
  
  // ═══════════════════════════════════════════════════════════════
  // Vault State
  // ═══════════════════════════════════════════════════════════════
  vaultPath: state.vaultPath,
  vaultName: state.vaultName,
  recentVaults: state.recentVaults,
  autoConnect: state.autoConnect,
  connectedVaults: state.connectedVaults,
  activeVaultId: state.activeVaultId,
  
  // ═══════════════════════════════════════════════════════════════
  // UI Layout
  // ═══════════════════════════════════════════════════════════════
  sidebarVisible: state.sidebarVisible,
  sidebarWidth: state.sidebarWidth,
  activityBarMode: state.activityBarMode,
  activeView: state.activeView,
  settingsTab: state.settingsTab,
  detailsPanelVisible: state.detailsPanelVisible,
  detailsPanelHeight: state.detailsPanelHeight,
  rightPanelVisible: state.rightPanelVisible,
  rightPanelWidth: state.rightPanelWidth,
  rightPanelTabs: state.rightPanelTabs,
  bottomPanelTabOrder: state.bottomPanelTabOrder,
  
  // ═══════════════════════════════════════════════════════════════
  // Tabs & Navigation
  // ═══════════════════════════════════════════════════════════════
  tabs: state.tabs,
  activeTabId: state.activeTabId,
  tabGroups: state.tabGroups,
  tabsEnabled: state.tabsEnabled,
  currentFolder: state.currentFolder,
  expandedFolders: Array.from(state.expandedFolders),
  
  // ═══════════════════════════════════════════════════════════════
  // Display Preferences
  // ═══════════════════════════════════════════════════════════════
  viewMode: state.viewMode,
  iconSize: state.iconSize,
  listRowSize: state.listRowSize,
  columns: state.columns,
  lowercaseExtensions: state.lowercaseExtensions,
  
  // ═══════════════════════════════════════════════════════════════
  // Theme & Appearance
  // ═══════════════════════════════════════════════════════════════
  theme: state.theme,
  autoApplySeasonalThemes: state.autoApplySeasonalThemes,
  language: state.language,
  
  // ═══════════════════════════════════════════════════════════════
  // Theme Effects (Christmas)
  // ═══════════════════════════════════════════════════════════════
  christmasSnowOpacity: state.christmasSnowOpacity,
  christmasSnowDensity: state.christmasSnowDensity,
  christmasSnowSize: state.christmasSnowSize,
  christmasBlusteryness: state.christmasBlusteryness,
  christmasUseLocalWeather: state.christmasUseLocalWeather,
  christmasSleighEnabled: state.christmasSleighEnabled,
  christmasSleighDirection: state.christmasSleighDirection,
  
  // ═══════════════════════════════════════════════════════════════
  // Theme Effects (Halloween)
  // ═══════════════════════════════════════════════════════════════
  halloweenSparksEnabled: state.halloweenSparksEnabled,
  halloweenSparksOpacity: state.halloweenSparksOpacity,
  halloweenSparksSpeed: state.halloweenSparksSpeed,
  halloweenGhostsOpacity: state.halloweenGhostsOpacity,
  
  // ═══════════════════════════════════════════════════════════════
  // Integrations
  // ═══════════════════════════════════════════════════════════════
  solidworksIntegrationEnabled: state.solidworksIntegrationEnabled,
  solidworksPath: state.solidworksPath,
  solidworksDmLicenseKey: state.solidworksDmLicenseKey,
  autoStartSolidworksService: state.autoStartSolidworksService,
  hideSolidworksTempFiles: state.hideSolidworksTempFiles,
  ignoreSolidworksTempFiles: state.ignoreSolidworksTempFiles,
  apiServerUrl: state.apiServerUrl,
  
  // ═══════════════════════════════════════════════════════════════
  // File Operations
  // ═══════════════════════════════════════════════════════════════
  autoDownloadCloudFiles: state.autoDownloadCloudFiles,
  autoDownloadUpdates: state.autoDownloadUpdates,
  autoDownloadExcludedFiles: state.autoDownloadExcludedFiles,
  ignorePatterns: state.ignorePatterns,
  stagedCheckins: state.stagedCheckins,
  persistedPendingMetadata: state.persistedPendingMetadata,
  
  // ═══════════════════════════════════════════════════════════════
  // User Preferences
  // ═══════════════════════════════════════════════════════════════
  onboardingComplete: state.onboardingComplete,
  logSharingEnabled: state.logSharingEnabled,
  cadPreviewMode: state.cadPreviewMode,
  topbarConfig: state.topbarConfig,
  keybindings: state.keybindings,
  pinnedFolders: state.pinnedFolders,
  pinnedSectionExpanded: state.pinnedSectionExpanded,
  colorSwatches: state.colorSwatches,
  
  // ═══════════════════════════════════════════════════════════════
  // Module Configuration
  // ═══════════════════════════════════════════════════════════════
  moduleConfig: state.moduleConfig,
  
  // ═══════════════════════════════════════════════════════════════
  // Terminal
  // ═══════════════════════════════════════════════════════════════
  terminalVisible: state.terminalVisible,
  terminalHeight: state.terminalHeight,
  terminalHistory: state.terminalHistory.slice(0, 100),
  
  // ═══════════════════════════════════════════════════════════════
  // Search
  // ═══════════════════════════════════════════════════════════════
  recentSearches: state.recentSearches.slice(0, 20),
}),
```

### Task 5: Integrate Migrations into Merge Function

**File: `src/stores/pdmStore.ts`**

At the top, add import:
```typescript
import { CURRENT_STORE_VERSION, runMigrations, getPersistedVersion } from './migrations'
```

Update the merge function to run migrations:
```typescript
merge: (persistedState, currentState) => {
  const persisted = persistedState as Record<string, unknown>
  
  // Run any necessary migrations
  const persistedVersion = getPersistedVersion(persisted)
  const migratedState = persistedVersion < CURRENT_STORE_VERSION
    ? runMigrations(persisted, persistedVersion)
    : persisted
  
  // ... rest of existing merge logic, using migratedState instead of persisted ...
}
```

### Task 6: Add Store Version to Types

**File: `src/stores/types.ts`**

Add to the combined store type area:
```typescript
// Store versioning for migrations
export interface StoreMetadata {
  _storeVersion: number
}
```

## Testing Checklist
- [ ] `npm run typecheck` passes
- [ ] App loads with existing localStorage data (backwards compatible)
- [ ] Settings tab state persists across refreshes
- [ ] Changing settings tab updates store correctly
- [ ] Console shows "[Store] Running migration..." when loading old data (test by clearing _storeVersion)

## Files Modified Summary
- Modified: `src/stores/slices/uiSlice.ts`
- Modified: `src/stores/types.ts`
- Modified: `src/stores/pdmStore.ts`
- Created: `src/stores/migrations.ts`

## Coordination Note
Agent 3 (Layout Layer) will use the new `settingsTab` state from the store. They can work in parallel assuming this state exists.
