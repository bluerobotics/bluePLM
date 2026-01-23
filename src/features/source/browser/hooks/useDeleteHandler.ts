/**
 * useDeleteHandler - File deletion logic and handlers hook
 * 
 * Manages the complete file deletion workflow including:
 * - Computing files to delete (from multi-selection or single file)
 * - Counting synced files that will be removed from server
 * - Showing confirmation dialog with appropriate warnings
 * - Executing deletion (local-only or everywhere)
 * - Progress tracking for batch deletes
 * - Adding deleted files to undo stack
 * 
 * Key exports:
 * - filesToDelete - Computed list of files that will be deleted
 * - syncedFilesCount - Number of server-synced files in deletion
 * - showDeleteDialog - Whether confirmation dialog should show
 * - handleConfirmDelete - Execute the deletion
 * - handleCancelDelete, handleToggleDeleteEverywhere
 * 
 * @example
 * const {
 *   filesToDelete,
 *   showDeleteDialog,
 *   handleConfirmDelete
 * } = useDeleteHandler({
 *   deleteConfirm, selectedFiles, sortedFiles, user, ...
 * })
 */
import { useCallback, useMemo } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import type { OperationType } from '@/stores/types'
import type { UseDialogStateReturn } from './useDialogState'
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '@/lib/concurrency'

export interface UseDeleteHandlerOptions {
  // Dialog state
  deleteConfirm: LocalFile | null
  setDeleteConfirm: UseDialogStateReturn['setDeleteConfirm']
  deleteEverywhere: boolean
  setDeleteEverywhere: UseDialogStateReturn['setDeleteEverywhere']
  
  // File data
  selectedFiles: string[]
  sortedFiles: LocalFile[]
  files: LocalFile[]
  
  // User
  user: { id: string } | null
  
  // Operations
  clearSelection: () => void
  addProcessingFolders: (paths: string[], operationType: OperationType) => void
  removeProcessingFolders: (paths: string[]) => void
  setUndoStack: React.Dispatch<React.SetStateAction<Array<{ type: 'delete'; file: LocalFile; originalPath: string }>>>
  
  // Store actions for optimistic updates
  removeFilesFromStore: (paths: string[]) => void
  updateFilesInStore: (updates: Array<{ path: string; updates: Partial<LocalFile> }>) => void
  
  // Toast functions
  addToast: (type: 'success' | 'error' | 'warning' | 'info', message: string, duration?: number) => void
  addProgressToast: (id: string, message: string, total: number) => void
  removeToast: (id: string) => void
}

export interface UseDeleteHandlerReturn {
  /** Files that will be deleted (based on selection or single file) */
  filesToDelete: LocalFile[]
  /** Number of synced files that will be deleted from server */
  syncedFilesCount: number
  /** Whether delete dialog should be shown */
  showDeleteDialog: boolean
  /** Cancel the delete operation */
  handleCancelDelete: () => void
  /** Toggle delete from server */
  handleToggleDeleteEverywhere: () => void
  /** Confirm and execute the delete operation */
  handleConfirmDelete: () => Promise<void>
}

/**
 * Hook that handles file deletion logic including:
 * - Computing files to delete (from selection or single file)
 * - Computing synced files count for server deletion
 * - Delete confirmation handlers
 * - Executing delete operations (local and server)
 */
