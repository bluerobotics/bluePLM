import { getActiveBackendKind } from './backend'
import type { BackendKind } from './backend'
import type { SettingsTab } from '@/types/settings'
import type { ModuleId } from '@/types/modules'

export type ClientRole = 'admin' | 'engineer' | 'viewer'
export type BackendCapability =
  | 'solidworks-license-management'
  | 'metadata-column-defaults'
  | 'direct-account-provisioning'
  | 'organization-invite-settings'
  | 'editable-workflow-roles'
  | 'job-titles'
  | 'team-permissions'
  | 'team-reviewers'
  | 'mdb-authenticator'
  | 'mdb-user-credentials'
  | 'user-permissions'
  | 'net-permissions'
  | 'company-logo-management'
  | 'organization-address-management'
  | 'network-vault-management'
  | 'cloud-vault-management'
export type SettingsTabAvailability = 'supported' | 'in-development' | 'incompatible'

export interface BackendRoutes<TMdb, TSupabase> {
  mdb: () => TMdb
  supabase: () => TSupabase
}

const allBackends = new Set<BackendKind>(['mdb', 'supabase'])
const supabaseOnly = new Set<BackendKind>(['supabase'])

/**
 * Exhaustive feature matrix: adding a SettingsTab requires an explicit backend
 * support decision here before TypeScript will compile.
 */
const settingsTabBackends: Record<SettingsTab, ReadonlySet<BackendKind>> = {
  profile: allBackends,
  preferences: allBackends,
  keybindings: allBackends,
  modules: allBackends,
  vaults: allBackends,
  'team-members': allBackends,
  'module-access': allBackends,
  'company-profile': allBackends,
  // MDB persists these settings through its organization-settings API. Keep
  // the original panel visible and editable for both supported backends.
  'auth-providers': allBackends,
  serialization: allBackends,
  export: allBackends,
  rfq: allBackends,
  'metadata-columns': allBackends,
  'item-designations': allBackends,
  backup: supabaseOnly,
  solidworks: allBackends,
  'google-drive': supabaseOnly,
  odoo: supabaseOnly,
  slack: supabaseOnly,
  webhooks: supabaseOnly,
  api: supabaseOnly,
  supabase: supabaseOnly,
  'recovery-codes': allBackends,
  'vault-audit': supabaseOnly,
  performance: allBackends,
  logs: allBackends,
  'dev-tools': allBackends,
  about: allBackends,
  'delete-account': allBackends,
  'extension-store': supabaseOnly,
}

const backendCapabilities: Record<BackendKind, ReadonlySet<BackendCapability>> = {
  mdb: new Set<BackendCapability>([
    'metadata-column-defaults',
    'direct-account-provisioning',
    'mdb-authenticator',
    'mdb-user-credentials',
    'editable-workflow-roles',
    'team-permissions',
    'team-reviewers',
    'user-permissions',
    'net-permissions',
    'network-vault-management',
  ]),
  supabase: new Set<BackendCapability>([
    'solidworks-license-management',
    'metadata-column-defaults',
    'organization-invite-settings',
    'editable-workflow-roles',
    'job-titles',
    'team-permissions',
    'team-reviewers',
    'user-permissions',
    'net-permissions',
    'company-logo-management',
    'organization-address-management',
    'cloud-vault-management',
  ]),
}

/**
 * The only data-provider selection boundary. Domain functions provide both
 * implementations; this adapter chooses exactly one without initializing or
 * probing the inactive SDK.
 */
export function routeBackend<TMdb, TSupabase>(
  routes: BackendRoutes<TMdb, TSupabase>,
): TMdb | TSupabase {
  return getActiveBackendKind() === 'mdb' ? routes.mdb() : routes.supabase()
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
  return getActiveBackendKind() === 'mdb'
}

/**
 * Keep backend-specific feature availability behind the adapter seam so UI
 * components never have to probe an inactive SDK client.
 */
export function activeBackendSupports(capability: BackendCapability): boolean {
  const backend = getActiveBackendKind()
  return backend ? backendCapabilities[backend].has(capability) : false
}

/** Keep Settings navigation availability behind the backend adapter seam. */
export function activeBackendSupportsSettingsTab(tab: SettingsTab): boolean {
  return getActiveBackendSettingsTabAvailability(tab) === 'supported'
}

/**
 * Keep the original Settings information architecture visible for every backend.
 * Unsupported panels render an explicit state instead of disappearing or probing
 * an inactive provider SDK.
 */
export function getActiveBackendSettingsTabAvailability(
  tab: SettingsTab,
): SettingsTabAvailability {
  const backend = getActiveBackendKind()
  if (!backend) return 'incompatible'
  if (settingsTabBackends[tab].has(backend)) return 'supported'
  return 'incompatible'
}

/** Keep backend-specific application modules behind the same adapter boundary. */
export function activeBackendSupportsModule(moduleId: ModuleId): boolean {
  return getActiveBackendKind() !== 'mdb' || moduleId !== 'google-drive'
}
