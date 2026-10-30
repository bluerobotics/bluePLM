import { AlertTriangle, Loader2, Monitor, Play } from 'lucide-react'
import { t } from '@/lib/i18n'
import type { BackupConfig } from '@/lib/backup'
import type { BackupProgress, ConnectedVault } from './types'
import { formatRelativeTime } from './utils'
import { VaultSelector } from './VaultSelector'

interface DesktopBackupSectionProps {
  config: BackupConfig
  isThisDesignated: boolean
  isDesignatedOnline: boolean
  isAdmin: boolean
  connectedVaults: ConnectedVault[]
  selectedVaultIds: string[]
  onVaultToggle: (vaultId: string, checked: boolean) => void
  isRunningBackup: boolean
  backupProgress: BackupProgress | null
  onRunBackup: () => void
  onDesignateThisMachine: () => void
  onClearDesignatedMachine: () => void
}

/**
 * Backups run by a designated computer (restic over its local vault copy): which computer, whether
 * it is online, and the actions. An admin can release the designation from any computer (before,
 * only the designated computer showed "Clear designation") and take it over when that computer is
 * offline.
 */
export function DesktopBackupSection({
  config,
  isThisDesignated,
  isDesignatedOnline,
  isAdmin,
  connectedVaults,
  selectedVaultIds,
  onVaultToggle,
  isRunningBackup,
  backupProgress,
  onRunBackup,
  onDesignateThisMachine,
  onClearDesignatedMachine,
}: DesktopBackupSectionProps) {
  const designated = !!config.designated_machine_id
  const online = isThisDesignated || isDesignatedOnline
  const noVaultsSelected = isThisDesignated && selectedVaultIds.length === 0
  const requested = !!config.backup_requested_at && !config.backup_started_at
  const canBackUp =
    designated && !isRunningBackup && !requested && !config.backup_started_at && online && !noVaultsSelected

  return (
    <div className="p-4 rounded-lg bg-plm-bg-secondary border border-plm-border space-y-3">
      {/* The computer */}
      <div className="flex items-center gap-3">
        <Monitor className={`w-6 h-6 shrink-0 ${designated ? 'text-plm-fg-muted' : 'text-plm-fg-muted/50'}`} />
        <div className="flex-1 min-w-0">
          {designated ? (
            <>
              <div className="text-sm font-medium flex items-center gap-2">
                <span className="truncate">{config.designated_machine_name || '?'}</span>
                {isThisDesignated && (
                  <span className="text-xs px-1.5 py-0.5 bg-plm-accent/20 text-plm-accent rounded">
                    {t('backupPanel.thisComputer')}
                  </span>
                )}
                <span className={`flex items-center gap-1 text-xs ${online ? 'text-emerald-400' : 'text-plm-fg-muted'}`}>
                  <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-plm-fg-muted'}`} />
                  {online ? t('backupPanel.online') : t('backupPanel.offline')}
                </span>
              </div>
              <div className="text-xs text-plm-fg-muted truncate">
                {[config.designated_machine_platform, config.designated_machine_user_email].filter(Boolean).join(' · ')}
                {!isThisDesignated && config.designated_machine_last_seen_at && (
                  <> · {t('backupPanel.lastSeen', { ago: formatRelativeTime(config.designated_machine_last_seen_at) })}</>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-plm-fg-muted">{t('backupPanel.noComputer')}</div>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            {!isThisDesignated && (!designated || !online) && (
              <button onClick={onDesignateThisMachine} className="btn btn-secondary btn-sm">
                {designated ? t('backupPanel.takeOver') : t('backupPanel.useThisComputer')}
              </button>
            )}
            {designated && (
              <button onClick={onClearDesignatedMachine} className="btn btn-ghost btn-sm">
                {t('backupPanel.release')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Vaults (this computer only) */}
      {isThisDesignated && (
        <VaultSelector connectedVaults={connectedVaults} selectedVaultIds={selectedVaultIds} onVaultToggle={onVaultToggle} />
      )}

      {/* State and the backup action */}
      {designated && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-plm-border">
          {isAdmin && (
            <button
              onClick={onRunBackup}
              disabled={!canBackUp}
              className="btn btn-primary btn-sm flex items-center gap-1"
              title={
                noVaultsSelected
                  ? t('backupPanel.noVaultsSelected')
                  : !online
                    ? t('backupPanel.computerOffline')
                    : undefined
              }
            >
              {isRunningBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {isThisDesignated ? t('serverBackup.backupNow') : t('backupPanel.requestBackup')}
            </button>
          )}
          <span className="text-xs text-plm-fg-muted flex items-center gap-1">
            {isRunningBackup && backupProgress ? (
              backupProgress.message
            ) : config.backup_started_at ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('backupPanel.backupRunning')}
              </>
            ) : requested ? (
              t('backupPanel.backupRequestedBy', { who: config.backup_requested_by ?? '' })
            ) : noVaultsSelected ? (
              <>
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                {t('backupPanel.noVaultsSelected')}
              </>
            ) : !online ? (
              t('backupPanel.computerOffline')
            ) : null}
          </span>
        </div>
      )}
    </div>
  )
}
