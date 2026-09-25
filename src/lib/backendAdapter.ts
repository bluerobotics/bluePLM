import { getActiveBackendKind } from './backend'

export type ClientRole = 'admin' | 'engineer' | 'viewer'
export type BackendCapability = 'solidworks-license-management'

export interface BackendRoutes<TMdb, TSupabase> {
  mdb: () => TMdb
  supabase: () => TSupabase
}

/**
 * The only data-provider selection boundary. Domain functions provide both
 * implementations; this adapter chooses exactly one without initializing or
 * probing the inactive SDK.
 */
export function routeBackend<TMdb, TSupabase>(
  routes: BackendRoutes<TMdb, TSupabase>,
): TMdb | TSupabase {
  return getActiveBackendKind() === 'community' ? routes.mdb() : routes.supabase()
}

/** Translate the MDB server role without promoting unknown values. */
export function mapMdbRole(role: string): ClientRole | null {
  switch (role) {
    case 'owner':
    case 'admin':
      return 'admin'
    case 'member':
      return 'engineer'
    case 'viewer':
    case 'guest':
      return 'viewer'
    default:
      return null
  }
}

/** Single backend-selection seam for auth and data adapters. */
export function isMdbBackendActive(): boolean {
  return getActiveBackendKind() === 'community'
}

/** Central backend capability check used by legacy feature call-sites. */
export function isBackendConfigured(kind: 'community' | 'supabase'): boolean {
  return getActiveBackendKind() === kind
}

/**
 * Keep backend-specific feature availability behind the adapter seam so UI
 * components never have to probe an inactive SDK client.
 */
export function activeBackendSupports(capability: BackendCapability): boolean {
  const backend = getActiveBackendKind()

  switch (capability) {
    case 'solidworks-license-management':
      return backend === 'supabase'
  }
}
