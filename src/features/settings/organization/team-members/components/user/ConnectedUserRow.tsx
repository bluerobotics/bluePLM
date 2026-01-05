/**
 * ConnectedUserRow - Context-connected wrapper for UserRow
 * 
 * This component uses the TeamMembersContext to derive all props needed
 * by UserRow, eliminating prop drilling from parent components.
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
import { useTeamMembersContext } from '../../context'
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
  // Get all needed data and handlers from context
  const {
    // Current user info
    user: currentUser,
    isAdmin,
    isRealAdmin,
    impersonatedUserId,
    
    // Data lists
    teams,
    workflowRoles,
    jobTitles,
    userWorkflowRoleAssignments,
    
    // Dialog setters
    setViewingUserId,
    setRemovingUser,
    setEditingPermissionsUser,
    setViewingPermissionsUser,
    setEditingJobTitleUser,
    setEditingWorkflowRolesUser,
    setEditingTeamsUser,
    
    // Handlers
    openVaultAccessEditor,
    startUserImpersonation,
    getUserVaultAccessCount,
    handleChangeJobTitle,
    handleToggleTeam,
    handleToggleWorkflowRole,
    handleRemoveFromTeam
  } = useTeamMembersContext()

  // Derive props from context
  const isCurrentUser = user.id === currentUser?.id

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
      isSimulating={impersonatedUserId === user.id}
      
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
