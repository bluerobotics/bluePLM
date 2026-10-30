import { describe, expect, it } from 'vitest'
import {
  buildAdminTeams,
  buildOrgUsers,
  checkInvite,
  checkTeamName,
  diffIds,
  filterUsers,
  grantedVaultIds,
  isInviteExpired,
  isProtectedTeam,
  lastSeen,
  parseAdminTab,
  refuseAdminChange,
  toggleId,
  vaultsViaTeams,
  type TeamRow,
  type UserRow,
} from './adminLogic'

const teams: TeamRow[] = [
  { id: 'tA', name: 'Administrators', color: '#eab308', description: null, is_system: true },
  { id: 'tE', name: 'Engineering', color: '#3b82f6', description: 'Design', is_system: false },
]

function user(id: string, role: string, extra: Partial<UserRow> = {}): UserRow {
  return { id, email: `${id}@example.com`, full_name: id.toUpperCase(), role, last_sign_in: null, last_online: null, ...extra }
}

describe('parseAdminTab', () => {
  it('defaults to users and rejects unknown tabs', () => {
    expect(parseAdminTab(undefined)).toBe('users')
    expect(parseAdminTab('teams')).toBe('teams')
    expect(parseAdminTab('vaults')).toBe('vaults')
    expect(parseAdminTab('nope')).toBeNull()
  })
})

describe('buildOrgUsers', () => {
  it('joins teams, follows the one admin definition and hides pending emails', () => {
    const users = buildOrgUsers(
      [user('a', 'viewer'), user('b', 'admin'), user('c', 'engineer'), user('p', 'viewer')],
      [
        { user_id: 'a', team_id: 'tA' },
        { user_id: 'c', team_id: 'tE' },
        { user_id: 'c', team_id: 'gone' },
      ],
      teams,
      ['P@Example.com '],
    )
    expect(users.map((u) => u.id)).toEqual(['a', 'b', 'c'])
    expect(users.find((u) => u.id === 'a')?.isAdmin).toBe(true) // through the Administrators team
    expect(users.find((u) => u.id === 'b')?.isAdmin).toBe(true) // through the role
    expect(users.find((u) => u.id === 'c')?.isAdmin).toBe(false)
    expect(users.find((u) => u.id === 'c')?.teams.map((t) => t.name)).toEqual(['Engineering'])
  })
})

describe('refuseAdminChange', () => {
  const org = buildOrgUsers(
    [user('me', 'admin'), user('teamAdmin', 'viewer'), user('eng', 'engineer')],
    [{ user_id: 'teamAdmin', team_id: 'tA' }],
    teams,
    [],
  )

  it('refuses taking admin away from yourself', () => {
    expect(refuseAdminChange(org, { kind: 'role', userId: 'me', role: 'viewer' }, 'me')).toBe('self')
    expect(refuseAdminChange(org, { kind: 'remove', userId: 'me' }, 'me')).toBe('self')
  })

  it('allows a role change that keeps you admin through the team', () => {
    const withTeam = buildOrgUsers([user('me', 'admin'), user('x', 'admin')], [{ user_id: 'me', team_id: 'tA' }], teams, [])
    expect(refuseAdminChange(withTeam, { kind: 'role', userId: 'me', role: 'viewer' }, 'me')).toBeNull()
  })

  it('refuses removing the last administrator', () => {
    const one = buildOrgUsers([user('me', 'engineer'), user('solo', 'viewer')], [{ user_id: 'solo', team_id: 'tA' }], teams, [])
    expect(refuseAdminChange(one, { kind: 'leaveTeam', userId: 'solo', teamId: 'tA' }, 'me')).toBe('lastAdmin')
    expect(refuseAdminChange(one, { kind: 'remove', userId: 'solo' }, 'me')).toBe('lastAdmin')
  })

  it('allows changes that leave another admin', () => {
    expect(refuseAdminChange(org, { kind: 'leaveTeam', userId: 'teamAdmin', teamId: 'tA' }, 'me')).toBeNull()
    expect(refuseAdminChange(org, { kind: 'remove', userId: 'teamAdmin' }, 'me')).toBeNull()
    expect(refuseAdminChange(org, { kind: 'role', userId: 'eng', role: 'viewer' }, 'me')).toBeNull()
  })

  it('a role change does not remove admin given by the team', () => {
    expect(refuseAdminChange(org, { kind: 'role', userId: 'teamAdmin', role: 'viewer' }, 'me')).toBeNull()
  })
})

