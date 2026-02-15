---
name: Drawing Reference Dropdowns
overview: Add inline expand arrows for drawings, parts, and assemblies to show cross-references, plus auto-sync drawing refs on file change.
todos:
  - id: agent1-types
    content: "Agent 1: Add DrawingRefItem interface to src/stores/types.ts"
    status: pending
  - id: agent1-slice-types
    content: "Agent 1: Add drawing ref state + action types to FilesSlice in src/stores/types.ts"
    status: pending
  - id: agent1-slice-impl
    content: "Agent 1: Implement state + actions in src/stores/slices/filesSlice.ts"
    status: pending
  - id: agent1-query
    content: "Agent 1: Add getDrawingsForFileConfig query to src/lib/supabase/files/queries.ts"
    status: pending
  - id: agent1-export
    content: "Agent 1: Export new query from src/lib/supabase/files/index.ts"
    status: pending
  - id: agent1-typecheck
    content: "Agent 1: Run typecheck"
    status: pending
  - id: agent2-read-pattern
    content: "Agent 2: Read ConfigBomRow.tsx to understand styling pattern"
    status: pending
  - id: agent2-drawing-ref-row
    content: "Agent 2: Create DrawingRefRow.tsx with identical styling"
    status: pending
  - id: agent2-config-drawing-row
    content: "Agent 2: Create ConfigDrawingRow.tsx with identical styling"
    status: pending
  - id: agent2-typecheck
    content: "Agent 2: Run typecheck"
    status: pending
  - id: agent3-read-app
    content: "Agent 3: Read App.tsx onFilesChanged handler to understand current flow"
    status: pending
  - id: agent3-sync-fn
    content: "Agent 3: Implement syncDrawingReferencesInBackground function"
    status: pending
  - id: agent3-debounce
    content: "Agent 3: Add debounce logic (3s per drawing)"
    status: pending
  - id: agent3-wire
    content: "Agent 3: Wire into onFilesChanged after loadFiles completes"
    status: pending
  - id: agent3-cache-invalidation
    content: "Agent 3: Add cache invalidation for configDrawingData"
    status: pending
  - id: agent3-typecheck
    content: "Agent 3: Run typecheck"
    status: pending
  - id: agent4-handlers
    content: "Agent 4: Add toggleDrawingRefExpansion and toggleConfigDrawingExpansion handlers"
    status: pending
  - id: agent4-helper
    content: "Agent 4: Add canHaveDrawingRefs helper to useConfigHandlers.ts"
    status: pending
  - id: agent4-context
    content: "Agent 4: Expose new state in FilePaneContext.tsx"
    status: pending
  - id: agent4-namecell
    content: "Agent 4: Update NameCell.tsx to show expand arrow on .slddrw files"
    status: pending
  - id: agent4-configrow
    content: "Agent 4: Update ConfigRow.tsx to be expandable for parts and assemblies"
    status: pending
  - id: agent4-virtual-rows
    content: "Agent 4: Add new virtual row types and build logic in FileListBody.tsx"
    status: pending
  - id: agent4-rendering
    content: "Agent 4: Add render functions, switch cases, and new props to FileListBody"
    status: pending
  - id: agent4-typecheck
    content: "Agent 4: Run typecheck"
    status: pending
isProject: false
---

# Drawing Reference Dropdowns - Multi-Agent Plan

## Objective

Add inline expand/collapse arrows for:

1. `.slddrw` files -- shows referenced parts/assemblies (via SW service, flat list)
2. Part configs (`.sldprt`) -- shows drawings that reference this config (via DB)
3. Assembly configs (`.sldasm`) -- shows both Drawings (via DB) and BOM (existing, via SW service)

Plus auto-sync: whenever a `.slddrw` file changes on disk, automatically extract its references and write to `file_references` DB so reverse lookups are always current.

## Agent Overview


