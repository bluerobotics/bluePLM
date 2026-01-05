# TeamMembersSettings Phase 3 - Final Extraction

## Your Mission

Complete the final extraction of `TeamMembersSettings.tsx` to achieve true enterprise-level separation of concerns. The previous agents reduced it from 7,090 to 1,393 lines. Your job is to reduce it to ~600 lines.

---

## CRITICAL BOUNDARY RULES

### YOU MAY ONLY MODIFY:
- `src/features/settings/organization/TeamMembersSettings.tsx`
- `src/features/settings/organization/team-members/**`

### YOU MUST NOT TOUCH:
- `src/stores/**`
- `src/components/**`
- `src/lib/**`
- Any files outside the above paths

---

## Current Problems

### Problem 1: Inline Supabase Call (Line 340)

```typescript
// BAD: Supabase call directly in component
const handleSetDefaultTeam = async (teamId: string | null) => {
  const { error } = await supabase
    .from('organizations')
    .update({ default_new_user_team_id: teamId })
    .eq('id', organization.id)
```

**All data operations should be in hooks, not components.**

### Problem 2: 30 Handler Functions (Lines 248-668, ~400 lines)

The component has 30 handler wrapper functions that follow the same pattern:
1. Set loading state
2. Call hook method
3. Handle success (close dialog, reset form, refresh data)
4. Handle error
5. Clear loading state

Example pattern repeated 30 times:
```typescript
const handleCreateTeam = async () => {
  setIsSavingTeam(true)
  try {
    const success = await hookCreateTeam(teamFormData, copyFromTeamId)
    if (success) {
      setShowCreateTeamDialog(false)
      resetTeamForm()
      loadTeamVaultAccess()
    }
  } finally {
    setIsSavingTeam(false)
  }
}
```

### Problem 3: Dialog Section (Lines 1015-1387, 372 lines)

20 conditional dialog renders taking 372 lines of pure JSX:
```tsx
{showCreateTeamDialog && <TeamFormDialog ... />}
{showEditTeamDialog && selectedTeam && <TeamFormDialog ... />}
{showDeleteTeamDialog && selectedTeam && <DeleteTeamDialog ... />}
// ... 17 more dialogs
```

---

## Tasks (Execute in Order)

### Task 1: Move `setDefaultTeam` to useTeams Hook

**File:** `src/features/settings/organization/team-members/hooks/useTeams.ts`

Add new method to existing hook:

```typescript
const setDefaultTeam = useCallback(async (
  teamId: string | null,
  organizationId: string,
  setOrganization: (org: any) => void,
  organization: any
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('organizations')
      .update({ default_new_user_team_id: teamId })
      .eq('id', organizationId)
    
    if (error) throw error
    
    setOrganization({
      ...organization,
      default_new_user_team_id: teamId
    })
    
    const teamName = teamId ? teams.find(t => t.id === teamId)?.name : 'None'
    addToast('success', `Default team set to "${teamName}"`)
    return true
  } catch (err) {
    console.error('Failed to set default team:', err)
    addToast('error', 'Failed to update default team')
    return false
  }
}, [teams, addToast])

// Add to return statement
return {
  // ... existing
  setDefaultTeam
}
```

**In TeamMembersSettings.tsx**, replace the inline handler:
```typescript
// Before (remove):
const handleSetDefaultTeam = async (teamId: string | null) => { ... 27 lines ... }

// After (use hook):
const handleSetDefaultTeam = async (teamId: string | null) => {
  setIsSavingDefaultTeam(true)
  try {
    await hookSetDefaultTeam(teamId, organization.id, setOrganization, organization)
  } finally {
    setIsSavingDefaultTeam(false)
  }
}
```

**Run:** `npm run typecheck`

---

### Task 2: Create useHandlers Hook

**Create:** `src/features/settings/organization/team-members/hooks/useHandlers.ts`

This hook consolidates all 30 handler functions. It takes all the state setters and hook methods as parameters and returns handler functions.

