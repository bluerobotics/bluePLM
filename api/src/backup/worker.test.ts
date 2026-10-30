/**
 * The backup worker against the typed in-memory Supabase (src/test/fakeSupabase.ts)
 * and a simulated organization: what runs when, what the app sees in backup_config
 * and backup_history, and that two API replicas never run one organization twice.
 *
 * The schema-501 columns are added to the fake's shape here: the generated types
 * gain them when gen:types runs against a database with 501 applied.
 */

import { describe, expect, it } from 'vitest'

import { FakeSupabase } from '../../../src/test/fakeSupabase.js'
import { seededBytes, SimulatedOrg } from '../../test/backupSim.js'
import { MemoryObjectStore } from './objectStore.js'
import { BackupRepository } from './repository.js'
import { BackupWorker, planJob, type ServerBackupConfig } from './worker.js'

const SCHEMA_501: Record<string, string[]> = {
  backup_config: [
    'run_location',
    'last_scheduled_slot_at',
    'verify_requested_at',
    'verify_requested_by',
    'verify_mode',
    'server_worker_seen_at',
    'server_worker_version',
  ],
  backup_history: ['kind', 'trigger', 'runner', 'report'],
}

function fakeWith501(): FakeSupabase {
  const fake = new FakeSupabase()
  for (const [table, columns] of Object.entries(SCHEMA_501)) {
    const shape = fake.schema.tables.get(table)!
    for (const column of columns) (shape.columns as Set<string>).add(column)
  }
  return fake
}

interface World {
  fake: FakeSupabase
  org: SimulatedOrg
  store: MemoryObjectStore
  clock: { now: number }
  worker: (id?: string) => BackupWorker
  config: () => Record<string, unknown>
  history: () => Array<Record<string, unknown>>
  set: (patch: Record<string, unknown>) => void
  repo: () => Promise<BackupRepository>
}

function world(overrides: Record<string, unknown> = {}): World {
  const fake = fakeWith501()
  const org = new SimulatedOrg()
  for (let i = 0; i < 5; i++) org.checkIn(`Parts/p${i}.sldprt`, seededBytes(`w${i}`, 2000 + i))
  const store = new MemoryObjectStore()
  const clock = { now: Date.parse('2026-07-01T12:00:00Z') }
  fake.rows('backup_config').push({
    id: 'cfg-1',
    org_id: org.orgId,
    provider: 'backblaze_b2',
    bucket: 'acme-backups',
    region: null,
    endpoint: null,
    access_key_encrypted: 'key',
    secret_key_encrypted: 'secret',
    restic_password_encrypted: 'pw',
    is_schedule_enabled: true,
    schedule_hour: 2,
    schedule_minute: 0,
    schedule_timezone: 'UTC',
    retention_daily: 7,
    retention_weekly: 4,
    retention_monthly: 3,
    retention_yearly: 1,
    backup_requested_at: null,
    backup_requested_by: null,
    backup_started_at: null,
    run_location: 'server',
    last_scheduled_slot_at: '2026-07-01T02:00:00.000Z',
    verify_requested_at: null,
    verify_requested_by: null,
    verify_mode: null,
    server_worker_seen_at: null,
    server_worker_version: null,
    ...overrides,
  })
  const config = () => fake.rows('backup_config')[0]
  return {
    fake,
    org,
    store,
    clock,
    config,
    history: () => fake.rows('backup_history'),
    set: (patch) => Object.assign(config(), patch),
    worker: (id = 'server:test') =>
      new BackupWorker({
        admin: fake.client as never,
        openStore: () => store,
        openSource: () => org,
        now: () => new Date(clock.now),
        instanceId: id,
        version: '3.1.0',
        postBackupSampleSize: 3,
        progressIntervalMs: 0,
      }),
    repo: () => BackupRepository.open(store, 'pw'),
  }
}

async function tick(worker: BackupWorker): Promise<void> {
  await worker.tick()
  await worker.idle()
}

