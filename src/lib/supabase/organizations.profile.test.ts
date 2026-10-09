import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  getCurrentAccessToken: vi.fn(),
  getCurrentConfigValues: vi.fn(),
  authLog: vi.fn(),
}))

vi.mock('./client', () => ({
  authLog: fixture.authLog,
  getCurrentConfigValues: fixture.getCurrentConfigValues,
  getSupabaseClient: vi.fn(),
}))

vi.mock('./auth', () => ({
  getCurrentAccessToken: fixture.getCurrentAccessToken,
}))

vi.mock('@/lib/performanceMetrics', () => ({ recordMetric: vi.fn() }))

const { getUserProfile } = await import('./organizations')

beforeEach(() => {
  fixture.getCurrentAccessToken.mockReset()
  fixture.getCurrentAccessToken.mockReturnValue('session-token')
  fixture.getCurrentConfigValues.mockReset()
  fixture.getCurrentConfigValues.mockReturnValue({
    url: 'https://supabase.example.test',
    anonKey: 'anon-key',
  })
  fixture.authLog.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Supabase user-profile baseline', () => {
  it('uses the exact profile projection and forwards the server role without client elevation', async () => {
    const profile = {
      id: 'user-1',
      email: 'person@example.test',
      role: 'viewer',
      org_id: 'org-1',
      full_name: 'Person Example',
      avatar_url: null,
      custom_avatar_url: null,
    }
    const response = {
      status: 200,
      json: vi.fn().mockResolvedValue([profile]),
    }
    const fetchMock = vi.mocked(fetch).mockResolvedValue(response as unknown as Response)

    await expect(getUserProfile('user-1', { maxRetries: 0 })).resolves.toEqual({
      profile,
      error: null,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://supabase.example.test/rest/v1/users?select=id,email,role,org_id,full_name,avatar_url,custom_avatar_url&id=eq.user-1',
      {
        headers: {
          apikey: 'anon-key',
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
      },
    )
  })

  it('retries an empty profile response three times before returning its established error', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    } as unknown as Response)

    const resultPromise = getUserProfile('user-1')
    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toMatchObject({
      profile: null,
      error: new Error('User not found - profile may still be creating'),
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
