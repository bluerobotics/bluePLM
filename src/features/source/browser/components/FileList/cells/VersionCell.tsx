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
    // Not synced yet - show version from copy source if available, otherwise -/-
    if (file.copiedVersion) {
      return <span className="text-plm-fg-muted" title={`Copied from version ${file.copiedVersion} (not yet synced)`}>{file.copiedVersion}/-</span>
    }
    return <span className="text-plm-fg-muted">-/-</span>
  }
  
  // For synced files, use the dropdown component with full version history
  return <VersionHistoryDropdown file={file} />
}
