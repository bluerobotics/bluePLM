/**
 * Hooks barrel export for team-members
 * 
 * This module provides all the hooks needed for the TeamMembersSettings component.
 * 
 * @module team-members/hooks
 */

// Data hooks (handle API calls and state)
export { useTeams } from './useTeams'
export { useMembers } from './useMembers'
export { useInvites } from './useInvites'
export { useWorkflowRoles } from './useWorkflowRoles'
export { useJobTitles } from './useJobTitles'
export { useVaultAccess } from './useVaultAccess'

// Dialog/UI state hooks
export { useTeamDialogs } from './useTeamDialogs'
export { useUserDialogs } from './useUserDialogs'
export { useWorkflowRoleDialogs } from './useWorkflowRoleDialogs'
export { useJobTitleDialogs } from './useJobTitleDialogs'
export { useOrgCode } from './useOrgCode'
export { useUIState } from './useUIState'

// Computed/filtered data hook
export { useFilteredData, type UseFilteredDataParams, type UseFilteredDataReturn } from './useFilteredData'

// Handler orchestration hook (composes domain-specific handlers)
export { useHandlers, type UseHandlersParams } from './useHandlers'

// Domain-specific handler hooks (can be used individually)
export {
  useTeamHandlers,
  useUserHandlers,
  useWorkflowRoleHandlers,
  useJobTitleHandlers,
  usePendingMemberHandlers,
  type UseTeamHandlersParams,
  type UseUserHandlersParams,
  type UseWorkflowRoleHandlersParams,
  type UseJobTitleHandlersParams,
  type UsePendingMemberHandlersParams
} from './handlers'

// Typed Supabase helpers (internal use, but exported for testing/extension)
export { castQueryResult } from './supabaseHelpers'
export type {
  TeamWithCounts,
  UserBasic,
  TeamMembershipJoin,
  UserJobTitleJoin,
  UserWorkflowRoleJoin,
  TeamVaultAccessJoin,
  WorkflowRoleBasic as WorkflowRoleBasicQuery,
  JobTitleBasic as JobTitleBasicQuery
} from './supabaseHelpers'