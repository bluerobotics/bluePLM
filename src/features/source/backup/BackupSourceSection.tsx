import { AlertTriangle, Loader2, Monitor, Play } from 'lucide-react'

import { Badge, Button, Callout } from '@/components/core/ui'
import { SettingRow, SettingsGroup, SettingsSection } from '@/features/settings/components/ui'

import type { BackupProgress, BackupStatus, ConnectedVault } from './types'
import { formatRelativeTime } from './utils'
import { VaultSelector } from './VaultSelector'

interface BackupSourceSectionProps {
  status: BackupStatus
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
 * Shows backup source machine info and controls.
 * Includes machine designation, vault selection, and backup now button.
 */
export function BackupSourceSection({
  status,
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
}: BackupSourceSectionProps) {
  const config = status.config

  const sourceBadge = config?.designated_machine_id ? (
    isThisDesignated || isDesignatedOnline ? (
      <Badge
        tone="success"
        icon={<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      >
        Online
      </Badge>
    ) : (
      <Badge>Offline</Badge>
    )
  ) : (
    <Badge tone="warning">Not set</Badge>
  )

  const noVaultsSelected = isThisDesignated && selectedVaultIds.length === 0
  const backupDisabled =
    isRunningBackup ||
    (!isThisDesignated && !isDesignatedOnline) ||
    !!config?.backup_requested_at ||
    noVaultsSelected
  const backupTitle = noVaultsSelected
    ? 'Select at least one vault to backup'
    : !isThisDesignated && !isDesignatedOnline
      ? 'Backup machine is offline'
      : undefined

  return (
    <SettingsSection title="Backup Source" actions={sourceBadge}>
      <SettingsGroup>
        {config?.designated_machine_id ? (
          <SettingRow
            label={config.designated_machine_name || 'Unknown'}
            badge={isThisDesignated ? <Badge tone="accent">This machine</Badge> : undefined}
            description={
              <>
                <div>
                  {config.designated_machine_platform} · {config.designated_machine_user_email}
                </div>
                {!isThisDesignated && config.designated_machine_last_seen && (
                  <div>Last seen: {formatRelativeTime(config.designated_machine_last_seen)}</div>
                )}
              </>
            }
          />
        ) : (
          <SettingRow
            label="No backup machine designated"
            description="Backups run on one designated machine."
          />
        )}

        {/* Vaults to backup */}
        {config?.designated_machine_id && isThisDesignated && (
          <VaultSelector
            connectedVaults={connectedVaults}
            selectedVaultIds={selectedVaultIds}
            onVaultToggle={onVaultToggle}
          />
        )}

        {/* Admin controls */}
        {isAdmin && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
            {isThisDesignated ? (
              <Button size="sm" onClick={onClearDesignatedMachine}>
                Clear designation
              </Button>
            ) : !config?.designated_machine_id ? (
              <Button size="sm" variant="primary" onClick={onDesignateThisMachine}>
                Set this machine as backup source
              </Button>
            ) : !isDesignatedOnline ? (
              // Another machine is designated but offline - allow taking over
              <Button size="sm" onClick={onDesignateThisMachine} icon={<Monitor size={14} />}>
                Take over as backup source
              </Button>
            ) : null}

            {config?.designated_machine_id && (
              <Button
                size="sm"
                variant="primary"
                onClick={onRunBackup}
                disabled={backupDisabled}
                title={backupTitle}
                icon={
                  isRunningBackup || config?.backup_requested_at ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : noVaultsSelected ? (
                    <AlertTriangle size={14} />
                  ) : (
                    <Play size={14} />
                  )
                }
              >
                {isRunningBackup
                  ? backupProgress?.message || 'Running Backup...'
                  : config?.backup_requested_at
                    ? 'Backup Requested...'
                    : noVaultsSelected
                      ? 'No Vaults Selected'
                      : isThisDesignated
                        ? 'Sync & Backup Now'
                        : 'Request Backup'}
              </Button>
            )}
          </div>
        )}
      </SettingsGroup>

      {/* Backup request/running status */}
      {config?.backup_requested_at && !config?.backup_running_since && (
        <Callout tone="info">Backup requested by {config.backup_requested_by}...</Callout>
      )}
      {config?.backup_running_since && <Callout tone="success">Backup in progress...</Callout>}
    </SettingsSection>
  )
}
