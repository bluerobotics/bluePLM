import { useState, useCallback } from 'react'
import type { OrgUser, JobTitle } from '../types'

export function useJobTitleDialogs() {
  const [showCreateTitleDialog, setShowCreateTitleDialog] = useState(false)
  const [pendingTitleForUser, setPendingTitleForUser] = useState<OrgUser | null>(null)
  const [newTitleName, setNewTitleName] = useState('')
  const [newTitleColor, setNewTitleColor] = useState('#3b82f6')
  const [newTitleIcon, setNewTitleIcon] = useState('Briefcase')
  const [isCreatingTitle, setIsCreatingTitle] = useState(false)
  const [jobTitleSearchQuery, setJobTitleSearchQuery] = useState('')
  const [editingJobTitle, setEditingJobTitle] = useState<JobTitle | null>(null)
  const [editingJobTitleUser, setEditingJobTitleUser] = useState<OrgUser | null>(null)
  
  const resetTitleForm = useCallback(() => {
    setNewTitleName('')
    setNewTitleColor('#3b82f6')
    setNewTitleIcon('Briefcase')
    setPendingTitleForUser(null)
    setEditingJobTitle(null)
    setEditingJobTitleUser(null)
  }, [])
  
  const openCreateTitleDialog = useCallback((forUser?: OrgUser) => {
    resetTitleForm()
    if (forUser) {
      setPendingTitleForUser(forUser)
    }
    setShowCreateTitleDialog(true)
  }, [resetTitleForm])
  
  const openEditTitleDialog = useCallback((title: JobTitle) => {
    setEditingJobTitle(title)
    setNewTitleName(title.name)
    setNewTitleColor(title.color)
    setNewTitleIcon(title.icon)
    setShowCreateTitleDialog(true)
  }, [])
  
  const openEditJobTitleForUser = useCallback((user: OrgUser) => {
    setEditingJobTitleUser(user)
  }, [])
  
  const closeAllTitleDialogs = useCallback(() => {
    setShowCreateTitleDialog(false)
    resetTitleForm()
    setJobTitleSearchQuery('')
  }, [resetTitleForm])
  
  return {
    // State
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
    jobTitleSearchQuery,
    setJobTitleSearchQuery,
    editingJobTitle,
    setEditingJobTitle,
    editingJobTitleUser,
    setEditingJobTitleUser,
    
    // Actions
    resetTitleForm,
    openCreateTitleDialog,
    openEditTitleDialog,
    openEditJobTitleForUser,
    closeAllTitleDialogs
  }
}
