import { routeBackend } from './backendAdapter'
import {
  getMdbDeniedModules,
  getMdbModuleAccessConfig,
  getMdbTeams,
  getMdbUsers,
  setMdbModuleAccess,
} from './mdb'
import { supabase } from './supabase'

export interface ModuleAccessTeam {
  id: string
  name: string
  color: string
}

export interface ModuleAccessMember {
  id: string
  full_name: string | null
  email: string
}

export interface ModuleAccessRow {
  module_id: string
  team_id: string | null
  user_id: string | null
}

export interface ModuleAccessAdministration {
  teams: ModuleAccessTeam[]
  members: ModuleAccessMember[]
  access: ModuleAccessRow[]
}

export async function getModuleAccessAdministration(
  organizationId: string,
): Promise<ModuleAccessAdministration> {
  return routeBackend({
    mdb: async () => {
      const [teams, users, access] = await Promise.all([
        getMdbTeams(),
        getMdbUsers(),
        getMdbModuleAccessConfig(),
      ])
      return {
        teams: teams.map(({ id, name, color }) => ({ id, name, color })),
        members: users.map(({ id, displayName, email }) => ({
          id,
          full_name: displayName || null,
          email,
        })),
        access,
      }
    },
    supabase: async () => {
      const [teamsResult, membersResult, accessResult] = await Promise.all([
        supabase
          .from('teams')
          .select('id, name, color')
          .eq('org_id', organizationId)
          .order('name'),
        supabase
          .from('users')
          .select('id, full_name, email')
          .eq('org_id', organizationId)
          .order('full_name'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.rpc as any)('get_module_access_config'), // TODO: type this
      ])
      if (teamsResult.error) throw teamsResult.error
      if (membersResult.error) throw membersResult.error
      if (accessResult.error) throw accessResult.error
      return {
        teams: (teamsResult.data || []) as ModuleAccessTeam[],
        members: (membersResult.data || []) as ModuleAccessMember[],
        access: (accessResult.data || []) as ModuleAccessRow[],
      }
    },
  })
}

export async function setModuleAccess(
  moduleId: string,
  teamIds: string[],
  userIds: string[],
): Promise<void> {
  return routeBackend({
    mdb: () => setMdbModuleAccess(moduleId, teamIds, userIds),
    supabase: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('set_module_access', {
        // TODO: type this
        p_module_id: moduleId,
        p_team_ids: teamIds,
        p_user_ids: userIds,
      })
      if (error) throw error
      if (data && data.success === false) throw new Error(data.error || 'Failed to save')
    },
  })
}

export async function getDeniedModules(): Promise<string[]> {
  return routeBackend({
    mdb: getMdbDeniedModules,
    supabase: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_denied_modules') // TODO: type this
      if (error) throw error
      return (data || []) as string[]
    },
  })
}
