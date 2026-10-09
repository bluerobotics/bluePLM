import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const store = {
    addToast: vi.fn(),
    isOfflineMode: false,
    loadModuleAccess: vi.fn(),
    loadUserPermissions: vi.fn(),
    loadUserWorkflowRoles: vi.fn(),
    resetSessionState: vi.fn(),
    setAuthInitialized: vi.fn(),
    setIsConnecting: vi.fn(),
    setOfflineMode: vi.fn(),
    setOrganization: vi.fn(),
    setStatusMessage: vi.fn(),
    setUser: vi.fn(),
    setVaultConnected: vi.fn(),
  }
  const usePDMStore = Object.assign(
    vi.fn((selector: (state: typeof store) => unknown) => selector(store)),
    {
      getState: () => store,
    },
  )

  return {
    cleanups: [] as Array<() => void>,
    createClient: vi.fn(),
    fallbackSignOut: vi.fn(),
    loadConfig: null as { version: number; url: string; anonKey: string } | null,
    clearConfig: vi.fn(),
    sdkAuthSubscription: { unsubscribe: vi.fn() },
    sdkOnAuthStateChange: vi.fn(),
    sdkGetUser: vi.fn(),
    sdkSignOut: vi.fn(),
    stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
    store,
    syncUserSessionsOrgId: vi.fn(),
    updateLastOnline: vi.fn(),
    usePDMStore,
  }
})

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect()
    if (cleanup) fixture.cleanups.push(cleanup)
  },
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(initial: T | (() => T)) => {
    const setter = vi.fn()
    fixture.stateSetters.push(setter)
    return [typeof initial === 'function' ? (initial as () => T)() : initial, setter]
  },
}))

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T>(selector: T) => selector,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: fixture.createClient,
}))

vi.mock('@/lib/supabaseConfig', () => ({
  clearConfig: fixture.clearConfig,
  loadConfig: () => fixture.loadConfig,
}))

vi.mock('@/stores/pdmStore', () => ({ usePDMStore: fixture.usePDMStore }))

vi.mock('@/lib/supabase', () => ({
  setCurrentAccessToken: vi.fn(),
  signOut: fixture.fallbackSignOut,
  syncUserSessionsOrgId: fixture.syncUserSessionsOrgId,
  updateLastOnline: fixture.updateLastOnline,
}))

vi.mock('@/lib/analytics', () => ({ clearAnalyticsUser: vi.fn(), setAnalyticsUser: vi.fn() }))
vi.mock('@/hooks/loadFilesCoordination', () => ({ setLoadFilesSessionContext: vi.fn() }))
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/lib/performanceMetrics', () => ({ recordMetric: vi.fn() }))
vi.mock('@/lib/userActionLogger', () => ({ logUserAction: vi.fn() }))

async function loadAuthHarness() {
  vi.resetModules()
  const { useAuth } = await import('@/hooks/useAuth')
  return function AuthHarness() {
    return useAuth()
  }
}

async function mountAuthHarness() {
  const AuthHarness = await loadAuthHarness()
  return AuthHarness()
}

