/**
 * Take a finding's vault-relative path back to the file it is about.
 *
 * A finding names a value in a file, and the only useful next move is to look at that file. This
 * leaves settings, opens the containing folder with its ancestors expanded, selects the file and
 * scrolls to it - the same sequence the command palette and the item browser use, so the result
 * looks like every other jump in the app.
 */

import { useCallback, useMemo } from 'react'

import { usePDMStore, type LocalFile } from '@/stores/pdmStore'

export interface RevealInFileBrowser {
  /** Absolute path of the loaded file, or null when it has no local copy to show. */
  resolve: (relativePath: string) => string | null
  /** The loaded file itself, for its icon and thumbnail. Null when it is not loaded. */
  resolveFile: (relativePath: string) => LocalFile | null
  /** Opens the containing folder, and selects the file when it is loaded. */
  reveal: (relativePath: string) => void
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

export function useRevealInFileBrowser(): RevealInFileBrowser {
  const files = usePDMStore((state) => state.files)
  const expandedFolders = usePDMStore((state) => state.expandedFolders)
  const toggleFolder = usePDMStore((state) => state.toggleFolder)
  const setCurrentFolder = usePDMStore((state) => state.setCurrentFolder)
  const setSelectedFiles = usePDMStore((state) => state.setSelectedFiles)
  const setPendingScrollToFile = usePDMStore((state) => state.setPendingScrollToFile)
  const setActiveView = usePDMStore((state) => state.setActiveView)

  // Indexed once per loaded list. The findings table asks per visible row, and a linear search of
  // every loaded file for each of them is what made scrolling a long list stutter.
  const pathIndex = useMemo(() => {
    const index = new Map<string, LocalFile>()
    for (const file of files) {
      const key = normalize(file.relativePath)
      if (!index.has(key)) index.set(key, file)
    }
    return index
  }, [files])

  const resolveFile = useCallback(
    (relativePath: string) => pathIndex.get(normalize(relativePath)) ?? null,
    [pathIndex],
  )

  const resolve = useCallback(
    (relativePath: string) => resolveFile(relativePath)?.path ?? null,
    [resolveFile],
  )

  const reveal = useCallback(
    (relativePath: string) => {
      // A file that is not loaded (deleted, or outside what this vault shows) still has a folder
      // worth opening; only the selection needs the loaded row.
      const absolutePath = resolve(relativePath)

      const parts = relativePath.replace(/\\/g, '/').split('/')
      parts.pop()

      for (let depth = 1; depth <= parts.length; depth++) {
        const ancestor = parts.slice(0, depth).join('/')
        if (ancestor && !expandedFolders.has(ancestor)) toggleFolder(ancestor)
      }

      setCurrentFolder(parts.join('/'))
      if (absolutePath) {
        setSelectedFiles([absolutePath])
        setPendingScrollToFile(absolutePath)
      }
      setActiveView('explorer')
    },
    [
      resolve,
      expandedFolders,
      toggleFolder,
      setCurrentFolder,
      setSelectedFiles,
      setPendingScrollToFile,
      setActiveView,
    ],
  )

  return { resolve, resolveFile, reveal }
}
