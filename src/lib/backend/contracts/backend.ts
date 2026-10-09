import type { AuthPort } from './auth'
import type { IdentityPort } from './identity'

/** The provider currently available to the production application. */
export type BackendKind = 'supabase'

/**
 * A small, domain-oriented provider surface.  Storage, files, realtime, and
 * raw database access deliberately remain outside this first seam.
 */
export interface BackendAdapter {
  readonly kind: BackendKind
  isConfigured(): boolean
  readonly auth: AuthPort
  readonly identity: IdentityPort
}

export type BackendResolution =
  | { status: 'ready'; backend: BackendAdapter }
  | { status: 'unconfigured' }