beforeEach(() => {
  fixture.cleanups = []
  fixture.loadConfig = null
  fixture.createClient.mockReset()
  fixture.fallbackSignOut.mockReset()
  fixture.fallbackSignOut.mockResolvedValue({ error: null })
  fixture.clearConfig.mockReset()
  fixture.sdkAuthSubscription.unsubscribe.mockReset()
  fixture.sdkOnAuthStateChange.mockReset()
  fixture.sdkGetUser.mockReset()
  fixture.sdkGetUser.mockResolvedValue({ data: { user: null }, error: null })
  fixture.sdkSignOut.mockReset()
  fixture.sdkSignOut.mockResolvedValue({ error: null })
  fixture.sdkOnAuthStateChange.mockReturnValue({
    data: { subscription: fixture.sdkAuthSubscription },
  })
  fixture.createClient.mockReturnValue({
    auth: {
      onAuthStateChange: fixture.sdkOnAuthStateChange,
      getUser: fixture.sdkGetUser,
      signOut: fixture.sdkSignOut,
    },
  })
  fixture.stateSetters = []
  fixture.syncUserSessionsOrgId.mockReset()
  fixture.updateLastOnline.mockReset()
  fixture.updateLastOnline.mockResolvedValue(undefined)
  fixture.usePDMStore.mockClear()
  Object.values(fixture.store).forEach((value) => {
    if (typeof value === 'function' && 'mockReset' in value) value.mockReset()
  })
  vi.unstubAllEnvs()
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('window', { electronAPI: undefined })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('public authentication backend path', () => {
  it('uses the real resolver and real Supabase adapter to subscribe, then cleans up the SDK subscription', async () => {
    fixture.loadConfig = {
      version: 1,
      url: 'https://saved.example.test',
      anonKey: 'saved-key',
    }

    await mountAuthHarness()

    expect(fixture.createClient).toHaveBeenCalledWith(
      'https://saved.example.test',
      'saved-key',
      expect.any(Object),
    )
    expect(fixture.sdkOnAuthStateChange).toHaveBeenCalledOnce()
    expect(fixture.cleanups).toHaveLength(1)

    fixture.cleanups[0]()
    expect(fixture.sdkAuthSubscription.unsubscribe).toHaveBeenCalledOnce()
  })

  it('routes a ready auth event through the real adapter identity lookup to the fetch boundary', async () => {
    fixture.loadConfig = {
      version: 1,
      url: 'https://saved.example.test',
      anonKey: 'saved-key',
    }
    const profile = {
      id: 'user-1',
      email: 'person@example.test',
      role: 'viewer',
      org_id: 'org-1',
      full_name: 'Person Example',
      avatar_url: null,
      custom_avatar_url: null,
    }
    const organization = { id: 'org-1', name: 'Example Org' }
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce({
        status: 200,
        json: vi.fn().mockResolvedValue([profile]),
      } as unknown as Response)
      .mockResolvedValueOnce({
        status: 200,
        json: vi.fn().mockResolvedValue([organization]),
      } as unknown as Response)

    await mountAuthHarness()
    const listener = fixture.sdkOnAuthStateChange.mock.calls[0]?.[0] as (
      event: string,
      session: {
        access_token: string
        user: {
          id: string
          email: string
          created_at: string
          user_metadata: Record<string, unknown>
        }
      },
    ) => Promise<void>

    await listener('INITIAL_SESSION', {
      access_token: 'session-token',
      user: {
        id: 'user-1',
        email: 'person@example.test',
        created_at: '2024-01-01T00:00:00.000Z',
        user_metadata: {},
      },
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://saved.example.test/rest/v1/users?select=id,email,role,org_id,full_name,avatar_url,custom_avatar_url&id=eq.user-1',
      expect.any(Object),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://saved.example.test/rest/v1/organizations?select=*&id=eq.org-1',
      expect.any(Object),
    )
    expect(fixture.store.setUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        role: 'viewer',
        created_at: '2024-01-01T00:00:00.000Z',
      }),
    )
    expect(fixture.store.setOrganization).toHaveBeenCalledWith(organization)
  })

  it.each([false, true])(
    'uses the real adapter for logout with configured=%s',
    async (configured) => {
      if (configured) {
        fixture.loadConfig = {
          version: 1,
          url: 'https://saved.example.test',
          anonKey: 'saved-key',
        }
      }
      const auth = await mountAuthHarness()

      await auth.handleChangeOrg()

      expect(fixture.sdkOnAuthStateChange).toHaveBeenCalledTimes(configured ? 1 : 0)
      expect(fixture.sdkGetUser).toHaveBeenCalledOnce()
      expect(fixture.sdkSignOut).toHaveBeenCalledOnce()
      expect(fixture.fallbackSignOut).not.toHaveBeenCalled()
      expect(fixture.clearConfig).toHaveBeenCalledOnce()
      expect(fixture.stateSetters[0]).toHaveBeenCalledWith(false)
    },
  )
})
