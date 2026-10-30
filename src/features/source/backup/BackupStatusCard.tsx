import type { ReactNode } from 'react'
import { Clock, Loader2 } from 'lucide-react'

import { Badge, Callout } from '@/components/core/ui'
import { SettingRow, SettingsGroup, SettingsSection } from '@/features/settings/components/ui'

import { BackupScheduleInfo } from './BackupScheduleInfo'
import type { BackupStatus } from './types'

interface BackupStatusCardProps {
  status: BackupStatus | null
  isLoadingSnapshots?: boolean
  isBackoffActive?: boolean
  backoffRemainingSeconds?: number
  cacheAgeSeconds?: number | null
  isUsingCachedData?: boolean
  /** Buttons on the right of the section heading (Refresh). */
  actions?: ReactNode
}

// Format seconds as a human-readable duration
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}

/**
 * The Status section: whether backup is configured, how many snapshots exist, the last and next
 * backup, and notices about rate limiting or cached data.
 */
export function BackupStatusCard({
  status,
  isLoadingSnapshots,
  isBackoffActive,
  backoffRemainingSeconds,
  cacheAgeSeconds,
  isUsingCachedData,
  actions,
}: BackupStatusCardProps) {
  return (
    <SettingsSection title="Status" actions={actions}>
      <SettingsGroup>
        <SettingRow
          label={status?.isConfigured ? 'Backup Configured' : 'Backup Not Configured'}
          description={
            status?.isConfigured ? (
              isLoadingSnapshots ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  Loading snapshots...
                </span>
              ) : (
                `${status.totalSnapshots} snapshot${status.totalSnapshots !== 1 ? 's' : ''} available`
              )
            ) : (
              'Configure backup settings below to enable backups'
            )
          }
        >
          {status?.isConfigured ? (
            <Badge tone="success">Configured</Badge>
          ) : (
            <Badge tone="warning">Not configured</Badge>
          )}
        </SettingRow>
        {status?.isConfigured && <BackupScheduleInfo status={status} />}
      </SettingsGroup>

      {/* Rate limiting warning */}
      {isBackoffActive && backoffRemainingSeconds && backoffRemainingSeconds > 0 && (
        <Callout tone="warning" title="Rate limited by backup server">
          Retry in {formatDuration(backoffRemainingSeconds)}
        </Callout>
      )}

      {/* Cache age indicator (show when using cached data and not in backoff) */}
      {status?.isConfigured &&
        isUsingCachedData &&
        !isBackoffActive &&
        cacheAgeSeconds != null &&
        cacheAgeSeconds > 60 && (
          <div className="flex items-center gap-1.5 text-[12px] text-plm-fg-muted">
            <Clock size={12} />
            <span>Showing cached data from {formatDuration(cacheAgeSeconds)} ago</span>
          </div>
        )}
    </SettingsSection>
  )
}
