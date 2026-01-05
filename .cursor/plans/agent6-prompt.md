# Agent 6: FileBrowser Decomposition Completion

## Your Mission

Complete the FileBrowser decomposition that Agent 5 started but did not finish. Follow the plan file:

**Plan File:** `.cursor/plans/filebrowser_completion_plan_669ab379.plan.md`

Read this plan file thoroughly before starting.

---

## Context

Agent 5 reduced `src/components/FileBrowser.tsx` from ~7,000 lines to **2,758 lines** and created a comprehensive feature module at `src/features/file-browser/`. However, they stopped before completing phases 3-7 of the original plan.

**Current state:**
- FileBrowser.tsx: 2,758 lines (target: ~2,000)
- 2 TypeScript errors that must be fixed first
- 5 phases of work remaining

---

## CRITICAL: Fix TypeScript Errors First

Before doing anything else, fix these two errors:

```typescript
// Line 12 - Remove this unused import
import { copyToClipboard } from '../lib/clipboard'

// Line 2358 - Fix type coercion
isSearching={isSearching}  →  isSearching={!!isSearching}
```

Run `npm run typecheck` - it MUST pass before proceeding.

---

## Phases to Complete

| Phase | Task | Key Files |
|-------|------|-----------|
| 3 | Extract `moveFilesToFolder` to useFileOperations | `hooks/useFileOperations.ts` |
| 4 | Extract drag handlers to useDragState | `hooks/useDragState.ts` |
| 5 | Extract FileGridView component | Create `components/FileGrid/FileGridView.tsx` |
| 6 | Move helper functions to utils | `utils/fileStatus.ts`, create `utils/keybindings.ts` |
| 7 | Extract handleAddFiles/handleAddFolder | Create `hooks/useAddFiles.ts` |

---

## Key Files

**Main component to reduce:**
- `src/components/FileBrowser.tsx`

**Feature module (where extracted code goes):**
- `src/features/file-browser/hooks/` - Hooks
- `src/features/file-browser/components/` - Components
- `src/features/file-browser/utils/` - Utilities
- `src/features/file-browser/index.ts` - Barrel exports

**Existing hooks to extend:**
- `src/features/file-browser/hooks/useFileOperations.ts` - Add moveFilesToFolder
- `src/features/file-browser/hooks/useDragState.ts` - Add drag handlers

---

## Execution Order

1. **Read the plan file** - Understand the full scope
2. **Fix TypeScript errors** - Lines 12 and 2358
3. **Run typecheck** - Must pass
4. **Phase 3** - Extract moveFilesToFolder (~90 lines)
5. **Run typecheck** - Must pass
6. **Phase 4** - Extract drag handlers (~60 lines)
7. **Run typecheck** - Must pass
8. **Phase 5** - Extract FileGridView (~30 lines)
9. **Run typecheck** - Must pass
10. **Phase 6** - Move helper functions (~50 lines)
11. **Run typecheck** - Must pass
12. **Phase 7** - Extract add files handlers (~180 lines)
13. **Run typecheck** - Must pass
14. **Update all barrel exports** - index.ts files
15. **Final verification** - Test all functionality

---

## Rules

1. **One phase at a time** - Complete and verify before moving on
2. **Typecheck after each phase** - `npm run typecheck` must pass
3. **Update exports** - After creating files, update index.ts barrels
4. **Preserve functionality** - Every feature must still work
5. **No `any` types** - Keep TypeScript strict
6. **Follow existing patterns** - Look at how other hooks are structured

---

## Verification After Each Phase

- [ ] `npm run typecheck` passes
- [ ] No console errors on app load
- [ ] The specific feature you extracted still works

---

## Start Now

```bash
# 1. Read the plan
cat .cursor/plans/filebrowser_completion_plan_669ab379.plan.md

# 2. Fix TypeScript errors in FileBrowser.tsx

# 3. Verify
npm run typecheck

# 4. Begin Phase 3...
```

**Take it slow. One phase at a time. Test after each extraction.**
