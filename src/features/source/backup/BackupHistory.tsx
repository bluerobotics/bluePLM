import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { Badge, Callout, Select } from '@/components/core/ui'
import { SettingsGroup, SettingsSection } from '@/features/settings/components/ui'

import { BackupHistoryItem } from './BackupHistoryItem'
import type { BackupStatus, DeleteConfirmTarget } from './types'
import { extractVaultNamesFromSnapshots, formatDate } from './utils'

interface BackupHistoryProps {
  status: BackupStatus | null
  isAdmin: boolean
  selectedSnapshot: string | null
  onSelectSnapshot: (id: string | null) => void
  deletingSnapshotIds: Set<string>
  onRequestDelete: (target: DeleteConfirmTarget) => void
  historyVaultFilter: string
  onHistoryVaultFilterChange: (filter: string) => void
  isRestoring: boolean
  isLoadingSnapshots?: boolean
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-8 text-[13px] text-plm-fg-muted">
      {children}
    </div>
  )
}

/**
 * Shows the backup history with filtering by vault.
 * Displays its own loading spinner when snapshots are loading in the background.
 */
export function BackupHistory({
  status,
  isAdmin,
  selectedSnapshot,
  onSelectSnapshot,
  deletingSnapshotIds,
  onRequestDelete,
  historyVaultFilter,
  onHistoryVaultFilterChange,
  isRestoring,
  isLoadingSnapshots,
}: BackupHistoryProps) {
  const vaultNames = status?.snapshots ? extractVaultNamesFromSnapshots(status.snapshots) : []

  const filteredSnapshots =
    status?.snapshots?.filter((snapshot) => {
      if (historyVaultFilter === 'all') return true
      return snapshot.tags?.some((tag) => tag === `vault:${historyVaultFilter}`)
    }) || []

  return (
    <SettingsSection
      title="Backup History"
      description={
        !isAdmin && (status?.snapshots?.length ?? 0) > 0
          ? 'Only admins can run backups and restore'
          : undefined
      }
      actions={
        <>
          {isLoadingSnapshots ? (
            <Loader2 size={14} className="animate-spin text-plm-fg-muted" />
          ) : status?.totalSnapshots ? (
            <Badge>{status.totalSnapshots}</Badge>
          ) : null}
          {/* Vault filter */}
          {vaultNames.length > 0 && (
            <Select
              size="sm"
              aria-label="Vault"
              value={historyVaultFilter}
              onChange={(e) => onHistoryVaultFilterChange(e.target.value)}
            >
              <option value="all">All vaults</option>
              {vaultNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          )}
        </>
      }
    >
      {status?.isConfigured &&
      !(isLoadingSnapshots && filteredSnapshots.length === 0) &&
      status.error ? (
        <Callout tone="error">{status.error}</Callout>
      ) : (
        <SettingsGroup>
          {!status?.isConfigured ? (
            <EmptyState>Configure backup settings to view history</EmptyState>
          ) : isLoadingSnapshots && filteredSnapshots.length === 0 ? (
            <EmptyState>
              <Loader2 size={14} className="animate-spin" />
              Loading backup history...
            </EmptyState>
          ) : filteredSnapshots.length === 0 ? (
            <EmptyState>
              No backups yet. Click "Sync & Backup Now" to create your first backup.
            </EmptyState>
          ) : (
            <div className="max-h-96 divide-y divide-plm-border overflow-y-auto">
              {filteredSnapshots.map((snapshot) => (
                <BackupHistoryItem
                  key={snapshot.id}
                  snapshot={snapshot}
                  isSelected={selectedSnapshot === snapshot.id}
                  isAdmin={isAdmin}
                  isDeleting={deletingSnapshotIds.has(snapshot.id)}
                  isRestoring={isRestoring}
                  onSelect={() =>
                    onSelectSnapshot(selectedSnapshot === snapshot.id ? null : snapshot.id)
                  }
                  onRequestDelete={() =>
                    onRequestDelete({ id: snapshot.id, time: formatDate(snapshot.time) })
                  }
                />
              ))}
            </div>
          )}
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}
