# Team Members Settings Module

This module contains all components, hooks, and utilities for managing organization members, teams, workflow roles, and job titles in BluePLM's Settings page.

## Directory Structure

```
team-members/
├── components/               # UI components organized by category
│   ├── dialogs/              # Form dialogs (create/edit operations)
│   │   ├── DeleteTeamDialog.tsx
│   │   ├── EditPendingMemberDialog.tsx
│   │   ├── JobTitleFormDialog.tsx
│   │   ├── TeamFormDialog.tsx
│   │   ├── WorkflowRoleFormDialog.tsx
│   │   └── index.ts
│   ├── modals/               # Selection/assignment modals
│   │   ├── AddToTeamModal.tsx
│   │   ├── UserJobTitleModal.tsx
│   │   ├── UserTeamsModal.tsx
│   │   ├── ViewNetPermissionsModal.tsx
│   │   ├── WorkflowRolesModal.tsx
│   │   └── index.ts
│   ├── team/                 # Team-specific components
│   │   ├── TeamMembersDialog.tsx
│   │   ├── TeamModulesDialog.tsx
│   │   ├── TeamVaultAccessDialog.tsx
│   │   └── index.ts
│   ├── user/                 # User-specific components
│   │   ├── CreateUserDialog.tsx
│   │   ├── RemoveFromAdminsDialog.tsx
│   │   ├── RemoveUserDialog.tsx
│   │   ├── UserPermissionsDialog.tsx
│   │   ├── UserRow.tsx
│   │   ├── UserVaultAccessDialog.tsx
│   │   └── index.ts
│   ├── TeamDialogs.tsx        # Self-contained team dialog group
│   ├── UserDialogs.tsx        # Self-contained user dialog group
│   ├── WorkflowRoleDialogs.tsx  # Self-contained role dialog group
│   ├── JobTitleDialogs.tsx    # Self-contained title dialog group
│   ├── TeamMembersDialogs.tsx # Legacy consolidated dialog renderer
│   └── index.ts
├── context/                  # React Context for state management
│   ├── TeamMembersContext.tsx # Main provider and consumer hook
│   └── index.ts
├── hooks/                    # React hooks (modular architecture)
│   ├── handlers/             # Domain-specific handler hooks
│   │   ├── useTeamHandlers.ts
│   │   ├── useUserHandlers.ts
│   │   ├── useWorkflowRoleHandlers.ts
│   │   ├── useJobTitleHandlers.ts
│   │   ├── usePendingMemberHandlers.ts
│   │   └── index.ts
│   ├── supabaseHelpers.ts    # Typed Supabase wrappers
│   ├── useFilteredData.ts    # Memoized filtered/computed data
│   ├── useHandlers.ts        # Composed handler orchestration
│   ├── useInvites.ts         # Pending member management
│   ├── useJobTitleDialogs.ts # Job title dialog state
│   ├── useJobTitles.ts       # Job title CRUD operations
│   ├── useMembers.ts         # Organization member management
│   ├── useOrgCode.ts         # Organization code display
│   ├── useTeamDialogs.ts     # Team dialog state
│   ├── useTeams.ts           # Team CRUD operations
│   ├── useUIState.ts         # General UI state (tabs, search)
│   ├── useUserDialogs.ts     # User dialog state
│   ├── useVaultAccess.ts     # Vault access management
│   ├── useWorkflowRoleDialogs.ts
│   ├── useWorkflowRoles.ts   # Workflow role CRUD operations
│   └── index.ts
├── tabs/                     # Tab content components (use context)
│   ├── RolesTab.tsx          # Workflow roles tab
│   ├── TeamsTab.tsx          # Teams tab
│   ├── TitlesTab.tsx         # Job titles tab
│   ├── UsersTab.tsx          # Users tab
│   └── index.ts
├── constants.ts              # Colors, icons, permission groups
├── index.ts                  # Main barrel export
├── types.ts                  # TypeScript interfaces
├── utils.ts                  # Utility functions
└── README.md                 # This file
```

## Architecture Overview

### Context-Based Architecture (Current)

