# File Tree Performance Fix - Multi-Agent Plan

## Objective

Eliminate the 5-second UI freeze after file operations by:

1. Removing `useDeferredValue` (causes wrong state display)
2. Converting all file handlers to use atomic store updates (single re-render)
3. Fixing file watcher race condition (set `lastOperationCompletedAt`, delay clear)
4. Adding comprehensive diagnostic logging throughout

## Execution Phases

| Phase | Agents | Description | Dependencies |

|-------|--------|-------------|--------------|

| **Phase 1** | Foundation | Store infrastructure + logging setup | None |

| **Phase 2** | A, B, C, D (parallel) | Convert all command handlers | Phase 1 complete |

---

## Agent Overview

| Agent | Responsibility | Owns | Dependencies |

|-------|---------------|------|--------------|

| Foundation | Store actions, logging infra, remove defer | Core infrastructure | None |

| Agent A | Download/GetLatest handlers | `download.ts`, `getLatest.ts` | Foundation |

| Agent B | Checkout/Checkin handlers | `checkout.ts`, `checkin.ts` | Foundation |

| Agent C | Delete/Discard handlers | `delete.ts`, `discard.ts` | Foundation |

| Agent D | Sync/ForceRelease/Metadata handlers | `sync.ts`, `forceRelease.ts`, `syncSwMetadata.ts`, `info.ts`, `misc.ts` | Foundation |

## Shared Files

| File | Owner | Rule |

|------|-------|------|

| `src/stores/types.ts` | Foundation | Adds `setLastOperationCompletedAt` type |

| `src/stores/slices/operationsSlice.ts` | Foundation | Implements `setLastOperationCompletedAt` |

| `src/lib/commands/types.ts` | Foundation | Adds context method type |

| `src/lib/commands/executor.ts` | Foundation | Binds new context method |

| `src/features/.../useVaultTree.ts` | Foundation | Remove defer, add logging |

| `src/stores/slices/filesSlice.ts` | Foundation | Add logging to atomic update |

| `src/app/App.tsx` | Foundation | Enhanced file watcher logging |

---

## Phase 1: Foundation Agent

### Prompt

> Implement the foundation infrastructure for file tree performance fix with enterprise-level code quality.

>

> **Read the full plan:** `.cursor/plans/filetree-performance-fix-agents.plan.md`

>

> **Scope:**

> 1. Remove `useDeferredValue` from `useVaultTree.ts` - change `deferredFiles` back to `files`

> 2. Add timing logs to `folderMetrics` computation in `useVaultTree.ts`

> 3. Add timing logs to `updateFilesAndClearProcessing` in `filesSlice.ts`

> 4. Add `setLastOperationCompletedAt` action to store:

>    - Add type in `src/stores/types.ts`

>    - Implement in `src/stores/slices/operationsSlice.ts`

>    - Add to `CommandContext` in `src/lib/commands/types.ts`

>    - Bind in `src/lib/commands/executor.ts`

> 5. Enhance file watcher logging in `src/app/App.tsx`

>

> **Boundaries:**

> - OWNS: All files listed in Shared Files table

> - Do NOT modify: Command handler files (`src/lib/commands/handlers/*`)

>

> **Logging Format:**

> ```typescript

> window.electronAPI?.log('info', '[Tag] Message', { key: value, timestamp: Date.now() })

> ```

> Use tags: `[FolderMetrics]`, `[Store]`, `[FileWatcher]`

>

> **Quality Requirements:**

> - Enterprise-level code quality and organization

> - Proper TypeScript types (no `any`)

> - Preserve all existing functionality

> - Add detailed timing with `performance.now()`

>

> **Deliverables:**

> - All shared infrastructure ready for Phase 2 agents

