/**
 * Testing a backup: can it actually be restored?
 *
 * Every mode only reads the repository; none writes to it, to the database or
 * to storage. That is what makes it safe to run against production at any time.
 *
 * - quick: every snapshot manifest decrypts with the password; the target
 *   snapshot's parts (database tables, object list) match the hashes its
 *   manifest recorded and decrypt; every blob it refers to is present with the
 *   size its content needs.
 * - sample: quick, plus a random sample of blobs downloaded, decrypted and
 *   re-hashed, which is a restore of that content in all but the final write.
 * - full: quick for every snapshot, plus every referenced blob read back.
 *
 * Given the live source, it also reports drift: vault objects added since the
 * snapshot (not yet backed up) and objects the snapshot holds that the live vault
 * no longer has (only recoverable from the backup). In sample and full modes it
 * re-hashes a sample of the live vault too, because a backup does not re-read
 * content it already holds and would not notice it rotting in place.
 */

import crypto from 'node:crypto'

import { BackupRepository, type SnapshotManifest, type SnapshotObjectEntry } from './repository.js'
import { hashFromObjectName, type BackupSource } from './source.js'

export type VerifyMode = 'quick' | 'sample' | 'full'

export interface VerifyReport {
  mode: VerifyMode
  ok: boolean
  repository: string
  checkedAt: string
  durationSeconds: number
  snapshotsTotal: number
  snapshotsUnreadable: Array<{ id: string; error: string }>
  snapshot: {
    id: string
    createdAt: string
    trigger: string
    tables: number
    rows: number
    objects: number
    bytes: number
    ageHours: number
  } | null
  partsChecked: number
  partsFailed: Array<{ part: string; error: string }>
  blobsReferenced: number
  blobsMissing: number
  blobsWrongSize: number
  blobsRead: number
  bytesRead: number
  blobsReadFailed: Array<{ name: string; error: string }>
  drift: { liveObjects: number; notYetBackedUp: number; onlyInBackup: number } | null
  /** Live vault objects re-hashed (sample and full modes, given the source). */
  liveAudit?: { checked: number; corrupt: string[]; unreadable: number }
  /** One sentence per failure, for the app. Empty when ok. */
  problems: string[]
  /** Names of missing blobs, at most 20, for the report. */
  missingExamples: string[]
}

export interface VerifyOptions {
  mode: VerifyMode
  snapshotId?: string
  sampleSize?: number
  source?: BackupSource
  now?: () => Date
  random?: () => number
  /** Called as the test goes: blobs read so far out of those it will read. */
  onProgress?: (progress: { phase: 'parts' | 'blobs' | 'live'; done: number; total: number }) => void | Promise<void>
}

