import { useEffect, useCallback } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'
import { Dialog } from './Dialog'

export interface LockedFileInfo {
  filename: string
  relativePath: string
  fullPath: string
  process: string
}

export interface LockedFilesModalProps {
  open: boolean
  onClose: () => void
  lockedFiles: LockedFileInfo[]
  totalFiles: number
  folderName: string
  onProceed: () => void
}

/**
 * Modal displayed when attempting to move a folder that contains locked files.
 * Shows a list of locked files with their locking process.
 * Allows user to either cancel or proceed with moving only unlocked files.
 */
export function LockedFilesModal({
  open,
  onClose,
  lockedFiles,
  totalFiles,
  folderName,
  onProceed,
}: LockedFilesModalProps) {
  const unlockedCount = totalFiles - lockedFiles.length
  const canProceed = unlockedCount > 0
  
  // Max files to display before showing "and X more..."
  const MAX_DISPLAY = 10
  const displayFiles = lockedFiles.slice(0, MAX_DISPLAY)
  const remainingCount = lockedFiles.length - MAX_DISPLAY
  
  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [onClose])
  
  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      title="Some files are locked"
      className="max-w-lg"
    >
      <div className="space-y-4">
        {/* Warning message */}
        <div className="flex gap-3">
          <AlertTriangle size={24} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-plm-fg-muted">
            <p>
              {lockedFiles.length === totalFiles 
                ? `All ${totalFiles} files in "${folderName}" are locked and cannot be moved.`
                : `${lockedFiles.length} of ${totalFiles} files in "${folderName}" are locked and cannot be moved.`
              }
            </p>
          </div>
        </div>
        
        {/* Locked files list */}
        <div className="bg-plm-bg-tertiary rounded-lg border border-plm-border">
          <div className="px-3 py-2 border-b border-plm-border text-xs font-medium text-plm-fg-muted uppercase tracking-wide">
            Locked Files
          </div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {displayFiles.map((file, index) => (
                  <tr 
                    key={file.fullPath} 
                    className={index % 2 === 0 ? 'bg-plm-bg-tertiary' : 'bg-plm-bg-secondary'}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <Lock size={12} className="text-red-400 flex-shrink-0" />
                        <span className="text-plm-fg truncate" title={file.relativePath}>
                          {file.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <span className="text-plm-fg-muted text-xs">
                        {file.process}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {remainingCount > 0 && (
              <div className="px-3 py-2 text-xs text-plm-fg-muted border-t border-plm-border">
                ...and {remainingCount} more files
              </div>
            )}
          </div>
        </div>
        
        {/* Tip */}
        <p className="text-xs text-plm-fg-muted">
          <strong>Tip:</strong> Close SolidWorks or restart Windows Explorer to release locked files.
        </p>
        
        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-plm-fg-muted hover:bg-plm-bg-tertiary rounded"
          >
            Cancel
          </button>
          {canProceed && (
            <button
              onClick={() => {
                onProceed()
                onClose()
              }}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded"
            >
              Move unlocked files ({unlockedCount})
            </button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
