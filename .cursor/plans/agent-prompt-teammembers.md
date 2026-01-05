# Agent Prompt: TeamMembersSettings Refactoring

## Your Mission

You are refactoring `src/features/settings/organization/TeamMembersSettings.tsx` from 7,090 lines and 133 useState calls down to ~1,500 lines and ~20 useState calls.

**Read the detailed plan at:** `.cursor/plans/teammemberssettings_refactor_3f5e5591.plan.md`

---

## CRITICAL BOUNDARY RULES

### YOU MAY ONLY MODIFY THESE FILES:
- `src/features/settings/organization/TeamMembersSettings.tsx`
- `src/features/settings/organization/team-members/**` (all files in this folder)

### YOU MUST NOT TOUCH THESE FILES (another agent is working on them):
- `src/components/sidebar/WorkflowsView.tsx` ❌
- `src/components/sidebar/workflows/**` ❌
- `src/components/FileBrowser.tsx` ❌
- `src/features/file-browser/**` ❌
- Any store files (`src/stores/**`) ❌
- Any shared components (`src/components/shared/**`) ❌

If you need to modify anything outside your boundary, STOP and ask the user first.

---

## Current State

1. **6 hooks already exist but are NOT being imported:**
   - `src/features/settings/organization/team-members/hooks/useTeams.ts`
   - `src/features/settings/organization/team-members/hooks/useMembers.ts`
   - `src/features/settings/organization/team-members/hooks/useInvites.ts`
   - `src/features/settings/organization/team-members/hooks/useWorkflowRoles.ts`
   - `src/features/settings/organization/team-members/hooks/useJobTitles.ts`
   - `src/features/settings/organization/team-members/hooks/useVaultAccess.ts`

2. **Types already extracted:** `src/features/settings/organization/team-members/types.ts`

3. **Component files already exist (verify they match inline code):**
   - `CreateUserDialog.tsx`, `RemoveUserDialog.tsx`, `TeamFormDialog.tsx`
   - `TeamMembersDialog.tsx`, `TeamModulesDialog.tsx`, `UserRow.tsx`
   - `UserTeamsModal.tsx`, `ViewNetPermissionsModal.tsx`, `WorkflowRolesModal.tsx`

---

## Execution Order

### Phase 1: Integrate Existing Hooks (do this first!)
1. Add imports from `./team-members/hooks`
2. Call each hook at the top of the component
3. Delete the redundant useState calls that the hooks replace
4. Run `npm run typecheck` after each hook integration

### Phase 2: Create New Hooks
Create these in `src/features/settings/organization/team-members/hooks/`:
- `useTeamDialogs.ts` - team dialog state (~8 useState)
- `useUserDialogs.ts` - user dialog state (~8 useState)
- `useWorkflowRoleDialogs.ts` - workflow role dialogs (~5 useState)
- `useJobTitleDialogs.ts` - job title dialogs (~9 useState)
- `useOrgCode.ts` - org code state (~3 useState)
- `useUIState.ts` - UI toggle state (~8 useState)

Update `hooks/index.ts` to export new hooks.

### Phase 3: Extract Tab Components
Create `src/features/settings/organization/team-members/tabs/`:
- `UsersTab.tsx`
- `TeamsTab.tsx`
- `RolesTab.tsx`
- `TitlesTab.tsx`
- `index.ts`

### Phase 4: Final Cleanup
- Move utility functions to `utils.ts`
- Run final `npm run typecheck`
- Verify all 4 tabs work correctly

---

## Verification After Each Step
```bash
npm run typecheck
```
Must pass with no errors before proceeding to next step.

---

## Important Patterns

When integrating hooks, use this pattern:
```typescript
// Before (remove these):
const [teams, setTeams] = useState<TeamWithDetails[]>([])
const [isLoading, setIsLoading] = useState(true)
// ... many more useState calls

// After (add this):
import { useTeams } from './team-members/hooks'
const { teams, isLoading, createTeam, updateTeam, deleteTeam, loadTeams } = useTeams(organization?.id)
```

The hooks use the SAME variable names as the existing useState calls, so the rest of the code should work after removing the useState declarations.

---

## DO NOT:
- Refactor unrelated code
- "Improve" code that isn't part of the plan
- Touch any files outside your boundary
- Create new abstractions not in the plan
- Skip running typecheck between phases
