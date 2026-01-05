# Agent 5: Dev Tools, Cross-Cutting Features & Final Cleanup

## Objective
1. Create `features/dev-tools/` for development/debugging tools
2. Create `features/notifications/` and `features/search/` for cross-cutting concerns
3. Move seasonal-effects to `components/effects/`
4. Clean up empty folders
5. Final verification of all changes

## Risk Level
**Low to Medium** - Smaller features plus cleanup work.

## Dependencies
**Should run last** - Waits for Agents 1-4 to complete so final cleanup and verification can happen.

---

## Part 1: Dev Tools Feature

### Files to Move

| Source | Destination |
|--------|-------------|
| `components/sidebar/TerminalView.tsx` | `features/dev-tools/terminal/TerminalView.tsx` |
| `components/Terminal.tsx` | `features/dev-tools/terminal/Terminal.tsx` |
| `components/PerformanceWindow.tsx` | `features/dev-tools/performance/PerformanceWindow.tsx` |
| `components/TelemetryGraph.tsx` | `features/dev-tools/telemetry/TelemetryGraph.tsx` |
| `components/LogViewer.tsx` | `features/dev-tools/logs/LogViewer.tsx` |

### Step 1: Create folder structure
```powershell
New-Item -ItemType Directory -Path "src/features/dev-tools/terminal" -Force
New-Item -ItemType Directory -Path "src/features/dev-tools/performance" -Force
New-Item -ItemType Directory -Path "src/features/dev-tools/telemetry" -Force
New-Item -ItemType Directory -Path "src/features/dev-tools/logs" -Force
```

### Step 2: Move files
```powershell
Move-Item -Path "src/components/sidebar/TerminalView.tsx" -Destination "src/features/dev-tools/terminal/TerminalView.tsx"
Move-Item -Path "src/components/Terminal.tsx" -Destination "src/features/dev-tools/terminal/Terminal.tsx"
Move-Item -Path "src/components/PerformanceWindow.tsx" -Destination "src/features/dev-tools/performance/PerformanceWindow.tsx"
Move-Item -Path "src/components/TelemetryGraph.tsx" -Destination "src/features/dev-tools/telemetry/TelemetryGraph.tsx"
Move-Item -Path "src/components/LogViewer.tsx" -Destination "src/features/dev-tools/logs/LogViewer.tsx"
```

### Step 3: Create index.ts barrel exports

**`src/features/dev-tools/terminal/index.ts`**:
```typescript
export { TerminalView } from './TerminalView'
export { Terminal } from './Terminal'
```

**`src/features/dev-tools/performance/index.ts`**:
```typescript
export { PerformanceWindow } from './PerformanceWindow'
```

**`src/features/dev-tools/telemetry/index.ts`**:
```typescript
export { TelemetryGraph } from './TelemetryGraph'
```

**`src/features/dev-tools/logs/index.ts`**:
```typescript
export { LogViewer } from './LogViewer'
```

**`src/features/dev-tools/index.ts`**:
```typescript
/**
 * Dev Tools Feature
 * 
 * Development and debugging utilities
 */

export * from './terminal'
export * from './performance'
export * from './telemetry'
export * from './logs'
```

---

## Part 2: Notifications Feature

### Files to Move

| Source | Destination |
|--------|-------------|
| `components/sidebar/NotificationsView.tsx` | `features/notifications/NotificationsView.tsx` |

### Step 4: Create and populate
```powershell
New-Item -ItemType Directory -Path "src/features/notifications" -Force
Move-Item -Path "src/components/sidebar/NotificationsView.tsx" -Destination "src/features/notifications/NotificationsView.tsx"
```

**`src/features/notifications/index.ts`**:
```typescript
/**
 * Notifications Feature
 */

export { NotificationsView } from './NotificationsView'
```

---

## Part 3: Search Feature

### Files to Move

| Source | Destination |
|--------|-------------|
| `components/command-search/` (entire folder) | `features/search/command-search/` |
| `components/sidebar/SearchView.tsx` | `features/search/SearchView.tsx` |

### Step 5: Create and move
```powershell
New-Item -ItemType Directory -Path "src/features/search" -Force
Move-Item -Path "src/components/command-search" -Destination "src/features/search/command-search"
Move-Item -Path "src/components/sidebar/SearchView.tsx" -Destination "src/features/search/SearchView.tsx"
```

**`src/features/search/index.ts`**:
```typescript
/**
 * Search Feature
 * 
 * Command palette and global search
 */

export { SearchView } from './SearchView'
export * from './command-search'
```

---

## Part 4: Move Seasonal Effects to Components

