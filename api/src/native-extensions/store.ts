/**
 * The database and storage reads the native runtime needs, behind one
 * interface so tests can stub them. The default implementation uses the
 * service-role client: the loader runs with no user, and the per-request
 * install check must see the row whatever the caller's RLS allows.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Storage bucket native packages are uploaded to by the desktop install. */
export const NATIVE_PACKAGE_BUCKET = 'org-extensions'

export interface NativeInstallRow {
  org_id: string
  extension_id: string
  package_sha256: string | null
  package_path: string | null
  installed_at: string | null
  manifest: unknown
}

export interface OrgInstall {
  enabled: boolean
  package_sha256: string | null
}

export interface NativeExtensionStore {
  /**
   * Every enabled native install whose manifest has a `serverMain`, for the given
   * orgs only (the operator's NATIVE_EXTENSIONS_ORG_IDS allowlist). Never "any org".
   */
  listNativeInstalls(orgIds: readonly string[]): Promise<NativeInstallRow[]>
  /** The package bytes at `packagePath` in the native package bucket. */
  downloadPackage(packagePath: string): Promise<Buffer>
  /** The caller org's install row for an extension, or null. */
  getOrgInstall(orgId: string, extensionId: string): Promise<OrgInstall | null>
}

export function createSupabaseNativeExtensionStore(admin: SupabaseClient): NativeExtensionStore {
  return {
    async listNativeInstalls(orgIds) {
      if (orgIds.length === 0) return []
      const { data, error } = await admin
        .from('org_installed_extension')
        .select('org_id, extension_id, package_sha256, package_path, installed_at, manifest')
        .in('org_id', [...orgIds])
        .eq('is_enabled', true)
        .eq('category', 'native')
        .not('manifest->>serverMain', 'is', null)
      if (error) throw new Error(`Failed to list native extension installs: ${error.message}`)
      // Defence in depth: never hand back a row outside the allowlist.
      const allowed = new Set(orgIds)
      return ((data ?? []) as NativeInstallRow[]).filter((row) => allowed.has(row.org_id))
    },

    async downloadPackage(packagePath) {
      const { data, error } = await admin.storage.from(NATIVE_PACKAGE_BUCKET).download(packagePath)
      if (error || !data) {
        throw new Error(`Failed to download ${NATIVE_PACKAGE_BUCKET}/${packagePath}: ${error?.message ?? 'no data'}`)
      }
      return Buffer.from(await data.arrayBuffer())
    },

    async getOrgInstall(orgId, extensionId) {
      const { data, error } = await admin
        .from('org_installed_extension')
        .select('is_enabled, package_sha256')
        .eq('org_id', orgId)
        .eq('extension_id', extensionId)
        .maybeSingle()
      if (error) throw new Error(`Failed to read extension install: ${error.message}`)
      if (!data) return null
      const row = data as { is_enabled: boolean | null; package_sha256: string | null }
      return { enabled: row.is_enabled === true, package_sha256: row.package_sha256 }
    },
  }
}

/** The key a loaded extension is stored under: one per (org, extension). */
export function installKey(orgId: string, extensionId: string): string {
  return `${orgId}/${extensionId}`
}

/**
 * Per (org, extension id), the install with the latest `installed_at`. Orgs never
 * share a loaded extension, so two orgs cannot 409 each other. A latest row
 * with no package path or sha256 is still picked; the loader refuses it and
 * reports why, rather than silently falling back to an older version.
 */
export function pickLatestInstalls(rows: NativeInstallRow[]): NativeInstallRow[] {
  const latest = new Map<string, NativeInstallRow>()
  for (const row of rows) {
    const key = installKey(row.org_id, row.extension_id)
    const current = latest.get(key)
    if (!current || timeOf(row.installed_at) > timeOf(current.installed_at)) {
      latest.set(key, row)
    }
  }
  return [...latest.values()].sort((a, b) =>
    installKey(a.org_id, a.extension_id).localeCompare(installKey(b.org_id, b.extension_id)),
  )
}

function timeOf(value: string | null): number {
  const t = value ? Date.parse(value) : NaN
  return Number.isFinite(t) ? t : -Infinity
}
