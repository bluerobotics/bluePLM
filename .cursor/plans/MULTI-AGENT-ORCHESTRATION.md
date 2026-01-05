# Multi-Agent Parallel Execution - Master Orchestration

## Overview

This document orchestrates 6 agents working in parallel on the BluePLM enterprise architecture refactor. Each agent has:
- **Exclusive file ownership** - No overlapping files
- **Clear boundaries** - Agents can work simultaneously
- **Detailed plan files** - Found in this same directory

---

## Execution Waves

### Wave 1: Foundation (All 6 Agents in Parallel)

All agents can start simultaneously. They have no dependencies on each other.

| Agent | Focus Area | Plan File | Est. Time |
|-------|------------|-----------|-----------|
| Agent 1 | Core Components | `agent1-core-components.md` | 2-3 hours |
| Agent 2 | Shared Components | `agent2-shared-components.md` | 2-3 hours |
| Agent 3 | Seasonal Effects | `agent3-seasonal-effects.md` | 2-3 hours |
| Agent 4 | Lib Utils | `agent4-lib-utils.md` | 2-3 hours |
| Agent 5 | FileBrowser Split | `agent5-filebrowser-split.md` | 4-6 hours |
| Agent 6 | Settings Reorg | `agent6-settings-reorg.md` | 3-4 hours |

### Wave 2: Integration (After Wave 1)

After Wave 1 completes, run final integration:
- Update remaining import paths
- Remove backward compatibility stubs (optional)
- Run full test suite
- Address any type errors

---

## File Ownership Matrix

This matrix ensures no two agents touch the same files:

| Directory/File | Owner |
|----------------|-------|
| `src/components/core/` | Agent 1 |
| `src/components/Toast.tsx` | Agent 1 |
| `src/components/ErrorBoundary.tsx` | Agent 1 |
| `src/components/shared/` | Agent 2 |
| `src/components/OnlineUsersIndicator.tsx` | Agent 2 |
| `src/components/ImpersonationBanner.tsx` | Agent 2 |
| `src/components/LanguageSelector.tsx` | Agent 2 |
| `src/components/SystemStats.tsx` | Agent 2 |
| `src/features/seasonal-effects/` | Agent 3 |
| `src/components/ChristmasEffects.tsx` | Agent 3 |
| `src/components/HalloweenEffects.tsx` | Agent 3 |
| `src/components/WeatherEffects.tsx` | Agent 3 |
| `src/lib/weather.ts` | Agent 3 |
| `src/lib/snowPhysics.ts` | Agent 3 |
| `src/lib/utils.ts` | Agent 4 |
| `src/lib/utils/` | Agent 4 |
| `src/lib/clipboard.ts` | Agent 4 |
| `src/lib/analytics.ts` | Agent 4 |
| `src/features/file-browser/` | Agent 5 |
| `src/components/FileBrowser.tsx` | Agent 5 |
| `src/components/file-browser/` | Agent 5 |
| `src/features/settings/` | Agent 6 |
| `src/components/settings/` | Agent 6 |
| `src/components/SettingsContent.tsx` | Agent 6 |
| `src/components/sidebar/SettingsNavigation.tsx` | Agent 6 |

**PROTECTED FILES (No agent should touch):**
- `src/App.tsx`
- `src/main.tsx`
- `src/stores/` (all files)
- `src/types/` (all files)
- `src/hooks/` (root hooks)
- `src/components/layout/` (already organized)
- `src/components/Sidebar.tsx`
- `src/lib/supabase/` (future Agent 7)
- `src/lib/commands/` (future Agent 7)

---

## Complete Agent Prompts