```typescript
/**
 * useHandlers - Consolidates all handler functions for TeamMembersSettings
 * 
 * This hook encapsulates the orchestration logic between UI state and data hooks.
 * It handles loading states, success/error flows, and dialog management.
 */
import { useCallback } from 'react'
import type { OrgUser, TeamWithDetails, PendingMember } from '../types'

export interface UseHandlersParams {
  // Data hook methods
  hookCreateTeam: (formData: any, copyFromTeamId?: string | null) => Promise<boolean>
  hookUpdateTeam: (teamId: string, formData: any) => Promise<boolean>
  hookDeleteTeam: (teamId: string) => Promise<boolean>
  hookSetDefaultTeam: (teamId: string | null, orgId: string, setOrg: any, org: any) => Promise<boolean>
  // ... all other hook methods
  
  // UI state setters
  setIsSavingTeam: (v: boolean) => void
  setShowCreateTeamDialog: (v: boolean) => void
  // ... all other setters
  
  // Form data
  teamFormData: any
  resetTeamForm: () => void
  // ... other form data
  
  // Refresh functions
  loadTeams: () => Promise<void>
  loadOrgUsers: () => Promise<void>
  loadTeamVaultAccess: () => Promise<void>
  // ... other loaders
}

export function useHandlers(params: UseHandlersParams) {
  const {
    hookCreateTeam, hookUpdateTeam, hookDeleteTeam,
    setIsSavingTeam, setShowCreateTeamDialog, setSelectedTeam,
    teamFormData, resetTeamForm, loadTeamVaultAccess,
    // ... destructure all params
  } = params

  // Team handlers
  const handleCreateTeam = useCallback(async () => {
    if (!teamFormData.name.trim()) return
    setIsSavingTeam(true)
    try {
      const success = await hookCreateTeam(teamFormData, copyFromTeamId)
      if (success) {
        setShowCreateTeamDialog(false)
        resetTeamForm()
        loadTeamVaultAccess()
      }
    } finally {
      setIsSavingTeam(false)
    }
  }, [teamFormData, hookCreateTeam, ...])

  const handleUpdateTeam = useCallback(async () => { ... }, [...])
  const handleDeleteTeam = useCallback(async () => { ... }, [...])
  
  // ... all 30 handlers

  return {
    // Team handlers
    handleCreateTeam,
    handleUpdateTeam,
    handleDeleteTeam,
    handleDeleteTeamDirect,
    handleUpdateTeamFromManage,
    handleSetDefaultTeam,
    openEditTeamDialog,
    openTeamVaultAccessDialog,
    openModulesDialog,
    handleSaveTeamVaultAccess,
    
    // User handlers
    handleRemoveUser,
    handleRemoveFromTeam,
    executeRemoveFromTeam,
    handleToggleTeam,
    handleToggleWorkflowRole,
    handleChangeJobTitle,
    openVaultAccessEditor,
    handleSaveVaultAccess,
    
    // Workflow role handlers
    handleCreateWorkflowRole,
    handleUpdateWorkflowRole,
    handleDeleteWorkflowRole,
    
    // Job title handlers
    handleCreateTitle,
    handleUpdateJobTitle,
    handleDeleteJobTitle,
    openCreateTitleDialog,
    openEditJobTitle,
    openCreateJobTitle,
    updateJobTitleDirect,
    deleteJobTitleDirect,
    
    // Pending member handlers
    handleSavePendingMember,
    handleResendInvite,
    
    // Data refresh
    loadAllData
  }
}
```

**Update:** `src/features/settings/organization/team-members/hooks/index.ts`
```typescript
export { useHandlers, type UseHandlersParams } from './useHandlers'
```

**In TeamMembersSettings.tsx**, replace 400 lines with:
```typescript
const handlers = useHandlers({
  // Pass all required params
  hookCreateTeam, hookUpdateTeam, hookDeleteTeam,
  setIsSavingTeam, setShowCreateTeamDialog,
  teamFormData, resetTeamForm, loadTeamVaultAccess,
  // ... all params
})

const {
  handleCreateTeam, handleUpdateTeam, handleDeleteTeam,
  // ... destructure all handlers
} = handlers
```

**Run:** `npm run typecheck`

---

### Task 3: Create TeamMembersDialogs Component

**Create:** `src/features/settings/organization/team-members/components/TeamMembersDialogs.tsx`

Extract the 372-line dialog section:

