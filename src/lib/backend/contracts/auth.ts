import type {
  AuthCredentialsData,
  AuthOperationResult,
  AuthStateListener,
  AuthStateSubscription,
  OAuthSignInData,
  PhoneOtpData,
  SignOutResult,
} from '@/types/backend'

/**
 * Authentication operations exercised by the existing sign-in and startup
 * paths.  Their structural results preserve established success and error
 * semantics without exporting SDK types through the seam.
 */
export interface AuthPort {
  subscribeToAuthStateChange(listener: AuthStateListener): AuthStateSubscription
  signInWithGoogle(): Promise<AuthOperationResult<OAuthSignInData>>
  signInWithEmail(
    email: string,
    password: string,
  ): Promise<AuthOperationResult<AuthCredentialsData>>
  signUpWithEmail(
    email: string,
    password: string,
    fullName?: string,
  ): Promise<AuthOperationResult<AuthCredentialsData>>
  signInWithPhone(phone: string): Promise<AuthOperationResult<PhoneOtpData>>
  verifyPhoneOTP(phone: string, token: string): Promise<AuthOperationResult<AuthCredentialsData>>
  signOut(): Promise<SignOutResult>
}
