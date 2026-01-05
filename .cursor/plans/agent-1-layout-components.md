# Agent 1: Layout Components Migration

## Objective
Move all pure structural/layout components from `src/components/` root into `src/components/layout/` to establish a clean separation between domain-agnostic layout components and feature-specific components.

## Risk Level
**Low** - These are UI shell components with no business logic dependencies.

## Dependencies
None - This work can proceed independently.

---

## Files to Move

| Source | Destination |
|--------|-------------|
| `components/activity-bar/` (entire folder) | `components/layout/ActivityBar/` |
| `components/MenuBar.tsx` | `components/layout/MenuBar/MenuBar.tsx` |
| `components/TabBar.tsx` | `components/layout/TabBar/TabBar.tsx` |
| `components/TabWindow.tsx` | `components/layout/TabBar/TabWindow.tsx` |
| `components/RightPanel.tsx` | `components/layout/RightPanel/RightPanel.tsx` |
| `components/Sidebar.tsx` | `components/layout/Sidebar/Sidebar.tsx` |
| `components/CrumbBar.tsx` | `components/layout/CrumbBar/CrumbBar.tsx` |

---

## Step-by-Step Instructions

### Step 1: Create folder structure
```powershell
# Create new layout subfolders
New-Item -ItemType Directory -Path "src/components/layout/ActivityBar" -Force
New-Item -ItemType Directory -Path "src/components/layout/MenuBar" -Force
New-Item -ItemType Directory -Path "src/components/layout/TabBar" -Force
New-Item -ItemType Directory -Path "src/components/layout/RightPanel" -Force
New-Item -ItemType Directory -Path "src/components/layout/Sidebar" -Force
New-Item -ItemType Directory -Path "src/components/layout/CrumbBar" -Force
```

### Step 2: Move ActivityBar folder
```powershell
# Move entire activity-bar folder contents
Move-Item -Path "src/components/activity-bar/*" -Destination "src/components/layout/ActivityBar/"
Remove-Item -Path "src/components/activity-bar" -Force
```

### Step 3: Move individual files
```powershell
Move-Item -Path "src/components/MenuBar.tsx" -Destination "src/components/layout/MenuBar/MenuBar.tsx"
Move-Item -Path "src/components/TabBar.tsx" -Destination "src/components/layout/TabBar/TabBar.tsx"
Move-Item -Path "src/components/TabWindow.tsx" -Destination "src/components/layout/TabBar/TabWindow.tsx"
Move-Item -Path "src/components/RightPanel.tsx" -Destination "src/components/layout/RightPanel/RightPanel.tsx"
Move-Item -Path "src/components/Sidebar.tsx" -Destination "src/components/layout/Sidebar/Sidebar.tsx"
Move-Item -Path "src/components/CrumbBar.tsx" -Destination "src/components/layout/CrumbBar/CrumbBar.tsx"
```

### Step 4: Create index.ts barrel exports

**`src/components/layout/ActivityBar/index.ts`**:
```typescript
export { ActivityBar } from './ActivityBar'
export { ActivityItem } from './ActivityItem'
export { CascadingSidebar } from './CascadingSidebar'
export { SectionDivider } from './SectionDivider'
export { SidebarControl } from './SidebarControl'
export * from './constants'
export * from './types'
```

**`src/components/layout/MenuBar/index.ts`**:
```typescript
export { MenuBar } from './MenuBar'
```

**`src/components/layout/TabBar/index.ts`**:
```typescript
export { TabBar } from './TabBar'
export { TabWindow, isTabWindowMode, parseTabWindowParams } from './TabWindow'
```

**`src/components/layout/RightPanel/index.ts`**:
```typescript
export { RightPanel } from './RightPanel'
```

**`src/components/layout/Sidebar/index.ts`**:
```typescript
export { Sidebar } from './Sidebar'
```

**`src/components/layout/CrumbBar/index.ts`**:
```typescript
export { CrumbBar } from './CrumbBar'
```

### Step 5: Update main layout index.ts

**`src/components/layout/index.ts`**:
```typescript
// Layout components barrel export
export { ResizeHandle } from './ResizeHandle'
export { MainContent } from './MainContent'
export { AppShell } from './AppShell'

// New exports
export * from './ActivityBar'
export * from './MenuBar'
export * from './TabBar'
export * from './RightPanel'
export * from './Sidebar'
export * from './CrumbBar'
```

### Step 6: Fix imports in consuming files

Files that need import updates:
- `src/App.tsx` - TabWindow import
- `src/components/layout/AppShell.tsx` - MenuBar, Sidebar, TabBar, RightPanel, ActivityBar, CrumbBar
- Any other files importing these components

Change imports from:
```typescript
import { MenuBar } from '../MenuBar'
import { Sidebar } from '../Sidebar'
```

To:
```typescript
import { MenuBar, Sidebar } from './index' // or from '@/components/layout'
```

### Step 7: Fix internal imports within moved files

Each moved file may have relative imports that need updating. Check and fix:
- `ActivityBar.tsx` imports from `./constants`, `./types`, etc. (should still work)
- `Sidebar.tsx` imports from `../sidebar/` views (paths change)
- `RightPanel.tsx` imports

---

## Verification

```powershell
npm run typecheck
```

Must pass with no errors before considering this task complete.

---

## Files Affected Summary

### Created:
- `src/components/layout/ActivityBar/index.ts`
- `src/components/layout/MenuBar/index.ts`
- `src/components/layout/TabBar/index.ts`
- `src/components/layout/RightPanel/index.ts`
- `src/components/layout/Sidebar/index.ts`
- `src/components/layout/CrumbBar/index.ts`

### Moved:
- 11+ files from activity-bar folder
- 6 individual component files

### Modified:
- `src/components/layout/index.ts`
- `src/App.tsx`
- `src/components/layout/AppShell.tsx`
