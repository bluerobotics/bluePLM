/**
 * useHandlers - Consolidates all handler functions for TeamMembersSettings
 * 
 * This hook composes domain-specific handler hooks into a single interface.
 * It provides backward compatibility while internally using modular hooks.
 * 
 * For new code, consider using the domain-specific hooks directly:
 * - useTeamHandlers - Team CRUD and vault access
 * - useUserHandlers - User management and vault access
 * - useWorkflowRoleHandlers - Workflow role CRUD
 * - useJobTitleHandlers - Job title CRUD and assignments
 * - usePendingMemberHandlers - Pending member updates and invites
 * 
 * @example
 * ```tsx
 * const handlers = useHandlers({ ...params })
 * const { handleCreateTeam, handleUpdateTeam, ... } = handlers
 * ```
 */
import { useCallback } from 'react'
import type { 
  OrgUser, 
  TeamWithDetails, 
  PendingMember,
  TeamFormData,
  WorkflowRoleFormData,
  PendingMemberFormData,
  WorkflowRoleBasic,
  JobTitle
} from '../types'
import { useTeamHandlers } from './handlers/useTeamHandlers'
import { useUserHandlers } from './handlers/useUserHandlers'
import { useWorkflowRoleHandlers } from './handlers/useWorkflowRoleHandlers'
import { useJobTitleHandlers } from './handlers/useJobTitleHandlers'
import { usePendingMemberHandlers } from './handlers/usePendingMemberHandlers'

export interface UseHandlersParams {
  // Current user
  user: { id: string } | null
  
  // Organization
  organization: { id: string } | null
  setOrganization: (org: unknown) => void
  addToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
  
  // Data hook methods - Teams
  hookCreateTeam: (formData: TeamFormData, copyFromTeamId?: string | null) => Promise<boolean>
  hookUpdateTeam: (teamId: string, formData: TeamFormData) => Promise<boolean>
  hookDeleteTeam: (teamId: string) => Promise<boolean>
  hookSetDefaultTeam: <T extends { default_new_user_team_id?: string | null }>(
    teamId: string | null,
    orgId: string,
    setOrg: (org: T) => void,
    org: T
  ) => Promise<boolean>
  
  // Data hook methods - Members
  removeMember: (userId: string) => Promise<boolean>
  hookRemoveFromTeam: (userId: string, teamId: string, teamName: string) => Promise<boolean>
  hookToggleTeam: (userId: string, teamId: string, isAdding: boolean) => Promise<boolean>
  
  // Data hook methods - Invites
  hookUpdatePendingMember: (memberId: string, data: PendingMemberFormData) => Promise<boolean>
  hookResendInvite: (pm: PendingMember) => Promise<boolean>
  
  // Data hook methods - Workflow Roles
  hookCreateWorkflowRole: (data: WorkflowRoleFormData) => Promise<boolean>
  hookUpdateWorkflowRole: (roleId: string, data: WorkflowRoleFormData) => Promise<boolean>
  hookDeleteWorkflowRole: (roleId: string) => Promise<boolean>
  hookToggleUserRole: (userId: string, roleId: string, isAdding: boolean, addedBy?: string) => Promise<boolean>
  
  // Data hook methods - Job Titles
  hookCreateJobTitle: (name: string, color: string, icon: string, assignToUserId?: string) => Promise<boolean>
  hookUpdateJobTitle: (titleId: string, name: string, color: string, icon: string) => Promise<boolean>
  hookDeleteJobTitle: (titleId: string) => Promise<boolean>
  hookAssignJobTitle: (user: OrgUser, titleId: string | null) => Promise<boolean>
  
  // Data hook methods - Vault Access
  saveTeamVaultAccess: (teamId: string, vaultIds: string[], teamName: string) => Promise<boolean>
  saveUserVaultAccess: (userId: string, vaultIds: string[], userName: string) => Promise<boolean>
  getUserAccessibleVaults: (userId: string) => string[]
  
  // Data refresh functions
  loadTeams: () => Promise<void>
  loadOrgUsers: () => Promise<void>
  loadPendingMembers: () => Promise<void>
  loadWorkflowRoles: () => Promise<void>
  loadJobTitles: () => Promise<void>
  loadTeamVaultAccess: () => Promise<void>
  loadAllVaultData: () => Promise<void>
  
