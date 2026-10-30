import { getBackend } from '@/lib/backend'
import { log } from '@/lib/logger'
import type { AuthProviders } from '@/types/backend'

export type SignInMethod = 'google' | 'email' | 'phone'

export type SignInMethods = Record<SignInMethod, boolean>

/**
 * The sign-in methods the single sign-in page offers. There is one page for everyone: the org
 * decides after sign-in whether an account is a member or a supplier contact, so a method shows
 * when the org allows it for either audience. Missing providers (failed load) or a missing flag
 * count as allowed, as before. The web offers Google only: no web member has a password.
 */
export function signInMethods(providers: AuthProviders | null, desktop: boolean): SignInMethods {
  const allowed = (method: SignInMethod) =>
    !providers || providers.users?.[method] !== false || providers.suppliers?.[method] !== false
  return {
    google: allowed('google'),
    email: desktop && allowed('email'),
    phone: desktop && allowed('phone'),
  }
}

interface WelcomeCredentialAuthState {
  authEmail: string
  authPassword: string
  authPasswordConfirm: string
  authName: string
  authPhone: string
  phoneOtp: string
  isNewAccount: boolean
  t: (key: string) => string
  setAuthError: (error: string | null) => void
  setIsSigningIn: (isSigningIn: boolean) => void
  setIsNewAccount: (isNewAccount: boolean) => void
  setIsOtpSent: (isOtpSent: boolean) => void
}

/** The existing welcome credential flow, with UI state still owned by WelcomeScreen. */
export function createWelcomeCredentialAuthHandlers({
  authEmail,
  authPassword,
  authPasswordConfirm,
  authName,
  authPhone,
  phoneOtp,
  isNewAccount,
  t,
  setAuthError,
  setIsSigningIn,
  setIsNewAccount,
  setIsOtpSent,
}: WelcomeCredentialAuthState) {
  // Email/password sign-in
  const handleEmailAuth = async () => {
    if (!authEmail || !authPassword) {
      setAuthError(t('welcome.credentialsRequired'))
      return
    }

    // Validate password confirmation for new accounts
    if (isNewAccount && authPassword !== authPasswordConfirm) {
      setAuthError(t('welcome.passwordMismatch'))
      return
    }

    setIsSigningIn(true)
    setAuthError(null)

    try {
      if (isNewAccount) {
        // Sign up
        log.info('[WelcomeScreen]', 'Starting email sign-up')
        const { data, error } = await getBackend().auth.signUpWithEmail(
          authEmail,
          authPassword,
          authName || undefined,
        )

        if (error) {
          setAuthError(error.message)
          return
        }

        if (!data?.session) {
          // Email confirmation needed
          setAuthError(t('welcome.confirmEmail'))
          setIsNewAccount(false) // Switch back to login view
          return
        }

        log.info('[WelcomeScreen]', 'Email sign-up successful')
      } else {
        // Sign in
        log.info('[WelcomeScreen]', 'Starting email sign-in')
        const { error } = await getBackend().auth.signInWithEmail(authEmail, authPassword)

        if (error) {
          setAuthError(error.message)
          return
        }

        log.info('[WelcomeScreen]', 'Email sign-in successful')
      }
    } catch (error) {
      setAuthError(t('welcome.authenticationFailed'))
    } finally {
      setIsSigningIn(false)
    }
  }

  // Phone OTP sign-in
  const handleSendPhoneOTP = async () => {
    if (!authPhone) {
      setAuthError(t('welcome.phoneRequired'))
      return
    }

    setIsSigningIn(true)
    setAuthError(null)

    try {
      log.info('[WelcomeScreen]', 'Sending phone OTP')
      const { error } = await getBackend().auth.signInWithPhone(authPhone)

      if (error) {
        setAuthError(error.message)
        return
      }

      setIsOtpSent(true)
      log.info('[WelcomeScreen]', 'Phone OTP sent successfully')
    } catch (error) {
      setAuthError(t('welcome.sendCodeFailed'))
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleVerifyPhoneOTP = async () => {
    if (!phoneOtp) {
      setAuthError(t('welcome.codeRequired'))
      return
    }

    setIsSigningIn(true)
    setAuthError(null)

    try {
      log.info('[WelcomeScreen]', 'Verifying phone OTP')
      const { error } = await getBackend().auth.verifyPhoneOTP(authPhone, phoneOtp)

      if (error) {
        setAuthError(error.message)
        return
      }

      log.info('[WelcomeScreen]', 'Phone verification successful')
    } catch (error) {
      setAuthError(t('welcome.verificationFailed'))
    } finally {
      setIsSigningIn(false)
    }
  }

  return { handleEmailAuth, handleSendPhoneOTP, handleVerifyPhoneOTP }
}
