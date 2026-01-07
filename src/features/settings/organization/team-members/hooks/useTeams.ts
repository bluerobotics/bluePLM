/**
 * useTeams - Hook for managing organization teams
 * 
 * Provides state and CRUD operations for teams including:
 * - Loading teams with member/permission counts
 * - Creating teams with optional permission copying
 * - Updating team details
 * - Deleting teams
 * 
 * State is stored in the Zustand organizationDataSlice.
 * 
 * @param orgId - Organization ID (null if not connected)
 * @returns Teams state and operations
 * 
 * @example
 * ```tsx
 * const {
 *   teams,
 *   isLoading,
 *   loadTeams,
 *   createTeam,
 *   updateTeam,
 *   deleteTeam
 * } = useTeams(organization?.id ?? null)
 * ```
 */
import { useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
import type { TeamWithDetails, TeamFormData } from '../types'
import {
  type TeamWithCounts,
  castQueryResult,
  insertTeam,
  updateTeam as updateTeamDb,
  insertTeamPermissions,
  insertTeamVaultAccess,
  updateOrganization
} from './supabaseHelpers'

export function useTeams(orgId: string | null) {
  const { 
    user, 
    addToast,
    // Team state from organizationDataSlice
    teams,
    teamsLoading: isLoading,
    teamsLoaded,
    setTeams,
    setTeamsLoading
  } = usePDMStore()

  const loadTeams = useCallback(async () => {
    if (!orgId) return
    
    setTeamsLoading(true)
    try {
      const { data: teamsData, error } = await supabase
        .from('teams')
        .select(`
          *,
          team_members(count),
          team_permissions(count)
        `)
        .eq('org_id', orgId)
        .order('name')
      
      if (error) throw error
      
      // Cast to our expected response type
      const typedData = castQueryResult<TeamWithCounts[]>(teamsData || [])
      
      const teamsWithCounts: TeamWithDetails[] = typedData.map(team => ({
        ...team,
        member_count: team.team_members?.[0]?.count || 0,
        permissions_count: team.team_permissions?.[0]?.count || 0
      }))
      
      setTeams(teamsWithCounts)
    } catch (err) {
      log.error('[Teams]', 'Failed to load teams', { error: err })
      addToast('error', 'Failed to load teams')
    } finally {
      setTeamsLoading(false)
    }
  }, [orgId, addToast, setTeams, setTeamsLoading])

  const createTeam = useCallback(async (
    formData: TeamFormData,
    copyFromTeamId?: string | null
  ): Promise<boolean> => {
    if (!orgId || !user || !formData.name.trim()) return false
    
    try {
      const { data, error } = await insertTeam({
        org_id: orgId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        color: formData.color,
        icon: formData.icon,
        is_default: formData.is_default,
        created_by: user.id
      })
      
      if (error) throw error
      
      // If copying from an existing team, copy its permissions and vault access
      if (copyFromTeamId && data) {
        const { data: sourcePerms } = await supabase
          .from('team_permissions')
          .select('resource, actions')
          .eq('team_id', copyFromTeamId)
        
        const typedSourcePerms = castQueryResult<{ resource: string; actions: string[] }[]>(sourcePerms || [])
        
        if (typedSourcePerms.length > 0) {
          await insertTeamPermissions(
            typedSourcePerms.map(p => ({
              team_id: data.id,
              resource: p.resource,
              actions: p.actions as ('view' | 'create' | 'edit' | 'delete' | 'admin')[],
              granted_by: user.id
            }))
          )
        }
        
        // Copy vault access
        const { data: sourceVaultAccess } = await supabase
          .from('team_vault_access')
          .select('vault_id')
          .eq('team_id', copyFromTeamId)
        
        const typedSourceVaultAccess = castQueryResult<{ vault_id: string }[]>(sourceVaultAccess || [])
        
        if (typedSourceVaultAccess.length > 0) {
          await insertTeamVaultAccess(
            typedSourceVaultAccess.map(va => ({
              team_id: data.id,
              vault_id: va.vault_id,
              granted_by: user.id
            }))
          )
        }
        
        const sourceTeam = teams.find(t => t.id === copyFromTeamId)
        addToast('success', `Team "${formData.name}" created (copied from ${sourceTeam?.name})`)
      } else {
        addToast('success', `Team "${formData.name}" created`)
      }
      
      await loadTeams()
      return true
    } catch (err) {
      const pgError = err as { code?: string }
      if (pgError.code === '23505') {
        addToast('error', 'A team with this name already exists')
      } else {
        addToast('error', 'Failed to create team')
      }
      return false
    }
  }, [orgId, user, teams, addToast, loadTeams])

  const updateTeam = useCallback(async (
    teamId: string,
    formData: TeamFormData
  ): Promise<boolean> => {
    if (!user || !formData.name.trim()) return false
    
    try {
      const { error } = await updateTeamDb(teamId, {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        color: formData.color,
        icon: formData.icon,
        is_default: formData.is_default,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
      
      if (error) throw error
      
      addToast('success', `Team "${formData.name}" updated`)
      await loadTeams()
      return true
    } catch (err) {
      const pgError = err as { code?: string }
      if (pgError.code === '23505') {
        addToast('error', 'A team with this name already exists')
      } else {
        addToast('error', 'Failed to update team')
      }
      return false
    }
  }, [user, addToast, loadTeams])

  const deleteTeam = useCallback(async (teamId: string): Promise<boolean> => {
    const team = teams.find(t => t.id === teamId)
    if (!team) return false
    
    try {
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId)
      
      if (error) throw error
      
      addToast('success', `Team "${team.name}" deleted`)
      await loadTeams()
      return true
    } catch (err) {
      addToast('error', 'Failed to delete team')
      return false
    }
  }, [teams, addToast, loadTeams])

  /**
   * Set the default team for new users joining the organization
   * 
   * @param teamId - Team ID to set as default, or null to clear
   * @param organizationId - Organization ID to update
   * @param setOrganization - State setter for organization
   * @param organization - Current organization object
   * @returns Promise<boolean> - true if successful
   */
  const setDefaultTeam = useCallback(async <T extends { default_new_user_team_id?: string | null }>(
    teamId: string | null,
    organizationId: string,
    setOrganization: (org: T) => void,
    organization: T
  ): Promise<boolean> => {
    try {
      const { error } = await updateOrganization(organizationId, {
        default_new_user_team_id: teamId
      })
      
      if (error) throw error
      
      // Update local organization state
      setOrganization({
        ...organization,
        default_new_user_team_id: teamId
      })
      
      const teamName = teamId ? teams.find(t => t.id === teamId)?.name : 'None'
      addToast('success', `Default team set to "${teamName}"`)
      return true
    } catch (err) {
      log.error('[Teams]', 'Failed to set default team', { error: err })
      addToast('error', 'Failed to update default team')
      return false
    }
  }, [teams, addToast])

  // Initial load - only if not already loaded
  useEffect(() => {
    if (orgId && !teamsLoaded && !isLoading) {
      loadTeams()
    }
  }, [orgId, teamsLoaded, isLoading, loadTeams])

  return {
    teams,
    isLoading,
    loadTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    setDefaultTeam
  }
}
