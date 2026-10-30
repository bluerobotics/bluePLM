import { beforeEach, describe, expect, it } from 'vitest'
import type { StateCreator } from 'zustand'

import { createUserSlice } from './userSlice'
import type { ImpersonatedUser, PDMStoreState, UserSlice } from '../types'
import type { User } from '../../types/pdm'

type UserSliceCreator = StateCreator<PDMStoreState, [['zustand/persist', unknown]], [], UserSlice>
type StoreSet = Parameters<UserSliceCreator>[0]
type StoreGet = Parameters<UserSliceCreator>[1]

const ADMIN_TEAM = { id: 'team-admin', name: 'Administrators', color: '#eab308', icon: 'Star' }
const ENGINEERS_TEAM = { id: 'team-eng', name: 'Engineers', color: '#3b82f6', icon: 'Wrench' }

function makeUser(role: User['role']): User {
  return {
    id: 'user-1',
    email: 'wilson@example.com',
    full_name: 'Wilson',
    avatar_url: null,
    custom_avatar_url: null,
    job_title: null,
    org_id: 'org-1',
    role,
    created_at: '2026-01-01T00:00:00Z',
    last_sign_in_at: null,
  }
}

function makeImpersonated(
  role: ImpersonatedUser['role'],
  teams: ImpersonatedUser['teams'],
): ImpersonatedUser {
  return {
    id: 'user-2',
    email: 'other@example.com',
    full_name: 'Other',
    avatar_url: null,
    role,
    teams,
    permissions: {},
    vaultIds: [],
  }
}

describe('admin means role admin OR Administrators team', () => {
  let store: PDMStoreState

  beforeEach(() => {
    store = {} as unknown as PDMStoreState
    const set: StoreSet = (partial) => {
      const update = typeof partial === 'function' ? partial(store) : partial
      store = { ...store, ...update }
    }
    const get: StoreGet = () => store
    const api = {} as Parameters<UserSliceCreator>[2]
    store = { ...createUserSlice(set, get, api), deniedModules: ['workflows'] } as PDMStoreState
  })

  it('a role=engineer user in the Administrators team is an admin with full access', () => {
    store = { ...store, user: makeUser('engineer'), userTeams: [ADMIN_TEAM] }

    expect(store.getEffectiveRole()).toBe('admin')
    expect(store.hasPermission('module:anything', 'delete')).toBe(true)
    expect(store.canAccessModule('workflows')).toBe(true)
  })

  it('a role=engineer user outside the Administrators team is not', () => {
    store = { ...store, user: makeUser('engineer'), userTeams: [ENGINEERS_TEAM], userPermissions: {} }

    expect(store.getEffectiveRole()).toBe('engineer')
    expect(store.hasPermission('module:anything', 'delete')).toBe(false)
    expect(store.canAccessModule('workflows')).toBe(false)
  })

  it('stops being admin when the team membership is removed', () => {
    store = { ...store, user: makeUser('viewer'), userTeams: [ADMIN_TEAM], userPermissions: {} }
    expect(store.getEffectiveRole()).toBe('admin')

    store = { ...store, userTeams: [] }
    expect(store.getEffectiveRole()).toBe('viewer')
  })

  it('is not admin before the teams have loaded, and the role column still works', () => {
    store = { ...store, user: makeUser('engineer'), userTeams: null }
    expect(store.getEffectiveRole()).toBe('engineer')

    store = { ...store, user: makeUser('admin'), userTeams: null }
    expect(store.getEffectiveRole()).toBe('admin')
  })

  it('judges an impersonated user by their own role and teams, not the real admin', () => {
    store = {
      ...store,
      user: makeUser('admin'),
      userTeams: [ADMIN_TEAM],
      impersonatedUser: makeImpersonated('engineer', [ENGINEERS_TEAM]),
    }
    expect(store.getEffectiveRole()).toBe('engineer')
    expect(store.hasPermission('module:anything', 'delete')).toBe(false)

    store = { ...store, impersonatedUser: makeImpersonated('engineer', [ADMIN_TEAM]) }
    expect(store.getEffectiveRole()).toBe('admin')
    expect(store.hasPermission('module:anything', 'delete')).toBe(true)
  })
})
