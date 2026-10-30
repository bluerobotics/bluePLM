// Supabase reads and writes for the Administration section. Every write is plain table work under
// RLS ("Admins can ..." policies gated on is_org_admin()) or the admin_remove_user RPC; nothing
// here needs the service role or the Fastify API. Queries mirror the desktop's team-members hooks
// (src/features/settings/organization/team-members/hooks), copied because that code reads the store.
import { getSupabaseClient } from '@/lib/supabase/client'
import { escapeLikePattern } from '@/lib/utils/likePattern'
import { removeUserFromOrg, updateUserRole } from '@/lib/supabase/teams'
import { diffIds, normalizeEmail, type MembershipRow, type PendingInviteRow, type TeamRow, type UserRole, type UserRow } from './adminLogic'

export interface VaultRow {
  id: string
  name: string
}

export interface AccessRow {
  vault_id: string
  user_id: string
}

export interface TeamAccessRow {
  vault_id: string
  team_id: string
}

export interface AdminSnapshot {
  users: UserRow[]
  memberships: MembershipRow[]
  teams: TeamRow[]
  invites: PendingInviteRow[]
  vaults: VaultRow[]
  userAccess: AccessRow[]
  teamAccess: TeamAccessRow[]
}

export type Result = { ok: true } | { ok: false; error: string; code?: string }

function fail(error: { message: string; code?: string } | null | undefined): Result {
  return error ? { ok: false, error: error.message, code: error.code } : { ok: true }
}

