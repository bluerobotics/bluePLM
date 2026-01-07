/**
 * useWorkflowRoleHandlers - Workflow role handler functions
 * 
 * Provides handlers for workflow role CRUD operations.
 */
import { useCallback } from 'react'
import type { WorkflowRoleBasic, WorkflowRoleFormData } from '../../types'

export interface UseWorkflowRoleHandlersParams {
  // Data hook methods
  hookCreateWorkflowRole: (data: WorkflowRoleFormData) => Promise<boolean>
  hookUpdateWorkflowRole: (roleId: string, data: WorkflowRoleFormData) => Promise<boolean>
  hookDeleteWorkflowRole: (roleId: string) => Promise<boolean>
  
  // Dialog state
  setShowCreateWorkflowRoleDialog: (v: boolean) => void
  setShowEditWorkflowRoleDialog: (v: boolean) => void
  editingWorkflowRole: WorkflowRoleBasic | null
  setEditingWorkflowRole: (role: WorkflowRoleBasic | null) => void
  workflowRoleFormData: WorkflowRoleFormData
  setWorkflowRoleFormData: (data: WorkflowRoleFormData) => void
  setIsSavingWorkflowRole: (v: boolean) => void
}

export function useWorkflowRoleHandlers(params: UseWorkflowRoleHandlersParams) {
  const {
    hookCreateWorkflowRole,
    hookUpdateWorkflowRole,
    hookDeleteWorkflowRole,
    setShowCreateWorkflowRoleDialog,
    setShowEditWorkflowRoleDialog,
    editingWorkflowRole,
    setEditingWorkflowRole,
    workflowRoleFormData,
    setWorkflowRoleFormData,
    setIsSavingWorkflowRole
  } = params

  const handleCreateWorkflowRole = useCallback(async () => {
    if (!workflowRoleFormData.name.trim()) return
    
    setIsSavingWorkflowRole(true)
    try {
      const success = await hookCreateWorkflowRole(workflowRoleFormData)
      if (success) {
        setShowCreateWorkflowRoleDialog(false)
        setWorkflowRoleFormData({ name: '', color: '#8b5cf6', icon: 'Shield', description: '' })
      }
    } finally {
      setIsSavingWorkflowRole(false)
    }
  }, [workflowRoleFormData, hookCreateWorkflowRole, setIsSavingWorkflowRole, setShowCreateWorkflowRoleDialog, setWorkflowRoleFormData])

  const handleUpdateWorkflowRole = useCallback(async () => {
    if (!editingWorkflowRole || !workflowRoleFormData.name.trim()) return
    
    setIsSavingWorkflowRole(true)
    try {
      const success = await hookUpdateWorkflowRole(editingWorkflowRole.id, workflowRoleFormData)
      if (success) {
        setShowEditWorkflowRoleDialog(false)
        setEditingWorkflowRole(null)
        setWorkflowRoleFormData({ name: '', color: '#8b5cf6', icon: 'Shield', description: '' })
      }
    } finally {
      setIsSavingWorkflowRole(false)
    }
  }, [editingWorkflowRole, workflowRoleFormData, hookUpdateWorkflowRole, setIsSavingWorkflowRole, setShowEditWorkflowRoleDialog, setEditingWorkflowRole, setWorkflowRoleFormData])

  const handleDeleteWorkflowRole = useCallback(async (role: { id: string; name: string }) => {
    await hookDeleteWorkflowRole(role.id)
  }, [hookDeleteWorkflowRole])

  return {
    handleCreateWorkflowRole,
    handleUpdateWorkflowRole,
    handleDeleteWorkflowRole
  }
}
