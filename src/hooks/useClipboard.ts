import { useState, useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import type { ToastType } from '@/stores/types'
import { 
  type Clipboard, 
  getCutBlockers, 
  executePaste 
} from '@/lib/fileOperations'

interface UseClipboardOptions {
  files: LocalFile[]
  selectedFiles: string[]
  userId?: string
  onRefresh?: (silent?: boolean) => void
  addToast?: (type: ToastType, message: string) => void
}

export function useClipboard(options: UseClipboardOptions) {
  const { files, selectedFiles, userId, onRefresh, addToast } = options
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)

  const getSelectedFileObjects = useCallback(() => {
    return files.filter(f => selectedFiles.includes(f.path))
  }, [files, selectedFiles])

  const handleCopy = useCallback(() => {
    const selected = getSelectedFileObjects()
    if (selected.length === 0) return

    setClipboard({ files: selected, operation: 'copy' })
    addToast?.('info', `Copied ${selected.length} item${selected.length > 1 ? 's' : ''}`)
  }, [getSelectedFileObjects, addToast])

  const handleCut = useCallback(() => {
    const selected = getSelectedFileObjects()
    if (selected.length === 0) return

    const blockers = getCutBlockers(selected, userId)
    if (blockers.length > 0) {
      const checkedOutByOthers = blockers.filter(f => 
        f.pdmData?.checked_out_by && f.pdmData.checked_out_by !== userId
      )
      if (checkedOutByOthers.length > 0) {
        addToast?.('error', `Cannot move: ${checkedOutByOthers.length} file${checkedOutByOthers.length > 1 ? 's are' : ' is'} checked out by others`)
      } else {
        addToast?.('error', `Cannot move: files not checked out by you`)
      }
      return
    }

    setClipboard({ files: selected, operation: 'cut' })
    addToast?.('info', `Cut ${selected.length} item${selected.length > 1 ? 's' : ''}`)
  }, [getSelectedFileObjects, userId, addToast])

  const handlePaste = useCallback(async (targetFolder: string) => {
    if (!clipboard) {
      addToast?.('info', 'Nothing to paste')
      return
    }

    const result = await executePaste(clipboard, targetFolder, onRefresh)
    
    if (clipboard.operation === 'cut') {
      setClipboard(null) // Clear after cut
    }

    if (!result.success) {
      addToast?.('error', result.error || 'Paste failed')
    }
  }, [clipboard, onRefresh, addToast])

  return {
    clipboard,
    setClipboard,
    handleCopy,
    handleCut,
    handlePaste,
    hasClipboard: clipboard !== null
  }
}