| Agent   | Responsibility                           | Owns                                                                                                                                                                                                                                                                                                                           | Dependencies              |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| Agent 1 | Store foundation: types, slice, DB query | `src/stores/types.ts` (drawing ref additions), `src/stores/slices/filesSlice.ts` (drawing ref additions), `src/lib/supabase/files/queries.ts` (new query), `src/lib/supabase/files/index.ts` (export)                                                                                                                          | None                      |
| Agent 2 | New row components                       | `src/features/source/browser/components/FileList/DrawingRefRow.tsx` (new), `src/features/source/browser/components/FileList/ConfigDrawingRow.tsx` (new)                                                                                                                                                                        | None                      |
| Agent 3 | Auto-sync drawing refs on file change    | `src/app/App.tsx` (drawing ref auto-sync addition)                                                                                                                                                                                                                                                                             | None                      |
| Agent 4 | Integration: handlers, context, wiring   | `src/features/source/browser/hooks/useConfigHandlers.ts`, `src/features/source/browser/context/FilePaneContext.tsx`, `src/features/source/browser/components/FileList/FileListBody.tsx`, `src/features/source/browser/components/FileList/cells/NameCell.tsx`, `src/features/source/browser/components/FileList/ConfigRow.tsx` | Agent 1, Agent 2, Agent 3 |


## Execution Waves

```
Wave 1 (parallel): Agent 1 + Agent 2 + Agent 3
Wave 2 (sequential): Agent 4 (after all Wave 1 agents complete)
```

## Shared Files


| File                                | Owner   | Rule                                                                                          |
| ----------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `src/stores/types.ts`               | Agent 1 | Agent 1 adds `DrawingRefItem` interface and new slice state/action types. Agent 4 reads only. |
| `src/stores/slices/filesSlice.ts`   | Agent 1 | Agent 1 adds drawing ref state + actions. Agent 4 reads only.                                 |
| `src/lib/supabase/files/queries.ts` | Agent 1 | Agent 1 adds `getDrawingsForFileConfig`. Agent 3 and Agent 4 read only.                       |
| `src/app/App.tsx`                   | Agent 3 | Agent 3 adds auto-sync logic in `onFilesChanged` handler.                                     |


---

## Agent 1: Store Foundation

### Prompt

> Implement the store foundation for the drawing reference dropdown feature in BluePLM with enterprise-level code quality.
>
> **Context:**
> We are adding inline expand/collapse dropdowns for drawing files and for config rows in the file list. This requires new state management and a new DB query. The existing pattern to follow is the BOM expansion: `expandedConfigBoms`, `configBomData`, `loadingConfigBoms` in the Zustand store, and `getContainsByConfiguration` in the Supabase queries.
>
> **Scope:**
>
> **1. Add `DrawingRefItem` type to `src/stores/types.ts`:**

```typescript
> export interface DrawingRefItem {
>   id: string
>   file_id: string
>   file_name: string
>   file_path: string
>   file_type: 'part' | 'assembly' | 'drawing' | 'other'
>   part_number: string | null
>   description: string | null
>   revision: string | null
>   state: string | null
>   configuration: string | null
>   in_database: boolean
> }
> 

```

> Add this near the existing `ConfigBomItem` interface (around line 254).
>
> **2. Add new slice state and actions to `src/stores/types.ts`:**
> Find the `FilesSlice` interface and add these fields:

