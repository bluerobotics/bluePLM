import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  storedConfig: null as { version: number; url: string; anonKey: string } | null,
  createClient: vi.fn(),
  client: {
    auth: {
      onAuthStateChange: vi.fn(),
      setSession: vi.fn(),
    },
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: fixture.createClient,
}))

vi.mock('@/lib/supabaseConfig', () => ({
  loadConfig: () => fixture.storedConfig,
}))

vi.mock('@/lib/logger', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

async function loadResolver() {
  vi.resetModules()
  return import('./index')
}

beforeEach(() => {
  fixture.storedConfig = null
  fixture.createClient.mockReset()
  fixture.createClient.mockReturnValue(fixture.client)
  fixture.client.auth.onAuthStateChange.mockReset()
  fixture.client.auth.setSession.mockReset()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('backend resolution baseline', () => {
  it('selects the real Supabase adapter when a saved configuration is valid', async () => {
    fixture.storedConfig = {
      version: 1,
      url: 'https://saved.example.test',
      anonKey: 'saved-key',
    }
    vi.stubEnv('VITE_SUPABASE_URL', 'https://environment.example.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'environment-key')

    const { resolveBackend } = await loadResolver()

    expect(resolveBackend()).toMatchObject({
      status: 'ready',
      backend: { kind: 'supabase' },
    })
    expect(fixture.createClient).toHaveBeenCalledWith(
      'https://saved.example.test',
      'saved-key',
      expect.any(Object),
    )
  })

  it('selects Supabase for a valid environment-only configuration without a saved profile', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://environment.example.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'environment-key')

    const { resolveBackend } = await loadResolver()

    const resolution = resolveBackend()
    expect(resolution).toMatchObject({
      status: 'ready',
      backend: { kind: 'supabase' },
    })
    expect(fixture.createClient).toHaveBeenCalledWith(
      'https://environment.example.test',
      'environment-key',
      expect.any(Object),
    )
  })

  it('returns only unconfigured for partial environment variables and never substitutes a provider', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://environment.example.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const { resolveBackend } = await loadResolver()

    expect(resolveBackend()).toEqual({ status: 'unconfigured' })
  })
})
