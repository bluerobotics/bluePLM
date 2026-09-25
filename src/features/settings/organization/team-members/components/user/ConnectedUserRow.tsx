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
  useUserDialogs,
} from '../../hooks'
import { UserRow } from './UserRow'
import { UserVaultAccessDialog } from './UserVaultAccessDialog'
import { EditCommunityUserCredentialsDialog } from './EditCommunityUserCredentialsDialog'
import { UserProfileModal } from '@/features/settings/account'
import { isBackendConfigured } from '@/lib/community'
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
    impersonatedUser,
  } = usePDMStore()

  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'
  const isRealAdmin = currentUser?.role === 'admin'

  // Data hooks (these are cached, so calling them in each row is efficient)
  const { teams } = useTeams(orgId)
  const { toggleTeam, removeFromTeam, loadMembers } = useMembers(orgId)
  const {
    workflowRoles,
    userRoleAssignments: userWorkflowRoleAssignments,
    toggleUserRole,
  } = useWorkflowRoles(orgId)
  const { jobTitles, assignJobTitle } = useJobTitles(orgId)
  const {
    vaults,
    getUserVaultAccessCount,
    getUserAccessibleVaults,
    saveUserVaultAccess,
  } = useVaultAccess(orgId)

  // Dialog state hooks
  const {
    viewingUserId,
    setViewingUserId,
    setRemovingUser,
    setEditingPermissionsUser,
    setViewingPermissionsUser,
    editingVaultAccessUser,
    setEditingVaultAccessUser,
    pendingVaultAccess,
    setPendingVaultAccess,
    isSavingVaultAccess,
    setIsSavingVaultAccess,
    setEditingWorkflowRolesUser,
    setEditingTeamsUser,
    setRemovingFromTeam,
  } = useUserDialogs()

  // Local state for job title editing
  const [, setEditingJobTitleUser] = useState<OrgUser | null>(null)
  const [editingCredentialsUser, setEditingCredentialsUser] = useState<OrgUser | null>(null)

  // Derive props
  const isCurrentUser = user.id === currentUser?.id

  // Handlers
  const handleToggleTeam = useCallback(
    async (u: OrgUser, teamId: string, isAdding: boolean) => {
      await toggleTeam(u.id, teamId, isAdding)
    },
    [toggleTeam],
  )

  const handleToggleWorkflowRole = useCallback(
    async (u: OrgUser, roleId: string, isAdding: boolean) => {
      await toggleUserRole(u.id, roleId, isAdding, currentUser?.id)
    },
    [toggleUserRole, currentUser?.id],
  )

  const handleChangeJobTitle = useCallback(
    async (u: OrgUser, titleId: string | null) => {
      await assignJobTitle(u, titleId)
    },
    [assignJobTitle],
  )

  const handleRemoveFromTeam = useCallback(
    async (u: OrgUser, teamId: string, teamName: string) => {
      // Check if removing self from Administrators
      const isRemovingSelfFromAdmins = u.id === currentUser?.id && teamName === 'Administrators'

      if (isRemovingSelfFromAdmins) {
        // Show confirmation dialog for removing self from Administrators
        setRemovingFromTeam({ user: u, teamId, teamName })
      } else {
        // Direct removal
        await removeFromTeam(u.id, teamId, teamName)
      }
    },
    [currentUser?.id, removeFromTeam, setRemovingFromTeam],
  )

  const openVaultAccessEditor = useCallback(
    (u: OrgUser) => {
      const currentVaultIds = getUserAccessibleVaults(u.id)
      setEditingVaultAccessUser(u)
      setPendingVaultAccess(currentVaultIds)
    },
    [getUserAccessibleVaults, setEditingVaultAccessUser, setPendingVaultAccess],
  )

  const saveVaultAccess = useCallback(async () => {
    if (!editingVaultAccessUser) return
    setIsSavingVaultAccess(true)
    try {
      const saved = await saveUserVaultAccess(
        editingVaultAccessUser.id,
        pendingVaultAccess,
        editingVaultAccessUser.full_name || editingVaultAccessUser.email,
      )
      if (saved) setEditingVaultAccessUser(null)
    } finally {
      setIsSavingVaultAccess(false)
    }
  }, [
    editingVaultAccessUser,
    pendingVaultAccess,
    saveUserVaultAccess,
    setEditingVaultAccessUser,
    setIsSavingVaultAccess,
  ])

  return (
    <>
      <UserRow
        user={user}
        isAdmin={isAdmin}
        isRealAdmin={isRealAdmin}
        isCurrentUser={isCurrentUser}
        compact={compact}
        // Profile & View actions
        onViewProfile={() => setViewingUserId(user.id)}
        onViewNetPermissions={
          !isBackendConfigured('community') ? () => setViewingPermissionsUser(user) : undefined
        }
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
        onPermissions={
          isAdmin && !isBackendConfigured('community') ? () => setEditingPermissionsUser(user) : undefined
        }
        // Community credentials are managed directly by the Community PHP API.
        // Do not expose this action in a Supabase installation (or for oneself,
        // because a password/email update intentionally revokes its sessions).
        onManageCredentials={
          isAdmin && !isCurrentUser && isBackendConfigured('community')
            ? () => setEditingCredentialsUser(user)
            : undefined
        }
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
      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
      {editingVaultAccessUser && (
        <UserVaultAccessDialog
          user={editingVaultAccessUser}
          orgVaults={vaults}
          pendingVaultAccess={pendingVaultAccess}
          setPendingVaultAccess={setPendingVaultAccess}
          onSave={saveVaultAccess}
          onClose={() => setEditingVaultAccessUser(null)}
          isSaving={isSavingVaultAccess}
        />
      )}
      {editingCredentialsUser && (
        <EditCommunityUserCredentialsDialog
          user={editingCredentialsUser}
          onClose={() => setEditingCredentialsUser(null)}
          onUpdated={loadMembers}
        />
      )}
    </>
  )
}
