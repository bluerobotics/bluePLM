// Pure decisions for the Administration section: building the user list, the admin guards and
// access diffs. No Supabase, no React, so every rule here is tested in adminLogic.test.ts.
//
// Admin follows the one definition (src/lib/isAdminUser.ts, `is_org_admin()` in SQL): role
// 'admin' OR membership of the Administrators team. The guards below only hide actions; the
// database (RLS, SECURITY DEFINER RPCs) still decides.
import { ADMINISTRATORS_TEAM_NAME, isAdminUser } from '@/lib/isAdminUser'

export type UserRole = 'admin' | 'engineer' | 'viewer'
export const USER_ROLES: readonly UserRole[] = ['admin', 'engineer', 'viewer']

export type AdminTab = 'users' | 'invites' | 'teams' | 'vaults'
export const ADMIN_TABS: readonly AdminTab[] = ['users', 'invites', 'teams', 'vaults']

export interface TeamRef {
  id: string
  name: string
  color: string
}

export interface UserRow {
  id: string
  email: string
  full_name: string | null
  role: string
  last_sign_in: string | null
  last_online: string | null
}

export interface MembershipRow {
  user_id: string
  team_id: string
}

export interface TeamRow extends TeamRef {
  description: string | null
  is_system: boolean | null
}

export interface OrgUser extends UserRow {
  teams: TeamRef[]
  isAdmin: boolean
}

export interface AdminTeam extends TeamRow {
  memberIds: string[]
  protected: boolean
}

/** The sub-path's first segment picks the tab; anything else is the users tab. */
export function parseAdminTab(segment: string | undefined): AdminTab | null {
  if (!segment) return 'users'
  return (ADMIN_TABS as readonly string[]).includes(segment) ? (segment as AdminTab) : null
}

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** The Administrators team (and any other system team) cannot be renamed or deleted. */
export function isProtectedTeam(team: { name: string; is_system: boolean | null }): boolean {
  return team.is_system === true || team.name === ADMINISTRATORS_TEAM_NAME
}

/**
 * Join users, team memberships and teams. Users whose email still has an unclaimed invite are
 * left out, as the desktop does: they appear under Invites until they sign in.
 */
export function buildOrgUsers(
  users: UserRow[],
  memberships: MembershipRow[],
  teams: TeamRef[],
  pendingEmails: string[],
): OrgUser[] {
  const pending = new Set(pendingEmails.map(normalizeEmail))
  const teamById = new Map(teams.map((team) => [team.id, team]))
  const teamsByUser = new Map<string, TeamRef[]>()
  for (const membership of memberships) {
    const team = teamById.get(membership.team_id)
    if (!team) continue
    const list = teamsByUser.get(membership.user_id) ?? []
    list.push(team)
    teamsByUser.set(membership.user_id, list)
  }
  return users
    .filter((user) => !pending.has(normalizeEmail(user.email)))
    .map((user) => {
      const userTeams = (teamsByUser.get(user.id) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))
      return { ...user, teams: userTeams, isAdmin: isAdminUser(user.role, userTeams) }
    })
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
}

