/**
 * Record a just-checked-in version's references in `file_version_references` (schema 107).
 *
 * Called from the background reference extraction after check-in, with the references it already
 * read, so it costs one small query and one RPC per assembly or drawing and never touches the
 * check-in itself. Best effort: every failure is logged as a warning and swallowed.
 *
 * Which version: `checkin_file` does not return the new version's id, so this reads the file's
 * newest version. It records only when that version
 * - has no references recorded yet (a metadata-only check-in creates no version; re-recording an
 *   older version against today's child versions would rewrite its history), and
 * - holds the content that was checked in (its hash matches the local file), so a version someone
 *   else created in between is never described with this machine's references.
 */

import { log } from '@/lib/logger'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { SWReference } from '@/lib/supabase/files/mutations'
import { recordVersionReferences } from '@/lib/supabase/reviews'
import { usePDMStore } from '@/stores/pdmStore'
import type { LocalFile } from '@/stores/types'

import { candidatesFromFiles, mapVersionReferences, type VaultFileCandidate } from './versionReferences'

/** Candidates per store `files` snapshot, so a bulk check-in builds them once per snapshot. */
const candidatesCache = new WeakMap<ReadonlyArray<LocalFile>, VaultFileCandidate[]>()

function candidatesFor(files: ReadonlyArray<LocalFile>): VaultFileCandidate[] {
  let candidates = candidatesCache.get(files)
  if (!candidates) {
    candidates = candidatesFromFiles(files)
    candidatesCache.set(files, candidates)
  }
  return candidates
}

interface LatestVersionRow {
  id: string
  version: number
  content_hash: string | null
  references_recorded_at: string | null
}

/**
 * `references_recorded_at` is not in the generated `Database` type until `npm run gen:types` runs
 * against schema 107, so this one query goes through a narrow untyped view.
 */
interface UntypedVersionQuery {
  from(table: 'file_version'): {
    select(columns: string): {
      eq(
        column: 'file_id',
        value: string,
      ): {
        order(
          column: 'version',
          options: { ascending: boolean },
        ): {
          limit(count: number): PromiseLike<{ data: unknown; error: { message: string } | null }>
        }
      }
    }
  }
}

function isLatestVersionRow(v: unknown): v is LatestVersionRow {
  if (!v || typeof v !== 'object') return false
  const row = v as Record<string, unknown>
  return typeof row.id === 'string' && typeof row.version === 'number'
}

async function fetchLatestVersion(fileId: string): Promise<LatestVersionRow | null> {
  const client = getSupabaseClient() as unknown as UntypedVersionQuery
  const { data, error } = await client
    .from('file_version')
    .select('id, version, content_hash, references_recorded_at')
    .eq('file_id', fileId)
    .order('version', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const first: unknown = Array.isArray(data) ? data[0] : null
  return isLatestVersionRow(first) ? first : null
}

export async function recordCheckedInVersionReferences(
  file: LocalFile,
  references: ReadonlyArray<SWReference>,
  vaultRootPath?: string,
): Promise<void> {
  const fileId = file.pdmData?.id
  if (!fileId) return

  try {
    const files = usePDMStore.getState().files
    const current = files.find((f) => f.path === file.path) ?? file
    const checkedInHash = current.localHash ?? file.localHash ?? null

    const version = await fetchLatestVersion(fileId)
    if (!version) {
      log.warn('[VersionRefs]', 'No version found after check-in', { fileName: file.name, fileId })
      return
    }
    if (version.references_recorded_at) {
      log.debug('[VersionRefs]', 'References already recorded for the newest version', {
        fileName: file.name,
        version: version.version,
      })
      return
    }
    if (checkedInHash && version.content_hash && version.content_hash !== checkedInHash) {
      log.warn('[VersionRefs]', 'Newest version does not hold the checked-in content; skipped', {
        fileName: file.name,
        version: version.version,
      })
      return
    }

    const refs = mapVersionReferences(references, candidatesFor(files), vaultRootPath)
    const result = await recordVersionReferences(version.id, refs)
    log.info('[VersionRefs]', 'Recorded version references', {
      fileName: file.name,
      version: version.version,
      ...result,
    })
  } catch (error) {
    log.warn('[VersionRefs]', 'Failed to record version references', {
      fileName: file.name,
      fileId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
