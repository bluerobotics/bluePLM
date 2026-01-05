# Enterprise Architecture Restructure - Agent Prompt

You are tasked with reorganizing the BluePLM codebase to follow a true enterprise feature-based architecture that mirrors the existing database module structure.

## Reference Plan

Read the comprehensive plan at: `.cursor/plans/enterprise_architecture_restructure.plan.md`

This plan was created after deep analysis of:
- The database modules (`supabase/modules/`)
- The module type definitions (`src/types/modules.ts`)
- The existing codebase structure

## Current State

Previous refactoring has already completed:
- `src/components/core/` - Core UI primitives (Toast, Dialog, Loader, ErrorBoundary)
- `src/components/shared/` - Shared smart components (Avatar, ColorPicker, IconPicker, etc.)
- `src/lib/utils/` - Organized utility functions
- `src/features/settings/` - Settings organized by domain
- `src/features/seasonal-effects/` - Visual effects (will move to components/effects/)
- `src/features/file-browser/` - FileBrowser decomposition COMPLETE

## Your Mission

Restructure the codebase so that `features/` mirrors the `ModuleGroupId` domains:

```
features/
├── source/              # source-files group (Core PDM)
├── items/               # items group
├── change-control/      # change-control group
├── supply-chain/        # supply-chain group
├── integrations/        # integrations group
├── notifications/       # system (cross-cutting)
├── search/              # command palette
├── settings/            # DONE
└── dev-tools/           # terminal, performance, telemetry
```

And `components/` contains only domain-agnostic UI:

```
components/
├── core/                # DONE
├── layout/              # App shell (ActivityBar, MenuBar, Sidebar, etc.)
├── shared/              # DONE
└── effects/             # Seasonal effects (move from features/)
```

---

## Phase 1: Layout Components

Move app shell components to `components/layout/`:

| From | To |
|------|-----|
| `components/activity-bar/` | `components/layout/ActivityBar/` |
| `components/Sidebar.tsx` | `components/layout/Sidebar/Sidebar.tsx` |
| `components/MenuBar.tsx` | `components/layout/MenuBar/MenuBar.tsx` |
| `components/RightPanel.tsx` | `components/layout/RightPanel/RightPanel.tsx` |
| `components/TabBar.tsx` + `TabWindow.tsx` | `components/layout/TabBar/` |

Update imports across the codebase after each move. Run `npm run typecheck`.

---

## Phase 2: Domain Features (One at a Time)

### 2a. change-control/

```
features/change-control/
├── eco/
│   └── ECOView.tsx
├── ecr/
│   └── ECRView.tsx
├── reviews/
│   └── ReviewsView.tsx
├── deviations/
│   └── DeviationsView.tsx
├── process/
│   └── ProcessView.tsx
├── schedule/
│   └── ScheduleView.tsx
└── index.ts
```

Move from `components/sidebar/`:
- `ECOView.tsx`, `ECRView.tsx`, `ReviewsView.tsx`, `DeviationsView.tsx`, `ProcessView.tsx`, `ScheduleView.tsx`

### 2b. supply-chain/

```
features/supply-chain/
├── suppliers/
│   └── SuppliersView.tsx
├── portal/
│   └── SupplierPortalView.tsx
├── rfq/
│   └── RFQView.tsx
└── index.ts
```

### 2c. items/

```
features/items/
├── products/
│   └── ProductsView.tsx
└── index.ts
```

### 2d. notifications/

```
features/notifications/
├── NotificationsView.tsx
└── index.ts
```

### 2e. dev-tools/

```
features/dev-tools/
├── terminal/
│   ├── TerminalView.tsx
│   └── Terminal.tsx
├── performance/
│   └── PerformanceWindow.tsx
├── telemetry/
│   └── TelemetryGraph.tsx
├── logs/
│   └── LogViewer.tsx
└── index.ts
```

### 2f. integrations/

```
features/integrations/
├── google-drive/
│   ├── GoogleDriveView.tsx
│   └── GoogleDrivePanel.tsx
├── solidworks/
│   ├── SolidWorksPanel.tsx
│   └── SWDatacardPanel.tsx
├── gsd/
│   └── GSDView.tsx
├── IntegrationsView.tsx
└── index.ts
```

### 2g. search/

```
features/search/
├── components/          # Move from command-search/
├── hooks/
├── SearchView.tsx       # From sidebar/
└── index.ts
```

---

## Phase 3: Source Feature Consolidation

Consolidate all source-files related code into `features/source/`:

```
features/source/
├── browser/             # ALREADY DONE (file-browser/)
├── explorer/            # From sidebar/explorer/ + ExplorerView.tsx
├── pending/             # PendingView.tsx
├── history/             # HistoryView.tsx
├── trash/               # TrashView.tsx
├── workflows/           # From sidebar/workflows/
├── backup/              # From components/backup/
├── details/             # DetailsPanel.tsx
├── context-menu/        # From components/context-menu/
└── index.ts
```

Rename `features/file-browser/` to `features/source/browser/`.

---

## Phase 4: Effects Relocation

Move seasonal effects from features to components:

```
# From
features/seasonal-effects/

# To  
components/effects/
├── ChristmasEffects/
├── HalloweenEffects/
├── WeatherEffects/
└── index.ts
```

Delete `features/seasonal-effects/` after moving.

---

## Rules

1. **One domain at a time** - Complete each move, update imports, run typecheck
2. **Update barrel exports** - Create/update `index.ts` files for each folder
3. **Update all imports** - Search for old import paths and update them
4. **Run typecheck after each phase** - `npm run typecheck` must pass
5. **Test the app** - `npm run dev` and verify views still work

---

## Import Pattern

After restructure, imports should look like:

```typescript
// Feature imports
import { ECOView } from '@/features/change-control/eco'
import { SuppliersView } from '@/features/supply-chain/suppliers'
import { FileBrowser } from '@/features/source/browser'

// Layout imports
import { ActivityBar } from '@/components/layout/ActivityBar'
import { MenuBar } from '@/components/layout/MenuBar'

// Core/shared imports (unchanged)
import { Toast, Dialog } from '@/components/core'
import { Avatar, ColorPicker } from '@/components/shared'
```

---

## START HERE

1. Read the full plan at `.cursor/plans/enterprise_architecture_restructure.plan.md`
2. Start with Phase 1: Move `components/activity-bar/` to `components/layout/ActivityBar/`
3. Update imports
4. Run `npm run typecheck`
5. Continue to next move

**Work methodically. One folder at a time. Test after each move.**
