# Agent 2: Organization Metadata Slice

## Overview

Extend the organization data management with job titles, workflow roles, and vault access mappings. This slice works alongside Agent 1's `organizationDataSlice` - you may either extend that slice or create a separate `organizationMetadataSlice` depending on what Agent 1 produces.

## Scope

| Feature | Source File | Current State | Target |
|---------|-------------|---------------|--------|
| Job Titles | `useJobTitles.ts` | `useState<JobTitle[]>` | Store slice |
| Workflow Roles | `useWorkflowRoles.ts` | `useState<WorkflowRoleBasic[]>`, `useState<Record<string, string[]>>` | Store slice |
| Vault Access | `useVaultAccess.ts` | `useState<Vault[]>`, `useState<Record<string, string[]>>` | Store slice or extend vaultsSlice |

## Implementation Steps

### Step 1: Determine Integration Strategy

Check what Agent 1 has created:
- If `organizationDataSlice` exists, extend it with metadata
- If not, create `organizationMetadataSlice` separately

### Step 2: Add State for Job Titles

```typescript
// State
jobTitles: JobTitle[]
jobTitlesLoading: boolean
jobTitlesLoaded: boolean

// Actions
setJobTitles: (titles: JobTitle[]) => void
setJobTitlesLoading: (loading: boolean) => void
addJobTitle: (title: JobTitle) => void
updateJobTitle: (id: string, updates: Partial<JobTitle>) => void
removeJobTitle: (id: string) => void
```

### Step 3: Add State for Workflow Roles

```typescript
// State
workflowRoles: WorkflowRoleBasic[]
workflowRolesLoading: boolean
workflowRolesLoaded: boolean
userRoleAssignments: Record<string, string[]>  // userId -> roleIds

// Actions
setWorkflowRoles: (roles: WorkflowRoleBasic[]) => void
setWorkflowRolesLoading: (loading: boolean) => void
setUserRoleAssignments: (assignments: Record<string, string[]>) => void
addWorkflowRole: (role: WorkflowRoleBasic) => void
updateWorkflowRole: (id: string, updates: Partial<WorkflowRoleBasic>) => void
removeWorkflowRole: (id: string) => void
assignUserRole: (userId: string, roleId: string) => void
unassignUserRole: (userId: string, roleId: string) => void
```

### Step 4: Add State for Vault Access

```typescript
// State (consider if this should go in vaultsSlice instead)
orgVaults: Vault[]  // All vaults in the organization
vaultAccessMap: Record<string, string[]>  // vaultId -> userIds
teamVaultAccessMap: Record<string, string[]>  // teamId -> vaultIds

// Actions
setOrgVaults: (vaults: Vault[]) => void
setVaultAccessMap: (map: Record<string, string[]>) => void
setTeamVaultAccessMap: (map: Record<string, string[]>) => void
grantUserVaultAccess: (userId: string, vaultId: string) => void
revokeUserVaultAccess: (userId: string, vaultId: string) => void
grantTeamVaultAccess: (teamId: string, vaultId: string) => void
revokeTeamVaultAccess: (teamId: string, vaultId: string) => void
```

### Step 5: Add Types

**Update:** `src/stores/types.ts`

```typescript
import type { JobTitle, WorkflowRoleBasic, Vault } from '../features/settings/organization/team-members/types'

export interface OrganizationMetadataSlice {
  // Job Titles
  jobTitles: JobTitle[]
  jobTitlesLoading: boolean
  jobTitlesLoaded: boolean
  setJobTitles: (titles: JobTitle[]) => void
  setJobTitlesLoading: (loading: boolean) => void
  addJobTitle: (title: JobTitle) => void
  updateJobTitle: (id: string, updates: Partial<JobTitle>) => void
  removeJobTitle: (id: string) => void
  
  // Workflow Roles
  workflowRoles: WorkflowRoleBasic[]
  workflowRolesLoading: boolean
  workflowRolesLoaded: boolean
  userRoleAssignments: Record<string, string[]>
  setWorkflowRoles: (roles: WorkflowRoleBasic[]) => void
  setWorkflowRolesLoading: (loading: boolean) => void
  setUserRoleAssignments: (assignments: Record<string, string[]>) => void
  addWorkflowRole: (role: WorkflowRoleBasic) => void
  updateWorkflowRole: (id: string, updates: Partial<WorkflowRoleBasic>) => void
  removeWorkflowRole: (id: string) => void
  assignUserRole: (userId: string, roleId: string) => void
  unassignUserRole: (userId: string, roleId: string) => void
  
  // Vault Access
  orgVaults: Vault[]
  vaultAccessMap: Record<string, string[]>
  teamVaultAccessMap: Record<string, string[]>
  setOrgVaults: (vaults: Vault[]) => void
  setVaultAccessMap: (map: Record<string, string[]>) => void
  setTeamVaultAccessMap: (map: Record<string, string[]>) => void
  grantUserVaultAccess: (userId: string, vaultId: string) => void
  revokeUserVaultAccess: (userId: string, vaultId: string) => void
  grantTeamVaultAccess: (teamId: string, vaultId: string) => void
  revokeTeamVaultAccess: (teamId: string, vaultId: string) => void
}
```

### Step 6: Update Hooks

**Update:** `src/features/settings/organization/team-members/hooks/useJobTitles.ts`
- Replace `useState<JobTitle[]>` with store selectors
- Update mutations to use store actions

**Update:** `src/features/settings/organization/team-members/hooks/useWorkflowRoles.ts`
- Replace both `useState` calls with store selectors
- Update mutations to use store actions

**Update:** `src/features/settings/organization/team-members/hooks/useVaultAccess.ts`
- Replace `useState` calls with store selectors
- Keep Supabase fetch logic but update store

### Step 7: Update Related Components

Ensure any components using these hooks get updated data:
- Job title assignment modals
- Workflow role assignment modals
- Vault access dialogs

## Files to Modify

| File | Action |
|------|--------|
| `src/stores/slices/organizationMetadataSlice.ts` | **Create** (or extend Agent 1's slice) |
| `src/stores/slices/index.ts` | Export new slice |
| `src/stores/types.ts` | Add types |
| `src/stores/pdmStore.ts` | Compose slice |
| `src/features/.../hooks/useJobTitles.ts` | Use store |
| `src/features/.../hooks/useWorkflowRoles.ts` | Use store |
| `src/features/.../hooks/useVaultAccess.ts` | Use store |
| Related modal/dialog components | Update imports if needed |

## Coordination with Other Agents

- **Agent 1**: May create the base `organizationDataSlice` - coordinate on whether to extend or create separate
- **Agent 4**: Working on workflows - ensure workflow roles don't conflict with workflow templates

## Testing Checklist

- [ ] Job titles load and display correctly
- [ ] Job title CRUD operations work
- [ ] Job title assignment to users works
- [ ] Workflow roles load and display
- [ ] Workflow role CRUD operations work
- [ ] User role assignments persist
- [ ] Vault access mappings load correctly
- [ ] Granting/revoking vault access works
- [ ] Team vault access works
- [ ] Data persists when switching settings tabs

## Report Generation

After completing this work, generate a report file at `.cursor/plans/zustand-agent-2-report.md` containing:
1. Summary of changes made
2. Integration decisions (extended vs separate slice)
3. Files created/modified with brief descriptions
4. Any issues encountered and how they were resolved
5. Testing results
6. Coordination notes with other agents
