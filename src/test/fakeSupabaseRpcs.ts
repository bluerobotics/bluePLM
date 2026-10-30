/**
 * The file and metadata RPCs, ported from `supabase/modules/10-source-files.sql` for the fake.
 *
 * Ported line by line where it decides an outcome: COALESCE on every metadata parameter, the
 * reserved-map merge, when a version is cut. Omitted: inspection tables (no rows means a NULL
 * fingerprint, equal to a row that never had one), activity details, RLS. When the SQL changes,
 * change this with it; the round-trip tests are only as true as this port.
 */
import type { FakeSupabase, Row } from './fakeSupabase'

const RESERVED_MAPS = ['_config_tabs', '_config_descriptions'] as const

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `merge_custom_properties(p_existing, p_incoming)`. */
export function mergeCustomProperties(existing: unknown, incoming: unknown): unknown {
  if (incoming === null || incoming === undefined) return existing
  const base = isObject(existing) ? existing : {}
  if (!isObject(incoming)) return incoming
  const result: Record<string, unknown> = { ...base, ...incoming }
  for (const key of RESERVED_MAPS) {
    const incomingMap = incoming[key]
    if (!isObject(incomingMap)) continue
    const existingMap = isObject(base[key]) ? (base[key] as Record<string, unknown>) : {}
    const merged: Record<string, unknown> = { ...existingMap, ...incomingMap }
    for (const [configuration, value] of Object.entries(incomingMap)) {
      if (value === null) delete merged[configuration]
    }
    result[key] = merged
  }
  return result
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function fileRow(db: FakeSupabase, id: unknown): Row | undefined {
  return db.rows('file').find((row) => row.id === id)
}

function logActivity(db: FakeSupabase, file: Row, action: string, details: Row): void {
  db.insertRow('activity', {
    org_id: file.org_id,
    file_id: file.id,
    user_id: db.actorId,
    user_email: db.actorEmail || 'unknown',
    action,
    details,
  })
}

export function checkoutFile(args: Row, db: FakeSupabase): unknown {
  const file = fileRow(db, args.p_file_id)
  if (!file) return { success: false, error: 'File not found' }
  if (file.checked_out_by != null && file.checked_out_by !== db.actorId) {
    return { success: false, error: 'File is already checked out by another user' }
  }
  const now = db.tick()
  Object.assign(file, {
    checked_out_by: db.actorId,
    checked_out_at: now,
    lock_message: args.p_lock_message ?? null,
    checked_out_by_machine_id: args.p_machine_id ?? null,
    checked_out_by_machine_name: args.p_machine_name ?? null,
    checked_out_file_path: file.file_path,
    checked_out_file_name: file.file_name,
    updated_by: db.actorId,
    updated_at: now,
  })
  logActivity(db, file, 'checkout', {})
  return { success: true, file: { ...file } }
}

export function checkinFile(args: Row, db: FakeSupabase): unknown {
  const file = fileRow(db, args.p_file_id)
  if (!file) return { success: false, error: 'File not found' }
  if (file.checked_out_by == null || file.checked_out_by !== db.actorId) {
    return { success: false, error: 'You do not have this file checked out' }
  }

  const newPath = text(args.p_new_file_path)
  if (newPath !== null && newPath.toLowerCase() !== String(file.file_path).toLowerCase()) {
    const clash = db
      .rows('file')
      .some(
        (row) =>
          row.vault_id === file.vault_id &&
          String(row.file_path).toLowerCase() === newPath.toLowerCase() &&
          row.id !== file.id &&
          row.deleted_at == null,
      )
    if (clash) {
      return { success: false, error: `Cannot rename: another file already exists at "${newPath}".` }
    }
  }

  const partNumber = text(args.p_part_number)
  const description = text(args.p_description)
  const revision = text(args.p_revision)
  const hash = text(args.p_new_content_hash)
  const customProperties = args.p_custom_properties ?? null

  const contentChanged = hash !== null && hash !== (file.content_hash ?? '')
  const metadataChanged =
    (partNumber !== null && partNumber !== file.part_number) ||
    (description !== null && description !== file.description) ||
    (revision !== null && revision !== file.revision) ||
    customProperties !== null
  const localActive = typeof args.p_local_active_version === 'number' ? args.p_local_active_version : null
  const versionSwitched = localActive !== null && localActive !== file.version

  const versions = db.rows('file_version').filter((v) => v.file_id === file.id)
  let restoringExact = false
  let newVersion = Number(file.version)
  if (versionSwitched) {
    const target = versions.find((v) => v.version === localActive)
    if (hash !== null && target && hash === target.content_hash) {
      restoringExact = true
      newVersion = localActive
    }
  }
  const createdDuringCheckout = versions.filter(
    (v) => String(v.created_at) > String(file.checked_out_at),
  ).length
  const shouldIncrement =
    (contentChanged || metadataChanged || versionSwitched) && !restoringExact && createdDuringCheckout === 0

  const mergedCustom =
    customProperties !== null
      ? mergeCustomProperties(file.custom_properties, customProperties)
      : file.custom_properties

  if (shouldIncrement) {
    newVersion = Math.max(Number(file.version), ...versions.map((v) => Number(v.version))) + 1
  }

  const previous = { ...file }
  const now = db.tick()
  Object.assign(file, {
    checked_out_by: null,
    checked_out_at: null,
    lock_message: null,
    checked_out_by_machine_id: null,
    checked_out_by_machine_name: null,
    checked_out_file_path: null,
    checked_out_file_name: null,
    content_hash: hash ?? file.content_hash,
    file_size: args.p_new_file_size ?? file.file_size,
    part_number: partNumber ?? file.part_number,
    description: description ?? file.description,
    revision: revision ?? file.revision,
    custom_properties: mergedCustom,
    version: newVersion,
    file_path: newPath ?? file.file_path,
    file_name: text(args.p_new_file_name) ?? file.file_name,
    updated_by: db.actorId,
    updated_at: now,
  })

  if (shouldIncrement) {
    db.insertRow('file_version', {
      file_id: file.id,
      version: newVersion,
      revision: revision ?? previous.revision,
      content_hash: hash ?? previous.content_hash,
      file_size: args.p_new_file_size ?? previous.file_size,
      workflow_state_id: previous.workflow_state_id,
      state: previous.state ?? 'not_tracked',
      created_by: db.actorId,
      comment: args.p_comment ?? null,
      part_number: partNumber ?? previous.part_number,
      description: description ?? previous.description,
    })
  }
  logActivity(db, file, 'checkin', { version_incremented: shouldIncrement })

  return {
    success: true,
    file: { ...file },
    new_version: newVersion,
    content_changed: contentChanged,
    metadata_changed: metadataChanged,
    inspection_changed: false,
    version_incremented: shouldIncrement,
  }
}

const VAULT_FILE_COLUMNS = [
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
  'checked_out_file_path',
  'checked_out_file_name',
] as const

export function getVaultFilesFast(args: Row, db: FakeSupabase): unknown {
  return db
    .rows('file')
    .filter(
      (row) =>
        row.org_id === args.p_org_id &&
        row.deleted_at == null &&
        (args.p_vault_id == null || row.vault_id === args.p_vault_id),
    )
    .sort((a, b) => String(a.file_path).localeCompare(String(b.file_path)))
    .map((row) => Object.fromEntries(VAULT_FILE_COLUMNS.map((c) => [c, row[c]])))
}

export function getActiveFileByPath(args: Row, db: FakeSupabase): unknown {
  const path = String(args.p_file_path).toLowerCase()
  return db
    .rows('file')
    .filter(
      (row) =>
        row.vault_id === args.p_vault_id &&
        String(row.file_path).toLowerCase() === path &&
        row.deleted_at == null,
    )
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(0, 1)
    .map((row) => ({ ...row }))
}

/** `move_file`: refused when someone else holds the file; logs a `move` activity row. */
export function moveFile(args: Row, db: FakeSupabase): unknown {
  const file = fileRow(db, args.p_file_id)
  if (!file) return { success: false, error: 'File not found' }
  if (file.checked_out_by != null && file.checked_out_by !== db.actorId) {
    return { success: false, error: 'Cannot move: file is checked out by another user' }
  }
  const oldPath = file.file_path
  const oldName = file.file_name
  const newName = text(args.p_new_file_name) ?? oldName
  const failure = db.applyUpdate('file', file, {
    file_path: args.p_new_file_path,
    file_name: newName,
    updated_by: db.actorId,
    updated_at: db.isoNow(),
  })
  // A unique-index violation raises in SQL, which PostgREST returns as an error.
  if (failure) throw new Error(failure.message)
  logActivity(db, file, 'move', {
    old_path: oldPath,
    new_path: args.p_new_file_path,
    old_name: oldName,
    new_name: newName,
  })
  return { success: true, file: { ...file } }
}

/** `rename_folder_files`: re-prefix every live row under the folder, in the given vault. */
export function renameFolderFiles(args: Row, db: FakeSupabase): unknown {
  const oldPrefix = String(args.p_old_folder_path).replace(/\/+$/, '')
  const newPrefix = String(args.p_new_folder_path).replace(/\/+$/, '')
  const under = `${oldPrefix.toLowerCase()}/`
  let updated = 0
  for (const row of db.rows('file')) {
    if (row.deleted_at != null) continue
    if (args.p_vault_id != null && row.vault_id !== args.p_vault_id) continue
    const path = String(row.file_path)
    if (!path.toLowerCase().startsWith(under)) continue
    const failure = db.applyUpdate('file', row, {
      file_path: newPrefix + path.slice(oldPrefix.length),
      updated_by: db.actorId,
      updated_at: db.isoNow(),
    })
    if (failure) return { success: false, error: failure.message, updated: 0 }
    updated += 1
  }
  return { success: true, updated }
}

/** Register every RPC above on a fake. */
export function defineFileRpcs(db: FakeSupabase): void {
  db.defineRpc('file_checkout', checkoutFile)
  db.defineRpc('file_checkin', checkinFile)
  db.defineRpc('file_move', moveFile)
  db.defineRpc('folder_rename', renameFolderFiles)
  // Downloads ask which content an admin marked unrecoverable (schema 503); nothing is, here.
  // Untyped: not in the generated types until gen:types runs against 503.
  db.defineRpc('vault_object_blocked', () => [], { untyped: true })
  // Both are called through `(client.rpc as any)`: missing from the generated types.
  db.defineRpc('vault_file_list', getVaultFilesFast, { untyped: !db.schema.functions.has('vault_file_list') })
  db.defineRpc('file_get_active_by_path', getActiveFileByPath, {
    untyped: !db.schema.functions.has('file_get_active_by_path'),
  })
}
