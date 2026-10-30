/**
 * The server reads and writes a cross-vault transfer needs beyond `syncFile`.
 *
 * Everything here goes through the user's own Supabase session, so row-level security decides
 * what is visible; none of it assumes access it cannot verify. Large id lists are chunked to keep
 * request URLs short, and any list that can exceed PostgREST's row cap is paged.
 */

import { getFilesLightweight } from '@/lib/supabase/files/queries'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'

import type { SourceRowState } from './execute'

/** Ids per `.in()` filter. Keeps the request URL well under common proxy limits. */
const ID_CHUNK_SIZE = 80

/** PostgREST caps a response at its configured max rows; paging at this size stays under it. */
const PAGE_SIZE = 1000

/** Rows per insert request. */
const INSERT_BATCH_SIZE = 200

/** Parallel chunk requests. */
const CHUNK_CONCURRENCY = 4

/** How many example paths a warning shows. */
const SAMPLE_COUNT = 3

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function mapChunks<TIn, TOut>(
  chunks: TIn[][],
  worker: (chunk: TIn[]) => Promise<TOut>,
): Promise<TOut[]> {
  const results: TOut[] = new Array(chunks.length)
  let next = 0

  async function run(): Promise<void> {
    while (next < chunks.length) {
      const index = next++
      results[index] = await worker(chunks[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, run))
  return results
}

// ============================================
// Destination index
// ============================================

export type DestinationIndexResult =
  | { ok: true; serverPaths: Set<string> }
  | { ok: false; error: string }

/** Every active path in the destination vault, lower-cased: what `file_vault_id_file_path_idx` compares. */
export async function loadDestinationIndex(
  orgId: string,
  vaultId: string,
): Promise<DestinationIndexResult> {
  const { files, error } = await getFilesLightweight(orgId, vaultId)
  if (error || !files) {
    return { ok: false, error: error?.message ?? 'Could not read the destination vault' }
  }
  return { ok: true, serverPaths: new Set(files.map((file) => file.file_path.toLowerCase())) }
}

// ============================================
// Source rows, before a Move deletes them
// ============================================

export type SourceRowsResult =
  | { ok: true; rows: Map<string, SourceRowState> }
  | { ok: false; error: string }

export async function fetchSourceRowStates(ids: readonly string[]): Promise<SourceRowsResult> {
  const client = getSupabaseClient()
  const rows = new Map<string, SourceRowState>()

  const outcomes = await mapChunks(chunk(ids, ID_CHUNK_SIZE), async (idChunk) => {
    const { data, error } = await client
      .from('file')
      .select('id, version, content_hash, checked_out_by, deleted_at')
      .in('id', idChunk)
    return { data, error }
  })

  for (const outcome of outcomes) {
    if (outcome.error) return { ok: false, error: outcome.error.message }
    for (const row of outcome.data ?? []) rows.set(row.id, row)
  }
  return { ok: true, rows }
}

// ============================================
// References
// ============================================

type ReferenceRow = Pick<
  Database['public']['Tables']['file_reference']['Row'],
  'id' | 'parent_file_id' | 'child_file_id' | 'reference_type' | 'quantity' | 'configuration'
>

type ReferenceRowsResult = { ok: true; rows: ReferenceRow[] } | { ok: false; error: string }

async function fetchReferences(
  column: 'parent_file_id' | 'child_file_id',
  ids: readonly string[],
): Promise<ReferenceRowsResult> {
  const client = getSupabaseClient()
  const rows: ReferenceRow[] = []

  const outcomes = await mapChunks(chunk(ids, ID_CHUNK_SIZE), async (idChunk) => {
    const collected: ReferenceRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client
        .from('file_reference')
        .select('id, parent_file_id, child_file_id, reference_type, quantity, configuration')
        .in(column, idChunk)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) return { error: error.message, rows: collected }
      collected.push(...(data ?? []))
      if (!data || data.length < PAGE_SIZE) break
    }
    return { error: null, rows: collected }
  })

  for (const outcome of outcomes) {
    if (outcome.error) return { ok: false, error: outcome.error }
    rows.push(...outcome.rows)
  }
  return { ok: true, rows }
}

