/**
 * Realtime deletes, as tombstones (schema 502).
 *
 * Supabase Realtime cannot apply RLS to a deleted row, so a DELETE event went to every subscriber
 * of the table in every organization, carrying the row's primary key. The publication now sends
 * inserts and updates only. A delete the client acts on is written by the database as a
 * `realtime_tombstone` row, and its INSERT event is filtered by RLS like any other: the
 * organization, vault access for files and folders, and the owner for a personal swatch.
 *
 * `onRowDeleted` adds a tombstone listener for one table to an existing channel, so a channel's
 * delete handling lives and dies with the channel that handles the table's other events.
 */

import type { RealtimeChannel } from '@supabase/supabase-js'

/** The tables 0502 writes tombstones for (the DO block in 0502_security_hardening.sql). */
export const TOMBSTONE_TABLES = [
  'file',
  'folder',
  'color_swatch',
  'vault',
  'vault_access',
  'team',
  'team_member',
  'user_workflow_role',
  'org_installed_extension',
  'solidworks_license',
  'solidworks_license_assignment',
] as const

export type TombstoneTable = (typeof TOMBSTONE_TABLES)[number]

export interface RealtimeTombstoneRow {
  id: number
  org_id: string
  table_name: TombstoneTable
  /** The deleted row's primary key: `id`, or `extension_id` for org_installed_extension. */
  row_id: string
  vault_id: string | null
  /** The member a membership row named (team_member, vault_access, ...). */
  subject_user_id: string | null
  created_at: string
}

/**
 * Listen on `channel` for deletes of `table`. Call before `channel.subscribe()`.
 * The filter is the table; RLS already confines the rows to what this user may see.
 */
export function onRowDeleted(
  channel: RealtimeChannel,
  table: TombstoneTable,
  onDelete: (row: RealtimeTombstoneRow) => void,
): RealtimeChannel {
  return channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'realtime_tombstone', filter: `table_name=eq.${table}` },
    (payload: { new: unknown }) => {
      // The filter already names the table; checked again so a transport that ignores filters
      // (the multi-machine simulator) cannot hand one table's delete to another's handler.
      const row = payload.new as RealtimeTombstoneRow | undefined
      if (row?.row_id && row.table_name === table) onDelete(row)
    },
  )
}
