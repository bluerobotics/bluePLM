/**
 * Version column cell renderer
 * 
 * Shows version as local/cloud (e.g., "1/2") with a dropdown arrow
 * that opens the full version history with rollback functionality.
 */
import type { CellRendererBaseProps } from './types'
import { VersionHistoryDropdown } from './VersionHistoryDropdown'

export function VersionCell({ file }: CellRendererBaseProps): React.ReactNode {
  if (file.isDirectory) return ''
  
  const cloudVersion = file.pdmData?.version || null
  if (!cloudVersion) {
    // Not synced yet - show simple text, no dropdown
    return <span className="text-plm-fg-muted">-/-</span>
  }
  
  // For synced files, use the dropdown component with full version history
  return <VersionHistoryDropdown file={file} />
}