describe('planJob', () => {
  const base = world().config() as unknown as ServerBackupConfig
  const now = new Date('2026-07-01T12:00:00Z')

  it('does nothing for a desktop-run or incomplete configuration', () => {
    expect(planJob({ ...base, run_location: 'desktop', backup_requested_at: now.toISOString() }, now)).toBeNull()
    expect(planJob({ ...base, restic_password_encrypted: null, backup_requested_at: now.toISOString() }, now)).toBeNull()
  })

  it('puts a requested backup before a due slot, and a due slot before a requested test', () => {
    const due = { ...base, last_scheduled_slot_at: '2026-06-30T02:00:00.000Z', verify_requested_at: now.toISOString() }
    expect(planJob({ ...due, backup_requested_at: now.toISOString() }, now)).toMatchObject({ kind: 'backup', trigger: 'manual' })
    expect(planJob(due, now)).toMatchObject({ kind: 'backup', trigger: 'scheduled' })
    expect(planJob({ ...base, verify_requested_at: now.toISOString(), verify_mode: 'full' }, now)).toMatchObject({
      kind: 'verify',
      verifyMode: 'full',
    })
  })
})

describe('BackupWorker', () => {
  it('runs a missed nightly slot once, with no desktop, and records it for the app', async () => {
    const w = world({ last_scheduled_slot_at: '2026-06-28T02:00:00.000Z' })
    const worker = w.worker()
    await tick(worker)

    expect(w.history()).toHaveLength(1)
    expect(w.history()[0]).toMatchObject({ kind: 'backup', trigger: 'scheduled', runner: 'server', status: 'completed' })
    expect(w.history()[0].files_total).toBe(5)
    expect(w.config()).toMatchObject({
      last_scheduled_slot_at: '2026-07-01T02:00:00.000Z',
      backup_started_at: null,
      server_worker_seen_at: '2026-07-01T12:00:00.000Z',
      server_worker_version: '3.1.0',
    })
    expect(w.fake.rows('backup_lock')).toHaveLength(0)
    const report = w.history()[0].report as { verify: { ok: boolean; blobsRead: number } }
    expect(report.verify).toMatchObject({ ok: true, blobsRead: 3 })
    expect((await (await w.repo()).listSnapshots()).manifests).toHaveLength(1)

    // Not again the same day; again the next night.
    w.clock.now += 60_000
    await tick(worker)
    expect(w.history()).toHaveLength(1)
    w.clock.now = Date.parse('2026-07-02T02:00:30Z')
    await tick(worker)
    expect(w.history()).toHaveLength(2)
  })

  it('records its progress on the running history row, then replaces it with the result', async () => {
    const w = world({ backup_requested_at: '2026-07-01T11:59:00Z' })
    const seen: Array<Record<string, unknown> | undefined> = []
    const open = w.org.openObject.bind(w.org)
    w.org.openObject = async (name: string) => {
      const report = w.fake.rows('backup_history')[0]?.report as { progress?: Record<string, unknown> } | null
      seen.push(report?.progress)
      return open(name)
    }
    await tick(w.worker())
    expect(seen.some((p) => p?.phase === 'objects' && p.total === 5)).toBe(true)
    expect(w.history()[0].status).toBe('completed')
    expect(w.history()[0].report).not.toHaveProperty('progress')
  })

  it('leaves a desktop-run organization alone', async () => {
    const w = world({ run_location: 'desktop', last_scheduled_slot_at: null, backup_requested_at: '2026-07-01T11:00:00Z' })
    await tick(w.worker())
    expect(w.history()).toHaveLength(0)
    expect(w.config().server_worker_seen_at).toBeNull()
  })

  it('runs a requested backup and clears the request', async () => {
    const w = world({ backup_requested_at: '2026-07-01T11:59:00Z', backup_requested_by: 'admin@example.test' })
    await tick(w.worker())
    expect(w.history()[0]).toMatchObject({ trigger: 'manual', status: 'completed' })
    expect(w.config().backup_requested_at).toBeNull()
  })

  it('runs a requested test and reports a damaged backup as failed', async () => {
    const w = world({ backup_requested_at: '2026-07-01T11:59:00Z' })
    const worker = w.worker()
    await tick(worker)

    w.set({ verify_requested_at: '2026-07-01T12:05:00Z', verify_mode: 'full' })
    await tick(worker)
    expect(w.history()[1]).toMatchObject({ kind: 'verify', status: 'completed' })
    expect(w.config().verify_requested_at).toBeNull()

    const repo = await w.repo()
    const victim = String(w.org.rows('file')[2].content_hash)
    w.store.objects.get(repo.blobKey(victim))![50] ^= 1
    w.set({ verify_requested_at: '2026-07-01T12:10:00Z', verify_mode: 'full' })
    await tick(worker)
    expect(w.history()[2]).toMatchObject({ kind: 'verify', status: 'failed' })
    expect(String(w.history()[2].error_message)).toMatch(/could not be restored intact/)
  })

  it('marks a backup with a corrupt vault object as a warning, naming it', async () => {
    const w = world({ backup_requested_at: '2026-07-01T11:59:00Z' })
    w.org.corrupt('Parts/p1.sldprt')
    await tick(w.worker())
    expect(w.history()[0].status).toBe('warning')
    expect(String(w.history()[0].error_message)).toMatch(/no longer match their content hash/)
  })

  it('reports a backup that cannot reach its bucket as failed, and does not retry it every minute', async () => {
    const w = world({ last_scheduled_slot_at: '2026-06-30T02:00:00.000Z' })
    const worker = new BackupWorker({
      admin: w.fake.client as never,
      openStore: () => {
        throw new Error('InvalidAccessKeyId')
      },
      openSource: () => w.org,
      now: () => new Date(w.clock.now),
    })
    await tick(worker)
    w.clock.now += 60_000
    await tick(worker)
    expect(w.history()).toHaveLength(1)
    expect(w.history()[0]).toMatchObject({ status: 'failed', error_message: 'InvalidAccessKeyId' })
    expect(w.fake.rows('backup_lock')).toHaveLength(0)
  })

  it('runs an organization on one replica only', async () => {
    const w = world({ backup_requested_at: '2026-07-01T11:59:00Z' })
    const a = w.worker('server:a')
    const b = w.worker('server:b')
    await Promise.all([a.tick(), b.tick()])
    await Promise.all([a.idle(), b.idle()])
    expect(w.history()).toHaveLength(1)
  })

  it('takes over an expired lock, and leaves a live one alone', async () => {
    const w = world({ backup_requested_at: '2026-07-01T11:59:00Z' })
    w.fake.rows('backup_lock').push({
      id: 'held',
      org_id: w.org.orgId,
      locked_by_machine_id: 'server:other',
      locked_by_machine_name: 'BluePLM server',
      locked_at: '2026-07-01T11:58:00.000Z',
      expires_at: '2026-07-01T12:08:00.000Z',
      backup_history_id: null,
    })
    const worker = w.worker()
    await tick(worker)
    expect(w.history()).toHaveLength(0)
    w.clock.now = Date.parse('2026-07-01T12:09:00Z')
    await tick(worker)
    expect(w.history()).toHaveLength(1)
  })

  it('closes a backup interrupted by a restart and resumes it, reusing what it stored', async () => {
    const w = world({ backup_started_at: '2026-07-01T11:00:00.000Z' })
    w.fake.rows('backup_history').push({
      id: 'stale',
      org_id: w.org.orgId,
      started_at: '2026-07-01T11:00:00.000Z',
      status: 'running',
      machine_id: 'server:dead',
      machine_name: 'BluePLM server',
      kind: 'backup',
      trigger: 'scheduled',
      runner: 'server',
    })
    const worker = w.worker()
    await tick(worker)
    expect(w.history()[0]).toMatchObject({ status: 'failed', error_details: { interrupted: true } })
    expect(w.config().backup_requested_at).toBe('2026-07-01T12:00:00.000Z')
    await tick(worker)
    expect(w.history()[1]).toMatchObject({ trigger: 'manual', status: 'completed' })
  })
})