```typescript
> // Drawing file expand state (for .slddrw files showing referenced models)
> expandedDrawingRefs: Set<string>
> drawingRefData: Map<string, DrawingRefItem[]>
> loadingDrawingRefs: Set<string>
> toggleDrawingRefExpansion: (filePath: string) => void
> setDrawingRefData: (filePath: string, items: DrawingRefItem[]) => void
> clearDrawingRefData: (filePath: string) => void
> addLoadingDrawingRef: (filePath: string) => void
> removeLoadingDrawingRef: (filePath: string) => void
>
> // Config -> drawings state (for part/assembly configs showing which drawings reference them)
> expandedConfigDrawings: Set<string>
> configDrawingData: Map<string, DrawingRefItem[]>
> loadingConfigDrawings: Set<string>
> toggleConfigDrawingExpansion: (configKey: string) => void
> setConfigDrawingData: (configKey: string, items: DrawingRefItem[]) => void
> clearConfigDrawingData: (configKey: string) => void
> addLoadingConfigDrawing: (configKey: string) => void
> removeLoadingConfigDrawing: (configKey: string) => void
> 

```

> Follow the exact naming pattern of `expandedConfigBoms` / `configBomData` / `loadingConfigBoms`.
>
> **3. Implement the state + actions in `src/stores/slices/filesSlice.ts`:**
> Add the initial state and action implementations following the exact pattern of the existing BOM expansion state. The toggle actions should add/remove from the Set. The set/clear actions should update the Map. Loading actions should add/remove from the loading Set.
>
> **4. Add `getDrawingsForFileConfig` query to `src/lib/supabase/files/queries.ts`:**

```typescript
> export async function getDrawingsForFileConfig(
>   fileId: string,
>   configName: string | null
> ): Promise<{ items: DrawingRefItem[]; error: any }>
> 

```

> This queries `file_references` where `child_file_id = fileId` and the parent file is a `.slddrw`. Optionally filter by `configuration` when `configName` is not null. Return items in `DrawingRefItem` format with the parent (drawing) file's info. Follow the pattern of `getContainsByConfiguration` but reversed (child_file_id is the input, parent is the drawing).
>
> **5. Export the new query from `src/lib/supabase/files/index.ts`:**
> Add `getDrawingsForFileConfig` to the exports.
>
> **Boundaries:**
>
> - OWNS: Drawing ref additions to `src/stores/types.ts`, `src/stores/slices/filesSlice.ts`, `src/lib/supabase/files/queries.ts`, `src/lib/supabase/files/index.ts`
> - Do NOT modify any other files
> - Do NOT add to `src/stores/pdmStore.ts` (the slice is auto-composed)
>
> **Quality Requirements:**
>
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Follow existing patterns exactly (look at BOM expansion state for reference)
> - JSDoc comments on new functions
>
> **Deliverables:**
>
> - `DrawingRefItem` type added to types.ts
> - New slice state + actions in filesSlice.ts
> - `getDrawingsForFileConfig` query in queries.ts
> - Export in index.ts
> - Report in `.cursor/plans/AGENT1_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** Drawing ref additions to `src/stores/types.ts`, `src/stores/slices/filesSlice.ts`, `src/lib/supabase/files/queries.ts`, `src/lib/supabase/files/index.ts`
- **READS (no modify):** Existing code in those files for pattern reference

### Tasks

- Add `DrawingRefItem` interface to `src/stores/types.ts`
- Add drawing ref state + action types to `FilesSlice` in `src/stores/types.ts`
- Implement state + actions in `src/stores/slices/filesSlice.ts`
- Add `getDrawingsForFileConfig` query to `src/lib/supabase/files/queries.ts`
- Export new query from `src/lib/supabase/files/index.ts`
- Run typecheck

### Deliverables

- `DrawingRefItem` type for other agents to import
- Store state + actions for drawing ref expansion (used by Agent 4)
- DB query `getDrawingsForFileConfig` (used by Agent 3 and Agent 4)

---

## Agent 2: Row Components

### Prompt

> Create two new row components for the drawing reference dropdown feature in BluePLM with enterprise-level code quality.
>
> **Context:**
> The file list uses virtualized rows. We need two new row components that display items in the expand/collapse dropdowns. These must be styled identically to the existing `ConfigBomRow` component at `src/features/source/browser/components/FileList/ConfigBomRow.tsx`. Read that file first to understand the exact styling pattern.
>
> **Scope:**
>
> **1. Create `src/features/source/browser/components/FileList/DrawingRefRow.tsx`:**
> This displays a referenced part/assembly under a drawing file row. It is shown when a user expands a `.slddrw` file.
>
> Props interface:

```typescript
> export interface DrawingRefRowProps {
>   item: DrawingRefItem  // from src/stores/types.ts
>   depth: number         // nesting depth (currently always 0)
>   rowHeight: number
>   visibleColumns: { id: string; width: number }[]
>   onClick: (e: React.MouseEvent) => void
> }
> 

