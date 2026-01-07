# Console Logging Cleanup - Multi-Agent Plan

## Objective

Clean up verbose/redundant console logging across the app (~854 statements in 145 files) while creating a unified logger that outputs to both DevTools console AND Electron's app log. Remove debug spam while preserving important debugging information.

## Agent Overview

| Agent | Responsibility | Owns | Dependencies |
|-------|---------------|------|--------------|
| Agent 1 | Logger Foundation | `src/lib/logger.ts` | None (runs first) |
| Agent 2 | Core Infrastructure | `src/lib/*`, `src/stores/*` | Agent 1 |
| Agent 3 | Hooks & Components | `src/hooks/*`, `src/components/*` | Agent 1 |
| Agent 4 | Features | `src/features/*` | Agent 1 |

## Execution Order

```
Agent 1 (Logger) ──────┬──> Agent 2 (Lib/Stores)
                       ├──> Agent 3 (Hooks/Components)
                       └──> Agent 4 (Features)
```

**Agent 1 must complete first.** Agents 2, 3, 4 run in parallel after.

## Shared Files

| File | Owner | Rule |
|------|-------|------|
| `src/lib/logger.ts` | Agent 1 | Created by Agent 1, read-only for others |
| `src/electron.d.ts` | None | Read-only (contains electronAPI types) |

## Cleanup Guidelines (All Agents)

### REMOVE these patterns:
- Subscription status spam: `console.log('[X] subscription status:', status)`
- Debug data dumps: `console.log('DEBUG', JSON.stringify(...))`
- Heartbeat/polling logs: `console.log('[Session] Heartbeat...')`
- Success confirmations: `console.log('X complete')`
- Verbose state tracking: Line-by-line property logging

### KEEP and convert to logger:
- All `console.error` → `log.error`
- All `console.warn` → `log.warn`
- Significant state transitions (sign-in, sign-out, service start/stop)
- Operation failures and their context
- Security-relevant events

### Conversion pattern:
```typescript
// Before
console.error('[Auth] Failed to authenticate:', error)

// After
import { log } from '@/lib/logger'
log.error('[Auth]', 'Failed to authenticate', { error })
```

---

## Agent 1: Logger Foundation

