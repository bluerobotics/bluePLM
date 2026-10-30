/* eslint-disable no-console -- a command-line tool: its output is the console. */
/**
 * Server backup tools.
 *
 *   npm run backup --prefix api -- sandbox [--dir <folder>] [--days 60] [--files 40]
 *       An isolated rehearsal: a simulated organization backed up every day for
 *       --days days into a repository on local disk, with retention, then
 *       damaged on purpose, verified, and restored and compared byte for byte.
 *       Touches no network and no real data. Exits 1 if any check fails.
 *
 *   npm run backup --prefix api -- dry-run --org <org id> [--hash-sample 20]
 *       Read-only against production: what a backup would export and upload
 *       now, compared with the organization's backup bucket, plus a hash check
 *       of a sample of live vault objects. Writes nothing anywhere.
 *
 *   npm run backup --prefix api -- probe --org <org id>
 *       Checks the organization's bucket accepts every call a backup makes (put, multipart put,
 *       list, get, delete) under a throwaway prefix it removes again. Run before switching an
 *       organization to server backups.
 *
 *   npm run backup --prefix api -- verify --org <org id> [--mode quick|sample|full]
 *   npm run backup --prefix api -- list --org <org id>
 *   npm run backup --prefix api -- restore --org <org id> --to <folder> [--snapshot <id>] [--prefix <path>] [--metadata-only]
 *       Read the organization's real backup bucket; restore writes only into --to.
 *       Add --repo-dir <folder> to use a repository copied to local disk instead.
 *
 * dry-run, verify, list and restore need SUPABASE_URL and SUPABASE_SERVICE_KEY,
 * and open the bucket through a store that refuses every write, so none of them
 * can change a backup, the database or storage.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { runServerBackup, seriousProblems, type BackupLogger } from '../src/backup/engine.js'
import { FsObjectStore, type ObjectStore } from '../src/backup/objectStore.js'
import { BackupRepository, SERVER_REPOSITORY_PREFIX } from '../src/backup/repository.js'
import { restoreSnapshot } from '../src/backup/restore.js'
import { applyRetention } from '../src/backup/retention.js'
import { S3ObjectStore } from '../src/backup/s3Store.js'
import { BACKUP_TABLES, hashFromObjectName, SupabaseBackupSource } from '../src/backup/source.js'
import { verifyRepository, type VerifyMode } from '../src/backup/verify.js'
import type { ServerBackupConfig } from '../src/backup/worker.js'
import { seededBytes, SimulatedOrg } from '../test/backupSim.js'

const args = process.argv.slice(2)
const command = args[0]
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name: string) => args.includes(`--${name}`)

const quiet: BackupLogger = { info: () => {}, warn: () => {}, error: () => {} }
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** A store that refuses every write: what makes the production commands read-only by construction. */
class ReadOnlyStore implements ObjectStore {
  constructor(private readonly inner: ObjectStore) {}
  get description() {
    return `${this.inner.description} (read-only)`
  }
  async put(key: string): Promise<void> {
    throw new Error(`read-only: refused to write ${key}`)
  }
  async delete(keys: string[]): Promise<void> {
    throw new Error(`read-only: refused to delete ${keys.length} object(s)`)
  }
  get = (key: string) => this.inner.get(key)
  getBuffer = (key: string) => this.inner.getBuffer(key)
  head = (key: string) => this.inner.head(key)
  list = (prefix: string) => this.inner.list(prefix)
}

// --- sandbox -----------------------------------------------------------------