export async function loadAdminSnapshot(orgId: string): Promise<AdminSnapshot> {
  const client = getSupabaseClient()
  const [users, teams, invites, vaults] = await Promise.all([
    client
      .from('users')
      .select('id, email, full_name, role, last_sign_in, last_online')
      .eq('org_id', orgId)
      .order('full_name'),
    client.from('teams').select('id, name, color, description, is_system').eq('org_id', orgId).order('name'),
    client
      .from('pending_org_members')
      .select('id, email, full_name, role, team_ids, vault_ids, invited_at, expires_at')
      .eq('org_id', orgId)
      .is('claimed_at', null)
      .order('invited_at', { ascending: false }),
    client.from('vaults').select('id, name').eq('org_id', orgId).order('name'),
  ])
  for (const result of [users, teams, invites, vaults]) {
    if (result.error) throw new Error(result.error.message)
  }
  const teamIds = (teams.data ?? []).map((team) => team.id)
  const vaultIds = (vaults.data ?? []).map((vault) => vault.id)
  const [memberships, userAccess, teamAccess] = await Promise.all([
    teamIds.length
      ? client.from('team_members').select('user_id, team_id').in('team_id', teamIds)
      : Promise.resolve({ data: [], error: null }),
    vaultIds.length
      ? client.from('vault_access').select('vault_id, user_id').in('vault_id', vaultIds)
      : Promise.resolve({ data: [], error: null }),
    vaultIds.length
      ? client.from('team_vault_access').select('vault_id, team_id').in('vault_id', vaultIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const result of [memberships, userAccess, teamAccess]) {
    if (result.error) throw new Error(result.error.message)
  }
  return {
    users: (users.data ?? []) as UserRow[],
    teams: (teams.data ?? []) as TeamRow[],
    invites: (invites.data ?? []) as PendingInviteRow[],
    vaults: (vaults.data ?? []) as VaultRow[],
    memberships: (memberships.data ?? []) as MembershipRow[],
    userAccess: (userAccess.data ?? []) as AccessRow[],
    teamAccess: (teamAccess.data ?? []) as TeamAccessRow[],
  }
}

export async function changeRole(userId: string, role: UserRole, orgId: string): Promise<Result> {
  const result = await updateUserRole(userId, role, orgId)
  return result.success ? { ok: true } : { ok: false, error: result.error ?? '' }
}

/** admin_remove_user: removes the user from the org and deletes their account. */
export async function removeUser(userId: string, orgId: string): Promise<Result> {
  const result = await removeUserFromOrg(userId, orgId)
  return result.success ? { ok: true } : { ok: false, error: result.error ?? '' }
}

export async function addTeamMember(teamId: string, userId: string, addedBy: string): Promise<Result> {
  const { error } = await getSupabaseClient()
    .from('team_members')
    .insert({ team_id: teamId, user_id: userId, added_by: addedBy })
  if (error?.code === '23505') return { ok: true }
  return fail(error)
}

export async function removeTeamMember(teamId: string, userId: string): Promise<Result> {
  const { error } = await getSupabaseClient().from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)
  return fail(error)
}

export async function createTeam(orgId: string, name: string, description: string, createdBy: string): Promise<Result> {
  const { error } = await getSupabaseClient()
    .from('teams')
    .insert({ org_id: orgId, name: name.trim(), description: description.trim() || null, created_by: createdBy })
  return fail(error)
}

export async function updateTeam(teamId: string, name: string, description: string, updatedBy: string): Promise<Result> {
  const { error } = await getSupabaseClient()
    .from('teams')
    .update({
      name: name.trim(),
      description: description.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq('id', teamId)
  return fail(error)
}

export async function deleteTeam(teamId: string): Promise<Result> {
  // RLS refuses system teams ("Admins can delete teams" ... AND NOT is_system); a refused delete
  // touches no row and reports no error, so ask for the row back to tell the two apart.
  const { data, error } = await getSupabaseClient().from('teams').delete().eq('id', teamId).select('id')
  if (error) return fail(error)
  return data && data.length > 0 ? { ok: true } : { ok: false, error: 'refused' }
}

/**
 * Create an invite: an unclaimed pending_org_members row. When the person signs in with that
 * email, handle_new_user / claim_pending_membership put them in the org with the role, teams and
 * vaults named here. Same steps as the desktop's CreateUserDialog without the API email.
 */
export async function createInvite(input: {
  orgId: string
  email: string
  fullName: string
  role: UserRole
  teamIds: string[]
  vaultIds: string[]
  invitedBy: string
}): Promise<Result> {
  const client = getSupabaseClient()
  const email = normalizeEmail(input.email)
  const { error: clearError } = await client
    .from('pending_org_members')
    .delete()
    .eq('org_id', input.orgId)
    // Escaped: `_` is common in addresses and would otherwise match (and delete) other invites.
    .ilike('email', escapeLikePattern(email))
  if (clearError) return fail(clearError)
  const { error } = await client.from('pending_org_members').insert({
    org_id: input.orgId,
    email,
    full_name: input.fullName.trim() || null,
    role: input.role,
    team_ids: input.teamIds,
    vault_ids: input.vaultIds,
    invited_by: input.invitedBy,
  })
  return fail(error)
}

export async function deleteInvite(inviteId: string): Promise<Result> {
  const { error } = await getSupabaseClient().from('pending_org_members').delete().eq('id', inviteId)
  return fail(error)
}

/** Replace one user's direct vault grants with `wanted`, touching only the rows that change. */
export async function setUserVaults(userId: string, current: string[], wanted: string[], grantedBy: string): Promise<Result> {
  const client = getSupabaseClient()
  const { add, remove } = diffIds(current, wanted)
  if (remove.length) {
    const { error } = await client.from('vault_access').delete().eq('user_id', userId).in('vault_id', remove)
    if (error) return fail(error)
  }
  if (add.length) {
    const { error } = await client
      .from('vault_access')
      .insert(add.map((vaultId) => ({ vault_id: vaultId, user_id: userId, granted_by: grantedBy })))
    if (error && error.code !== '23505') return fail(error)
  }
  return { ok: true }
}

/** Replace one team's vault grants with `wanted`, touching only the rows that change. */
export async function setTeamVaults(teamId: string, current: string[], wanted: string[], grantedBy: string): Promise<Result> {
  const client = getSupabaseClient()
  const { add, remove } = diffIds(current, wanted)
  if (remove.length) {
    const { error } = await client.from('team_vault_access').delete().eq('team_id', teamId).in('vault_id', remove)
    if (error) return fail(error)
  }
  if (add.length) {
    const { error } = await client
      .from('team_vault_access')
      .insert(add.map((vaultId) => ({ vault_id: vaultId, team_id: teamId, granted_by: grantedBy })))
    if (error && error.code !== '23505') return fail(error)
  }
  return { ok: true }
}