### Prompt
> Create a unified logging utility for BluePLM with enterprise-level code quality.
>
> **Scope:**
> - Create `src/lib/logger.ts` with dual output (console + electronAPI)
> - Support levels: error, warn, info, debug
> - Support category prefixes for filtering (e.g., `[Auth]`, `[Realtime]`)
> - Debug level should be toggleable (check `localStorage.getItem('debug')` or similar)
>
> **Boundaries:**
> - OWNS: `src/lib/logger.ts`
> - READS: `src/electron.d.ts` for electronAPI types
> - Do NOT modify any other files
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Proper TypeScript types (no `any`)
> - Graceful fallback when electronAPI unavailable
> - Clean, readable, documented code
>
> **API Design:**
> ```typescript
> import { log } from '@/lib/logger'
> 
> log.error('[Auth]', 'Failed to authenticate', { userId, error })
> log.warn('[Session]', 'Token expiring soon', { expiresIn })
> log.info('[Realtime]', 'Connected to channel', { channel })
> log.debug('[PathMatch]', 'Checking path', { path }) // Can be disabled
> ```
>
> **Deliverables:**
> - `src/lib/logger.ts` with exports
> - Report in `LOGGER_AGENT_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary
- **OWNS (exclusive write):** `src/lib/logger.ts`
- **READS (no modify):** `src/electron.d.ts`

### Tasks
- [ ] Create logger utility with error, warn, info, debug levels
- [ ] Implement dual output to console and electronAPI
- [ ] Add debug toggle via localStorage or environment
- [ ] Export clean API
- [ ] Run typecheck

### Deliverables
- `src/lib/logger.ts` ready for import by other agents

---

## Agent 2: Core Infrastructure (Lib & Stores)

### Prompt
> Clean up console logging in BluePLM's core infrastructure with enterprise-level code quality.
>
> **Scope:**
> - Clean up all files in `src/lib/` (~25 files, ~120 console statements)
> - Clean up all files in `src/stores/` (~8 files, ~30 console statements)
> - Remove debug spam, keep important logs via unified logger
>
> **Key Files:**
> - `src/lib/realtime.ts` (20 logs) - Remove subscription status spam
> - `src/lib/supabase/sessions.ts` (34 logs) - Remove DEBUG/heartbeat logs
> - `src/lib/backup.ts` (27 logs) - Keep errors + service lifecycle only
> - `src/lib/supabase/client.ts`, `src/lib/supabase/recovery.ts`
> - `src/stores/slices/integrationsSlice.ts`, `src/stores/pdmStore.ts`
>
> **Boundaries:**
> - OWNS: `src/lib/*`, `src/stores/*`
> - READS: `src/lib/logger.ts` (import and use)
> - Do NOT modify: `src/hooks/*`, `src/features/*`, `src/components/*`
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Remove verbose/debug logs, keep meaningful ones
> - Convert remaining logs to unified logger
> - No `any` types
>
> **Cleanup Rules:**
> - REMOVE: `console.log('[Realtime] X subscription status:', status)` (all ~10)
> - REMOVE: `console.log('[OnlineUsers] DEBUG...')`
> - REMOVE: `console.log('[Session] Heartbeat...')`
> - KEEP: `log.error('[Session]', 'Failed to register...', { error })`
> - KEEP: `log.info('[Backup]', 'Service started')` and `'Service stopped'`
>
> **Deliverables:**
> - All `src/lib/` and `src/stores/` files cleaned up
> - Report in `INFRA_AGENT_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary
- **OWNS (exclusive write):** `src/lib/*`, `src/stores/*`
- **READS (no modify):** `src/lib/logger.ts`

### Tasks
- [ ] Clean `src/lib/realtime.ts` - remove subscription status spam
- [ ] Clean `src/lib/supabase/sessions.ts` - remove DEBUG/heartbeat logs
- [ ] Clean `src/lib/backup.ts` - keep errors + lifecycle
- [ ] Clean remaining `src/lib/supabase/*.ts` files
- [ ] Clean `src/lib/commands/handlers/*.ts` files
- [ ] Clean `src/stores/slices/*.ts` files
- [ ] Run typecheck

### Deliverables
- All lib and stores files using unified logger
- Reduced logging volume by ~60%

---

## Agent 3: Hooks & Components

### Prompt
> Clean up console logging in BluePLM's hooks and shared components with enterprise-level code quality.
>
> **Scope:**
> - Clean up all files in `src/hooks/` (~15 files, ~80 console statements)
> - Clean up all files in `src/components/` (~15 files, ~35 console statements)
> - Remove debug spam, keep important logs via unified logger
>
> **Key Files:**
> - `src/hooks/useAuth.ts` (26 logs) - Keep sign-in/out, remove verbose state
> - `src/hooks/useRealtimeSubscriptions.ts` (13 logs) - Remove subscription spam
> - `src/hooks/useStagedCheckins.ts`, `src/hooks/useAutoUpdater.ts`
> - `src/components/core/Toast/Toast.tsx`, `src/components/core/ErrorBoundary/`
> - `src/components/shared/Dialogs/UpdateModal.tsx`
>
> **Boundaries:**
> - OWNS: `src/hooks/*`, `src/components/*`
> - READS: `src/lib/logger.ts` (import and use)
> - Do NOT modify: `src/lib/*`, `src/features/*`, `src/stores/*`
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Remove verbose/debug logs, keep meaningful ones
> - Convert remaining logs to unified logger
> - No `any` types
>
> **Cleanup Rules for useAuth.ts:**
> - REMOVE: `console.log('[Auth] Supabase ready, setting up...')`
> - REMOVE: `console.log('[Auth] Loading organization...')`
> - KEEP: `log.info('[Auth]', 'User signed in', { email })`
> - KEEP: `log.info('[Auth]', 'User signed out')`
> - KEEP: `log.error('[Auth]', 'Failed to authenticate', { error })`
>
> **Deliverables:**
> - All `src/hooks/` and `src/components/` files cleaned up
> - Report in `HOOKS_AGENT_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary
- **OWNS (exclusive write):** `src/hooks/*`, `src/components/*`
- **READS (no modify):** `src/lib/logger.ts`

### Tasks
- [ ] Clean `src/hooks/useAuth.ts` - keep sign-in/out only
- [ ] Clean `src/hooks/useRealtimeSubscriptions.ts` - remove subscription spam
- [ ] Clean remaining `src/hooks/*.ts` files
- [ ] Clean `src/components/core/*.tsx` files
- [ ] Clean `src/components/shared/*.tsx` files
- [ ] Clean `src/components/layout/*.tsx` files
- [ ] Run typecheck

### Deliverables
- All hooks and components files using unified logger
- Auth logging reduced to meaningful events only

---

## Agent 4: Features

### Prompt
> Clean up console logging in BluePLM's feature modules with enterprise-level code quality.
>
> **Scope:**
> - Clean up all files in `src/features/` (~85 files, ~450 console statements)
> - This is the largest cleanup area - focus on high-impact files first
> - Remove debug spam, keep important logs via unified logger
>
> **Key Files (prioritize these):**
> - `src/features/integrations/solidworks/SolidWorksPanel.tsx` (28 logs) - Remove JSON dumps
> - `src/features/source/browser/hooks/useConfigHandlers.ts` (23 logs) - Consolidate export logs
> - `src/features/integrations/google-drive/GoogleDrivePanel.tsx` (20 logs)
> - `src/features/settings/organization/VaultsSettings.tsx` (16 logs)
> - `src/features/change-control/deviations/DeviationsView.tsx` (15 logs)
> - `src/features/supply-chain/rfq/RFQView.tsx` (28 logs)
>
> **Boundaries:**
> - OWNS: `src/features/*`
> - READS: `src/lib/logger.ts` (import and use)
> - Do NOT modify: `src/lib/*`, `src/hooks/*`, `src/stores/*`, `src/components/*`
>
> **Quality Requirements:**
> - Enterprise-level code quality and organization
> - Remove verbose/debug logs, keep meaningful ones
> - Convert remaining logs to unified logger
> - No `any` types
>
> **Cleanup Rules:**
> - REMOVE: `console.log('[SWPropertiesTab] result.data full:', JSON.stringify(...))`
> - REMOVE: `console.log('[PathMatch] Sample DB paths:', ...)`
> - REMOVE: `console.log('[Export] File path:', ...)` (consolidate 10+ lines to 1)
> - KEEP: `log.error('[VaultsSettings]', 'Failed to create vault', { error })`
> - KEEP: `log.info('[ContainsTab]', 'Loaded BOM', { count: nodes.length })`
>
> **Deliverables:**
> - All `src/features/` files cleaned up
> - Report in `FEATURES_AGENT_REPORT.md`
>
> **When complete:** Run `npm run typecheck` and report results.

### Boundary
- **OWNS (exclusive write):** `src/features/*`
- **READS (no modify):** `src/lib/logger.ts`

### Tasks
- [ ] Clean `src/features/integrations/solidworks/*.tsx` - remove JSON dumps
- [ ] Clean `src/features/source/browser/hooks/*.ts` - consolidate export logs
- [ ] Clean `src/features/integrations/google-drive/*.tsx`
- [ ] Clean `src/features/settings/**/*.tsx`
- [ ] Clean `src/features/change-control/**/*.tsx`
- [ ] Clean `src/features/supply-chain/**/*.tsx`
- [ ] Clean `src/features/source/**/*.tsx`
- [ ] Clean remaining feature files
- [ ] Run typecheck

### Deliverables
- All features files using unified logger
- JSON dumps and verbose debug logging removed
- Export metadata consolidated to single log line

---

## Verification

After all agents complete:

1. Run `npm run typecheck` - must pass
2. Search for remaining direct console usage:
   ```bash
   grep -r "console\." src/ --include="*.ts" --include="*.tsx" | wc -l
   ```
   Should be significantly reduced (target: <100 remaining, mostly in dev-tools)
3. Test app logging in DevTools and Electron log viewer
