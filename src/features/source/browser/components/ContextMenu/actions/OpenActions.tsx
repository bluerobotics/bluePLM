/**
 * Open file/folder actions for context menu
 */
import type { ActionComponentProps } from './types'
import { getCountLabel } from '@/lib/utils'

interface OpenActionsProps extends ActionComponentProps {
  navigateToFolder: (path: string) => void
}

export function OpenActions({
  contextFiles,
  multiSelect,
  firstFile,
  onClose,
  navigateToFolder,
}: OpenActionsProps) {
  const allFiles = contextFiles.every(f => !f.isDirectory)
  const allCloudOnly = contextFiles.every(f => f.diffStatus === 'cloud' || f.diffStatus === 'cloud_new')
  const isFolder = firstFile.isDirectory
  const fileCount = contextFiles.filter(f => !f.isDirectory).length
  const folderCount = contextFiles.filter(f => f.isDirectory).length
  const countLabel = getCountLabel(fileCount, folderCount)

  // Single file - not cloud only
  if (!multiSelect && !isFolder && !allCloudOnly) {
    return (
      <div 
        className="context-menu-item"
        onClick={() => {
          window.electronAPI?.openFile(firstFile.path)
          onClose()
        }}
      >
        Open
      </div>
    )
  }

  // Multiple files - all are files, not cloud only
  if (multiSelect && allFiles && !allCloudOnly) {
    return (
      <div 
        className="context-menu-item"
        onClick={async () => {
          for (const file of contextFiles) {
            window.electronAPI?.openFile(file.path)
          }
          onClose()
        }}
      >
        Open All {countLabel}
      </div>
    )
  }

  // Single folder - not cloud only
  if (!multiSelect && isFolder && !allCloudOnly) {
    return (
      <div 
        className="context-menu-item"
        onClick={() => {
          navigateToFolder(firstFile.relativePath)
          onClose()
        }}
      >
        Open Folder
      </div>
    )
  }

  return null
}
