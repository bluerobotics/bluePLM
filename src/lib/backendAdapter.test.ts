import { beforeEach, describe, expect, it, vi } from 'vitest'

import { activateBackend, clearBackendProfile } from './backend'
import {
  activeBackendSupports,
  activeBackendSupportsModule,
  activeBackendSupportsSettingsTab,
  getActiveBackendSettingsTabAvailability,
  mapMdbRole,
  routeBackend,
} from './backendAdapter'

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

  it('does not expose the Supabase-only SOLIDWORKS license manager in MDB mode', () => {
    activateBackend('mdb')

    expect(activeBackendSupports('solidworks-license-management')).toBe(false)
    expect(activeBackendSupports('metadata-column-defaults')).toBe(true)
  })

  it('keeps SOLIDWORKS license management available in Supabase mode', () => {
    activateBackend('supabase')

    expect(activeBackendSupports('solidworks-license-management')).toBe(true)
    expect(activeBackendSupports('metadata-column-defaults')).toBe(true)
  })

  it('classifies MDB settings without removing them from the original menu', () => {
    activateBackend('mdb')

    expect(activeBackendSupportsSettingsTab('item-designations')).toBe(true)
    expect(activeBackendSupportsSettingsTab('recovery-codes')).toBe(true)
    expect(activeBackendSupportsSettingsTab('delete-account')).toBe(true)
    expect(activeBackendSupportsSettingsTab('module-access')).toBe(true)
    expect(activeBackendSupportsSettingsTab('auth-providers')).toBe(true)
    expect(getActiveBackendSettingsTabAvailability('auth-providers')).toBe('supported')
    expect(activeBackendSupportsSettingsTab('serialization')).toBe(true)
    expect(activeBackendSupportsSettingsTab('export')).toBe(true)
    expect(activeBackendSupportsSettingsTab('rfq')).toBe(true)
    expect(activeBackendSupportsSettingsTab('metadata-columns')).toBe(true)
    expect(activeBackendSupportsSettingsTab('google-drive')).toBe(false)
    expect(getActiveBackendSettingsTabAvailability('google-drive')).toBe('incompatible')
    expect(activeBackendSupportsModule('google-drive')).toBe(false)
    expect(activeBackendSupportsModule('explorer')).toBe(true)
    expect(activeBackendSupportsSettingsTab('profile')).toBe(true)
    expect(getActiveBackendSettingsTabAvailability('profile')).toBe('supported')
  })

  it('keeps the complete settings surface available in Supabase mode', () => {
    activateBackend('supabase')

    expect(activeBackendSupportsSettingsTab('item-designations')).toBe(true)
    expect(activeBackendSupportsSettingsTab('profile')).toBe(true)
    expect(activeBackendSupportsSettingsTab('recovery-codes')).toBe(true)
    expect(activeBackendSupportsSettingsTab('auth-providers')).toBe(true)
    expect(activeBackendSupportsSettingsTab('google-drive')).toBe(true)
    expect(activeBackendSupportsModule('google-drive')).toBe(true)
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
    activateBackend('mdb')

    expect(routeBackend({ mdb, supabase })).toBe('mdb')
    expect(mdb).toHaveBeenCalledOnce()
    expect(supabase).not.toHaveBeenCalled()
  })
})
