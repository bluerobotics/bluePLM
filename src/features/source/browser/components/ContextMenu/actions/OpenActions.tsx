/**
 * Open file/folder actions for context menu
 */
import { FolderSearch } from 'lucide-react'

import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { buildFullPath } from '@/lib/utils/path'
import { useTranslation } from '@/lib/i18n'
import type { ActionComponentProps } from './types'
import { getCountLabel } from '@/lib/utils'

interface OpenActionsProps extends ActionComponentProps {
  navigateToFolder: (path: string) => void
  /** When searching, offer a jump from a result row to its parent folder. */
  isSearching?: boolean
  onGoToFolder?: (file: LocalFile) => void
}

export function OpenActions({
  contextFiles,
  multiSelect,
  firstFile,
  onClose,
  navigateToFolder,
  isSearching,
  onGoToFolder,
}: OpenActionsProps) {
  const vaultPath = usePDMStore((s) => s.vaultPath)
  const { t } = useTranslation()

  // A 'moved_away' stub has nothing on disk at its own path - open its real, current
  // location instead of failing on a path that no longer exists.
  const openFile = (file: LocalFile) => {
    if (file.diffStatus === 'moved_away') {
      if (file.movedToRelativePath && vaultPath) {
        window.electronAPI?.openFile(buildFullPath(vaultPath, file.movedToRelativePath))
      }
      return
    }
    window.electronAPI?.openFile(file.path)
  }

  const allFiles = contextFiles.every((f) => !f.isDirectory)
  const allCloudOnly = contextFiles.every((f) => f.diffStatus === 'cloud')
  const isFolder = firstFile.isDirectory
  const fileCount = contextFiles.filter((f) => !f.isDirectory).length
  const folderCount = contextFiles.filter((f) => f.isDirectory).length
  const countLabel = getCountLabel(fileCount, folderCount)

  // While searching, a single result row can jump to its parent folder, leaving the
  // vault-wide result set and selecting the file where it actually lives.
  const goToFolderItem =
    isSearching && !multiSelect && onGoToFolder ? (
      <div
        className="context-menu-item"
        onClick={() => {
          onGoToFolder(firstFile)
          onClose()
        }}
      >
        <FolderSearch size={14} />
        {t('contextMenu.goToFolder')}
      </div>
    ) : null

  // Single file - not cloud only
  if (!multiSelect && !isFolder && !allCloudOnly) {
    return (
      <>
        <div
          className="context-menu-item"
          onClick={() => {
            openFile(firstFile)
            onClose()
          }}
        >
          Open
        </div>
        {goToFolderItem}
      </>
    )
  }

  // Multiple files - all are files, not cloud only
  if (multiSelect && allFiles && !allCloudOnly) {
    return (
      <div
        className="context-menu-item"
        onClick={async () => {
          for (const file of contextFiles) {
            openFile(file)
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

  // Cloud-only single file (no Open above): still allow jumping to its folder while searching.
  return goToFolderItem
}
