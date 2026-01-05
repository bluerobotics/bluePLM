import { useState, useCallback } from 'react'
import type { TeamWithDetails, TeamFormData } from '../types'

const DEFAULT_TEAM_FORM: TeamFormData = {
  name: '',
  description: '',
  color: '#3b82f6',
  icon: 'Users',
  is_default: false
}

export function useTeamDialogs() {
  // Team selection
  const [selectedTeam, setSelectedTeam] = useState<TeamWithDetails | null>(null)
  
  // Dialog visibility
  const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false)
  const [showEditTeamDialog, setShowEditTeamDialog] = useState(false)
  const [showDeleteTeamDialog, setShowDeleteTeamDialog] = useState(false)
  const [showTeamMembersDialog, setShowTeamMembersDialog] = useState(false)
  const [showTeamVaultAccessDialog, setShowTeamVaultAccessDialog] = useState(false)
  const [showPermissionsEditor, setShowPermissionsEditor] = useState(false)
  const [showModulesDialog, setShowModulesDialog] = useState(false)
  
  // Form state
  const [teamFormData, setTeamFormData] = useState<TeamFormData>(DEFAULT_TEAM_FORM)
  const [isSavingTeam, setIsSavingTeam] = useState(false)
  const [copyFromTeamId, setCopyFromTeamId] = useState<string | null>(null)
  const [editingTeamFromManage, setEditingTeamFromManage] = useState<TeamWithDetails | null>(null)
  
  // Team vault access state
  const [pendingTeamVaultAccess, setPendingTeamVaultAccess] = useState<string[]>([])
  const [isSavingTeamVaultAccess, setIsSavingTeamVaultAccess] = useState(false)
  
  // Helper functions
  const resetTeamForm = useCallback(() => {
    setTeamFormData(DEFAULT_TEAM_FORM)
    setCopyFromTeamId(null)
  }, [])
  
  const openCreateTeamDialog = useCallback(() => {
    resetTeamForm()
    setShowCreateTeamDialog(true)
  }, [resetTeamForm])
  
  const openEditTeamDialog = useCallback((team: TeamWithDetails) => {
    setSelectedTeam(team)
    setTeamFormData({
      name: team.name,
      description: team.description || '',
      color: team.color,
      icon: team.icon,
      is_default: team.is_default
    })
    setShowEditTeamDialog(true)
  }, [])
  
  const openDeleteTeamDialog = useCallback((team: TeamWithDetails) => {
    setSelectedTeam(team)
    setShowDeleteTeamDialog(true)
  }, [])
  
  const openTeamMembersDialog = useCallback((team: TeamWithDetails) => {
    setSelectedTeam(team)
    setShowTeamMembersDialog(true)
  }, [])
  
  const openTeamVaultAccessDialog = useCallback((team: TeamWithDetails, currentAccess: string[]) => {
    setSelectedTeam(team)
    setPendingTeamVaultAccess(currentAccess)
    setShowTeamVaultAccessDialog(true)
  }, [])
  
  const openPermissionsEditor = useCallback((team: TeamWithDetails) => {
    setSelectedTeam(team)
    setShowPermissionsEditor(true)
  }, [])
  
  const openModulesDialog = useCallback((team: TeamWithDetails) => {
    setSelectedTeam(team)
    setShowModulesDialog(true)
  }, [])
  
  const closeAllTeamDialogs = useCallback(() => {
    setShowCreateTeamDialog(false)
    setShowEditTeamDialog(false)
    setShowDeleteTeamDialog(false)
    setShowTeamMembersDialog(false)
    setShowTeamVaultAccessDialog(false)
    setShowPermissionsEditor(false)
    setShowModulesDialog(false)
    setSelectedTeam(null)
    setEditingTeamFromManage(null)
    resetTeamForm()
  }, [resetTeamForm])
  
  return {
    // State
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
    setIsSavingTeam,
    copyFromTeamId,
    setCopyFromTeamId,
    editingTeamFromManage,
    setEditingTeamFromManage,
    pendingTeamVaultAccess,
    setPendingTeamVaultAccess,
    isSavingTeamVaultAccess,
    setIsSavingTeamVaultAccess,
    
    // Actions
    resetTeamForm,
    openCreateTeamDialog,
    openEditTeamDialog,
    openDeleteTeamDialog,
    openTeamMembersDialog,
    openTeamVaultAccessDialog,
    openPermissionsEditor,
    openModulesDialog,
    closeAllTeamDialogs
  }
}
