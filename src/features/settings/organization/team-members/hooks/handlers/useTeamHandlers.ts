/**
 * useTeamHandlers - Team-related handler functions
 * 
 * Provides handlers for team CRUD operations and vault access management.
 */
import { useCallback } from 'react'
import type { TeamWithDetails, TeamFormData } from '../../types'

/** Organization type with optional default team field */
type OrganizationWithDefaultTeam = {
  id: string
  default_new_user_team_id?: string | null
  [key: string]: unknown
}

export interface UseTeamHandlersParams {
  // Data hook methods
  hookCreateTeam: (formData: TeamFormData, copyFromTeamId?: string | null) => Promise<boolean>
  hookUpdateTeam: (teamId: string, formData: TeamFormData) => Promise<boolean>
  hookDeleteTeam: (teamId: string) => Promise<boolean>
  hookSetDefaultTeam: <T extends { default_new_user_team_id?: string | null }>(
    teamId: string | null,
    orgId: string,
    setOrg: (org: T) => void,
    org: T
  ) => Promise<boolean>
  saveTeamVaultAccess: (teamId: string, vaultIds: string[], teamName: string) => Promise<boolean>
  
  // Refresh functions
  loadTeams: () => Promise<void>
  loadOrgUsers: () => Promise<void>
  loadTeamVaultAccess: () => Promise<void>
  
  // Organization
  organization: OrganizationWithDefaultTeam | null
  setOrganization: (org: OrganizationWithDefaultTeam) => void
  addToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
  
  // Dialog state
  selectedTeam: TeamWithDetails | null
  setSelectedTeam: (team: TeamWithDetails | null) => void
  setShowCreateTeamDialog: (v: boolean) => void
  setShowEditTeamDialog: (v: boolean) => void
  setShowDeleteTeamDialog: (v: boolean) => void
  setShowTeamVaultAccessDialog: (v: boolean) => void
  teamFormData: TeamFormData
  setIsSavingTeam: (v: boolean) => void
  copyFromTeamId: string | null
  editingTeamFromManage: TeamWithDetails | null
  setEditingTeamFromManage: (team: TeamWithDetails | null) => void
  pendingTeamVaultAccess: string[]
  setIsSavingTeamVaultAccess: (v: boolean) => void
  teamVaultAccessMap: Record<string, string[]>
  setPendingTeamVaultAccess: (ids: string[]) => void
  resetTeamForm: () => void
  setIsSavingDefaultTeam: (v: boolean) => void
}

