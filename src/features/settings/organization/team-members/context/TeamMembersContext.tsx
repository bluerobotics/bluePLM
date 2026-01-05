/**
 * TeamMembersContext - Central context for team members management
 * 
 * This context eliminates prop drilling by providing all data, handlers,
 * and state needed for the TeamMembersSettings feature.
 * 
 * @example
 * ```tsx
 * function TeamMembersSettings() {
 *   return (
 *     <TeamMembersProvider>
 *       <TeamMembersContent />
 *     </TeamMembersProvider>
 *   )
 * }
 * 
 * function TeamMembersContent() {
 *   const { teams, orgUsers, isLoading } = useTeamMembersContext()
 *   // ...
 * }
 * ```
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { usePDMStore } from '@/stores/pdmStore'

// Data hooks
import {
  useTeams,
  useMembers,
  useInvites,
  useWorkflowRoles,
  useJobTitles,
  useVaultAccess,
  useTeamDialogs,
  useUserDialogs,
  useWorkflowRoleDialogs,
  useJobTitleDialogs,
  useOrgCode,
  useUIState,
  useFilteredData,
  useHandlers
} from '../hooks'

// Types
import type {
  TeamWithDetails,
  OrgUser,
  PendingMember,
  WorkflowRoleBasic,
  JobTitle,
  Vault,
  TeamFormData,
  WorkflowRoleFormData,
  PendingMemberFormData
} from '../types'

// ============================================
// Context Value Types
// ============================================

export interface TeamMembersContextValue {
  // ===== Data =====
  teams: TeamWithDetails[]
  orgUsers: OrgUser[]
  pendingMembers: PendingMember[]
  workflowRoles: WorkflowRoleBasic[]
  jobTitles: JobTitle[]
  orgVaults: Vault[]
  userWorkflowRoleAssignments: Record<string, string[]>
  teamVaultAccessMap: Record<string, string[]>
  
  // ===== Computed/Filtered Data =====
  filteredTeams: TeamWithDetails[]
  filteredAllUsers: OrgUser[]
  unassignedUsers: OrgUser[]
  filteredUnassignedUsers: OrgUser[]
  
  // ===== Loading State =====
  isLoading: boolean
  
  // ===== Current User Info =====
  user: { id: string; full_name?: string | null; email?: string; role?: string } | null
  organization: { id: string; name: string; slug?: string; default_new_user_team_id?: string | null } | null
  isAdmin: boolean
  isRealAdmin: boolean
  impersonatedUserId: string | undefined
  apiServerUrl: string | null
  
  // ===== UI State =====
  activeTab: 'users' | 'teams' | 'roles' | 'titles'
  setActiveTab: (tab: 'users' | 'teams' | 'roles' | 'titles') => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  expandedTeams: Set<string>
  toggleTeamExpand: (teamId: string) => void
  showUnassignedUsers: boolean
  setShowUnassignedUsers: (show: boolean) => void
  showPendingMembers: boolean
  setShowPendingMembers: (show: boolean) => void
  
  // ===== Team Dialog State =====
  selectedTeam: TeamWithDetails | null
  setSelectedTeam: (team: TeamWithDetails | null) => void
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
  teamFormData: TeamFormData
  setTeamFormData: React.Dispatch<React.SetStateAction<TeamFormData>>
  isSavingTeam: boolean
  copyFromTeamId: string | null
  setCopyFromTeamId: (id: string | null) => void
  editingTeamFromManage: TeamWithDetails | null
  setEditingTeamFromManage: (team: TeamWithDetails | null) => void
  pendingTeamVaultAccess: string[]
  setPendingTeamVaultAccess: React.Dispatch<React.SetStateAction<string[]>>
  isSavingTeamVaultAccess: boolean
  isSavingDefaultTeam: boolean
  resetTeamForm: () => void
  openEditTeamDialog: (team: TeamWithDetails) => void
  openModulesDialog: (team: TeamWithDetails) => void
  
  // ===== User Dialog State =====
  showCreateUserDialog: boolean
  setShowCreateUserDialog: (v: boolean) => void
  removingUser: OrgUser | null
  setRemovingUser: (user: OrgUser | null) => void
  isRemoving: boolean
  removingFromTeam: { user: OrgUser; teamId: string; teamName: string } | null
  setRemovingFromTeam: (v: { user: OrgUser; teamId: string; teamName: string } | null) => void
  isRemovingFromTeam: boolean
  editingPermissionsUser: OrgUser | null
  setEditingPermissionsUser: (user: OrgUser | null) => void
  viewingPermissionsUser: OrgUser | null
  setViewingPermissionsUser: (user: OrgUser | null) => void
  viewingUserId: string | null
  setViewingUserId: (id: string | null) => void
  addToTeamUser: OrgUser | null
  setAddToTeamUser: (user: OrgUser | null) => void
  editingTeamsUser: OrgUser | null
  setEditingTeamsUser: (user: OrgUser | null) => void
  editingVaultAccessUser: OrgUser | null
  setEditingVaultAccessUser: (user: OrgUser | null) => void
  pendingVaultAccess: string[]
  setPendingVaultAccess: React.Dispatch<React.SetStateAction<string[]>>
  isSavingVaultAccess: boolean
  editingWorkflowRolesUser: OrgUser | null
  setEditingWorkflowRolesUser: (user: OrgUser | null) => void
  
  // ===== Workflow Role Dialog State =====
  showCreateWorkflowRoleDialog: boolean
  setShowCreateWorkflowRoleDialog: (v: boolean) => void
  showEditWorkflowRoleDialog: boolean
  setShowEditWorkflowRoleDialog: (v: boolean) => void
  editingWorkflowRole: WorkflowRoleBasic | null
  setEditingWorkflowRole: (role: WorkflowRoleBasic | null) => void
  workflowRoleFormData: WorkflowRoleFormData
  setWorkflowRoleFormData: React.Dispatch<React.SetStateAction<WorkflowRoleFormData>>
  isSavingWorkflowRole: boolean
  
  // ===== Job Title Dialog State =====
  showCreateTitleDialog: boolean
  setShowCreateTitleDialog: (v: boolean) => void
  editingJobTitleUser: OrgUser | null
  setEditingJobTitleUser: (user: OrgUser | null) => void
  editingJobTitle: JobTitle | null
  setEditingJobTitle: (title: JobTitle | null) => void
  pendingTitleForUser: OrgUser | null
  setPendingTitleForUser: (user: OrgUser | null) => void
  newTitleName: string
  setNewTitleName: (v: string) => void
  newTitleColor: string
  setNewTitleColor: (v: string) => void
  newTitleIcon: string
  setNewTitleIcon: (v: string) => void
  isCreatingTitle: boolean
  openEditJobTitle: (title: JobTitle) => void
  openCreateJobTitle: () => void
  
  // ===== Pending Member State =====
  viewingPendingMemberPermissions: PendingMember | null
  setViewingPendingMemberPermissions: (pm: PendingMember | null) => void
  pendingMemberDropdownOpen: string | null
  setPendingMemberDropdownOpen: (id: string | null) => void
  editingPendingMember: PendingMember | null
  setEditingPendingMember: (pm: PendingMember | null) => void
  pendingMemberForm: PendingMemberFormData
  setPendingMemberForm: React.Dispatch<React.SetStateAction<PendingMemberFormData>>
  isSavingPendingMember: boolean
  resendingInviteId: string | null
  openEditPendingMember: (pm: PendingMember) => void
  togglePendingMemberTeam: (teamId: string) => void
  togglePendingMemberWorkflowRole: (roleId: string) => void
  togglePendingMemberVault: (vaultId: string) => void
  
  // ===== Org Code State =====
  showOrgCode: boolean
  setShowOrgCode: (v: boolean) => void
  orgCode: string | null
  setOrgCode: (code: string | null) => void
  codeCopied: boolean
  setCodeCopied: (v: boolean) => void
  copyCode: () => Promise<boolean | void>
  
  // ===== Handlers =====
  // Team handlers
  handleCreateTeam: () => Promise<void>
  handleUpdateTeam: () => Promise<void>
  handleDeleteTeam: () => Promise<void>
  handleSetDefaultTeam: (teamId: string | null) => Promise<void>
  handleDeleteTeamDirect: (team: TeamWithDetails) => Promise<void>
  handleUpdateTeamFromManage: () => Promise<void>
  openTeamVaultAccessDialog: (team: TeamWithDetails) => void
  handleSaveTeamVaultAccess: () => Promise<void>
  
  // User handlers
  handleRemoveUser: () => Promise<void>
  handleRemoveFromTeam: (user: OrgUser, teamId: string, teamName: string) => Promise<void>
  executeRemoveFromTeam: (user: OrgUser, teamId: string, teamName: string) => Promise<void>
  handleToggleTeam: (user: OrgUser, teamId: string, isAdding: boolean) => Promise<void>
  handleToggleWorkflowRole: (user: OrgUser, roleId: string, isAdding: boolean) => Promise<void>
  openVaultAccessEditor: (user: OrgUser) => void
  handleSaveVaultAccess: () => Promise<void>
  startUserImpersonation: (userId: string, userData?: OrgUser) => void
  
  // Workflow role handlers
  handleCreateWorkflowRole: () => Promise<void>
  handleUpdateWorkflowRole: () => Promise<void>
  handleDeleteWorkflowRole: (role: { id: string; name: string }) => void
  
  // Job title handlers
  handleChangeJobTitle: (user: OrgUser, titleId: string | null) => Promise<void>
  handleCreateTitle: () => Promise<void>
  handleUpdateJobTitle: () => Promise<void>
  handleDeleteJobTitle: (title: { id: string; name: string }) => void
  updateJobTitleDirect: (titleId: string, name: string, color: string, icon: string) => Promise<void>
  deleteJobTitleDirect: (titleId: string) => Promise<void>
  
  // Pending member handlers
  handleSavePendingMember: () => Promise<void>
  handleResendInvite: (pm: PendingMember) => Promise<void>
  deletePendingMember: (memberId: string) => Promise<boolean>
  
  // Data loaders
  loadAllData: () => Promise<void>
  loadTeams: () => Promise<void>
  loadOrgUsers: () => Promise<void>
  loadPendingMembers: () => Promise<void>
  
  // Vault access helpers
  getUserVaultAccessCount: (userId: string) => number
  
  // Data hook methods for modals
  hookUpdateWorkflowRole: (roleId: string, data: WorkflowRoleFormData) => Promise<boolean>
  hookDeleteWorkflowRole: (roleId: string) => Promise<boolean>
  hookSaveUserWorkflowRoles: (userId: string, roleIds: string[], addedBy: string, userName: string) => Promise<boolean>
  hookSaveUserTeams: (userId: string, teamIds: string[], currentTeamIds: string[], userName: string) => Promise<boolean>
}

// ============================================
// Context
// ============================================

const TeamMembersContext = createContext<TeamMembersContextValue | null>(null)

// ============================================
// Provider
// ============================================

export interface TeamMembersProviderProps {
  children: ReactNode
}

export function TeamMembersProvider({ children }: TeamMembersProviderProps) {
  const {
    user,
    organization,
    setOrganization,
    addToast,
    getEffectiveRole,
    apiServerUrl,
    startUserImpersonation,
    impersonatedUser
  } = usePDMStore()
  
  const orgId = organization?.id ?? null
  const isAdmin = getEffectiveRole() === 'admin'
  const isRealAdmin = user?.role === 'admin'
  
  // ===== Data Hooks =====
  const {
    teams,
    isLoading: teamsLoading,
    loadTeams,
    createTeam: hookCreateTeam,
    updateTeam: hookUpdateTeam,
    deleteTeam: hookDeleteTeam,
    setDefaultTeam: hookSetDefaultTeam
  } = useTeams(orgId)
  
  const {
    members: orgUsers,
    isLoading: membersLoading,
    loadMembers: loadOrgUsers,
    removeMember,
    removeFromTeam: hookRemoveFromTeam,
    toggleTeam: hookToggleTeam,
    saveUserTeams: hookSaveUserTeams
  } = useMembers(orgId)
  
  const {
    pendingMembers,
    isLoading: invitesLoading,
    loadPendingMembers,
    updatePendingMember: hookUpdatePendingMember,
    deletePendingMember,
    resendInvite: hookResendInvite
  } = useInvites(orgId)
  
  const {
    workflowRoles,
    userRoleAssignments: userWorkflowRoleAssignments,
    isLoading: workflowRolesLoading,
    loadWorkflowRoles,
    createWorkflowRole: hookCreateWorkflowRole,
    updateWorkflowRole: hookUpdateWorkflowRole,
    deleteWorkflowRole: hookDeleteWorkflowRole,
    toggleUserRole: hookToggleUserRole,
    saveUserWorkflowRoles: hookSaveUserWorkflowRoles
  } = useWorkflowRoles(orgId)
  
  const {
    jobTitles,
    isLoading: jobTitlesLoading,
    loadJobTitles,
    createJobTitle: hookCreateJobTitle,
    updateJobTitle: hookUpdateJobTitle,
    deleteJobTitle: hookDeleteJobTitle,
    assignJobTitle: hookAssignJobTitle
  } = useJobTitles(orgId)
  
  const {
    vaults: orgVaults,
    teamVaultAccessMap,
    isLoading: vaultAccessLoading,
    loadAll: loadAllVaultData,
    loadTeamVaultAccess,
    saveUserVaultAccess,
    saveTeamVaultAccess,
    getUserAccessibleVaults,
    getUserVaultAccessCount
  } = useVaultAccess(orgId)
  
  const isLoading = teamsLoading || membersLoading || invitesLoading || 
                    workflowRolesLoading || jobTitlesLoading || vaultAccessLoading
  
  // ===== Dialog/UI State Hooks =====
  const {
    selectedTeam, setSelectedTeam,
    showCreateTeamDialog, setShowCreateTeamDialog,
    showEditTeamDialog, setShowEditTeamDialog,
    showDeleteTeamDialog, setShowDeleteTeamDialog,
    showTeamMembersDialog, setShowTeamMembersDialog,
    showTeamVaultAccessDialog, setShowTeamVaultAccessDialog,
    showPermissionsEditor, setShowPermissionsEditor,
    showModulesDialog, setShowModulesDialog,
    teamFormData, setTeamFormData,
    isSavingTeam, setIsSavingTeam,
    copyFromTeamId, setCopyFromTeamId,
    editingTeamFromManage, setEditingTeamFromManage,
    pendingTeamVaultAccess, setPendingTeamVaultAccess,
    isSavingTeamVaultAccess, setIsSavingTeamVaultAccess,
    resetTeamForm,
    openEditTeamDialog,
    openModulesDialog
  } = useTeamDialogs()
  
  const {
    showCreateUserDialog, setShowCreateUserDialog,
    removingUser, setRemovingUser,
    isRemoving, setIsRemoving,
    removingFromTeam, setRemovingFromTeam,
    isRemovingFromTeam, setIsRemovingFromTeam,
    viewingPermissionsUser, setViewingPermissionsUser,
    editingPermissionsUser, setEditingPermissionsUser,
    viewingUserId, setViewingUserId,
    addToTeamUser, setAddToTeamUser,
    editingTeamsUser, setEditingTeamsUser,
    editingVaultAccessUser, setEditingVaultAccessUser,
    pendingVaultAccess, setPendingVaultAccess,
    isSavingVaultAccess, setIsSavingVaultAccess,
    editingWorkflowRolesUser, setEditingWorkflowRolesUser
  } = useUserDialogs()
  
  const {
    showCreateWorkflowRoleDialog, setShowCreateWorkflowRoleDialog,
    showEditWorkflowRoleDialog, setShowEditWorkflowRoleDialog,
    editingWorkflowRole, setEditingWorkflowRole,
    workflowRoleFormData, setWorkflowRoleFormData,
    isSavingWorkflowRole, setIsSavingWorkflowRole
  } = useWorkflowRoleDialogs()
  
  const {
    showCreateTitleDialog, setShowCreateTitleDialog,
    pendingTitleForUser, setPendingTitleForUser,
    newTitleName, setNewTitleName,
    newTitleColor, setNewTitleColor,
    newTitleIcon, setNewTitleIcon,
    isCreatingTitle, setIsCreatingTitle,
    editingJobTitle, setEditingJobTitle,
    editingJobTitleUser, setEditingJobTitleUser,
    openEditTitleDialog: openEditJobTitle,
    openCreateTitleDialog: openCreateJobTitle
  } = useJobTitleDialogs()
  
  const {
    showOrgCode, setShowOrgCode,
    orgCode, setOrgCode,
    codeCopied, setCodeCopied,
    copyCode
  } = useOrgCode()
  
  const {
    activeTab, setActiveTab,
    searchQuery, setSearchQuery,
    isSavingDefaultTeam, setIsSavingDefaultTeam,
    expandedTeams, toggleTeamExpand,
    showUnassignedUsers, setShowUnassignedUsers,
    showPendingMembers, setShowPendingMembers,
    viewingPendingMemberPermissions, setViewingPendingMemberPermissions,
    pendingMemberDropdownOpen, setPendingMemberDropdownOpen,
    editingPendingMember, setEditingPendingMember,
    pendingMemberForm, setPendingMemberForm,
    isSavingPendingMember, setIsSavingPendingMember,
    resendingInviteId, setResendingInviteId,
    openEditPendingMember,
    togglePendingMemberTeam,
    togglePendingMemberWorkflowRole,
    togglePendingMemberVault
  } = useUIState()
  
  // ===== Computed/Filtered Data =====
  const {
    unassignedUsers,
    filteredUnassignedUsers,
    filteredTeams,
    filteredAllUsers
  } = useFilteredData({
    orgUsers,
    teams,
    searchQuery
  })
  
  // ===== Handlers =====
  const handlers = useHandlers({
    user,
    organization,
    setOrganization: setOrganization as (org: unknown) => void,
    addToast,
    
    // Data hook methods - Teams
    hookCreateTeam,
    hookUpdateTeam,
    hookDeleteTeam,
    hookSetDefaultTeam,
    
    // Data hook methods - Members
    removeMember,
    hookRemoveFromTeam,
    hookToggleTeam,
    
    // Data hook methods - Invites
    hookUpdatePendingMember,
    hookResendInvite,
    
    // Data hook methods - Workflow Roles
    hookCreateWorkflowRole,
    hookUpdateWorkflowRole,
    hookDeleteWorkflowRole,
    hookToggleUserRole,
    
    // Data hook methods - Job Titles
    hookCreateJobTitle,
    hookUpdateJobTitle,
    hookDeleteJobTitle,
    hookAssignJobTitle,
    
    // Data hook methods - Vault Access
    saveTeamVaultAccess,
    saveUserVaultAccess,
    getUserAccessibleVaults,
    
    // Data refresh functions
    loadTeams,
    loadOrgUsers,
    loadPendingMembers,
    loadWorkflowRoles,
    loadJobTitles,
    loadTeamVaultAccess,
    loadAllVaultData,
    
    // Team dialog state
    selectedTeam,
    setSelectedTeam,
    showCreateTeamDialog,
    setShowCreateTeamDialog,
    showEditTeamDialog,
    setShowEditTeamDialog,
    showDeleteTeamDialog,
    setShowDeleteTeamDialog,
    showTeamVaultAccessDialog,
    setShowTeamVaultAccessDialog,
    showModulesDialog,
    setShowModulesDialog,
    teamFormData,
    setTeamFormData,
    isSavingTeam,
    setIsSavingTeam,
    copyFromTeamId,
    editingTeamFromManage,
    setEditingTeamFromManage,
    pendingTeamVaultAccess,
    isSavingTeamVaultAccess,
    setIsSavingTeamVaultAccess,
    teamVaultAccessMap,
    setPendingTeamVaultAccess,
    resetTeamForm,
    
    // User dialog state
    removingUser,
    setRemovingUser,
    isRemoving,
    setIsRemoving,
    removingFromTeam,
    setRemovingFromTeam,
    isRemovingFromTeam,
    setIsRemovingFromTeam,
    editingVaultAccessUser,
    setEditingVaultAccessUser,
    pendingVaultAccess,
    setPendingVaultAccess,
    isSavingVaultAccess,
    setIsSavingVaultAccess,
    
    // Workflow role dialog state
    showCreateWorkflowRoleDialog,
    setShowCreateWorkflowRoleDialog,
    showEditWorkflowRoleDialog,
    setShowEditWorkflowRoleDialog,
    editingWorkflowRole,
    setEditingWorkflowRole,
    workflowRoleFormData,
    setWorkflowRoleFormData,
    isSavingWorkflowRole,
    setIsSavingWorkflowRole,
    
    // Job title dialog state
    showCreateTitleDialog,
    setShowCreateTitleDialog,
    pendingTitleForUser,
    setPendingTitleForUser,
    newTitleName,
    setNewTitleName,
    newTitleColor,
    setNewTitleColor,
    newTitleIcon,
    setNewTitleIcon,
    isCreatingTitle,
    setIsCreatingTitle,
    editingJobTitle,
    setEditingJobTitle,
    jobTitles,
    
    // Pending member state
    editingPendingMember,
    setEditingPendingMember,
    pendingMemberForm,
    isSavingPendingMember,
    setIsSavingPendingMember,
    setResendingInviteId,
    
    // Default team state
    isSavingDefaultTeam,
    setIsSavingDefaultTeam
  })
  
  // ===== Context Value (memoized) =====
  const value = useMemo<TeamMembersContextValue>(() => ({
    // Data
    teams,
    orgUsers,
    pendingMembers,
    workflowRoles,
    jobTitles,
    orgVaults,
    userWorkflowRoleAssignments,
    teamVaultAccessMap,
    
    // Computed/Filtered Data
    filteredTeams,
    filteredAllUsers,
    unassignedUsers,
    filteredUnassignedUsers,
    
    // Loading State
    isLoading,
    
    // Current User Info
    user,
    organization,
    isAdmin,
    isRealAdmin,
    impersonatedUserId: impersonatedUser?.id,
    apiServerUrl,
    
    // UI State
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    expandedTeams,
    toggleTeamExpand,
    showUnassignedUsers,
    setShowUnassignedUsers,
    showPendingMembers,
    setShowPendingMembers,
    
    // Team Dialog State
    selectedTeam,
    setSelectedTeam,
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
    teamFormData,
    setTeamFormData,
    isSavingTeam,
    copyFromTeamId,
    setCopyFromTeamId,
    editingTeamFromManage,
    setEditingTeamFromManage,
    pendingTeamVaultAccess,
    setPendingTeamVaultAccess,
    isSavingTeamVaultAccess,
    isSavingDefaultTeam,
    resetTeamForm,
    openEditTeamDialog,
    openModulesDialog,
    
    // User Dialog State
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
    
    // Workflow Role Dialog State
    showCreateWorkflowRoleDialog,
    setShowCreateWorkflowRoleDialog,
    showEditWorkflowRoleDialog,
    setShowEditWorkflowRoleDialog,
    editingWorkflowRole,
    setEditingWorkflowRole,
    workflowRoleFormData,
    setWorkflowRoleFormData,
    isSavingWorkflowRole,
    
    // Job Title Dialog State
    showCreateTitleDialog,
    setShowCreateTitleDialog,
    editingJobTitleUser,
    setEditingJobTitleUser,
    editingJobTitle,
    setEditingJobTitle,
    pendingTitleForUser,
    setPendingTitleForUser,
    newTitleName,
    setNewTitleName,
    newTitleColor,
    setNewTitleColor,
    newTitleIcon,
    setNewTitleIcon,
    isCreatingTitle,
    openEditJobTitle,
    openCreateJobTitle,
    
    // Pending Member State
    viewingPendingMemberPermissions,
    setViewingPendingMemberPermissions,
    pendingMemberDropdownOpen,
    setPendingMemberDropdownOpen,
    editingPendingMember,
    setEditingPendingMember,
    pendingMemberForm,
    setPendingMemberForm,
    isSavingPendingMember,
    resendingInviteId,
    openEditPendingMember,
    togglePendingMemberTeam,
    togglePendingMemberWorkflowRole,
    togglePendingMemberVault,
    
    // Org Code State
    showOrgCode,
    setShowOrgCode,
    orgCode,
    setOrgCode,
    codeCopied,
    setCodeCopied,
    copyCode,
    
    // Handlers
    handleCreateTeam: handlers.handleCreateTeam,
    handleUpdateTeam: handlers.handleUpdateTeam,
    handleDeleteTeam: handlers.handleDeleteTeam,
    handleSetDefaultTeam: handlers.handleSetDefaultTeam,
    handleDeleteTeamDirect: handlers.handleDeleteTeamDirect,
    handleUpdateTeamFromManage: handlers.handleUpdateTeamFromManage,
    openTeamVaultAccessDialog: handlers.openTeamVaultAccessDialog,
    handleSaveTeamVaultAccess: handlers.handleSaveTeamVaultAccess,
    
    handleRemoveUser: handlers.handleRemoveUser,
    handleRemoveFromTeam: handlers.handleRemoveFromTeam,
    executeRemoveFromTeam: handlers.executeRemoveFromTeam,
    handleToggleTeam: handlers.handleToggleTeam,
    handleToggleWorkflowRole: handlers.handleToggleWorkflowRole,
    openVaultAccessEditor: handlers.openVaultAccessEditor,
    handleSaveVaultAccess: handlers.handleSaveVaultAccess,
    startUserImpersonation,
    
    handleCreateWorkflowRole: handlers.handleCreateWorkflowRole,
    handleUpdateWorkflowRole: handlers.handleUpdateWorkflowRole,
    handleDeleteWorkflowRole: handlers.handleDeleteWorkflowRole,
    
    handleChangeJobTitle: handlers.handleChangeJobTitle,
    handleCreateTitle: handlers.handleCreateTitle,
    handleUpdateJobTitle: handlers.handleUpdateJobTitle,
    handleDeleteJobTitle: handlers.handleDeleteJobTitle,
    updateJobTitleDirect: handlers.updateJobTitleDirect,
    deleteJobTitleDirect: handlers.deleteJobTitleDirect,
    
    handleSavePendingMember: handlers.handleSavePendingMember,
    handleResendInvite: handlers.handleResendInvite,
    deletePendingMember,
    
    // Data loaders
    loadAllData: handlers.loadAllData,
    loadTeams,
    loadOrgUsers,
    loadPendingMembers,
    
    // Vault access helpers
    getUserVaultAccessCount,
    
    // Data hook methods for modals
    hookUpdateWorkflowRole,
    hookDeleteWorkflowRole,
    hookSaveUserWorkflowRoles,
    hookSaveUserTeams
  }), [
    teams, orgUsers, pendingMembers, workflowRoles, jobTitles, orgVaults,
    userWorkflowRoleAssignments, teamVaultAccessMap,
    filteredTeams, filteredAllUsers, unassignedUsers, filteredUnassignedUsers,
    isLoading,
    user, organization, isAdmin, isRealAdmin, impersonatedUser?.id, apiServerUrl,
    activeTab, setActiveTab, searchQuery, setSearchQuery,
    expandedTeams, toggleTeamExpand, showUnassignedUsers, setShowUnassignedUsers,
    showPendingMembers, setShowPendingMembers,
    selectedTeam, setSelectedTeam,
    showCreateTeamDialog, setShowCreateTeamDialog,
    showEditTeamDialog, setShowEditTeamDialog,
    showDeleteTeamDialog, setShowDeleteTeamDialog,
    showTeamMembersDialog, setShowTeamMembersDialog,
    showTeamVaultAccessDialog, setShowTeamVaultAccessDialog,
    showPermissionsEditor, setShowPermissionsEditor,
    showModulesDialog, setShowModulesDialog,
    teamFormData, setTeamFormData,
    isSavingTeam, copyFromTeamId, setCopyFromTeamId,
    editingTeamFromManage, setEditingTeamFromManage,
    pendingTeamVaultAccess, setPendingTeamVaultAccess,
    isSavingTeamVaultAccess, isSavingDefaultTeam,
    resetTeamForm, openEditTeamDialog, openModulesDialog,
    showCreateUserDialog, setShowCreateUserDialog,
    removingUser, setRemovingUser, isRemoving,
    removingFromTeam, setRemovingFromTeam, isRemovingFromTeam,
    editingPermissionsUser, setEditingPermissionsUser,
    viewingPermissionsUser, setViewingPermissionsUser,
    viewingUserId, setViewingUserId,
    addToTeamUser, setAddToTeamUser,
    editingTeamsUser, setEditingTeamsUser,
    editingVaultAccessUser, setEditingVaultAccessUser,
    pendingVaultAccess, setPendingVaultAccess, isSavingVaultAccess,
    editingWorkflowRolesUser, setEditingWorkflowRolesUser,
    showCreateWorkflowRoleDialog, setShowCreateWorkflowRoleDialog,
    showEditWorkflowRoleDialog, setShowEditWorkflowRoleDialog,
    editingWorkflowRole, setEditingWorkflowRole,
    workflowRoleFormData, setWorkflowRoleFormData, isSavingWorkflowRole,
    showCreateTitleDialog, setShowCreateTitleDialog,
    editingJobTitleUser, setEditingJobTitleUser,
    editingJobTitle, setEditingJobTitle,
    pendingTitleForUser, setPendingTitleForUser,
    newTitleName, setNewTitleName, newTitleColor, setNewTitleColor,
    newTitleIcon, setNewTitleIcon, isCreatingTitle,
    openEditJobTitle, openCreateJobTitle,
    viewingPendingMemberPermissions, setViewingPendingMemberPermissions,
    pendingMemberDropdownOpen, setPendingMemberDropdownOpen,
    editingPendingMember, setEditingPendingMember,
    pendingMemberForm, setPendingMemberForm, isSavingPendingMember,
    resendingInviteId, openEditPendingMember,
    togglePendingMemberTeam, togglePendingMemberWorkflowRole, togglePendingMemberVault,
    showOrgCode, setShowOrgCode, orgCode, setOrgCode, codeCopied, setCodeCopied, copyCode,
    handlers, startUserImpersonation,
    loadTeams, loadOrgUsers, loadPendingMembers,
    getUserVaultAccessCount,
    hookUpdateWorkflowRole, hookDeleteWorkflowRole,
    hookSaveUserWorkflowRoles, hookSaveUserTeams,
    deletePendingMember
  ])
  
  return (
    <TeamMembersContext.Provider value={value}>
      {children}
    </TeamMembersContext.Provider>
  )
}

// ============================================
// Consumer Hook
// ============================================

export function useTeamMembersContext(): TeamMembersContextValue {
  const context = useContext(TeamMembersContext)
  if (!context) {
    throw new Error('useTeamMembersContext must be used within TeamMembersProvider')
  }
  return context
}