### Agent 1 Prompt
```
You are Agent 1 in a multi-agent refactoring operation. Your mission is to extract core UI components.

CRITICAL RULES:
1. ONLY touch files in your ownership list
2. Create re-export stubs at original locations for backward compatibility
3. Use @/ import aliases
4. Run `npm run typecheck` after each major change
5. Follow existing Tailwind patterns (plm-bg, plm-fg, plm-border)

YOUR OWNERSHIP:
- src/components/Toast.tsx → Move to src/components/core/Toast/
- src/components/ErrorBoundary.tsx → Move to src/components/core/ErrorBoundary/
- Create: src/components/core/Loader/
- Create: src/components/core/Dialog/
- Create: src/components/core/index.ts

Read your detailed plan: .cursor/plans/agent1-core-components.md

Begin by reading the existing Toast.tsx and ErrorBoundary.tsx to understand current implementation.
```

### Agent 2 Prompt
```
You are Agent 2 in a multi-agent refactoring operation. Your mission is to organize shared smart components.

CRITICAL RULES:
1. ONLY touch files in your ownership list
2. Create re-export stubs at original locations for backward compatibility
3. Use @/ import aliases
4. Run `npm run typecheck` after each major change
5. Create proper barrel exports (index.ts) for each subfolder

YOUR OWNERSHIP:
- src/components/shared/ (entire directory - reorganize)
- src/components/OnlineUsersIndicator.tsx → Move to shared/OnlineUsers/
- src/components/ImpersonationBanner.tsx → Move to shared/
- src/components/LanguageSelector.tsx → Move to shared/
- src/components/SystemStats.tsx → Move to shared/
- Create: src/components/shared/Avatar/ (new component)

Read your detailed plan: .cursor/plans/agent2-shared-components.md

Begin by listing current files in src/components/shared/ and reading them.
```

### Agent 3 Prompt
```
You are Agent 3 in a multi-agent refactoring operation. Your mission is to create the seasonal-effects feature module.

CRITICAL RULES:
1. ONLY touch files in your ownership list
2. Create re-export stubs at original locations for backward compatibility
3. Use relative imports within the feature, @/ for external
4. Preserve all animation/physics logic exactly
5. Test effects visually by setting theme to christmas/halloween

YOUR OWNERSHIP:
- src/components/ChristmasEffects.tsx → Move to features/seasonal-effects/
- src/components/HalloweenEffects.tsx → Move to features/seasonal-effects/
- src/components/WeatherEffects.tsx → Move to features/seasonal-effects/
- src/lib/weather.ts → Move to features/seasonal-effects/utils/
- src/lib/snowPhysics.ts → Move to features/seasonal-effects/utils/
- Create: src/features/seasonal-effects/ (entire structure)

Read your detailed plan: .cursor/plans/agent3-seasonal-effects.md

Begin by creating the src/features/seasonal-effects/ directory structure, then read the existing effect components.
```

### Agent 4 Prompt
```
You are Agent 4 in a multi-agent refactoring operation. Your mission is to reorganize lib/ utilities.

CRITICAL RULES:
1. ONLY touch files in your ownership list
2. Create re-export from original utils.ts for backward compatibility
3. Pure utilities only - no side effects, no API calls, no store access
4. Add JSDoc comments to all functions
5. Ensure platform-aware path utilities work on Windows and Mac

YOUR OWNERSHIP:
- src/lib/utils.ts → Split into src/lib/utils/
- src/lib/clipboard.ts → Clean up
- src/lib/analytics.ts → Clean up
- Create: src/lib/utils/date.ts
- Create: src/lib/utils/string.ts
- Create: src/lib/utils/path.ts
- Create: src/lib/utils/format.ts
- Create: src/lib/utils/validation.ts
- Create: src/lib/utils/index.ts

DO NOT TOUCH:
- src/lib/supabase/
- src/lib/commands/
- src/lib/i18n/
- src/lib/weather.ts (Agent 3)
- src/lib/snowPhysics.ts (Agent 3)

Read your detailed plan: .cursor/plans/agent4-lib-utils.md

Begin by reading src/lib/utils.ts to audit existing utilities.
```

