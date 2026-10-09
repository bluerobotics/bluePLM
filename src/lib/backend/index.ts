import type { BackendAdapter, BackendResolution } from './contracts'
import { supabaseBackendAdapter } from './supabaseAdapter'

export type {
  BackendAdapter,
  BackendKind,
  BackendResolution,
  AuthPort,
  IdentityPort,
} from './contracts'
export type { AuthStateListener, AuthStateSubscription } from '@/types/backend'

/** Select the production adapter without changing an operation's error handling. */
export function getBackend(): BackendAdapter {
  return supabaseBackendAdapter
}

/**
 * Configuration readiness for the selected production adapter. The Supabase
 * client already resolves a valid saved configuration before a valid Vite
 * environment configuration.  It returns an explicit unconfigured result
 * rather than substituting another backend or retaining a credentials snapshot.
 */
export function resolveBackend(): BackendResolution {
  const backend = getBackend()
  if (!backend.isConfigured()) {
    return { status: 'unconfigured' }
  }

  return { status: 'ready', backend }
}