describe('teams', () => {
  it('protects the Administrators team and system teams', () => {
    expect(isProtectedTeam({ name: 'Administrators', is_system: false })).toBe(true)
    expect(isProtectedTeam({ name: 'Viewers', is_system: true })).toBe(true)
    expect(isProtectedTeam({ name: 'Engineering', is_system: null })).toBe(false)
  })

  it('lists members per team', () => {
    const built = buildAdminTeams(teams, [{ user_id: 'a', team_id: 'tE' }])
    expect(built.find((t) => t.id === 'tE')?.memberIds).toEqual(['a'])
    expect(built.find((t) => t.id === 'tA')?.protected).toBe(true)
  })

  it('checks team names', () => {
    expect(checkTeamName('  ', teams)).toBe('empty')
    expect(checkTeamName('x'.repeat(101), teams)).toBe('tooLong')
    expect(checkTeamName(' engineering ', teams)).toBe('duplicate')
    expect(checkTeamName('Engineering', teams, 'tE')).toBeNull()
    expect(checkTeamName('Quality', teams)).toBeNull()
  })
})

describe('invites', () => {
  it('validates email and refuses members and pending invites', () => {
    const users = [{ email: 'a@example.com' }]
    const invites = [{ email: 'p@example.com' }]
    expect(checkInvite('not-an-email', users, invites)).toBe('invalidEmail')
    expect(checkInvite(' A@Example.com', users, invites)).toBe('alreadyMember')
    expect(checkInvite('P@example.com', users, invites)).toBe('alreadyInvited')
    expect(checkInvite('new@example.com', users, invites)).toBeNull()
  })

  it('knows when an invite has expired', () => {
    const now = new Date('2026-10-29T12:00:00Z')
    expect(isInviteExpired({ expires_at: '2026-10-01T00:00:00Z' }, now)).toBe(true)
    expect(isInviteExpired({ expires_at: '2026-11-28T00:00:00Z' }, now)).toBe(false)
    expect(isInviteExpired({ expires_at: null }, now)).toBe(false)
  })
})

describe('access helpers', () => {
  it('diffs grant sets', () => {
    expect(diffIds(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] })
    expect(diffIds(['a'], ['a'])).toEqual({ add: [], remove: [] })
  })

  it('toggles ids', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('reads grants per subject and through teams', () => {
    const rows = [
      { vault_id: 'v1', user_id: 'u1' },
      { vault_id: 'v2', user_id: 'u2' },
    ]
    expect(grantedVaultIds(rows, 'user_id', 'u1')).toEqual(['v1'])
    const via = vaultsViaTeams(
      [{ id: 'tE', name: 'Engineering', color: '' }],
      [
        { vault_id: 'v1', team_id: 'tE' },
        { vault_id: 'v2', team_id: 'other' },
      ],
    )
    expect(via.get('v1')).toEqual(['Engineering'])
    expect(via.has('v2')).toBe(false)
  })
})

describe('user list helpers', () => {
  const org = buildOrgUsers([user('ann', 'viewer'), user('bob', 'viewer')], [{ user_id: 'bob', team_id: 'tE' }], teams, [])

  it('filters by name, email and team', () => {
    expect(filterUsers(org, 'ANN').map((u) => u.id)).toEqual(['ann'])
    expect(filterUsers(org, 'engineering').map((u) => u.id)).toEqual(['bob'])
    expect(filterUsers(org, ' ')).toHaveLength(2)
  })

  it('takes the later activity stamp', () => {
    expect(lastSeen({ last_sign_in: '2026-10-01T00:00:00Z', last_online: '2026-10-20T00:00:00Z' })).toBe('2026-10-20T00:00:00Z')
    expect(lastSeen({ last_sign_in: '2026-10-21T00:00:00Z', last_online: null })).toBe('2026-10-21T00:00:00Z')
    expect(lastSeen({ last_sign_in: null, last_online: null })).toBeNull()
  })
})
