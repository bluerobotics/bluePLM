import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  Play,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { t } from '@/lib/i18n'
import {
  getBackupConfig,
  getBackupRuns,
  isServerWorkerOnline,
  nextScheduledBackup,
  requestBackup,
  requestBackupTest,
  type BackupConfig,
  type BackupRun,
  type BackupTestMode,
} from '@/lib/backup'
import { formatDate, formatRelativeTime } from './utils'

interface ServerBackupSectionProps {
  config: BackupConfig
  orgId: string
  userEmail: string
  isAdmin: boolean
}

/** A successful backup older than this is called out: a nightly schedule missed a night. */
const STALE_HOURS = 36
const TEST_MODES: BackupTestMode[] = ['quick', 'sample', 'full']

function formatBytes(bytes: number | null): string {
  if (!bytes) return '0 MB'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function runSummary(run: BackupRun): string {
  if (run.kind === 'verify') {
    return t('serverBackup.verifySummary', {
      blobs: run.report?.verify?.blobsRead ?? 0,
      problems: run.report?.verify?.problems.length ?? 0,
    })
  }
  return t('serverBackup.backupSummary', {
    files: run.files_total ?? 0,
    uploaded: run.files_added ?? 0,
    size: formatBytes(run.bytes_added),
  })
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-plm-success shrink-0" />
  if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-plm-warning shrink-0" />
  if (status === 'running') return <Loader2 className="w-4 h-4 animate-spin text-plm-accent shrink-0" />
  return <XCircle className="w-4 h-4 text-plm-error shrink-0" />
}

function statusLabel(status: string): string {
  if (status === 'completed') return t('serverBackup.statusCompleted')
  if (status === 'warning') return t('serverBackup.statusWarning')
  if (status === 'running') return t('serverBackup.statusRunning')
  return t('serverBackup.statusFailed')
}

/**
 * Backups run by the API's backup worker (schema 113): whether a worker is alive,
 * when the next backup is due, what the last backups and tests found, and buttons
 * to back up or test now. Requests are rows in backup_config the worker picks up
 * within a minute; results are rows in backup_history.
 *
 * Polls while something is pending (15 s) and slowly otherwise (60 s), and stops
 * when unmounted.
 */
export function ServerBackupSection({ config: initialConfig, orgId, userEmail, isAdmin }: ServerBackupSectionProps) {
  const addToast = usePDMStore((s) => s.addToast)
  const [config, setConfig] = useState<BackupConfig>(initialConfig)
  const [runs, setRuns] = useState<BackupRun[]>([])
  const [loaded, setLoaded] = useState(false)
  const [testMode, setTestMode] = useState<BackupTestMode>('sample')
  const [sending, setSending] = useState(false)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  useEffect(() => setConfig(initialConfig), [initialConfig])

  const reload = useCallback(async () => {
    const [latest, latestRuns] = await Promise.all([getBackupConfig(orgId), getBackupRuns(orgId, 10)])
    if (latest) setConfig(latest)
    setRuns(latestRuns)
    setLoaded(true)
  }, [orgId])

  const pending =
    !!config.backup_requested_at || !!config.verify_requested_at || !!config.backup_running_since

  useEffect(() => {
    void reload()
    const timer = setInterval(() => void reload(), pending ? 15_000 : 60_000)
    return () => clearInterval(timer)
  }, [reload, pending])

  const online = isServerWorkerOnline(config)
  const next = nextScheduledBackup(config)
  const lastGood = runs.find((r) => r.kind === 'backup' && (r.status === 'completed' || r.status === 'warning'))
  const lastTest = runs.find((r) => r.kind === 'verify' && r.status !== 'running')
  const lastGoodAgeHours = lastGood ? (Date.now() - Date.parse(lastGood.started_at)) / 3_600_000 : null

  const send = async (action: () => Promise<{ success: boolean; error?: string }>, sent: string) => {
    setSending(true)
    try {
      const result = await action()
      if (result.success) {
        addToast('success', sent)
        await reload()
      } else {
        addToast('error', t('serverBackup.requestFailed', { error: result.error ?? '' }))
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-3 rounded-lg bg-plm-bg-secondary border border-plm-border space-y-3">
      <div className="flex items-center gap-2">
        <Cloud className="w-4 h-4 text-plm-accent" />
        <span className="text-sm font-medium">{t('serverBackup.title')}</span>
      </div>

      {/* Worker */}
      <div className="flex items-start gap-2 text-xs">
        {online ? (
          <CheckCircle2 className="w-4 h-4 text-plm-success shrink-0" />
        ) : (
          <CloudOff className="w-4 h-4 text-plm-warning shrink-0" />
        )}
        <span className={online ? 'text-plm-fg-muted' : 'text-plm-warning'}>
          {online
            ? t('serverBackup.workerOnline', { ago: formatRelativeTime(config.server_worker_seen_at as string) })
            : config.server_worker_seen_at
              ? t('serverBackup.workerStale', { ago: formatRelativeTime(config.server_worker_seen_at) })
              : t('serverBackup.workerOffline')}
        </span>
      </div>

      {/* Schedule and state */}
      <div className="text-xs text-plm-fg-muted space-y-1">
        <div>{next ? t('serverBackup.nextRun', { when: next.toLocaleString() }) : t('serverBackup.scheduleOff')}</div>
        {loaded && (
          <div>
            {lastGood
              ? t('serverBackup.lastGood', { when: formatDate(lastGood.started_at) })
              : t('serverBackup.lastGoodNever')}
          </div>
        )}
        {lastTest && (
          <div>
            {t('serverBackup.lastTest', {
              when: formatDate(lastTest.started_at),
              result:
                lastTest.status === 'completed' ? t('serverBackup.lastTestPassed') : t('serverBackup.lastTestFailed'),
            })}
          </div>
        )}
        {config.backup_running_since && (
          <div className="flex items-center gap-1 text-plm-accent">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('serverBackup.running', { when: formatDate(config.backup_running_since) })}
          </div>
        )}
        {config.backup_requested_at && !config.backup_running_since && <div>{t('serverBackup.backupRequested')}</div>}
        {config.verify_requested_at && <div>{t('serverBackup.testRequested')}</div>}
      </div>

      {lastGoodAgeHours !== null && lastGoodAgeHours > STALE_HOURS && config.schedule_enabled && (
        <div className="flex items-start gap-2 p-2 rounded bg-plm-warning/10 text-xs text-plm-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {t('serverBackup.staleWarning', { hours: STALE_HOURS })}
        </div>
      )}

      {/* Actions */}
      {isAdmin ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void send(() => requestBackup(orgId, userEmail), t('serverBackup.backupRequestSent'))}
              disabled={sending || !!config.backup_requested_at || !!config.backup_running_since}
              className="btn btn-primary btn-sm flex items-center gap-1"
            >
              <Play className="w-3.5 h-3.5" />
              {t('serverBackup.backupNow')}
            </button>
            <select
              value={testMode}
              onChange={(e) => setTestMode(e.target.value as BackupTestMode)}
              className="px-2 py-1 rounded bg-plm-bg-primary border border-plm-border text-xs"
            >
              {TEST_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode === 'quick'
                    ? t('serverBackup.testQuick')
                    : mode === 'sample'
                      ? t('serverBackup.testSample')
                      : t('serverBackup.testFull')}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                void send(() => requestBackupTest(orgId, userEmail, testMode), t('serverBackup.testRequestSent'))
              }
              disabled={sending || !!config.verify_requested_at}
              className="btn btn-secondary btn-sm flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {t('serverBackup.testBackup')}
            </button>
          </div>
          <p className="text-xs text-plm-fg-muted">
            {testMode === 'quick'
              ? t('serverBackup.testQuickHint')
              : testMode === 'sample'
                ? t('serverBackup.testSampleHint')
                : t('serverBackup.testFullHint')}
          </p>
        </div>
      ) : (
        <p className="text-xs text-plm-fg-muted">{t('serverBackup.adminOnly')}</p>
      )}

      {/* Recent runs */}
      <div>
        <div className="text-xs font-medium mb-1">{t('serverBackup.recentRuns')}</div>
        {loaded && runs.length === 0 && <div className="text-xs text-plm-fg-muted">{t('serverBackup.noRuns')}</div>}
        <ul className="space-y-1">
          {runs.map((run) => {
            const problems = run.report?.problems ?? []
            const verifyProblems = run.report?.verify?.problems ?? []
            const expandable = !!run.error_message || problems.length > 0 || verifyProblems.length > 0
            return (
              <li key={run.id} className="text-xs">
                <button
                  className="w-full flex items-center gap-2 text-left disabled:cursor-default"
                  disabled={!expandable}
                  onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                >
                  <StatusIcon status={run.status} />
                  <span className="font-medium">
                    {run.kind === 'verify' ? t('serverBackup.kindVerify') : t('serverBackup.kindBackup')}
                  </span>
                  <span className="text-plm-fg-muted">
                    {run.trigger === 'scheduled' ? t('serverBackup.triggerScheduled') : t('serverBackup.triggerManual')}
                  </span>
                  <span className="text-plm-fg-muted">{formatDate(run.started_at)}</span>
                  <span className="ml-auto">{statusLabel(run.status)}</span>
                </button>
                {run.status !== 'running' && run.status !== 'failed' && (
                  <div className="pl-6 text-plm-fg-muted">{runSummary(run)}</div>
                )}
                {expandedRunId === run.id && (
                  <div className="pl-6 mt-1 space-y-0.5 text-plm-fg-muted">
                    {run.error_message && <div className="text-plm-error">{run.error_message}</div>}
                    {[...verifyProblems, ...problems.map((p) => `${p.name}: ${p.detail}`)].slice(0, 20).map((line) => (
                      <div key={line} className="break-all">
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <p className="text-xs text-plm-fg-muted break-all">{t('serverBackup.restoreHint', { orgId })}</p>
    </div>
  )
}