async function sandbox(): Promise<boolean> {
  const dir = flag('dir') ?? fs.mkdtempSync(path.join(os.tmpdir(), 'blueplm-backup-sandbox-'))
  const days = Number(flag('days') ?? 60)
  const fileCount = Number(flag('files') ?? 40)
  const repoDir = path.join(dir, 'repository')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const checks: Array<{ name: string; ok: boolean; detail: string }> = []
  const check = (name: string, ok: boolean, detail = '') => {
    checks.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  }

  console.log(`Sandbox in ${dir}: ${fileCount} files, ${days} daily backups\n`)
  const org = new SimulatedOrg('Sandbox Robotics')
  for (let i = 0; i < fileCount; i++) {
    org.checkIn(`Parts/P-${String(i).padStart(4, '0')}.sldprt`, seededBytes(`f${i}`, 2000 + ((i * 7919) % 400_000)))
  }
  const repo = await BackupRepository.init(new FsObjectStore(repoDir), 'sandbox-password')
  const policy = { daily: 14, weekly: 8, monthly: 6, yearly: 2 }
  const start = Date.parse('2026-01-01T02:00:00Z')
  let uploaded = 0
  let lastSnapshot = ''
  for (let day = 0; day < days; day++) {
    const at = new Date(start + day * 86_400_000)
    org.now = () => at
    for (let k = 0; k < 3; k++) {
      const i = (day * 13 + k * 7) % fileCount
      org.checkIn(`Parts/P-${String(i).padStart(4, '0')}.sldprt`, seededBytes(`f${i}-d${day}-${k}`, 1500 + ((day * 31 + i) % 90_000)))
    }
    if (day % 10 === 5) org.delete(`Parts/P-${String(day % fileCount).padStart(4, '0')}.sldprt`)
    const run = await runServerBackup({ repo, source: org, orgId: org.orgId, trigger: 'sandbox', now: () => at, log: quiet })
    uploaded += run.stats.objectsUploaded
    lastSnapshot = run.snapshotId
    if (seriousProblems(run.problems).length > 0) check(`day ${day} backup`, false, JSON.stringify(run.problems))
    await applyRetention(repo, policy, { now: at })
  }
  const { manifests } = await repo.listSnapshots()
  check('daily backups ran and retention trimmed them', manifests.length <= 14 + 8 + 6 + 2 && manifests.length > 0, `${manifests.length} snapshots kept of ${days}`)
  check('backups are incremental', uploaded === org.objects.size, `${uploaded} blobs uploaded for ${org.objects.size} distinct contents`)

  const full = await verifyRepository(repo, { mode: 'full', source: org })
  check('full test of every kept snapshot passes', full.ok, `${full.blobsRead} blobs read, ${mb(full.bytesRead)}`)

  const out = path.join(dir, 'restore')
  const restored = await restoreSnapshot(repo, out, { snapshotId: lastSnapshot })
  let mismatched = 0
  for (const file of org.rows('file')) {
    if (file.deleted_at) continue
    const bytes = fs.readFileSync(path.join(out, 'Main Vault', String(file.file_path)))
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== file.content_hash) mismatched++
  }
  check('latest snapshot restores byte for byte', restored.failed.length === 0 && mismatched === 0, `${restored.files} files, ${mb(restored.bytes)}`)

  const oldest = manifests[0]
  const oldOut = path.join(dir, 'restore-oldest')
  const oldRestore = await restoreSnapshot(repo, oldOut, { snapshotId: oldest.id })
  check('oldest kept snapshot still restores', oldRestore.failed.length === 0, `${oldest.createdAt.slice(0, 10)}, ${oldRestore.files} files`)

  // Damage on purpose: each must be caught.
  const store = repo.store
  const blobKeys = (await store.list('blobs/')).map((b) => b.key)
  const victim = path.join(repoDir, ...blobKeys[0].split('/'))
  const original = fs.readFileSync(victim)
  const flipped = Buffer.from(original)
  flipped[Math.floor(flipped.length / 2)] ^= 1
  fs.writeFileSync(victim, flipped)
  const afterFlip = await verifyRepository(repo, { mode: 'full' })
  check('a flipped bit in the bucket is caught by a full test', !afterFlip.ok && afterFlip.blobsReadFailed.length === 1)
  fs.writeFileSync(victim, original)

  fs.renameSync(victim, `${victim}.moved`)
  const afterLoss = await verifyRepository(repo, { mode: 'quick' })
  check('a lost object is caught by a quick test', !afterLoss.ok && afterLoss.blobsMissing >= 1)
  fs.renameSync(`${victim}.moved`, victim)

  await expectReject(() => BackupRepository.open(new FsObjectStore(repoDir), 'wrong password'), check, 'a wrong password cannot open the repository')

  // New content damaged before its first backup: reported, never stored as good.
  org.checkIn('Parts/fresh.sldprt', seededBytes('fresh', 12_345))
  const freshHash = org.corrupt('Parts/fresh.sldprt')
  const corruptRun = await runServerBackup({ repo, source: org, orgId: org.orgId, trigger: 'sandbox', log: quiet })
  check(
    'new vault content that is already corrupt is reported and not stored',
    corruptRun.problems.some((p) => p.kind === 'corrupt_source') && (await store.head(repo.blobKey(freshHash))) === null,
  )

  // Backed-up content that rots in the live vault: a backup does not re-read it,
  // so the test's live audit must find it, and the backup must still hold good bytes.
  const rotting = org.rows('file').find((f) => !f.deleted_at && f.file_path !== 'Parts/fresh.sldprt')!
  const rotHash = org.corrupt(String(rotting.file_path))
  const audit = await verifyRepository(repo, { mode: 'sample', source: org, sampleSize: org.objects.size })
  check(
    'live vault content damaged after backup is found by a test',
    !audit.ok && !!audit.liveAudit?.corrupt.includes(org.objectName(rotHash)),
    audit.problems.at(-1) ?? '',
  )
  let goodCopy = true
  try {
    await repo.checkBlob(rotHash)
  } catch {
    goodCopy = false
  }
  check('the backup still holds the undamaged bytes of that file', goodCopy)

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. Repository: ${repoDir}`)
  return failed.length === 0
}

async function expectReject(
  fn: () => Promise<unknown>,
  check: (name: string, ok: boolean, detail?: string) => void,
  name: string,
): Promise<void> {
  try {
    await fn()
    check(name, false, 'it opened')
  } catch (err) {
    check(name, true, err instanceof Error ? err.message : String(err))
  }
}

// --- production (read-only) ----------------------------------------------------

function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function orgConfig(admin: SupabaseClient, orgId: string): Promise<ServerBackupConfig> {
  const { data, error } = await admin.from('backup_config').select('*').eq('org_id', orgId).single()
  if (error) throw new Error(`No backup configuration for ${orgId}: ${error.message}`)
  return data as unknown as ServerBackupConfig
}

async function openRepo(admin: SupabaseClient, orgId: string): Promise<BackupRepository> {
  const config = await orgConfig(admin, orgId)
  const repoDir = flag('repo-dir')
  const inner: ObjectStore = repoDir
    ? new FsObjectStore(repoDir)
    : new S3ObjectStore({
        provider: config.provider,
        bucket: config.bucket as string,
        region: config.region,
        endpoint: config.endpoint,
        accessKey: config.access_key_encrypted as string,
        secretKey: config.secret_key_encrypted as string,
        prefix: SERVER_REPOSITORY_PREFIX,
      })
  return BackupRepository.open(new ReadOnlyStore(inner), config.restic_password_encrypted as string)
}

async function dryRun(orgId: string): Promise<boolean> {
  const admin = adminClient()
  const source = new SupabaseBackupSource(admin, orgId, process.env.SUPABASE_URL as string)
  console.log(`Dry run for ${await source.orgName()} (${source.description}). Nothing is written.\n`)
  let rows = 0
  for (const table of BACKUP_TABLES) {
    let count = 0
    let after: string | null = null
    let missing = false
    for (;;) {
      const page = await source.exportTable(table, after, 1000)
      if (page.missing) {
        missing = true
        break
      }
      count += page.rows.length
      if (page.rows.length < 1000) break
      after = String(page.rows[page.rows.length - 1].id)
    }
    rows += count
    console.log(`  ${table.padEnd(36)} ${missing ? 'not installed' : count}`)
  }
  const objects: Array<{ name: string; size: number }> = []
  for (let after: string | null = null; ; ) {
    const page = await source.listObjects(after, 1000)
    objects.push(...page)
    if (page.length < 1000) break
    after = page[page.length - 1].name
  }
  const addressed = objects.filter((o) => hashFromObjectName(o.name))
  const total = addressed.reduce((s, o) => s + Math.max(0, o.size), 0)
  console.log(`\n${rows} rows; ${objects.length} vault objects (${mb(total)}), ${objects.length - addressed.length} not content-addressed`)

  let ok = true
  try {
    const repo = await openRepo(admin, orgId)
    const blobs = await repo.listBlobs()
    const missing = addressed.filter((o) => !blobs.has(repo.blobKey(hashFromObjectName(o.name)!)))
    const bytes = missing.reduce((s, o) => s + Math.max(0, o.size), 0)
    console.log(`Server repository found: a backup now would upload ${missing.length} object(s), ${mb(bytes)}.`)
  } catch (err) {
    console.log(`Server repository: ${err instanceof Error ? err.message : String(err)} (the first backup creates it).`)
  }

  const sample = Number(flag('hash-sample') ?? 20)
  const picks = [...addressed].sort(() => Math.random() - 0.5).slice(0, sample)
  let bad = 0
  for (const object of picks) {
    const hash = crypto.createHash('sha256')
    for await (const chunk of await source.openObject(object.name)) hash.update(chunk as Buffer)
    if (hash.digest('hex') !== hashFromObjectName(object.name)) {
      bad++
      console.log(`  CORRUPT live object: ${object.name}`)
    }
  }
  console.log(`Live vault hash check: ${picks.length - bad}/${picks.length} sampled objects match their names.`)
  if (bad > 0) ok = false
  return ok
}

/**
 * Checks the organization's bucket accepts every call a backup makes: a small put, a multipart put
 * (over the 16 MB part size), list, get, and delete, under a throwaway prefix it removes again.
 * S3-compatible services differ (checksum headers, Content-MD5 on deletes), and this finds out
 * before the first scheduled backup does.
 */
async function probe(orgId: string): Promise<boolean> {
  const config = await orgConfig(adminClient(), orgId)
  const prefix = `blueplm-server-backup-probe/${crypto.randomBytes(6).toString('hex')}`
  const store = new S3ObjectStore({
    provider: config.provider,
    bucket: config.bucket as string,
    region: config.region,
    endpoint: config.endpoint,
    accessKey: config.access_key_encrypted as string,
    secretKey: config.secret_key_encrypted as string,
    prefix,
  })
  console.log(`Probing ${store.description}`)
  const small = crypto.randomBytes(1024)
  const large = crypto.randomBytes(40 * 1024 * 1024)
  const steps: Array<[string, () => Promise<void>]> = [
    ['put small', () => store.put('small', small)],
    ['put multipart (40 MB stream)', () => store.put('large', Readable.from(chunked(large, 1024 * 1024)))],
    ['list', async () => {
      const keys = (await store.list('')).map((k) => `${k.key}:${k.size}`)
      if (keys.join(',') !== `large:${large.length},small:${small.length}`) throw new Error(`listed ${keys.join(',')}`)
    }],
    ['get', async () => {
      if (!(await store.getBuffer('large')).equals(large)) throw new Error('large object came back different')
    }],
    ['delete', () => store.delete(['small', 'large'])],
    ['list after delete', async () => {
      const left = await store.list('')
      if (left.length) throw new Error(`${left.length} object(s) left`)
    }],
  ]
  for (const [name, step] of steps) {
    try {
      await step()
      console.log(`PASS  ${name}`)
    } catch (err) {
      console.log(`FAIL  ${name}: ${err instanceof Error ? err.message : String(err)}`)
      await store.delete(['small', 'large']).catch(() => {})
      return false
    }
  }
  return true
}

function* chunked(buffer: Buffer, size: number): Generator<Buffer> {
  for (let i = 0; i < buffer.length; i += size) yield buffer.subarray(i, i + size)
}

async function main(): Promise<void> {
  let ok = true
  if (command === 'sandbox') ok = await sandbox()
  else if (command === 'probe') {
    const orgId = flag('org')
    if (!orgId) throw new Error('probe needs --org <org id>')
    ok = await probe(orgId)
  } else {
    const orgId = flag('org')
    if (!orgId) throw new Error(`Usage: see the header of api/scripts/backup.ts (--org is required for ${command ?? 'a command'}).`)
    const admin = command === 'dry-run' ? null : adminClient()
    if (command === 'dry-run') ok = await dryRun(orgId)
    else if (command === 'verify') {
      const repo = await openRepo(admin!, orgId)
      const mode = (flag('mode') ?? 'sample') as VerifyMode
      const source = new SupabaseBackupSource(admin!, orgId, process.env.SUPABASE_URL as string)
      const report = await verifyRepository(repo, { mode, source })
      console.log(JSON.stringify(report, null, 2))
      ok = report.ok
    } else if (command === 'list') {
      const repo = await openRepo(admin!, orgId)
      const { manifests, unreadable } = await repo.listSnapshots()
      for (const m of manifests) {
        console.log(`${m.id}  ${m.trigger.padEnd(9)} ${m.objects.count} objects  ${mb(m.objects.bytes)}  ${m.problems.length} problem(s)`)
      }
      for (const u of unreadable) console.log(`${u.id}  UNREADABLE: ${u.error}`)
    } else if (command === 'restore') {
      const to = flag('to')
      if (!to) throw new Error('restore needs --to <folder>')
      const repo = await openRepo(admin!, orgId)
      const result = await restoreSnapshot(repo, to, {
        snapshotId: flag('snapshot'),
        pathPrefix: flag('prefix'),
        metadataOnly: has('metadata-only'),
      })
      console.log(`Restored snapshot ${result.snapshotId}: ${result.files} files, ${mb(result.bytes)}, ${result.tables} tables to ${to}`)
      for (const f of result.failed) console.log(`  FAILED ${f.path}: ${f.error}`)
      ok = result.failed.length === 0
    } else throw new Error(`Unknown command ${command}`)
  }
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(2)
})
