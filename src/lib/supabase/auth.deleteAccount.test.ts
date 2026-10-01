import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteMdbAccount, getSupabaseClient } = vi.hoisted(() => ({
  deleteMdbAccount: vi.fn(),
  getSupabaseClient: vi.fn(),
}))

vi.mock('./client', () => ({
  authLog: vi.fn(),
  getCurrentConfigValues: vi.fn(),
  getSupabaseClient,
  setSessionResolver: vi.fn(),
}))

vi.mock('@/lib/mdb', () => ({
  mdbAccessToken: vi.fn(),
  deleteMdbAccount,
  getMdbPrincipal: vi.fn(),
  signInMdb: vi.fn(),
  signOutMdb: vi.fn(),
}))

vi.mock('@/lib/backendAdapter', () => ({
  routeBackend: <TMdb, TSupabase>(routes: { mdb: () => TMdb; supabase: () => TSupabase }) =>
    routes.mdb(),
}))

import { deleteCurrentAccount } from './auth'

describe('deleteCurrentAccount in MDB mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses only the MDB account endpoint', async () => {
    deleteMdbAccount.mockResolvedValue(undefined)

    await expect(deleteCurrentAccount()).resolves.toEqual({ error: null })
    expect(deleteMdbAccount).toHaveBeenCalledOnce()
    expect(getSupabaseClient).not.toHaveBeenCalled()
  })

  it('normalizes MDB request failures', async () => {
    deleteMdbAccount.mockRejectedValue('network failure')

    const result = await deleteCurrentAccount()
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('network failure')
  })
})