  // Team dialog state
  selectedTeam: TeamWithDetails | null
  setSelectedTeam: (team: TeamWithDetails | null) => void
  showCreateTeamDialog: boolean
  setShowCreateTeamDialog: (v: boolean) => void
  showEditTeamDialog: boolean
  setShowEditTeamDialog: (v: boolean) => void
  showDeleteTeamDialog: boolean
  setShowDeleteTeamDialog: (v: boolean) => void
  showTeamVaultAccessDialog: boolean
  setShowTeamVaultAccessDialog: (v: boolean) => void
  showModulesDialog: boolean
  setShowModulesDialog: (v: boolean) => void
  teamFormData: TeamFormData
  setTeamFormData: (data: TeamFormData) => void
  isSavingTeam: boolean
  setIsSavingTeam: (v: boolean) => void
  copyFromTeamId: string | null
  editingTeamFromManage: TeamWithDetails | null
  setEditingTeamFromManage: (team: TeamWithDetails | null) => void
  pendingTeamVaultAccess: string[]
  isSavingTeamVaultAccess: boolean
  setIsSavingTeamVaultAccess: (v: boolean) => void
  teamVaultAccessMap: Record<string, string[]>
  setPendingTeamVaultAccess: (ids: string[]) => void
  resetTeamForm: () => void
  
  // User dialog state
  removingUser: OrgUser | null
  setRemovingUser: (user: OrgUser | null) => void
  isRemoving: boolean
  setIsRemoving: (v: boolean) => void
  removingFromTeam: { user: OrgUser; teamId: string; teamName: string } | null
  setRemovingFromTeam: (v: { user: OrgUser; teamId: string; teamName: string } | null) => void
  isRemovingFromTeam: boolean
  setIsRemovingFromTeam: (v: boolean) => void
  editingVaultAccessUser: OrgUser | null
  setEditingVaultAccessUser: (user: OrgUser | null) => void
  pendingVaultAccess: string[]
  setPendingVaultAccess: (ids: string[]) => void
  isSavingVaultAccess: boolean
  setIsSavingVaultAccess: (v: boolean) => void
  
  // Workflow role dialog state
  showCreateWorkflowRoleDialog: boolean
  setShowCreateWorkflowRoleDialog: (v: boolean) => void
  showEditWorkflowRoleDialog: boolean
  setShowEditWorkflowRoleDialog: (v: boolean) => void
  editingWorkflowRole: WorkflowRoleBasic | null
  setEditingWorkflowRole: (role: WorkflowRoleBasic | null) => void
  workflowRoleFormData: WorkflowRoleFormData
  setWorkflowRoleFormData: (data: WorkflowRoleFormData) => void
  isSavingWorkflowRole: boolean
  setIsSavingWorkflowRole: (v: boolean) => void
  
  // Job title dialog state
  showCreateTitleDialog: boolean
  setShowCreateTitleDialog: (v: boolean) => void
  pendingTitleForUser: OrgUser | null
  setPendingTitleForUser: (user: OrgUser | null) => void
  newTitleName: string
  setNewTitleName: (v: string) => void
  newTitleColor: string
  setNewTitleColor: (v: string) => void
  newTitleIcon: string
  setNewTitleIcon: (v: string) => void
  isCreatingTitle: boolean
  setIsCreatingTitle: (v: boolean) => void
  editingJobTitle: JobTitle | null
  setEditingJobTitle: (title: JobTitle | null) => void
  jobTitles: JobTitle[]
  
  // Pending member state
  editingPendingMember: PendingMember | null
  setEditingPendingMember: (pm: PendingMember | null) => void
  pendingMemberForm: PendingMemberFormData
  isSavingPendingMember: boolean
  setIsSavingPendingMember: (v: boolean) => void
  setResendingInviteId: (id: string | null) => void
  
  // Default team state
  isSavingDefaultTeam: boolean
  setIsSavingDefaultTeam: (v: boolean) => void
}

