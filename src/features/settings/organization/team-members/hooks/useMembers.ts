/**
 * useMembers - Hook for managing organization members
 * 
 * Provides state and operations for organization users including:
 * - Loading members with team assignments, job titles, and workflow roles
 * - Removing members from the organization
 * - Removing members from specific teams
 * - Toggling team membership
 * 
 * State is stored in the Zustand organizationDataSlice.
 * 
 * @param orgId - Organization ID (null if not connected)
 * @returns Members state and operations
 * 
 * @example
 * ```tsx
 * const {
 *   members: orgUsers,
 *   isLoading,
 *   loadMembers,
 *   removeMember,
 *   removeFromTeam,
 *   toggleTeam
 * } = useMembers(organization?.id ?? null)
 * ```
 */
import { useCallback, useEffect } from 'react'
import { supabase, removeUserFromOrg } from '@/lib/supabase'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
import type { OrgUser } from '../types'
import {
  type UserBasic,
  type TeamMembershipJoin,
  type UserJobTitleJoin,
  castQueryResult,
  insertTeamMember
} from './supabaseHelpers'

export function useMembers(orgId: string | null) {
  const { 
    user, 
    addToast,
    // Member state from organizationDataSlice
    members,
    membersLoading: isLoading,
    membersLoaded,
    setMembers,
    setMembersLoading,
    removeMember: removeMemberFromStore
  } = usePDMStore()

  const loadMembers = useCallback(async () => {
    if (!orgId) return
    
    setMembersLoading(true)
    try {
      const { data: usersData, error } = await supabase
        .from('users')
        .select('id, email, full_name, avatar_url, custom_avatar_url, job_title, role, last_sign_in, last_online')
        .eq('org_id', orgId)
        .order('full_name')
      
      if (error) throw error
      
      const typedUsers = castQueryResult<UserBasic[]>(usersData || [])
      
      // Load pending org members (unclaimed) to filter them out from the user list
      const { data: pendingData } = await supabase
        .from('pending_org_members')
        .select('email')
        .eq('org_id', orgId)
        .is('claimed_at', null)
      
      const pendingEmails = new Set(
        castQueryResult<{ email: string }[]>(pendingData || []).map(p => p.email.toLowerCase())
      )
      
      // Filter out users who are still pending
      const activeUsers = typedUsers.filter(u => !pendingEmails.has(u.email.toLowerCase()))
      
      // Load team memberships for active users only
      const { data: membershipsData } = await supabase
        .from('team_members')
        .select(`
          user_id,
          team:teams(id, name, color, icon)
        `)
        .in('user_id', activeUsers.map(u => u.id))
      
      const typedMemberships = castQueryResult<TeamMembershipJoin[]>(membershipsData || [])
      
      // Load job title assignments for active users only
      const { data: titleAssignmentsData } = await supabase
        .from('user_job_titles')
        .select(`
          user_id,
          title:job_titles(id, name, color, icon)
        `)
        .in('user_id', activeUsers.map(u => u.id))
      
      const typedTitleAssignments = castQueryResult<UserJobTitleJoin[]>(titleAssignmentsData || [])
      
      // Map teams and job_title to users
      const usersWithTeamsAndTitles: OrgUser[] = activeUsers.map(userRecord => {
        const userMemberships = typedMemberships.filter(m => m.user_id === userRecord.id)
        const userTitleAssignment = typedTitleAssignments.find(t => t.user_id === userRecord.id)
        return {
          ...userRecord,
          teams: userMemberships
            .map(m => m.team)
            .filter((t): t is NonNullable<typeof t> => t !== null),
          job_title: userTitleAssignment?.title ?? null
        }
      })
      
      setMembers(usersWithTeamsAndTitles)
    } catch (err) {
      log.error('[Members]', 'Failed to load org users', { error: err })
    } finally {
      setMembersLoading(false)
    }
  }, [orgId, setMembers, setMembersLoading])

  const removeMember = useCallback(async (memberId: string): Promise<boolean> => {
    if (!orgId) return false
    
    const member = members.find(m => m.id === memberId)
    if (!member) return false
    
    try {
      const result = await removeUserFromOrg(memberId, orgId)
      if (result.success) {
        addToast('success', `Removed ${member.full_name || member.email} from organization`)
        removeMemberFromStore(memberId)
        return true
      } else {
        addToast('error', result.error || 'Failed to remove user')
        return false
      }
    } catch {
      addToast('error', 'Failed to remove user')
      return false
    }
  }, [orgId, members, addToast, removeMemberFromStore])

  const removeFromTeam = useCallback(async (
    memberId: string,
    teamId: string,
    teamName: string
  ): Promise<boolean> => {
    const member = members.find(m => m.id === memberId)
    if (!member) return false
    
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('user_id', memberId)
        .eq('team_id', teamId)
      
      if (error) throw error
      
      addToast('success', `Removed ${member.full_name || member.email} from ${teamName}`)
      await loadMembers()
      return true
    } catch {
      addToast('error', 'Failed to remove from team')
      return false
    }
  }, [members, addToast, loadMembers])

  const toggleTeam = useCallback(async (
    memberId: string,
    teamId: string,
    isAdding: boolean
  ): Promise<boolean> => {
    try {
      if (isAdding) {
        const { error } = await insertTeamMember({
          team_id: teamId,
          user_id: memberId,
          added_by: user?.id ?? null
        })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('team_members')
          .delete()
          .eq('user_id', memberId)
          .eq('team_id', teamId)
        if (error) throw error
      }
      await loadMembers()
      return true
    } catch {
      addToast('error', isAdding ? 'Failed to add to team' : 'Failed to remove from team')
      return false
    }
  }, [user, addToast, loadMembers])

  /**
   * Save all team memberships for a user (replaces existing memberships)
   * Used by UserTeamsModal for batch updates
   */
  const saveUserTeams = useCallback(async (
    memberId: string,
    teamIds: string[],
    currentTeamIds: string[],
    userName?: string
  ): Promise<boolean> => {
    if (!user) return false
    
    try {
      // Teams to add (in teamIds but not in currentTeamIds)
      const toAdd = teamIds.filter(id => !currentTeamIds.includes(id))
      
      // Teams to remove (in currentTeamIds but not in teamIds)
      const toRemove = currentTeamIds.filter(id => !teamIds.includes(id))
      
      // Remove from teams
      for (const teamId of toRemove) {
        await supabase
          .from('team_members')
          .delete()
          .eq('user_id', memberId)
          .eq('team_id', teamId)
      }
      
      // Add to teams
      for (const teamId of toAdd) {
        await insertTeamMember({
          team_id: teamId,
          user_id: memberId,
          added_by: user.id
        })
      }
      
      addToast('success', `Updated teams${userName ? ` for ${userName}` : ''}`)
      await loadMembers()
      return true
    } catch (err) {
      log.error('[Members]', 'Failed to update teams', { error: err })
      addToast('error', 'Failed to update teams')
      return false
    }
  }, [user, addToast, loadMembers])

  // Initial load - only if not already loaded
  useEffect(() => {
    if (orgId && !membersLoaded && !isLoading) {
      loadMembers()
    }
  }, [orgId, membersLoaded, isLoading, loadMembers])

  return {
    members,
    isLoading,
    loadMembers,
    removeMember,
    removeFromTeam,
    toggleTeam,
    saveUserTeams
  }
}
