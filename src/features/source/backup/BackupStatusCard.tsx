import { CheckCircle2, AlertTriangle, Loader2, Clock, AlertCircle } from 'lucide-react'
import type { BackupStatus } from './types'

interface BackupStatusCardProps {
  status: BackupStatus | null
  isLoadingSnapshots?: boolean
  isBackoffActive?: boolean
  backoffRemainingSeconds?: number
  cacheAgeSeconds?: number | null
  isUsingCachedData?: boolean
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
 * Shows the backup configuration status (configured/not configured)
 * and the total number of snapshots available.
 */
export function BackupStatusCard({ 
  status, 
  isLoadingSnapshots,
  isBackoffActive,
  backoffRemainingSeconds,
  cacheAgeSeconds,
  isUsingCachedData
}: BackupStatusCardProps) {
  return (
    <div className="space-y-2">
      <div className={`p-4 rounded-lg border ${
        status?.isConfigured 
          ? 'bg-emerald-500/10 border-emerald-500/30' 
          : 'bg-amber-500/10 border-amber-500/30'
      }`}>
        <div className="flex items-center gap-3">
          {status?.isConfigured ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          )}
          <div className="flex-1">
            <div className="font-medium">
              {status?.isConfigured ? 'Backup Configured' : 'Backup Not Configured'}
            </div>
            <div className="text-sm text-plm-fg-muted flex items-center gap-2">
              {status?.isConfigured ? (
                isLoadingSnapshots ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Loading snapshots...</span>
                  </>
                ) : (
                  `${status.totalSnapshots} snapshot${status.totalSnapshots !== 1 ? 's' : ''} available`
                )
              ) : (
                'Configure backup settings below to enable backups'
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Rate limiting warning */}
      {isBackoffActive && backoffRemainingSeconds && backoffRemainingSeconds > 0 && (
        <div className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/30">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-amber-400">Rate limited by backup server</span>
              <span className="text-plm-fg-muted ml-2">
                Retry in {formatDuration(backoffRemainingSeconds)}
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Cache age indicator (show when using cached data and not in backoff) */}
      {status?.isConfigured && isUsingCachedData && !isBackoffActive && cacheAgeSeconds != null && cacheAgeSeconds > 60 && (
        <div className="flex items-center gap-1.5 text-xs text-plm-fg-muted px-1">
          <Clock className="w-3 h-3" />
          <span>Showing cached data from {formatDuration(cacheAgeSeconds)} ago</span>
        </div>
      )}
    </div>
  )
}