function pickSample<T>(items: T[], count: number, random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

export async function verifyRepository(repo: BackupRepository, options: VerifyOptions): Promise<VerifyReport> {
  const now = options.now ?? (() => new Date())
  const random = options.random ?? Math.random
  const started = now()
  const report: VerifyReport = {
    mode: options.mode,
    ok: false,
    repository: repo.store.description,
    checkedAt: started.toISOString(),
    durationSeconds: 0,
    snapshotsTotal: 0,
    snapshotsUnreadable: [],
    snapshot: null,
    partsChecked: 0,
    partsFailed: [],
    blobsReferenced: 0,
    blobsMissing: 0,
    blobsWrongSize: 0,
    blobsRead: 0,
    bytesRead: 0,
    blobsReadFailed: [],
    drift: null,
    problems: [],
    missingExamples: [],
  }

  const { manifests, unreadable } = await repo.listSnapshots()
  report.snapshotsTotal = manifests.length + unreadable.length
  report.snapshotsUnreadable = unreadable
  for (const u of unreadable) report.problems.push(`Snapshot ${u.id} cannot be read: ${u.error}`)

  const target = options.snapshotId
    ? manifests.find((m) => m.id === options.snapshotId)
    : manifests[manifests.length - 1]
  if (!target) {
    report.problems.push(options.snapshotId ? `Snapshot ${options.snapshotId} does not exist.` : 'The repository has no snapshot yet.')
    report.durationSeconds = Math.round((now().getTime() - started.getTime()) / 1000)
    return report
  }

  const toCheck: SnapshotManifest[] = options.mode === 'full' ? manifests : [target]
  const blobs = await repo.listBlobs()
  const referenced = new Map<string, SnapshotObjectEntry>()
  let targetEntries: SnapshotObjectEntry[] = []

  for (const manifest of toCheck) {
    for (const table of manifest.tables) {
      report.partsChecked++
      try {
        await repo.readPart(table.part, table.sha256)
      } catch (err) {
        report.partsFailed.push({ part: table.part, error: err instanceof Error ? err.message : String(err) })
      }
    }
    report.partsChecked++
    let entries: SnapshotObjectEntry[] = []
    try {
      entries = await repo.readObjects(manifest)
    } catch (err) {
      report.partsFailed.push({ part: manifest.objects.part, error: err instanceof Error ? err.message : String(err) })
    }
    if (manifest.id === target.id) targetEntries = entries
    await options.onProgress?.({ phase: 'parts', done: toCheck.indexOf(manifest) + 1, total: toCheck.length })
    for (const entry of entries) {
      const key = repo.blobKey(entry.hash)
      if (referenced.has(key)) continue
      referenced.set(key, entry)
      const stored = blobs.get(key)
      if (stored === undefined) {
        report.blobsMissing++
        if (report.missingExamples.length < 20) report.missingExamples.push(entry.name)
      } else if (stored !== BackupRepository.storedSize(entry.size)) {
        report.blobsWrongSize++
      }
    }
  }
  for (const failed of report.partsFailed) report.problems.push(`Snapshot part ${failed.part} is damaged: ${failed.error}`)
  report.blobsReferenced = referenced.size
  if (report.blobsMissing > 0) report.problems.push(`${report.blobsMissing} file content object(s) the backup refers to are missing from the bucket.`)
  if (report.blobsWrongSize > 0) report.problems.push(`${report.blobsWrongSize} file content object(s) in the bucket have the wrong size.`)

  const present = [...referenced.entries()].filter(([key]) => blobs.has(key)).map(([, entry]) => entry)
  const toRead =
    options.mode === 'full'
      ? present
      : options.mode === 'sample'
        ? pickSample(present, options.sampleSize ?? 25, random)
        : []
  for (const entry of toRead) {
    try {
      const { size } = await repo.checkBlob(entry.hash)
      if (size !== entry.size) throw new Error(`restored ${size} bytes, expected ${entry.size}`)
      report.blobsRead++
      report.bytesRead += size
    } catch (err) {
      report.blobsReadFailed.push({ name: entry.name, error: err instanceof Error ? err.message : String(err) })
    }
    await options.onProgress?.({ phase: 'blobs', done: report.blobsRead + report.blobsReadFailed.length, total: toRead.length })
  }
  if (report.blobsReadFailed.length > 0) {
    report.problems.push(`${report.blobsReadFailed.length} file content object(s) could not be restored intact.`)
  }

  const rows = target.tables.reduce((sum, t) => sum + t.rows, 0)
  report.snapshot = {
    id: target.id,
    createdAt: target.createdAt,
    trigger: target.trigger,
    tables: target.tables.length,
    rows,
    objects: target.objects.count,
    bytes: target.objects.bytes,
    ageHours: Math.round(((now().getTime() - Date.parse(target.createdAt)) / 3600000) * 10) / 10,
  }

  if (options.source) {
    const inSnapshot = new Set(targetEntries.map((e) => e.hash))
    const live = new Map<string, string>()
    for (let after: string | null = null; ; ) {
      const page = await options.source.listObjects(after, 1000)
      for (const object of page) {
        const hash = hashFromObjectName(object.name)
        if (hash) live.set(hash, object.name)
      }
      if (page.length < 1000) break
      after = page[page.length - 1].name
    }
    let notYetBackedUp = 0
    for (const hash of live.keys()) if (!inSnapshot.has(hash)) notYetBackedUp++
    let onlyInBackup = 0
    for (const hash of inSnapshot) if (!live.has(hash)) onlyInBackup++
    report.drift = { liveObjects: live.size, notYetBackedUp, onlyInBackup }

    // A backup never re-reads content it already holds, so damage to a live
    // object after it was backed up shows up nowhere else. Hash a sample of
    // the live vault; a damaged object is restorable from the backup.
    if (options.mode !== 'quick') {
      const sample = pickSample([...live.entries()], options.sampleSize ?? 25, random)
      report.liveAudit = { checked: 0, corrupt: [], unreadable: 0 }
      for (const [hash, name] of sample) {
        try {
          const digest = crypto.createHash('sha256')
          for await (const chunk of await options.source.openObject(name)) digest.update(chunk as Buffer)
          report.liveAudit.checked++
          if (digest.digest('hex') !== hash) report.liveAudit.corrupt.push(name)
        } catch {
          report.liveAudit.unreadable++
        }
        await options.onProgress?.({ phase: 'live', done: report.liveAudit.checked + report.liveAudit.unreadable, total: sample.length })
      }
      if (report.liveAudit.corrupt.length > 0) {
        const restorable = report.liveAudit.corrupt.filter((name) => inSnapshot.has(hashFromObjectName(name)!)).length
        report.problems.push(
          `${report.liveAudit.corrupt.length} file(s) in the live vault no longer match their content hash` +
            ` (${restorable} restorable from this backup).`,
        )
      }
    }
  }

  report.ok = report.problems.length === 0
  report.durationSeconds = Math.round((now().getTime() - started.getTime()) / 1000)
  return report
}