### Agent 5 Prompt
```
You are Agent 5 in a multi-agent refactoring operation. Your mission is to decompose the massive FileBrowser.tsx.

CRITICAL RULES:
1. ONLY touch files in your ownership list
2. This is the LARGEST refactor - work in phases
3. Test after each phase to ensure nothing breaks
4. Preserve ALL existing functionality
5. Target: main FileBrowser.tsx under 500 lines
6. Use existing hooks - build on them, don't rewrite

YOUR OWNERSHIP:
- src/components/FileBrowser.tsx (~7000 lines) → Split to features/file-browser/
- src/components/file-browser/ → Reorganize into features/file-browser/
- Create: src/features/file-browser/ (entire structure)

This is complex. Work in phases:
1. Create directory structure
2. Move existing file-browser/ helpers
3. Extract utilities (sorting, filtering, selection)
4. Extract hooks
5. Extract sub-components
6. Rewrite main component
7. Create exports and stubs

Read your detailed plan: .cursor/plans/agent5-filebrowser-split.md

Begin by reading the first 200 lines of FileBrowser.tsx to understand imports and structure.
```

### Agent 6 Prompt
```
You are Agent 6 in a multi-agent refactoring operation. Your mission is to reorganize settings into domain groups.

CRITICAL RULES:
1. ONLY touch files in your ownership list
2. Create re-export stubs at original locations
3. Group settings logically by domain (account, organization, integrations, system)
4. Preserve the team-members/ folder structure - it's already well organized
5. Watch for circular dependencies between settings files

YOUR OWNERSHIP:
- src/components/settings/ (all 30+ files) → Move to features/settings/{domain}/
- src/components/SettingsContent.tsx → Move to features/settings/components/
- src/components/sidebar/SettingsNavigation.tsx → Move to features/settings/components/
- Create: src/features/settings/ (entire structure)

Domain groupings:
- account/: AccountSettings, ProfileSettings, DeleteAccountSettings, KeybindingsSettings, PreferencesSettings
- organization/: CompanyProfileSettings, VaultsSettings, ModulesSettings, team-members/, etc.
- integrations/: ApiSettings, GoogleDriveSettings, SolidWorksSettings, etc.
- system/: PerformanceSettings, DevToolsSettings, BackupSettings, etc.

Read your detailed plan: .cursor/plans/agent6-settings-reorg.md

Begin by listing all files in src/components/settings/ to get current inventory.
```

---

## Conflict Resolution

If an agent encounters a file they don't own:
1. **STOP** - Do not modify the file
2. Note it in your output: "CONFLICT: Need to modify [file] which is owned by Agent [X]"
3. Continue with other tasks
4. The conflict will be resolved in Wave 2

---

## Verification Protocol

Each agent must run before marking complete:
1. `npm run typecheck` - No TypeScript errors
2. Visual inspection - Features still work
3. Import check - All imports resolve

Final integration verification:
1. Full app startup test
2. Navigate all settings pages
3. Test file browser (list, grid, selection, drag-drop)
4. Test seasonal effects (set theme)
5. Run full typecheck

---

## Communication Protocol

Agents should output status updates:
- `[STARTING] Phase X: Description`
- `[COMPLETE] Phase X: Files created/moved`
- `[BLOCKED] Issue description`
- `[CONFLICT] File ownership issue`
- `[DONE] All tasks complete, typecheck passed`

---

## Rollback Plan

If an agent's changes cause issues:
1. Git stash the agent's changes: `git stash push -m "Agent X WIP"`
2. Continue with other agents
3. Debug and fix the agent's plan
4. Re-apply: `git stash pop`

---

## Post-Refactor Tasks (Wave 2)

After all 6 agents complete:

1. **Remove backward compatibility stubs** (optional)
   - Delete re-export files
   - Update all imports to use new paths

2. **Create remaining feature modules**
   - `features/sidebar/` - Group sidebar views
   - `features/details-panel/`
   - `features/onboarding/`

3. **Services layer migration**
   - Move `lib/supabase/` → `services/supabase/`
   - Move `lib/commands/` → `services/commands/`

4. **API server refactor**
   - Split `api/server.ts` into modular routes