export function useHandlers(params: UseHandlersParams) {
  const {
    loadTeams,
    loadOrgUsers,
    loadPendingMembers,
    loadWorkflowRoles,
    loadJobTitles,
    loadAllVaultData
  } = params

  // Team handlers
  const teamHandlers = useTeamHandlers({
    hookCreateTeam: params.hookCreateTeam,
    hookUpdateTeam: params.hookUpdateTeam,
    hookDeleteTeam: params.hookDeleteTeam,
    hookSetDefaultTeam: params.hookSetDefaultTeam,
    saveTeamVaultAccess: params.saveTeamVaultAccess,
    loadTeams: params.loadTeams,
    loadOrgUsers: params.loadOrgUsers,
    loadTeamVaultAccess: params.loadTeamVaultAccess,
    organization: params.organization,
    setOrganization: params.setOrganization,
    addToast: params.addToast,
    selectedTeam: params.selectedTeam,
    setSelectedTeam: params.setSelectedTeam,
    setShowCreateTeamDialog: params.setShowCreateTeamDialog,
    setShowEditTeamDialog: params.setShowEditTeamDialog,
    setShowDeleteTeamDialog: params.setShowDeleteTeamDialog,
    setShowTeamVaultAccessDialog: params.setShowTeamVaultAccessDialog,
    teamFormData: params.teamFormData,
    setIsSavingTeam: params.setIsSavingTeam,
    copyFromTeamId: params.copyFromTeamId,
    editingTeamFromManage: params.editingTeamFromManage,
    setEditingTeamFromManage: params.setEditingTeamFromManage,
    pendingTeamVaultAccess: params.pendingTeamVaultAccess,
    setIsSavingTeamVaultAccess: params.setIsSavingTeamVaultAccess,
    teamVaultAccessMap: params.teamVaultAccessMap,
    setPendingTeamVaultAccess: params.setPendingTeamVaultAccess,
    resetTeamForm: params.resetTeamForm,
    setIsSavingDefaultTeam: params.setIsSavingDefaultTeam
  })

  // User handlers
  const userHandlers = useUserHandlers({
    user: params.user,
    removeMember: params.removeMember,
    hookRemoveFromTeam: params.hookRemoveFromTeam,
    hookToggleTeam: params.hookToggleTeam,
    hookToggleUserRole: params.hookToggleUserRole,
    saveUserVaultAccess: params.saveUserVaultAccess,
    getUserAccessibleVaults: params.getUserAccessibleVaults,
    loadTeams: params.loadTeams,
    removingUser: params.removingUser,
    setRemovingUser: params.setRemovingUser,
    setIsRemoving: params.setIsRemoving,
    setRemovingFromTeam: params.setRemovingFromTeam,
    setIsRemovingFromTeam: params.setIsRemovingFromTeam,
    editingVaultAccessUser: params.editingVaultAccessUser,
    setEditingVaultAccessUser: params.setEditingVaultAccessUser,
    pendingVaultAccess: params.pendingVaultAccess,
    setPendingVaultAccess: params.setPendingVaultAccess,
    setIsSavingVaultAccess: params.setIsSavingVaultAccess
  })

  // Workflow role handlers
  const workflowRoleHandlers = useWorkflowRoleHandlers({
    hookCreateWorkflowRole: params.hookCreateWorkflowRole,
    hookUpdateWorkflowRole: params.hookUpdateWorkflowRole,
    hookDeleteWorkflowRole: params.hookDeleteWorkflowRole,
    setShowCreateWorkflowRoleDialog: params.setShowCreateWorkflowRoleDialog,
    setShowEditWorkflowRoleDialog: params.setShowEditWorkflowRoleDialog,
    editingWorkflowRole: params.editingWorkflowRole,
    setEditingWorkflowRole: params.setEditingWorkflowRole,
    workflowRoleFormData: params.workflowRoleFormData,
    setWorkflowRoleFormData: params.setWorkflowRoleFormData,
    setIsSavingWorkflowRole: params.setIsSavingWorkflowRole
  })

  // Job title handlers
  const jobTitleHandlers = useJobTitleHandlers({
    hookCreateJobTitle: params.hookCreateJobTitle,
    hookUpdateJobTitle: params.hookUpdateJobTitle,
    hookDeleteJobTitle: params.hookDeleteJobTitle,
    hookAssignJobTitle: params.hookAssignJobTitle,
    loadOrgUsers: params.loadOrgUsers,
    setShowCreateTitleDialog: params.setShowCreateTitleDialog,
    pendingTitleForUser: params.pendingTitleForUser,
    setPendingTitleForUser: params.setPendingTitleForUser,
    newTitleName: params.newTitleName,
    setNewTitleName: params.setNewTitleName,
    newTitleColor: params.newTitleColor,
    setNewTitleColor: params.setNewTitleColor,
    newTitleIcon: params.newTitleIcon,
    setIsCreatingTitle: params.setIsCreatingTitle,
    editingJobTitle: params.editingJobTitle,
    setEditingJobTitle: params.setEditingJobTitle,
    jobTitles: params.jobTitles
  })

  // Pending member handlers
  const pendingMemberHandlers = usePendingMemberHandlers({
    hookUpdatePendingMember: params.hookUpdatePendingMember,
    hookResendInvite: params.hookResendInvite,
    editingPendingMember: params.editingPendingMember,
    setEditingPendingMember: params.setEditingPendingMember,
    pendingMemberForm: params.pendingMemberForm,
    setIsSavingPendingMember: params.setIsSavingPendingMember,
    setResendingInviteId: params.setResendingInviteId
  })

  // Data refresh
  const loadAllData = useCallback(async () => {
    await Promise.all([
      loadTeams(),
      loadOrgUsers(),
      loadPendingMembers(),
      loadWorkflowRoles(),
      loadJobTitles(),
      loadAllVaultData()
    ])
  }, [loadTeams, loadOrgUsers, loadPendingMembers, loadWorkflowRoles, loadJobTitles, loadAllVaultData])

  return {
    // Pending member handlers
    ...pendingMemberHandlers,
    
    // Team handlers
    ...teamHandlers,
    
    // User handlers
    ...userHandlers,
    
    // Workflow role handlers
    ...workflowRoleHandlers,
    
    // Job title handlers
    ...jobTitleHandlers,
    
    // Data refresh
    loadAllData
  }
}
