import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activateBackend,
  clearBackendProfile,
  getActiveBackendKind,
  isBackendActive,
  loadBackendProfile,
} from './backend'
import { hasConfig } from './supabaseConfig'
import { saveMdbConfig } from './mdb'
import { isMdbBackendActive } from './backendAdapter'

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
    activateBackend('mdb')

    expect(getActiveBackendKind()).toBe('mdb')
    expect(isBackendActive('mdb')).toBe(true)
    expect(isBackendActive('supabase')).toBe(false)

    activateBackend('supabase')

    expect(getActiveBackendKind()).toBe('supabase')
    expect(isBackendActive('mdb')).toBe(false)
    expect(isBackendActive('supabase')).toBe(true)
  })

  it('rejects malformed persisted profiles', () => {
    localStorage.setItem('blueplm-backend-profile', JSON.stringify({ version: 1, kind: 'mariadb' }))

    expect(loadBackendProfile()).toBeNull()
  })

  it('migrates the legacy MDB backend profile to the canonical identifier', () => {
    localStorage.setItem('blueplm-backend-profile', JSON.stringify({ version: 1, kind: 'community' }))

    expect(loadBackendProfile()).toEqual({ version: 1, kind: 'mdb' })
    expect(JSON.parse(localStorage.getItem('blueplm-backend-profile') ?? '{}')).toEqual({
      version: 1,
      kind: 'mdb',
    })
  })

  it('recognizes a legacy MDB configuration when no backend profile exists', () => {
    localStorage.setItem('blueplm-community-config', JSON.stringify({
      version: 1,
      serverUrl: 'https://mdb.example.test',
    }))

    expect(getActiveBackendKind()).toBe('mdb')
  })

  it('can return a client to backend selection', () => {
    activateBackend('mdb')
    clearBackendProfile()

    expect(getActiveBackendKind()).toBeNull()
  })

  it('uses legacy credentials only when no explicit profile exists', () => {
    localStorage.setItem('blueplm-supabase-config', JSON.stringify({ url: 'https://example.test', anonKey: 'key' }))
    expect(getActiveBackendKind()).toBe('supabase')

    activateBackend('mdb')
    expect(getActiveBackendKind()).toBe('mdb')
  })

  it('does not expose inactive Supabase credentials in MDB mode', () => {
    localStorage.setItem('blueplm-supabase-config', JSON.stringify({ url: 'https://example.test', anonKey: 'key' }))
    saveMdbConfig({ version: 1, serverUrl: 'https://mdb.example.test' })

    expect(isMdbBackendActive()).toBe(true)
    expect(hasConfig()).toBe(false)
  })
})