export function buildAdminTeams(teams: TeamRow[], memberships: MembershipRow[]): AdminTeam[] {
  return teams
    .map((team) => ({
      ...team,
      memberIds: memberships.filter((m) => m.team_id === team.id).map((m) => m.user_id),
      protected: isProtectedTeam(team),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function displayName(user: { full_name: string | null; email: string }): string {
  return user.full_name?.trim() || user.email
}

/** A change that could take admin away from someone. */
export type AdminChange =
  | { kind: 'role'; userId: string; role: UserRole }
  | { kind: 'leaveTeam'; userId: string; teamId: string }
  | { kind: 'remove'; userId: string }

/** Admin status of every user after the change is applied. */
function adminsAfter(users: OrgUser[], change: AdminChange): number {
  let count = 0
  for (const user of users) {
    if (user.id !== change.userId) {
      if (user.isAdmin) count++
      continue
    }
    if (change.kind === 'remove') continue
    const role = change.kind === 'role' ? change.role : user.role
    const teams = change.kind === 'leaveTeam' ? user.teams.filter((team) => team.id !== change.teamId) : user.teams
    if (isAdminUser(role, teams)) count++
  }
  return count
}

/**
 * Why a change is refused, or null when it is allowed. The database has no last-admin
 * protection (see the "Admins can update org users" note in supabase/core.sql), so the UI
 * keeps an organization from being left without an administrator, and keeps an admin from
 * taking admin away from themselves.
 */
export function refuseAdminChange(
  users: OrgUser[],
  change: AdminChange,
  currentUserId: string,
): 'self' | 'lastAdmin' | null {
  const target = users.find((user) => user.id === change.userId)
  if (!target) return null
  if (change.userId === currentUserId) {
    if (change.kind === 'remove') return 'self'
    const stillAdmin = adminsAfter([target], change) === 1
    if (target.isAdmin && !stillAdmin) return 'self'
  }
  if (target.isAdmin && adminsAfter(users, change) === 0) return 'lastAdmin'
  return null
}

/** Rows to insert and rows to delete to go from the current grant set to the wanted one. */
export function diffIds(current: string[], wanted: string[]): { add: string[]; remove: string[] } {
  const currentSet = new Set(current)
  const wantedSet = new Set(wanted)
  return {
    add: [...wantedSet].filter((id) => !currentSet.has(id)),
    remove: [...currentSet].filter((id) => !wantedSet.has(id)),
  }
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]
}

export const TEAM_NAME_MAX = 100

export type TeamNameProblem = 'empty' | 'tooLong' | 'duplicate' | null

export function checkTeamName(name: string, teams: { id: string; name: string }[], ownId?: string): TeamNameProblem {
  const trimmed = name.trim()
  if (!trimmed) return 'empty'
  if (trimmed.length > TEAM_NAME_MAX) return 'tooLong'
  const lower = trimmed.toLowerCase()
  if (teams.some((team) => team.id !== ownId && team.name.trim().toLowerCase() === lower)) return 'duplicate'
  return null
}

export interface PendingInviteRow {
  id: string
  email: string
  full_name: string | null
  role: string | null
  team_ids: string[] | null
  vault_ids: string[] | null
  invited_at: string | null
  expires_at: string | null
}

export type InviteProblem = 'invalidEmail' | 'alreadyMember' | 'alreadyInvited' | null

export function checkInvite(email: string, users: { email: string }[], invites: { email: string }[]): InviteProblem {
  if (!isValidEmail(email)) return 'invalidEmail'
  const normalized = normalizeEmail(email)
  if (users.some((user) => normalizeEmail(user.email) === normalized)) return 'alreadyMember'
  if (invites.some((invite) => normalizeEmail(invite.email) === normalized)) return 'alreadyInvited'
  return null
}

export function isInviteExpired(invite: { expires_at: string | null }, now: Date): boolean {
  if (!invite.expires_at) return false
  const expires = Date.parse(invite.expires_at)
  return Number.isFinite(expires) && expires <= now.getTime()
}

/** Free-text filter over name, email and team names. */
export function filterUsers(users: OrgUser[], query: string): OrgUser[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return users
  return users.filter(
    (user) =>
      user.email.toLowerCase().includes(needle) ||
      (user.full_name ?? '').toLowerCase().includes(needle) ||
      user.teams.some((team) => team.name.toLowerCase().includes(needle)),
  )
}

/** The later of the two activity stamps, or null. */
export function lastSeen(user: { last_sign_in: string | null; last_online: string | null }): string | null {
  const stamps = [user.last_online, user.last_sign_in].filter((value): value is string => !!value)
  if (stamps.length === 0) return null
  return stamps.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest))
}

/** Vault ids granted to one subject (user or team) by access rows. */
export function grantedVaultIds<K extends 'user_id' | 'team_id'>(
  rows: Array<{ vault_id: string } & Record<K, string>>,
  key: K,
  id: string,
): string[] {
  return rows.filter((row) => row[key] === id).map((row) => row.vault_id)
}

/** For each vault a user reaches through their teams, the names of those teams. */
export function vaultsViaTeams(
  userTeams: TeamRef[],
  teamAccess: Array<{ vault_id: string; team_id: string }>,
): Map<string, string[]> {
  const nameById = new Map(userTeams.map((team) => [team.id, team.name]))
  const result = new Map<string, string[]>()
  for (const row of teamAccess) {
    const name = nameById.get(row.team_id)
    if (!name) continue
    result.set(row.vault_id, [...(result.get(row.vault_id) ?? []), name])
  }
  return result
}
