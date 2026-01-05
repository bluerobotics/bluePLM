/**
 * Types for TeamMembersSettings components
 * 
 * This module defines all TypeScript interfaces and types used
 * across the team members settings feature.
 * 
 * @module team-members/types
 */

import type { Team, TeamMember, PermissionAction } from '@/types/permissions'
import type { Json } from '@/types/supabase'

// ============================================
// Core Data Types
// ============================================

export interface WorkflowRoleBasic {
  id: string
  name: string
  color: string
  icon: string
  description?: string | null
}

export interface OrgUser {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  custom_avatar_url: string | null
  role: string
  last_sign_in: string | null
  last_online: string | null
  teams?: { id: string; name: string; color: string; icon: string }[]
  job_title?: { id: string; name: string; color: string; icon: string } | null
  workflow_roles?: WorkflowRoleBasic[]
}

export interface Vault {
  id: string
  name: string
  slug: string
  description: string | null
  storage_bucket: string
  is_default: boolean
  created_at: string
}

export interface TeamWithDetails extends Team {
  member_count: number
  permissions_count: number
  vault_access?: string[] // vault IDs
  module_defaults?: Json | Record<string, unknown> | null
}

export interface PendingMember {
  id: string
  email: string
  full_name: string | null
  role: string
  team_ids: string[]
  workflow_role_ids: string[]
  vault_ids: string[]
  created_at: string
  created_by: string | null
  notes: string | null
  claimed_at: string | null
}

export interface JobTitle {
  id: string
  name: string
  color: string
  icon: string
}

// ============================================
// Form Data Types
// ============================================

/** Form data for creating/editing a team */
export interface TeamFormData {
  name: string
  description: string
  color: string
  icon: string
  is_default: boolean
}

export interface WorkflowRoleFormData {
  name: string
  color: string
  icon: string
  description: string
}

export interface PendingMemberFormData {
  full_name: string
  team_ids: string[]
  workflow_role_ids: string[]
  vault_ids: string[]
}

// ============================================
// Component Props Types
// ============================================

/** Props for the UserRow component - displays a single user with actions */
export interface UserRowProps {
  user: OrgUser
  isAdmin: boolean
  isRealAdmin?: boolean
  isCurrentUser: boolean
  onViewProfile: () => void
  onRemove: () => void
  onRemoveFromTeam?: () => void
  onVaultAccess: () => void
  onPermissions?: () => void
  onViewNetPermissions?: () => void
  onSimulatePermissions?: () => void
  isSimulating?: boolean
  vaultAccessCount: number
  compact?: boolean
  onEditJobTitle?: (user: OrgUser) => void
  jobTitles?: JobTitle[]
  onToggleJobTitle?: (user: OrgUser, titleId: string | null) => Promise<void>
  workflowRoles?: WorkflowRoleBasic[]
  userWorkflowRoleIds?: string[]
  onEditWorkflowRoles?: (user: OrgUser) => void
  teams?: { id: string; name: string; color: string; icon: string }[]
  onEditTeams?: (user: OrgUser) => void
  onToggleTeam?: (user: OrgUser, teamId: string, isAdding: boolean) => Promise<void>
  onToggleWorkflowRole?: (user: OrgUser, roleId: string, isAdding: boolean) => Promise<void>
}

export interface TeamFormDialogProps {
  title: string
  formData: TeamFormData
  setFormData: (data: TeamFormData) => void
  onSave: () => Promise<void> | void
  onCancel: () => void
  isSaving: boolean
  existingTeams?: TeamWithDetails[]
  copyFromTeamId?: string | null
  setCopyFromTeamId?: (id: string | null) => void
  /** Disable name editing (e.g., for Administrators team) */
  disableNameEdit?: boolean
}

export interface TeamMembersDialogProps {
  team: TeamWithDetails
  orgUsers: OrgUser[]
  onClose: () => void
  userId?: string
}

export interface WorkflowRolesModalProps {
  user: OrgUser
  workflowRoles: WorkflowRoleBasic[]
  userRoleIds: string[]
  onClose: () => void
  onSave: (roleIds: string[]) => Promise<void>
  onUpdateRole: (roleId: string, name: string, color: string, icon: string) => Promise<void>
  onDeleteRole: (roleId: string) => Promise<void>
  onCreateRole?: () => void
}

export interface UserTeamsModalProps {
  user: OrgUser
  allTeams: { id: string; name: string; color: string; icon: string }[]
  userTeamIds: string[]
  onClose: () => void
  onSave: (teamIds: string[]) => Promise<void>
  onCreateTeam?: () => void
}

export interface UserJobTitleModalProps {
  user: OrgUser
  jobTitles: JobTitle[]
  onClose: () => void
  onSelectTitle: (titleId: string | null) => Promise<void>
  onCreateTitle: () => void
  onUpdateTitle?: (titleId: string, name: string, color: string, icon: string) => Promise<void>
  onDeleteTitle?: (titleId: string) => Promise<void>
  isAdmin?: boolean
}

