import { useCallback } from 'react'
import { useShallow } from 'zustand/shallow'
import { usePDMStore, type LocalFile } from '@/stores/pdmStore'
import { buildFullPath } from '@/lib/utils/path'

/** Where picking a search result takes the explorer. */
export interface ResultTarget {
  /** Folder to open, vault-relative ('' = root). */
  folder: string
  /** File to select and scroll to in that folder, vault-relative. Null for a folder result. */
  select: string | null
}

/**
 * A folder result opens that folder; a file result opens its parent with the file selected. A
 * 'moved_away' stub has nothing on disk at its own path, so it goes where the content lives,
 * like the file pane's Go to Folder.
 */
export function resultTarget(file: LocalFile, mode: 'open' | 'location'): ResultTarget {
  const relativePath = (
    file.diffStatus === 'moved_away' && file.movedToRelativePath
      ? file.movedToRelativePath
      : file.relativePath
  ).replace(/\\/g, '/')
  if (file.isDirectory && mode === 'open') return { folder: relativePath, select: null }
  const parts = relativePath.split('/')
  parts.pop()
  return { folder: parts.join('/'), select: relativePath }
}

/**
 * Take the explorer to a search result. Opening a folder leaves search (`setCurrentFolder`), so
 * the pane shows the folder instead of the results it was picked from.
 */
export function useOpenResult(): (file: LocalFile, mode: 'open' | 'location') => void {
  const {
    vaultPath,
    activeView,
    expandedFolders,
    toggleFolder,
    setCurrentFolder,
    setSelectedFiles,
    setPendingScrollToFile,
    setActiveView,
    tabsEnabled,
    activeTabId,
    updateTabFolder,
  } = usePDMStore(
    useShallow((s) => ({
      vaultPath: s.vaultPath,
      activeView: s.activeView,
      expandedFolders: s.expandedFolders,
      toggleFolder: s.toggleFolder,
      setCurrentFolder: s.setCurrentFolder,
      setSelectedFiles: s.setSelectedFiles,
      setPendingScrollToFile: s.setPendingScrollToFile,
      setActiveView: s.setActiveView,
      tabsEnabled: s.tabsEnabled,
      activeTabId: s.activeTabId,
      updateTabFolder: s.updateTabFolder,
    })),
  )

  return useCallback(
    (file: LocalFile, mode: 'open' | 'location') => {
      const { folder, select } = resultTarget(file, mode)

      // Expand the folder and its ancestors so it is visible in the tree.
      const parts = folder ? folder.split('/') : []
      for (let depth = 1; depth <= parts.length; depth++) {
        const ancestor = parts.slice(0, depth).join('/')
        if (!expandedFolders.has(ancestor)) toggleFolder(ancestor)
      }

      // setActiveView also shows the sidebar, so leave a collapsed one alone when already there.
      if (activeView !== 'explorer') setActiveView('explorer')
      setCurrentFolder(folder)
      if (tabsEnabled && activeTabId) updateTabFolder(activeTabId, folder)

      if (select) {
        const fullPath = vaultPath ? buildFullPath(vaultPath, select) : file.path
        setSelectedFiles([fullPath])
        setPendingScrollToFile(fullPath)
      } else {
        setSelectedFiles([])
      }
    },
    [
      vaultPath,
      activeView,
      expandedFolders,
      toggleFolder,
      setCurrentFolder,
      setSelectedFiles,
      setPendingScrollToFile,
      setActiveView,
      tabsEnabled,
      activeTabId,
      updateTabFolder,
    ],
  )
}
