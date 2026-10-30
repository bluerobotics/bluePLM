/**
 * What the database upgrade gate shows, decided from plain values so it is tested without a
 * database or a window. Kept free of store and Supabase imports.
 */

/** The schema version this app needs; must equal EXPECTED_SCHEMA_VERSION (asserted in the test). */
export const REQUIRED_SCHEMA_VERSION = 503
/** The schema version a 4.10 database is stamped at. */
export const LEGACY_SCHEMA_VERSION = 112
/**
 * The schema version the 5.0 baseline installs and 0500 upgrades a 4.10 database to. Fixed from
 * 5.0 on, unlike REQUIRED_SCHEMA_VERSION, which every later migration raises.
 */
export const BASELINE_SCHEMA_VERSION = 500

export type DbGateDecision = 'clear' | 'update-required' | 'db-upgrade-admin' | 'db-upgrade-wait'

export interface DbGateInputs {
  appVersion: string
  /** Recorded schema version; null when the database has no schema_version table. */
  recordedVersion: number | null
  /** client_min_version(); null when the database does not have the function (4.x). */
  clientMinVersion: string | null
  isAdmin: boolean
  /** Desktop app (the runner exists); false on BluePLM Web. */
  hasDesktop: boolean
}

/** Compares dotted numeric versions (prerelease suffixes ignored). Negative when a < b. */
export function compareAppVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function decideGate(inputs: DbGateInputs): DbGateDecision {
  if (inputs.clientMinVersion && compareAppVersions(inputs.appVersion, inputs.clientMinVersion) < 0) {
    return 'update-required'
  }
  // No schema_version at all: an uninitialized database, with no organization and so no admin
  // yet (is_org_admin() does not even exist). Any signed-in desktop user may set it up: the
  // screen grants nothing, the database connection string the runner asks for is the authority.
  if (inputs.recordedVersion === null) {
    return inputs.hasDesktop ? 'db-upgrade-admin' : 'db-upgrade-wait'
  }
  if (inputs.recordedVersion < REQUIRED_SCHEMA_VERSION) {
    return inputs.isAdmin && inputs.hasDesktop ? 'db-upgrade-admin' : 'db-upgrade-wait'
  }
  return 'clear'
}

export interface PendingEstimate {
  /** The database has to be brought to 4.10 (schema 112) first. */
  needsLegacy: boolean
  /** Unknown starting point (no schema_version): the exact list comes from the database. */
  unknownStart: boolean
  migrations: { version: number; name: string }[]
}

/**
 * The migrations the app expects to run, from the recorded version alone. Shown before the admin
 * connects; the runner's own plan replaces it once connected.
 */
export function estimatePending(
  recordedVersion: number | null,
  migrations: ReadonlyArray<{ version: number; name: string }>,
): PendingEstimate {
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  if (recordedVersion === null) return { needsLegacy: false, unknownStart: true, migrations: [] }
  // A 4.x database starts at 0500 (after the 4.10 snapshot when it is below 112). Comparing with
  // REQUIRED_SCHEMA_VERSION here dropped 0500 itself as soon as a migration above it existed.
  if (recordedVersion < BASELINE_SCHEMA_VERSION) {
    return {
      needsLegacy: recordedVersion < LEGACY_SCHEMA_VERSION,
      unknownStart: false,
      migrations: sorted.filter((m) => m.version >= BASELINE_SCHEMA_VERSION),
    }
  }
  return {
    needsLegacy: false,
    unknownStart: false,
    migrations: sorted.filter((m) => m.version > recordedVersion),
  }
}

/** The Supabase project ref in a project URL (`https://<ref>.supabase.co`), or null. */
export function projectRefFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const match = /^([a-z0-9]+)\.supabase\.(co|in)$/i.exec(new URL(url).hostname)
    return match ? match[1].toLowerCase() : null
  } catch {
    return null
  }
}
