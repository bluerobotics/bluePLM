/**
 * Server backups end to end, in an isolated environment: a simulated
 * organization (api/test/backupSim.ts) backed up into an in-memory or on-disk
 * repository, then tampered with, verified, pruned and restored. Nothing here
 * reaches a network or a real Supabase.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { seededBytes, SimulatedOrg } from '../../test/backupSim.js'
import { BackupPasswordError } from './crypto.js'
import { runServerBackup, seriousProblems } from './engine.js'
import { FsObjectStore, MemoryObjectStore, type ObjectStore } from './objectStore.js'
import { BackupRepository } from './repository.js'
import { restoreSnapshot } from './restore.js'
import { applyRetention, planRetention } from './retention.js'
import { verifyRepository } from './verify.js'

const PASSWORD = 'correct horse battery staple'
// A cheap KDF for tests; production uses scrypt N=2^15.
const FAST_KDF = { N: 1024 }

async function newRepo(store: ObjectStore = new MemoryObjectStore()): Promise<BackupRepository> {
  return BackupRepository.init(store, PASSWORD, FAST_KDF)
}

function backup(repo: BackupRepository, org: SimulatedOrg, at?: Date) {
  return runServerBackup({
    repo,
    source: org,
    orgId: org.orgId,
    trigger: 'sandbox',
    now: at ? () => at : undefined,
    retryDelayMs: 1,
    pageSize: 7,
  })
}

function seedOrg(files = 12): SimulatedOrg {
  const org = new SimulatedOrg()
  for (let i = 0; i < files; i++) org.checkIn(`Parts/part-${i}.sldprt`, seededBytes(`p${i}`, 1000 + i * 3001))
  org.checkIn('Assemblies/top.sldasm', seededBytes('top', 50_000))
  org.checkIn('Empty.txt', Buffer.alloc(0))
  return org
}

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blueplm-backup-test-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('repository and encryption', () => {
  it('opens only with the right password', async () => {
    const store = new MemoryObjectStore()
    await newRepo(store)
    await expect(BackupRepository.open(store, 'wrong')).rejects.toBeInstanceOf(BackupPasswordError)
    await expect(BackupRepository.open(store, PASSWORD)).resolves.toBeInstanceOf(BackupRepository)
  })

  it('stores nothing readable in the clear and names blobs by HMAC, not by content hash', async () => {
    const store = new MemoryObjectStore()
    const repo = await newRepo(store)
    const org = seedOrg(2)
    await backup(repo, org)
    const marker = Buffer.from(org.name)
    for (const [key, bytes] of store.objects) {
      if (key === 'config.json') continue
      expect(bytes.includes(marker), key).toBe(false)
      for (const object of org.objects.keys()) expect(key.includes(object.split('/').pop()!)).toBe(false)
    }
  })

  it('refuses a blob copied over another blob', async () => {
    const store = new MemoryObjectStore()
    const repo = await newRepo(store)
    const org = seedOrg(2)
    await backup(repo, org)
    const [a, b] = org.rows('file').map((f) => String(f.content_hash))
    store.objects.set(repo.blobKey(b), store.objects.get(repo.blobKey(a))!)
    await expect(repo.checkBlob(b)).rejects.toThrow(/authentication/)
    await expect(repo.checkBlob(a)).resolves.toBeDefined()
  })
})

describe('backup and restore', () => {
  it('restores every file byte for byte and every table row', async () => {
    const repo = await newRepo(new FsObjectStore(path.join(tmp, 'repo')))
    const org = seedOrg()
    const run = await backup(repo, org)
    expect(seriousProblems(run.problems)).toEqual([])
    expect(run.stats.objectsUploaded).toBe(org.objects.size)

    const out = path.join(tmp, 'restore')
    const restored = await restoreSnapshot(repo, out)
    expect(restored.failed).toEqual([])
    expect(restored.files).toBe(org.rows('file').length)
    for (const file of org.rows('file')) {
      const bytes = fs.readFileSync(path.join(out, 'Main Vault', String(file.file_path)))
      expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(file.content_hash)
    }
    const versions = JSON.parse(fs.readFileSync(path.join(out, '_blueplm-backup', 'file_version.json'), 'utf8'))
    expect(versions).toHaveLength(org.rows('file_version').length)
  })

  it('is incremental: a second backup uploads only new content', async () => {
    const repo = await newRepo()
    const org = seedOrg()
    await backup(repo, org)
    const readsBefore = org.reads
    org.checkIn('Parts/part-0.sldprt', seededBytes('p0-v2', 4000))
    org.checkIn('Parts/new.sldprt', seededBytes('new', 9000))
    const second = await backup(repo, org)
    expect(second.stats.objectsUploaded).toBe(2)
    expect(second.stats.objectsReused).toBe(org.objects.size - 2)
    expect(org.reads - readsBefore).toBe(2)
  })

  it('keeps old versions restorable from the snapshot that had them', async () => {
    const repo = await newRepo()
    const org = seedOrg(1)
    const v1 = org.file('Parts/part-0.sldprt')!.content_hash as string
    const first = await backup(repo, org)
    org.checkIn('Parts/part-0.sldprt', seededBytes('v2', 2222))
    await backup(repo, org)
    const out = path.join(tmp, 'old')
    await restoreSnapshot(repo, out, { snapshotId: first.snapshotId })
    const bytes = fs.readFileSync(path.join(out, 'Main Vault', 'Parts', 'part-0.sldprt'))
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(v1)
  })

  it('never stores a corrupt vault object, reports it, and an earlier snapshot keeps the good bytes', async () => {
    const repo = await newRepo()
    const org = seedOrg(3)
    org.checkIn('Parts/fragile.sldprt', seededBytes('fragile-v1', 3000))
    const good = await backup(repo, org)

    org.checkIn('Parts/fragile.sldprt', seededBytes('fragile-v2', 3000))
    const damagedHash = org.corrupt('Parts/fragile.sldprt')
    const run = await backup(repo, org)
    expect(run.problems.map((p) => p.kind)).toEqual(['corrupt_source'])
    expect(await repo.store.head(repo.blobKey(damagedHash))).toBeNull()
    const verify = await verifyRepository(repo, { mode: 'full' })
    expect(verify.ok).toBe(true)

    const out = path.join(tmp, 'good')
    const restored = await restoreSnapshot(repo, out, { snapshotId: good.snapshotId })
    expect(restored.failed).toEqual([])
  })

  it('reports a corrupt object without crashing when the store starts reading late (filesystem)', async () => {
    // Regression: the hash check failed before the filesystem store attached to the sealed
    // stream, and the stream's error was unhandled, which kills the process.
    const repo = await newRepo(new FsObjectStore(path.join(tmp, 'repo')))
    const org = seedOrg(1)
    org.checkIn('Parts/bad.sldprt', seededBytes('bad', 100))
    org.corrupt('Parts/bad.sldprt')
    const run = await backup(repo, org)
    expect(run.problems.map((p) => p.kind)).toEqual(['corrupt_source'])
    expect(fs.readdirSync(path.join(tmp, 'repo'), { recursive: true }).some((f) => String(f).endsWith('.partial'))).toBe(false)
  })

  it('backs up an object not named by its hash (the organization logo) under the hash of its bytes', async () => {
    const repo = await newRepo()
    const org = seedOrg(1)
    const logo = seededBytes('logo', 4321)
    org.objects.set(`${org.orgId}/_assets/logo.png`, logo)
    const run = await backup(repo, org)
    expect(run.problems).toEqual([])
    const entry = (await repo.readObjects(run.manifest)).find((e) => e.name.endsWith('_assets/logo.png'))
    expect(entry).toMatchObject({ size: logo.length, hash: crypto.createHash('sha256').update(logo).digest('hex') })
    await expect(repo.checkBlob(entry!.hash)).resolves.toEqual({ size: logo.length })
    expect((await backup(repo, org)).stats.objectsUploaded).toBe(0)
  })

  it('reports a damaged object once; later runs list it as known and are not warnings', async () => {
    const repo = await newRepo()
    const org = seedOrg(2)
    org.checkIn('Parts/old.sldprt', seededBytes('old', 2000))
    org.corrupt('Parts/old.sldprt')
    const first = await backup(repo, org, new Date('2026-10-30T09:00:00Z'))
    expect(seriousProblems(first.problems)).toHaveLength(1)
    const second = await backup(repo, org, new Date('2026-10-31T09:00:00Z'))
    expect(second.problems).toEqual([expect.objectContaining({ kind: 'corrupt_source', known: true })])
    expect(seriousProblems(second.problems)).toEqual([])
  })

  it('retries a read that fails once, and reports one that keeps failing', async () => {
    const repo = await newRepo()
    const org = seedOrg(2)
    const names = [...org.objects.keys()]
    org.failReads(names[0], 1)
    org.failReads(names[1], 10)
    const run = await backup(repo, org)
    expect(run.problems).toEqual([expect.objectContaining({ kind: 'unreadable_source', name: names[1] })])
    expect(await repo.store.head(repo.blobKey(names[0].split('/').pop()!))).not.toBeNull()
  })

  it('commits nothing when a table cannot be exported', async () => {
    const repo = await newRepo()
    const org = seedOrg(2)
    org.failTable('file_version')
    await expect(backup(repo, org)).rejects.toThrow(/file_version/)
    expect((await repo.listSnapshots()).manifests).toHaveLength(0)
  })

  it('records a table whose module is not installed, by name', async () => {
    const repo = await newRepo()
    const org = seedOrg(1)
    org.dropModule('eco')
    const run = await backup(repo, org)
    expect(run.manifest.tablesMissing).toEqual(['eco'])
    expect(seriousProblems(run.problems)).toEqual([])
  })

  it('resumes after an interrupted run: stored blobs are reused, the half snapshot is cleaned later', async () => {
    const repo = await newRepo()
    const org = seedOrg(6)
    const names = [...org.objects.keys()]
    // A run that stored three blobs and then died before its manifest: run it with every
    // later read failing, then remove the manifest it wrote, which leaves exactly the
    // state a killed process leaves.
    const original = org.openObject.bind(org)
    let opened = 0
    org.openObject = async (name: string) => {
      if (++opened > 3) throw new Error('process killed')
      return original(name)
    }
    await runServerBackup({ repo, source: org, orgId: org.orgId, trigger: 'sandbox', attempts: 1, concurrency: 1 })
    const { manifests } = await repo.listSnapshots()
    await repo.store.delete([`snapshots/${manifests[0].id}/manifest.bin`])
    org.openObject = original

    const readsBefore = org.reads
    const resumed = await backup(repo, org)
    expect(resumed.stats.objectsReused).toBe(3)
    expect(org.reads - readsBefore).toBe(names.length - 3)

    const prune = await applyRetention(repo, { daily: 7, weekly: 0, monthly: 0, yearly: 0 }, { now: new Date(Date.now() + 2 * 86400000) })
    expect(prune.incompleteRemoved).toEqual([manifests[0].id])
  })
})

describe('testing a backup (verify)', () => {
  it('finds live vault content that rotted after it was backed up', async () => {
    const repo = await newRepo()
    const org = seedOrg(4)
    await backup(repo, org)
    const hash = org.corrupt('Parts/part-2.sldprt')
    // A backup does not re-read content it holds, so it cannot see this...
    expect(seriousProblems((await backup(repo, org)).problems)).toEqual([])
    // ...the test's live audit can, and the backup still has the good bytes.
    const report = await verifyRepository(repo, { mode: 'sample', source: org, sampleSize: org.objects.size })
    expect(report.liveAudit?.corrupt).toEqual([org.objectName(hash)])
    expect(report.problems.at(-1)).toMatch(/1 restorable/)
    await expect(repo.checkBlob(hash)).resolves.toBeDefined()
  })

  it('passes a healthy repository in every mode, and reports drift against the live vault', async () => {
    const repo = await newRepo()
    const org = seedOrg()
    await backup(repo, org)
    org.checkIn('Parts/after.sldprt', seededBytes('after', 100))
    for (const mode of ['quick', 'sample', 'full'] as const) {
      const report = await verifyRepository(repo, { mode, source: org, sampleSize: 5 })
      expect(report.ok, JSON.stringify(report.problems)).toBe(true)
      expect(report.drift).toEqual({ liveObjects: org.objects.size, notYetBackedUp: 1, onlyInBackup: 0 })
    }
    const sample = await verifyRepository(repo, { mode: 'sample', sampleSize: 5 })
    expect(sample.blobsRead).toBe(5)
    const full = await verifyRepository(repo, { mode: 'full' })
    expect(full.blobsRead).toBe(full.blobsReferenced)
  })

  it('finds a deleted blob in quick mode', async () => {
    const store = new MemoryObjectStore()
    const repo = await newRepo(store)
    const org = seedOrg()
    await backup(repo, org)
    const victim = String(org.rows('file')[0].content_hash)
    await store.delete([repo.blobKey(victim)])
    const report = await verifyRepository(repo, { mode: 'quick' })
    expect(report.ok).toBe(false)
    expect(report.blobsMissing).toBe(1)
  })

  it('finds a flipped bit inside a blob when it reads it back', async () => {
    const store = new MemoryObjectStore()
    const repo = await newRepo(store)
    const org = seedOrg()
    await backup(repo, org)
    const victim = String(org.rows('file')[1].content_hash)
    const sealed = store.objects.get(repo.blobKey(victim))!
    sealed[40] ^= 0x01
    expect((await verifyRepository(repo, { mode: 'quick' })).ok).toBe(true) // size is unchanged
    const full = await verifyRepository(repo, { mode: 'full' })
    expect(full.ok).toBe(false)
    expect(full.blobsReadFailed.map((f) => f.name)).toEqual([org.objectName(victim)])
  })

  it('finds a damaged database table part', async () => {
    const store = new MemoryObjectStore()
    const repo = await newRepo(store)
    await backup(repo, seedOrg(2))
    const key = [...store.objects.keys()].find((k) => k.endsWith('tables/file.bin'))!
    store.objects.get(key)![30] ^= 0x01
    const report = await verifyRepository(repo, { mode: 'quick' })
    expect(report.ok).toBe(false)
    expect(report.partsFailed.map((p) => p.part)).toEqual([key])
  })

  it('says so when there is nothing to test', async () => {
    const report = await verifyRepository(await newRepo(), { mode: 'quick' })
    expect(report.ok).toBe(false)
    expect(report.problems).toEqual(['The repository has no snapshot yet.'])
  })
})

describe('retention', () => {
  it('keeps restic-style daily, weekly, monthly and yearly snapshots', () => {
    const start = Date.parse('2025-01-01T02:00:00Z')
    const manifests = Array.from({ length: 400 }, (_, i) => ({
      id: `s${i}`,
      createdAt: new Date(start + i * 86400000).toISOString(),
    })) as unknown as Parameters<typeof planRetention>[0]
    const plan = planRetention(manifests, { daily: 7, weekly: 4, monthly: 6, yearly: 2 })
    // Last day 2026-02-04. 7 days (Jan 29 - Feb 4); weeks add Jan 25 and Jan 18 (Feb 1 is a
    // kept day); months add Dec 31, Nov 30, Oct 31, Sep 30 (Jan 31 is a kept day); the
    // years are Feb 4 and Dec 31, both kept already.
    expect(plan.keep.map((s) => s.id)).toEqual([
      's399', 's398', 's397', 's396', 's395', 's394', 's393',
      's389', 's382',
      's364', 's333', 's303', 's272',
    ])
    expect(plan.keep.some((s) => s.createdAt.startsWith('2025-12-31'))).toBe(true)
    expect(plan.keep.length + plan.forget.length).toBe(400)
  })

  it('a year of daily backups: prunes only unreferenced content and every kept snapshot still restores', async () => {
    const repo = await newRepo()
    const org = seedOrg(3)
    const start = Date.parse('2026-01-01T03:00:00Z')
    for (let day = 0; day < 120; day++) {
      const at = new Date(start + day * 86400000)
      org.now = () => at
      if (day % 3 === 0) org.checkIn(`Parts/part-${day % 4}.sldprt`, seededBytes(`d${day}`, 500 + day))
      await backup(repo, org, at)
      await applyRetention(repo, { daily: 5, weekly: 3, monthly: 2, yearly: 1 }, { now: at })
    }
    const { manifests } = await repo.listSnapshots()
    expect(manifests.length).toBeLessThanOrEqual(5 + 3 + 2 + 1)
    const report = await verifyRepository(repo, { mode: 'full' })
    expect(report.ok, JSON.stringify(report.problems)).toBe(true)
    const referenced = report.blobsReferenced
    expect((await repo.listBlobs()).size).toBe(referenced)
  })

  it('deletes no blob when a kept snapshot cannot be read', async () => {
    const store = new MemoryObjectStore()
    const repo = await newRepo(store)
    const org = seedOrg(2)
    const first = await backup(repo, org, new Date('2026-01-01T00:00:00Z'))
    org.checkIn('Parts/x.sldprt', seededBytes('x', 10))
    await backup(repo, org, new Date('2026-01-02T00:00:00Z'))
    store.objects.get(`snapshots/${first.snapshotId}/manifest.bin`)![20] ^= 1
    const blobsBefore = (await repo.listBlobs()).size
    const result = await applyRetention(repo, { daily: 1, weekly: 0, monthly: 0, yearly: 0 })
    expect(result.skipped).toMatch(/could not be read/)
    expect((await repo.listBlobs()).size).toBe(blobsBefore)
  })
})

describe('object stores', () => {
  for (const [label, make] of [
    ['memory', () => new MemoryObjectStore()],
    ['filesystem', () => new FsObjectStore(path.join(tmp, 'store'))],
  ] as const) {
    it(`${label}: a stream that fails part-way commits nothing`, async () => {
      const store = make()
      const failing = new Readable({
        read() {
          this.push(Buffer.from('partial'))
          this.destroy(new Error('connection reset'))
        },
      })
      await expect(store.put('a/b', failing)).rejects.toThrow(/connection reset/)
      expect(await store.head('a/b')).toBeNull()
      expect(await store.list('')).toEqual([])
    })

    it(`${label}: put, list, get and delete`, async () => {
      const store = make()
      await store.put('x/2', Buffer.from('two'))
      await store.put('x/1', Readable.from([Buffer.from('o'), Buffer.from('ne')]))
      await store.put('y/1', Buffer.from('other'))
      expect(await store.list('x/')).toEqual([
        { key: 'x/1', size: 3 },
        { key: 'x/2', size: 3 },
      ])
      expect((await store.getBuffer('x/1')).toString()).toBe('one')
      await store.delete(['x/1'])
      await expect(store.getBuffer('x/1')).rejects.toThrow(/not found/)
    })
  }
})
