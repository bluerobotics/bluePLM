/**
 * The API's backup worker: scheduled and requested backups, and backup tests,
 * for every organization whose backup_config.run_location is 'server'. No
 * desktop needs to be on.
 *
 * Each minute it:
 * 1. stamps `server_worker_seen_at` on every server-run configuration, so the
 *    app can tell an admin whether a worker is alive;
 * 2. if it is not already running a job, picks one per organization in this
 *    order: a requested backup, a due scheduled slot (`schedule.ts`; a missed
 *    slot is caught up once), a requested test;
 * 3. claims the organization's row in backup_locks (unique per org; an expired
 *    lease may be taken over), so two API replicas never run the same
 *    organization at once, and renews the lease while the job runs;
 * 4. writes a backup_history row (kind, trigger, runner 'server', report) and
 *    clears the request, or records the slot, before running, so a job that
 *    keeps failing is reported once per request or slot, not every minute.
 *
 * A backup is followed by retention (backup_config's daily/weekly/monthly/yearly
 * counts) and a sample verify of the snapshot it just wrote plus a hash check of
 * a sample of the live vault, so every scheduled backup is also a small restore
 * test and a small audit of the vault itself.
 */

import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { runServerBackup, seriousProblems, silentLogger, type BackupLogger } from './engine.js'
import type { ObjectStore } from './objectStore.js'
import { BackupRepository } from './repository.js'
import { applyRetention, type PruneResult } from './retention.js'
import { dueSlot } from './schedule.js'
import type { BackupSource } from './source.js'
import { verifyRepository, type VerifyMode, type VerifyReport } from './verify.js'

/** The backup_config columns the worker reads. The 113 columns are not in the generated types yet. */
export interface ServerBackupConfig {
  org_id: string
  provider: string
  bucket: string | null
  region: string | null
  endpoint: string | null
  access_key_encrypted: string | null
  secret_key_encrypted: string | null
  restic_password_encrypted: string | null
  schedule_enabled: boolean | null
  schedule_hour: number | null
  schedule_minute: number | null
  schedule_timezone: string | null
  retention_daily: number | null
  retention_weekly: number | null
  retention_monthly: number | null
  retention_yearly: number | null
  backup_requested_at: string | null
  backup_requested_by: string | null
  backup_running_since: string | null
  run_location: string
  last_scheduled_slot: string | null
  verify_requested_at: string | null
  verify_requested_by: string | null
  verify_mode: string | null
}

export type JobKind = 'backup' | 'verify'

export interface PlannedJob {
  kind: JobKind
  trigger: 'scheduled' | 'manual'
  slot: number | null
  verifyMode: VerifyMode
  requestedBy: string | null
}

export interface BackupWorkerDeps {
  admin: SupabaseClient
  /** The bucket for a configuration (S3 in production). */
  openStore: (config: ServerBackupConfig) => ObjectStore | Promise<ObjectStore>
  openSource: (orgId: string) => BackupSource
  log?: BackupLogger
  now?: () => Date
  version?: string
  instanceId?: string
  /** Lease on the organization's lock; renewed every `leaseSeconds / 3`. */
  leaseSeconds?: number
  postBackupSampleSize?: number
}

const CONFIG_COLUMNS =
  'org_id, provider, bucket, region, endpoint, access_key_encrypted, secret_key_encrypted, ' +
  'restic_password_encrypted, schedule_enabled, schedule_hour, schedule_minute, schedule_timezone, ' +
  'retention_daily, retention_weekly, retention_monthly, retention_yearly, backup_requested_at, ' +
  'backup_requested_by, backup_running_since, run_location, last_scheduled_slot, verify_requested_at, ' +
  'verify_requested_by, verify_mode'

export function isServerConfigComplete(config: ServerBackupConfig): boolean {
  return !!(config.bucket && config.access_key_encrypted && config.secret_key_encrypted && config.restic_password_encrypted)
}

