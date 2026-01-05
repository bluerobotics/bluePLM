/**
 * Team Members Settings - Barrel Export
 * 
 * This module provides all components, hooks, and utilities
 * for the Team Members Settings feature.
 * 
 * @module team-members
 */

// Context providers and hooks
export * from './context'

// All components from organized subfolders
export * from './components'

// Tab components (use context, no props needed)
export { UsersTab, TeamsTab, RolesTab, TitlesTab } from './tabs'

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