```

> - Indentation: `24 + (depth * 16) + 16` pixels (directly under file, not under a config)
> - Tree connector: `├` character (same as ConfigBomRow)
> - File type icon: use same `BomFileIcon` pattern (FileBox for parts, Layers for assemblies, FilePen for drawings, File for other)
> - Show file name, configuration badge (if present, small muted text showing which config), part number, description, revision, state columns
> - Use `memo` with custom comparison function (same pattern as ConfigBomRow)
> - CSS class: `drawing-ref-row` (follows `config-bom-row` pattern)
>
> **2. Create `src/features/source/browser/components/FileList/ConfigDrawingRow.tsx`:**
> This displays a drawing file under a part/assembly configuration row. It is shown when a user expands a config to see which drawings reference it.
>
> Props interface:

```typescript
> export interface ConfigDrawingRowProps {
>   item: DrawingRefItem  // from src/stores/types.ts
>   depth: number         // nesting depth (currently always 0)
>   configDepth: number   // parent config's depth in tree
>   rowHeight: number
>   visibleColumns: { id: string; width: number }[]
>   onClick: (e: React.MouseEvent) => void
> }
> 

```

> - Indentation: `24 + (configDepth * 16) + (depth * 16) + 32` pixels (same formula as ConfigBomRow)
> - Tree connector: `├` character
> - Icon: always `FilePen` (sky-300 color) since these are always drawings
> - Show file name, part number, description, revision, state columns
> - Use `memo` with custom comparison function
> - CSS class: `config-drawing-row`
>
> **Important:** For the `DrawingRefItem` type import, use: `import type { DrawingRefItem } from '@/stores/types'`. This type will be added by another agent in parallel. Just use it as if it exists -- it will be a simple interface with fields: `id`, `file_id`, `file_name`, `file_path`, `file_type`, `part_number`, `description`, `revision`, `state`, `configuration`, `in_database`.
>
> **Boundaries:**
>
> - OWNS: `src/features/source/browser/components/FileList/DrawingRefRow.tsx` (new), `src/features/source/browser/components/FileList/ConfigDrawingRow.tsx` (new)
> - READS: `src/features/source/browser/components/FileList/ConfigBomRow.tsx` (for pattern reference)
> - Do NOT modify any existing files
>
> **Quality Requirements:**
>
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Match existing ConfigBomRow styling exactly
> - Custom memo comparison functions for performance
> - JSDoc comments on components
>
> **Deliverables:**
>
> - `DrawingRefRow.tsx` component
> - `ConfigDrawingRow.tsx` component
> - Report in `.cursor/plans/AGENT2_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results. Type errors about `DrawingRefItem` not existing yet are expected and acceptable.

### Boundary

- **OWNS (exclusive write):** `src/features/source/browser/components/FileList/DrawingRefRow.tsx` (new), `src/features/source/browser/components/FileList/ConfigDrawingRow.tsx` (new)
- **READS (no modify):** `ConfigBomRow.tsx` for pattern reference

### Tasks

- Read `ConfigBomRow.tsx` to understand styling pattern
- Create `DrawingRefRow.tsx` with identical styling
- Create `ConfigDrawingRow.tsx` with identical styling
- Run typecheck

### Deliverables

- Two new row components ready for Agent 4 to wire into FileListBody

---

## Agent 3: Auto-Sync Drawing References

