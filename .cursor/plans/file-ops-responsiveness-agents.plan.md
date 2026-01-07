# File Operations Responsiveness Multi-Agent Plan

## Objective

Fix the unresponsive UI when rapidly checking in/out large batches of files (e.g., 63 files across multiple folders). The current architecture has a serial operation queue, batch-only store updates at operation end, and per-file database round-trips causing the UI to hang for minutes before completing.

## Root Cause Analysis

| Issue | Location | Impact |
|-------|----------|--------|
| Serial operation queue | `operationsSlice.ts` line 118 | Folder operations queue up sequentially |
| 100ms delay between queued ops | `operationsSlice.ts` line 71 | Compounds latency for multi-folder clicks |
| Store updates only at end | `checkin.ts` lines 804-816 | No visual feedback during processing |
| processingOperations Map churn | `filesSlice.ts` lines 511-536 | Excessive React re-renders |
| Per-file RPC calls | `checkout.ts` | 63 files = 63 database round-trips |

## Agent Overview

| Agent | Responsibility | Owns | Dependencies |
|-------|---------------|------|--------------|
| Agent 1 | Command Handler Improvements | `src/lib/commands/handlers/checkin.ts`, `checkout.ts` | None |
| Agent 2 | Store Performance | `src/stores/slices/filesSlice.ts`, `operationsSlice.ts` | None |

## Shared Files

| File | Owner | Rule |
|------|-------|------|
| `src/lib/concurrency.ts` | Agent 1 | Agent 2 may read for constants |
| `src/stores/types.ts` | Agent 2 | Agent 1 reads only |

---

## Agent 1: Command Handler Improvements

### Prompt

> Improve BluePLM file operation responsiveness by adding incremental store updates during batch operations with enterprise-level code quality.
>
> **Scope:**
> - Add incremental store updates every 10 files (or 500ms) during checkin/checkout
> - Files: `src/lib/commands/handlers/checkin.ts`, `checkout.ts`
> - Follow existing patterns in the codebase
>
> **Boundaries:**
> - OWNS: `src/lib/commands/handlers/checkin.ts`, `src/lib/commands/handlers/checkout.ts`
> - Do NOT modify: `src/stores/slices/*`, `src/lib/supabase/*`
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Error handling and edge cases covered
> - Clean, readable, documented code
>
> **Deliverables:**
> - Modified checkin.ts with incremental store flushing
> - Modified checkout.ts with incremental store flushing
> - Report in `AGENT1_RESPONSIVENESS_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/lib/commands/handlers/checkin.ts`, `src/lib/commands/handlers/checkout.ts`
- **READS (no modify):** `src/stores/types.ts`, `src/lib/concurrency.ts`

### Tasks

- [ ] Add `FLUSH_INTERVAL = 10` constant for incremental updates
- [ ] Modify `checkin.ts` to flush `pendingUpdates` every 10 files during `processWithConcurrency`
- [ ] Modify `checkout.ts` with same incremental flush pattern
- [ ] Add comments explaining the incremental update strategy
- [ ] Run `npm run typecheck` and verify no errors

### Deliverables

- Checkin/checkout commands update the store incrementally during processing
- Users see file status changes in real-time during batch operations
- Report documenting changes and test results

---

## Agent 2: Store Performance

### Prompt

> Improve BluePLM store performance by optimizing the operation queue and processingOperations Map with enterprise-level code quality.
>
> **Scope:**
> - Reduce 100ms queue delay to 0ms in `operationsSlice.ts`
> - Add debouncing to `processingOperations` Map updates in `filesSlice.ts`
> - Enable parallel queue processing for non-conflicting operations
> - Follow existing patterns in the codebase
>
> **Boundaries:**
> - OWNS: `src/stores/slices/operationsSlice.ts`, `src/stores/slices/filesSlice.ts`
> - Do NOT modify: `src/lib/commands/*`, `src/lib/supabase/*`
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Error handling and edge cases covered
> - Clean, readable, documented code
>
> **Deliverables:**
> - Modified operationsSlice.ts with reduced delays and parallel processing
> - Modified filesSlice.ts with debounced processingOperations updates
> - Report in `AGENT2_RESPONSIVENESS_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary

- **OWNS (exclusive write):** `src/stores/slices/operationsSlice.ts`, `src/stores/slices/filesSlice.ts`
- **READS (no modify):** `src/stores/types.ts`

### Tasks

- [ ] Change `setTimeout(..., 100)` to `setTimeout(..., 0)` in `endSync()` (line 71)
- [ ] Remove the `setTimeout(..., 0)` wrapper in `queueOperation` (line 84) - call `processQueue()` directly
- [ ] Modify `processQueue()` to allow multiple non-conflicting operations (check `hasPathConflict` for each, not just first)
- [ ] Add debouncing to `addProcessingFolders` / `removeProcessingFolders` using `requestAnimationFrame` or microtask
- [ ] Run `npm run typecheck` and verify no errors

### Deliverables

- Operation queue processes with minimal delay
- Non-conflicting operations can run in parallel
- Reduced React re-renders from processingOperations Map updates
- Report documenting changes and test results

---

## Testing Strategy

After both agents complete:

1. Create test folder with 50+ files
2. Check out all files from parent folder - should complete quickly
3. Check in all files - should complete quickly
4. Rapidly click check-out on 3 different folders - should process in parallel
5. Verify UI remains responsive during operations
6. No hanging or frozen states
7. Progress toast updates smoothly

## Success Criteria

- Batch operation of 63 files completes in <30 seconds (vs. minutes currently)
- UI shows individual file status changes during operation
- Multiple folder operations don't queue up unnecessarily
- No React performance warnings in console

---

## Post-Execution: Coordinator Review

After all agents complete:

1. Collect reports: `AGENT1_RESPONSIVENESS_REPORT.md`, `AGENT2_RESPONSIVENESS_REPORT.md`
2. Run `npm run typecheck` to verify no errors
3. Manual testing with large file batches
4. Rename plan to `COMPLETE-file-ops-responsiveness-agents.plan.md`