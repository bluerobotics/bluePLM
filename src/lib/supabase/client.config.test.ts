import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  storedConfig: null as { version: number; url: string; anonKey: string } | null,
  client: {
    auth: {
      setSession: vi.fn(),
    },
  },
  createClient: vi.fn(),
  listenerCleanups: [] as Array<ReturnType<typeof vi.fn>>,
  onSetSession: vi.fn(),
  generateCliToken: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: fixture.createClient,
}))

vi.mock('../supabaseConfig', () => ({
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

async function loadClient() {
  vi.resetModules()
  return import('./client')
}

const clientOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
}

beforeEach(() => {
  fixture.storedConfig = null
  fixture.client.auth.setSession.mockReset()
  fixture.client.auth.setSession.mockResolvedValue({ data: { user: null }, error: null })
  fixture.createClient.mockReset()
  fixture.createClient.mockReturnValue(fixture.client)
  fixture.listenerCleanups = []
  fixture.onSetSession.mockReset()
  fixture.onSetSession.mockImplementation(() => {
    const cleanup = vi.fn()
    fixture.listenerCleanups.push(cleanup)
    return cleanup
  })
  fixture.generateCliToken.mockReset()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Supabase client configuration baseline', () => {
  it('prefers a valid saved configuration over environment variables', async () => {
    fixture.storedConfig = {
      version: 1,
      url: 'https://saved.example.test',
      anonKey: 'saved-key',
    }
    vi.stubEnv('VITE_SUPABASE_URL', 'https://environment.example.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'environment-key')

    const client = await loadClient()

    expect(fixture.createClient).toHaveBeenCalledOnce()
    expect(fixture.createClient).toHaveBeenCalledWith(
      'https://saved.example.test',
      'saved-key',
      clientOptions,
    )
    expect(client.isSupabaseConfigured()).toBe(true)
    expect(client.getCurrentConfig()).toEqual(fixture.storedConfig)
  })

  it('treats valid environment-only configuration as configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://environment.example.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'environment-key')

    const client = await loadClient()

    expect(fixture.createClient).toHaveBeenCalledWith(
      'https://environment.example.test',
      'environment-key',
      clientOptions,
    )
    expect(client.isSupabaseConfigured()).toBe(true)
    expect(client.getCurrentConfig()).toEqual({
      version: 1,
      url: 'https://environment.example.test',
      anonKey: 'environment-key',
    })
  })

  it('keeps an incomplete environment unconfigured while using the placeholder client', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://environment.example.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const client = await loadClient()

    expect(fixture.createClient).toHaveBeenCalledWith(
      'https://placeholder.supabase.co',
      'placeholder-key',
      clientOptions,
    )
    expect(client.isSupabaseConfigured()).toBe(false)
    expect(client.getCurrentConfig()).toBeNull()
  })

  it('replaces the Electron session listener when reconfigured and accepts the new session', async () => {
    fixture.storedConfig = {
      version: 1,
      url: 'https://saved.example.test',
      anonKey: 'saved-key',
    }
    vi.stubGlobal('window', {
      electronAPI: {
        onSetSession: fixture.onSetSession,
        generateCliToken: fixture.generateCliToken,
      },
    })
    fixture.generateCliToken.mockResolvedValue({ success: true })
    fixture.client.auth.setSession.mockResolvedValue({
      data: { user: { email: 'person@example.test', id: 'user-1' } },
      error: null,
    })

    const client = await loadClient()
    client.reconfigureSupabase({
      version: 1,
      url: 'https://replacement.example.test',
      anonKey: 'replacement-key',
    })

    expect(fixture.listenerCleanups[0]).toHaveBeenCalledOnce()
    expect(fixture.onSetSession).toHaveBeenCalledTimes(2)

    const activeListener = fixture.onSetSession.mock.calls[1]?.[0] as (tokens: {
      access_token: string
      refresh_token: string
      expires_in: number
    }) => Promise<void>

    await activeListener({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    })

    expect(fixture.client.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    })
    await vi.waitFor(() => {
      expect(fixture.generateCliToken).toHaveBeenCalledWith('person@example.test')
    })
  })
})
