/**
 * useJobTitleHandlers - Job title handler functions
 * 
 * Provides handlers for job title CRUD operations and user assignments.
 */
import { useCallback } from 'react'
import type { OrgUser, JobTitle } from '../../types'

export interface UseJobTitleHandlersParams {
  // Data hook methods
  hookCreateJobTitle: (name: string, color: string, icon: string, assignToUserId?: string) => Promise<boolean>
  hookUpdateJobTitle: (titleId: string, name: string, color: string, icon: string) => Promise<boolean>
  hookDeleteJobTitle: (titleId: string) => Promise<boolean>
  hookAssignJobTitle: (user: OrgUser, titleId: string | null) => Promise<boolean>
  
  // Refresh functions
  loadOrgUsers: () => Promise<void>
  
  // Dialog state
  setShowCreateTitleDialog: (v: boolean) => void
  pendingTitleForUser: OrgUser | null
  setPendingTitleForUser: (user: OrgUser | null) => void
  newTitleName: string
  setNewTitleName: (v: string) => void
  newTitleColor: string
  setNewTitleColor: (v: string) => void
  newTitleIcon: string
  setIsCreatingTitle: (v: boolean) => void
  editingJobTitle: JobTitle | null
  setEditingJobTitle: (title: JobTitle | null) => void
  jobTitles: JobTitle[]
}

export function useJobTitleHandlers(params: UseJobTitleHandlersParams) {
  const {
    hookCreateJobTitle,
    hookUpdateJobTitle,
    hookDeleteJobTitle,
    hookAssignJobTitle,
    loadOrgUsers,
    setShowCreateTitleDialog,
    pendingTitleForUser,
    setPendingTitleForUser,
    newTitleName,
    setNewTitleName,
    newTitleColor,
    setNewTitleColor,
    newTitleIcon,
    setIsCreatingTitle,
    editingJobTitle,
    setEditingJobTitle,
    jobTitles
  } = params

  const handleChangeJobTitle = useCallback(async (targetUser: OrgUser, titleId: string | null) => {
    const success = await hookAssignJobTitle(targetUser, titleId)
    if (success) {
      loadOrgUsers()
    }
  }, [hookAssignJobTitle, loadOrgUsers])

  const openCreateTitleDialog = useCallback((targetUser: OrgUser) => {
    setPendingTitleForUser(targetUser)
    setNewTitleName('')
    setNewTitleColor('#3b82f6')
    setShowCreateTitleDialog(true)
  }, [setPendingTitleForUser, setNewTitleName, setNewTitleColor, setShowCreateTitleDialog])

  const handleCreateTitle = useCallback(async () => {
    if (!newTitleName.trim()) return
    
    setIsCreatingTitle(true)
    try {
      const success = await hookCreateJobTitle(
        newTitleName.trim(),
        newTitleColor,
        newTitleIcon,
        pendingTitleForUser?.id
      )
      if (success) {
        setShowCreateTitleDialog(false)
        setPendingTitleForUser(null)
        setEditingJobTitle(null)
        loadOrgUsers()
      }
    } finally {
      setIsCreatingTitle(false)
    }
  }, [newTitleName, newTitleColor, newTitleIcon, pendingTitleForUser, hookCreateJobTitle, setIsCreatingTitle, setShowCreateTitleDialog, setPendingTitleForUser, setEditingJobTitle, loadOrgUsers])

  const handleUpdateJobTitle = useCallback(async () => {
    if (!editingJobTitle || !newTitleName.trim()) return
    
    setIsCreatingTitle(true)
    try {
      const success = await hookUpdateJobTitle(
        editingJobTitle.id,
        newTitleName.trim(),
        newTitleColor,
        newTitleIcon
      )
      if (success) {
        setEditingJobTitle(null)
        setShowCreateTitleDialog(false)
        loadOrgUsers()
      }
    } finally {
      setIsCreatingTitle(false)
    }
  }, [editingJobTitle, newTitleName, newTitleColor, newTitleIcon, hookUpdateJobTitle, setIsCreatingTitle, setEditingJobTitle, setShowCreateTitleDialog, loadOrgUsers])

  const handleDeleteJobTitle = useCallback(async (title: { id: string; name: string }) => {
    const success = await hookDeleteJobTitle(title.id)
    if (success) {
      loadOrgUsers()
    }
  }, [hookDeleteJobTitle, loadOrgUsers])

  const updateJobTitleDirect = useCallback(async (titleId: string, name: string, color: string, icon: string) => {
    const success = await hookUpdateJobTitle(titleId, name, color, icon)
    if (success) {
      loadOrgUsers()
    }
    if (!success) {
      throw new Error('Failed to update')
    }
  }, [hookUpdateJobTitle, loadOrgUsers])

  const deleteJobTitleDirect = useCallback(async (titleId: string) => {
    const title = jobTitles.find(t => t.id === titleId)
    if (!title) return
    
    const success = await hookDeleteJobTitle(titleId)
    if (success) {
      loadOrgUsers()
    }
    if (!success) {
      throw new Error('Failed to delete')
    }
  }, [jobTitles, hookDeleteJobTitle, loadOrgUsers])

  return {
    handleChangeJobTitle,
    openCreateTitleDialog,
    handleCreateTitle,
    handleUpdateJobTitle,
    handleDeleteJobTitle,
    updateJobTitleDirect,
    deleteJobTitleDirect
  }
}
