/**
 * Running a server backup: database rows, then vault content, then the
 * manifest that commits the snapshot.
 *
 * Failure rules, because a backup that looks fine and is not is worse than one
 * that fails:
 * - A table that cannot be exported fails the whole run: no manifest is
 *   written, so no snapshot claims rows it does not have. (The desktop export
 *   before 113 logged failed file_versions batches and carried on.) A table
 *   whose module is not installed is recorded as missing, by name.
 * - A vault object whose bytes do not hash to its name is never stored. It is
 *   reported as `corrupt_source`: the live vault holds damaged content, and an
 *   earlier snapshot may still hold the good bytes.
 * - An object that cannot be read after retries is reported as
 *   `unreadable_source`, and the snapshot is marked as having problems.
 * - Everything a snapshot lists was confirmed stored before the manifest was
 *   written, either uploaded in this run or present in the repository.
 */

import { BackupRepository, newSnapshotId, type SnapshotManifest, type SnapshotObjectEntry, type SnapshotProblem, type SnapshotTrigger } from './repository.js'
import { ContentMismatchError } from './crypto.js'
import { BACKUP_TABLES, hashFromObjectName, type BackupSource, type BackupTable } from './source.js'

export interface BackupLogger {
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

export const silentLogger: BackupLogger = { info: () => {}, warn: () => {}, error: () => {} }

export interface BackupRunOptions {
  repo: BackupRepository
  source: BackupSource
  orgId: string
  trigger: SnapshotTrigger
  scheduledSlot?: string | null
  now?: () => Date
  /** Objects uploaded at once. */
  concurrency?: number
  /** Attempts per object before it is reported unreadable. */
  attempts?: number
  pageSize?: number
  log?: BackupLogger
  /** Called between objects; the worker renews its lease here. */
  onProgress?: (progress: BackupProgress) => void | Promise<void>
  tables?: readonly BackupTable[]
  retryDelayMs?: number
}

export interface BackupProgress {
  phase: 'tables' | 'objects' | 'commit'
  objectsDone: number
  objectsTotal: number
  bytesUploaded: number
}

export interface BackupRunResult {
  snapshotId: string
  manifest: SnapshotManifest
  stats: {
    tables: number
    rows: number
    objects: number
    objectsUploaded: number
    objectsReused: number
    bytesUploaded: number
    bytesTotal: number
    durationSeconds: number
  }
  problems: SnapshotProblem[]
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runServerBackup(options: BackupRunOptions): Promise<BackupRunResult> {
  const {
    repo,
    source,
    orgId,
    trigger,
    now = () => new Date(),
    concurrency = 4,
    attempts = 3,
    pageSize = 1000,
    log = silentLogger,
    onProgress,
    tables = BACKUP_TABLES,
    retryDelayMs = 2000,
  } = options
  const started = now()
  const snapshotId = newSnapshotId(started)
  const problems: SnapshotProblem[] = []
  log.info('backup: starting', { snapshotId, store: repo.store.description, source: source.description })

  // 1. Database rows. Any error here propagates and nothing is committed.
  const orgName = await source.orgName()
  const tableParts: SnapshotManifest['tables'] = []
  const tablesMissing: string[] = []
  let rows = 0
  await onProgress?.({ phase: 'tables', objectsDone: 0, objectsTotal: 0, bytesUploaded: 0 })
  for (const table of tables) {
    const all: Record<string, unknown>[] = []
    let after: string | null = null
    let missing = false
    for (;;) {
      const page = await source.exportTable(table, after, pageSize)
      if (page.missing) {
        missing = true
        break
      }
      all.push(...page.rows)
      if (page.rows.length < pageSize) break
      after = String(page.rows[page.rows.length - 1].id)
    }
    if (missing) {
      tablesMissing.push(table)
      continue
    }
    const part = await repo.writePart(snapshotId, `tables/${table}.bin`, all)
    tableParts.push({ name: table, rows: all.length, part: part.key, sha256: part.sha256 })
    rows += all.length
  }

  // 2. Vault content.
  const objects: Array<{ name: string; size: number }> = []
  for (let after: string | null = null; ; ) {
    const page = await source.listObjects(after, pageSize)
    objects.push(...page)
    if (page.length < pageSize) break
    after = page[page.length - 1].name
  }
  const existing = await repo.listBlobs()
  const entries: SnapshotObjectEntry[] = []
  const pending: Array<{ name: string; hash: string; size: number }> = []
  const duplicates: Array<{ name: string; hash: string; size: number }> = []
  const queued = new Set<string>()
  let bytesTotal = 0
  let objectsReused = 0
  for (const object of objects) {
    const hash = hashFromObjectName(object.name)
    if (!hash) {
      problems.push({ kind: 'not_content_addressed', name: object.name, detail: 'Object name is not a SHA-256 hash; not backed up.' })
      continue
    }
    const stored = existing.get(repo.blobKey(hash))
    if (stored !== undefined && (object.size < 0 || stored === BackupRepository.storedSize(object.size))) {
      const size = stored - BackupRepository.storedSize(0)
      entries.push({ name: object.name, hash, size })
      bytesTotal += size
      objectsReused++
      continue
    }
    if (queued.has(hash)) {
      // Same content under a second name (the old flat layout and the sharded
      // one): settled after the first name's upload.
      duplicates.push({ name: object.name, hash, size: object.size })
      continue
    }
    queued.add(hash)
    pending.push({ name: object.name, hash, size: object.size })
  }

  let bytesUploaded = 0
  let objectsUploaded = 0
  let done = objectsReused
  const uploaded = new Map<string, number>()
  const failedHashes = new Set<string>()
  const uploadOne = async (item: { name: string; hash: string; size: number }) => {
    if (uploaded.has(item.hash)) {
      entries.push({ name: item.name, hash: item.hash, size: uploaded.get(item.hash)! })
      return
    }
    if (failedHashes.has(item.hash)) return
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const stream = await source.openObject(item.name)
        const plainSize = await repo.putBlob(item.hash, item.size >= 0 ? item.size : undefined, stream)
        uploaded.set(item.hash, plainSize)
        entries.push({ name: item.name, hash: item.hash, size: plainSize })
        bytesUploaded += plainSize
        bytesTotal += plainSize
        objectsUploaded++
        return
      } catch (err) {
        if (err instanceof ContentMismatchError) {
          failedHashes.add(item.hash)
          problems.push({
            kind: 'corrupt_source',
            name: item.name,
            detail: `The stored bytes do not match the object's name (${err.field}: expected ${err.expected}, got ${err.actual}).`,
          })
          log.error('backup: corrupt vault object', { name: item.name, field: err.field })
          return
        }
        if (attempt === attempts) {
          failedHashes.add(item.hash)
          problems.push({ kind: 'unreadable_source', name: item.name, detail: err instanceof Error ? err.message : String(err) })
          log.warn('backup: object unreadable', { name: item.name, error: err instanceof Error ? err.message : String(err) })
          return
        }
        await sleep(retryDelayMs * attempt)
      }
    }
  }