> - Report in `FOUNDATION_AGENT_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):**
  - `src/features/source/explorer/file-tree/hooks/useVaultTree.ts`
  - `src/stores/slices/filesSlice.ts`
  - `src/stores/slices/operationsSlice.ts`
  - `src/stores/types.ts`
  - `src/lib/commands/types.ts`
  - `src/lib/commands/executor.ts`
  - `src/app/App.tsx`

- **READS (no modify):** Command handler files

### Tasks

- [ ] Remove `useDeferredValue` from `useVaultTree.ts`, use `files` directly
- [ ] Add timing logs to `folderMetrics` useMemo (start/end with duration)
- [ ] Add timing logs to `updateFilesAndClearProcessing` in filesSlice.ts
- [ ] Add `setLastOperationCompletedAt: (timestamp: number) => void` to `FilesSlice` type
- [ ] Implement `setLastOperationCompletedAt` in operationsSlice.ts
- [ ] Add `setLastOperationCompletedAt` to `CommandContext` interface
- [ ] Bind `setLastOperationCompletedAt` in executor.ts `buildCommandContext()`
- [ ] Enhance file watcher logging in App.tsx with state check details

### Deliverables

- `setLastOperationCompletedAt` action available in command context
- Timing logs for folderMetrics and store updates
- Enhanced file watcher debug logging

---

## Phase 2: Command Handler Agents (Parallel)

### Agent A: Download/GetLatest

#### Prompt

> Update download and getLatest handlers for file tree performance fix with enterprise-level code quality.

>

> **Read the full plan:** `.cursor/plans/filetree-performance-fix-agents.plan.md`

>

> **Scope:**

> These handlers already use `updateFilesAndClearProcessing()`. Add:

> 1. Call `ctx.setLastOperationCompletedAt(Date.now())` after store update

> 2. Delay `clearExpectedFileChanges()` by 5 seconds using setTimeout

> 3. Add operation timing logs with `[Download]` and `[GetLatest]` tags

>

> **Boundaries:**

> - OWNS: `src/lib/commands/handlers/download.ts`, `src/lib/commands/handlers/getLatest.ts`

> - READS: `src/lib/commands/types.ts` (for context types)

> - Do NOT modify: Other handler files, store files

>

> **Pattern to implement:**

> ```typescript

> // After updateFilesAndClearProcessing:

> ctx.setLastOperationCompletedAt(Date.now())

>

> // Delay clearing expected changes

> const pathsToClear = [...filePaths]

> setTimeout(() => {

>   ctx.clearExpectedFileChanges(pathsToClear)

>   logX('debug', 'Expected file changes cleared (delayed)', { count: pathsToClear.length })

> }, 5000)

> ```

>

> **Quality Requirements:**

> - Enterprise-level code quality

> - Preserve all existing functionality

> - Add timing logs for key operations

>

> **Deliverables:**

> - Updated handlers with suppression fix

> - Report in `AGENT_A_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

#### Boundary

- **OWNS:** `src/lib/commands/handlers/download.ts`, `src/lib/commands/handlers/getLatest.ts`
- **READS:** `src/lib/commands/types.ts`

#### Tasks

- [ ] download.ts: Add `setLastOperationCompletedAt(Date.now())` after atomic update
- [ ] download.ts: Delay `clearExpectedFileChanges()` by 5 seconds
- [ ] download.ts: Add timing logs with `[Download]` tag
- [ ] getLatest.ts: Add `setLastOperationCompletedAt(Date.now())` after atomic update
- [ ] getLatest.ts: Delay `clearExpectedFileChanges()` by 5 seconds
- [ ] getLatest.ts: Add timing logs with `[GetLatest]` tag

---

### Agent B: Checkout/Checkin

#### Prompt

> Convert checkout and checkin handlers to use atomic store updates with enterprise-level code quality.

>

> **Read the full plan:** `.cursor/plans/filetree-performance-fix-agents.plan.md`

>

> **Scope:**

> Convert from separate calls to atomic update pattern:

> ```typescript

> // BEFORE (2 renders):

> ctx.updateFilesInStore(pendingUpdates)

> ctx.removeProcessingFolders(allPathsBeingProcessed)

>

> // AFTER (1 render):

> ctx.updateFilesAndClearProcessing(pendingUpdates, allPathsBeingProcessed)

> ctx.setLastOperationCompletedAt(Date.now())

> ```

>

> **Boundaries:**

> - OWNS: `src/lib/commands/handlers/checkout.ts`, `src/lib/commands/handlers/checkin.ts`

> - READS: `src/lib/commands/types.ts`

> - Do NOT modify: Other handler files, store files

>

> **Important:** These handlers use incremental flushing during processing:

