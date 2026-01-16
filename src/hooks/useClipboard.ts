import { useCallback } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import type { LocalFile } from '@/stores/pdmStore'
import type { ToastType } from '@/stores/types'
import { executePaste } from '@/lib/fileOperations'

interface UseClipboardOptions {
  files: LocalFile[]
  selectedFiles: string[]
  userId?: string
  onRefresh?: (silent?: boolean) => void
  addToast?: (type: ToastType, message: string) => void
}

/**
 * Unified clipboard hook that reads/writes from Zustand store.
 * This ensures clipboard state is shared across FilePane and FileTree.
 */
export function useClipboard(options: UseClipboardOptions) {
  const { files, selectedFiles, onRefresh, addToast } = options
  
  // Read clipboard from Zustand store (single source of truth)
  const clipboard = usePDMStore(s => s.clipboard)
  const setClipboard = usePDMStore(s => s.setClipboard)
  const clearClipboard = usePDMStore(s => s.clearClipboard)

  const getSelectedFileObjects = useCallback(() => {
    return files.filter(f => selectedFiles.includes(f.path))
  }, [files, selectedFiles])

  const handleCopy = useCallback(() => {
    const selected = getSelectedFileObjects()
    if (selected.length === 0) return

    setClipboard({ files: selected, operation: 'copy' })
    addToast?.('info', `Copied ${selected.length} item${selected.length > 1 ? 's' : ''}`)
  }, [getSelectedFileObjects, setClipboard, addToast])

  const handleCut = useCallback(() => {
    const selected = getSelectedFileObjects()
    if (selected.length === 0) return

    setClipboard({ files: selected, operation: 'cut' })
    addToast?.('info', `Cut ${selected.length} item${selected.length > 1 ? 's' : ''}`)
  }, [getSelectedFileObjects, setClipboard, addToast])

  const handlePaste = useCallback(async (targetFolder: string) => {
    if (!clipboard) {
      addToast?.('info', 'Nothing to paste')
      return
    }

    const result = await executePaste(clipboard, targetFolder, onRefresh)
    
    if (clipboard.operation === 'cut') {
      clearClipboard() // Clear after cut
    }

    if (!result.success) {
      addToast?.('error', result.error || 'Paste failed')
    } else if (result.succeeded !== undefined) {
      if (result.succeeded === result.total) {
        addToast?.('success', `Pasted ${result.succeeded} file${result.succeeded > 1 ? 's' : ''}`)
      } else {
        addToast?.('warning', `Pasted ${result.succeeded}/${result.total} files`)
      }
    }
  }, [clipboard, onRefresh, clearClipboard, addToast])

  return {
    clipboard,
    setClipboard,
    handleCopy,
    handleCut,
    handlePaste,
    hasClipboard: clipboard !== null
  }
}
