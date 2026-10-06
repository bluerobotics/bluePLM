import { useCallback } from 'react'

import type { LocalFile } from '@/stores/pdmStore'
import { buildFullPath } from '@/lib/utils/path'

interface UseGoToFolderOptions {
  vaultPath: string | null
  navigateToFolder: (path: string) => void
  setSearchQuery: (query: string) => void
  setSelectedFiles: (paths: string[]) => void
  setPendingScrollToFile: (path: string | null) => void
}

/**
 * Leave search and land in a result's parent folder, with the file selected and scrolled into
 * view. A 'moved_away' stub has nothing on disk at its own path, so target where the content
 * actually lives. Mirrors the command palette's "open file location" behavior.
 *
 * Lives in its own hook rather than inline in `FilePane.tsx`, which is already over the
 * file-size split threshold.
 */
export function useGoToFolder({
  vaultPath,
  navigateToFolder,
  setSearchQuery,
  setSelectedFiles,
  setPendingScrollToFile,
}: UseGoToFolderOptions): (file: LocalFile) => void {
  return useCallback(
    (file: LocalFile) => {
      const relativePath =
        file.diffStatus === 'moved_away' && file.movedToRelativePath
          ? file.movedToRelativePath
          : file.relativePath
      const parts = relativePath.replace(/\\/g, '/').split('/')
      parts.pop() // drop the file name
      const parentPath = parts.join('/')

      setSearchQuery('')
      navigateToFolder(parentPath)

      const fullPath = vaultPath ? buildFullPath(vaultPath, relativePath) : file.path
      setSelectedFiles([fullPath])
      setPendingScrollToFile(fullPath)
    },
    [setSearchQuery, navigateToFolder, vaultPath, setSelectedFiles, setPendingScrollToFile],
  )
}
