import { beforeEach, describe, expect, it, vi } from 'vitest'

import { activateBackend, clearBackendProfile } from '@/lib/backend'
import { LicenseManagerSection } from './LicenseManagerSection'

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
})

describe('LicenseManagerSection backend routing', () => {
  beforeEach(() => {
    localStorage.clear()
    clearBackendProfile()
  })

  it('does not select the Supabase license manager in MDB mode', () => {
    activateBackend('mdb')

    expect(LicenseManagerSection()).toBeNull()
  })
})
