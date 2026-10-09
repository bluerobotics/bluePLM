import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  client: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
    },
  },
}))

vi.mock('./client', () => ({
  authLog: vi.fn(),
  getCurrentConfigValues: vi.fn(),
  getSupabaseClient: () => fixture.client,
  setSessionResolver: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

const { getCurrentSession, getCurrentUser, signInWithEmail } = await import('./auth')

beforeEach(() => {
  fixture.client.auth.getSession.mockReset()
  fixture.client.auth.getUser.mockReset()
  fixture.client.auth.signInWithPassword.mockReset()
})

describe('Supabase auth identity baseline', () => {
  it('passes sign-in credentials through and preserves a successful result object', async () => {
    const result = {
      data: { user: { id: 'user-1' }, session: { access_token: 'token' } },
      error: null,
    }
    fixture.client.auth.signInWithPassword.mockResolvedValue(result)

    await expect(signInWithEmail('person@example.test', 'correct-horse')).resolves.toEqual(result)
    expect(fixture.client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.test',
      password: 'correct-horse',
    })
  })

  it('preserves an empty successful auth result instead of manufacturing an error', async () => {
    const result = { data: { user: null, session: null }, error: null }
    fixture.client.auth.signInWithPassword.mockResolvedValue(result)

    await expect(signInWithEmail('person@example.test', 'password')).resolves.toEqual(result)
  })

  it('returns the SDK error object rather than throwing it', async () => {
    const sdkError = new Error('invalid login credentials')
    fixture.client.auth.signInWithPassword.mockResolvedValue({ data: null, error: sdkError })

    await expect(signInWithEmail('person@example.test', 'wrong-password')).resolves.toEqual({
      data: null,
      error: sdkError,
    })
  })

  it('converts a thrown SDK failure into the same returned error channel', async () => {
    const thrown = new Error('network unavailable')
    fixture.client.auth.signInWithPassword.mockRejectedValue(thrown)

    await expect(signInWithEmail('person@example.test', 'password')).resolves.toEqual({
      data: null,
      error: thrown,
    })
  })

  it('forwards the server session user and its created_at value unchanged', async () => {
    const session = {
      access_token: 'token',
      user: { id: 'user-1', created_at: '2024-06-01T12:00:00.000Z' },
    }
    fixture.client.auth.getSession.mockResolvedValue({ data: { session }, error: null })

    await expect(getCurrentSession()).resolves.toEqual({ session, error: null })
  })

  it('forwards the server user identity without changing its role or timestamps', async () => {
    const user = {
      id: 'user-1',
      role: 'authenticated',
      created_at: '2024-06-01T12:00:00.000Z',
    }
    fixture.client.auth.getUser.mockResolvedValue({ data: { user }, error: null })

    await expect(getCurrentUser()).resolves.toEqual({ user, error: null })
  })
})
