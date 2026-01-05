/**
 * Version column cell renderer
 */
import type { CellRendererBaseProps } from './types'

export function VersionCell({ file }: CellRendererBaseProps): React.ReactNode {
  if (file.isDirectory) return ''
  
  const cloudVersion = file.pdmData?.version || null
  if (!cloudVersion) {
    // Not synced yet
    return <span className="text-plm-fg-muted">-/-</span>
  }
  
  // Check if we have a local active version (after rollback)
  if (file.localActiveVersion !== undefined && file.localActiveVersion !== cloudVersion) {
    return (
      <span className="text-plm-info" title={`Viewing version ${file.localActiveVersion} (latest is ${cloudVersion}). Check in to save.`}>
        {file.localActiveVersion}/{cloudVersion}
      </span>
    )
  }
  
  if (file.diffStatus === 'modified') {
    // Local content changes - local version is effectively cloud+1
    return (
      <span className="text-plm-warning" title={`Local changes (will be version ${cloudVersion + 1})`}>
        {cloudVersion + 1}/{cloudVersion}
      </span>
    )
  } else if (file.diffStatus === 'moved') {
    // File was moved but content unchanged
    return (
      <span className="text-plm-accent" title="File moved (version unchanged)">
        {cloudVersion}/{cloudVersion}
      </span>
    )
  } else if (file.diffStatus === 'outdated') {
    // Cloud has newer version
    const localVer = cloudVersion - 1
    return (
      <span className="text-purple-400" title="Newer version available on cloud">
        {localVer > 0 ? localVer : '?'}/{cloudVersion}
      </span>
    )
  }
  
  // In sync
  return <span>{cloudVersion}/{cloudVersion}</span>
}
