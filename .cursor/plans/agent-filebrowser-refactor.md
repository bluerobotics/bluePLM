# FileBrowser Enterprise Refactor - Agent Prompt

## Objective
Refactor the FileBrowser feature (`src/features/source/browser/`) to achieve enterprise-level code quality.

## Reference Plan
**Read the full analysis first:** `.cursor/plans/filebrowser_code_analysis_b7dc1d10.plan.md`

## Priority Tasks (in order)

### 1. Split FileContextMenu.tsx (1,483 lines → ~200 lines each)
- Extract download logic to `useDownloadOperation` hook
- Create composable action components: `OpenActions`, `FileSystemActions`, `SyncActions`, `CheckoutActions`, `CollaborationActions`, `DeleteActions`
- Move `formatBytes`/`formatSpeed` to `utils/formatting.ts`

### 2. Slim FileBrowser.tsx (1,480 lines → ~200 lines)
- Extract orchestration to `FileBrowserContent.tsx`
- Group related hooks into composite hooks (`useFileBrowserOperations`, `useFileBrowserView`)
- Move inline handlers to appropriate hooks

### 3. Refactor CellRenderer.tsx (865 lines → ~30 lines + individual cells)
- Create `components/FileList/cells/` directory
- Extract each column case to its own component (NameCell, StateCell, etc.)
- Use strategy pattern with `cellRenderers` lookup object

### 4. Split useModalHandlers (87 params → ~15 each)
- Create domain-specific hooks: `useReviewHandlers`, `useCheckoutRequestHandlers`, `useMentionHandlers`, `useWatchHandlers`, `useShareHandlers`, `useECOHandlers`

### 5. Centralize File Status Logic
- Create `useFileStatus(file, userId)` hook
- Replace scattered status checks across components

## Key Constraints
- Maintain all existing functionality
- Keep TypeScript strict mode compliance
- Follow existing patterns (Tailwind, Zustand selectors, command system)
- No new dependencies
- Run `npm run typecheck` after each major change

## Files to NOT Modify
- `constants.ts`, `utils/sorting.ts`, `utils/filtering.ts`, `utils/selection.ts`
- `hooks/useFolderMetrics.ts`, `hooks/useSorting.ts`
- `components/States/`, `components/Selection/`, `components/DragDrop/`

## Success Criteria
- No file > 400 lines
- No hook with > 20 parameters
- All status checks centralized
- `npm run typecheck` passes
