/**
 * The three reads the upgrade gate needs, written to work against a 4.x database as well as a
 * 5.x one: `schema_version` (readable by anyone), `client_min_version()` (5.0 and later) and
 * `is_org_admin()` (both). Everything else the app reads was renamed in 5.0 and fails on 4.x.
 */
import { getSupabaseClient } from '@/lib/supabase'
import { log } from '@/lib/logger'

interface RpcErrorLike {
  code?: string
  message?: string
}

interface UntypedClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcErrorLike | null }>
  from(table: string): {
    select(columns: string): PromiseLike<{ data: unknown; error: RpcErrorLike | null }>
  }
}

const client = () => getSupabaseClient() as unknown as UntypedClient

/** PostgREST / Postgres codes for "that table or function does not exist". */
const MISSING = new Set(['PGRST202', 'PGRST205', '42P01', '42883'])

const isMissing = (error: RpcErrorLike | null) => !!error?.code && MISSING.has(error.code)

export type RecordedVersionRead =
  | { ok: true; version: number | null }
  /** Network or server trouble: the gate does not block on what it could not read. */
  | { ok: false }

export async function readRecordedVersion(): Promise<RecordedVersionRead> {
  try {
    const { data, error } = await client().from('schema_version').select('version')
    if (error) {
      if (isMissing(error)) return { ok: true, version: null }
      log.warn('[DbUpgrade]', 'Could not read schema_version', { code: error.code })
      return { ok: false }
    }
    const rows = Array.isArray(data) ? (data as { version?: unknown }[]) : []
    const versions = rows.map((r) => Number(r.version)).filter((v) => Number.isFinite(v))
    return { ok: true, version: versions.length > 0 ? Math.max(...versions) : null }
  } catch (error) {
    log.warn('[DbUpgrade]', 'Could not read schema_version', { error: String(error) })
    return { ok: false }
  }
}

/** client_min_version(), or null when the database predates it or it cannot be read. */
export async function readClientMinVersion(): Promise<string | null> {
  try {
    const { data, error } = await client().rpc('client_min_version')
    if (error) {
      if (!isMissing(error)) {
        log.warn('[DbUpgrade]', 'Could not read client_min_version', { code: error.code })
      }
      return null
    }
    return typeof data === 'string' && /^\d+\.\d+\.\d+/.test(data) ? data : null
  } catch {
    return null
  }
}

/** The database's one definition of admin (role or Administrators team). False when unknown. */
export async function readIsOrgAdmin(): Promise<boolean> {
  try {
    const { data, error } = await client().rpc('is_org_admin')
    return !error && data === true
  } catch {
    return false
  }
}

/**
 * Whether the organization upgrades its database from its release pipeline. The upgrade gate reads
 * it before the store has the organization; anything unreadable counts as the app's own upgrade.
 */
export async function readUpgradesByRelease(): Promise<boolean> {
  try {
    const { data, error } = await client().from('organization').select('settings')
    if (error || !Array.isArray(data) || data.length !== 1) return false
    const settings = (data[0] as { settings?: { schema_upgrades?: unknown } | null }).settings
    return settings?.schema_upgrades === 'release'
  } catch {
    return false
  }
}
