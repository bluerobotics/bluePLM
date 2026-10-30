// Read-only data access for the Files section. RLS on `files` is org-wide, not per vault: the
// vault checks in the UI (FolderView, FileDetail, FileReferences) are what keep other vaults out.
import { getSupabaseClient } from '@/lib/supabase/client'
import { getAccessibleVaults } from '@/lib/supabase/vaults'
import type { FileListRow, UserRef } from './listing'
import type { MetadataColumn, ReferenceRow } from './detail'
import { folderPatterns, childFolderName, addFolderName, subtreePattern, normalizeFolderPath } from './paths'
import { discoverSubfolders, type SubfolderResult } from './subfolders'
import { buildSearchFilter, SEARCH_LIMIT } from './search'
import { downloadFileName, SIGNED_URL_SECONDS, storagePathCandidates, VAULT_BUCKET } from './storagePath'

export interface VaultSummary {
  id: string
  name: string
  slug: string
  description: string | null
  is_default: boolean | null
}

const PAGE_SIZE = 1000
/** A folder holding more files than this is shown truncated, with a note. */
export const MAX_FOLDER_FILES = 20000

export const FILE_LIST_COLUMNS = [
  'id',
  'vault_id',
  'file_name',
  'file_path',
  'extension',
  'file_type',
  'part_number',
  'description',
  'revision',
  'version',
  'state',
  'file_size',
  'content_hash',
  'updated_at',
  'checked_out_by',
  'checked_out_at',
  'checked_out_user:users!checked_out_by(id, email, full_name)',
  'workflow_state:workflow_states!workflow_state_id(name, label, color)',
].join(', ')

function fail(error: { message: string } | null | undefined): never {
  throw new Error(error?.message || 'Request failed')
}

// ---------------------------------------------------------------------------
// Vaults
// ---------------------------------------------------------------------------

const vaultCache = new Map<string, Promise<VaultSummary[]>>()

/**
 * The vaults this user can open. Cached per user for the tab's life; `refresh` drops the cache.
 * `getAccessibleVaults` treats the role string 'admin' as "every vault", so an admin through the
 * Administrators team (isAdminUser) is passed as 'admin' too.
 */
export function loadVaults(userId: string, orgId: string, isAdmin: boolean, refresh = false): Promise<VaultSummary[]> {
  const key = `${userId}:${orgId}:${isAdmin ? 'admin' : 'user'}`
  if (refresh) vaultCache.delete(key)
  let pending = vaultCache.get(key)
  if (!pending) {
    pending = getAccessibleVaults(userId, orgId, isAdmin ? 'admin' : 'user').then(({ vaults, error }) => {
      if (error) throw new Error(error)
      return vaults.map(({ id, name, slug, description, is_default }) => ({ id, name, slug, description, is_default }))
    })
    pending.catch(() => vaultCache.delete(key))
    vaultCache.set(key, pending)
  }
  return pending
}

// ---------------------------------------------------------------------------
// Folder listing
// ---------------------------------------------------------------------------

export interface FolderFiles {
  files: FileListRow[]
  truncated: boolean
}

/** The active files directly in `folder` (not in its subfolders), paged. */
export async function loadFolderFiles(vaultId: string, folder: string): Promise<FolderFiles> {
  const client = getSupabaseClient()
  const { direct, nested } = folderPatterns(folder)
  const files: FileListRow[] = []
  for (let offset = 0; offset < MAX_FOLDER_FILES; offset += PAGE_SIZE) {
    let query = client
      .from('files')
      .select(FILE_LIST_COLUMNS)
      .eq('vault_id', vaultId)
      .is('deleted_at', null)
      .not('file_path', 'ilike', nested)
    if (normalizeFolderPath(folder)) query = query.ilike('file_path', direct)
    const { data, error } = await query.order('file_path', { ascending: true }).range(offset, offset + PAGE_SIZE - 1)
    if (error) fail(error)
    const page = (data ?? []) as unknown as FileListRow[]
    files.push(...page)
    if (page.length < PAGE_SIZE) return { files, truncated: false }
  }
  return { files, truncated: true }
}

/** The child folders of `folder`: explicit folder rows plus folders implied by file paths. */
export async function loadSubfolders(vaultId: string, folder: string): Promise<SubfolderResult> {
  const client = getSupabaseClient()
  const base = normalizeFolderPath(folder)
  const { direct, nested } = folderPatterns(base)

  let folderQuery = client.from('folders').select('folder_path').eq('vault_id', vaultId).is('deleted_at', null)
  if (base) folderQuery = folderQuery.ilike('folder_path', direct)
  const { data: folderRows, error: folderError } = await folderQuery.limit(10000)
  if (folderError) fail(folderError)

  const seeds = new Map<string, string>()
  for (const row of (folderRows ?? []) as Array<{ folder_path: string }>) {
    const name = childFolderName(base, row.folder_path, true)
    if (name) addFolderName(seeds, name)
  }

  return discoverSubfolders(base, [...seeds.values()], async ({ excluded, offset, limit }) => {
    let query = client
      .from('files')
      .select('file_path')
      .eq('vault_id', vaultId)
      .is('deleted_at', null)
      .ilike('file_path', nested)
    for (const name of excluded) query = query.not('file_path', 'ilike', subtreePattern(base, name))
    const { data, error } = await query.order('file_path', { ascending: true }).range(offset, offset + limit - 1)
    if (error) fail(error)
    return ((data ?? []) as Array<{ file_path: string }>).map((row) => row.file_path)
  })
}

