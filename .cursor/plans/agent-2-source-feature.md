# Agent 2: Source Files Feature Migration

## Objective
Complete the `features/source/` domain by moving all source-file related views and components from `src/components/sidebar/` into their appropriate subfolders within `features/source/`.

## Risk Level
**Medium** - Core PDM functionality, but changes are primarily file moves.

## Dependencies
None - This work can proceed independently.

## Context
The `features/source/pane/` (FilePane/browser) is already complete with 124 files. This agent completes the remaining source-files domain.

---

## Files to Move

### Explorer (File Tree)
| Source | Destination |
|--------|-------------|
| `components/sidebar/FileTree.tsx` | `features/source/explorer/FileTree.tsx` |
| `components/sidebar/file-tree/` (entire folder) | `features/source/explorer/file-tree/` |

### Views
| Source | Destination |
|--------|-------------|
| `components/sidebar/PendingView.tsx` | `features/source/pending/PendingView.tsx` |
| `components/sidebar/HistoryView.tsx` | `features/source/history/HistoryView.tsx` |
| `components/sidebar/TrashView.tsx` | `features/source/trash/TrashView.tsx` |

### Panels and Utilities
| Source | Destination |
|--------|-------------|
| `components/DetailsPanel.tsx` | `features/source/details/DetailsPanel.tsx` |
| `components/backup/` (entire folder) | `features/source/backup/` |
| `components/context-menu/` (entire folder) | `features/source/context-menu/` |

---

## Step-by-Step Instructions

### Step 1: Create folder structure
```powershell
New-Item -ItemType Directory -Path "src/features/source/explorer" -Force
New-Item -ItemType Directory -Path "src/features/source/pending" -Force
New-Item -ItemType Directory -Path "src/features/source/history" -Force
New-Item -ItemType Directory -Path "src/features/source/trash" -Force
New-Item -ItemType Directory -Path "src/features/source/details" -Force
```

### Step 2: Move Explorer components
```powershell
# Move FileTree
Move-Item -Path "src/components/sidebar/FileTree.tsx" -Destination "src/features/source/explorer/FileTree.tsx"

# Move file-tree folder contents
Move-Item -Path "src/components/sidebar/file-tree/*" -Destination "src/features/source/explorer/file-tree/"
New-Item -ItemType Directory -Path "src/features/source/explorer/file-tree" -Force
Move-Item -Path "src/components/sidebar/file-tree/*" -Destination "src/features/source/explorer/file-tree/"
Remove-Item -Path "src/components/sidebar/file-tree" -Force -Recurse
```

### Step 3: Move View files
```powershell
Move-Item -Path "src/components/sidebar/PendingView.tsx" -Destination "src/features/source/pending/PendingView.tsx"
Move-Item -Path "src/components/sidebar/HistoryView.tsx" -Destination "src/features/source/history/HistoryView.tsx"
Move-Item -Path "src/components/sidebar/TrashView.tsx" -Destination "src/features/source/trash/TrashView.tsx"
```

### Step 4: Move DetailsPanel
```powershell
Move-Item -Path "src/components/DetailsPanel.tsx" -Destination "src/features/source/details/DetailsPanel.tsx"
```

### Step 5: Move backup folder
```powershell
Move-Item -Path "src/components/backup" -Destination "src/features/source/backup"
```

### Step 6: Move context-menu folder
```powershell
Move-Item -Path "src/components/context-menu" -Destination "src/features/source/context-menu"
```

### Step 7: Create index.ts barrel exports

**`src/features/source/explorer/index.ts`**:
```typescript
export { FileTree } from './FileTree'
export * from './file-tree'
```

**`src/features/source/pending/index.ts`**:
```typescript
export { PendingView } from './PendingView'
```

**`src/features/source/history/index.ts`**:
```typescript
export { HistoryView } from './HistoryView'
```

**`src/features/source/trash/index.ts`**:
```typescript
export { TrashView } from './TrashView'
```

**`src/features/source/details/index.ts`**:
```typescript
export { DetailsPanel } from './DetailsPanel'
```

**`src/features/source/backup/index.ts`** (update existing):
```typescript
// Should already exist, verify exports are correct
export { BackupPanel } from './BackupPanel'
// ... other exports
```

**`src/features/source/context-menu/index.ts`** (update existing):
```typescript
// Should already exist, verify exports are correct
```

### Step 8: Update main source index.ts

**`src/features/source/index.ts`**:
```typescript
/**
 * Source Files Feature
 * 
 * Core PDM file management functionality
 */

export * from './pane'
export * from './explorer'
export * from './pending'
export * from './history'
export * from './trash'
export * from './details'
export * from './backup'
export * from './context-menu'
```

### Step 9: Fix imports in moved files

Each moved file will have broken imports. Common patterns to fix:

**In FileTree.tsx and file-tree components**:
```typescript
// Before
import { usePDMStore } from '../../stores/pdmStore'
import { SomeComponent } from '../shared/SomeComponent'

// After
import { usePDMStore } from '@/stores/pdmStore'
import { SomeComponent } from '@/components/shared/SomeComponent'
```

**In backup components**:
```typescript
// Before
import { something } from '../../lib/backup'

// After  
import { something } from '@/lib/backup'
```

### Step 10: Update Sidebar.tsx lazy imports

In `src/components/layout/Sidebar/Sidebar.tsx` (or wherever Sidebar ends up):

```typescript
// Before
const FileTree = lazy(() => import('./sidebar/FileTree').then(m => ({ default: m.FileTree })))
const PendingView = lazy(() => import('./sidebar/PendingView').then(m => ({ default: m.PendingView })))
const HistoryView = lazy(() => import('./sidebar/HistoryView').then(m => ({ default: m.HistoryView })))
const TrashView = lazy(() => import('./sidebar/TrashView').then(m => ({ default: m.TrashView })))

// After
const FileTree = lazy(() => import('@/features/source/explorer').then(m => ({ default: m.FileTree })))
const PendingView = lazy(() => import('@/features/source/pending').then(m => ({ default: m.PendingView })))
const HistoryView = lazy(() => import('@/features/source/history').then(m => ({ default: m.HistoryView })))
const TrashView = lazy(() => import('@/features/source/trash').then(m => ({ default: m.TrashView })))
```

### Step 11: Update RightPanel imports for DetailsPanel and BackupPanel

```typescript
// Before
import { DetailsPanel } from '../DetailsPanel'
import { BackupPanel } from '../backup'

// After
import { DetailsPanel } from '@/features/source/details'
import { BackupPanel } from '@/features/source/backup'
```

---

## Verification

```powershell
npm run typecheck
```

Then manually verify:
1. Explorer view loads and shows file tree
2. Pending view shows pending changes
3. History view shows file history
4. Trash view shows deleted files
5. Details panel opens when file selected
6. Backup panel works
7. Context menus work on right-click

---

## Files Affected Summary

### Created:
- `src/features/source/explorer/index.ts`
- `src/features/source/pending/index.ts`
- `src/features/source/history/index.ts`
- `src/features/source/trash/index.ts`
- `src/features/source/details/index.ts`

### Moved:
- FileTree.tsx + file-tree folder (~15 files)
- PendingView.tsx
- HistoryView.tsx
- TrashView.tsx
- DetailsPanel.tsx
- backup folder (~15 files)
- context-menu folder (~25 files)

### Modified:
- `src/features/source/index.ts`
- `src/components/layout/Sidebar/Sidebar.tsx` (lazy imports)
- `src/components/layout/RightPanel/RightPanel.tsx` (imports)
- Multiple moved files (import paths)