  let next = 0
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < pending.length) {
      const item = pending[next++]
      await uploadOne(item)
      done++
      await onProgress?.({ phase: 'objects', objectsDone: done, objectsTotal: objects.length, bytesUploaded })
    }
  })
  await Promise.all(workers)
  for (const item of duplicates) await uploadOne(item)

  // 3. Commit.
  await onProgress?.({ phase: 'commit', objectsDone: done, objectsTotal: objects.length, bytesUploaded })
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const objectsPart = await repo.writePart(snapshotId, 'objects.bin', entries)
  for (const table of tablesMissing) {
    problems.push({ kind: 'table_missing', name: table, detail: 'The module that holds this table is not installed.' })
  }
  const manifest: SnapshotManifest = {
    format: 'blueplm-server-snapshot',
    version: 1,
    id: snapshotId,
    createdAt: started.toISOString(),
    orgId,
    orgName,
    trigger,
    scheduledSlot: options.scheduledSlot ?? null,
    source: source.description,
    tables: tableParts,
    tablesMissing,
    objects: { part: objectsPart.key, sha256: objectsPart.sha256, count: entries.length, bytes: bytesTotal },
    problems,
  }
  await repo.commitManifest(manifest)

  const durationSeconds = Math.round((now().getTime() - started.getTime()) / 1000)
  log.info('backup: committed', { snapshotId, rows, objects: entries.length, objectsUploaded, bytesUploaded, problems: problems.length })
  return {
    snapshotId,
    manifest,
    stats: {
      tables: tableParts.length,
      rows,
      objects: entries.length,
      objectsUploaded,
      objectsReused,
      bytesUploaded,
      bytesTotal,
      durationSeconds,
    },
    problems,
  }
}

/** Problems that make a run a warning rather than a clean success (missing modules are not). */
export function seriousProblems(problems: SnapshotProblem[]): SnapshotProblem[] {
  return problems.filter((p) => p.kind !== 'table_missing')
}