/** Files in the vault whose name, part number or description contains `query`. */
export async function searchVault(vaultId: string, query: string): Promise<{ files: FileListRow[]; limited: boolean }> {
  const filter = buildSearchFilter(query)
  if (!filter) return { files: [], limited: false }
  const { data, error } = await getSupabaseClient()
    .from('files')
    .select(FILE_LIST_COLUMNS)
    .eq('vault_id', vaultId)
    .is('deleted_at', null)
    .or(filter)
    .order('file_name', { ascending: true })
    .limit(SEARCH_LIMIT + 1)
  if (error) fail(error)
  const rows = (data ?? []) as unknown as FileListRow[]
  return { files: rows.slice(0, SEARCH_LIMIT), limited: rows.length > SEARCH_LIMIT }
}

// ---------------------------------------------------------------------------
// File detail
// ---------------------------------------------------------------------------

export interface FileDetailRow extends FileListRow {
  org_id: string
  custom_properties: unknown
  configuration_revisions: unknown
  eco_tags: string[] | null
  created_at: string | null
  deleted_at: string | null
  lock_message: string | null
  checked_out_by_machine_name: string | null
  state_changed_at: string | null
  created_by_user: UserRef | null
  updated_by_user: UserRef | null
}

const FILE_DETAIL_COLUMNS = [
  FILE_LIST_COLUMNS,
  'org_id',
  'custom_properties',
  'configuration_revisions',
  'eco_tags',
  'created_at',
  'deleted_at',
  'lock_message',
  'checked_out_by_machine_name',
  'state_changed_at',
  'created_by_user:users!created_by(email, full_name)',
  'updated_by_user:users!updated_by(email, full_name)',
].join(', ')

export async function loadFile(fileId: string): Promise<FileDetailRow | null> {
  const { data, error } = await getSupabaseClient()
    .from('files')
    .select(FILE_DETAIL_COLUMNS)
    .eq('id', fileId)
    .maybeSingle()
  if (error) fail(error)
  return (data as unknown as FileDetailRow | null) ?? null
}

export interface VersionRow {
  id: string
  version: number
  revision: string
  state: string
  comment: string | null
  content_hash: string
  file_size: number | null
  part_number: string | null
  description: string | null
  created_at: string | null
  created_by_user: UserRef | null
}

export async function loadVersions(fileId: string): Promise<VersionRow[]> {
  const { data, error } = await getSupabaseClient()
    .from('file_versions')
    .select(
      'id, version, revision, state, comment, content_hash, file_size, part_number, description, created_at, created_by_user:users!created_by(email, full_name)',
    )
    .eq('file_id', fileId)
    .order('version', { ascending: false })
    .limit(1000)
  if (error) fail(error)
  return (data ?? []) as unknown as VersionRow[]
}

const REFERENCED_FILE_COLUMNS = 'id, file_name, file_path, vault_id, part_number, description, revision, state, deleted_at'

/** `contains`: what this file references. `whereUsed`: what references this file. */
export async function loadReferences(fileId: string): Promise<{ contains: ReferenceRow[]; whereUsed: ReferenceRow[] }> {
  const client = getSupabaseClient()
  const [contains, whereUsed] = await Promise.all([
    client
      .from('file_references')
      .select(`id, reference_type, quantity, configuration, other:files!child_file_id(${REFERENCED_FILE_COLUMNS})`)
      .eq('parent_file_id', fileId)
      .limit(5000),
    client
      .from('file_references')
      .select(`id, reference_type, quantity, configuration, other:files!parent_file_id(${REFERENCED_FILE_COLUMNS})`)
      .eq('child_file_id', fileId)
      .limit(5000),
  ])
  if (contains.error) fail(contains.error)
  if (whereUsed.error) fail(whereUsed.error)
  return {
    contains: (contains.data ?? []) as unknown as ReferenceRow[],
    whereUsed: (whereUsed.data ?? []) as unknown as ReferenceRow[],
  }
}

/** Labels for custom properties. A failure only costs the labels, so it returns []. */
export async function loadMetadataColumns(orgId: string): Promise<MetadataColumn[]> {
  const { data, error } = await getSupabaseClient()
    .from('file_metadata_columns')
    .select('name, label, sort_order')
    .eq('org_id', orgId)
  if (error) return []
  return (data ?? []) as MetadataColumn[]
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export class DownloadUnavailableError extends Error {}

/** A short-lived signed URL that downloads the content under `fileName`. */
export async function createDownloadUrl(orgId: string, hash: string | null, fileName: string): Promise<string> {
  const candidates = storagePathCandidates(orgId, hash)
  if (candidates.length === 0) throw new DownloadUnavailableError('no content')
  const bucket = getSupabaseClient().storage.from(VAULT_BUCKET)
  const name = downloadFileName(fileName, hash ?? 'download')
  let lastError: string | null = null
  for (const path of candidates) {
    const { data, error } = await bucket.createSignedUrl(path, SIGNED_URL_SECONDS, { download: name })
    if (!error && data?.signedUrl) return data.signedUrl
    lastError = error?.message ?? null
  }
  throw new Error(lastError || 'not found')
}

/** Start a browser download from a signed URL without leaving the page. */
export function startDownload(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.rel = 'noopener noreferrer'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
