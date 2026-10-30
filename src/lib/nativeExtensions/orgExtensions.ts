/**
 * Reads and writes of org_installed_extensions (native rows) and the
 * org-extensions storage bucket.
 *
 * The generated Supabase types (src/types/supabase.ts) predate schema 104's
 * package_sha256 / package_path / category columns and are regenerated only
 * against an applied schema, so these calls go through an untyped view of the
 * same authenticated client and every row is checked by parseOrgNativeRow.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { NativeExtensionManifest, OrgNativeExtensionRow } from '@/types/nativeExtensions'

export const ORG_EXTENSIONS_BUCKET = 'org-extensions'

/** Signed download URLs live this long; the desktop downloads immediately. */
const SIGNED_URL_SECONDS = 300

function db(): SupabaseClient {
  return getSupabaseClient() as unknown as SupabaseClient
}

/** `<org_id>/<extension_id>/<version>-<sha256>.bpx`, the path the schema's check requires. */
export function buildPackagePath(
  orgId: string,
  extensionId: string,
  version: string,
  sha256: string,
): string {
  return `${orgId}/${extensionId}/${version}-${sha256}.bpx`
}

/** Validate one row; returns null (and the reason) for anything that is not a usable native row. */
export function parseOrgNativeRow(raw: unknown): { row: OrgNativeExtensionRow } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'not a row' }
  const r = raw as Record<string, unknown>
  // Id and version patterns are enforced by the main process when it prepares the
  // package (electron/handlers/extensions/validation.ts); here they only need to be strings.
  const extensionId = r.extension_id
  if (typeof extensionId !== 'string' || extensionId.length === 0) return { error: 'missing extension id' }
  if (r.category !== 'native') return { error: `${extensionId} is not native` }
  if (typeof r.version !== 'string' || r.version.length === 0) {
    return { error: `${extensionId}: missing version` }
  }
  if (typeof r.package_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.package_sha256)) {
    return { error: `${extensionId}: missing or malformed package_sha256` }
  }
  if (typeof r.package_path !== 'string' || r.package_path.length === 0) {
    return { error: `${extensionId}: missing package_path` }
  }
  if (typeof r.org_id !== 'string') return { error: `${extensionId}: missing org_id` }
  const manifest = r.manifest as NativeExtensionManifest | null
  if (!manifest || typeof manifest !== 'object' || manifest.id !== extensionId) {
    return { error: `${extensionId}: manifest does not match the row` }
  }
  return {
    row: {
      orgId: r.org_id,
      extensionId,
      version: r.version,
      enabled: r.is_enabled !== false,
      sha256: r.package_sha256,
      packagePath: r.package_path,
      manifest,
      installedAt: typeof r.installed_at === 'string' ? r.installed_at : null,
    },
  }
}

const ROW_COLUMNS =
  'org_id, extension_id, version, is_enabled, manifest, installed_at, package_sha256, package_path, category'

/** Every native row of the organization, enabled or not. Rows that fail parsing are returned as errors. */
export async function fetchOrgNativeExtensions(
  orgId: string,
): Promise<{ rows: OrgNativeExtensionRow[]; invalid: string[] }> {
  const { data, error } = await db()
    .from('org_installed_extension')
    .select(ROW_COLUMNS)
    .eq('org_id', orgId)
    .eq('category', 'native')
  if (error) throw new Error(error.message)
  const rows: OrgNativeExtensionRow[] = []
  const invalid: string[] = []
  for (const raw of (data ?? []) as unknown[]) {
    const parsed = parseOrgNativeRow(raw)
    if ('row' in parsed) rows.push(parsed.row)
    else invalid.push(parsed.error)
  }
  return { rows, invalid }
}

export async function createPackageDownloadUrl(packagePath: string): Promise<string> {
  const { data, error } = await db()
    .storage.from(ORG_EXTENSIONS_BUCKET)
    .createSignedUrl(packagePath, SIGNED_URL_SECONDS)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Could not create a download URL for the package')
  }
  return data.signedUrl
}

export interface InstallOrgNativeExtensionInput {
  orgId: string
  userId: string | null
  manifest: NativeExtensionManifest
  sha256: string
  data: Uint8Array
}

/**
 * Upload the package and upsert the row. RLS and the storage policies make both
 * admin-only; the caller also checks in the UI.
 */
export async function installOrgNativeExtension(
  input: InstallOrgNativeExtensionInput,
): Promise<OrgNativeExtensionRow> {
  const { orgId, userId, manifest, sha256, data } = input
  const path = buildPackagePath(orgId, manifest.id, manifest.version, sha256)
  const client = db()

  const upload = await client.storage
    .from(ORG_EXTENSIONS_BUCKET)
    .upload(path, new Blob([data as BlobPart], { type: 'application/zip' }), {
      upsert: true,
      contentType: 'application/zip',
    })
  if (upload.error) throw new Error(`Upload failed: ${upload.error.message}`)

  const { data: row, error } = await client
    .from('org_installed_extension')
    .upsert(
      {
        org_id: orgId,
        extension_id: manifest.id,
        version: manifest.version,
        manifest,
        is_enabled: true,
        installed_at: new Date().toISOString(),
        installed_by: userId,
        category: 'native',
        package_sha256: sha256,
        package_path: path,
      },
      { onConflict: 'org_id,extension_id' },
    )
    .select(ROW_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  const parsed = parseOrgNativeRow(row)
  if (!('row' in parsed)) throw new Error(parsed.error)
  return parsed.row
}

export async function setOrgNativeExtensionEnabled(
  orgId: string,
  extensionId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await db()
    .from('org_installed_extension')
    .update({ is_enabled: enabled })
    .eq('org_id', orgId)
    .eq('extension_id', extensionId)
  if (error) throw new Error(error.message)
}

/** Delete the row, then the package object. A leftover object is harmless (nothing points at it). */
export async function uninstallOrgNativeExtension(row: OrgNativeExtensionRow): Promise<void> {
  const client = db()
  const { error } = await client
    .from('org_installed_extension')
    .delete()
    .eq('org_id', row.orgId)
    .eq('extension_id', row.extensionId)
  if (error) throw new Error(error.message)
  await client.storage.from(ORG_EXTENSIONS_BUCKET).remove([row.packagePath])
}
