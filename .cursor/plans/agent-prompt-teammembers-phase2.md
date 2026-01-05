# Agent Prompt: TeamMembersSettings Phase 2 - Final Cleanup

## Your Mission

Complete the remaining refactoring work on TeamMembersSettings to bring it to enterprise-level code quality. The previous agent reduced the file from 7,090 to 1,523 lines. Your job is to fix the remaining issues.

**Read the detailed analysis at:** `.cursor/plans/teammemberssettings_analysis_699b9251.plan.md`

---

## CRITICAL BOUNDARY RULES

### YOU MAY ONLY MODIFY THESE FILES:
- `src/features/settings/organization/TeamMembersSettings.tsx`
- `src/features/settings/organization/team-members/**` (all files in this folder)

### YOU MUST NOT TOUCH THESE FILES:
- `src/components/sidebar/WorkflowsView.tsx` ❌
- `src/components/sidebar/workflows/**` ❌
- `src/components/FileBrowser.tsx` ❌
- `src/features/file-browser/**` ❌
- Any store files (`src/stores/**`) ❌
- Any shared components (`src/components/shared/**`) ❌

If you need to modify anything outside your boundary, STOP and ask the user first.

---

## Priority Issues to Fix

### 1. CRITICAL: Extract Inline Supabase Callbacks (~120 lines)

**Location:** `TeamMembersSettings.tsx` lines 1371-1494

Three modals have inline async callbacks with direct Supabase calls:

**WorkflowRolesModal (lines 1371-1438):**
- `onSave` - saves user workflow role assignments
- `onUpdateRole` - updates workflow role
- `onDeleteRole` - deletes workflow role

**UserTeamsModal (lines 1448-1494):**
- `onSave` - updates user team memberships

**Fix approach:** Add these methods to existing hooks:
```typescript
// In useWorkflowRoles.ts, add:
saveUserWorkflowRoles: (userId: string, roleIds: string[]) => Promise<boolean>

// In useMembers.ts, add:
saveUserTeams: (userId: string, teamIds: string[]) => Promise<boolean>
```

Then use them in the main component instead of inline callbacks.

### 2. HIGH: Fix UsersTab Inline Supabase Call

**Location:** `team-members/tabs/UsersTab.tsx` line 268-275

```typescript
// Current (BAD):
onClick={async () => {
  await supabase.from('pending_org_members').delete().eq('id', pm.id)
  // ...
}}

// Fix: Use the existing deletePendingMember from useInvites hook
// Pass it as a prop to UsersTab
```

### 3. HIGH: Decide on useTeamMembersHandlers Hook

**File:** `team-members/hooks/useTeamMembersHandlers.ts` (619 lines)

This hook was created but is **NOT USED** anywhere. Options:
- **Option A:** Delete it (recommended if main component handlers work fine)
- **Option B:** Refactor main component to use it

**Recommendation:** Delete it. The individual hooks (useTeams, useMembers, etc.) already provide the necessary functions.

### 4. MEDIUM: Remove Duplicate resetTeamForm

Defined in THREE places:
1. `TeamMembersSettings.tsx` line 329
2. `useTeamDialogs.ts` (returned from hook)
3. `useTeamMembersHandlers.ts`

**Fix:** Use only the one from `useTeamDialogs` hook.

### 5. MEDIUM: Move Helper Functions to utils.ts

Move from `TeamMembersSettings.tsx` to `team-members/utils.ts`:
- `pendingMemberToOrgUser` (lines 639-662)
- `getPendingMemberVaultAccessCount` (lines 665-689)

---

## Execution Order

### Phase 1: Add Missing Hook Methods
1. Add `saveUserWorkflowRoles` to `useWorkflowRoles.ts`
2. Add `saveUserTeams` to `useMembers.ts`
3. Run `npm run typecheck`

### Phase 2: Update Main Component
1. Replace WorkflowRolesModal inline callbacks with hook methods
2. Replace UserTeamsModal inline callbacks with hook methods
3. Remove duplicate `resetTeamForm` (use hook's version)
4. Run `npm run typecheck`

### Phase 3: Fix UsersTab
1. Add `onDeletePendingMember` prop to UsersTab interface
2. Pass `deletePendingMember` from useInvites as prop
3. Replace inline supabase call with prop callback
4. Run `npm run typecheck`

### Phase 4: Cleanup
1. Delete `useTeamMembersHandlers.ts` (or confirm with user first)
2. Move helper functions to `utils.ts`
3. Update exports in `index.ts` if needed
4. Run final `npm run typecheck`

---

## Verification After Each Step

```bash
npm run typecheck
```

Must pass with no errors before proceeding to next step.

---

## Code Patterns to Follow

### Adding to Existing Hook
```typescript
// In useWorkflowRoles.ts
const saveUserWorkflowRoles = useCallback(async (
  userId: string,
  roleIds: string[]
): Promise<boolean> => {
  if (!user) return false
  
  try {
    // Remove existing assignments
    await supabase
      .from('user_workflow_roles')
      .delete()
      .eq('user_id', userId)
    
    // Add new assignments
    if (roleIds.length > 0) {
      await supabase
        .from('user_workflow_roles')
        .insert(roleIds.map(roleId => ({
          user_id: userId,
          workflow_role_id: roleId,
          assigned_by: user.id
        })))
    }
    
    addToast('success', 'Updated workflow roles')
    await loadWorkflowRoles()
    return true
  } catch (err) {
    console.error('Failed to save workflow roles:', err)
    addToast('error', 'Failed to update workflow roles')
    return false
  }
}, [user, addToast, loadWorkflowRoles])

// Add to return statement
return {
  // ... existing
  saveUserWorkflowRoles
}
```

### Using Hook Method Instead of Inline Callback
```typescript
// Before (inline callback):
<WorkflowRolesModal
  onSave={async (roleIds) => {
    // 30 lines of supabase calls
  }}
/>

// After (using hook):
const { saveUserWorkflowRoles } = useWorkflowRoles(organization?.id ?? null)

<WorkflowRolesModal
  onSave={async (roleIds) => {
    const success = await saveUserWorkflowRoles(editingWorkflowRolesUser.id, roleIds)
    if (success) {
      setEditingWorkflowRolesUser(null)
    }
  }}
/>
```

---

## Expected Outcomes

| Metric | Current | After |
|--------|---------|-------|
| Main file lines | 1,523 | ~1,380 |
| Inline supabase calls in main | 3 modals | 0 |
| Unused hook files | 1 (619 lines) | 0 |
| Duplicate functions | 3 | 0 |

---

## DO NOT:
- Refactor unrelated code
- Add new features
- Touch files outside your boundary
- Skip running typecheck between phases
- Change the public API of existing hooks (only add new methods)
- Remove `@ts-nocheck` directives (that's a separate task)
