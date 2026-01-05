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
│   │   ├── VaultAccessDialog.tsx  # Generic vault access dialog
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
│   │   ├── ConnectedUserRow.tsx  # Self-contained user row
│   │   ├── CreateUserDialog.tsx
│   │   ├── RemoveFromAdminsDialog.tsx
│   │   ├── RemoveUserDialog.tsx
│   │   ├── UserPermissionsDialog.tsx
│   │   ├── UserRow.tsx
│   │   ├── UserVaultAccessDialog.tsx
│   │   └── index.ts
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
├── tabs/                     # Tab content components (use hooks directly)
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

### Hooks-Based Architecture

The module uses a **hooks-based architecture** where each component calls data hooks directly. This eliminates the need for a context provider and prevents unnecessary re-renders.

Each tab component is self-contained:

```tsx
// Example: RolesTab.tsx
import { usePDMStore } from '@/stores/pdmStore'
import { useWorkflowRoles, useMembers, useWorkflowRoleDialogs } from '../hooks'

export function RolesTab({ searchQuery = '' }: RolesTabProps) {
  const { organization, getEffectiveRole } = usePDMStore()
  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'

  // Data hooks (cached, efficient)
  const { workflowRoles, createWorkflowRole, updateWorkflowRole, deleteWorkflowRole } = useWorkflowRoles(orgId)
  const { members: orgUsers } = useMembers(orgId)

  // Dialog state
  const { showCreateDialog, setShowCreateDialog, ... } = useWorkflowRoleDialogs()

  // Dialogs are rendered inline in the tab
  return (
    <>
      {/* Tab content */}
      {filteredRoles.map(role => ...)}
      
      {/* Dialogs */}
      {showCreateDialog && <WorkflowRoleFormDialog ... />}
    </>
  )
}
```

### Tab Components

Tab components accept a `searchQuery` prop and use hooks internally:

| Tab | Props | Hooks Used |
|-----|-------|------------|
| `UsersTab` | `searchQuery`, `onShowCreateUserDialog` | `useMembers`, `useTeams`, `useInvites`, `useWorkflowRoles`, `useFilteredData` |
| `TeamsTab` | `searchQuery` | `useTeams`, `useMembers`, `useVaultAccess`, `useTeamDialogs`, `useFilteredData` |
| `RolesTab` | `searchQuery` | `useWorkflowRoles`, `useMembers`, `useWorkflowRoleDialogs` |
| `TitlesTab` | `searchQuery` | `useJobTitles`, `useMembers`, `useJobTitleDialogs` |

### ConnectedUserRow

The `ConnectedUserRow` component is also self-contained, calling hooks directly:

```tsx
function ConnectedUserRow({ user, teamContext, compact }: ConnectedUserRowProps) {
  // Get data from store and hooks
  const { user: currentUser, organization } = usePDMStore()
  const { teams } = useTeams(orgId)
  const { workflowRoles, userRoleAssignments } = useWorkflowRoles(orgId)
  // ...

  return <UserRow user={user} ... />
}
```

### Hooks Layer

#### Data Hooks (Server State)

| Hook | Purpose | Key Methods |
|------|---------|-------------|
| `useTeams` | Team CRUD, member counts | `loadTeams`, `createTeam`, `updateTeam`, `deleteTeam` |
| `useMembers` | Organization members | `loadMembers`, `removeMember`, `toggleTeam`, `saveUserTeams` |
| `useInvites` | Pending member invitations | `loadPendingMembers`, `updatePendingMember`, `resendInvite` |
| `useWorkflowRoles` | Workflow roles and assignments | `loadWorkflowRoles`, `createWorkflowRole`, `toggleUserRole` |
| `useJobTitles` | Job titles | `loadJobTitles`, `createJobTitle`, `assignJobTitle` |
| `useVaultAccess` | User/team vault access | `loadVaults`, `saveUserVaultAccess`, `saveTeamVaultAccess` |

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
  UsersTab,
  TeamsTab,
  RolesTab,
  TitlesTab,
  useUIState
} from './team-members'

function TeamMembersSettings() {
  // Tab and search state managed locally
  const { activeTab, setActiveTab, searchQuery, setSearchQuery } = useUIState()
  
  return (
    <div>
      {/* Tab navigation */}
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      
      {/* Search */}
      <SearchInput value={searchQuery} onChange={setSearchQuery} />
      
      {/* Tab content - each tab is self-contained */}
      {activeTab === 'users' && <UsersTab searchQuery={searchQuery} />}
      {activeTab === 'teams' && <TeamsTab searchQuery={searchQuery} />}
      {activeTab === 'roles' && <RolesTab searchQuery={searchQuery} />}
      {activeTab === 'titles' && <TitlesTab searchQuery={searchQuery} />}
    </div>
  )
}
```

## Architecture Notes

The module uses a **hooks-based architecture** without context:

- **Tab Components**: `UsersTab`, `TeamsTab`, `RolesTab`, `TitlesTab`
  - Each tab calls data hooks directly
  - Dialogs are rendered inline within tabs
  - Accept `searchQuery` prop for filtering

- **ConnectedUserRow**: Self-contained component that calls hooks directly
  - Wraps the pure `UserRow` component
  - Each instance is independent

- **Data Hooks**: Cached and efficient
  - Multiple components can call the same hook
  - Data is cached per organization ID

- **Dialog State Hooks**: Local state per component
  - Each tab manages its own dialog visibility
  - No global dialog state coordination needed

- **VaultAccessDialog**: Generic vault access component used by both user and team dialogs
  - Located in `components/dialogs/VaultAccessDialog.tsx`
  - `UserVaultAccessDialog` and `TeamVaultAccessDialog` are thin wrappers

- **TypeScript**: All components use proper Supabase typing via `supabaseHelpers.ts`

## Exports

The main `index.ts` barrel export provides:

- All tab components from `./tabs` (with props interfaces)
- All hooks (data, dialog state, computed, handlers)
- All components from `./components`
- All types
- All utility functions
- All constants
