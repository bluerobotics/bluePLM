/** Auth lifecycle events consumed by the current renderer. */
export type AuthStateEvent =
  | 'INITIAL_SESSION'
  | 'PASSWORD_RECOVERY'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'MFA_CHALLENGE_VERIFIED'

/** Identity fields read by the renderer; adapters forward additional fields unchanged. */
export interface AuthenticatedUser {
  id: string
  email?: string
  created_at: string
  user_metadata?: {
    full_name?: string
    name?: string
    avatar_url?: string
    picture?: string
  }
}

/** Session fields used by the existing auth and Electron handoff paths. */
export interface AuthSession {
  access_token: string
  refresh_token: string
  expires_in: number
  user: AuthenticatedUser
}

/** Adapters pass the original session object through to the renderer listener. */
export type AuthStateListener = (
  event: AuthStateEvent,
  session: AuthSession | null,
) => void | Promise<void>

export interface AuthStateSubscription {
  unsubscribe(): void
}

export interface OAuthSignInData {
  provider: string
  url: string | null
}

export interface AuthCredentialsData {
  user: AuthenticatedUser | null
  session: AuthSession | null
}

export interface PhoneOtpData {
  user: null
  session: null
  messageId?: string | null
}

export interface AuthOperationResult<TData> {
  data: TData | null
  error: Error | null
}

export interface SignOutResult {
  error: Error | null
}

/**
 * Provider-neutral profile read model consumed during renderer hydration.
 * Unlike database.UserProfile, this is not a generated Supabase table row:
 * deriving it from that schema would couple every adapter to Supabase columns.
 */
export interface IdentityProfile {
  id: string
  email: string
  role: string
  org_id: string | null
  full_name: string | null
  avatar_url: string | null
  custom_avatar_url: string | null
}

export interface AuthProviders {
  users: { google: boolean; email: boolean; phone: boolean }
  suppliers: { google: boolean; email: boolean; phone: boolean }
}
