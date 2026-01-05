/**
 * Team Members Settings - Barrel Export
 * 
 * This module provides all components, hooks, and utilities
 * for the Team Members Settings feature.
 * 
 * Components now use hooks directly instead of context.
 * The TeamMembersContext has been removed - tabs and dialog components
 * are self-contained, calling data hooks internally.
 * 
 * @module team-members
 */

// All components from organized subfolders
export * from './components'

// Tab components (use hooks directly, accept searchQuery prop)
export { UsersTab, TeamsTab, RolesTab, TitlesTab } from './tabs'
export type { UsersTabProps, TeamsTabProps, RolesTabProps, TitlesTabProps } from './tabs'

// Data hooks (API calls and state)
export {
  useTeams,
  useMembers,
  useInvites,
  useWorkflowRoles,
  useJobTitles,
  useVaultAccess
} from './hooks'

// Dialog/UI state hooks
export {
  useTeamDialogs,
  useUserDialogs,
  useWorkflowRoleDialogs,
  useJobTitleDialogs,
  useOrgCode,
  useUIState
} from './hooks'

// Computed data hooks
export {
  useFilteredData,
  type UseFilteredDataParams,
  type UseFilteredDataReturn
} from './hooks'

// Types
export type {
  WorkflowRoleBasic,
  OrgUser,
  Vault,
  TeamWithDetails,
  PendingMember,
  JobTitle,
  TeamFormData,
  WorkflowRoleFormData,
  PendingMemberFormData,
  UserRowProps,
  TeamFormDialogProps,
  TeamMembersDialogProps,
  WorkflowRolesModalProps,
  UserTeamsModalProps,
  UserJobTitleModalProps,
  UserPermissionsDialogProps,
  ViewNetPermissionsModalProps,
  TeamModulesDialogProps
} from './types'

// Utilities
export { 
  formatLastOnline,
  pendingMemberToOrgUser,
  getPendingMemberVaultAccessCount
} from './utils'

// Constants
export {
  TEAM_COLORS,
  DEFAULT_TEAM_ICONS,
  DEFAULT_WORKFLOW_ROLE_ICONS,
  DEFAULT_JOB_TITLE_ICONS,
  ROLE_LABELS,
  DEFAULT_TEAM_COLOR,
  DEFAULT_WORKFLOW_ROLE_COLOR,
  DEFAULT_JOB_TITLE_COLOR,
  DEFAULT_TEAM_ICON,
  DEFAULT_WORKFLOW_ROLE_ICON,
  DEFAULT_JOB_TITLE_ICON,
  PERMISSION_RESOURCE_GROUPS
} from './constants'
