# Enterprise Feature-Based Architecture

## The Insight

Your codebase already has a beautifully defined modular architecture in:

- `supabase/modules/` - Database schemas by domain
- `src/types/modules.ts` - Complete module definitions with 9 domain groups

The folder structure should **mirror this existing architecture**, not fight against it.

## Target Architecture

```
src/
├── app/                        # Application entry
│   ├── App.tsx
│   └── main.tsx
│
├── components/                 # Pure UI (domain-agnostic)
│   ├── core/                   # Primitives (done)
│   ├── layout/                 # App shell structure
│   └── shared/                 # Reusable smart components (done)
│
├── features/                   # Business domains (mirrors MODULE_GROUPS)
│   ├── source/                 # group: source-files
│   ├── items/                  # group: items  
│   ├── change-control/         # group: change-control
│   ├── supply-chain/           # group: supply-chain
│   ├── production/             # group: production (future)
│   ├── quality/                # group: quality (future)
│   ├── accounting/             # group: accounting (future)
│   ├── integrations/           # group: integrations
│   ├── notifications/          # Cross-cutting (system group)
│   ├── search/                 # Command palette
│   ├── settings/               # Configuration (done)
│   └── dev-tools/              # Terminal, telemetry
│
├── hooks/                      # Global hooks
├── lib/                        # Services & utilities (done)
├── stores/                     # Zustand (done)
└── types/                      # Global types (done)
```

## Feature Module Structure

Each feature follows this pattern:

```
features/{domain}/
├── {sub-feature}/           # Sub-modules (e.g., browser/, explorer/)
│   ├── components/
│   ├── hooks/
│   ├── utils/
│   ├── types.ts
│   └── index.ts
├── components/              # Domain-level shared components  
├── hooks/                   # Domain-level shared hooks
├── types.ts                 # Domain types
├── constants.ts             # Domain constants
└── index.ts                 # Barrel export
```

## Detailed Domain Mapping

### features/source/ (Source Files - Core PDM)

Maps to: `ModuleGroupId: 'source-files'`

```
features/source/
├── browser/              # FileBrowser (in progress via Agent 5)
├── explorer/             # ExplorerView + tree components
├── pending/              # PendingView
├── history/              # HistoryView  
├── workflows/            # WorkflowsView + designer
├── trash/                # TrashView
├── backup/               # BackupPanel
└── details/              # DetailsPanel
```

**Files to move:**

- `components/FileBrowser.tsx` -> `features/source/browser/`
- `components/sidebar/ExplorerView.tsx` + `explorer/` -> `features/source/explorer/`
- `components/sidebar/PendingView.tsx` -> `features/source/pending/`
- `components/sidebar/HistoryView.tsx` -> `features/source/history/`
- `components/sidebar/workflows/` -> `features/source/workflows/`
- `components/sidebar/TrashView.tsx` -> `features/source/trash/`
- `components/backup/` -> `features/source/backup/`
- `components/DetailsPanel.tsx` -> `features/source/details/`
- `components/context-menu/` -> `features/source/context-menu/`

---

### features/items/ (Items - Products/BOMs)

Maps to: `ModuleGroupId: 'items'`

```
features/items/
├── products/             # ProductsView
└── boms/                 # Future
```

**Files to move:**

- `components/sidebar/ProductsView.tsx` -> `features/items/products/`

---

### features/change-control/ (ECO/ECR/Reviews)

Maps to: `ModuleGroupId: 'change-control'`

```
features/change-control/
├── eco/                  # ECOView
├── ecr/                  # ECRView  
├── reviews/              # ReviewsView
├── deviations/           # DeviationsView
├── process/              # ProcessView
└── schedule/             # ScheduleView
```

**Files to move:**

- `components/sidebar/ECOView.tsx` -> `features/change-control/eco/`
- `components/sidebar/ECRView.tsx` -> `features/change-control/ecr/`
- `components/sidebar/ReviewsView.tsx` -> `features/change-control/reviews/`
- `components/sidebar/DeviationsView.tsx` -> `features/change-control/deviations/`
- `components/sidebar/ProcessView.tsx` -> `features/change-control/process/`
- `components/sidebar/ScheduleView.tsx` -> `features/change-control/schedule/`

---

### features/supply-chain/ (Suppliers/RFQ)

Maps to: `ModuleGroupId: 'supply-chain'`

```
features/supply-chain/
├── suppliers/            # SuppliersView
├── portal/               # SupplierPortalView
└── rfq/                  # RFQView
```

**Files to move:**

- `components/sidebar/SuppliersView.tsx` -> `features/supply-chain/suppliers/`
- `components/sidebar/SupplierPortalView.tsx` -> `features/supply-chain/portal/`
- `components/sidebar/RFQView.tsx` -> `features/supply-chain/rfq/`

---

### features/integrations/ (External Services)

Maps to: `ModuleGroupId: 'integrations'`