```typescript
/**
 * TeamMembersDialogs - Renders all dialogs for TeamMembersSettings
 * 
 * This component handles conditional rendering of 20+ dialogs
 * based on UI state.
 */
import {
  TeamFormDialog,
  DeleteTeamDialog,
  EditPendingMemberDialog,
  // ... all dialog imports
} from './index'
import { UserProfileModal } from '../../account/UserProfileModal'
import { PermissionsEditor } from '../PermissionsEditor'
import { ModulesEditor } from '../ModulesEditor'

export interface TeamMembersDialogsProps {
  // Dialog visibility state
  showCreateTeamDialog: boolean
  showEditTeamDialog: boolean
  showDeleteTeamDialog: boolean
  showTeamMembersDialog: boolean
  showTeamVaultAccessDialog: boolean
  showPermissionsEditor: boolean
  showModulesDialog: boolean
  showCreateUserDialog: boolean
  showCreateWorkflowRoleDialog: boolean
  showEditWorkflowRoleDialog: boolean
  showCreateTitleDialog: boolean
  
  // Selected entities
  selectedTeam: TeamWithDetails | null
  editingPendingMember: PendingMember | null
  editingTeamFromManage: TeamWithDetails | null
  removingUser: OrgUser | null
  removingFromTeam: { user: OrgUser; teamId: string; teamName: string } | null
  editingWorkflowRole: WorkflowRoleBasic | null
  editingPermissionsUser: OrgUser | null
  editingVaultAccessUser: OrgUser | null
  viewingUserId: string | null
  viewingPermissionsUser: OrgUser | null
  viewingPendingMemberPermissions: PendingMember | null
  addToTeamUser: OrgUser | null
  editingWorkflowRolesUser: OrgUser | null
  editingTeamsUser: OrgUser | null
  editingJobTitleUser: OrgUser | null
  editingJobTitle: JobTitle | null
  pendingTitleForUser: OrgUser | null
  
  // Data
  teams: TeamWithDetails[]
  orgUsers: OrgUser[]
  workflowRoles: WorkflowRoleBasic[]
  jobTitles: JobTitle[]
  orgVaults: Vault[]
  userWorkflowRoleAssignments: Record<string, string[]>
  teamVaultAccessMap: Record<string, string[]>
  
  // Form data
  teamFormData: TeamFormData
  setTeamFormData: (data: TeamFormData) => void
  workflowRoleFormData: WorkflowRoleFormData
  setWorkflowRoleFormData: (data: WorkflowRoleFormData) => void
  pendingMemberForm: PendingMemberFormData
  setPendingMemberForm: (data: PendingMemberFormData) => void
  pendingTeamVaultAccess: string[]
  setPendingTeamVaultAccess: (ids: string[]) => void
  pendingVaultAccess: string[]
  setPendingVaultAccess: (ids: string[]) => void
  newTitleName: string
  setNewTitleName: (v: string) => void
  newTitleColor: string
  setNewTitleColor: (v: string) => void
  newTitleIcon: string
  setNewTitleIcon: (v: string) => void
  copyFromTeamId: string | null
  setCopyFromTeamId: (id: string | null) => void
  
  // Loading states
  isSavingTeam: boolean
  isSavingPendingMember: boolean
  isSavingTeamVaultAccess: boolean
  isSavingVaultAccess: boolean
  isRemoving: boolean
  isRemovingFromTeam: boolean
  isSavingWorkflowRole: boolean
  isCreatingTitle: boolean
  
  // Handlers
  handlers: ReturnType<typeof useHandlers>
  
  // Close handlers
  onCloseTeamDialog: () => void
  onCloseUserDialog: () => void
  // ... all close handlers
  
  // Other
  organization: any
  user: any
  isAdmin: boolean
}

export function TeamMembersDialogs(props: TeamMembersDialogsProps) {
  const { ... } = props

  return (
    <>
      {/* Create Team Dialog */}
      {showCreateTeamDialog && (
        <TeamFormDialog ... />
      )}

      {/* Edit Team Dialog */}
      {showEditTeamDialog && selectedTeam && (
        <TeamFormDialog ... />
      )}

      {/* ... all 20 dialogs ... */}
    </>
  )
}
```

**Update:** `src/features/settings/organization/team-members/components/index.ts`
```typescript
export { TeamMembersDialogs, type TeamMembersDialogsProps } from './TeamMembersDialogs'
```

**In TeamMembersSettings.tsx**, replace 372 lines with:
```typescript
<TeamMembersDialogs
  showCreateTeamDialog={showCreateTeamDialog}
  selectedTeam={selectedTeam}
  // ... all props
  handlers={handlers}
/>
```

**Run:** `npm run typecheck`

---

### Task 4: Update Main Component

After Tasks 1-3, `TeamMembersSettings.tsx` should be reduced to:

```typescript
// ~50 lines: Imports
// ~100 lines: Hook calls (data + UI state + handlers)
// ~50 lines: Computed values
// ~5 lines: Early return for no organization
// ~350 lines: Main render (header, tabs, search, tab content)
// ~50 lines: DialogsManager component
// Total: ~600 lines
```

**Final structure:**
```typescript
export function TeamMembersSettings() {
  // Store
  const { user, organization, ... } = usePDMStore()
  
  // Data hooks
  const { teams, ... } = useTeams(organization?.id)
  const { members, ... } = useMembers(organization?.id)
  // ... other data hooks
  
  // UI state hooks
  const teamDialogs = useTeamDialogs()
  const userDialogs = useUserDialogs()
  // ... other UI hooks
  
  // Handlers hook (consolidates 30 functions)
  const handlers = useHandlers({ ... })
  
  // Computed data
  const { filteredTeams, filteredAllUsers } = useFilteredData({ ... })
  
  if (!organization) return <NoOrgMessage />
  
  return (
    <div>
      {/* Header */}
      {/* Tab Navigation */}
      {/* Search */}
      {/* Tab Content */}
      
      {/* All Dialogs */}
      <TeamMembersDialogs {...dialogProps} handlers={handlers} />
    </div>
  )
}
```

---

## File Changes Summary

| File | Action | Lines |
|------|--------|-------|
| `hooks/useTeams.ts` | Add `setDefaultTeam` method | +30 |
| `hooks/useHandlers.ts` | **CREATE** - consolidate 30 handlers | +400 |
| `hooks/index.ts` | Add export | +1 |
| `components/TeamMembersDialogs.tsx` | **CREATE** - dialog section | +400 |
| `components/index.ts` | Add export | +1 |
| `TeamMembersSettings.tsx` | Remove handlers + dialogs | -800 |

**Net result:** Main file drops from 1,393 to ~600 lines.

---

## Verification

After each task:
```bash
npm run typecheck
```

After Task 4, manually test:
- All 4 tabs render correctly
- Create/edit/delete team works
- Create/edit/delete user works
- All modals open and close
- All inline dropdowns work

---

## DO NOT:
- Modify any business logic
- Change any Supabase queries (except moving them)
- Touch files outside the boundary
- Add new features
- Skip typecheck between tasks
