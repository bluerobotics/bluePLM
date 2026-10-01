import { afterEach, describe, expect, it, vi } from 'vitest'

import { cancelMdbCheckout, getMdbPrincipal, loadMdbConfig, saveMdbConfig } from './mdb'

const storage = new Map<string, string>()

describe('MariaDB session expiry', () => {
  afterEach(() => {
    storage.clear()
    vi.unstubAllGlobals()
  })

  it('removes an invalid access token after an authenticated request returns 401', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'UNAUTHENTICATED', message: 'Session is invalid or expired.' }), {
          status: 401,
        }),
      ),
    )
    saveMdbConfig({
      version: 1,
      serverUrl: 'https://mdb.example.test',
      accessToken: 'expired-token',
    })

    await expect(getMdbPrincipal()).rejects.toThrow('Session is invalid or expired.')
    expect(loadMdbConfig()).toEqual({
      version: 1,
      serverUrl: 'https://mdb.example.test',
    })
  })

  it('migrates legacy MDB configuration and checkout storage on first use', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    storage.set('blueplm-community-config', JSON.stringify({
      version: 1,
      serverUrl: 'https://mdb.example.test',
      accessToken: 'legacy-token',
    }))
    storage.set('blueplm-community-checkouts', JSON.stringify({
      'file-1': { token: 'checkout-token', vaultId: 'vault-1' },
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))

    await cancelMdbCheckout('file-1')

    expect(storage.has('blueplm-community-config')).toBe(false)
    expect(storage.has('blueplm-community-checkouts')).toBe(false)
    expect(JSON.parse(storage.get('blueplm-mdb-config') ?? '{}')).toMatchObject({
      version: 1,
      serverUrl: 'https://mdb.example.test',
      accessToken: 'legacy-token',
    })
    expect(JSON.parse(storage.get('blueplm-mdb-checkouts') ?? '{}')).toEqual({})
    expect(JSON.parse(storage.get('blueplm-backend-profile') ?? '{}')).toEqual({
      version: 1,
      kind: 'mdb',
    })
  })
})
