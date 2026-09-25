/**
 * The active backend profile is intentionally separate from the credentials
 * for individual backends.  A machine runs exactly one backend adapter at a
 * time; keeping stale credentials must never make another adapter active.
 */
export type BackendKind = 'supabase' | 'community'

interface BackendProfile {
  version: 1
  kind: BackendKind
}

const STORAGE_KEY = 'blueplm-backend-profile'
const LEGACY_COMMUNITY_CONFIG_KEY = 'blueplm-community-config'
const LEGACY_SUPABASE_CONFIG_KEY = 'blueplm-supabase-config'

function isBackendKind(value: unknown): value is BackendKind {
  return value === 'supabase' || value === 'community'
}

function getStoredValue(key: string): string | null {
  try {
    return typeof localStorage?.getItem === 'function' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

export function loadBackendProfile(): BackendProfile | null {
  try {
    const raw = getStoredValue(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BackendProfile>
    if (parsed.version !== 1 || !isBackendKind(parsed.kind)) return null
    return { version: 1, kind: parsed.kind }
  } catch {
    return null
  }
}

export function activateBackend(kind: BackendKind): void {
  try {
    if (typeof localStorage?.setItem === 'function') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, kind } satisfies BackendProfile))
    }
  } catch {
    // The caller's backend validation remains authoritative if browser storage
    // is unavailable (for example in a restricted renderer).
  }
}

export function clearBackendProfile(): void {
  try {
    if (typeof localStorage?.removeItem === 'function') localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore unavailable browser storage.
  }
}

export function getActiveBackendKind(): BackendKind | null {
  const profile = loadBackendProfile()
  if (profile) return profile.kind

  // Existing clients had backend credentials but no explicit profile. Saving
  // either configuration writes the profile; new installs never infer one.
  if (getStoredValue(LEGACY_COMMUNITY_CONFIG_KEY)) return 'community'
  if (getStoredValue(LEGACY_SUPABASE_CONFIG_KEY)) return 'supabase'
  return null
}

export function isBackendActive(kind: BackendKind): boolean {
  return getActiveBackendKind() === kind
}
