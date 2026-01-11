# File Tree Download Freeze Fix - Multi-Agent Plan

## Objective

Fix the ~5 second UI freeze that occurs after file downloads complete, caused by expensive O(N x depth) `folderMetrics` recomputation in `useVaultTree.ts` blocking the main thread when files state updates with 8000+ files.

**Symptoms:**

- Both blue cloud (server) and green cloud (synced) icons appear simultaneously
- ~5 second delay where nothing updates
- Complete UI freeze for ~5 seconds
- Finally, icons resolve to correct state

**Root Cause:** The `folderMetrics` useMemo performs ~40,000+ synchronous Map operations when `files` array changes. Download completion triggers TWO sequential state updates (`updateFilesInStore` then `removeProcessingFolders`), each causing a full re-render with this expensive computation.

## Agent Overview

| Agent | Responsibility | Owns | Dependencies |
|-------|---------------|------|--------------|
| Agent 1: Store | Atomic state update action | `src/stores/slices/filesSlice.ts`, `src/stores/types.ts` | None |
| Agent 2: Commands | Use atomic updates in download commands | `src/lib/commands/handlers/download.ts`, `src/lib/commands/handlers/getLatest.ts` | Agent 1 |
| Agent 3: Performance | Defer computation + optimize algorithm | `src/features/source/explorer/file-tree/hooks/useVaultTree.ts` | None |

## Shared Files

| File | Owner | Rule |
|------|-------|------|
| `src/stores/types.ts` | Agent 1 | Agent 1 adds new action type |
| `src/lib/commands/types.ts` | Agent 2 | Agent 2 adds new context method |
| `src/lib/commands/executor.ts` | Agent 2 | Agent 2 adds new context binding |

---

## Agent 1: Store

### Prompt

> Implement an atomic state update action for BluePLM's file store with enterprise-level code quality.
>
> **Context:**
> After file downloads complete, two sequential state updates (`updateFilesInStore` then `removeProcessingFolders`) cause two expensive re-render cycles. We need to combine these into a single atomic operation.
>
> **Scope:**
> 1. Add new action `updateFilesAndClearProcessing` to `FilesSlice` interface in `src/stores/types.ts`
> 2. Implement the action in `src/stores/slices/filesSlice.ts` that:
>    - Takes `updates: Array<{ path: string; updates: Partial<LocalFile> }>`
>    - Takes `pathsToClearProcessing: string[]`
>    - Applies file updates AND clears processing operations in a SINGLE `set()` call
>    - Uses the existing batching logic from `pendingProcessingRemoves`
>
> **Boundaries:**
> - OWNS: `src/stores/slices/filesSlice.ts`, `src/stores/types.ts`
> - READS: `src/stores/pdmStore.ts` (do not modify)
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Follow existing patterns in filesSlice.ts
> - Add JSDoc comments explaining the atomic operation
>
> **Deliverables:**
> - New `updateFilesAndClearProcessing` action in FilesSlice
> - Type definition in types.ts
> - Report in `STORE_AGENT_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/stores/slices/filesSlice.ts`, `src/stores/types.ts`
- **READS (no modify):** `src/stores/pdmStore.ts`

### Tasks

- [x] Add `updateFilesAndClearProcessing` to `FilesSlice` interface in `src/stores/types.ts`
- [x] Implement action in `src/stores/slices/filesSlice.ts`
- [x] Add JSDoc comments explaining why atomic update is needed
- [x] Run `npm run typecheck`
- [x] Write `STORE_AGENT_REPORT.md`

### Deliverables

- New atomic action that other agents can use via CommandContext

---

## Agent 2: Commands

### Prompt

