/**
 * TeamDialogs - Self-contained team-related dialogs
 * 
 * This component renders all team-related dialogs and manages
 * their visibility through the TeamMembersContext.
 */
import { PermissionsEditor } from '@/features/settings/organization/PermissionsEditor'
import { useTeamMembersContext } from '../context'
import {
  TeamFormDialog,
  DeleteTeamDialog
} from './dialogs'
import {
  TeamMembersDialog,
  TeamModulesDialog,
  TeamVaultAccessDialog
} from './team'

export function TeamDialogs() {
  const {
    user,
    isAdmin,
    
    // Team dialogs state
    showCreateTeamDialog,
    setShowCreateTeamDialog,
    showEditTeamDialog,
    setShowEditTeamDialog,
    showDeleteTeamDialog,
    setShowDeleteTeamDialog,
    showTeamMembersDialog,
    setShowTeamMembersDialog,
    showTeamVaultAccessDialog,
    setShowTeamVaultAccessDialog,
    showPermissionsEditor,
    setShowPermissionsEditor,
    showModulesDialog,
    setShowModulesDialog,
    
    // Selected entities
    selectedTeam,
    setSelectedTeam,
    editingTeamFromManage,
    setEditingTeamFromManage,
    
    // Form data
    teamFormData,
    setTeamFormData,
    pendingTeamVaultAccess,
    setPendingTeamVaultAccess,
    copyFromTeamId,
    setCopyFromTeamId,
    
    // Loading states
    isSavingTeam,
    isSavingTeamVaultAccess,
    
    // Data
    teams,
    orgUsers,
    orgVaults,
    
    // Handlers
    handleCreateTeam,
    handleUpdateTeam,
    handleDeleteTeam,
    handleUpdateTeamFromManage,
    handleSaveTeamVaultAccess,
    
    // Data refresh
    loadTeams,
    loadOrgUsers
  } = useTeamMembersContext()

  return (
    <>
      {/* Create Team Dialog */}
      {showCreateTeamDialog && (
        <TeamFormDialog
          title="Create Team"
          formData={teamFormData}
          setFormData={setTeamFormData}
          onSave={handleCreateTeam}
          onCancel={() => setShowCreateTeamDialog(false)}
          isSaving={isSavingTeam}
          existingTeams={teams}
          copyFromTeamId={copyFromTeamId}
          setCopyFromTeamId={setCopyFromTeamId}
        />
      )}

      {/* Edit Team Dialog */}
      {showEditTeamDialog && selectedTeam && (
        <TeamFormDialog
          title="Edit Team"
          formData={teamFormData}
          setFormData={setTeamFormData}
          onSave={handleUpdateTeam}
          onCancel={() => {
            setShowEditTeamDialog(false)
            setSelectedTeam(null)
          }}
          isSaving={isSavingTeam}
        />
      )}

      {/* Delete Team Dialog */}
      {showDeleteTeamDialog && selectedTeam && (
        <DeleteTeamDialog
          team={selectedTeam}
          onConfirm={handleDeleteTeam}
          onClose={() => setShowDeleteTeamDialog(false)}
          isDeleting={isSavingTeam}
        />
      )}

      {/* Team Members Dialog */}
      {showTeamMembersDialog && selectedTeam && (
        <TeamMembersDialog
          team={selectedTeam}
          orgUsers={orgUsers}
          onClose={() => {
            setShowTeamMembersDialog(false)
            setSelectedTeam(null)
            loadTeams()
            loadOrgUsers()
          }}
          userId={user?.id}
        />
      )}

      {/* Team Vault Access Dialog */}
      {showTeamVaultAccessDialog && selectedTeam && (
        <TeamVaultAccessDialog
          team={selectedTeam}
          orgVaults={orgVaults}
          pendingVaultAccess={pendingTeamVaultAccess}
          setPendingVaultAccess={setPendingTeamVaultAccess}
          onSave={handleSaveTeamVaultAccess}
          onClose={() => setShowTeamVaultAccessDialog(false)}
          isSaving={isSavingTeamVaultAccess}
        />
      )}

      {/* Permissions Editor */}
      {showPermissionsEditor && selectedTeam && (
        <PermissionsEditor
          team={selectedTeam}
          onClose={() => {
            setShowPermissionsEditor(false)
            setSelectedTeam(null)
            loadTeams()
          }}
          userId={user?.id}
          isAdmin={isAdmin}
        />
      )}

      {/* Team Modules Dialog */}
      {showModulesDialog && selectedTeam && (
        <TeamModulesDialog
          team={selectedTeam}
          onClose={() => {
            setShowModulesDialog(false)
            setSelectedTeam(null)
            loadTeams()
          }}
        />
      )}

      {/* Edit Team Dialog (from Manage Teams) - reuses TeamFormDialog */}
      {showEditTeamDialog && editingTeamFromManage && !selectedTeam && (
        <TeamFormDialog
          title="Edit Team"
          formData={teamFormData}
          setFormData={setTeamFormData}
          onSave={handleUpdateTeamFromManage}
          onCancel={() => {
            setShowEditTeamDialog(false)
            setEditingTeamFromManage(null)
          }}
          isSaving={isSavingTeam}
          disableNameEdit={editingTeamFromManage.name === 'Administrators'}
        />
      )}
    </>
  )
}
