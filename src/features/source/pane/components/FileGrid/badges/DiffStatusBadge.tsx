import { HardDrive, Trash2, ArrowUp, AlertTriangle } from 'lucide-react'

export interface DiffStatusBadgeProps {
  diffStatus: string | undefined
  statusIconSize: number
  hasCheckoutUsers: boolean
}

/**
 * Badge showing file diff status (modified, deleted, outdated, etc.)
 */
export function DiffStatusBadge({ diffStatus, statusIconSize, hasCheckoutUsers }: DiffStatusBadgeProps) {
  // Don't show if there are checkout users displayed
  if (hasCheckoutUsers) return null

  switch (diffStatus) {
    case 'added':
    case 'ignored':
      return (
        <span title="Local only">
          <HardDrive size={statusIconSize} className="text-plm-fg-muted" />
        </span>
      )
    case 'deleted_remote':
      return (
        <span title="Deleted from server">
          <Trash2 size={statusIconSize} className="text-plm-error" />
        </span>
      )
    case 'modified':
      return (
        <span title="Modified">
          <ArrowUp size={statusIconSize} className="text-yellow-400" />
        </span>
      )
    case 'outdated':
      return (
        <span title="Outdated">
          <AlertTriangle size={statusIconSize} className="text-purple-400" />
        </span>
      )
    default:
      return null
  }
}
