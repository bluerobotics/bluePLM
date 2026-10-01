import { beforeEach, describe, expect, it, vi } from 'vitest'

import { activateBackend, clearBackendProfile } from '../backend'
import { getUserWorkflowRoles } from './teams'

const { getMdbUserWorkflowRoles } = vi.hoisted(() => ({
  getMdbUserWorkflowRoles: vi.fn(),
}))

vi.mock('@/lib/mdb', () => ({
  getMdbTeams: vi.fn(),
  getMdbUserTeams: vi.fn(),
  getMdbUserWorkflowRoles,
  removeMdbUser: vi.fn(),
}))

vi.mock('./client', () => ({
  getSupabaseClient: vi.fn(() => {
    throw new Error('Supabase must not be initialized for MDB workflow-role lookup')
  }),
}))

const storage = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
})

describe('MDB workflow-role hydration', () => {
  beforeEach(() => {
    storage.clear()
    clearBackendProfile()
    getMdbUserWorkflowRoles.mockReset()
    activateBackend('mdb')
  })

  it('loads separately assigned workflow roles for the active MDB user', async () => {
    getMdbUserWorkflowRoles.mockResolvedValue(['workflow-role-1', 'workflow-role-2'])

    await expect(getUserWorkflowRoles('user-1')).resolves.toEqual({
      roleIds: ['workflow-role-1', 'workflow-role-2'],
    })
    expect(getMdbUserWorkflowRoles).toHaveBeenCalledWith('user-1')
  })

  it('fails closed when the MDB role lookup cannot be loaded', async () => {
    getMdbUserWorkflowRoles.mockRejectedValue(new Error('backend unavailable'))

    await expect(getUserWorkflowRoles('user-1')).resolves.toEqual({
      roleIds: [],
      error: 'backend unavailable',
    })
  })
})