The module uses React Context to eliminate prop drilling. The main entry point is:

```tsx
// TeamMembersSettings.tsx
import { TeamMembersProvider, useTeamMembersContext } from './team-members'

function TeamMembersSettings() {
  return (
    <TeamMembersProvider>
      <TeamMembersContent />
    </TeamMembersProvider>
  )
}

function TeamMembersContent() {
  const { teams, orgUsers, isLoading } = useTeamMembersContext()
  // All data, handlers, and state are available via context
}
```

### TeamMembersContext

The `TeamMembersContext` provides:

| Category | Examples |
|----------|----------|
| **Data** | `teams`, `orgUsers`, `pendingMembers`, `workflowRoles`, `jobTitles`, `orgVaults` |
| **Computed Data** | `filteredTeams`, `filteredAllUsers`, `unassignedUsers` |
| **Loading State** | `isLoading` |
| **User Info** | `user`, `organization`, `isAdmin`, `isRealAdmin` |
| **UI State** | `activeTab`, `searchQuery`, `expandedTeams`, `showPendingMembers` |
| **Dialog State** | `showCreateTeamDialog`, `selectedTeam`, `editingWorkflowRole`, etc. |
| **Handlers** | `handleCreateTeam`, `handleRemoveUser`, `handleChangeJobTitle`, etc. |
| **Data Loaders** | `loadAllData`, `loadTeams`, `loadOrgUsers` |

### Tab Components

Tab components consume context directly (no props):

```tsx
import { useTeamMembersContext } from '../context'

export function UsersTab() {
  const {
    filteredAllUsers,
    teams,
    workflowRoles,
    handleToggleTeam,
    handleToggleWorkflowRole,
    // ...
  } = useTeamMembersContext()
  
  return (/* render users */)
}
```

### Self-Contained Dialog Groups

Dialogs are grouped by domain and check their own visibility:

```tsx
// components/TeamDialogs.tsx
export function TeamDialogs() {
  const {
    showCreateTeamDialog,
    selectedTeam,
    handleCreateTeam,
    // ...
  } = useTeamMembersContext()
  
  return (
    <>
      {showCreateTeamDialog && <TeamFormDialog ... />}
      {showEditTeamDialog && selectedTeam && <TeamFormDialog ... />}
      {/* ... other team dialogs */}
    </>
  )
}
```

Available dialog groups:
- `TeamDialogs` - Create/edit/delete teams, permissions, vault access
- `UserDialogs` - Create users, remove users, permissions, vault access
- `WorkflowRoleDialogs` - Create/edit workflow roles
- `JobTitleDialogs` - Create/edit job titles, user title assignment

### Hooks Layer

The context internally uses these hooks:

#### Data Hooks (Server State)

| Hook | Purpose | Key Methods |
|------|---------|-------------|
| `useTeams` | Team CRUD, member counts | `loadTeams`, `createTeam`, `updateTeam`, `deleteTeam` |
| `useMembers` | Organization members | `loadMembers`, `removeMember`, `toggleTeam`, `saveUserTeams` |
| `useInvites` | Pending member invitations | `loadPendingMembers`, `updatePendingMember`, `resendInvite` |
| `useWorkflowRoles` | Workflow roles and assignments | `loadWorkflowRoles`, `createWorkflowRole`, `toggleUserRole` |
| `useJobTitles` | Job titles | `loadJobTitles`, `createJobTitle`, `assignJobTitle` |
| `useVaultAccess` | User/team vault access | `loadVaults`, `saveUserVaultAccess`, `saveTeamVaultAccess` |

#### Handler Hooks (Domain-Specific)

Located in `hooks/handlers/`:

| Hook | Purpose |
|------|---------|
| `useTeamHandlers` | Team create/update/delete, vault access |
| `useUserHandlers` | User management, vault access |
| `useWorkflowRoleHandlers` | Workflow role CRUD |
| `useJobTitleHandlers` | Job title CRUD, assignments |
| `usePendingMemberHandlers` | Pending member updates, invites |

#### Dialog/UI State Hooks