### Step 6: Move seasonal-effects
```powershell
New-Item -ItemType Directory -Path "src/components/effects" -Force
Move-Item -Path "src/features/seasonal-effects" -Destination "src/components/effects/seasonal"
```

### Step 7: Create effects index.ts

**`src/components/effects/index.ts`**:
```typescript
/**
 * Visual Effects Components
 */

export * from './seasonal'
```

---

## Part 5: Update All Imports

### Step 8: Update Sidebar.tsx lazy imports

```typescript
// Dev Tools
const TerminalView = lazy(() => import('@/features/dev-tools/terminal').then(m => ({ default: m.TerminalView })))

// Notifications
const NotificationsView = lazy(() => import('@/features/notifications').then(m => ({ default: m.NotificationsView })))
```

### Step 9: Update App.tsx imports

```typescript
// Before
import { PerformanceWindow } from './components/PerformanceWindow'

// After
import { PerformanceWindow } from '@/features/dev-tools/performance'
```

### Step 10: Update command search imports

Anywhere command search is imported (likely in App.tsx or a keyboard shortcut handler):

```typescript
// Before
import { CommandPalette } from './components/command-search'

// After
import { CommandPalette } from '@/features/search/command-search'
```

### Step 11: Update seasonal effects imports

Anywhere seasonal effects are used:

```typescript
// Before
import { ChristmasEffects } from '@/features/seasonal-effects'

// After
import { ChristmasEffects } from '@/components/effects/seasonal'
```

### Step 12: Update features/index.ts

**`src/features/index.ts`** (final version):
```typescript
/**
 * Feature Modules Index
 * 
 * Re-exports all feature modules for convenient access
 */

// Core features
export * from './source'
export * from './workflows'
export * from './settings'

// Domain features
export * from './change-control'
export * from './items'
export * from './supply-chain'
export * from './integrations'

// Cross-cutting
export * from './notifications'
export * from './search'
export * from './dev-tools'

// Note: seasonal-effects moved to components/effects/
```

---

## Part 6: Cleanup Empty Folders

### Step 13: Remove empty sidebar folder

After all moves, the `src/components/sidebar/` should be mostly empty. Check and remove:

```powershell
# Check what's left
Get-ChildItem -Path "src/components/sidebar" -Recurse

# If empty or only has workflows folder (which should also be cleaned up)
# Remove the folder
Remove-Item -Path "src/components/sidebar" -Recurse -Force
```

### Step 14: Clean up any other empty folders
```powershell
# Check for empty directories in components
Get-ChildItem -Path "src/components" -Directory | Where-Object { (Get-ChildItem $_.FullName).Count -eq 0 }

# Remove if any found
```

---

## Part 7: Final Verification

### Step 15: TypeCheck
```powershell
npm run typecheck
```

### Step 16: Build
```powershell
npm run build
```

### Step 17: Manual Testing Checklist

Test each feature area works:

**Source Files:**
- [ ] Explorer loads file tree
- [ ] Pending view shows changes
- [ ] History view works
- [ ] Trash view works
- [ ] Details panel opens
- [ ] Backup panel works
- [ ] Context menus work

**Change Control:**
- [ ] ECO view loads
- [ ] ECR view loads
- [ ] Deviations view loads
- [ ] Process editor loads
- [ ] Schedule view loads

**Items:**
- [ ] Products view loads

**Supply Chain:**
- [ ] Suppliers view loads
- [ ] Supplier Portal view loads
- [ ] RFQ view loads

**Integrations:**
- [ ] Google Drive view/panel work
- [ ] SolidWorks panels work
- [ ] GSD view loads

**Dev Tools:**
- [ ] Terminal view loads
- [ ] Performance window opens (pop-out)
- [ ] Log viewer works

**Cross-cutting:**
- [ ] Notifications view loads
- [ ] Command palette opens (Ctrl+P or Cmd+P)
- [ ] Search view works

**Effects:**
- [ ] Seasonal effects render (if season is active)

---

## Files Affected Summary

### Created:
- `src/features/dev-tools/` (entire structure)
- `src/features/notifications/` (entire structure)
- `src/features/search/` (entire structure)
- `src/components/effects/` (entire structure)

### Moved:
- TerminalView.tsx, Terminal.tsx
- PerformanceWindow.tsx
- TelemetryGraph.tsx
- LogViewer.tsx
- NotificationsView.tsx
- command-search folder (~20 files)
- SearchView.tsx
- seasonal-effects folder (~13 files)

### Deleted:
- `src/components/sidebar/` (empty folder)
- Any other empty folders

### Modified:
- `src/features/index.ts`
- `src/App.tsx`
- `src/components/layout/Sidebar/Sidebar.tsx`
- Various files with seasonal-effects imports
- Various files with command-search imports
