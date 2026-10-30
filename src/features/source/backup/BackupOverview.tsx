import { AlertTriangle, CheckCircle2, Clock, CalendarClock, Loader2, Settings } from 'lucide-react'
import { t } from '@/lib/i18n'
import {
  isServerRun,
  isServerWorkerOnline,
  nextScheduledBackup,
  type BackupConfig,
} from '@/lib/backup'
import { formatDate } from './utils'

/** A successful backup older than this is called out: a nightly schedule missed a night. */
export const STALE_BACKUP_HOURS = 36

interface BackupOverviewProps {
  config: BackupConfig | null
  isConfigured: boolean
  isAdmin: boolean
  /** When the last successful backup started: the server's, or the newest desktop snapshot. */
  lastBackupAt: string | null
  isDesignatedOnline: boolean
  isThisDesignated: boolean
  /** A backup is running now (backup_config.backup_started_at). */
  isRunning: boolean
  onOpenSettings: () => void
}

/** Why backups need attention, one sentence each; empty when they are healthy. */
export function backupAttention(
  config: BackupConfig | null,
  lastBackupAt: string | null,
  designatedOnline: boolean,
  now = Date.now(),
  running = false,
): string[] {
  if (!config) return []
  const reasons: string[] = []
  if (isServerRun(config)) {
    if (!isServerWorkerOnline(config, now)) reasons.push(t('backupPanel.reasonWorkerOffline'))
  } else if (!config.designated_machine_id) {
    reasons.push(t('backupPanel.reasonNoComputer'))
  } else if (!designatedOnline) {
    reasons.push(
      t('backupPanel.reasonComputerOffline', { name: config.designated_machine_name ?? '' }),
    )
  }
  if (config.is_schedule_enabled) {
    // The first backup running is the expected state, not a problem.
    if (!lastBackupAt) {
      if (!running) reasons.push(t('backupPanel.reasonNeverBackedUp'))
    } else if ((now - Date.parse(lastBackupAt)) / 3_600_000 > STALE_BACKUP_HOURS) {
      reasons.push(t('backupPanel.reasonStale', { hours: STALE_BACKUP_HOURS }))
    }
  } else {
    reasons.push(t('backupPanel.reasonNoSchedule'))
  }
  return reasons
}

/**
 * The top of the backup page: are backups healthy, who runs them, when the last one was and when
 * the next one is. Replaces the old "Backup Configured" card, which said only that a bucket was set.
 */
export function BackupOverview({
  config,
  isConfigured,
  isAdmin,
  lastBackupAt,
  isDesignatedOnline,
  isThisDesignated,
  isRunning,
  onOpenSettings,
}: BackupOverviewProps) {
  if (!isConfigured) {
    return (
      <div className="p-4 rounded-lg border bg-amber-500/10 border-amber-500/30 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-medium">{t('backupPanel.notConfigured')}</div>
          <div className="text-sm text-plm-fg-muted">
            {isAdmin ? t('backupPanel.notConfiguredAdmin') : t('backupPanel.notConfiguredMember')}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={onOpenSettings}
            className="btn btn-primary btn-sm flex items-center gap-1"
          >
            <Settings className="w-3.5 h-3.5" />
            {t('backupPanel.openSettings')}
          </button>
        )}
      </div>
    )
  }

  const reasons = backupAttention(
    config,
    lastBackupAt,
    isDesignatedOnline || isThisDesignated,
    Date.now(),
    isRunning,
  )
  const healthy = reasons.length === 0
  const firstRunning = healthy && !lastBackupAt && isRunning
  const next = nextScheduledBackup(config)
  const runsOn = isServerRun(config)
    ? t('backupPanel.runsOnServer')
    : config?.designated_machine_id
      ? t('backupPanel.runsOnComputer', {
          name: isThisDesignated
            ? t('backupPanel.thisComputer')
            : (config.designated_machine_name ?? ''),
        })
      : t('backupPanel.runsOnNobody')

  return (
    <div
      className={`p-4 rounded-lg border space-y-3 ${
        firstRunning
          ? 'bg-blue-500/10 border-blue-500/30'
          : healthy
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
      }`}
    >
      <div className="flex items-start gap-3">
        {firstRunning ? (
          <Loader2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5 animate-spin" />
        ) : healthy ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium">
            {firstRunning
              ? t('backupPanel.firstBackupRunning')
              : healthy
                ? t('backupPanel.healthy')
                : t('backupPanel.attention')}
          </div>
          <div className="text-sm text-plm-fg-muted">{runsOn}</div>
          {!healthy && (
            <ul className="mt-1 text-sm text-amber-300 list-disc pl-4 space-y-0.5">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-4 h-4 text-plm-fg-muted shrink-0" />
          <span className="text-plm-fg-muted">{t('backupPanel.lastBackup')}</span>
          <span className="truncate">
            {lastBackupAt
              ? formatDate(lastBackupAt)
              : isRunning
                ? t('backupPanel.inProgress')
                : t('backupPanel.never')}
          </span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock className="w-4 h-4 text-plm-fg-muted shrink-0" />
          <span className="text-plm-fg-muted">{t('backupPanel.nextBackup')}</span>
          <span className="truncate">
            {next ? next.toLocaleString() : t('backupPanel.notScheduled')}
          </span>
        </div>
      </div>
    </div>
  )
}
