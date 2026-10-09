import { getBackend } from '@/lib/backend'
import { log } from '@/lib/logger'
import type { AccountType } from '@/types/database'

interface WelcomeCredentialAuthState {
  accountType: AccountType | null
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
  accountType,
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
  // Email/password sign-in (for both suppliers and team members)
  const handleEmailAuth = async () => {
    if (!authEmail || !authPassword) {
      setAuthError('Please enter email and password')
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
        log.info('[WelcomeScreen]', 'Starting email sign-up', { accountType })
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
          setAuthError('Please check your email to confirm your account')
          setIsNewAccount(false) // Switch back to login view
          return
        }

        log.info('[WelcomeScreen]', 'Email sign-up successful')
      } else {
        // Sign in
        log.info('[WelcomeScreen]', 'Starting email sign-in', { accountType })
        const { error } = await getBackend().auth.signInWithEmail(authEmail, authPassword)

        if (error) {
          setAuthError(error.message)
          return
        }

        log.info('[WelcomeScreen]', 'Email sign-in successful')
      }
    } catch (error) {
      setAuthError('Authentication failed. Please try again.')
    } finally {
      setIsSigningIn(false)
    }
  }

  // Phone OTP sign-in (for both suppliers and team members)
  const handleSendPhoneOTP = async () => {
    if (!authPhone) {
      setAuthError('Please enter your phone number')
      return
    }

    setIsSigningIn(true)
    setAuthError(null)

    try {
      log.info('[WelcomeScreen]', 'Sending phone OTP', { accountType })
      const { error } = await getBackend().auth.signInWithPhone(authPhone)

      if (error) {
        setAuthError(error.message)
        return
      }

      setIsOtpSent(true)
      log.info('[WelcomeScreen]', 'Phone OTP sent successfully')
    } catch (error) {
      setAuthError('Failed to send verification code. Please try again.')
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleVerifyPhoneOTP = async () => {
    if (!phoneOtp) {
      setAuthError('Please enter the verification code')
      return
    }

    setIsSigningIn(true)
    setAuthError(null)

    try {
      log.info('[WelcomeScreen]', 'Verifying phone OTP', { accountType })
      const { error } = await getBackend().auth.verifyPhoneOTP(authPhone, phoneOtp)

      if (error) {
        setAuthError(error.message)
        return
      }

      log.info('[WelcomeScreen]', 'Phone verification successful')
    } catch (error) {
      setAuthError('Verification failed. Please try again.')
    } finally {
      setIsSigningIn(false)
    }
  }

  return { handleEmailAuth, handleSendPhoneOTP, handleVerifyPhoneOTP }
}