/** What, if anything, to run for this configuration now. Pure; exported for tests. */
export function planJob(config: ServerBackupConfig, now: Date): PlannedJob | null {
  if (config.run_location !== 'server' || !isServerConfigComplete(config)) return null
  if (config.backup_requested_at) {
    return { kind: 'backup', trigger: 'manual', slot: null, verifyMode: 'sample', requestedBy: config.backup_requested_by }
  }
  const slot = dueSlot(
    {
      enabled: !!config.schedule_enabled,
      hour: config.schedule_hour ?? 0,
      minute: config.schedule_minute ?? 0,
      timezone: config.schedule_timezone || 'UTC',
    },
    now.getTime(),
    config.last_scheduled_slot,
  )
  if (slot !== null) return { kind: 'backup', trigger: 'scheduled', slot, verifyMode: 'sample', requestedBy: null }
  if (config.verify_requested_at) {
    const mode: VerifyMode = config.verify_mode === 'quick' || config.verify_mode === 'full' ? config.verify_mode : 'sample'
    return { kind: 'verify', trigger: 'manual', slot: null, verifyMode: mode, requestedBy: config.verify_requested_by }
  }
  return null
}

export class BackupWorker {
  private readonly log: BackupLogger
  private readonly now: () => Date
  private readonly instanceId: string
  private readonly leaseSeconds: number
  private busy: Promise<void> | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly deps: BackupWorkerDeps) {
    this.log = deps.log ?? silentLogger
    this.now = deps.now ?? (() => new Date())
    this.instanceId = deps.instanceId ?? `server:${crypto.randomBytes(4).toString('hex')}`
    this.leaseSeconds = deps.leaseSeconds ?? 600
  }

  start(intervalMs = 60_000): void {
    if (this.timer) return
    const run = () => {
      this.tick().catch((err) => this.log.error('backup worker: tick failed', { error: errorText(err) }))
    }
    // First tick shortly after boot, not during it.
    setTimeout(run, 5_000).unref()
    this.timer = setInterval(run, intervalMs)
    this.timer.unref()
  }

  /** Stops scheduling new ticks; a job in flight keeps running. */
  halt(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Stops scheduling and waits for a job in flight. */
  async stop(): Promise<void> {
    this.halt()
    await this.busy
  }

  /** The job in flight, if any; tests await it. */
  idle(): Promise<void> {
    return this.busy ?? Promise.resolve()
  }

  /** One pass: heartbeat every server-run organization, then start at most one job if idle. */
  async tick(): Promise<void> {
    const configs = await this.loadConfigs()
    const seenAt = this.now().toISOString()
    if (configs.length > 0) {
      const { error } = await this.untyped()
        .from('backup_config')
        .update({ server_worker_seen_at: seenAt, server_worker_version: this.deps.version ?? null })
        .eq('run_location', 'server')
      if (error) this.log.warn('backup worker: heartbeat failed', { error: error.message })
    }
    if (this.busy) return
    for (const config of configs) {
      if (config.backup_running_since) {
        await this.recoverInterrupted(config)
        continue
      }
      const job = planJob(config, this.now())
      if (!job) continue
      const lockId = await this.claim(config.org_id)
      if (!lockId) continue
      this.busy = this.runJob(config, job, lockId).finally(() => {
        this.busy = null
      })
      return
    }
  }

  private untyped(): SupabaseClient {
    // The schema-113 columns are not in the generated Database type until gen:types runs against 113.
    return this.deps.admin as unknown as SupabaseClient
  }

  private async loadConfigs(): Promise<ServerBackupConfig[]> {
    const { data, error } = await this.untyped().from('backup_config').select(CONFIG_COLUMNS).eq('run_location', 'server')
    if (error) {
      this.log.error('backup worker: could not read backup_config', { error: error.message })
      return []
    }
    return (data ?? []) as unknown as ServerBackupConfig[]
  }

  /**
   * A job marked running with no live lock was interrupted (a deploy or crash
   * killed the process). Its history rows are closed as failed, and an
   * interrupted backup is requested again so the day is not lost: blobs it
   * already stored are reused, so the rerun continues rather than restarts.
   * At most three resumes a day, so a backup that kills the process every time
   * is reported instead of looping.
   */
  private async recoverInterrupted(config: ServerBackupConfig): Promise<void> {
    const db = this.untyped()
    const now = this.now()
    const { data: live, error: lockError } = await db
      .from('backup_locks')
      .select('id')
      .eq('org_id', config.org_id)
      .gt('expires_at', now.toISOString())
    if (lockError || (live ?? []).length > 0) return

    const { data: stale } = await db
      .from('backup_history')
      .select('id, kind')
      .eq('org_id', config.org_id)
      .eq('status', 'running')
      .eq('runner', 'server')
    const staleRows = (stale ?? []) as Array<{ id: string; kind: string }>
    for (const row of staleRows) {
      await db
        .from('backup_history')
        .update({
          status: 'failed',
          completed_at: now.toISOString(),
          error_message: 'Interrupted: the server stopped while this was running.',
          error_details: { interrupted: true },
        })
        .eq('id', row.id)
    }

    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await db
      .from('backup_history')
      .select('id, error_details')
      .eq('org_id', config.org_id)
      .eq('kind', 'backup')
      .gte('started_at', since)
    const interruptions = ((recent ?? []) as Array<{ error_details: { interrupted?: boolean } | null }>).filter(
      (row) => row.error_details?.interrupted,
    ).length
    const resume = staleRows.some((row) => row.kind === 'backup') && interruptions <= 3
    const patch: Record<string, unknown> = { backup_running_since: null }
    if (resume) {
      patch.backup_requested_at = now.toISOString()
      patch.backup_requested_by = 'BluePLM server (resuming an interrupted backup)'
    }
    await db.from('backup_config').update(patch).eq('org_id', config.org_id)
    this.log.warn('backup worker: recovered an interrupted job', { orgId: config.org_id, resume, interruptions })
  }

  /** Takes the organization's lock, or returns null when another runner holds a live one. */
  private async claim(orgId: string): Promise<string | null> {
    const now = this.now()
    const db = this.untyped()
    const { error: expireError } = await db.from('backup_locks').delete().eq('org_id', orgId).lt('expires_at', now.toISOString())
    if (expireError) {
      this.log.warn('backup worker: could not clear an expired lock', { orgId, error: expireError.message })
      return null
    }
    const { data, error } = await db
      .from('backup_locks')
      .insert({
        org_id: orgId,
        locked_by_machine_id: this.instanceId,
        locked_by_machine_name: 'BluePLM server',
        locked_at: now.toISOString(),
        expires_at: new Date(now.getTime() + this.leaseSeconds * 1000).toISOString(),
      })
      .select('id')
      .single()
    if (error) {
      if (error.code !== '23505') this.log.warn('backup worker: lock failed', { orgId, error: error.message })
      return null
    }
    return (data as { id: string }).id
  }

  private async runJob(config: ServerBackupConfig, job: PlannedJob, lockId: string): Promise<void> {
    const db = this.untyped()
    const orgId = config.org_id
    const startedAt = this.now()

    // Consume the request or the slot first: a failure is then reported once.
    const consumed: Record<string, unknown> = { backup_running_since: startedAt.toISOString() }
    if (job.kind === 'backup' && job.trigger === 'manual') {
      consumed.backup_requested_at = null
      consumed.backup_requested_by = null
    }
    if (job.kind === 'backup' && job.slot !== null) consumed.last_scheduled_slot = new Date(job.slot).toISOString()
    if (job.kind === 'verify') {
      consumed.verify_requested_at = null
      consumed.verify_requested_by = null
      consumed.verify_mode = null
    }
    const { error: consumeError } = await db.from('backup_config').update(consumed).eq('org_id', orgId)
    if (consumeError) {
      this.log.error('backup worker: could not mark the job started', { orgId, error: consumeError.message })
      await db.from('backup_locks').delete().eq('id', lockId)
      return
    }

    const { data: history, error: historyError } = await db
      .from('backup_history')
      .insert({
        org_id: orgId,
        started_at: startedAt.toISOString(),
        status: 'running',
        machine_id: this.instanceId,
        machine_name: 'BluePLM server',
        kind: job.kind,
        trigger: job.trigger,
        runner: 'server',
      })
      .select('id')
      .single()
    if (historyError) this.log.warn('backup worker: could not write history', { orgId, error: historyError.message })
    const historyId = (history as { id: string } | null)?.id ?? null

    const renew = setInterval(
      () => {
        const expires = new Date(this.now().getTime() + this.leaseSeconds * 1000).toISOString()
        void db
          .from('backup_locks')
          .update({ expires_at: expires })
          .eq('id', lockId)
          .then(({ error }) => {
            if (error) this.log.warn('backup worker: lease renewal failed', { orgId, error: error.message })
          })
      },
      Math.max(1000, (this.leaseSeconds * 1000) / 3),
    )
    renew.unref()

    let outcome: Record<string, unknown>
    try {
      const store = await this.deps.openStore(config)
      const password = config.restic_password_encrypted as string
      if (job.kind === 'backup') {
        const { repo, created } = await BackupRepository.openOrInit(store, password)
        if (created) this.log.info('backup worker: created repository', { orgId, store: store.description })
        const source = this.deps.openSource(orgId)
        const result = await runServerBackup({
          repo,
          source,
          orgId,
          trigger: job.trigger,
          scheduledSlot: job.slot !== null ? new Date(job.slot).toISOString() : null,
          now: this.now,
          log: this.log,
        })
        let retention: PruneResult | { error: string }
        try {
          retention = await applyRetention(
            repo,
            {
              daily: config.retention_daily ?? 14,
              weekly: config.retention_weekly ?? 10,
              monthly: config.retention_monthly ?? 10,
              yearly: config.retention_yearly ?? 5,
            },
            { timezone: config.schedule_timezone || 'UTC', now: this.now() },
          )
        } catch (err) {
          retention = { error: errorText(err) }
        }
        const verify = await verifyRepository(repo, {
          mode: 'sample',
          snapshotId: result.snapshotId,
          sampleSize: this.deps.postBackupSampleSize ?? 10,
          // Also re-hashes a sample of the live vault: the backup itself never
          // re-reads content it already holds.
          source,
          now: this.now,
        })
        const serious = seriousProblems(result.problems)
        const retentionFailed = 'error' in retention
        const ok = serious.length === 0 && verify.ok && !retentionFailed
        outcome = {
          status: ok ? 'completed' : 'warning',
          files_total: result.stats.objects,
          files_added: result.stats.objectsUploaded,
          files_modified: 0,
          bytes_added: result.stats.bytesUploaded,
          bytes_total: result.stats.bytesTotal,
          snapshot_id: result.snapshotId,
          error_message: ok ? null : summarizeBackupProblems(serious, verify, retention),
          report: {
            stats: result.stats,
            problems: result.problems.slice(0, 200),
            problemCount: result.problems.length,
            tablesMissing: result.manifest.tablesMissing,
            retention,
            verify,
          },
        }
      } else {
        const repo = await BackupRepository.open(store, password)
        const verify = await verifyRepository(repo, {
          mode: job.verifyMode,
          source: this.deps.openSource(orgId),
          now: this.now,
        })
        outcome = {
          status: verify.ok ? 'completed' : 'failed',
          snapshot_id: verify.snapshot?.id ?? null,
          files_total: verify.blobsReferenced,
          bytes_total: verify.bytesRead,
          error_message: verify.ok ? null : verify.problems.slice(0, 3).join(' '),
          report: { verify },
        }
      }
    } catch (err) {
      this.log.error('backup worker: job failed', { orgId, kind: job.kind, error: errorText(err) })
      outcome = { status: 'failed', error_message: errorText(err), error_details: { name: (err as Error)?.name ?? null } }
    } finally {
      clearInterval(renew)
    }

    const completedAt = this.now()
    if (historyId) {
      const { error } = await db
        .from('backup_history')
        .update({
          ...outcome,
          completed_at: completedAt.toISOString(),
          duration_seconds: Math.round((completedAt.getTime() - startedAt.getTime()) / 1000),
        })
        .eq('id', historyId)
      if (error) this.log.warn('backup worker: could not finish history', { orgId, error: error.message })
    }
    await db.from('backup_config').update({ backup_running_since: null }).eq('org_id', orgId)
    await db.from('backup_locks').delete().eq('id', lockId)
    this.log.info('backup worker: job finished', { orgId, kind: job.kind, trigger: job.trigger, status: outcome.status })
  }
}

function summarizeBackupProblems(
  serious: Array<{ kind: string }>,
  verify: VerifyReport,
  retention: PruneResult | { error: string },
): string {
  const parts: string[] = []
  const corrupt = serious.filter((p) => p.kind === 'corrupt_source').length
  const unreadable = serious.filter((p) => p.kind === 'unreadable_source').length
  const other = serious.length - corrupt - unreadable
  if (corrupt) parts.push(`${corrupt} vault file(s) in BluePLM no longer match their content hash and were not backed up.`)
  if (unreadable) parts.push(`${unreadable} vault file(s) could not be read and were not backed up.`)
  if (other) parts.push(`${other} vault object(s) were skipped.`)
  if (!verify.ok) parts.push(`Test of the new snapshot failed: ${verify.problems[0] ?? 'unknown'}`)
  if ('error' in retention) parts.push(`Retention failed: ${retention.error}`)
  return parts.join(' ')
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