export interface UserPermissionsDialogProps {
  user: OrgUser
  onClose: () => void
  currentUserId?: string
}

export interface ViewNetPermissionsModalProps {
  user: OrgUser
  vaultAccessCount: number
  orgVaults: Vault[]
  teams: TeamWithDetails[]
  onClose: () => void
}

export interface TeamModulesDialogProps {
  team: TeamWithDetails
  onClose: () => void
}

/** Props for the RemoveUserDialog component */
export interface RemoveUserDialogProps {
  user: OrgUser
  onConfirm: () => Promise<void>
  onCancel: () => void
  isRemoving: boolean
}

/** Props for the RemoveFromAdminsDialog component */
export interface RemoveFromAdminsDialogProps {
  user: OrgUser
  teamName: string
  onConfirm: () => Promise<void>
  onCancel: () => void
  isRemoving: boolean
}

/** Props for the CreateUserDialog component */
export interface CreateUserDialogProps {
  onClose: () => void
  teams: TeamWithDetails[]
  workflowRoles: WorkflowRoleBasic[]
  vaults: Vault[]
  onSuccess: () => void
}

// ============================================
// Hook Return Types
// ============================================

/** Return type for useTeams hook */
export interface UseTeamsReturn {
  teams: TeamWithDetails[]
  isLoading: boolean
  loadTeams: () => Promise<void>
  createTeam: (data: TeamFormData, copyFromTeamId?: string | null) => Promise<boolean>
  updateTeam: (teamId: string, data: Partial<TeamFormData>) => Promise<boolean>
  deleteTeam: (teamId: string) => Promise<boolean>
  setDefaultTeam: (teamId: string | null, organizationId: string, setOrganization: (org: any) => void, organization: any) => Promise<boolean>
}

/** Return type for useMembers hook */
export interface UseMembersReturn {
  members: OrgUser[]
  isLoading: boolean
  loadMembers: () => Promise<void>
  removeMember: (userId: string) => Promise<boolean>
  removeFromTeam: (userId: string, teamId: string, teamName: string) => Promise<boolean>
  toggleTeam: (userId: string, teamId: string, isAdding: boolean) => Promise<boolean>
}

/** Return type for useInvites hook */
export interface UseInvitesReturn {
  pendingMembers: PendingMember[]
  isLoading: boolean
  loadPendingMembers: () => Promise<void>
  updatePendingMember: (memberId: string, data: PendingMemberFormData) => Promise<boolean>
  deletePendingMember: (memberId: string) => Promise<boolean>
  resendInvite: (pm: PendingMember) => Promise<boolean>
}

/** Return type for useWorkflowRoles hook */
export interface UseWorkflowRolesReturn {
  workflowRoles: WorkflowRoleBasic[]
  userRoleAssignments: Record<string, string[]>
  isLoading: boolean
  loadWorkflowRoles: () => Promise<void>
  createWorkflowRole: (data: WorkflowRoleFormData) => Promise<boolean>
  updateWorkflowRole: (roleId: string, data: Partial<WorkflowRoleFormData>) => Promise<boolean>
  deleteWorkflowRole: (roleId: string) => Promise<boolean>
  toggleUserRole: (userId: string, roleId: string, isAdding: boolean, addedBy?: string) => Promise<boolean>
}

/** Return type for useJobTitles hook */
export interface UseJobTitlesReturn {
  jobTitles: JobTitle[]
  isLoading: boolean
  loadJobTitles: () => Promise<void>
  createJobTitle: (name: string, color: string, icon: string, assignToUserId?: string) => Promise<boolean>
  updateJobTitle: (titleId: string, name: string, color: string, icon: string) => Promise<boolean>
  deleteJobTitle: (titleId: string) => Promise<boolean>
  assignJobTitle: (user: OrgUser, titleId: string | null) => Promise<boolean>
}

/** Return type for useVaultAccess hook */
export interface UseVaultAccessReturn {
  vaults: Vault[]
  vaultAccessMap: Record<string, string[]>
  teamVaultAccessMap: Record<string, string[]>
  isLoading: boolean
  loadVaults: () => Promise<void>
  loadVaultAccess: () => Promise<void>
  loadTeamVaultAccess: () => Promise<void>
  loadAll: () => Promise<void>
  saveUserVaultAccess: (userId: string, vaultIds: string[], userName: string) => Promise<boolean>
  saveTeamVaultAccess: (teamId: string, vaultIds: string[], teamName: string) => Promise<boolean>
  getUserAccessibleVaults: (userId: string) => string[]
  getUserVaultAccessCount: (userId: string) => number
}

// ============================================
// Re-exports
// ============================================

// Re-export types from permissions for convenience
export type { Team, TeamMember, PermissionAction }
