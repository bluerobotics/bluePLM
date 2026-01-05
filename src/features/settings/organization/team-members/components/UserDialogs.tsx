/**
 * UserDialogs - Self-contained user-related dialogs
 * 
 * This component renders all user-related dialogs and manages
 * their visibility through the TeamMembersContext.
 */
import { UserProfileModal } from '@/features/settings/account/UserProfileModal'
import { getCurrentConfig } from '@/lib/supabase'
import { generateOrgCode } from '@/lib/supabaseConfig'
import { useTeamMembersContext } from '../context'
import { pendingMemberToOrgUser, getPendingMemberVaultAccessCount } from '../utils'
import { EditPendingMemberDialog } from './dialogs'
import {
  WorkflowRolesModal,
  UserTeamsModal,
  ViewNetPermissionsModal,
  AddToTeamModal
} from './modals'
import {
  UserPermissionsDialog,
  UserVaultAccessDialog,
  CreateUserDialog,
  RemoveUserDialog,
  RemoveFromAdminsDialog
} from './user'

export function UserDialogs() {
  const {
    user,
    organization,
    apiServerUrl,
    
    // User dialog state
    showCreateUserDialog,
    setShowCreateUserDialog,
    removingUser,
    setRemovingUser,
    isRemoving,
    removingFromTeam,
    setRemovingFromTeam,
    isRemovingFromTeam,
    editingPermissionsUser,
    setEditingPermissionsUser,
    viewingPermissionsUser,
    setViewingPermissionsUser,
    viewingUserId,
    setViewingUserId,
    addToTeamUser,
    setAddToTeamUser,
    editingTeamsUser,
    setEditingTeamsUser,
    editingVaultAccessUser,
    setEditingVaultAccessUser,
    pendingVaultAccess,
    setPendingVaultAccess,
    isSavingVaultAccess,
    editingWorkflowRolesUser,
    setEditingWorkflowRolesUser,
    
    // Pending member state
    editingPendingMember,
    setEditingPendingMember,
    pendingMemberForm,
    setPendingMemberForm,
    isSavingPendingMember,
    viewingPendingMemberPermissions,
    setViewingPendingMemberPermissions,
    togglePendingMemberTeam,
    togglePendingMemberWorkflowRole,
    togglePendingMemberVault,
    
    // Data
    teams,
    workflowRoles,
    orgVaults,
    userWorkflowRoleAssignments,
    teamVaultAccessMap,
    
    // Handlers
    handleRemoveUser,
    executeRemoveFromTeam,
    handleSaveVaultAccess,
    handleSavePendingMember,
    resetTeamForm,
    setShowCreateTeamDialog,
    setShowCreateWorkflowRoleDialog,
    
    // Data hook methods for modals
    hookUpdateWorkflowRole,
    hookDeleteWorkflowRole,
    hookSaveUserWorkflowRoles,
    hookSaveUserTeams,
    
    // Data refresh
    loadTeams,
    loadOrgUsers,
    loadPendingMembers,
    
    // Vault access helpers
    getUserVaultAccessCount
  } = useTeamMembersContext()

  return (
    <>
      {/* User Permissions Editor (for unassigned users) */}
      {editingPermissionsUser && (
        <UserPermissionsDialog
          user={editingPermissionsUser}
          onClose={() => setEditingPermissionsUser(null)}
          currentUserId={user?.id}
        />
      )}
      
      {/* Create User Dialog (pre-create account) */}
      {showCreateUserDialog && organization && (
        <CreateUserDialog
          onClose={() => setShowCreateUserDialog(false)}
          onCreated={() => loadPendingMembers()}
          teams={teams}
          orgId={organization.id}
          currentUserId={user?.id}
          currentUserName={user?.full_name || user?.email}
          orgName={organization.name}
          vaults={orgVaults}
          workflowRoles={workflowRoles}
          apiUrl={apiServerUrl}
          orgCode={(() => {
            const config = getCurrentConfig()
            return config ? generateOrgCode(config, organization?.slug) : undefined
          })()}
        />
      )}

      {/* User Vault Access Dialog */}
      {editingVaultAccessUser && (
        <UserVaultAccessDialog
          user={editingVaultAccessUser}
          orgVaults={orgVaults}
          pendingVaultAccess={pendingVaultAccess}
          setPendingVaultAccess={setPendingVaultAccess}
          onSave={handleSaveVaultAccess}
          onClose={() => setEditingVaultAccessUser(null)}
          isSaving={isSavingVaultAccess}
        />
      )}

      {/* Remove User Dialog */}
      {removingUser && (
        <RemoveUserDialog
          user={removingUser}
          onClose={() => setRemovingUser(null)}
          onConfirm={handleRemoveUser}
          isRemoving={isRemoving}
          isSelf={removingUser.id === user?.id}
        />
      )}

      {/* Remove from Administrators Team Dialog */}
      {removingFromTeam && (
        <RemoveFromAdminsDialog
          user={removingFromTeam.user}
          teamName={removingFromTeam.teamName}
          onClose={() => setRemovingFromTeam(null)}
          onConfirm={() => executeRemoveFromTeam(removingFromTeam.user, removingFromTeam.teamId, removingFromTeam.teamName)}
          isRemoving={isRemovingFromTeam}
        />
      )}

      {/* Edit Pending Member Dialog */}
      {editingPendingMember && (
        <EditPendingMemberDialog
          pendingMember={editingPendingMember}
          pendingMemberForm={pendingMemberForm}
          setPendingMemberForm={setPendingMemberForm}
          teams={teams}
          workflowRoles={workflowRoles}
          orgVaults={orgVaults}
          onSave={handleSavePendingMember}
          onClose={() => setEditingPendingMember(null)}
          isSaving={isSavingPendingMember}
          togglePendingMemberTeam={togglePendingMemberTeam}
          togglePendingMemberWorkflowRole={togglePendingMemberWorkflowRole}
          togglePendingMemberVault={togglePendingMemberVault}
        />
      )}

      {/* User Profile Modal */}
      {viewingUserId && (
        <UserProfileModal
          userId={viewingUserId}
          onClose={() => setViewingUserId(null)}
        />
      )}
      
      {/* View Net Permissions Modal */}
      {viewingPermissionsUser && (
        <ViewNetPermissionsModal
          user={viewingPermissionsUser}
          vaultAccessCount={getUserVaultAccessCount(viewingPermissionsUser.id)}
          orgVaults={orgVaults}
          teams={teams}
          onClose={() => setViewingPermissionsUser(null)}
        />
      )}
      
      {/* View Net Permissions Modal for Pending Member */}
      {viewingPendingMemberPermissions && (
        <ViewNetPermissionsModal
          user={pendingMemberToOrgUser(viewingPendingMemberPermissions, teams, workflowRoles)}
          vaultAccessCount={getPendingMemberVaultAccessCount(viewingPendingMemberPermissions, teamVaultAccessMap)}
          orgVaults={orgVaults}
          teams={teams}
          onClose={() => setViewingPendingMemberPermissions(null)}
        />
      )}

      {/* Add to Team Modal */}
      {addToTeamUser && (
        <AddToTeamModal
          user={addToTeamUser}
          teams={teams}
          currentUserId={user?.id}
          onClose={() => setAddToTeamUser(null)}
          onSuccess={() => {
            loadOrgUsers()
            loadTeams()
          }}
        />
      )}

      {/* Workflow Roles Modal */}
      {editingWorkflowRolesUser && (
        <WorkflowRolesModal
          user={editingWorkflowRolesUser}
          workflowRoles={workflowRoles}
          userRoleIds={userWorkflowRoleAssignments[editingWorkflowRolesUser.id] || []}
          onClose={() => setEditingWorkflowRolesUser(null)}
          onSave={async (roleIds) => {
            if (!user) return
            const success = await hookSaveUserWorkflowRoles(
              editingWorkflowRolesUser.id,
              roleIds,
              user.id,
              editingWorkflowRolesUser.full_name || editingWorkflowRolesUser.email
            )
            if (success) {
              setEditingWorkflowRolesUser(null)
            }
          }}
          onUpdateRole={async (roleId, name, color, icon) => {
            await hookUpdateWorkflowRole(roleId, { name, color, icon, description: '' })
          }}
          onDeleteRole={async (roleId) => {
            await hookDeleteWorkflowRole(roleId)
          }}
          onCreateRole={() => {
            setEditingWorkflowRolesUser(null)
            setShowCreateWorkflowRoleDialog(true)
          }}
        />
      )}

      {/* User Teams Modal */}
      {editingTeamsUser && (
        <UserTeamsModal
          user={editingTeamsUser}
          allTeams={teams}
          userTeamIds={(editingTeamsUser.teams || []).map(t => t.id)}
          onClose={() => setEditingTeamsUser(null)}
          onSave={async (teamIds) => {
            if (!user) return
            const currentTeamIds = (editingTeamsUser.teams || []).map(t => t.id)
            const success = await hookSaveUserTeams(
              editingTeamsUser.id,
              teamIds,
              currentTeamIds,
              editingTeamsUser.full_name || editingTeamsUser.email
            )
            if (success) {
              loadTeams()
              setEditingTeamsUser(null)
            }
          }}
          onCreateTeam={() => {
            setEditingTeamsUser(null)
            resetTeamForm()
            setShowCreateTeamDialog(true)
          }}
        />
      )}
    </>
  )
}