export interface IdPair {
  sourceFileId: string
  destFileId: string
}

/**
 * Recreate, between the destination rows, the references that connect the source rows. Only a
 * reference with both ends in the transfer is copied: the destination has nothing for the others
 * to point at.
 */
export async function copyReferencesBetween(
  orgId: string,
  pairs: readonly IdPair[],
): Promise<{ copied: number; error?: string }> {
  const destBySource = new Map(pairs.map((pair) => [pair.sourceFileId, pair.destFileId]))
  const fetched = await fetchReferences('parent_file_id', [...destBySource.keys()])
  if (!fetched.ok) return { copied: 0, error: fetched.error }

  const inserts = fetched.rows.flatMap((row) => {
    const parent = destBySource.get(row.parent_file_id)
    const child = destBySource.get(row.child_file_id)
    if (!parent || !child) return []
    return [
      {
        org_id: orgId,
        parent_file_id: parent,
        child_file_id: child,
        reference_type: row.reference_type,
        quantity: row.quantity,
        configuration: row.configuration,
      },
    ]
  })

  const client = getSupabaseClient()
  let copied = 0
  for (const batch of chunk(inserts, INSERT_BATCH_SIZE)) {
    const { error } = await client.from('file_reference').insert(batch)
    // A conflict means the row is already there, which is what was asked for.
    if (error && error.code !== '23505') return { copied, error: error.message }
    copied += batch.length
  }
  return { copied }
}

export interface ReferenceGaps {
  /** Files the selection references that are not part of it. A copy of the selection loses these links. */
  missingChildren: { count: number; samples: string[] }
  /** Files outside the selection that reference it. A Move leaves these pointing at nothing. */
  externalParents: { count: number; samples: string[] }
}

async function activePaths(
  ids: readonly string[],
): Promise<{ ok: true; paths: string[] } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: true, paths: [] }
  const client = getSupabaseClient()
  const paths: string[] = []

  const outcomes = await mapChunks(chunk(ids, ID_CHUNK_SIZE), async (idChunk) => {
    const { data, error } = await client
      .from('file')
      .select('file_path')
      .in('id', idChunk)
      .is('deleted_at', null)
    return { data, error }
  })

  for (const outcome of outcomes) {
    if (outcome.error) return { ok: false, error: outcome.error.message }
    paths.push(...(outcome.data ?? []).map((row) => row.file_path))
  }
  return { ok: true, paths }
}

/**
 * What a transfer does to the web of references around the selected files. Advisory: the user is
 * told, and nothing is blocked, because a part with no assembly around it is a perfectly good thing
 * to copy.
 */
export async function findReferenceGaps(
  selectedIds: readonly string[],
): Promise<{ ok: true; gaps: ReferenceGaps } | { ok: false; error: string }> {
  const selected = new Set(selectedIds)

  const [downward, upward] = await Promise.all([
    fetchReferences('parent_file_id', selectedIds),
    fetchReferences('child_file_id', selectedIds),
  ])
  if (!downward.ok) return { ok: false, error: downward.error }
  if (!upward.ok) return { ok: false, error: upward.error }

  const childIds = [...new Set(downward.rows.map((row) => row.child_file_id))].filter(
    (id) => !selected.has(id),
  )
  const parentIds = [...new Set(upward.rows.map((row) => row.parent_file_id))].filter(
    (id) => !selected.has(id),
  )

  const [children, parents] = await Promise.all([activePaths(childIds), activePaths(parentIds)])
  if (!children.ok) return { ok: false, error: children.error }
  if (!parents.ok) return { ok: false, error: parents.error }

  return {
    ok: true,
    gaps: {
      missingChildren: {
        count: children.paths.length,
        samples: children.paths.slice(0, SAMPLE_COUNT),
      },
      externalParents: {
        count: parents.paths.length,
        samples: parents.paths.slice(0, SAMPLE_COUNT),
      },
    },
  }
}
