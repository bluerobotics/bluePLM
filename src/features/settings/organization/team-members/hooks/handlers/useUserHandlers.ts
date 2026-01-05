/**
 * useUserHandlers - User management handler functions
 * 
 * Provides handlers for user removal, team membership, and vault access.
 */
import { useCallback } from 'react'
import type { OrgUser } from '../../types'

export interface UseUserHandlersParams {
  // Current user
  user: { id: string } | null
  
  // Data hook methods
  removeMember: (userId: string) => Promise<boolean>
  hookRemoveFromTeam: (userId: string, teamId: string, teamName: string) => Promise<boolean>
  hookToggleTeam: (userId: string, teamId: string, isAdding: boolean) => Promise<boolean>
  hookToggleUserRole: (userId: string, roleId: string, isAdding: boolean, addedBy?: string) => Promise<boolean>
  saveUserVaultAccess: (userId: string, vaultIds: string[], userName: string) => Promise<boolean>
  getUserAccessibleVaults: (userId: string) => string[]
  
  // Refresh functions
  loadTeams: () => Promise<void>
  
  // Dialog state
  removingUser: OrgUser | null
  setRemovingUser: (user: OrgUser | null) => void
  setIsRemoving: (v: boolean) => void
  setRemovingFromTeam: (v: { user: OrgUser; teamId: string; teamName: string } | null) => void
  setIsRemovingFromTeam: (v: boolean) => void
  editingVaultAccessUser: OrgUser | null
  setEditingVaultAccessUser: (user: OrgUser | null) => void
  pendingVaultAccess: string[]
  setPendingVaultAccess: (ids: string[]) => void
  setIsSavingVaultAccess: (v: boolean) => void
}

export function useUserHandlers(params: UseUserHandlersParams) {
  const {
    user,
    removeMember,
    hookRemoveFromTeam,
    hookToggleTeam,
    hookToggleUserRole,
    saveUserVaultAccess,
    getUserAccessibleVaults,
    loadTeams,
    removingUser,
    setRemovingUser,
    setIsRemoving,
    setRemovingFromTeam,
    setIsRemovingFromTeam,
    editingVaultAccessUser,
    setEditingVaultAccessUser,
    pendingVaultAccess,
    setPendingVaultAccess,
    setIsSavingVaultAccess
  } = params

  const handleRemoveUser = useCallback(async () => {
    if (!removingUser) return
    
    setIsRemoving(true)
    try {
      const success = await removeMember(removingUser.id)
      if (success) {
        setRemovingUser(null)
      }
    } finally {
      setIsRemoving(false)
    }
  }, [removingUser, removeMember, setIsRemoving, setRemovingUser])

  const executeRemoveFromTeam = useCallback(async (targetUser: OrgUser, teamId: string, teamName: string) => {
    setIsRemovingFromTeam(true)
    try {
      const success = await hookRemoveFromTeam(targetUser.id, teamId, teamName)
      if (success) {
        setRemovingFromTeam(null)
        loadTeams()
      }
    } finally {
      setIsRemovingFromTeam(false)
    }
  }, [hookRemoveFromTeam, setIsRemovingFromTeam, setRemovingFromTeam, loadTeams])

  const handleRemoveFromTeam = useCallback(async (targetUser: OrgUser, teamId: string, teamName: string) => {
    // If removing yourself from Administrators, show confirmation
    if (targetUser.id === user?.id && teamName === 'Administrators') {
      setRemovingFromTeam({ user: targetUser, teamId, teamName })
      return
    }
    
    await executeRemoveFromTeam(targetUser, teamId, teamName)
  }, [user?.id, setRemovingFromTeam, executeRemoveFromTeam])

  const handleToggleTeam = useCallback(async (targetUser: OrgUser, teamId: string, isAdding: boolean) => {
    await hookToggleTeam(targetUser.id, teamId, isAdding)
    loadTeams()
  }, [hookToggleTeam, loadTeams])

  const handleToggleWorkflowRole = useCallback(async (targetUser: OrgUser, roleId: string, isAdding: boolean) => {
    await hookToggleUserRole(targetUser.id, roleId, isAdding, user?.id)
  }, [hookToggleUserRole, user?.id])

  const openVaultAccessEditor = useCallback((targetUser: OrgUser) => {
    setEditingVaultAccessUser(targetUser)
    setPendingVaultAccess(getUserAccessibleVaults(targetUser.id))
  }, [setEditingVaultAccessUser, setPendingVaultAccess, getUserAccessibleVaults])

  const handleSaveVaultAccess = useCallback(async () => {
    if (!editingVaultAccessUser) return
    
    setIsSavingVaultAccess(true)
    try {
      const success = await saveUserVaultAccess(
        editingVaultAccessUser.id,
        pendingVaultAccess,
        editingVaultAccessUser.full_name || editingVaultAccessUser.email
      )
      if (success) {
        setEditingVaultAccessUser(null)
      }
    } finally {
      setIsSavingVaultAccess(false)
    }
  }, [editingVaultAccessUser, pendingVaultAccess, saveUserVaultAccess, setIsSavingVaultAccess, setEditingVaultAccessUser])

  return {
    handleRemoveUser,
    handleRemoveFromTeam,
    executeRemoveFromTeam,
    handleToggleTeam,
    handleToggleWorkflowRole,
    openVaultAccessEditor,
    handleSaveVaultAccess
  }
}
