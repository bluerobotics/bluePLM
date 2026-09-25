import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activateBackend,
  clearBackendProfile,
  getActiveBackendKind,
  isBackendActive,
  loadBackendProfile,
} from './backend'
import { hasConfig } from './supabaseConfig'
import { isBackendConfigured, saveCommunityConfig } from './community'

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
})

describe('backend profile', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('activates exactly the selected adapter', () => {
    activateBackend('community')

    expect(getActiveBackendKind()).toBe('community')
    expect(isBackendActive('community')).toBe(true)
    expect(isBackendActive('supabase')).toBe(false)

    activateBackend('supabase')

    expect(getActiveBackendKind()).toBe('supabase')
    expect(isBackendActive('community')).toBe(false)
    expect(isBackendActive('supabase')).toBe(true)
  })

  it('rejects malformed persisted profiles', () => {
    localStorage.setItem('blueplm-backend-profile', JSON.stringify({ version: 1, kind: 'mariadb' }))

    expect(loadBackendProfile()).toBeNull()
  })

  it('can return a client to backend selection', () => {
    activateBackend('community')
    clearBackendProfile()

    expect(getActiveBackendKind()).toBeNull()
  })

  it('uses legacy credentials only when no explicit profile exists', () => {
    localStorage.setItem('blueplm-supabase-config', JSON.stringify({ url: 'https://example.test', anonKey: 'key' }))
    expect(getActiveBackendKind()).toBe('supabase')

    activateBackend('community')
    expect(getActiveBackendKind()).toBe('community')
  })

  it('does not expose inactive Supabase credentials in Community mode', () => {
    localStorage.setItem('blueplm-supabase-config', JSON.stringify({ url: 'https://example.test', anonKey: 'key' }))
    saveCommunityConfig({ version: 1, serverUrl: 'https://community.example.test' })

    expect(isBackendConfigured('community')).toBe(true)
    expect(hasConfig()).toBe(false)
  })
})