> ```typescript

> if (updateCount > lastFlushIndex) {

>   ctx.updateFilesInStore(updatesToFlush)

> }

> ```

> Keep these incremental updates during processing. Only convert the FINAL cleanup to atomic.

>

> **Quality Requirements:**

> - Enterprise-level code quality

> - Preserve incremental progress updates during operation

> - Only make final cleanup atomic

> - Add timing logs with `[Checkout]` and `[Checkin]` tags

>

> **Deliverables:**

> - Updated handlers with atomic final cleanup

> - Report in `AGENT_B_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

#### Boundary

- **OWNS:** `src/lib/commands/handlers/checkout.ts`, `src/lib/commands/handlers/checkin.ts`
- **READS:** `src/lib/commands/types.ts`

#### Tasks

- [ ] checkout.ts: Convert final cleanup to `updateFilesAndClearProcessing()`
- [ ] checkout.ts: Add `setLastOperationCompletedAt(Date.now())`
- [ ] checkout.ts: Add timing logs with `[Checkout]` tag
- [ ] checkin.ts: Convert final cleanup to `updateFilesAndClearProcessing()`
- [ ] checkin.ts: Add `setLastOperationCompletedAt(Date.now())`
- [ ] checkin.ts: Add timing logs with `[Checkin]` tag

---

### Agent C: Delete/Discard

#### Prompt

> Convert delete and discard handlers to use atomic store updates with enterprise-level code quality.

>

> **Read the full plan:** `.cursor/plans/filetree-performance-fix-agents.plan.md`

>

> **Scope:**

> 1. Convert to atomic update pattern

> 2. **CRITICAL for discard.ts:** Remove the `ctx.onRefresh?.(false)` call at line ~359

>    - This triggers a FULL filesystem rescan causing freeze

>    - The incremental store update is sufficient

>

> **Boundaries:**

> - OWNS: `src/lib/commands/handlers/delete.ts`, `src/lib/commands/handlers/discard.ts`

> - READS: `src/lib/commands/types.ts`

> - Do NOT modify: Other handler files, store files

>

> **Pattern:**

> ```typescript

> // BEFORE:

> ctx.updateFilesInStore(pendingUpdates)

> ctx.removeProcessingFolders(allPathsBeingProcessed)

> ctx.onRefresh?.(false)  // DELETE THIS LINE in discard.ts!

>

> // AFTER:

> ctx.updateFilesAndClearProcessing(pendingUpdates, allPathsBeingProcessed)

> ctx.setLastOperationCompletedAt(Date.now())

> // NO onRefresh call - incremental update is sufficient

> ```

>

> **Quality Requirements:**

> - Enterprise-level code quality

> - REMOVE unnecessary onRefresh() calls

> - Add timing logs with `[Delete]` and `[Discard]` tags

>

> **Deliverables:**

> - Updated handlers with atomic cleanup, no onRefresh

> - Report in `AGENT_C_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

#### Boundary

- **OWNS:** `src/lib/commands/handlers/delete.ts`, `src/lib/commands/handlers/discard.ts`
- **READS:** `src/lib/commands/types.ts`

#### Tasks

- [ ] delete.ts: Convert to `updateFilesAndClearProcessing()` at all cleanup points
- [ ] delete.ts: Add `setLastOperationCompletedAt(Date.now())`
- [ ] delete.ts: Add timing logs with `[Delete]` tag
- [ ] discard.ts: Convert to `updateFilesAndClearProcessing()`
- [ ] discard.ts: **REMOVE `ctx.onRefresh?.(false)` call**
- [ ] discard.ts: Add `setLastOperationCompletedAt(Date.now())`
- [ ] discard.ts: Add timing logs with `[Discard]` tag

---

### Agent D: Sync/ForceRelease/Metadata

#### Prompt

> Convert sync, forceRelease, syncSwMetadata handlers and cleanup misc/info to use atomic updates with enterprise-level code quality.

>

> **Read the full plan:** `.cursor/plans/filetree-performance-fix-agents.plan.md`

>

> **Scope:**

> 1. Convert `sync.ts`, `forceRelease.ts`, `syncSwMetadata.ts` to atomic pattern

> 2. Remove unnecessary `onRefresh()` calls from `info.ts` and `misc.ts`

