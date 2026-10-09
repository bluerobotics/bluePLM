import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  authStateSubscription: { unsubscribe: vi.fn() },
  authStateChange: vi.fn(),
  getSupabaseClient: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  getOrgAuthProviders: vi.fn(),
  getUserProfile: vi.fn(),
  linkUserToOrganization: vi.fn(),
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithPhone: vi.fn(),
  signOut: vi.fn(),
  signUpWithEmail: vi.fn(),
  verifyPhoneOTP: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: fixture.getSupabaseClient,
  isSupabaseConfigured: fixture.isSupabaseConfigured,
}))

vi.mock('@/lib/supabase/auth', () => ({
  signInWithEmail: fixture.signInWithEmail,
  signInWithGoogle: fixture.signInWithGoogle,
  signInWithPhone: fixture.signInWithPhone,
  signOut: fixture.signOut,
  signUpWithEmail: fixture.signUpWithEmail,
  verifyPhoneOTP: fixture.verifyPhoneOTP,
}))

vi.mock('@/lib/supabase/organizations', () => ({
  getOrgAuthProviders: fixture.getOrgAuthProviders,
  getUserProfile: fixture.getUserProfile,
  linkUserToOrganization: fixture.linkUserToOrganization,
}))

const { supabaseBackendAdapter } = await import('./supabaseAdapter')

beforeEach(() => {
  fixture.authStateSubscription.unsubscribe.mockReset()
  fixture.authStateChange.mockReset()
  fixture.getSupabaseClient.mockReset()
  fixture.isSupabaseConfigured.mockReset()
  fixture.getOrgAuthProviders.mockReset()
  fixture.getUserProfile.mockReset()
  fixture.linkUserToOrganization.mockReset()
  fixture.signInWithEmail.mockReset()
  fixture.signInWithGoogle.mockReset()
  fixture.signInWithPhone.mockReset()
  fixture.signOut.mockReset()
  fixture.signUpWithEmail.mockReset()
  fixture.verifyPhoneOTP.mockReset()
  fixture.getSupabaseClient.mockReturnValue({
    auth: { onAuthStateChange: fixture.authStateChange },
  })
  fixture.authStateChange.mockReturnValue({
    data: { subscription: fixture.authStateSubscription },
  })
})

describe('Supabase backend adapter delegation baseline', () => {
  it('retains its provider identity and configuration predicate', () => {
    fixture.isSupabaseConfigured.mockReturnValue(true)

    expect(supabaseBackendAdapter.kind).toBe('supabase')
    expect(supabaseBackendAdapter.isConfigured()).toBe(true)
    expect(fixture.isSupabaseConfigured).toHaveBeenCalledOnce()
  })

  it('forwards email sign-in arguments and the original successful result', async () => {
    const result = {
      data: {
        user: { id: 'user-1', email: 'person@example.test', created_at: '2024-01-01T00:00:00Z' },
        session: null,
      },
      error: null,
    }
    fixture.signInWithEmail.mockResolvedValue(result)

    await expect(
      supabaseBackendAdapter.auth.signInWithEmail('person@example.test', 'password'),
    ).resolves.toBe(result)
    expect(fixture.signInWithEmail).toHaveBeenCalledWith('person@example.test', 'password')
  })

  it('forwards the omitted optional sign-up name and its original empty success result', async () => {
    const result = { data: { user: null, session: null }, error: null }
    fixture.signUpWithEmail.mockResolvedValue(result)

    await expect(
      supabaseBackendAdapter.auth.signUpWithEmail('person@example.test', 'password'),
    ).resolves.toBe(result)
    expect(fixture.signUpWithEmail).toHaveBeenCalledWith('person@example.test', 'password')
  })

  it('forwards phone OTP arguments and preserves an original provider error object', async () => {
    const result = { data: null, error: new Error('OTP rejected') }
    fixture.verifyPhoneOTP.mockResolvedValue(result)

    await expect(supabaseBackendAdapter.auth.verifyPhoneOTP('+491234', '123456')).resolves.toBe(
      result,
    )
    expect(fixture.verifyPhoneOTP).toHaveBeenCalledWith('+491234', '123456')
  })

  it('delegates OAuth, phone sign-in, and sign-out without changing their result objects', async () => {
    const oauth = { data: { provider: 'google', url: null }, error: null }
    const phone = { data: { user: null, session: null, messageId: 'message-1' }, error: null }
    const signOut = { error: new Error('sign-out rejected') }
    fixture.signInWithGoogle.mockResolvedValue(oauth)
    fixture.signInWithPhone.mockResolvedValue(phone)
    fixture.signOut.mockResolvedValue(signOut)

    await expect(supabaseBackendAdapter.auth.signInWithGoogle()).resolves.toBe(oauth)
    await expect(supabaseBackendAdapter.auth.signInWithPhone('+491234')).resolves.toBe(phone)
    await expect(supabaseBackendAdapter.auth.signOut()).resolves.toBe(signOut)
    expect(fixture.signInWithGoogle).toHaveBeenCalledWith()
    expect(fixture.signInWithPhone).toHaveBeenCalledWith('+491234')
    expect(fixture.signOut).toHaveBeenCalledWith()
  })

  it('passes the exact auth listener to the SDK and returns its subscription for cleanup', () => {
    const listener = vi.fn()

    const subscription = supabaseBackendAdapter.auth.subscribeToAuthStateChange(listener)

    expect(fixture.authStateChange).toHaveBeenCalledWith(listener)
    expect(subscription).toBe(fixture.authStateSubscription)
    subscription.unsubscribe()
    expect(fixture.authStateSubscription.unsubscribe).toHaveBeenCalledOnce()
  })

  it('forwards profile defaults and optional identity arguments with their original results', async () => {
    const profileResult = { profile: null, error: new Error('profile unavailable') }
    const linkedOrgResult = { org: null, error: 'not found' }
    const providers = null
    fixture.getUserProfile.mockResolvedValue(profileResult)
    fixture.linkUserToOrganization.mockResolvedValue(linkedOrgResult)
    fixture.getOrgAuthProviders.mockResolvedValue(providers)

    await expect(supabaseBackendAdapter.identity.getUserProfile('user-1')).resolves.toBe(
      profileResult,
    )
    await expect(
      supabaseBackendAdapter.identity.linkUserToOrganization('user-1', 'person@example.test'),
    ).resolves.toBe(linkedOrgResult)
    await expect(supabaseBackendAdapter.identity.getOrgAuthProviders()).resolves.toBe(providers)
    expect(fixture.getUserProfile).toHaveBeenCalledWith('user-1')
    expect(fixture.linkUserToOrganization).toHaveBeenCalledWith('user-1', 'person@example.test')
    expect(fixture.getOrgAuthProviders).toHaveBeenCalledWith()
  })
})