> Update BluePLM download commands to use atomic state updates with enterprise-level code quality.
>
> **Context:**
> After file downloads complete, two sequential state updates cause expensive re-renders. Agent 1 created `updateFilesAndClearProcessing` - use it to combine updates into one.
>
> **Scope:**
> 1. Add `updateFilesAndClearProcessing` to `CommandContext` interface in `src/lib/commands/types.ts`
> 2. Bind the action in `src/lib/commands/executor.ts` `buildCommandContext()`
> 3. Update `src/lib/commands/handlers/download.ts`:
>    - Replace separate `ctx.updateFilesInStore()` and `ctx.removeProcessingFolders()` calls
>    - Use single `ctx.updateFilesAndClearProcessing(pendingUpdates, allPathsToTrack)`
> 4. Update `src/lib/commands/handlers/getLatest.ts`:
>    - Same pattern - combine the two calls into one atomic update
>
> **Boundaries:**
> - OWNS: `src/lib/commands/handlers/download.ts`, `src/lib/commands/handlers/getLatest.ts`, `src/lib/commands/types.ts`, `src/lib/commands/executor.ts`
> - READS: `src/stores/slices/filesSlice.ts` (verify action exists)
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Clear comments explaining the atomic update pattern
> - Preserve all existing error handling and logging
>
> **Deliverables:**
> - Updated download.ts and getLatest.ts using atomic updates
> - CommandContext with new method
> - Report in `COMMANDS_AGENT_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/lib/commands/handlers/download.ts`, `src/lib/commands/handlers/getLatest.ts`, `src/lib/commands/types.ts`, `src/lib/commands/executor.ts`
- **READS (no modify):** `src/stores/slices/filesSlice.ts`

### Tasks

- [x] Wait for Agent 1 to complete (need the store action)
- [x] Add `updateFilesAndClearProcessing` to CommandContext interface
- [x] Bind action in buildCommandContext()
- [x] Update download.ts to use atomic update
- [x] Update getLatest.ts to use atomic update
- [x] Run `npm run typecheck`
- [x] Write `COMMANDS_AGENT_REPORT.md`

### Deliverables

- Download commands that trigger only ONE re-render cycle instead of two

---

## Agent 3: Performance

### Prompt

> Optimize BluePLM file tree performance with enterprise-level code quality.
>
> **Context:**
> The `folderMetrics` useMemo in `useVaultTree.ts` performs O(N x depth) computation (~40,000 operations with 8000 files) synchronously, blocking the UI. We need to defer this computation and optimize the algorithm.
>
> **Scope:**
> 1. In `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`:
>    - Import `useDeferredValue` from React
>    - Create `deferredFiles = useDeferredValue(files)`
>    - Use `deferredFiles` as the dependency for `folderMetrics` useMemo (line 312)
>    - Keep `files` for the `tree` useMemo (tree structure needs immediate update)
> 2. Optimize the `folderMetrics` algorithm:
>    - Current: Two passes through files (lines 166-254, then 257-291)
>    - Merge checkout user collection into the first pass
>    - Use a Map<userId, CheckoutUser> per folder to dedupe during first pass
>    - Eliminate the second O(N) iteration entirely
>
> **Boundaries:**
> - OWNS: `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`
> - READS: `src/stores/pdmStore.ts`, `src/features/source/explorer/file-tree/types.ts`
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Maintain all existing functionality and return values
> - Add comments explaining the performance optimization
> - Keep existing fallback logic for edge cases
>
> **Deliverables:**
> - Deferred `folderMetrics` computation that doesn't block UI
> - Optimized single-pass algorithm
> - Report in `PERFORMANCE_AGENT_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`
- **READS (no modify):** `src/stores/pdmStore.ts`, `src/features/source/explorer/file-tree/types.ts`

### Tasks

- [x] Add `useDeferredValue` for files in folderMetrics computation
- [x] Merge checkout user collection into first pass (eliminate second O(N) loop)
- [x] Add performance comments explaining the optimization
- [x] Run `npm run typecheck`
- [x] Write `PERFORMANCE_AGENT_REPORT.md`

### Deliverables

- Non-blocking folderMetrics computation
- ~30-40% faster algorithm (single pass instead of two)

---

## Execution Order

1. **Agent 1 (Store)** and **Agent 3 (Performance)** can run in PARALLEL - no dependencies
2. **Agent 2 (Commands)** must wait for Agent 1 to complete

## Verification

After all agents complete:

1. Run `npm run typecheck` - must pass
2. Manual test:

- Download files in a vault with 1000+ files
- Verify UI remains responsive during download
- Verify folder icons update correctly (no double-cloud glitch)
- Verify spinners appear/disappear at correct times