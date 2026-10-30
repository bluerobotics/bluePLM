/**
 * What a server backup reads: an organization's database rows and its vault
 * content in Supabase Storage.
 *
 * The production source (`SupabaseBackupSource`) uses the service-role client
 * and two service-role-only SQL functions from module 10,
 * `backup_list_org_rows()` (each table's organization scope is written out there)
 * and `backup_list_vault_objects()`. Vault content is streamed through a signed
 * URL, never buffered whole: a CAD file can be larger than the worker's memory.
 *
 * The source only reads. Nothing here writes to the database or to storage,
 * which is what lets `backup-check --dry-run` point it at production.
 */

import { Readable } from 'node:stream'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tables a snapshot holds, in restore order (parents first). Must match the
 * CASE in `backup_list_org_rows()` (migration 0501); `src/lib/supabase/serverBackupsMigration.test.ts`
 * checks both lists agree.
 */
export const BACKUP_TABLES = [
  'organization',
  'app_user',
  'team',
  'team_member',
  'team_permission',
  'user_permission',
  'module_access',
  'vault',
  'vault_access',
  'team_vault_access',
  'workflow_template',
  'workflow_role',
  'workflow_state',
  'workflow_transition',
  'workflow_gate',
  'user_workflow_role',
  'folder',
  'file',
  'file_version',
  'file_reference',
  'file_version_reference',
  'drawing_pdf_render',
  'release_file',
  'file_metadata_column',
  'file_comment',
  'file_watcher',
  'file_workflow_assignment',
  'file_state_entry',
  'workflow_history',
  'workflow_gate_review',
  'review',
  'review_item',
  'review_round',
  'review_response',
  'eco',
  'file_eco',
  'deviation',
  'file_deviation',
  'item_designation',
  'item_designation_assignment',
  'inspection_characteristic',
  'inspection_characteristic_version',
  'supplier',
  'part_supplier',
  'activity',
  'backup_history',
] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

export interface SourceObject {
  /** Object name in the vault bucket: `<org id>/<hh>/<sha256>` (or the older `<org id>/<sha256>`). */
  name: string
  /** Size the storage metadata records; -1 when it records none. */
  size: number
}

export type TablePage = { missing: true } | { missing: false; rows: Record<string, unknown>[] }

export interface BackupSource {
  /** A label for reports: the Supabase host, never a key. */
  readonly description: string
  orgName(): Promise<string>
  /** Pages of rows ordered by id; `after` is the last id of the previous page. */
  exportTable(table: BackupTable, after: string | null, limit: number): Promise<TablePage>
  /** Pages of vault objects ordered by name. */
  listObjects(after: string | null, limit: number): Promise<SourceObject[]>
  openObject(name: string): Promise<Readable>
}

/** The content hash an object name carries, or null when it is not content-addressed. */
export function hashFromObjectName(name: string): string | null {
  const last = name.slice(name.lastIndexOf('/') + 1)
  return /^[0-9a-f]{64}$/.test(last) ? last : null
}

export class SourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceError'
  }
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; body: ReadableStream<Uint8Array> | null }>

export class SupabaseBackupSource implements BackupSource {
  readonly description: string

  constructor(
    private readonly admin: SupabaseClient,
    private readonly orgId: string,
    supabaseUrl: string,
    private readonly fetchImpl: FetchLike = (url) => fetch(url),
  ) {
    this.description = `supabase:${safeHost(supabaseUrl)}`
  }

  async orgName(): Promise<string> {
    const { data, error } = await this.admin.from('organization').select('name').eq('id', this.orgId).single()
    if (error) throw new SourceError(`Could not read the organization: ${error.message}`)
    return (data as { name: string }).name
  }

  async exportTable(table: BackupTable, after: string | null, limit: number): Promise<TablePage> {
    const { data, error } = await this.admin.rpc('backup_list_org_rows', {
      p_org_id: this.orgId,
      p_table: table,
      p_after: after,
      p_limit: limit,
    })
    if (error) throw new SourceError(`Could not export ${table}: ${error.message}`)
    const page = data as { missing: boolean; rows: Record<string, unknown>[] } | null
    if (!page) throw new SourceError(`Export of ${table} returned nothing.`)
    return page.missing ? { missing: true } : { missing: false, rows: page.rows }
  }

  async listObjects(after: string | null, limit: number): Promise<SourceObject[]> {
    const { data, error } = await this.admin.rpc('backup_list_vault_objects', {
      p_org_id: this.orgId,
      p_after: after,
      p_limit: limit,
    })
    if (error) throw new SourceError(`Could not list vault objects: ${error.message}`)
    return ((data ?? []) as Array<{ name: string; size: number | string }>).map((o) => ({
      name: o.name,
      size: Number(o.size),
    }))
  }

  async openObject(name: string): Promise<Readable> {
    const { data, error } = await this.admin.storage.from('vault').createSignedUrl(name, 3600)
    if (error || !data?.signedUrl) {
      throw new SourceError(`Could not sign ${name}: ${error?.message ?? 'no URL'}`)
    }
    const response = await this.fetchImpl(data.signedUrl)
    if (!response.ok || !response.body) throw new SourceError(`Download of ${name} failed: HTTP ${response.status}`)
    return Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>)
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'unknown'
  }
}
