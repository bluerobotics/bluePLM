# Agent Prompts - Copy & Paste Ready

Use these prompts to start each agent in a separate Cursor window or Composer session.

---

## Agent 1: Core Components

```
You are Agent 1 in a multi-agent refactoring operation for BluePLM. Your exclusive mission is to extract core reusable UI components.

## YOUR FILES ONLY (do not touch anything else):
- src/components/Toast.tsx → Move to src/components/core/Toast/
- src/components/ErrorBoundary.tsx → Move to src/components/core/ErrorBoundary/
- CREATE: src/components/core/Loader/ (Spinner, loading states)
- CREATE: src/components/core/Dialog/ (base dialog, confirm dialog)
- CREATE: src/components/core/index.ts (barrel export)

## RULES:
1. Create re-export stubs at original file locations for backward compatibility
2. Use @/ import aliases for external imports
3. Follow existing Tailwind patterns (plm-bg, plm-fg, plm-border, plm-accent)
4. Run `npm run typecheck` after completing
5. No emoji unless explicitly in original code

## READ YOUR PLAN:
.cursor/plans/agent1-core-components.md

## START BY:
Reading src/components/Toast.tsx and src/components/ErrorBoundary.tsx to understand current implementation.
```

---

## Agent 2: Shared Components

```
You are Agent 2 in a multi-agent refactoring operation for BluePLM. Your exclusive mission is to organize shared smart components.

## YOUR FILES ONLY (do not touch anything else):
- src/components/shared/ → Reorganize into subfolders
- src/components/OnlineUsersIndicator.tsx → Move to shared/OnlineUsers/
- src/components/ImpersonationBanner.tsx → Move to shared/ImpersonationBanner/
- src/components/LanguageSelector.tsx → Move to shared/LanguageSelector/
- src/components/SystemStats.tsx → Move to shared/SystemStats/
- CREATE: src/components/shared/Avatar/ (extract avatar pattern from codebase)

## RULES:
1. Create re-export stubs at original locations for backward compatibility
2. Each component gets its own folder with index.ts
3. Create barrel export at src/components/shared/index.ts
4. Use @/ import aliases
5. Run `npm run typecheck` after completing

## READ YOUR PLAN:
.cursor/plans/agent2-shared-components.md

## START BY:
Listing contents of src/components/shared/ to see current state.
```

---

## Agent 3: Seasonal Effects Feature

```
You are Agent 3 in a multi-agent refactoring operation for BluePLM. Your exclusive mission is to create the seasonal-effects feature module.

## YOUR FILES ONLY (do not touch anything else):
- src/components/ChristmasEffects.tsx → Move to features/seasonal-effects/components/
- src/components/HalloweenEffects.tsx → Move to features/seasonal-effects/components/
- src/components/WeatherEffects.tsx → Move to features/seasonal-effects/components/
- src/lib/weather.ts → Move to features/seasonal-effects/utils/
- src/lib/snowPhysics.ts → Move to features/seasonal-effects/utils/
- CREATE: src/features/seasonal-effects/ (complete feature module structure)

## RULES:
1. Create re-export stubs at original locations for backward compatibility
2. Use relative imports within the feature module
3. Use @/ for imports from outside the feature
4. Preserve ALL animation and physics logic exactly as-is
5. Create types.ts, constants.ts, hooks/, utils/ in the feature
6. Run `npm run typecheck` after completing
7. Visual test: Set theme to 'christmas' or 'halloween' to verify effects work

## READ YOUR PLAN:
.cursor/plans/agent3-seasonal-effects.md

## START BY:
Creating the src/features/seasonal-effects/ directory structure, then reading existing effect components.
```

---

## Agent 4: Lib Utils Reorganization

```
You are Agent 4 in a multi-agent refactoring operation for BluePLM. Your exclusive mission is to reorganize lib utilities into a clean structure.

## YOUR FILES ONLY (do not touch anything else):
- src/lib/utils.ts → Split into src/lib/utils/ folder
- src/lib/clipboard.ts → Clean up, add JSDoc
- src/lib/analytics.ts → Clean up, add JSDoc
- CREATE: src/lib/utils/date.ts (date formatting utilities)
- CREATE: src/lib/utils/string.ts (string manipulation)
- CREATE: src/lib/utils/path.ts (platform-aware path utilities)
- CREATE: src/lib/utils/format.ts (file size, number formatting)
- CREATE: src/lib/utils/validation.ts (input validation)
- CREATE: src/lib/utils/index.ts (barrel export)

## DO NOT TOUCH:
- src/lib/supabase/ (separate agent later)
- src/lib/commands/ (separate agent later)
- src/lib/i18n/ (already organized)
- src/lib/weather.ts (Agent 3's file)
- src/lib/snowPhysics.ts (Agent 3's file)
- src/lib/backup.ts, src/lib/workflows.ts, src/lib/realtime.ts (business logic)

## RULES:
1. Pure utilities ONLY - no side effects, no API calls, no store access
2. Add JSDoc comments to all exported functions
3. Re-export from original utils.ts for backward compatibility
4. Path utilities must work on both Windows and Mac
5. Run `npm run typecheck` after completing

## READ YOUR PLAN:
.cursor/plans/agent4-lib-utils.md

## START BY:
Reading src/lib/utils.ts to audit existing utility functions.
```

