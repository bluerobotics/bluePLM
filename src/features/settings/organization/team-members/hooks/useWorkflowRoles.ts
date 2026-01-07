/**
 * useWorkflowRoles - Hook for managing workflow roles
 * 
 * Provides state and CRUD operations for workflow roles including:
 * - Loading workflow roles with user assignments into Zustand store
 * - Creating, updating, and deleting workflow roles
 * - Toggling user role assignments
 * - Saving batch role assignments
 * 
 * State is managed in the organizationMetadataSlice of the PDM store.
 */
import { useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { WorkflowRoleBasic, WorkflowRoleFormData } from '../types'
import {
  type UserWorkflowRoleJoin,
  castQueryResult,
  insertWorkflowRole,
  updateWorkflowRole as updateWorkflowRoleDb,
  insertUserWorkflowRole,
  insertUserWorkflowRoles
} from './supabaseHelpers'

export function useWorkflowRoles(orgId: string | null) {
  // Get actions from store
  const addToast = usePDMStore(s => s.addToast)
  
  // Workflow roles state from store
  const workflowRoles = usePDMStore(s => s.workflowRoles)
  const userRoleAssignments = usePDMStore(s => s.userRoleAssignments)
  const isLoading = usePDMStore(s => s.workflowRolesLoading)
  const workflowRolesLoaded = usePDMStore(s => s.workflowRolesLoaded)
  
  // Workflow roles actions from store
  const setWorkflowRoles = usePDMStore(s => s.setWorkflowRoles)
  const setWorkflowRolesLoading = usePDMStore(s => s.setWorkflowRolesLoading)
  const setUserRoleAssignments = usePDMStore(s => s.setUserRoleAssignments)
  const updateWorkflowRoleInStore = usePDMStore(s => s.updateWorkflowRoleInStore)
  const removeWorkflowRoleFromStore = usePDMStore(s => s.removeWorkflowRole)
  const assignUserRoleInStore = usePDMStore(s => s.assignUserRole)
  const unassignUserRoleInStore = usePDMStore(s => s.unassignUserRole)

  const loadWorkflowRoles = useCallback(async () => {
    if (!orgId) return
    
    setWorkflowRolesLoading(true)
    try {
      // Load workflow roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('workflow_roles')
        .select('id, name, color, icon, description')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('sort_order')
      
      if (rolesError) throw rolesError
      setWorkflowRoles(castQueryResult<WorkflowRoleBasic[]>(rolesData || []))
      
      // Load user role assignments
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('user_workflow_roles')
        .select(`
          user_id,
          workflow_role_id,
          workflow_roles!inner (org_id)
        `)
        .eq('workflow_roles.org_id', orgId)
      
      if (assignmentsError) throw assignmentsError
      
      const typedAssignments = castQueryResult<UserWorkflowRoleJoin[]>(assignmentsData || [])
      
      // Build userId -> roleIds map
      const assignmentsMap: Record<string, string[]> = {}
      for (const a of typedAssignments) {
        if (!assignmentsMap[a.user_id]) {
          assignmentsMap[a.user_id] = []
        }
        assignmentsMap[a.user_id].push(a.workflow_role_id)
      }
      setUserRoleAssignments(assignmentsMap)
    } catch (err) {
      console.error('Failed to load workflow roles:', err)
      setWorkflowRolesLoading(false)
    }
  }, [orgId, setWorkflowRoles, setWorkflowRolesLoading, setUserRoleAssignments])

  const createWorkflowRole = useCallback(async (
    formData: WorkflowRoleFormData
  ): Promise<boolean> => {
    if (!formData.name.trim() || !orgId) return false
    
    try {
      const { error } = await insertWorkflowRole({
        name: formData.name.trim(),
        color: formData.color,
        icon: formData.icon,
        description: formData.description || null,
        org_id: orgId
      })
      
      if (error) throw error
      
      addToast('success', `Created workflow role "${formData.name}"`)
      // Reload to get the new role with its ID
      await loadWorkflowRoles()
      return true
    } catch (err) {
      const pgError = err as { code?: string }
      if (pgError.code === '23505') {
        addToast('error', 'A workflow role with this name already exists')
      } else {
        addToast('error', 'Failed to create workflow role')
      }
      return false
    }
  }, [orgId, addToast, loadWorkflowRoles])

  const updateWorkflowRole = useCallback(async (
    roleId: string,
    formData: WorkflowRoleFormData
  ): Promise<boolean> => {
    if (!formData.name.trim()) return false
    
    try {
      const { error } = await updateWorkflowRoleDb(roleId, {
        name: formData.name.trim(),
        color: formData.color,
        icon: formData.icon,
        description: formData.description || null
      })
      
      if (error) throw error
      
      // Update in store
      updateWorkflowRoleInStore(roleId, {
        name: formData.name.trim(),
        color: formData.color,
        icon: formData.icon,
        description: formData.description || null
      })
      
      addToast('success', `Updated workflow role "${formData.name}"`)
      return true
    } catch (err) {
      const pgError = err as { code?: string }
      if (pgError.code === '23505') {
        addToast('error', 'A workflow role with this name already exists')
      } else {
        addToast('error', 'Failed to update workflow role')
      }
      return false
    }
  }, [addToast, updateWorkflowRoleInStore])

  const deleteWorkflowRole = useCallback(async (roleId: string): Promise<boolean> => {
    const role = workflowRoles.find(r => r.id === roleId)
    if (!role) return false
    
    try {
      const { error } = await supabase
        .from('workflow_roles')
        .delete()
        .eq('id', roleId)
      
      if (error) throw error
      
      // Remove from store (this also cleans up user assignments)
      removeWorkflowRoleFromStore(roleId)
      
      addToast('success', `Deleted workflow role "${role.name}"`)
      return true
    } catch {
      addToast('error', 'Failed to delete workflow role')
      return false
    }
  }, [workflowRoles, addToast, removeWorkflowRoleFromStore])

  const toggleUserRole = useCallback(async (
    userId: string,
    roleId: string,
    isAdding: boolean,
    assignedBy?: string
  ): Promise<boolean> => {
    try {
      if (isAdding) {
        const { error } = await insertUserWorkflowRole({
          user_id: userId,
          workflow_role_id: roleId,
          assigned_by: assignedBy ?? null
        })
        if (error) throw error
        
        // Update store
        assignUserRoleInStore(userId, roleId)
      } else {
        const { error } = await supabase
          .from('user_workflow_roles')
          .delete()
          .eq('user_id', userId)
          .eq('workflow_role_id', roleId)
        if (error) throw error
        
        // Update store
        unassignUserRoleInStore(userId, roleId)
      }
      return true
    } catch {
      addToast('error', isAdding ? 'Failed to add role' : 'Failed to remove role')
      return false
    }
  }, [addToast, assignUserRoleInStore, unassignUserRoleInStore])

  /**
   * Save all workflow role assignments for a user (replaces existing assignments)
   * Used by WorkflowRolesModal for batch updates
   */
  const saveUserWorkflowRoles = useCallback(async (
    userId: string,
    roleIds: string[],
    assignedBy: string,
    userName?: string
  ): Promise<boolean> => {
    try {
      // Remove existing assignments
      await supabase
        .from('user_workflow_roles')
        .delete()
        .eq('user_id', userId)
      
      // Add new assignments
      if (roleIds.length > 0) {
        const { error } = await insertUserWorkflowRoles(
          roleIds.map(roleId => ({
            user_id: userId,
            workflow_role_id: roleId,
            assigned_by: assignedBy
          }))
        )
        
        if (error) throw error
      }
      
      // Update store - set the new role assignments for this user
      setUserRoleAssignments({
        ...userRoleAssignments,
        [userId]: roleIds
      })
      
      addToast('success', `Updated workflow roles${userName ? ` for ${userName}` : ''}`)
      return true
    } catch (err) {
      console.error('Failed to save workflow roles:', err)
      addToast('error', 'Failed to update workflow roles')
      return false
    }
  }, [addToast, userRoleAssignments, setUserRoleAssignments])

  // Load workflow roles on mount if not already loaded
  useEffect(() => {
    if (orgId && !workflowRolesLoaded && !isLoading) {
      loadWorkflowRoles()
    }
  }, [orgId, workflowRolesLoaded, isLoading, loadWorkflowRoles])

  return {
    workflowRoles,
    userRoleAssignments,
    isLoading,
    loadWorkflowRoles,
    createWorkflowRole,
    updateWorkflowRole,
    deleteWorkflowRole,
    toggleUserRole,
    saveUserWorkflowRoles
  }
}
