/**
 * Retention and pruning for the server repository.
 *
 * The policy is restic's `forget --keep-daily/weekly/monthly/yearly`, which is
 * what backup_config's retention columns already mean for the desktop: for each
 * rule, walk snapshots newest first and keep the newest one in each of the most
 * recent N distinct days (weeks, months, years) that have one. The newest
 * snapshot is always kept. Periods are taken in the schedule's time zone.
 *
 * Pruning deletes the blobs no kept snapshot refers to. It refuses to delete any
 * blob unless every kept snapshot's object list was read: a blob list built
 * from a partial read would delete content a kept snapshot still needs.
 * Uncommitted snapshot folders (a run that died before its manifest) are
 * cleaned up once they are a day old, so a run in progress is never touched.
 */

import { BackupRepository, type SnapshotManifest } from './repository.js'

export interface RetentionPolicy {
  daily: number
  weekly: number
  monthly: number
  yearly: number
}

export interface RetentionPlan {
  keep: SnapshotManifest[]
  forget: SnapshotManifest[]
}

function periodKeys(instant: Date, timezone: string): { day: string; week: string; month: string; year: string } {
  let zone = timezone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
  } catch {
    zone = 'UTC'
  }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const y = Number(get('year'))
  const m = Number(get('month'))
  const d = Number(get('day'))
  // ISO week of the local date.
  const local = new Date(Date.UTC(y, m - 1, d))
  const weekday = local.getUTCDay() || 7
  local.setUTCDate(local.getUTCDate() + 4 - weekday)
  const weekYear = local.getUTCFullYear()
  const week = Math.ceil(((local.getTime() - Date.UTC(weekYear, 0, 1)) / 86400000 + 1) / 7)
  return {
    day: `${y}-${m}-${d}`,
    week: `${weekYear}-W${week}`,
    month: `${y}-${m}`,
    year: `${y}`,
  }
}

export function planRetention(snapshots: SnapshotManifest[], policy: RetentionPolicy, timezone = 'UTC'): RetentionPlan {
  const newestFirst = [...snapshots].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  const keep = new Set<string>()
  if (newestFirst.length > 0) keep.add(newestFirst[0].id)
  const rules: Array<[keyof ReturnType<typeof periodKeys>, number]> = [
    ['day', policy.daily],
    ['week', policy.weekly],
    ['month', policy.monthly],
    ['year', policy.yearly],
  ]
  for (const [period, count] of rules) {
    if (!count || count <= 0) continue
    const seen = new Set<string>()
    for (const snapshot of newestFirst) {
      const key = periodKeys(new Date(snapshot.createdAt), timezone)[period]
      if (seen.has(key)) continue
      if (seen.size >= count) break
      seen.add(key)
      keep.add(snapshot.id)
    }
  }
  return {
    keep: newestFirst.filter((s) => keep.has(s.id)),
    forget: newestFirst.filter((s) => !keep.has(s.id)),
  }
}

export interface PruneResult {
  kept: number
  forgotten: string[]
  blobsDeleted: number
  bytesFreed: number
  incompleteRemoved: string[]
  /** Why blob deletion was skipped, when it was. */
  skipped: string | null
}

export async function applyRetention(
  repo: BackupRepository,
  policy: RetentionPolicy,
  options: { timezone?: string; now?: Date } = {},
): Promise<PruneResult> {
  const now = options.now ?? new Date()
  const { manifests, unreadable } = await repo.listSnapshots()
  const plan = planRetention(manifests, policy, options.timezone)

  const result: PruneResult = {
    kept: plan.keep.length,
    forgotten: [],
    blobsDeleted: 0,
    bytesFreed: 0,
    incompleteRemoved: [],
    skipped: null,
  }

  if (plan.keep.length === 0) {
    // With no snapshot every blob is unreferenced; a repository in that state
    // needs a person, not a sweep.
    result.skipped = 'The repository has no committed snapshot.'
    return result
  }
  if (unreadable.length > 0) {
    // Its blobs cannot be known, so nothing is pruned and nothing is forgotten.
    result.skipped = `${unreadable.length} snapshot manifest(s) could not be read: ${unreadable.map((u) => u.id).join(', ')}`
    return result
  }

  // Read every kept snapshot's object list before deleting anything.
  const referenced = new Set<string>()
  for (const snapshot of plan.keep) {
    try {
      for (const entry of await repo.readObjects(snapshot)) referenced.add(repo.blobKey(entry.hash))
    } catch (err) {
      result.skipped = `Snapshot ${snapshot.id} object list could not be read: ${err instanceof Error ? err.message : String(err)}`
      return result
    }
  }

  for (const snapshot of plan.forget) {
    await repo.deleteSnapshot(snapshot.id)
    result.forgotten.push(snapshot.id)
  }

  const DAY = 24 * 60 * 60 * 1000
  for (const [id, entry] of await repo.listSnapshotKeys()) {
    if (entry.committed) continue
    const stamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(id)
    const at = stamp ? Date.UTC(+stamp[1], +stamp[2] - 1, +stamp[3], +stamp[4], +stamp[5], +stamp[6]) : 0
    if (now.getTime() - at < DAY) continue
    await repo.store.delete(entry.keys.map((k) => k.key))
    result.incompleteRemoved.push(id)
  }

  const blobs = await repo.listBlobs()
  const doomed: string[] = []
  for (const [key, size] of blobs) {
    if (referenced.has(key)) continue
    doomed.push(key)
    result.bytesFreed += Math.max(0, size - BackupRepository.storedSize(0))
  }
  await repo.store.delete(doomed)
  result.blobsDeleted = doomed.length
  return result
}
