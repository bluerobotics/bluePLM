import { useState, useCallback } from 'react'
import type { WorkflowRoleBasic, WorkflowRoleFormData } from '../types'

const DEFAULT_WORKFLOW_ROLE_FORM: WorkflowRoleFormData = {
  name: '',
  color: '#8b5cf6',
  icon: 'Shield',
  description: ''
}

export function useWorkflowRoleDialogs() {
  const [showCreateWorkflowRoleDialog, setShowCreateWorkflowRoleDialog] = useState(false)
  const [showEditWorkflowRoleDialog, setShowEditWorkflowRoleDialog] = useState(false)
  const [editingWorkflowRole, setEditingWorkflowRole] = useState<WorkflowRoleBasic | null>(null)
  const [workflowRoleFormData, setWorkflowRoleFormData] = useState<WorkflowRoleFormData>(DEFAULT_WORKFLOW_ROLE_FORM)
  const [isSavingWorkflowRole, setIsSavingWorkflowRole] = useState(false)
  
  const resetWorkflowRoleForm = useCallback(() => {
    setWorkflowRoleFormData(DEFAULT_WORKFLOW_ROLE_FORM)
    setEditingWorkflowRole(null)
  }, [])
  
  const openCreateWorkflowRoleDialog = useCallback(() => {
    resetWorkflowRoleForm()
    setShowCreateWorkflowRoleDialog(true)
  }, [resetWorkflowRoleForm])
  
  const openEditWorkflowRoleDialog = useCallback((role: WorkflowRoleBasic) => {
    setEditingWorkflowRole(role)
    setWorkflowRoleFormData({
      name: role.name,
      color: role.color,
      icon: role.icon,
      description: role.description || ''
    })
    setShowEditWorkflowRoleDialog(true)
  }, [])
  
  const closeAllWorkflowRoleDialogs = useCallback(() => {
    setShowCreateWorkflowRoleDialog(false)
    setShowEditWorkflowRoleDialog(false)
    resetWorkflowRoleForm()
  }, [resetWorkflowRoleForm])
  
  return {
    // State
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
    
    // Actions
    resetWorkflowRoleForm,
    openCreateWorkflowRoleDialog,
    openEditWorkflowRoleDialog,
    closeAllWorkflowRoleDialogs
  }
}
