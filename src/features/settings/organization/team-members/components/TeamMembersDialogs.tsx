/**
 * TeamMembersDialogs - Renders all dialogs for TeamMembersSettings
 * 
 * This component handles conditional rendering of 20+ dialogs
 * based on UI state. It consolidates all dialog JSX into one place.
 * 
 * @example
 * ```tsx
 * <TeamMembersDialogs
 *   showCreateTeamDialog={showCreateTeamDialog}
 *   selectedTeam={selectedTeam}
 *   handlers={handlers}
 *   // ... all other props
 * />
 * ```
 */
import React from 'react'
import { UserProfileModal } from '@/features/settings/account/UserProfileModal'
import { PermissionsEditor } from '@/features/settings/organization/PermissionsEditor'
import { getCurrentConfig } from '@/lib/supabase'
import { generateOrgCode } from '@/lib/supabaseConfig'

import {
  TeamFormDialog,
  DeleteTeamDialog,
  EditPendingMemberDialog,
  WorkflowRoleFormDialog,
  JobTitleFormDialog
} from './dialogs'

import {
  WorkflowRolesModal,
  UserTeamsModal,
  UserJobTitleModal,
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

import {
  TeamMembersDialog,
  TeamModulesDialog,
  TeamVaultAccessDialog
} from './team'

import type {
  OrgUser,
  TeamWithDetails,
  PendingMember,
  WorkflowRoleBasic,
  TeamFormData,
  WorkflowRoleFormData,
  PendingMemberFormData,
  Vault,
  JobTitle
} from '../types'

import { pendingMemberToOrgUser, getPendingMemberVaultAccessCount } from '../utils'

export interface TeamMembersDialogsProps {
  // Current user
  user: { id: string; full_name?: string | null; email?: string } | null
  
  // Organization
  organization: { id: string; name: string; slug?: string } | null
  apiServerUrl: string
  
  // Admin status
  isAdmin: boolean
  
  // Dialog visibility state - Teams
  showCreateTeamDialog: boolean
  setShowCreateTeamDialog: (v: boolean) => void
  showEditTeamDialog: boolean
  setShowEditTeamDialog: (v: boolean) => void
  showDeleteTeamDialog: boolean
  setShowDeleteTeamDialog: (v: boolean) => void
  showTeamMembersDialog: boolean
  setShowTeamMembersDialog: (v: boolean) => void
  showTeamVaultAccessDialog: boolean
  setShowTeamVaultAccessDialog: (v: boolean) => void
  showPermissionsEditor: boolean
  setShowPermissionsEditor: (v: boolean) => void
  showModulesDialog: boolean
  setShowModulesDialog: (v: boolean) => void
  
  // Dialog visibility state - Users
  showCreateUserDialog: boolean
  setShowCreateUserDialog: (v: boolean) => void
  
  // Dialog visibility state - Workflow Roles
  showCreateWorkflowRoleDialog: boolean
  setShowCreateWorkflowRoleDialog: (v: boolean) => void
  showEditWorkflowRoleDialog: boolean
  setShowEditWorkflowRoleDialog: (v: boolean) => void
  
  // Dialog visibility state - Job Titles
  showCreateTitleDialog: boolean
  setShowCreateTitleDialog: (v: boolean) => void
  
  // Selected entities
  selectedTeam: TeamWithDetails | null
  setSelectedTeam: (team: TeamWithDetails | null) => void
  editingPendingMember: PendingMember | null
  setEditingPendingMember: (pm: PendingMember | null) => void
  editingTeamFromManage: TeamWithDetails | null
  setEditingTeamFromManage: (team: TeamWithDetails | null) => void
  removingUser: OrgUser | null
  setRemovingUser: (user: OrgUser | null) => void
  removingFromTeam: { user: OrgUser; teamId: string; teamName: string } | null
  setRemovingFromTeam: (v: { user: OrgUser; teamId: string; teamName: string } | null) => void
  editingWorkflowRole: WorkflowRoleBasic | null
  setEditingWorkflowRole: (role: WorkflowRoleBasic | null) => void
  editingPermissionsUser: OrgUser | null
  setEditingPermissionsUser: (user: OrgUser | null) => void
  editingVaultAccessUser: OrgUser | null
  setEditingVaultAccessUser: (user: OrgUser | null) => void
  viewingUserId: string | null
  setViewingUserId: (id: string | null) => void
  viewingPermissionsUser: OrgUser | null
  setViewingPermissionsUser: (user: OrgUser | null) => void
  viewingPendingMemberPermissions: PendingMember | null
  setViewingPendingMemberPermissions: (pm: PendingMember | null) => void
  addToTeamUser: OrgUser | null
  setAddToTeamUser: (user: OrgUser | null) => void
  editingWorkflowRolesUser: OrgUser | null
  setEditingWorkflowRolesUser: (user: OrgUser | null) => void
  editingTeamsUser: OrgUser | null
  setEditingTeamsUser: (user: OrgUser | null) => void
  editingJobTitleUser: OrgUser | null
  setEditingJobTitleUser: (user: OrgUser | null) => void
  editingJobTitle: JobTitle | null
  setEditingJobTitle: (title: JobTitle | null) => void
  pendingTitleForUser: OrgUser | null
  setPendingTitleForUser: (user: OrgUser | null) => void
  
  // Data
  teams: TeamWithDetails[]
  orgUsers: OrgUser[]
  workflowRoles: WorkflowRoleBasic[]
  jobTitles: JobTitle[]
  orgVaults: Vault[]
  userWorkflowRoleAssignments: Record<string, string[]>
  teamVaultAccessMap: Record<string, string[]>
  
  // Form data
  teamFormData: TeamFormData
  setTeamFormData: React.Dispatch<React.SetStateAction<TeamFormData>>
  workflowRoleFormData: WorkflowRoleFormData
  setWorkflowRoleFormData: React.Dispatch<React.SetStateAction<WorkflowRoleFormData>>
  pendingMemberForm: PendingMemberFormData
  setPendingMemberForm: React.Dispatch<React.SetStateAction<PendingMemberFormData>>
  pendingTeamVaultAccess: string[]
  setPendingTeamVaultAccess: React.Dispatch<React.SetStateAction<string[]>>
  pendingVaultAccess: string[]
  setPendingVaultAccess: React.Dispatch<React.SetStateAction<string[]>>
  newTitleName: string
  setNewTitleName: (v: string) => void
  newTitleColor: string
  setNewTitleColor: (v: string) => void
  newTitleIcon: string
  setNewTitleIcon: (v: string) => void
  copyFromTeamId: string | null
  setCopyFromTeamId: (id: string | null) => void
  
  // Loading states
  isSavingTeam: boolean
  isSavingPendingMember: boolean
  isSavingTeamVaultAccess: boolean
  isSavingVaultAccess: boolean
  isRemoving: boolean
  isRemovingFromTeam: boolean
  isSavingWorkflowRole: boolean
  isCreatingTitle: boolean
  
  // Toggle functions from useUIState
  togglePendingMemberTeam: (teamId: string) => void
  togglePendingMemberWorkflowRole: (roleId: string) => void
  togglePendingMemberVault: (vaultId: string) => void
  
  // Handlers from useHandlers
  handleCreateTeam: () => Promise<void>
  handleUpdateTeam: () => Promise<void>
  handleDeleteTeam: () => Promise<void>
  handleUpdateTeamFromManage: () => Promise<void>
  handleSaveTeamVaultAccess: () => Promise<void>
  handleSavePendingMember: () => Promise<void>
  handleRemoveUser: () => Promise<void>
  executeRemoveFromTeam: (user: OrgUser, teamId: string, teamName: string) => Promise<void>
  handleCreateWorkflowRole: () => Promise<void>
  handleUpdateWorkflowRole: () => Promise<void>
  handleSaveVaultAccess: () => Promise<void>
  handleCreateTitle: () => Promise<void>
  handleUpdateJobTitle: () => Promise<void>
  handleChangeJobTitle: (user: OrgUser, titleId: string | null) => Promise<void>
  openCreateJobTitle: () => void
  updateJobTitleDirect: (titleId: string, name: string, color: string, icon: string) => Promise<void>
  deleteJobTitleDirect: (titleId: string) => Promise<void>
  resetTeamForm: () => void
  
  // Data hook methods for modals
  hookUpdateWorkflowRole: (roleId: string, data: WorkflowRoleFormData) => Promise<boolean>
  hookDeleteWorkflowRole: (roleId: string) => Promise<boolean>
  hookSaveUserWorkflowRoles: (userId: string, roleIds: string[], addedBy: string, userName: string) => Promise<boolean>
  hookSaveUserTeams: (userId: string, teamIds: string[], currentTeamIds: string[], userName: string) => Promise<boolean>
  
  // Data refresh functions
  loadTeams: () => Promise<void>
  loadOrgUsers: () => Promise<void>
  loadPendingMembers: () => Promise<void>
  
  // Vault access helpers
  getUserVaultAccessCount: (userId: string) => number
}

export function TeamMembersDialogs(props: TeamMembersDialogsProps) {
  const {
    user,
    organization,
    apiServerUrl,
    isAdmin,
    
    // Dialog visibility - Teams
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
    
    // Dialog visibility - Users
    showCreateUserDialog,
    setShowCreateUserDialog,
    
    // Dialog visibility - Workflow Roles
    showCreateWorkflowRoleDialog,
    setShowCreateWorkflowRoleDialog,
    showEditWorkflowRoleDialog,
    setShowEditWorkflowRoleDialog,
    
    // Dialog visibility - Job Titles
    showCreateTitleDialog,
    setShowCreateTitleDialog,
    
    // Selected entities
    selectedTeam,
    setSelectedTeam,
    editingPendingMember,
    setEditingPendingMember,
    editingTeamFromManage,
    setEditingTeamFromManage,
    removingUser,
    setRemovingUser,
    removingFromTeam,
    setRemovingFromTeam,
    editingWorkflowRole,
    setEditingWorkflowRole,
    editingPermissionsUser,
    setEditingPermissionsUser,
    editingVaultAccessUser,
    setEditingVaultAccessUser,
    viewingUserId,
    setViewingUserId,
    viewingPermissionsUser,
    setViewingPermissionsUser,
    viewingPendingMemberPermissions,
    setViewingPendingMemberPermissions,
    addToTeamUser,
    setAddToTeamUser,
    editingWorkflowRolesUser,
    setEditingWorkflowRolesUser,
    editingTeamsUser,
    setEditingTeamsUser,
    editingJobTitleUser,
    setEditingJobTitleUser,
    editingJobTitle,
    setEditingJobTitle,
    pendingTitleForUser,
    setPendingTitleForUser,
    
    // Data
    teams,
    orgUsers,
    workflowRoles,
    jobTitles,
    orgVaults,
    userWorkflowRoleAssignments,
    teamVaultAccessMap,
    
    // Form data
    teamFormData,
    setTeamFormData,
    workflowRoleFormData,
    setWorkflowRoleFormData,
    pendingMemberForm,
    setPendingMemberForm,
    pendingTeamVaultAccess,
    setPendingTeamVaultAccess,
    pendingVaultAccess,
    setPendingVaultAccess,
    newTitleName,
    setNewTitleName,
    newTitleColor,
    setNewTitleColor,
    newTitleIcon,
    setNewTitleIcon,
    copyFromTeamId,
    setCopyFromTeamId,
    
    // Loading states
    isSavingTeam,
    isSavingPendingMember,
    isSavingTeamVaultAccess,
    isSavingVaultAccess,
    isRemoving,
    isRemovingFromTeam,
    isSavingWorkflowRole,
    isCreatingTitle,
    
    // Toggle functions
    togglePendingMemberTeam,
    togglePendingMemberWorkflowRole,
    togglePendingMemberVault,
    
    // Handlers
    handleCreateTeam,
    handleUpdateTeam,
    handleDeleteTeam,
    handleUpdateTeamFromManage,
    handleSaveTeamVaultAccess,
    handleSavePendingMember,
    handleRemoveUser,
    executeRemoveFromTeam,
    handleCreateWorkflowRole,
    handleUpdateWorkflowRole,
    handleSaveVaultAccess,
    handleCreateTitle,
    handleUpdateJobTitle,
    handleChangeJobTitle,
    openCreateJobTitle,
    updateJobTitleDirect,
    deleteJobTitleDirect,
    resetTeamForm,
    
    // Data hook methods
    hookUpdateWorkflowRole,
    hookDeleteWorkflowRole,
    hookSaveUserWorkflowRoles,
    hookSaveUserTeams,
    
    // Data refresh
    loadTeams,
    loadOrgUsers,
    loadPendingMembers,
    
    // Helpers
    getUserVaultAccessCount
  } = props

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

      {/* Create Workflow Role Dialog */}
      {showCreateWorkflowRoleDialog && (
        <WorkflowRoleFormDialog
          mode="create"
          formData={workflowRoleFormData}
          setFormData={setWorkflowRoleFormData}
          onSave={handleCreateWorkflowRole}
          onClose={() => {
            setShowCreateWorkflowRoleDialog(false)
            setWorkflowRoleFormData({ name: '', color: '#8b5cf6', icon: 'Shield', description: '' })
          }}
          isSaving={isSavingWorkflowRole}
        />
      )}

      {/* Edit Workflow Role Dialog */}
      {showEditWorkflowRoleDialog && editingWorkflowRole && (
        <WorkflowRoleFormDialog
          mode="edit"
          formData={workflowRoleFormData}
          setFormData={setWorkflowRoleFormData}
          editingRole={editingWorkflowRole}
          onSave={handleUpdateWorkflowRole}
          onClose={() => {
            setShowEditWorkflowRoleDialog(false)
            setEditingWorkflowRole(null)
            setWorkflowRoleFormData({ name: '', color: '#8b5cf6', icon: 'Shield', description: '' })
          }}
          isSaving={isSavingWorkflowRole}
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

      {/* Create/Edit Job Title Dialog */}
      {showCreateTitleDialog && (
        <JobTitleFormDialog
          editingTitle={editingJobTitle}
          titleName={newTitleName}
          setTitleName={setNewTitleName}
          titleColor={newTitleColor}
          setTitleColor={setNewTitleColor}
          titleIcon={newTitleIcon}
          setTitleIcon={setNewTitleIcon}
          pendingTitleForUser={pendingTitleForUser}
          onSave={editingJobTitle ? handleUpdateJobTitle : handleCreateTitle}
          onClose={() => {
            setShowCreateTitleDialog(false)
            setEditingJobTitle(null)
            setPendingTitleForUser(null)
          }}
          isSaving={isCreatingTitle}
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

      {/* User Job Title Modal */}
      {editingJobTitleUser && (
        <UserJobTitleModal
          user={editingJobTitleUser}
          jobTitles={jobTitles}
          onClose={() => setEditingJobTitleUser(null)}
          onSelectTitle={async (titleId) => {
            await handleChangeJobTitle(editingJobTitleUser, titleId)
            setEditingJobTitleUser(null)
          }}
          onCreateTitle={() => {
            setPendingTitleForUser(editingJobTitleUser)
            setEditingJobTitleUser(null)
            openCreateJobTitle()
          }}
          onUpdateTitle={updateJobTitleDirect}
          onDeleteTitle={deleteJobTitleDirect}
          isAdmin={isAdmin}
        />
      )}
    </>
  )
}
