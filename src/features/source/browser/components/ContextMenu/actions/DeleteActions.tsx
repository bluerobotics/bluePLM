/**
 * Delete actions for context menu (delete local, delete server, delete both)
 */
import { CloudOff, Trash2, Undo2 } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'
import type { RefreshableActionProps, SelectionCounts, SelectionState } from './types'

interface DeleteActionsProps extends RefreshableActionProps {
  counts: SelectionCounts
  state: SelectionState
  setDeleteConfirm: (file: LocalFile | null) => void
  setDeleteEverywhere: (value: boolean) => void
  setCustomConfirm: (state: {
    title: string
    message: string
    warning?: string
    confirmText: string
    confirmDanger?: boolean
    onConfirm: () => void
  } | null) => void
  setDeleteLocalCheckoutConfirm: (state: {
    checkedOutFiles: LocalFile[]
    allFilesToProcess: LocalFile[]
    contextFiles: LocalFile[]
  } | null) => void
  undoStack: Array<{ type: 'delete'; file: LocalFile; originalPath: string }>
  handleUndo: () => void
}

export function DeleteActions({
  contextFiles,
  firstFile,
  onClose,
  onRefresh,
  counts,
  state,
  setDeleteConfirm,
  setDeleteEverywhere,
  setCustomConfirm,
  setDeleteLocalCheckoutConfirm,
  undoStack,
  handleUndo,
}: DeleteActionsProps) {
  const {
    files,
    user,
    addToast,
    addProcessingFolders,
    removeProcessingFolders,
    startSync,
    updateSyncProgress,
    endSync,
    removeFilesFromStore,
  } = usePDMStore()

  // Helper to get all files including those inside folders
  const getAllFilesFromSelection = () => {
    const allFilesResult: LocalFile[] = []
    for (const item of contextFiles) {
      if (item.isDirectory) {
        const folderPath = item.relativePath.replace(/\\/g, '/')
        const filesInFolder = files.filter(f => {
          if (f.isDirectory) return false
          const filePath = f.relativePath.replace(/\\/g, '/')
          return filePath.startsWith(folderPath + '/')
        })
        allFilesResult.push(...filesInFolder)
      } else {
        allFilesResult.push(item)
      }
    }
    return [...new Map(allFilesResult.map(f => [f.path, f])).values()]
  }

  const allFilesInSelection = getAllFilesFromSelection()
  const syncedFilesInDelete = allFilesInSelection.filter(f => 
    f.pdmData && 
    f.diffStatus !== 'cloud' && 
    f.diffStatus !== 'cloud_new' && 
    f.diffStatus !== 'added' && 
    f.diffStatus !== 'deleted_remote'
  )
  const unsyncedFilesInDelete = allFilesInSelection.filter(f => 
    !f.pdmData || 
    f.diffStatus === 'added' || 
    f.diffStatus === 'deleted_remote'
  )
  
  const hasLocalFiles = contextFiles.some(f => f.diffStatus !== 'cloud' && f.diffStatus !== 'cloud_new')
  const hasSyncedFiles = syncedFilesInDelete.length > 0 || contextFiles.some(f => 
    f.pdmData && f.diffStatus !== 'cloud' && f.diffStatus !== 'cloud_new'
  )
  const hasUnsyncedLocalFiles = unsyncedFilesInDelete.length > 0 || contextFiles.some(f => 
    (!f.pdmData || f.diffStatus === 'added' || f.diffStatus === 'deleted_remote') && 
    f.diffStatus !== 'cloud' && 
    f.diffStatus !== 'cloud_new'
  )

  return (
    <>
      <div className="context-menu-separator" />
      
      {/* Remove Local Copy - removes local copy of synced files, keeps server */}
      {hasLocalFiles && hasSyncedFiles && (
        <div 
          className="context-menu-item"
          onClick={async () => {
            onClose()
            
            const filesToProcess = syncedFilesInDelete
            
            if (filesToProcess.length === 0) {
              addToast('info', 'No synced files to remove locally')
              return
            }
            
            const checkedOutByMe = filesToProcess.filter(f => f.pdmData?.checked_out_by === user?.id)
            
            if (checkedOutByMe.length > 0) {
              setDeleteLocalCheckoutConfirm({
                checkedOutFiles: checkedOutByMe,
                allFilesToProcess: filesToProcess,
                contextFiles: [...contextFiles]
              })
              return
            }
            
            executeCommand('delete-local', { files: contextFiles }, { onRefresh })
          }}
        >
          <Trash2 size={14} />
          Remove Local Copy ({syncedFilesInDelete.length} file{syncedFilesInDelete.length !== 1 ? 's' : ''})
        </div>
      )}
      
      {/* Delete Locally - for unsynced local files only */}
      {hasUnsyncedLocalFiles && !hasSyncedFiles && !state.allCloudOnly && (
        <div 
          className="context-menu-item danger"
          onClick={async () => {
            onClose()
            
            const filesToDelete = unsyncedFilesInDelete.length > 0 
              ? unsyncedFilesInDelete 
              : contextFiles.filter(f => !f.pdmData || f.diffStatus === 'added' || f.diffStatus === 'deleted_remote')
            
            if (filesToDelete.length === 0) {
              addToast('info', 'No local files to delete')
              return
            }
            
            setDeleteEverywhere(false)
            setDeleteConfirm(firstFile)
          }}
        >
          <Trash2 size={14} />
          Delete Locally ({unsyncedFilesInDelete.length} file{unsyncedFilesInDelete.length !== 1 ? 's' : ''}{counts.folderCount > 0 ? `, ${counts.folderCount} folder${counts.folderCount !== 1 ? 's' : ''}` : ''})
        </div>
      )}
      
      {/* Delete from Server (Keep Local) */}
      {hasSyncedFiles && !state.allCloudOnly && (
        <div 
          className="context-menu-item"
          onClick={() => {
            onClose()
            const storedSyncedFiles = [...syncedFilesInDelete]
            
            setCustomConfirm({
              title: `Delete from Server ${storedSyncedFiles.length > 1 ? `${storedSyncedFiles.length} Items` : 'Item'}?`,
              message: `${storedSyncedFiles.length} file${storedSyncedFiles.length > 1 ? 's' : ''} will be removed from the server. Local copies will be kept.`,
              warning: 'Local copies will become unsynced. Files can be recovered from server trash within 30 days.',
              confirmText: 'Delete from Server',
              confirmDanger: false,
              onConfirm: async () => {
                executeCommand('delete-server', { files: contextFiles, deleteLocal: false }, { onRefresh })
              }
            })
          }}
        >
          <CloudOff size={14} />
          Delete from Server ({syncedFilesInDelete.length} file{syncedFilesInDelete.length !== 1 ? 's' : ''})
        </div>
      )}
      
      {/* Delete Local & Server */}
      {(hasSyncedFiles || state.allCloudOnly) && (
        <div 
          className="context-menu-item danger"
          onClick={async () => {
            if (state.allCloudOnly) {
              onClose()
              
              const cloudFiles = contextFiles.filter(f => f.diffStatus === 'cloud')
              const allCloudFiles: LocalFile[] = []
              for (const item of cloudFiles) {
                if (item.isDirectory) {
                  const folderPath = item.relativePath.replace(/\\/g, '/')
                  const filesInFolder = files.filter(f => {
                    if (f.isDirectory) return false
                    if (f.diffStatus !== 'cloud' && f.diffStatus !== 'cloud_new') return false
                    const filePath = f.relativePath.replace(/\\/g, '/')
                    return filePath.startsWith(folderPath + '/')
                  })
                  allCloudFiles.push(...filesInFolder)
                } else if (item.pdmData?.id) {
                  allCloudFiles.push(item)
                }
              }
              const uniqueCloudFiles = [...new Map(allCloudFiles.map(f => [f.path, f])).values()]
              
              if (uniqueCloudFiles.length === 0) {
                const emptyFolders = contextFiles.filter(f => f.isDirectory && f.diffStatus === 'cloud')
                const pathsToRemove = emptyFolders.map(f => f.path)
                removeFilesFromStore(pathsToRemove)
                addToast('success', `Removed ${emptyFolders.length} empty folder${emptyFolders.length !== 1 ? 's' : ''}`)
                return
              }
              
              const storedCloudFiles = [...uniqueCloudFiles]
              const pathsToProcess = [
                ...storedCloudFiles.map(f => f.relativePath),
                ...contextFiles.filter(f => f.isDirectory && f.diffStatus === 'cloud').map(f => f.relativePath)
              ]
              const uniquePaths = [...new Set(pathsToProcess)]
              
              setCustomConfirm({
                title: `Delete ${uniqueCloudFiles.length} Item${uniqueCloudFiles.length > 1 ? 's' : ''} from Server?`,
                message: `${uniqueCloudFiles.length} file${uniqueCloudFiles.length > 1 ? 's' : ''} will be deleted from the server.`,
                warning: 'Files can be recovered from trash within 30 days.',
                confirmText: 'Delete from Server',
                confirmDanger: true,
                onConfirm: async () => {
                  const total = storedCloudFiles.length
                  
                  addProcessingFolders(uniquePaths)
                  startSync(total, 'upload')
                  
                  let deleted = 0
                  let failed = 0
                  
                  for (const file of storedCloudFiles) {
                    if (usePDMStore.getState().syncProgress.cancelRequested) {
                      break
                    }
                    
                    if (!file.pdmData?.id) {
                      failed++
                      continue
                    }
                    try {
                      const { softDeleteFile } = await import('@/lib/supabase')
                      const result = await softDeleteFile(file.pdmData.id, user!.id)
                      
                      if (result.success) deleted++
                      else {
                        console.error('Failed to delete file from server:', file.name, result.error)
                        failed++
                      }
                    } catch (err) {
                      console.error('Failed to delete file from server:', file.name, err)
                      failed++
                    }
                    
                    const percent = Math.round(((deleted + failed) / total) * 100)
                    updateSyncProgress(deleted + failed, percent, '')
                  }
                  
                  removeProcessingFolders(uniquePaths)
                  endSync()
                  
                  if (deleted > 0) {
                    addToast('success', `Deleted ${deleted} file${deleted > 1 ? 's' : ''} from server`)
                    onRefresh(true)
                  }
                }
              })
            } else {
              setDeleteEverywhere(true)
              setDeleteConfirm(firstFile)
              onClose()
            }
          }}
        >
          <CloudOff size={14} />
          {state.allCloudOnly ? 'Delete from Server' : 'Delete Local & Server'} ({syncedFilesInDelete.length + counts.cloudOnlyCount} file{(syncedFilesInDelete.length + counts.cloudOnlyCount) !== 1 ? 's' : ''}{counts.folderCount > 0 ? `, ${counts.folderCount} folder${counts.folderCount !== 1 ? 's' : ''}` : ''})
        </div>
      )}
      
      <div className="context-menu-separator" />
      
      {/* Undo */}
      <div 
        className={`context-menu-item ${undoStack.length === 0 ? 'disabled' : ''}`}
        onClick={() => {
          if (undoStack.length > 0) {
            handleUndo()
          }
          onClose()
        }}
      >
        <Undo2 size={14} />
        Undo
        <span className="text-xs text-plm-fg-muted ml-auto">Ctrl+Z</span>
      </div>
    </>
  )
}