### Prompt

> Implement automatic drawing reference extraction on file change in BluePLM with enterprise-level code quality.
>
> **Context:**
> The app uses chokidar to watch the vault directory. When files change, `src/app/App.tsx` receives a `files-changed` event and calls `loadFiles(true)` to refresh. We need to hook into this flow so that whenever a `.slddrw` file changes on disk (user saves in SolidWorks), we automatically extract its references via the SW service and write them to the `file_references` DB table. This keeps the reverse lookup (part/assembly -> which drawings reference it) always in sync.
>
> **Existing infrastructure to use:**
>
> - `window.electronAPI.solidworks.getReferences(filePath)` -- gets references from SW service
> - `upsertFileReferences(orgId, vaultId, fileId, references, vaultRootPath)` from `src/lib/supabase/files/mutations.ts` -- upserts references to DB
> - `SWReference` type from `src/lib/supabase/files/mutations.ts` -- format for references
> - The `onFilesChanged` handler in `App.tsx` (around line 317) already receives changed file paths
> - `usePDMStore.getState()` to access files array and organization info
>
> **Scope:**
>
> In `src/app/App.tsx`, add a new function `syncDrawingReferencesInBackground` that:
>
> 1. Takes an array of changed file relative paths
> 2. Filters for `.slddrw` files only
> 3. Looks up each in the store's `files` array to find ones that are synced (`pdmData?.id` exists)
> 4. For each synced drawing, calls `getReferences` via SW service
> 5. Converts to `SWReference[]` format with `referenceType: 'reference'`
> 6. Calls `upsertFileReferences` to write to DB
> 7. Also clears any cached `configDrawingData` in the store for the referenced files (so the UI shows fresh data if a dropdown is open). Use `clearConfigDrawingData` action from the store.
>
> Call this function from the existing `onFilesChanged` handler, after `loadFiles(true)` completes. It should be fire-and-forget (don't await it, don't block the UI refresh). Add a debounce (3 seconds) per-drawing to avoid hammering the SW service on rapid saves.
>
> **Important details:**
>
> - Only run if SW service is available (check `window.electronAPI?.solidworks?.getReferences`)
> - Only run if user is signed in and has an organization + active vault
> - Use `addExpectedFileChanges` pattern if needed (though this writes to DB not filesystem, so probably not needed)
> - Log with `log.debug('[DrawingRefSync]', ...)` for traceability
> - Handle errors gracefully -- log and continue, never block the UI
> - The drawing reference type is `'reference'` (not `'component'` which is for assembly BOM)
>
> **Boundaries:**
>
> - OWNS: Auto-sync logic additions to `src/app/App.tsx`
> - READS: `src/lib/supabase/files/mutations.ts` (for `upsertFileReferences`, `SWReference`)
> - Do NOT modify any other files
>
> **Quality Requirements:**
>
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Robust error handling (SW service may not be running, file may not be synced)
> - Debouncing to prevent excessive calls
> - Fire-and-forget pattern (never blocks UI)
> - Clean logging for debugging
>
> **Deliverables:**
>
> - `syncDrawingReferencesInBackground` function in App.tsx
> - Integration into `onFilesChanged` handler
> - Report in `.cursor/plans/AGENT3_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** Auto-sync additions to `src/app/App.tsx`
- **READS (no modify):** `src/lib/supabase/files/mutations.ts`, `src/stores/pdmStore.ts`

### Tasks

- Read `App.tsx` `onFilesChanged` handler to understand current flow
- Implement `syncDrawingReferencesInBackground` function
- Add debounce logic (3s per drawing)
- Wire into `onFilesChanged` after `loadFiles(true)` completes
- Add cache invalidation for `configDrawingData`
- Run typecheck

### Deliverables

- Auto-sync mechanism that keeps `file_references` up to date on every drawing save

---

## Agent 4: Integration & Wiring

### Prompt

> Wire up the drawing reference dropdown UI for BluePLM with enterprise-level code quality. This agent runs AFTER Agents 1-3 complete.
>
> **Context:**
> The other agents have created:
>
> - Store state + actions for `expandedDrawingRefs`, `drawingRefData`, `loadingDrawingRefs`, `expandedConfigDrawings`, `configDrawingData`, `loadingConfigDrawings` (in `src/stores/slices/filesSlice.ts`)
> - `DrawingRefItem` type (in `src/stores/types.ts`)
> - `getDrawingsForFileConfig` query (in `src/lib/supabase/files/queries.ts`)
> - `DrawingRefRow` component (in `src/features/source/browser/components/FileList/DrawingRefRow.tsx`)
> - `ConfigDrawingRow` component (in `src/features/source/browser/components/FileList/ConfigDrawingRow.tsx`)
> - Auto-sync in App.tsx
>
> You need to wire everything together.
>
> **Scope:**
>
> **1. Add handler functions to `src/features/source/browser/hooks/useConfigHandlers.ts`:**
>
> `toggleDrawingRefExpansion(file: LocalFile)` -- for `.slddrw` file-level expand:
>
> - Toggle `expandedDrawingRefs` via `toggleDrawingRefExpansion` store action
> - If expanding and not cached, call `window.electronAPI.solidworks.getReferences(file.path)` 
> - Transform results to `DrawingRefItem[]` (enrich with local file data like BOM does)
> - Cache in `drawingRefData` via `setDrawingRefData`
> - Use loading state via `addLoadingDrawingRef` / `removeLoadingDrawingRef`
> - Follow the exact pattern of `toggleConfigBomExpansion`
>
> `toggleConfigDrawingExpansion(file: LocalFile, configName: string)` -- for config-level drawings:
>
> - Toggle `expandedConfigDrawings` via store action
> - If expanding and not cached, call `getDrawingsForFileConfig(fileId, configName)` from DB
> - Cache in `configDrawingData`
> - Use loading state
> - Follow exact pattern of `toggleConfigBomExpansion`
>
> Also update `canHaveConfigs` to NOT include `.slddrw` files (drawings get their own expand logic, not config expansion). Add a new `canHaveDrawingRefs(file)` helper that returns true for `.slddrw`.
>
> **2. Update `src/features/source/browser/context/FilePaneContext.tsx`:**
> Expose the new store state through context:
>
> - `expandedDrawingRefs`, `drawingRefData`, `loadingDrawingRefs`
> - `expandedConfigDrawings`, `configDrawingData`, `loadingConfigDrawings`
>
> **3. Update `src/features/source/browser/components/FileList/cells/NameCell.tsx`:**
>
> - Add a check: if file is `.slddrw`, show expand arrow (like `.sldprt`/`.sldasm` do for configs)
> - The arrow click should call `toggleDrawingRefExpansion(file)` instead of `toggleFileConfigExpansion(file)`
> - Use `expandedDrawingRefs.has(file.path)` for expanded state
> - Use `loadingDrawingRefs.has(file.path)` for loading spinner
>
> **4. Update `src/features/source/browser/components/FileList/ConfigRow.tsx`:**
>
> - `isExpandable` should now be true for BOTH assemblies AND parts (currently only assemblies)
> - For parts: the expand arrow toggles `configDrawingExpansion` (shows drawings)
> - For assemblies: the expand arrow toggles BOTH `configDrawingExpansion` AND `configBomExpansion` (shows drawings section first, then BOM)
> - Add new props: `isDrawingsExpanded`, `isDrawingsLoading` alongside existing `isBomExpanded`, `isBomLoading`
> - The single chevron arrow controls both sections together (one click expands/collapses all)
> - Update the memoization comparison function for new props
>
> **5. Update `src/features/source/browser/components/FileList/FileListBody.tsx`:**
>
> Add new virtual row types:

```typescript
> interface DrawingRefVirtualRow {
>   type: 'drawing-ref'
>   file: LocalFile
>   item: DrawingRefItem
> }
>
> interface ConfigDrawingVirtualRow {
>   type: 'config-drawing'
>   file: LocalFile
>   configName: string
>   configDepth: number
>   item: DrawingRefItem
> }
> 