| Hook | Purpose |
|------|---------|
| `useTeamDialogs` | Team dialog visibility and form state |
| `useUserDialogs` | User dialog visibility and state |
| `useWorkflowRoleDialogs` | Workflow role dialog state |
| `useJobTitleDialogs` | Job title dialog state |
| `useOrgCode` | Organization code display and copy |
| `useUIState` | Active tab, search query, pending member editing |

#### Computed Data Hook

| Hook | Purpose |
|------|---------|
| `useFilteredData` | Memoized filtered lists based on search query |

### Typed Supabase Helpers

The `supabaseHelpers.ts` module provides:
- Type definitions for database tables
- Query response types for complex joins/aggregates
- Typed wrapper functions for insert/update operations
- `castQueryResult<T>()` helper for type-safe query results

## Type Definitions

### Core Data Types (in `types.ts`)

- `OrgUser` - Organization member with teams, job title, workflow roles
- `TeamWithDetails` - Team with member/permission counts
- `PendingMember` - Pre-created account awaiting sign-in
- `WorkflowRoleBasic` - Workflow role info
- `JobTitle` - Job title info
- `Vault` - Vault info

### Form Data Types

- `TeamFormData` - Team create/edit form state
- `WorkflowRoleFormData` - Workflow role form state
- `PendingMemberFormData` - Pending member edit form state

### Hook Return Types

- `UseTeamsReturn`, `UseMembersReturn`, `UseInvitesReturn`
- `UseWorkflowRolesReturn`, `UseJobTitlesReturn`, `UseVaultAccessReturn`

## Constants

Available in `constants.ts`:

- `TEAM_COLORS` - Preset team colors
- `DEFAULT_TEAM_ICONS`, `DEFAULT_WORKFLOW_ROLE_ICONS`, `DEFAULT_JOB_TITLE_ICONS`
- `DEFAULT_TEAM_COLOR`, `DEFAULT_WORKFLOW_ROLE_COLOR`, `DEFAULT_JOB_TITLE_COLOR`
- `ROLE_LABELS` - Admin role display labels
- `PERMISSION_RESOURCE_GROUPS` - Permission categories for UI grouping

## Utility Functions

Available in `utils.ts`:

| Function | Purpose |
|----------|---------|
| `formatLastOnline(date)` | Formats timestamp as relative time |
| `pendingMemberToOrgUser(pm, teams, workflowRoles)` | Converts PendingMember to OrgUser |
| `getPendingMemberVaultAccessCount(pm, teamVaultAccessMap)` | Gets vault access count for pending member |

## Usage Example

```tsx
import {
  TeamMembersProvider,
  useTeamMembersContext,
  UsersTab,
  TeamsTab,
  RolesTab,
  TitlesTab,
  TeamDialogs,
  UserDialogs,
  WorkflowRoleDialogs,
  JobTitleDialogs
} from './team-members'

function TeamMembersSettings() {
  return (
    <TeamMembersProvider>
      <TeamMembersContent />
    </TeamMembersProvider>
  )
}

function TeamMembersContent() {
  const { activeTab, isLoading } = useTeamMembersContext()
  
  if (isLoading) return <LoadingSpinner />
  
  return (
    <div>
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'teams' && <TeamsTab />}
      {activeTab === 'roles' && <RolesTab />}
      {activeTab === 'titles' && <TitlesTab />}
      
      {/* Self-contained dialogs */}
      <TeamDialogs />
      <UserDialogs />
      <WorkflowRoleDialogs />
      <JobTitleDialogs />
    </div>
  )
}
```

## Migration Notes

The module supports both old (prop-drilling) and new (context) patterns:

- **Legacy**: `TeamMembersDialogs` component with 75+ props
- **Current**: Self-contained dialog groups using context

Tab components have been refactored to use context and no longer accept props.

## Exports

The main `index.ts` barrel export provides:

- `TeamMembersProvider`, `useTeamMembersContext` from `./context`
- All components from `./components`
- All tab components from `./tabs`
- All hooks (data, dialog state, computed, handlers)
- Domain-specific handler hooks
- All types
- All utility functions
- All constants
