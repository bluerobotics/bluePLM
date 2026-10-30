import { AlertTriangle, CheckCircle2, RotateCcw, Trash2, XCircle } from 'lucide-react'

import { Badge, Button } from '@/components/core/ui'

import type { BackupSnapshot } from './types'
import { formatDate, getVaultNameFromTags, snapshotHasFiles, snapshotHasMetadata } from './utils'

interface BackupHistoryItemProps {
  snapshot: BackupSnapshot
  isSelected: boolean
  isAdmin: boolean
  isDeleting: boolean
  isRestoring: boolean
  onSelect: () => void
  onRequestDelete: () => void
}

/**
 * Single backup history row showing snapshot details and actions.
 */
export function BackupHistoryItem({
  snapshot,
  isSelected,
  isAdmin,
  isDeleting,
  isRestoring,
  onSelect,
  onRequestDelete,
}: BackupHistoryItemProps) {
  const hasFiles = snapshotHasFiles(snapshot.tags)
  const hasMetadata = snapshotHasMetadata(snapshot.tags)
  const vaultName = getVaultNameFromTags(snapshot.tags)

  // Status: success only if both files AND metadata
  const isComplete = hasFiles && hasMetadata
  const isIncomplete = hasFiles && !hasMetadata

  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 py-3 ${
        isSelected ? 'bg-plm-warning/[0.08]' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-plm-fg">{formatDate(snapshot.time)}</span>
          {isComplete ? (
            <Badge tone="success" icon={<CheckCircle2 size={11} />}>
              Complete
            </Badge>
          ) : isIncomplete ? (
            <Badge
              tone="warning"
              icon={<AlertTriangle size={11} />}
              title="Files backed up but database metadata missing"
            >
              Partial
            </Badge>
          ) : (
            <Badge tone="error" icon={<XCircle size={11} />}>
              Error
            </Badge>
          )}
          {vaultName && <Badge>{vaultName}</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-plm-fg-muted">
          <span className="truncate">
            from {snapshot.hostname} · {snapshot.id}
          </span>
          {/* Files/Database check indicators */}
          <span className={`inline-flex items-center gap-1 ${hasFiles ? 'text-plm-success' : ''}`}>
            {hasFiles ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            Files
          </span>
          <span
            className={`inline-flex items-center gap-1 ${hasMetadata ? 'text-plm-success' : 'text-plm-warning'}`}
          >
            {hasMetadata ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {hasMetadata ? 'Database' : 'No Database'}
          </span>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant={isSelected ? 'primary' : 'secondary'}
            onClick={onSelect}
            disabled={isRestoring}
            title="Restore vault to this backup"
            icon={<RotateCcw size={12} />}
          >
            Restore
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRequestDelete}
            loading={isDeleting}
            title="Delete this snapshot"
            aria-label="Delete this snapshot"
            icon={<Trash2 size={14} />}
            className="hover:text-plm-error"
          />
        </div>
      )}
    </div>
  )
}