>

> **Boundaries:**

> - OWNS: `sync.ts`, `forceRelease.ts`, `syncSwMetadata.ts`, `info.ts`, `misc.ts`

> - READS: `src/lib/commands/types.ts`

> - Do NOT modify: Other handler files, store files

>

> **For info.ts and misc.ts:**

> - Find and remove `ctx.onRefresh?.(true)` calls

> - These cause unnecessary full reloads

>

> **Pattern:**

> ```typescript

> // AFTER:

> ctx.updateFilesAndClearProcessing(pendingUpdates, allPathsBeingProcessed)

> ctx.setLastOperationCompletedAt(Date.now())

> ```

>

> **Quality Requirements:**

> - Enterprise-level code quality

> - Add timing logs with `[Sync]`, `[ForceRelease]`, `[SyncMetadata]` tags

>

> **Deliverables:**

> - Updated handlers with atomic cleanup

> - Report in `AGENT_D_REPORT.md`

>

> **When complete:** Run `npm run typecheck` and report results.

#### Boundary

- **OWNS:** `src/lib/commands/handlers/sync.ts`, `forceRelease.ts`, `syncSwMetadata.ts`, `info.ts`, `misc.ts`
- **READS:** `src/lib/commands/types.ts`

#### Tasks

- [ ] sync.ts: Convert to `updateFilesAndClearProcessing()`
- [ ] sync.ts: Add `setLastOperationCompletedAt(Date.now())`
- [ ] sync.ts: Add timing logs with `[Sync]` tag
- [ ] forceRelease.ts: Convert to `updateFilesAndClearProcessing()`
- [ ] forceRelease.ts: Add `setLastOperationCompletedAt(Date.now())`
- [ ] forceRelease.ts: Add timing logs with `[ForceRelease]` tag
- [ ] syncSwMetadata.ts: Convert to `updateFilesAndClearProcessing()`
- [ ] syncSwMetadata.ts: Add `setLastOperationCompletedAt(Date.now())`
- [ ] syncSwMetadata.ts: Add timing logs with `[SyncMetadata]` tag
- [ ] info.ts: Remove `onRefresh()` call in `handleSetState()`
- [ ] misc.ts: Remove `onRefresh()` call

---

## Diagnostic Log Tags

| Tag | Description |

|-----|-------------|

| `[FolderMetrics]` | folderMetrics computation timing |

| `[Store]` | Store update operations |

| `[FileWatcher]` | File watcher events and decisions |

| `[Download]` | Download command flow |

| `[GetLatest]` | Get-latest command flow |

| `[Checkin]` | Check-in command flow |

| `[Checkout]` | Checkout command flow |

| `[Delete]` | Delete command flow |

| `[Discard]` | Discard command flow |

| `[Sync]` | Sync command flow |

| `[ForceRelease]` | Force release command flow |

| `[SyncMetadata]` | Sync metadata command flow |

---

## Verification Checklist (Post-Implementation)

After all agents complete:

1. Run `npm run typecheck` - must pass with no errors
2. Test each operation and verify in logs:

   - `[Store] updateFilesAndClearProcessing COMPLETE` shows < 100ms
   - `[FolderMetrics] Computation complete` shows timing
   - `[FileWatcher] State check `shows `withinSuppressionWindow: true`
   - No unnecessary `loadFiles` calls after operations

3. UI updates immediately with correct state (no dual-cloud display)
4. No freeze for any file operation

---

## Expected Log Sequence (After Fix)

```
[Download] Downloads finished, starting store update        {operationId, timestamp}
[Store] updateFilesAndClearProcessing START                {updateCount, timestamp}
[Store] updateFilesAndClearProcessing COMPLETE             {durationMs, timestamp}
[FolderMetrics] Starting computation                       {fileCount, timestamp}
[FolderMetrics] Computation complete                       {folderCount, durationMs, timestamp}
[FileWatcher] Event received                               {changedCount, timestamp}
[FileWatcher] State check                                  {withinSuppressionWindow: true, ...}
[FileWatcher] Decision                                     {willTriggerRefresh: false}
... (5 seconds later) ...
[Download] Expected file changes cleared (delayed)         {count, timestamp}
```