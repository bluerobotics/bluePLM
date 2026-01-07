/**
 * useJobTitles - Hook for managing job titles
 * 
 * Provides state and CRUD operations for job titles including:
 * - Loading job titles from Supabase into Zustand store
 * - Creating, updating, and deleting job titles
 * - Assigning job titles to users
 * 
 * State is managed in the organizationMetadataSlice of the PDM store.
 */
import { useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { JobTitle, OrgUser } from '../types'
import {
  castQueryResult,
  insertJobTitle,
  updateJobTitle as updateJobTitleDb,
  upsertUserJobTitle
} from './supabaseHelpers'

export function useJobTitles(orgId: string | null) {
  // Get state and actions from store
  const user = usePDMStore(s => s.user)
  const addToast = usePDMStore(s => s.addToast)
  
  // Job titles state from store
  const jobTitles = usePDMStore(s => s.jobTitles)
  const isLoading = usePDMStore(s => s.jobTitlesLoading)
  const jobTitlesLoaded = usePDMStore(s => s.jobTitlesLoaded)
  
  // Job titles actions from store
  const setJobTitles = usePDMStore(s => s.setJobTitles)
  const setJobTitlesLoading = usePDMStore(s => s.setJobTitlesLoading)
  const addJobTitleToStore = usePDMStore(s => s.addJobTitle)
  const updateJobTitleInStore = usePDMStore(s => s.updateJobTitleInStore)
  const removeJobTitleFromStore = usePDMStore(s => s.removeJobTitle)
  
  // Member state and actions for live updates
  const members = usePDMStore(s => s.members)
  const updateMember = usePDMStore(s => s.updateMember)

  const loadJobTitles = useCallback(async () => {
    if (!orgId) return
    
    setJobTitlesLoading(true)
    try {
      const { data, error } = await supabase
        .from('job_titles')
        .select('id, name, color, icon')
        .eq('org_id', orgId)
        .order('name')
      
      if (error) throw error
      setJobTitles(castQueryResult<JobTitle[]>(data || []))
    } catch (err) {
      console.error('Failed to load job titles:', err)
      setJobTitlesLoading(false)
    }
  }, [orgId, setJobTitles, setJobTitlesLoading])

  const createJobTitle = useCallback(async (
    name: string,
    color: string,
    icon: string,
    assignToUserId?: string
  ): Promise<boolean> => {
    if (!orgId || !user || !name.trim()) return false
    
    try {
      // Create the title
      const { data, error } = await insertJobTitle({
        org_id: orgId,
        name: name.trim(),
        color,
        icon,
        created_by: user.id
      })
      
      if (error) throw error
      
      // Add to store optimistically
      if (data) {
        addJobTitleToStore({
          id: data.id,
          name: data.name,
          color: data.color,
          icon: data.icon
        })
      }
      
      // If we have a user to assign, assign the title to them
      if (assignToUserId && data) {
        await upsertUserJobTitle({
          user_id: assignToUserId,
          title_id: data.id,
          assigned_by: user.id
        })
        
        // Update member in store for live UI update
        updateMember(assignToUserId, { 
          job_title: { id: data.id, name: data.name, color: data.color, icon: data.icon } 
        })
        
        addToast('success', `Created and assigned "${name}"`)
      } else {
        addToast('success', `Created job title "${name}"`)
      }
      
      return true
    } catch (err) {
      const pgError = err as { code?: string }
      if (pgError.code === '23505') {
        addToast('error', 'A job title with this name already exists')
      } else {
        addToast('error', 'Failed to create job title')
      }
      return false
    }
  }, [orgId, user, addToast, addJobTitleToStore, updateMember])

  const updateJobTitle = useCallback(async (
    titleId: string,
    name: string,
    color: string,
    icon: string
  ): Promise<boolean> => {
    if (!name.trim()) return false
    
    try {
      const { error } = await updateJobTitleDb(titleId, {
        name: name.trim(),
        color,
        icon
      })
      
      if (error) throw error
      
      // Update in job titles store
      updateJobTitleInStore(titleId, { name: name.trim(), color, icon })
      
      // Update all members who have this title for live UI updates
      const updatedTitle = { id: titleId, name: name.trim(), color, icon }
      members.forEach(member => {
        if (member.job_title?.id === titleId) {
          updateMember(member.id, { job_title: updatedTitle })
        }
      })
      
      addToast('success', `Updated "${name}"`)
      return true
    } catch (err) {
      const pgError = err as { code?: string }
      if (pgError.code === '23505') {
        addToast('error', 'A job title with this name already exists')
      } else {
        addToast('error', 'Failed to update job title')
      }
      return false
    }
  }, [addToast, updateJobTitleInStore, members, updateMember])

  const deleteJobTitle = useCallback(async (titleId: string): Promise<boolean> => {
    const title = jobTitles.find(t => t.id === titleId)
    if (!title) return false
    
    try {
      const { error } = await supabase
        .from('job_titles')
        .delete()
        .eq('id', titleId)
      
      if (error) throw error
      
      // Remove from job titles store
      removeJobTitleFromStore(titleId)
      
      // Clear job_title from all members who had this title for live UI updates
      members.forEach(member => {
        if (member.job_title?.id === titleId) {
          updateMember(member.id, { job_title: null })
        }
      })
      
      addToast('success', `Deleted "${title.name}"`)
      return true
    } catch {
      addToast('error', 'Failed to delete job title')
      return false
    }
  }, [jobTitles, addToast, removeJobTitleFromStore, members, updateMember])

  const assignJobTitle = useCallback(async (
    targetUser: OrgUser,
    titleId: string | null
  ): Promise<boolean> => {
    try {
      if (titleId) {
        // Upsert the title assignment
        const { error } = await upsertUserJobTitle({
          user_id: targetUser.id,
          title_id: titleId,
          assigned_by: user?.id ?? null
        })
        
        if (error) throw error
        
        const title = jobTitles.find(t => t.id === titleId)
        const titleName = title?.name || 'title'
        
        // Update member in store for live UI update
        updateMember(targetUser.id, { 
          job_title: title ? { id: title.id, name: title.name, color: title.color, icon: title.icon } : null 
        })
        
        addToast('success', `Set ${targetUser.full_name || targetUser.email}'s title to ${titleName}`)
      } else {
        // Remove title
        const { error } = await supabase
          .from('user_job_titles')
          .delete()
          .eq('user_id', targetUser.id)
        
        if (error) throw error
        
        // Update member in store for live UI update
        updateMember(targetUser.id, { job_title: null })
        
        addToast('success', `Removed ${targetUser.full_name || targetUser.email}'s job title`)
      }
      
      return true
    } catch {
      addToast('error', 'Failed to change job title')
      return false
    }
  }, [user, jobTitles, addToast, updateMember])

  // Load job titles on mount if not already loaded
  useEffect(() => {
    if (orgId && !jobTitlesLoaded && !isLoading) {
      loadJobTitles()
    }
  }, [orgId, jobTitlesLoaded, isLoading, loadJobTitles])

  return {
    jobTitles,
    isLoading,
    loadJobTitles,
    createJobTitle,
    updateJobTitle,
    deleteJobTitle,
    assignJobTitle
  }
}