```

> Update `VirtualRow` union type to include these.
>
> Update virtual row building logic:
>
> - After adding a file row, if file is `.slddrw` and `expandedDrawingRefs.has(file.path)`, add `DrawingRefVirtualRow` for each item in `drawingRefData.get(file.path)`
> - After adding a config row, if `expandedConfigDrawings.has(configKey)`, add `ConfigDrawingVirtualRow` for each drawing. Add these BEFORE the existing BOM rows so drawings appear first.
>
> Update `getRowHeight` for new row types (use `configBomRowHeight`).
>
> Add render functions `renderDrawingRefRow` and `renderConfigDrawingRow` following the pattern of `renderConfigBomRow`.
>
> Add new props to `FileListBodyProps`:
>
> - `onDrawingRefToggle: (e: React.MouseEvent, file: LocalFile) => void`
> - `onConfigDrawingToggle: (e: React.MouseEvent, file: LocalFile, configName: string) => void`
> - `onDrawingRefRowClick: (e: React.MouseEvent, file: LocalFile, item: DrawingRefItem) => void`
> - `onConfigDrawingRowClick: (e: React.MouseEvent, file: LocalFile, item: DrawingRefItem) => void`
>
> Update the switch statement in the render loop to handle the new row types.
>
> **Boundaries:**
>
> - OWNS: `src/features/source/browser/hooks/useConfigHandlers.ts`, `src/features/source/browser/context/FilePaneContext.tsx`, `src/features/source/browser/components/FileList/FileListBody.tsx`, `src/features/source/browser/components/FileList/cells/NameCell.tsx`, `src/features/source/browser/components/FileList/ConfigRow.tsx`
> - READS: All files created by Agents 1-3
> - Do NOT modify: `src/stores/types.ts`, `src/stores/slices/filesSlice.ts`, `src/lib/supabase/files/queries.ts`, `src/app/App.tsx`, `DrawingRefRow.tsx`, `ConfigDrawingRow.tsx`
>
> **Quality Requirements:**
>
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Follow existing patterns exactly
> - Update all memoization comparison functions for new props
> - All virtual row types properly handled in height calculation and rendering
>
> **Deliverables:**
>
> - Handler functions wired up
> - Context exposing new state
> - NameCell showing expand arrow for drawings
> - ConfigRow expandable for both parts and assemblies
> - FileListBody rendering new row types
> - Report in `.cursor/plans/AGENT4_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/features/source/browser/hooks/useConfigHandlers.ts`, `src/features/source/browser/context/FilePaneContext.tsx`, `src/features/source/browser/components/FileList/FileListBody.tsx`, `src/features/source/browser/components/FileList/cells/NameCell.tsx`, `src/features/source/browser/components/FileList/ConfigRow.tsx`
- **READS (no modify):** All Agent 1, 2, 3 deliverables

### Tasks

- Add `toggleDrawingRefExpansion` handler to useConfigHandlers.ts
- Add `toggleConfigDrawingExpansion` handler to useConfigHandlers.ts
- Add `canHaveDrawingRefs` helper to useConfigHandlers.ts
- Expose new state in FilePaneContext.tsx
- Update NameCell.tsx to show expand arrow on `.slddrw` files
- Update ConfigRow.tsx to be expandable for parts (drawings) and assemblies (drawings + BOM)
- Add new virtual row types to FileListBody.tsx
- Update virtual row building logic
- Add render functions and switch cases
- Add new props to FileListBodyProps
- Run typecheck

### Deliverables

- Fully wired UI with all dropdowns functional