```
features/integrations/
├── google-drive/         # GoogleDriveView + Panel
├── solidworks/           # SolidWorksPanel + SWDatacardPanel
└── gsd/                  # GSDView
```

**Files to move:**

- `components/sidebar/GoogleDriveView.tsx` + `GoogleDrivePanel.tsx` -> `features/integrations/google-drive/`
- `components/SolidWorksPanel.tsx` + `SWDatacardPanel.tsx` -> `features/integrations/solidworks/`
- `components/sidebar/GSDView.tsx` -> `features/integrations/gsd/`
- `components/sidebar/IntegrationsView.tsx` -> `features/integrations/`

---

### features/notifications/

```
features/notifications/
├── NotificationsView.tsx
├── components/
└── index.ts
```

**Files to move:**

- `components/sidebar/NotificationsView.tsx` -> `features/notifications/`

---

### features/search/

```
features/search/
├── components/           # Search UI components
├── hooks/                # Search hooks
└── index.ts
```

**Files to move:**

- `components/command-search/` -> `features/search/`
- `components/sidebar/SearchView.tsx` -> `features/search/`

---

### features/dev-tools/

```
features/dev-tools/
├── terminal/             # TerminalView + Terminal
├── performance/          # PerformanceWindow
└── telemetry/            # TelemetryGraph
```

**Files to move:**

- `components/sidebar/TerminalView.tsx` + `Terminal.tsx` -> `features/dev-tools/terminal/`
- `components/PerformanceWindow.tsx` -> `features/dev-tools/performance/`
- `components/TelemetryGraph.tsx` -> `features/dev-tools/telemetry/`
- `components/LogViewer.tsx` -> `features/dev-tools/logs/`

---

### components/layout/ (App Shell)

Pure structural components, no business logic:

```
components/layout/
├── AppShell/             # Main layout orchestrator
├── MenuBar/              # Top menu
├── ActivityBar/          # Left icon navigation
├── Sidebar/              # Sidebar container shell
├── RightPanel/           # Right panel container
├── TabBar/               # Tab management
└── ResizeHandle/         # Resize utilities
```

**Files to move:**

- `components/activity-bar/` -> `components/layout/ActivityBar/`
- `components/Sidebar.tsx` -> `components/layout/Sidebar/`
- `components/MenuBar.tsx` -> `components/layout/MenuBar/`
- `components/RightPanel.tsx` -> `components/layout/RightPanel/`
- `components/TabBar.tsx` + `TabWindow.tsx` -> `components/layout/TabBar/`

---

### components/shared/ (Already Done)

Keep as-is - these are domain-agnostic:

- Avatar, ColorPicker, IconPicker, FileIcon, etc.

---

### Seasonal Effects Decision

Move from `features/` to `components/effects/`:

- These are visual polish, not business features
- They don't have views, hooks, or business logic
- They're closer to UI components than domain features
```
components/effects/
├── ChristmasEffects/
├── HalloweenEffects/
└── WeatherEffects/
```


---

## Dependency Direction

```mermaid
graph TD
    subgraph features [features/]
        source[source/]
        items[items/]
        changeControl[change-control/]
        supplyChain[supply-chain/]
        integrations[integrations/]
        settings[settings/]
    end
    
    subgraph components [components/]
        core[core/]
        layout[layout/]
        shared[shared/]
        effects[effects/]
    end
    
    subgraph services [lib/]
        supabase[supabase/]
        commands[commands/]
        utils[utils/]
    end
    
    features --> components
    features --> services
    components --> core
    layout --> shared
    shared --> core
</thinking>
```

**Rule:** Features can import from components and lib, but never the reverse.

---

## Migration Strategy

### Phase 1: Layout Components (Low Risk)

Move ActivityBar, MenuBar, Sidebar shell, RightPanel, TabBar to `components/layout/`

### Phase 2: Domain Features (Medium Risk)

Move sidebar views to their respective feature domains, one domain at a time:

1. change-control/ (ECO, ECR, reviews, deviations)
2. supply-chain/ (suppliers, portal, RFQ)
3. items/ (products)
4. notifications/
5. dev-tools/ (terminal, performance, telemetry)
6. integrations/ (Google Drive, SolidWorks)
7. search/ (command-search)

### Phase 3: Source Feature Consolidation (Higher Risk)

Consolidate source-files related components:

1. Move explorer/ to features/source/
2. Move pending, history, trash views
3. Move workflows
4. Move backup
5. Agent 5 continues browser/ decomposition
6. Move details panel
7. Move context-menu

### Phase 4: Effects Relocation

Move seasonal-effects to components/effects/

---

## Success Criteria

- Every file in `features/` maps to a `ModuleGroupId` or `ModuleId`
- `components/` contains only domain-agnostic UI
- Import direction is always: features -> components -> core
- Typecheck passes after each phase
- App runs correctly after each phase