import { memo, useEffect, useCallback } from 'react'
import { AlertTriangle, FolderOpen, File, Trash2 } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'

export interface DeleteConfirmDialogProps {
  /** Files to be deleted */
  filesToDelete: LocalFile[]
  /** Whether to delete from server too */
  deleteEverywhere: boolean
  /** Number of synced files that will be deleted from server */
  syncedFilesCount: number
  /** Toggle for deleteEverywhere checkbox */
  onToggleDeleteEverywhere: () => void
  /** Called when delete is confirmed */
  onConfirm: () => void
  /** Called when dialog is cancelled */
  onCancel: () => void
}

/**
 * Delete confirmation dialog with options for local-only or server delete
 */
export const DeleteConfirmDialog = memo(function DeleteConfirmDialog({
  filesToDelete,
  deleteEverywhere,
  syncedFilesCount,
  onToggleDeleteEverywhere,
  onConfirm,
  onCancel
}: DeleteConfirmDialogProps) {
  const deleteCount = filesToDelete.length
  const folderCount = filesToDelete.filter(f => f.isDirectory).length
  const fileCount = filesToDelete.filter(f => !f.isDirectory).length
  const firstFile = filesToDelete[0]
  
  // Check if any files are synced (have pdmData)
  const hasSyncedFiles = filesToDelete.some(f => f.pdmData?.id)
  
  // Handle Enter key to confirm
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }, [onConfirm, onCancel])
  
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
  
  return (
    <>
      <div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
        onClick={onCancel}
      >
        <div 
          className="bg-plm-bg-light border border-plm-border rounded-lg p-6 max-w-md shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-plm-error/20 flex items-center justify-center">
              <AlertTriangle size={20} className="text-plm-error" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-plm-fg">
                {deleteEverywhere ? 'Delete Local & Server' : 'Delete'} {deleteCount > 1 ? `${deleteCount} Items` : firstFile?.isDirectory ? 'Folder' : 'File'}?
              </h3>
              <p className="text-sm text-plm-fg-muted">
                {deleteEverywhere 
                  ? 'Items will be deleted locally AND from the server.'
                  : 'Local copies will be removed. Synced files remain on the server.'}
              </p>
            </div>
          </div>
          
          <div className="bg-plm-bg rounded border border-plm-border p-3 mb-4 max-h-40 overflow-y-auto">
            {deleteCount === 1 ? (
              <div className="flex items-center gap-2">
                {firstFile?.isDirectory ? (
                  <FolderOpen size={16} className="text-plm-fg-muted" />
                ) : (
                  <File size={16} className="text-plm-fg-muted" />
                )}
                <span className="text-plm-fg font-medium truncate">{firstFile?.name}</span>
              </div>
            ) : (
              <>
                <div className="text-sm text-plm-fg mb-2">
                  {fileCount > 0 && <span>{fileCount} file{fileCount > 1 ? 's' : ''}</span>}
                  {fileCount > 0 && folderCount > 0 && <span>, </span>}
                  {folderCount > 0 && <span>{folderCount} folder{folderCount > 1 ? 's' : ''}</span>}
                </div>
                <div className="space-y-1">
                  {filesToDelete.slice(0, 5).map(f => (
                    <div key={f.path} className="flex items-center gap-2 text-sm">
                      {f.isDirectory ? (
                        <FolderOpen size={14} className="text-plm-fg-muted" />
                      ) : (
                        <File size={14} className="text-plm-fg-muted" />
                      )}
                      <span className="text-plm-fg-dim truncate">{f.name}</span>
                    </div>
                  ))}
                  {filesToDelete.length > 5 && (
                    <div className="text-xs text-plm-fg-muted">
                      ...and {filesToDelete.length - 5} more
                    </div>
                  )}
                </div>
              </>
            )}
            {folderCount > 0 && (
              <p className="text-xs text-plm-fg-muted mt-2">
                All contents inside folders will also be deleted.
              </p>
            )}
          </div>
          
          {/* Delete everywhere toggle - only show if there are synced files */}
          {hasSyncedFiles && (
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteEverywhere}
                onChange={onToggleDeleteEverywhere}
                className="w-4 h-4 rounded border-plm-border text-plm-error"
              />
              <span className="text-sm text-plm-fg">Also delete from server</span>
            </label>
          )}
          
          {/* Warning for delete everywhere */}
          {deleteEverywhere && syncedFilesCount > 0 && (
            <div className="bg-plm-warning/10 border border-plm-warning/30 rounded p-3 mb-4">
              <p className="text-sm text-plm-warning font-medium">
                ⚠️ {syncedFilesCount} synced file{syncedFilesCount > 1 ? 's' : ''} will be deleted from the server.
              </p>
              <p className="text-xs text-plm-fg-muted mt-1">Files can be recovered from trash within 30 days.</p>
            </div>
          )}
          
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="btn bg-plm-error hover:bg-plm-error/80 text-white"
            >
              <Trash2 size={14} />
              {deleteEverywhere ? 'Delete Local & Server' : 'Delete'} {deleteCount > 1 ? `(${deleteCount})` : ''}
            </button>
          </div>
        </div>
      </div>
    </>
  )
})