---

## Agent 5: FileBrowser Decomposition

```
You are Agent 5 in a multi-agent refactoring operation for BluePLM. Your exclusive mission is to decompose the massive FileBrowser.tsx into a clean feature module.

⚠️ THIS IS THE LARGEST REFACTOR - Work in phases, test after each phase.

## YOUR FILES ONLY (do not touch anything else):
- src/components/FileBrowser.tsx (~7000 lines) → Split into features/file-browser/
- src/components/file-browser/ → Move and expand into features/file-browser/
- CREATE: src/features/file-browser/ (complete feature module)

## TARGET STRUCTURE:
features/file-browser/
├── components/
│   ├── FileBrowser.tsx (main, ~400 lines MAX)
│   ├── FileList/ (list view components)
│   ├── FileGrid/ (grid view components)
│   ├── ColumnHeaders/
│   ├── Toolbar/
│   ├── States/ (Empty, Loading, Error)
│   └── Dialogs/ (Rename, Delete, Move, etc.)
├── hooks/ (existing + new)
├── utils/ (sorting, filtering, selection)
├── types.ts
├── constants.ts
└── index.ts

## RULES:
1. Work in PHASES - don't try to do everything at once
2. Test after each phase - ensure file browser still works
3. Preserve ALL functionality - selection, drag-drop, context menu, keyboard nav
4. Build on existing hooks in file-browser/hooks/
5. Run `npm run typecheck` after each phase
6. Create re-export stub at src/components/FileBrowser.tsx

## READ YOUR PLAN:
.cursor/plans/agent5-filebrowser-split.md

## START BY:
Reading the first 200 lines of src/components/FileBrowser.tsx to understand imports and structure.
Work in phases:
1. Create directory structure
2. Move existing helpers
3. Extract utilities
4. Extract hooks
5. Extract components
6. Rewrite main FileBrowser
7. Create exports
```

---

## Agent 6: Settings Reorganization

```
You are Agent 6 in a multi-agent refactoring operation for BluePLM. Your exclusive mission is to reorganize 30+ settings files into domain groups.

## YOUR FILES ONLY (do not touch anything else):
- src/components/settings/ (all files) → Move to features/settings/{domain}/
- src/components/SettingsContent.tsx → Move to features/settings/components/
- src/components/sidebar/SettingsNavigation.tsx → Move to features/settings/components/
- CREATE: src/features/settings/ (complete feature module)

## DOMAIN GROUPINGS:
- account/: AccountSettings, ProfileSettings, UserProfileModal, DeleteAccountSettings, KeybindingsSettings, PreferencesSettings
- organization/: CompanyProfileSettings, VaultsSettings, ModulesSettings, team-members/, MetadataColumnsSettings, AuthProvidersSettings, PermissionsEditor
- integrations/: ApiSettings, WebhooksSettings, GoogleDriveSettings, SolidWorksSettings, OdooSettings, SlackSettings, WooCommerceSettings
- system/: PerformanceSettings, DevToolsSettings, LogsSettings, BackupSettings, ExportSettings, SerializationSettings, RFQSettings, SupabaseSettings, RecoveryCodeSettings, AboutSettings, ContributionHistory

## RULES:
1. Create re-export stubs at original locations
2. Keep team-members/ folder structure intact (it's already well organized)
3. Watch for circular dependencies between settings files
4. Check for exported utility functions (like getEffectiveExportSettings)
5. Update SettingsContent.tsx to import from new locations
6. Run `npm run typecheck` after completing

## READ YOUR PLAN:
.cursor/plans/agent6-settings-reorg.md

## START BY:
Listing all files in src/components/settings/ to get full inventory of files to move.
```

---

## Starting Multiple Agents

### Option A: Multiple Cursor Windows
1. Open 6 separate Cursor windows, all pointed at the same workspace
2. Copy each agent prompt into a separate Composer session
3. Let them run in parallel

### Option B: Sequential with Git Branches
1. Create a branch for each agent: `git checkout -b refactor/agent1-core`
2. Run agent prompt
3. Commit changes
4. Repeat for each agent
5. Merge all branches

### Option C: Cursor Background Agents
If using Cursor's background agent feature:
1. Start Agent 5 first (longest task)
2. Start Agents 1-4 and 6 simultaneously
3. Monitor progress in background agent panel

---

## Verification After All Agents Complete

```bash
# Run typecheck
npm run typecheck

# Start the app
npm run dev

# Test checklist:
# - [ ] App starts without errors
# - [ ] File browser list view works
# - [ ] File browser grid view works
# - [ ] Selection and drag-drop work
# - [ ] Context menu works
# - [ ] Settings pages all accessible
# - [ ] Christmas effects work (set theme to christmas)
# - [ ] Halloween effects work (set theme to halloween)
# - [ ] Toast notifications work
# - [ ] Dialogs open and close
```
