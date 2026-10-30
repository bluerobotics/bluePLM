import { useCallback, useRef, RefObject } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'
import { useShortcuts } from '@/lib/keybindings'
import type { TreeMap } from '../types'

interface UseTreeKeyboardNavOptions {
  containerRef: RefObject<HTMLDivElement>
  tree: TreeMap
  onRename?: (file: LocalFile) => void
  onRefresh?: (silent?: boolean) => void
}

/**
 * Keyboard navigation in the explorer tree: the registry's fileTree.* shortcuts (arrows move and
 * expand, Enter opens, F2 renames, Delete deletes by default).
 */
export function useTreeKeyboardNav({
  containerRef,
  tree,
  onRename,
  onRefresh,
}: UseTreeKeyboardNavOptions) {
  // Selective state selectors - each subscription only triggers on its own changes
  const expandedFolders = usePDMStore((s) => s.expandedFolders)
  const selectedFiles = usePDMStore((s) => s.selectedFiles)

  // Actions grouped with useShallow
  const { toggleFolder, setSelectedFiles } = usePDMStore(
    useShallow((s) => ({ toggleFolder: s.toggleFolder, setSelectedFiles: s.setSelectedFiles })),
  )

  // Get flattened list of visible files for keyboard navigation
  const getVisibleFiles = useCallback((): LocalFile[] => {
    const result: LocalFile[] = []
    const addFiles = (items: LocalFile[]) => {
      for (const item of items) {
        result.push(item)
        if (item.isDirectory && expandedFolders.has(item.relativePath)) {
          const children = tree[item.relativePath] || []
          addFiles(
            children.sort((a, b) => {
              if (a.isDirectory && !b.isDirectory) return -1
              if (!a.isDirectory && b.isDirectory) return 1
              return a.name.localeCompare(b.name)
            }),
          )
        }
      }
    }
    addFiles(
      (tree[''] || []).sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      }),
    )
    return result
  }, [tree, expandedFolders])

  // Anchor of a Shift+Arrow range selection
  const lastClickedIndexRef = useRef<number | null>(null)

  /** The single selected row, or null (several or none selected). */
  const singleSelected = (visibleFiles: LocalFile[]): LocalFile | null =>
    selectedFiles.length === 1 ? (visibleFiles.find((f) => f.path === selectedFiles[0]) ?? null) : null

  const moveSelection = (event: KeyboardEvent, isUp: boolean): boolean => {
    const visibleFiles = getVisibleFiles()
    if (visibleFiles.length === 0) return false

    const focusIndex =
      selectedFiles.length > 0
        ? visibleFiles.findIndex((f) => f.path === selectedFiles[selectedFiles.length - 1])
        : -1

    if (focusIndex === -1) {
      const newIndex = isUp ? visibleFiles.length - 1 : 0
      setSelectedFiles([visibleFiles[newIndex].path])
      lastClickedIndexRef.current = newIndex
      return true
    }

    const newIndex = isUp
      ? Math.max(0, focusIndex - 1)
      : Math.min(visibleFiles.length - 1, focusIndex + 1)
    if (newIndex === focusIndex) return true

    if (event.shiftKey) {
      const anchorIndex = lastClickedIndexRef.current ?? focusIndex
      const start = Math.min(anchorIndex, newIndex)
      const end = Math.max(anchorIndex, newIndex)
      setSelectedFiles(visibleFiles.slice(start, end + 1).map((f) => f.path))
    } else {
      setSelectedFiles([visibleFiles[newIndex].path])
      lastClickedIndexRef.current = newIndex
    }
    return true
  }

  // The registry's fileTree.* shortcuts, while focus is in the tree. They take precedence over
  // the file pane's actions on the same keys.
  useShortcuts(
    'fileTree',
    {
      'fileTree.navigateUp': (e) => moveSelection(e, true),
      'fileTree.navigateDown': (e) => moveSelection(e, false),

      // Expand the selected folder
      'fileTree.expandFolder': () => {
        const selectedFile = singleSelected(getVisibleFiles())
        if (!selectedFile?.isDirectory) return false
        if (!expandedFolders.has(selectedFile.relativePath)) toggleFolder(selectedFile.relativePath)
        return true
      },

      // Collapse the selected folder, or select its parent
      'fileTree.collapseFolder': () => {
        const visibleFiles = getVisibleFiles()
        const selectedFile = singleSelected(visibleFiles)
        if (!selectedFile) return false

        if (selectedFile.isDirectory && expandedFolders.has(selectedFile.relativePath)) {
          toggleFolder(selectedFile.relativePath)
          return true
        }

        const parentPath = selectedFile.relativePath.includes('/')
          ? selectedFile.relativePath.substring(0, selectedFile.relativePath.lastIndexOf('/'))
          : ''
        if (!parentPath) return true
        const parentFile = visibleFiles.find((f) => f.relativePath === parentPath && f.isDirectory)
        if (parentFile) {
          setSelectedFiles([parentFile.path])
          lastClickedIndexRef.current = visibleFiles.indexOf(parentFile)
        }
        return true
      },

      // Open the selected file, or toggle the selected folder
      'fileTree.open': () => {
        const selectedFile = singleSelected(getVisibleFiles())
        if (!selectedFile) return false

        if (selectedFile.isDirectory) {
          toggleFolder(selectedFile.relativePath)
        } else if (selectedFile.diffStatus === 'cloud') {
          // Cloud-only file: download first, then open
          executeCommand('download', { files: [selectedFile] }, { onRefresh, silent: true }).then(
            (result) => {
              if (result.success && window.electronAPI) {
                window.electronAPI.openFile(selectedFile.path)
              }
            },
          )
        } else if (window.electronAPI) {
          window.electronAPI.openFile(selectedFile.path)
        }
        return true
      },

      'fileTree.rename': () => {
        if (!onRename) return false
        const selectedFile = singleSelected(getVisibleFiles())
        if (!selectedFile) return false
        onRename(selectedFile)
        return true
      },

      // Delete the selected files and folders. The delete-local command handles local deletion
      // and server sync for folders, with no confirmation (unified delete behaviour).
      'fileTree.delete': () => {
        if (selectedFiles.length === 0) return false
        const selectedItems = getVisibleFiles().filter((f) => selectedFiles.includes(f.path))
        if (selectedItems.length === 0) return true
        executeCommand('delete-local', { files: selectedItems }, { onRefresh })
        return true
      },
    },
    {
      isActive: (e) =>
        !!containerRef.current?.contains(document.activeElement) ||
        !!containerRef.current?.contains(e.target as Node),
    },
  )

  return { getVisibleFiles }
}