export function useDeleteHandler({
  deleteConfirm,
  setDeleteConfirm,
  deleteEverywhere,
  setDeleteEverywhere,
  selectedFiles,
  sortedFiles,
  files,
  user,
  clearSelection,
  addProcessingFolders,
  removeProcessingFolders,
  setUndoStack,
  removeFilesFromStore,
  updateFilesInStore,
  addToast,
  addProgressToast,
  removeToast,
}: UseDeleteHandlerOptions): UseDeleteHandlerReturn {
  
  // Compute files to delete (selected files if deleteConfirm is in selection, otherwise just deleteConfirm)
  const filesToDelete = useMemo(() => {
    if (!deleteConfirm) return []
    return selectedFiles.includes(deleteConfirm.path)
      ? sortedFiles.filter(f => selectedFiles.includes(f.path))
      : [deleteConfirm]
  }, [deleteConfirm, selectedFiles, sortedFiles])
  
  // Get all synced files that need server deletion (including files inside folders)
  const getSyncedFilesForServerDelete = useCallback(() => {
    const syncedFiles: LocalFile[] = []
    for (const item of filesToDelete) {
      if (item.isDirectory) {
        // Get all synced files inside the folder
        const folderPath = item.relativePath.replace(/\\/g, '/')
        const filesInFolder = files.filter(f => {
          if (f.isDirectory) return false
          if (!f.pdmData?.id) return false
          const filePath = f.relativePath.replace(/\\/g, '/')
          return filePath.startsWith(folderPath + '/')
        })
        syncedFiles.push(...filesInFolder)
      } else if (item.pdmData?.id) {
        syncedFiles.push(item)
      }
    }
    // Remove duplicates
    return [...new Map(syncedFiles.map(f => [f.path, f])).values()]
  }, [filesToDelete, files])
  
  // Compute synced files count
  const syncedFilesCount = useMemo(() => {
    if (!deleteEverywhere) return 0
    return getSyncedFilesForServerDelete().length
  }, [deleteEverywhere, getSyncedFilesForServerDelete])
  
  // Cancel delete
  const handleCancelDelete = useCallback(() => {
    setDeleteConfirm(null)
    setDeleteEverywhere(false)
  }, [setDeleteConfirm, setDeleteEverywhere])
  
  // Toggle delete from server
  const handleToggleDeleteEverywhere = useCallback(() => {
    setDeleteEverywhere(!deleteEverywhere)
  }, [deleteEverywhere, setDeleteEverywhere])
  
  // Confirm and execute delete
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return
    
    // Close dialog immediately - don't block
    const itemsToDelete = [...filesToDelete]
    const isDeleteEverywhere = deleteEverywhere
    const syncedFiles = isDeleteEverywhere ? getSyncedFilesForServerDelete() : []
    
    setDeleteConfirm(null)
    setDeleteEverywhere(false)
    clearSelection()
    
    // Yield to let the dialog close before heavy work
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // Track files/folders being deleted for spinner display - batch add
    const pathsBeingDeleted = itemsToDelete.map(f => f.relativePath)
    addProcessingFolders(pathsBeingDeleted, 'delete')
    
    const totalOps = itemsToDelete.filter(f => f.diffStatus !== 'cloud').length + (isDeleteEverywhere ? syncedFiles.length : 0)
    const toastId = `delete-${Date.now()}`
    
    if (isDeleteEverywhere && syncedFiles.length > 0) {
      addProgressToast(toastId, `Deleting ${totalOps} item${totalOps > 1 ? 's' : ''}...`, totalOps)
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // OPTIMISTIC UI UPDATE: Remove files from store immediately for instant feedback
    // ═══════════════════════════════════════════════════════════════════════════
    const allPathsToRemove = itemsToDelete.map(f => f.path)
    
    if (isDeleteEverywhere) {
      // Deleting everywhere - remove all files from UI immediately
      // Also include synced files inside folders
      const syncedFilePaths = syncedFiles.map(f => f.path)
      const uniquePathsToRemove = [...new Set([...allPathsToRemove, ...syncedFilePaths])]
      removeFilesFromStore(uniquePathsToRemove)
    } else {
      // Local-only delete - handle synced vs unsynced differently
      const syncedLocalFiles = itemsToDelete.filter(f => f.pdmData?.id && f.diffStatus !== 'cloud')
      const unsyncedFiles = itemsToDelete.filter(f => !f.pdmData?.id && !f.isDirectory)
      const localFolders = itemsToDelete.filter(f => f.isDirectory && f.diffStatus !== 'cloud')
      
      // Synced files become cloud-only
      if (syncedLocalFiles.length > 0) {
        const cloudUpdates = syncedLocalFiles.map(f => ({
          path: f.path,
          updates: {
            diffStatus: 'cloud' as const,
            localHash: undefined
          }
        }))
        updateFilesInStore(cloudUpdates)
      }
      
      // Unsynced files are removed entirely
      if (unsyncedFiles.length > 0) {
        removeFilesFromStore(unsyncedFiles.map(f => f.path))
      }
      
      // Folders with synced children become cloud-only, others are removed
      for (const folder of localFolders) {
        const folderPath = folder.relativePath.replace(/\\/g, '/')
        const hasSyncedChildren = syncedLocalFiles.some(f => {
          const filePath = f.relativePath.replace(/\\/g, '/')
          return filePath.startsWith(folderPath + '/')
        })
        
        if (hasSyncedChildren) {
          updateFilesInStore([{
            path: folder.path,
            updates: {
              diffStatus: 'cloud' as const,
              localHash: undefined
            }
          }])
        } else {
          removeFilesFromStore([folder.path])
        }
      }
    }
    
    // Yield to let React paint the updated state
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // ═══════════════════════════════════════════════════════════════════════════
    // REGISTER EXPECTED FILE CHANGES to suppress file watcher during deletion
    // ═══════════════════════════════════════════════════════════════════════════
    const { addExpectedFileChanges, setLastOperationCompletedAt } = usePDMStore.getState()
    const relativePaths = itemsToDelete.map(f => f.relativePath)
    addExpectedFileChanges(relativePaths)
    
    let deletedLocal = 0
    let deletedServer = 0
    let failedServer = 0
    const failedPaths: string[] = []
    
    try {
      if (isDeleteEverywhere) {
        // STEP 1: Release checkouts first (in parallel)
        const itemsWithCheckout = itemsToDelete.filter(
          item => item.pdmData?.checked_out_by === user?.id && item.pdmData?.id
        )
        if (itemsWithCheckout.length > 0) {
          const { checkinFile } = await import('@/lib/supabase')
          await Promise.all(
            itemsWithCheckout.map(item => 
              checkinFile(item.pdmData!.id!, user!.id).catch(() => {})
            )
          )
        }
        
        // STEP 2: Delete ALL local items using batch API (single watcher stop/start)
        const localItemsToDelete = [...itemsToDelete]
        
        if (localItemsToDelete.length > 0) {
          const paths = localItemsToDelete.map(f => f.path)
          const batchResult = await window.electronAPI?.deleteBatch(paths, true)
          
          if (batchResult?.results) {
            deletedLocal = batchResult.results.filter(r => r.success).length
            failedPaths.push(...batchResult.results.filter(r => !r.success).map(r => r.path))
          }
        }
        
        // STEP 3: Delete from server with concurrency limit
        if (syncedFiles.length > 0) {
          const { softDeleteFile } = await import('@/lib/supabase')
          
          const serverResults = await processWithConcurrency(syncedFiles, CONCURRENT_OPERATIONS, async (file) => {
            if (!file.pdmData?.id) return { path: file.path, success: false }
            try {
              const result = await softDeleteFile(file.pdmData.id, user!.id)
              return { path: file.path, success: result.success }
            } catch {
              return { path: file.path, success: false }
            }
          })
          
          deletedServer = serverResults.filter(r => r.success).length
          failedServer = serverResults.filter(r => !r.success).length
          failedPaths.push(...serverResults.filter(r => !r.success).map(r => r.path))
        }
      } else {
        // Regular local-only delete
        const localItemsToDelete = itemsToDelete.filter(f => f.diffStatus !== 'cloud')
        
        // Release checkouts first (in parallel)
        const itemsWithCheckout = localItemsToDelete.filter(
          item => item.pdmData?.checked_out_by === user?.id && item.pdmData?.id
        )
        if (itemsWithCheckout.length > 0) {
          const { checkinFile } = await import('@/lib/supabase')
          await Promise.all(
            itemsWithCheckout.map(item => 
              checkinFile(item.pdmData!.id!, user!.id).catch(() => {})
            )
          )
        }
        
        // Use batch delete API (single watcher stop/start)
        if (localItemsToDelete.length > 0) {
          const paths = localItemsToDelete.map(f => f.path)
          const batchResult = await window.electronAPI?.deleteBatch(paths, true)
          
          if (batchResult?.results) {
            // Add successfully deleted files to undo stack
            for (const result of batchResult.results) {
              if (result.success) {
                const file = localItemsToDelete.find(f => f.path === result.path)
                if (file) {
                  setUndoStack(prev => [...prev, { type: 'delete', file, originalPath: file.path }])
                }
              }
            }
            deletedLocal = batchResult.results.filter(r => r.success).length
            failedPaths.push(...batchResult.results.filter(r => !r.success).map(r => r.path))
          }
        }
      }
      
      // Remove progress toast
      if (isDeleteEverywhere && syncedFiles.length > 0) {
        removeToast(toastId)
      }
      
      // Show appropriate toast
      if (isDeleteEverywhere) {
        // Use server count as the meaningful count (folders count as 1 locally but contain many files)
        const displayCount = deletedServer > 0 ? deletedServer : deletedLocal
        if (failedServer > 0) {
          addToast('warning', `Deleted ${displayCount} item${displayCount !== 1 ? 's' : ''} (${failedServer} failed)`)
        } else {
          addToast('success', `Deleted ${displayCount} item${displayCount !== 1 ? 's' : ''}`)
        }
      } else {
        if (deletedLocal === itemsToDelete.filter(f => f.diffStatus !== 'cloud').length) {
          addToast('success', `Deleted ${deletedLocal} item${deletedLocal > 1 ? 's' : ''}`)
        } else {
          addToast('warning', `Deleted ${deletedLocal}/${itemsToDelete.length} items`)
        }
      }
    } finally {
      // Clean up spinners - batch remove
      removeProcessingFolders(pathsBeingDeleted)
      
      // Mark operation complete for file watcher suppression window
      setLastOperationCompletedAt(Date.now())
      
      // If any deletions failed, we may need to restore those files to the UI
      // For now, the next refresh will fix any inconsistencies
    }
  }, [
    deleteConfirm,
    filesToDelete,
    deleteEverywhere,
    getSyncedFilesForServerDelete,
    setDeleteConfirm,
    setDeleteEverywhere,
    clearSelection,
    addProcessingFolders,
    removeProcessingFolders,
    removeFilesFromStore,
    updateFilesInStore,
    user,
    setUndoStack,
    addToast,
    addProgressToast,
    removeToast,
  ])
  
  return {
    filesToDelete,
    syncedFilesCount,
    showDeleteDialog: deleteConfirm !== null,
    handleCancelDelete,
    handleToggleDeleteEverywhere,
    handleConfirmDelete,
  }
}
