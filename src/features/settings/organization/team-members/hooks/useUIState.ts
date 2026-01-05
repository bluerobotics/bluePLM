import { useState, useEffect, useCallback } from 'react'
import type { PendingMember, PendingMemberFormData } from '../types'

type TabType = 'users' | 'teams' | 'roles' | 'titles'

export function useUIState() {
  // Active tab
  const [activeTab, setActiveTab] = useState<TabType>('users')
  
  // Search
  const [searchQuery, setSearchQuery] = useState('')
  
  // Saving states
  const [isSavingDefaultTeam, setIsSavingDefaultTeam] = useState(false)
  
  // Expanded sections
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [showUnassignedUsers, setShowUnassignedUsers] = useState(true)
  const [showPendingMembers, setShowPendingMembers] = useState(true)
  
  // Pending member state
  const [viewingPendingMemberPermissions, setViewingPendingMemberPermissions] = useState<PendingMember | null>(null)
  const [pendingMemberDropdownOpen, setPendingMemberDropdownOpen] = useState<string | null>(null)
  const [editingPendingMember, setEditingPendingMember] = useState<PendingMember | null>(null)
  const [pendingMemberForm, setPendingMemberForm] = useState<PendingMemberFormData>({
    full_name: '',
    team_ids: [],
    workflow_role_ids: [],
    vault_ids: []
  })
  const [isSavingPendingMember, setIsSavingPendingMember] = useState(false)
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null)
  
  // Listen for navigation events to switch inner tab
  useEffect(() => {
    const handleSwitchTab = (e: CustomEvent<TabType>) => {
      setActiveTab(e.detail)
    }
    window.addEventListener('navigate-team-members-tab', handleSwitchTab as EventListener)
    return () => window.removeEventListener('navigate-team-members-tab', handleSwitchTab as EventListener)
  }, [])
  
  // Toggle team expansion
  const toggleTeamExpand = useCallback((teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      if (next.has(teamId)) {
        next.delete(teamId)
      } else {
        next.add(teamId)
      }
      return next
    })
  }, [])
  
  // Open edit pending member
  const openEditPendingMember = useCallback((pm: PendingMember) => {
    setEditingPendingMember(pm)
    setPendingMemberForm({
      full_name: pm.full_name || '',
      team_ids: pm.team_ids || [],
      workflow_role_ids: pm.workflow_role_ids || [],
      vault_ids: pm.vault_ids || []
    })
  }, [])
  
  // Toggle pending member form fields
  const togglePendingMemberTeam = useCallback((teamId: string) => {
    setPendingMemberForm(prev => ({
      ...prev,
      team_ids: prev.team_ids.includes(teamId)
        ? prev.team_ids.filter(id => id !== teamId)
        : [...prev.team_ids, teamId]
    }))
  }, [])
  
  const togglePendingMemberWorkflowRole = useCallback((roleId: string) => {
    setPendingMemberForm(prev => ({
      ...prev,
      workflow_role_ids: prev.workflow_role_ids.includes(roleId)
        ? prev.workflow_role_ids.filter(id => id !== roleId)
        : [...prev.workflow_role_ids, roleId]
    }))
  }, [])
  
  const togglePendingMemberVault = useCallback((vaultId: string) => {
    setPendingMemberForm(prev => ({
      ...prev,
      vault_ids: prev.vault_ids.includes(vaultId)
        ? prev.vault_ids.filter(id => id !== vaultId)
        : [...prev.vault_ids, vaultId]
    }))
  }, [])
  
  const closePendingMemberEdit = useCallback(() => {
    setEditingPendingMember(null)
    setPendingMemberForm({
      full_name: '',
      team_ids: [],
      workflow_role_ids: [],
      vault_ids: []
    })
  }, [])
  
  return {
    // Tab state
    activeTab,
    setActiveTab,
    
    // Search
    searchQuery,
    setSearchQuery,
    
    // Saving states
    isSavingDefaultTeam,
    setIsSavingDefaultTeam,
    
    // Expanded sections
    expandedTeams,
    setExpandedTeams,
    showUnassignedUsers,
    setShowUnassignedUsers,
    showPendingMembers,
    setShowPendingMembers,
    
    // Pending member state
    viewingPendingMemberPermissions,
    setViewingPendingMemberPermissions,
    pendingMemberDropdownOpen,
    setPendingMemberDropdownOpen,
    editingPendingMember,
    setEditingPendingMember,
    pendingMemberForm,
    setPendingMemberForm,
    isSavingPendingMember,
    setIsSavingPendingMember,
    resendingInviteId,
    setResendingInviteId,
    
    // Actions
    toggleTeamExpand,
    openEditPendingMember,
    togglePendingMemberTeam,
    togglePendingMemberWorkflowRole,
    togglePendingMemberVault,
    closePendingMemberEdit
  }
}
