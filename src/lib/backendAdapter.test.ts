import { beforeEach, describe, expect, it, vi } from 'vitest'

import { activateBackend, clearBackendProfile } from './backend'
import { activeBackendSupports, mapMdbRole, routeBackend } from './backendAdapter'

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
})

describe('backend capabilities', () => {
  beforeEach(() => {
    localStorage.clear()
    clearBackendProfile()
  })

  it('does not expose Supabase-only SOLIDWORKS license management in MDB mode', () => {
    activateBackend('community')

    expect(activeBackendSupports('solidworks-license-management')).toBe(false)
  })

  it('keeps SOLIDWORKS license management available in Supabase mode', () => {
    activateBackend('supabase')

    expect(activeBackendSupports('solidworks-license-management')).toBe(true)
  })

  it('maps MDB viewer and guest accounts to the least-privileged client role', () => {
    expect(mapMdbRole('owner')).toBe('admin')
    expect(mapMdbRole('admin')).toBe('admin')
    expect(mapMdbRole('member')).toBe('engineer')
    expect(mapMdbRole('viewer')).toBe('viewer')
    expect(mapMdbRole('guest')).toBe('viewer')
    expect(mapMdbRole('unexpected')).toBeNull()
  })

  it('executes only the selected backend implementation', () => {
    const mdb = vi.fn(() => 'mdb')
    const supabase = vi.fn(() => 'supabase')
    activateBackend('community')

    expect(routeBackend({ mdb, supabase })).toBe('mdb')
    expect(mdb).toHaveBeenCalledOnce()
    expect(supabase).not.toHaveBeenCalled()
  })
})
