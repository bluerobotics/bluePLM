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
import {
  createMdbTeam,
  deleteMdbTeam,
  getMdbTeamVaultAccess,
  getMdbTeams,
  setMdbDefaultNewUserTeam,
  setMdbTeamVaultAccess,
  updateMdbTeam,
} from '@/lib/mdb'
import { routeBackend } from '@/lib/backendAdapter'
import { log } from '@/lib/logger'
import { t } from '@/lib/i18n'
import { usePDMStore } from '@/stores/pdmStore'
import type { TeamWithDetails, TeamFormData } from '../types'
import {
  type TeamWithCounts,
  castQueryResult,
  insertTeam,
  updateTeam as updateTeamDb,
  insertTeamPermissions,
  insertTeamVaultAccess,
  updateOrganization,
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
    setTeamsLoading,
  } = usePDMStore()

  const loadTeams = useCallback(async () => {
    if (!orgId) return

    setTeamsLoading(true)
    try {
      const loadedTeams = await routeBackend({
        mdb: async () => {
          const mdbTeams = await getMdbTeams()
          return Promise.all(mdbTeams.map(async (team): Promise<TeamWithDetails> => ({
            id: team.id, org_id: orgId, name: team.name, description: null,
            color: team.color, icon: team.icon, parent_team_id: null,
            created_at: team.createdAt, created_by: null, updated_at: null, updated_by: null,
            is_default: false, is_system: false, member_count: team.memberCount,
            permissions_count: 0, vault_access: await getMdbTeamVaultAccess(team.id),
          })))
        },
        supabase: async () => {
          const { data: teamsData, error } = await supabase.from('teams').select(`
          *,
          team_members(count),
          team_permissions(count)
        `).eq('org_id', orgId).order('name')
          if (error) throw error
          return castQueryResult<TeamWithCounts[]>(teamsData || []).map((team) => ({
            ...team,
            member_count: team.team_members?.[0]?.count || 0,
            permissions_count: team.team_permissions?.[0]?.count || 0,
          }))
        },
      })
      setTeams(loadedTeams)
    } catch (error) {
      log.error('[Teams]', 'Failed to load teams', { error: error })
      addToast('error', 'Failed to load teams')
    } finally {
      setTeamsLoading(false)
    }
  }, [orgId, addToast, setTeams, setTeamsLoading])

  const createTeam = useCallback(
    async (formData: TeamFormData, copyFromTeamId?: string | null): Promise<boolean> => {
      if (!orgId || !user || !formData.name.trim()) return false

      try {
        await routeBackend({
          mdb: async () => {
            const created = await createMdbTeam({
              name: formData.name.trim(), color: formData.color, icon: formData.icon,
            })
            if (copyFromTeamId) {
              await setMdbTeamVaultAccess(created.id, await getMdbTeamVaultAccess(copyFromTeamId))
            }
          },
          supabase: async () => {
            const { data, error } = await insertTeam({
              org_id: orgId, name: formData.name.trim(),
              description: formData.description.trim() || null, color: formData.color,
              icon: formData.icon, is_default: formData.is_default, created_by: user.id,
            })
            if (error) throw error
            if (!copyFromTeamId || !data) return
            const { data: sourcePerms } = await supabase.from('team_permissions')
              .select('resource, actions').eq('team_id', copyFromTeamId)
            const typedSourcePerms = castQueryResult<{ resource: string; actions: string[] }[]>(sourcePerms || [])
            if (typedSourcePerms.length > 0) {
              await insertTeamPermissions(typedSourcePerms.map((permission) => ({
                team_id: data.id, resource: permission.resource,
                actions: permission.actions as ('view' | 'create' | 'edit' | 'delete' | 'admin')[],
                granted_by: user.id,
              })))
            }
            const { data: sourceVaultAccess } = await supabase.from('team_vault_access')
              .select('vault_id').eq('team_id', copyFromTeamId)
            const typedSourceVaultAccess = castQueryResult<{ vault_id: string }[]>(sourceVaultAccess || [])
            if (typedSourceVaultAccess.length > 0) {
              await insertTeamVaultAccess(typedSourceVaultAccess.map((access) => ({
                team_id: data.id, vault_id: access.vault_id, granted_by: user.id,
              })))
            }
          },
        })
        addToast(
          'success',
          copyFromTeamId
            ? t('mdbSetup.teamCreatedWithVaultAccess', { name: formData.name })
            : t('mdbSetup.teamCreated', { name: formData.name }),
        )

        await loadTeams()
        return true
      } catch (error) {
        const pgError = error as { code?: string }
        if (pgError.code === '23505') {
          addToast('error', 'A team with this name already exists')
        } else {
          addToast('error', 'Failed to create team')
        }
        return false
      }
    },
    [orgId, user, addToast, loadTeams],
  )

  const updateTeam = useCallback(
    async (teamId: string, formData: TeamFormData): Promise<boolean> => {
      if (!user || !formData.name.trim()) return false

      try {
        await routeBackend({
          mdb: () => updateMdbTeam(teamId, {
            name: formData.name.trim(), color: formData.color, icon: formData.icon,
          }),
          supabase: async () => {
            const { error } = await updateTeamDb(teamId, {
              name: formData.name.trim(), description: formData.description.trim() || null,
              color: formData.color, icon: formData.icon, is_default: formData.is_default,
              updated_at: new Date().toISOString(), updated_by: user.id,
            })
            if (error) throw error
          },
        })
        addToast('success', t('mdbSetup.teamUpdated', { name: formData.name }))
        await loadTeams()
        return true
      } catch (error) {
        const pgError = error as { code?: string }
        if (pgError.code === '23505') {
          addToast('error', 'A team with this name already exists')
        } else {
          addToast('error', 'Failed to update team')
        }
        return false
      }
    },
    [user, addToast, loadTeams],
  )

  const deleteTeam = useCallback(
    async (teamId: string): Promise<boolean> => {
      const team = teams.find((t) => t.id === teamId)
      if (!team) return false

      try {
        await routeBackend({
          mdb: () => deleteMdbTeam(teamId),
          supabase: async () => {
            const { error } = await supabase.from('teams').delete().eq('id', teamId)
            if (error) throw error
          },
        })
        addToast('success', t('mdbSetup.teamDeleted', { name: team.name }))
        await loadTeams()
        return true
      } catch {
        addToast('error', 'Failed to delete team')
        return false
      }
    },
    [teams, addToast, loadTeams],
  )

  /**
   * Set the default team for new users joining the organization
   *
   * @param teamId - Team ID to set as default, or null to clear
   * @param organizationId - Organization ID to update
   * @param setOrganization - State setter for organization
   * @param organization - Current organization object
   * @returns Promise<boolean> - true if successful
   */
  const setDefaultTeam = useCallback(
    async <T extends { default_new_user_team_id?: string | null }>(
      teamId: string | null,
      organizationId: string,
      setOrganization: (org: T) => void,
      organization: T,
    ): Promise<boolean> => {
      try {
        await routeBackend({
          mdb: () => setMdbDefaultNewUserTeam(teamId),
          supabase: async () => {
            const { error } = await updateOrganization(organizationId, {
              default_new_user_team_id: teamId,
            })
            if (error) throw error
          },
        })
        setOrganization({
          ...organization,
          default_new_user_team_id: teamId,
        })
        const teamName = teamId ? teams.find((team) => team.id === teamId)?.name : t('mdbSetup.noTeam')
        addToast('success', t('mdbSetup.defaultTeamSet', { name: teamName || t('mdbSetup.noTeam') }))
        return true
      } catch (error) {
        log.error('[Teams]', 'Failed to set default team', { error: error })
        addToast('error', 'Failed to update default team')
        return false
      }
    },
    [teams, addToast],
  )

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
    setDefaultTeam,
  }
}