export function useTeamHandlers(params: UseTeamHandlersParams) {
  const {
    hookCreateTeam,
    hookUpdateTeam,
    hookDeleteTeam,
    hookSetDefaultTeam,
    saveTeamVaultAccess,
    loadTeams: _loadTeams, // Used by other handlers, not in this hook
    loadOrgUsers,
    loadTeamVaultAccess,
    organization,
    setOrganization,
    addToast,
    selectedTeam,
    setSelectedTeam,
    setShowCreateTeamDialog,
    setShowEditTeamDialog,
    setShowDeleteTeamDialog,
    setShowTeamVaultAccessDialog,
    teamFormData,
    setIsSavingTeam,
    copyFromTeamId,
    editingTeamFromManage,
    setEditingTeamFromManage,
    pendingTeamVaultAccess,
    setIsSavingTeamVaultAccess,
    teamVaultAccessMap,
    setPendingTeamVaultAccess,
    resetTeamForm,
    setIsSavingDefaultTeam
  } = params

  const handleCreateTeam = useCallback(async () => {
    if (!teamFormData.name.trim()) return
    
    setIsSavingTeam(true)
    try {
      const success = await hookCreateTeam(teamFormData, copyFromTeamId)
      if (success) {
        setShowCreateTeamDialog(false)
        resetTeamForm()
        loadTeamVaultAccess()
      }
    } finally {
      setIsSavingTeam(false)
    }
  }, [teamFormData, copyFromTeamId, hookCreateTeam, setIsSavingTeam, setShowCreateTeamDialog, resetTeamForm, loadTeamVaultAccess])

  const handleUpdateTeam = useCallback(async () => {
    if (!selectedTeam || !teamFormData.name.trim()) return
    
    setIsSavingTeam(true)
    try {
      const success = await hookUpdateTeam(selectedTeam.id, teamFormData)
      if (success) {
        setShowEditTeamDialog(false)
        setSelectedTeam(null)
        resetTeamForm()
      }
    } finally {
      setIsSavingTeam(false)
    }
  }, [selectedTeam, teamFormData, hookUpdateTeam, setIsSavingTeam, setShowEditTeamDialog, setSelectedTeam, resetTeamForm])

  const handleDeleteTeam = useCallback(async () => {
    if (!selectedTeam) return
    
    setIsSavingTeam(true)
    try {
      const success = await hookDeleteTeam(selectedTeam.id)
      if (success) {
        setShowDeleteTeamDialog(false)
        setSelectedTeam(null)
        loadOrgUsers()
      }
    } finally {
      setIsSavingTeam(false)
    }
  }, [selectedTeam, hookDeleteTeam, setIsSavingTeam, setShowDeleteTeamDialog, setSelectedTeam, loadOrgUsers])

  const handleSetDefaultTeam = useCallback(async (teamId: string | null) => {
    if (!organization?.id) return
    
    setIsSavingDefaultTeam(true)
    try {
      await hookSetDefaultTeam(teamId, organization.id, setOrganization, organization)
    } finally {
      setIsSavingDefaultTeam(false)
    }
  }, [organization, hookSetDefaultTeam, setOrganization, setIsSavingDefaultTeam])

  const handleDeleteTeamDirect = useCallback(async (team: { id: string; name: string }) => {
    if (team.name === 'Administrators') {
      addToast('error', 'Cannot delete the Administrators team')
      return
    }
    
    if (!confirm(`Delete "${team.name}"? All members will be removed from this team.`)) return
    
    const success = await hookDeleteTeam(team.id)
    if (success) {
      loadOrgUsers()
    }
  }, [hookDeleteTeam, loadOrgUsers, addToast])

  const handleUpdateTeamFromManage = useCallback(async () => {
    if (!editingTeamFromManage) return
    
    setIsSavingTeam(true)
    try {
      const success = await hookUpdateTeam(editingTeamFromManage.id, teamFormData)
      if (success) {
        setShowEditTeamDialog(false)
        setEditingTeamFromManage(null)
        loadOrgUsers()
      }
    } finally {
      setIsSavingTeam(false)
    }
  }, [editingTeamFromManage, teamFormData, hookUpdateTeam, setIsSavingTeam, setShowEditTeamDialog, setEditingTeamFromManage, loadOrgUsers])

  const openTeamVaultAccessDialog = useCallback((team: TeamWithDetails) => {
    setSelectedTeam(team)
    setPendingTeamVaultAccess(teamVaultAccessMap[team.id] || [])
    setShowTeamVaultAccessDialog(true)
  }, [setSelectedTeam, setPendingTeamVaultAccess, teamVaultAccessMap, setShowTeamVaultAccessDialog])

  const handleSaveTeamVaultAccess = useCallback(async () => {
    if (!selectedTeam) return
    
    setIsSavingTeamVaultAccess(true)
    try {
      const success = await saveTeamVaultAccess(selectedTeam.id, pendingTeamVaultAccess, selectedTeam.name)
      if (success) {
        setShowTeamVaultAccessDialog(false)
        setSelectedTeam(null)
      }
    } finally {
      setIsSavingTeamVaultAccess(false)
    }
  }, [selectedTeam, pendingTeamVaultAccess, saveTeamVaultAccess, setIsSavingTeamVaultAccess, setShowTeamVaultAccessDialog, setSelectedTeam])

  return {
    handleCreateTeam,
    handleUpdateTeam,
    handleDeleteTeam,
    handleSetDefaultTeam,
    handleDeleteTeamDirect,
    handleUpdateTeamFromManage,
    openTeamVaultAccessDialog,
    handleSaveTeamVaultAccess
  }
}
