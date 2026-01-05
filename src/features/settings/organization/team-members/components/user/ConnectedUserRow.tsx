/**
 * ConnectedUserRow - Self-contained wrapper for UserRow
 * 
 * This component uses hooks directly instead of context to derive all props
 * needed by UserRow. Each instance calls hooks, but since hooks cache their
 * data, this is performant.
 * 
 * UserRow remains a pure presentation component for testability.
 * 
 * @example
 * ```tsx
 * // In UsersTab (all users list)
 * <ConnectedUserRow user={user} />
 * 
 * // In TeamsTab (inside team expansion)
 * <ConnectedUserRow 
 *   user={member} 
 *   teamContext={{ teamId: team.id, teamName: team.name }} 
 * />
 * ```
 */
import { useCallback, useState } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import {
  useTeams,
  useMembers,
  useWorkflowRoles,
  useJobTitles,
  useVaultAccess,
  useUserDialogs
} from '../../hooks'
import { UserRow } from './UserRow'
import type { OrgUser } from '../../types'

export interface ConnectedUserRowProps {
  /** The user to display */
  user: OrgUser
  /** 
   * Optional team context - only passed when rendering inside a team expansion.
   * Enables the "Remove from Team" action.
   */
  teamContext?: {
    teamId: string
    teamName: string
  }
  /** Whether to render in compact mode (for team member rows) */
  compact?: boolean
}

export function ConnectedUserRow({ user, teamContext, compact }: ConnectedUserRowProps) {
  // Get current user info from store
  const {
    user: currentUser,
    organization,
    getEffectiveRole,
    startUserImpersonation,
    impersonatedUser
  } = usePDMStore()
  
  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'
  const isRealAdmin = currentUser?.role === 'admin'
  
  // Data hooks (these are cached, so calling them in each row is efficient)
  const { teams } = useTeams(orgId)
  const { toggleTeam, removeFromTeam } = useMembers(orgId)
  const { workflowRoles, userRoleAssignments: userWorkflowRoleAssignments, toggleUserRole } = useWorkflowRoles(orgId)
  const { jobTitles, assignJobTitle } = useJobTitles(orgId)
  const { getUserVaultAccessCount, getUserAccessibleVaults } = useVaultAccess(orgId)
  
  // Dialog state hooks
  const {
    setViewingUserId,
    setRemovingUser,
    setEditingPermissionsUser,
    setViewingPermissionsUser,
    setEditingVaultAccessUser,
    setPendingVaultAccess,
    setEditingWorkflowRolesUser,
    setEditingTeamsUser,
    setRemovingFromTeam
  } = useUserDialogs()
  
  // Local state for job title editing
  const [, setEditingJobTitleUser] = useState<OrgUser | null>(null)

  // Derive props
  const isCurrentUser = user.id === currentUser?.id

  // Handlers
  const handleToggleTeam = useCallback(async (u: OrgUser, teamId: string, isAdding: boolean) => {
    await toggleTeam(u.id, teamId, isAdding)
  }, [toggleTeam])

  const handleToggleWorkflowRole = useCallback(async (u: OrgUser, roleId: string, isAdding: boolean) => {
    await toggleUserRole(u.id, roleId, isAdding, currentUser?.id)
  }, [toggleUserRole, currentUser?.id])

  const handleChangeJobTitle = useCallback(async (u: OrgUser, titleId: string | null) => {
    await assignJobTitle(u, titleId)
  }, [assignJobTitle])

  const handleRemoveFromTeam = useCallback(async (u: OrgUser, teamId: string, teamName: string) => {
    // Check if removing self from Administrators
    const isRemovingSelfFromAdmins = u.id === currentUser?.id && teamName === 'Administrators'
    
    if (isRemovingSelfFromAdmins) {
      // Show confirmation dialog for removing self from Administrators
      setRemovingFromTeam({ user: u, teamId, teamName })
    } else {
      // Direct removal
      await removeFromTeam(u.id, teamId, teamName)
    }
  }, [currentUser?.id, removeFromTeam, setRemovingFromTeam])

  const openVaultAccessEditor = useCallback((u: OrgUser) => {
    const currentVaultIds = getUserAccessibleVaults(u.id)
    setEditingVaultAccessUser(u)
    setPendingVaultAccess(currentVaultIds)
  }, [getUserAccessibleVaults, setEditingVaultAccessUser, setPendingVaultAccess])

  return (
    <UserRow
      user={user}
      isAdmin={isAdmin}
      isRealAdmin={isRealAdmin}
      isCurrentUser={isCurrentUser}
      compact={compact}
      
      // Profile & View actions
      onViewProfile={() => setViewingUserId(user.id)}
      onViewNetPermissions={() => setViewingPermissionsUser(user)}
      
      // Simulate permissions (impersonation)
      onSimulatePermissions={() => startUserImpersonation(user.id)}
      isSimulating={impersonatedUser?.id === user.id}
      
      // Removal actions
      onRemove={() => setRemovingUser(user)}
      onRemoveFromTeam={
        teamContext 
          ? () => handleRemoveFromTeam(user, teamContext.teamId, teamContext.teamName)
          : undefined
      }
      
      // Vault access
      onVaultAccess={() => openVaultAccessEditor(user)}
      vaultAccessCount={getUserVaultAccessCount(user.id)}
      
      // Permissions
      onPermissions={isAdmin ? () => setEditingPermissionsUser(user) : undefined}
      
      // Job titles
      onEditJobTitle={isAdmin ? setEditingJobTitleUser : undefined}
      jobTitles={jobTitles}
      onToggleJobTitle={isAdmin ? handleChangeJobTitle : undefined}
      
      // Workflow roles
      workflowRoles={workflowRoles}
      userWorkflowRoleIds={userWorkflowRoleAssignments[user.id]}
      onEditWorkflowRoles={setEditingWorkflowRolesUser}
      onToggleWorkflowRole={isAdmin ? handleToggleWorkflowRole : undefined}
      
      // Teams
      teams={teams}
      onEditTeams={setEditingTeamsUser}
      onToggleTeam={isAdmin ? handleToggleTeam : undefined}
    />
  )
}
