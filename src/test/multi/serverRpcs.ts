/**
 * RPCs the multi-machine paths call beyond fakeSupabaseRpcs.ts, ported from
 * supabase/modules/10-source-files.sql. Change them when the SQL changes.
 *
 * Note what the SQL does not do: there is no trigger that stamps `files.updated_at` on UPDATE
 * (only `log_file_changes` and `notify_watchers_on_file_change`). A write is visible to
 * `get_vault_files_delta` only when the writer set `updated_at` itself, and the fake keeps it so.
 */
import type { FakeSupabase, Row } from '../fakeSupabase'

/** The columns `get_vault_files_delta` returns. */
const DELTA_COLUMNS = [
  'id',
  'file_path',
  'file_name',
  'extension',
  'file_type',
  'part_number',
  'description',
  'revision',
  'version',
  'content_hash',
  'file_size',
  'state',
  'checked_out_by',
  'checked_out_at',
  'updated_at',
  'custom_properties',
  'deleted_at',
  'checked_out_file_path',
  'checked_out_file_name',
] as const

const after = (value: unknown, since: string) => typeof value === 'string' && Date.parse(value) > Date.parse(since)

/** `get_vault_files_delta`: rows updated or deleted after `p_since`, by `updated_at`. */
export function getVaultFilesDelta(args: Row, db: FakeSupabase): unknown {
  const since = String(args.p_since)
  return db
    .rows('file')
    .filter(
      (row) =>
        row.org_id === args.p_org_id &&
        row.vault_id === args.p_vault_id &&
        (after(row.updated_at, since) || after(row.deleted_at, since)),
    )
    .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
    .map((row) => ({
      ...Object.fromEntries(DELTA_COLUMNS.map((c) => [c, row[c]])),
      is_deleted: row.deleted_at != null,
    }))
}

/** `get_vault_files_count`: the live rows `get_vault_files_fast` would return. */
export function getVaultFilesCount(args: Row, db: FakeSupabase): unknown {
  return db
    .rows('file')
    .filter(
      (row) =>
        row.org_id === args.p_org_id &&
        row.deleted_at == null &&
        (args.p_vault_id == null || row.vault_id === args.p_vault_id),
    ).length
}

export function defineMultiMachineRpcs(db: FakeSupabase): void {
  db.defineRpc('vault_file_list_delta', getVaultFilesDelta)
  db.defineRpc('vault_file_count', getVaultFilesCount)
}
