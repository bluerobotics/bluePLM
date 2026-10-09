import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWelcomeCredentialAuthHandlers } from './welcomeCredentialAuth'

const fixture = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: fixture.createClient }))
vi.mock('@/lib/supabaseConfig', () => ({ loadConfig: () => null }))
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

function createState() {
  return {
    accountType: 'user' as const,
    authEmail: 'person@example.test',
    authPassword: 'password',
    authPasswordConfirm: 'password',
    authName: '',
    authPhone: '+491234',
    phoneOtp: '123456',
    isNewAccount: false,
    t: vi.fn((key: string) => key),
    setAuthError: vi.fn(),
    setIsSigningIn: vi.fn(),
    setIsNewAccount: vi.fn(),
    setIsOtpSent: vi.fn(),
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  fixture.createClient.mockReturnValue({
    auth: {
      signInWithPassword: fixture.signInWithPassword,
      signUp: fixture.signUp,
      signInWithOtp: fixture.signInWithOtp,
      verifyOtp: fixture.verifyOtp,
    },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// Exercise the real selection point, adapter and Supabase helpers, rather than
// replacing the seam with a mock that could conceal a new configuration guard.
async function loadHandlers(state: ReturnType<typeof createState>) {
  const { createWelcomeCredentialAuthHandlers } = await import('./welcomeCredentialAuth')
  return createWelcomeCredentialAuthHandlers(state)
}

describe('welcome credential authentication preserves the upstream flow', () => {
  it.each([
    { operation: 'handleEmailAuth' as const, sdk: 'signInWithPassword' as const, signUp: false },
    { operation: 'handleEmailAuth' as const, sdk: 'signUp' as const, signUp: true },
    { operation: 'handleSendPhoneOTP' as const, sdk: 'signInWithOtp' as const, signUp: false },
    { operation: 'handleVerifyPhoneOTP' as const, sdk: 'verifyOtp' as const, signUp: false },
  ])('keeps the provider error from $sdk when configuration is missing', async (testCase) => {
    const state = createState()
    state.isNewAccount = testCase.signUp
    fixture[testCase.sdk].mockResolvedValue({ data: null, error: new Error('Provider error') })
    const handlers = await loadHandlers(state)

    await handlers[testCase.operation]()

    expect(fixture[testCase.sdk]).toHaveBeenCalledOnce()
    expect(state.setAuthError).toHaveBeenLastCalledWith('Provider error')
    expect(state.setIsSigningIn.mock.calls).toEqual([[true], [false]])
    expect(fixture.createClient).toHaveBeenCalledWith(
      'https://placeholder.supabase.co',
      'placeholder-key',
      expect.any(Object),
    )
  })

  it.each([
    {
      operation: 'handleEmailAuth' as const,
      authOperation: 'signInWithEmail' as const,
      message: 'Authentication failed. Please try again.',
    },
    {
      operation: 'handleSendPhoneOTP' as const,
      authOperation: 'signInWithPhone' as const,
      message: 'Failed to send verification code. Please try again.',
    },
    {
      operation: 'handleVerifyPhoneOTP' as const,
      authOperation: 'verifyPhoneOTP' as const,
      message: 'Verification failed. Please try again.',
    },
  ])(
    'keeps the upstream catch message for $operation when the auth operation throws',
    async (testCase) => {
      const state = createState()
      const handlers = await loadHandlers(state)
      const { getBackend } = await import('@/lib/backend')
      vi.spyOn(getBackend().auth, testCase.authOperation).mockRejectedValue(
        new Error('Auth failed'),
      )

      await handlers[testCase.operation]()

      expect(state.setAuthError).toHaveBeenLastCalledWith(testCase.message)
      expect(state.setIsSigningIn.mock.calls).toEqual([[true], [false]])
    },
  )

  it('retains the email-confirmation prompt and returns to the login form', async () => {
    const state = createState()
    state.isNewAccount = true
    fixture.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null })
    const handlers = await loadHandlers(state)

    await handlers.handleEmailAuth()

    expect(fixture.signUp).toHaveBeenCalledWith({
      email: state.authEmail,
      password: state.authPassword,
      options: { data: { full_name: undefined } },
    })
    expect(state.setAuthError).toHaveBeenLastCalledWith(
      'Please check your email to confirm your account',
    )
    expect(state.setIsNewAccount).toHaveBeenCalledWith(false)
    expect(state.setIsSigningIn).toHaveBeenLastCalledWith(false)
  })

  it('retains the SMS arguments and advances to verification only after success', async () => {
    const state = createState()
    fixture.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null })
    fixture.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: null })
    const handlers = await loadHandlers(state)

    await handlers.handleSendPhoneOTP()
    await handlers.handleVerifyPhoneOTP()

    expect(fixture.signInWithOtp).toHaveBeenCalledWith({
      phone: state.authPhone,
      options: { channel: 'sms' },
    })
    expect(state.setIsOtpSent).toHaveBeenCalledWith(true)
    expect(fixture.verifyOtp).toHaveBeenCalledWith({
      phone: state.authPhone,
      token: state.phoneOtp,
      type: 'sms',
    })
    expect(state.setAuthError.mock.calls).toEqual([[null], [null]])
  })

  it('retains the translated confirmation validation before touching the backend', async () => {
    const state = createState()
    state.isNewAccount = true
    state.authPasswordConfirm = 'different'
    const handlers = createWelcomeCredentialAuthHandlers(state)

    await handlers.handleEmailAuth()

    expect(state.setAuthError).toHaveBeenCalledWith('welcome.passwordMismatch')
    expect(fixture.createClient).not.toHaveBeenCalled()
    expect(state.setIsSigningIn).not.toHaveBeenCalled()
  })
})
