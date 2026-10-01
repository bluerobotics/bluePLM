import { describe, expect, it, vi } from 'vitest'
import { selectUserProfileDataSource } from './UserProfileModal.data'

describe('selectUserProfileDataSource', () => {
  it('does not initialize Supabase while the MDB backend is active', () => {
    const getClient = vi.fn(() => {
      throw new Error('Supabase is inactive while the MariaDB backend is selected.')
    })

    expect(selectUserProfileDataSource(true, getClient)).toEqual({ kind: 'mdb' })
    expect(getClient).not.toHaveBeenCalled()
  })

  it('initializes Supabase for a Supabase profile', () => {
    const client = { from: vi.fn() }
    const getClient = vi.fn(() => client)

    expect(selectUserProfileDataSource(false, getClient)).toEqual({
      kind: 'supabase',
      client,
    })
    expect(getClient).toHaveBeenCalledOnce()
  })
})
