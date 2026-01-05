/**
 * useFileSelection - File selection state and handlers hook
 * 
 * Manages row selection in the file browser with support for:
 * - Single click selection (replaces selection)
 * - Ctrl/Cmd+click (toggle individual file)
 * - Shift+click (range selection from last clicked)
 * - Shift+Ctrl/Cmd+click (add range to existing selection)
 * - Select all operation
 * 
 * Key exports:
 * - lastClickedIndex - Anchor point for shift-click range selection
 * - handleRowClick - Click handler with modifier key support
 * - selectAll, selectRange - Programmatic selection helpers
 * 
 * @example
 * const { handleRowClick, lastClickedIndex } = useFileSelection({
 *   sortedFiles,
 *   selectedFiles,
 *   setSelectedFiles,
 *   toggleFileSelection
 * })
 */
import { useState, useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface UseFileSelectionOptions {
  /** The sorted/filtered files to select from */
  sortedFiles: LocalFile[]
  selectedFiles: string[]
  setSelectedFiles: (paths: string[]) => void
  toggleFileSelection: (path: string, addToSelection?: boolean) => void
}

export interface UseFileSelectionReturn {
  lastClickedIndex: number | null
  setLastClickedIndex: (index: number | null) => void
  handleRowClick: (e: React.MouseEvent, file: LocalFile, index: number) => void
  selectAll: () => void
  selectRange: (startIndex: number, endIndex: number, addToExisting?: boolean) => void
}

/**
 * Hook to manage file selection state and handlers
 */
export function useFileSelection({
  sortedFiles,
  selectedFiles,
  setSelectedFiles,
  toggleFileSelection
}: UseFileSelectionOptions): UseFileSelectionReturn {
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)

  const handleRowClick = useCallback((e: React.MouseEvent, file: LocalFile, index: number) => {
    if (e.shiftKey && lastClickedIndex !== null) {
      // Shift+click: select range
      const start = Math.min(lastClickedIndex, index)
      const end = Math.max(lastClickedIndex, index)
      const rangePaths = sortedFiles.slice(start, end + 1).map(f => f.path)
      
      if (e.ctrlKey || e.metaKey) {
        // Add range to existing selection
        const newSelection = [...new Set([...selectedFiles, ...rangePaths])]
        setSelectedFiles(newSelection)
      } else {
        // Replace selection with range
        setSelectedFiles(rangePaths)
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle single item
      toggleFileSelection(file.path, true)
      setLastClickedIndex(index)
    } else {
      // Normal click: select single item
      setSelectedFiles([file.path])
      setLastClickedIndex(index)
    }
  }, [sortedFiles, selectedFiles, setSelectedFiles, toggleFileSelection, lastClickedIndex])

  const selectAll = useCallback(() => {
    setSelectedFiles(sortedFiles.map(f => f.path))
  }, [sortedFiles, setSelectedFiles])

  const selectRange = useCallback((startIndex: number, endIndex: number, addToExisting = false) => {
    const start = Math.min(startIndex, endIndex)
    const end = Math.max(startIndex, endIndex)
    const rangePaths = sortedFiles.slice(start, end + 1).map(f => f.path)
    
    if (addToExisting) {
      const newSelection = [...new Set([...selectedFiles, ...rangePaths])]
      setSelectedFiles(newSelection)
    } else {
      setSelectedFiles(rangePaths)
    }
  }, [sortedFiles, selectedFiles, setSelectedFiles])

  return {
    lastClickedIndex,
    setLastClickedIndex,
    handleRowClick,
    selectAll,
    selectRange
  }
}
