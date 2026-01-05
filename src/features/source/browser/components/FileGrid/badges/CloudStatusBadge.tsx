import { Cloud, HardDrive } from 'lucide-react'

export interface CloudStatusBadgeProps {
  cloudFilesCount: number
  localOnlyFilesCount: number
  statusIconSize: number
  spacing: number
}

/**
 * Badge showing cloud/local file counts for folders
 */
export function CloudStatusBadge({
  cloudFilesCount,
  localOnlyFilesCount,
  statusIconSize,
  spacing
}: CloudStatusBadgeProps) {
  return (
    <>
      {cloudFilesCount > 0 && (
        <span
          className="flex items-center text-plm-info"
          style={{ gap: spacing * 0.5, fontSize: Math.max(10, statusIconSize * 0.8) }}
          title={`${cloudFilesCount} cloud file${cloudFilesCount > 1 ? 's' : ''} to download`}
        >
          <Cloud size={statusIconSize} />
          <span className="font-bold">{cloudFilesCount}</span>
        </span>
      )}
      {localOnlyFilesCount > 0 && (
        <span
          className="flex items-center text-plm-fg-muted"
          style={{ gap: spacing * 0.5, fontSize: Math.max(10, statusIconSize * 0.8) }}
          title={`${localOnlyFilesCount} local files not yet synced`}
        >
          <HardDrive size={statusIconSize} />
          <span className="font-bold">{localOnlyFilesCount}</span>
        </span>
      )}
    </>
  )
}
