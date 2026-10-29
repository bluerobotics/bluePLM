/** Public identity verified by Main against the selected MDB server. */
export interface MdbPrincipal {
  readonly userId: string
  readonly organizationId: string
  readonly email: string
  readonly displayName: string
  readonly role: 'owner' | 'admin' | 'member' | 'viewer' | 'guest'
  readonly createdAt: string
}

export interface MdbOrganization {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly createdAt: string
}

/** Bearer and challenge tokens remain in Main, including while TOTP is pending. */
export type MdbAuthState =
  | { readonly status: 'signed-out' }
  | { readonly status: 'totp-required' }
  | {
      readonly status: 'verified'
      readonly principal: MdbPrincipal
      readonly organization: MdbOrganization
      readonly expiresAt: string
    }

export type MdbAuthResult =
  | { readonly ok: true; readonly state: MdbAuthState }
  | { readonly ok: false; readonly code: string; readonly persistedSessionRemoved?: false }

/** Explicit MDB capability; it does not implement Supabase's token-bearing AuthPort. */
export interface MdbAuthCapability {
  validateServer(serverUrl: string): Promise<MdbAuthResult>
  signIn(input: {
    readonly serverUrl: string
    readonly email: string
    readonly password: string
  }): Promise<MdbAuthResult>
  verifyTotp(code: string): Promise<MdbAuthResult>
  restore(): Promise<MdbAuthResult>
  /** Local only. A persistence-clear failure is an error; server sessions are not revoked. */
  signOut(): Promise<MdbAuthResult>
  getState(): Promise<MdbAuthResult>
  subscribe(listener: (state: MdbAuthState) => void): () => void
}
