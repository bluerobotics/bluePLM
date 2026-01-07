import { useState, useCallback } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import type { OrgUser } from '../types'

export function useUserDialogs() {
  // === State from Zustand store (shared across components) ===
  const {
    removingUser,
    setRemovingUser,
    isRemoving,
    setIsRemoving,
    editingTeamsUser,
    setEditingTeamsUser
  } = usePDMStore()
  
  // === Local state (component-specific dialogs) ===
  
  // Create user dialog
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false)
  
  // Remove from team confirmation (for removing self from Administrators)
  const [removingFromTeam, setRemovingFromTeam] = useState<{ user: OrgUser; teamId: string; teamName: string } | null>(null)
  const [isRemovingFromTeam, setIsRemovingFromTeam] = useState(false)
  
  // View/edit permissions
  const [viewingPermissionsUser, setViewingPermissionsUser] = useState<OrgUser | null>(null)
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<OrgUser | null>(null)
  
  // User profile
  const [viewingUserId, setViewingUserId] = useState<string | null>(null)
  
  // Add to team
  const [addToTeamUser, setAddToTeamUser] = useState<OrgUser | null>(null)
  
  // User vault access
  const [editingVaultAccessUser, setEditingVaultAccessUser] = useState<OrgUser | null>(null)
  const [pendingVaultAccess, setPendingVaultAccess] = useState<string[]>([])
  const [isSavingVaultAccess, setIsSavingVaultAccess] = useState(false)
  
  // User workflow roles
  const [editingWorkflowRolesUser, setEditingWorkflowRolesUser] = useState<OrgUser | null>(null)
  
  // Helper functions
  const openRemoveUserDialog = useCallback((user: OrgUser) => {
    setRemovingUser(user)
  }, [setRemovingUser])
  
  const closeRemoveUserDialog = useCallback(() => {
    setRemovingUser(null)
    setIsRemoving(false)
  }, [setRemovingUser, setIsRemoving])
  
  const openViewPermissions = useCallback((user: OrgUser) => {
    setViewingPermissionsUser(user)
  }, [])
  
  const openEditPermissions = useCallback((user: OrgUser) => {
    setEditingPermissionsUser(user)
  }, [])
  
  const openUserProfile = useCallback((userId: string) => {
    setViewingUserId(userId)
  }, [])
  
  const openAddToTeam = useCallback((user: OrgUser) => {
    setAddToTeamUser(user)
  }, [])
  
  const openEditTeams = useCallback((user: OrgUser) => {
    setEditingTeamsUser(user)
  }, [setEditingTeamsUser])
  
  const openVaultAccess = useCallback((user: OrgUser, currentVaultIds: string[]) => {
    setEditingVaultAccessUser(user)
    setPendingVaultAccess(currentVaultIds)
  }, [])
  
  const openWorkflowRoles = useCallback((user: OrgUser) => {
    setEditingWorkflowRolesUser(user)
  }, [])
  
  const closeAllUserDialogs = useCallback(() => {
    setShowCreateUserDialog(false)
    setRemovingUser(null)
    setIsRemoving(false)
    setRemovingFromTeam(null)
    setIsRemovingFromTeam(false)
    setViewingPermissionsUser(null)
    setEditingPermissionsUser(null)
    setViewingUserId(null)
    setAddToTeamUser(null)
    setEditingTeamsUser(null)
    setEditingVaultAccessUser(null)
    setPendingVaultAccess([])
    setIsSavingVaultAccess(false)
    setEditingWorkflowRolesUser(null)
  }, [setRemovingUser, setIsRemoving, setEditingTeamsUser])
  
  return {
    // State
    showCreateUserDialog,
    setShowCreateUserDialog,
    removingUser,
    setRemovingUser,
    isRemoving,
    setIsRemoving,
    removingFromTeam,
    setRemovingFromTeam,
    isRemovingFromTeam,
    setIsRemovingFromTeam,
    viewingPermissionsUser,
    setViewingPermissionsUser,
    editingPermissionsUser,
    setEditingPermissionsUser,
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
    setIsSavingVaultAccess,
    editingWorkflowRolesUser,
    setEditingWorkflowRolesUser,
    
    // Actions
    openRemoveUserDialog,
    closeRemoveUserDialog,
    openViewPermissions,
    openEditPermissions,
    openUserProfile,
    openAddToTeam,
    openEditTeams,
    openVaultAccess,
    openWorkflowRoles,
    closeAllUserDialogs
  }
}
