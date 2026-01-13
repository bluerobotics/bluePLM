/**
 * Delete Commands
 * 
 * Optimized batch deletion using the new deleteBatch IPC handler.
 * 
 * - delete-local: Remove local copies (keeps server version)
 * - delete-server: Soft delete from server (moves to trash)
 * 
 * Performance optimizations:
 * - Uses deleteBatch() for single IPC call instead of N individual calls
 * - Immediately updates store via removeFilesFromStore() (no file watcher wait)
 * - Uses atomic updateFilesAndClearProcessing() for single-render updates
 * - No onRefresh() calls - all updates are incremental
 */

import type { 
  Command, 
  DeleteLocalParams, 
  DeleteServerParams, 
  CommandResult,
  LocalFile
} from '../types'
import { 
  getSyncedFilesFromSelection, 
  getUnsyncedFilesFromSelection
} from '../types'
import { checkinFile, softDeleteFile } from '../../supabase'
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'
import { log } from '@/lib/logger'
import { FileOperationTracker } from '../../fileOperationTracker'

// Helper for timing-based logging
function logDelete(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown> = {}) {
  log[level]('[Delete]', message, { ...context, timestamp: Date.now() })
}

// ============================================
// Type Definitions
// ============================================

/**
 * Result from a single file deletion in the batch
 */
interface BatchDeleteFileResult {
  path: string
  success: boolean
  error?: string
}

/**
 * Summary statistics from the batch delete operation
 */
interface BatchDeleteSummary {
  total: number
  succeeded: number
  failed: number
  duration: number
}

/**
 * Result from the deleteBatch IPC call
 */
interface BatchDeleteResult {
  success: boolean
  results: BatchDeleteFileResult[]
  summary: BatchDeleteSummary
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extracts human-readable error messages from batch delete results.
 * Categorizes errors by type (locked files vs other errors).
 */
function extractDeleteErrors(
  results: BatchDeleteFileResult[],
  filesToRemove: LocalFile[]
): { errors: string[]; lockedFileErrors: string[] } {
  const errors: string[] = []
  const lockedFileErrors: string[] = []
  
  // Build a path-to-name lookup for readable error messages
  const pathToName = new Map(filesToRemove.map(f => [f.path, f.name]))
  
  for (const result of results) {
    if (!result.success && result.error) {
      const fileName = pathToName.get(result.path) || result.path.split(/[/\\]/).pop() || result.path
      const errorMsg = `${fileName}: ${result.error}`
      
      // Check if error is due to locked file (EBUSY, resource busy, etc.)
      if (result.error.includes('EBUSY') || 
          result.error.includes('resource busy') || 
          result.error.includes('locked')) {
        lockedFileErrors.push(errorMsg)
      }
      errors.push(errorMsg)
      log.error('[Delete]', 'Failed to remove local file', { path: result.path, error: result.error })
    }
  }
  
  return { errors, lockedFileErrors }
}

/**
 * Generates appropriate toast message for delete results.
 * Handles locked files, single file errors, and batch error summaries.
 */
function showDeleteResultToast(
  ctx: { addToast: (type: 'success' | 'warning' | 'error' | 'info', message: string) => void },
  succeeded: number,
  failed: number,
  total: number,
  errors: string[],
  lockedFileErrors: string[]
): void {
  if (failed > 0) {
    const isAllLocked = lockedFileErrors.length === errors.length && errors.length > 0
    
    if (isAllLocked) {
      // All failures are due to locked files - give helpful message
      const fileNames = lockedFileErrors.map(e => e.split(':')[0]).join(', ')
      if (succeeded === 0) {
        ctx.addToast('error', `Cannot delete - file${failed > 1 ? 's' : ''} open in another app: ${fileNames}`)
      } else {
        ctx.addToast('warning', `Removed ${succeeded}/${total}. ${failed} file${failed > 1 ? 's' : ''} locked (close in SolidWorks): ${fileNames}`)
      }
    } else if (total === 1 && errors.length > 0) {
      // Single file - show specific error
      ctx.addToast('warning', `Failed to remove: ${errors[0]}`)
    } else if (errors.length === 1) {
      // Multiple files but only one error - show it
      ctx.addToast('warning', `Removed ${succeeded}/${total} local files. Error: ${errors[0]}`)
    } else if (errors.length > 0) {
      // Multiple errors - summarize
      ctx.addToast('warning', `Removed ${succeeded}/${total} local files. ${errors.length} error(s) - check logs for details`)
    } else {
      ctx.addToast('warning', `Removed ${succeeded}/${total} local files`)
    }
  } else if (succeeded > 0) {
    ctx.addToast('success', `Removed ${succeeded} local file${succeeded > 1 ? 's' : ''}`)
  }
}

/**
 * Determines which folders should become cloud-only vs completely removed.
 * 
 * When deleting local files from a folder:
 * - If the folder will have cloud-only children remaining (synced files that were deleted locally),
 *   the folder should be updated to diffStatus: 'cloud' to remain visible in the tree
 * - If the folder will have no children remaining, it can be safely removed from the store
 * 
 * @param folderPaths - Array of folder paths that were selected for deletion
 * @param syncedFileUpdates - Files that will be updated to cloud-only status (contain path property)
 * @returns Object containing arrays of folder paths to make cloud-only vs remove entirely
 */
function categorizeFoldersForDeletion(
  folderPaths: string[],
  syncedFileUpdates: Array<{ path: string; updates: { diffStatus: 'cloud' } }>
): { foldersToMakeCloudOnly: string[]; foldersToRemove: string[] } {
  const foldersToMakeCloudOnly: string[] = []
  const foldersToRemove: string[] = []
  
  for (const folderPath of folderPaths) {
    // Normalize path separators for comparison
    const normalizedFolderPath = folderPath.replace(/\\/g, '/')
    
    // Check if any synced files inside this folder will become cloud-only
    const hasCloudChildren = syncedFileUpdates.some(update => {
      const normalizedFilePath = update.path.replace(/\\/g, '/')
      return normalizedFilePath.startsWith(normalizedFolderPath + '/')
    })
    
    if (hasCloudChildren) {
      foldersToMakeCloudOnly.push(folderPath)
    } else {
      foldersToRemove.push(folderPath)
    }
  }
  
  return { foldersToMakeCloudOnly, foldersToRemove }
}

/**
 * Releases checkouts for files checked out by the current user.
 * Returns paths that were successfully released.
 */
async function releaseCheckoutsForFiles(
  files: LocalFile[],
  userId: string
): Promise<void> {
  const filesToRelease = files.filter(f => 
    f.pdmData?.checked_out_by === userId && f.pdmData?.id
  )
  
  // Release checkouts in parallel (fire-and-forget, errors are logged but don't block)
  await Promise.all(
    filesToRelease.map(file => 
      checkinFile(file.pdmData!.id!, userId).catch(err => {
        log.warn('[Delete]', 'Failed to release checkout before delete', { 
          path: file.path, 
          error: err instanceof Error ? err.message : String(err) 
        })
      })
    )
  )
}

// ============================================
// Delete Local Command
// ============================================

export const deleteLocalCommand: Command<DeleteLocalParams> = {
  id: 'delete-local',
  name: 'Remove Local Copy',
  description: 'Remove local copies of files (keeps server version)',
  aliases: ['rm-local', 'remove'],
  usage: 'delete-local <path> [--recursive]',
  
  validate({ files }, ctx) {
    if (!files || files.length === 0) {
      return 'No files selected'
    }
    
    // Get synced files that exist locally
    const syncedFiles = getSyncedFilesFromSelection(ctx.files, files)
      .filter(f => f.diffStatus !== 'cloud')
    const unsyncedFiles = getUnsyncedFilesFromSelection(ctx.files, files)
    
    // Also check for local folders (not cloud-only)
    const localFolders = files.filter(f => f.isDirectory && f.diffStatus !== 'cloud')
    
    if (syncedFiles.length === 0 && unsyncedFiles.length === 0 && localFolders.length === 0) {
      return 'No local files to remove'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const operationStart = performance.now()
    const operationId = `delete-local-${Date.now()}`
    
    // Get files to remove for tracker initialization
    const syncedLocalFilesForTracker = getSyncedFilesFromSelection(ctx.files, files)
      .filter(f => f.diffStatus !== 'cloud')
    const unsyncedLocalFilesForTracker = getUnsyncedFilesFromSelection(ctx.files, files)
      .filter(f => !f.isDirectory)
    const filesToRemoveForTracker = [...syncedLocalFilesForTracker, ...unsyncedLocalFilesForTracker]
    
    // Initialize file operation tracker for DevTools monitoring
    const tracker = FileOperationTracker.start(
      'delete',
      filesToRemoveForTracker.length,
      filesToRemoveForTracker.map(f => f.relativePath)
    )
    
    logDelete('info', 'Starting delete-local operation', { 
      operationId,
      selectedCount: files.length 
    })
    
    const user = ctx.user
    
    // Get files to remove - both synced and unsynced local files
    const syncedLocalFiles = getSyncedFilesFromSelection(ctx.files, files)
      .filter(f => f.diffStatus !== 'cloud')
    const unsyncedLocalFiles = getUnsyncedFilesFromSelection(ctx.files, files)
      .filter(f => !f.isDirectory)
    const filesToRemove = [...syncedLocalFiles, ...unsyncedLocalFiles]
    
    // Get local folders to delete (even if empty)
    const localFolders = files.filter(f => f.isDirectory && f.diffStatus !== 'cloud')
    
    // Handle empty local folders with no files to remove
    if (filesToRemove.length === 0 && localFolders.length > 0) {
      // Yield FIRST to let the confirmation modal close before heavy work
      await new Promise(resolve => setTimeout(resolve, 0))
      
      const folderPaths = localFolders.map(f => f.path)
      
      // Use batch delete for folders
      const batchResult = await window.electronAPI?.deleteBatch(folderPaths, true) as BatchDeleteResult | undefined
      
      if (batchResult) {
        const deleted = batchResult.summary.succeeded
        
        // Immediately remove from store
        const deletedPaths = batchResult.results
          .filter(r => r.success)
          .map(r => r.path)
        if (deletedPaths.length > 0) {
          ctx.removeFilesFromStore(deletedPaths)
        }
        
        if (deleted > 0) {
          ctx.addToast('success', `Removed ${deleted} local folder${deleted !== 1 ? 's' : ''}`)
        }
        
        tracker.endOperation('completed')
        return {
          success: true,
          message: `Removed ${deleted} local folder${deleted !== 1 ? 's' : ''}`,
          total: localFolders.length,
          succeeded: deleted,
          failed: localFolders.length - deleted,
          duration: batchResult.summary.duration
        }
      }
      
      tracker.endOperation('failed', 'Delete operation failed')
      return {
        success: false,
        message: 'Delete operation failed',
        total: localFolders.length,
        succeeded: 0,
        failed: localFolders.length
      }
    }
    
    if (filesToRemove.length === 0) {
      ctx.addToast('info', 'No local files to remove')
      tracker.endOperation('completed')
      return {
        success: true,
        message: 'No local files to remove',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    // Track paths being processed - use SYNC version for immediate spinner display
    const foldersBeingProcessed = files.filter(f => f.isDirectory).map(f => f.relativePath)
    const filesBeingProcessed = files.filter(f => !f.isDirectory).map(f => f.relativePath)
    const allPathsBeingProcessed = [...foldersBeingProcessed, ...filesBeingProcessed]
    
    const total = filesToRemove.length
    
    // Progress tracking
    const toastId = `delete-${Date.now()}`
    const folderName = foldersBeingProcessed.length > 0
      ? foldersBeingProcessed[0].split('/').pop()
      : 'files'
    
    // Yield FIRST to let the confirmation modal close before heavy work
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // Now show progress UI
    ctx.addProcessingFoldersSync(allPathsBeingProcessed, 'delete')
    ctx.addProgressToast(toastId, `Removing ${folderName}...`, total)
    
    // ═══════════════════════════════════════════════════════════════════════════
    // OPTIMISTIC UI UPDATE: Update store BEFORE actual deletion for instant feedback
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Separate synced and unsynced files for different handling
    const syncedFiles = filesToRemove.filter(f => f.pdmData?.id)
    const unsyncedFilePaths = filesToRemove.filter(f => !f.pdmData?.id).map(f => f.path)
    
    // Build optimistic updates for synced files (show as cloud-only immediately)
    const optimisticSyncedUpdates = syncedFiles.map(f => ({
      path: f.path,
      updates: {
        diffStatus: 'cloud' as const,
        localHash: undefined,
        localMtime: undefined,
        localSize: undefined
      }
    }))
    
    // Apply optimistic updates immediately (UI shows files as deleted/cloud-only)
    if (optimisticSyncedUpdates.length > 0) {
      ctx.updateFilesInStore(optimisticSyncedUpdates)
    }
    if (unsyncedFilePaths.length > 0) {
      ctx.removeFilesFromStore(unsyncedFilePaths)
    }
    
    // Also optimistically handle folders being deleted
    const selectedFolderPaths = files.filter(f => f.isDirectory && f.diffStatus !== 'cloud').map(f => f.path)
    if (selectedFolderPaths.length > 0) {
      // For folders, determine which should become cloud-only vs removed
      const { foldersToMakeCloudOnly, foldersToRemove } = categorizeFoldersForDeletion(
        selectedFolderPaths,
        optimisticSyncedUpdates
      )
      
      if (foldersToMakeCloudOnly.length > 0) {
        const folderCloudUpdates = foldersToMakeCloudOnly.map(path => ({
          path,
          updates: {
            diffStatus: 'cloud' as const,
            localHash: undefined,
            localMtime: undefined,
            localSize: undefined
          }
        }))
        ctx.updateFilesInStore(folderCloudUpdates)
      }
      if (foldersToRemove.length > 0) {
        ctx.removeFilesFromStore(foldersToRemove)
      }
    }
    
    logDelete('info', 'Optimistic UI update complete - files removed from view', {
      syncedUpdated: optimisticSyncedUpdates.length,
      unsyncedRemoved: unsyncedFilePaths.length,
      foldersProcessed: selectedFolderPaths.length
    })
    
    // Yield to browser to allow UI to repaint before blocking file operations
    // This ensures the optimistic update is visible immediately
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // ═══════════════════════════════════════════════════════════════════════════
    // ACTUAL DELETION: Now perform the real file system operations
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Release checkouts for files checked out by current user
    if (user?.id) {
      await releaseCheckoutsForFiles(filesToRemove, user.id)
    }
    
    // Start tracking the delete phase
    const deleteStepId = tracker.startStep('Delete files', { fileCount: filesToRemove.length })
    const deletePhaseStart = Date.now()
    
    // Perform batch delete - single IPC call for all files
    const filePaths = filesToRemove.map(f => f.path)
    const batchResult = await window.electronAPI?.deleteBatch(filePaths, true) as BatchDeleteResult | undefined
    
    if (!batchResult) {
      // ATOMIC: Clear processing with no updates
      tracker.endStep(deleteStepId, 'failed', { error: 'No response from system' })
      ctx.updateFilesAndClearProcessing([], allPathsBeingProcessed)
      ctx.setLastOperationCompletedAt(Date.now())
      logDelete('error', 'Batch delete failed - no response from system', { total })
      ctx.removeToast(toastId)
      ctx.addToast('error', 'Delete operation failed - no response from system')
      tracker.endOperation('failed', 'No response from system')
      return {
        success: false,
        message: 'Delete operation failed',
        total,
        succeeded: 0,
        failed: total
      }
    }
    
    // End delete step
    tracker.endStep(deleteStepId, 'completed', { 
      succeeded: batchResult.summary.succeeded, 
      failed: batchResult.summary.failed,
      durationMs: Date.now() - deletePhaseStart
    })
    
    // Update progress to 100%
    ctx.updateProgressToast(toastId, total, 100, undefined, `${total}/${total}`)
    
    const succeeded = batchResult.summary.succeeded
    const failed = batchResult.summary.failed
    
    // Extract errors for user feedback
    const { errors, lockedFileErrors } = extractDeleteErrors(batchResult.results, filesToRemove)
    
    // Clear processing state (optimistic updates already done above)
    ctx.removeProcessingFolders(allPathsBeingProcessed)
    ctx.setLastOperationCompletedAt(Date.now())
    
    // Handle failures - restore files that couldn't be deleted
    const failedPaths = new Set(
      batchResult.results.filter(r => !r.success).map(r => r.path)
    )
    
    if (failedPaths.size > 0) {
      // Restore failed synced files (revert from cloud-only back to their original state)
      const failedSyncedFiles = syncedFiles.filter(f => failedPaths.has(f.path))
      if (failedSyncedFiles.length > 0) {
        const restoreUpdates = failedSyncedFiles.map(f => ({
          path: f.path,
          updates: {
            diffStatus: f.diffStatus,
            localHash: f.localHash,
            localMtime: f.modifiedTime,
            localSize: f.size
          }
        }))
        ctx.updateFilesInStore(restoreUpdates)
      }
      
      // Restore failed unsynced files (re-add them to the store)
      const failedUnsyncedFiles = filesToRemove.filter(f => 
        failedPaths.has(f.path) && !f.pdmData?.id
      )
      if (failedUnsyncedFiles.length > 0) {
        ctx.addFilesToStore(failedUnsyncedFiles)
      }
      
      logDelete('warn', 'Restored files that failed to delete', {
        syncedRestored: failedSyncedFiles.length,
        unsyncedRestored: failedUnsyncedFiles.length
      })
    }
    
    // Add auto-download exclusions for successfully deleted synced files
    const deletedSyncedFiles = syncedFiles.filter(f => !failedPaths.has(f.path))
    for (const file of deletedSyncedFiles) {
      if (file.relativePath) {
        ctx.addAutoDownloadExclusion(file.relativePath)
      }
    }
    
    ctx.removeToast(toastId)
    
    // Delete actual folders on disk (optimistic update already done)
    if (selectedFolderPaths.length > 0) {
      const { foldersToRemove } = categorizeFoldersForDeletion(
        selectedFolderPaths,
        optimisticSyncedUpdates
      )
      
      if (foldersToRemove.length > 0) {
        // Fire-and-forget folder deletion - UI already updated
        window.electronAPI?.deleteBatch(foldersToRemove, true).catch(err => {
          logDelete('warn', 'Failed to delete some folders', {
            error: err instanceof Error ? err.message : String(err)
          })
        })
      }
    }
    
    // Show result toast
    showDeleteResultToast(ctx, succeeded, failed, total, errors, lockedFileErrors)
    
    logDelete('info', 'Delete-local operation complete', {
      operationId,
      total,
      succeeded,
      failed,
      durationMs: Math.round(performance.now() - operationStart)
    })
    
    // Complete operation tracking
    tracker.endOperation(failed === 0 ? 'completed' : 'failed', failed > 0 ? errors[0] : undefined)
    
    return {
      success: failed === 0,
      message: failed > 0
        ? `Removed ${succeeded}/${total} local files`
        : `Removed ${succeeded} local file${succeeded > 1 ? 's' : ''}`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration: batchResult.summary.duration
    }
  }
}

// ============================================
// Delete Server Command
// ============================================

export const deleteServerCommand: Command<DeleteServerParams> = {
  id: 'delete-server',
  name: 'Delete from Server',
  description: 'Soft delete files from server (moves to trash)',
  aliases: ['rm', 'delete'],
  usage: 'delete-server <path> [--local] [--recursive]',
  
  validate({ files }, ctx) {
    if (ctx.isOfflineMode) {
      return 'Cannot delete from server while offline'
    }
    
    if (!ctx.user) {
      return 'Please sign in first'
    }
    
    if (!files || files.length === 0) {
      return 'No files selected'
    }
    
    // Get synced files (including cloud-only)
    const syncedFiles = getSyncedFilesFromSelection(ctx.files, files)
    const cloudOnlyFiles = files.filter(f => f.diffStatus === 'cloud' && f.pdmData?.id)
    const allFilesToDelete = [...new Map([...syncedFiles, ...cloudOnlyFiles].map(f => [f.path, f])).values()]
    
    if (allFilesToDelete.length === 0) {
      // Check for local-only folders OR empty cloud-only folders
      const hasLocalFolders = files.some(f => f.isDirectory && f.diffStatus !== 'cloud')
      const hasCloudOnlyFolders = files.some(f => f.isDirectory && f.diffStatus === 'cloud')
      if (!hasLocalFolders && !hasCloudOnlyFolders) {
        return 'No files to delete from server'
      }
    }
    
    return null
  },
  
  async execute({ files, deleteLocal = true }, ctx): Promise<CommandResult> {
    const operationStart = performance.now()
    const operationId = `delete-server-${Date.now()}`
    
    // Initialize file operation tracker for DevTools monitoring
    // Note: We track all selected files, actual count determined after filtering
    const tracker = FileOperationTracker.start(
      'delete',
      files.length,
      files.map(f => f.relativePath)
    )
    
    logDelete('info', 'Starting delete-server operation', { 
      operationId,
      selectedCount: files.length,
      deleteLocal
    })
    
    const user = ctx.user!
    
    // Get all synced files to delete from server (including files inside folders)
    const allFilesToDelete: LocalFile[] = []
    
    for (const item of files) {
      if (item.isDirectory) {
        // Get all synced files inside the folder
        const folderPath = item.relativePath.replace(/\\/g, '/')
        const filesInFolder = ctx.files.filter(f => {
          if (f.isDirectory) return false
          if (!f.pdmData?.id) return false
          const filePath = f.relativePath.replace(/\\/g, '/')
          return filePath.startsWith(folderPath + '/')
        })
        allFilesToDelete.push(...filesInFolder)
      } else if (item.pdmData?.id) {
        allFilesToDelete.push(item)
      }
    }
    
    // Remove duplicates
    const uniqueFiles = [...new Map(allFilesToDelete.map(f => [f.path, f])).values()]
    
    // Check for local folders to delete
    const hasLocalFolders = files.some(f => f.isDirectory && f.diffStatus !== 'cloud')
    const hasCloudOnlyFolders = files.some(f => f.isDirectory && f.diffStatus === 'cloud')
    
    // Handle empty cloud-only folders
    if (uniqueFiles.length === 0 && !hasLocalFolders) {
      if (hasCloudOnlyFolders) {
        const emptyFolders = files.filter(f => f.isDirectory && f.diffStatus === 'cloud')
        const pathsToRemove = emptyFolders.map(f => f.path)
        ctx.removeFilesFromStore(pathsToRemove)
        ctx.addToast('success', `Removed ${emptyFolders.length} empty folder${emptyFolders.length !== 1 ? 's' : ''}`)
        tracker.endOperation('completed')
        return {
          success: true,
          message: `Removed ${emptyFolders.length} empty folder${emptyFolders.length !== 1 ? 's' : ''}`,
          total: emptyFolders.length,
          succeeded: emptyFolders.length,
          failed: 0
        }
      }
      ctx.addToast('warning', 'No files to delete from server')
      tracker.endOperation('completed')
      return {
        success: false,
        message: 'No files to delete from server',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    // If only local folders with no server files, just delete locally using batch
    if (uniqueFiles.length === 0 && hasLocalFolders) {
      const foldersToDelete = files.filter(f => f.isDirectory && f.diffStatus !== 'cloud')
      const folderPaths = foldersToDelete.map(f => f.relativePath)
      const folderAbsolutePaths = foldersToDelete.map(f => f.path)
      
      ctx.addProcessingFoldersSync(folderPaths, 'delete')
      
      // OPTIMISTIC: Remove folders from store immediately for instant UI feedback
      ctx.removeFilesFromStore(folderAbsolutePaths)
      logDelete('info', 'Optimistic: Removed local folders from store', { count: foldersToDelete.length })
      
      // Yield to browser to allow UI to repaint before blocking file operations
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Now perform actual deletion in background
      const batchResult = await window.electronAPI?.deleteBatch(folderAbsolutePaths, true) as BatchDeleteResult | undefined
      
      // Clear processing state
      ctx.removeProcessingFolders(folderPaths)
      ctx.setLastOperationCompletedAt(Date.now())
      
      if (batchResult) {
        const deleted = batchResult.summary.succeeded
        const failedCount = batchResult.summary.failed
        
        // Restore any folders that failed to delete
        if (failedCount > 0) {
          const failedFolders = foldersToDelete.filter(f => 
            batchResult.results.some(r => r.path === f.path && !r.success)
          )
          if (failedFolders.length > 0) {
            ctx.addFilesToStore(failedFolders)
            logDelete('warn', 'Restored folders that failed to delete', { count: failedFolders.length })
          }
        }
        
        if (deleted > 0) {
          ctx.addToast('success', `Removed ${deleted} local folder${deleted !== 1 ? 's' : ''} (not synced to server)`)
        }
        
        tracker.endOperation('completed')
        return {
          success: true,
          message: `Removed ${deleted} local folder${deleted !== 1 ? 's' : ''} (not synced to server)`,
          total: foldersToDelete.length,
          succeeded: deleted,
          failed: failedCount,
          duration: batchResult.summary.duration
        }
      }
      
      // If batch delete failed entirely, restore all folders
      ctx.addFilesToStore(foldersToDelete)
      tracker.endOperation('failed', 'Delete operation failed')
      return {
        success: false,
        message: 'Delete operation failed',
        total: foldersToDelete.length,
        succeeded: 0,
        failed: foldersToDelete.length
      }
    }
    
    // Track paths being processed - use SYNC version for immediate spinner display
    const foldersSelected = files.filter(f => f.isDirectory).map(f => f.relativePath)
    const pathsBeingProcessed = uniqueFiles.map(f => f.relativePath)
    const allPathsBeingProcessed = [...new Set([...pathsBeingProcessed, ...foldersSelected])]
    
    const toastId = `delete-server-${Date.now()}`
    const totalFiles = uniqueFiles.length
    
    // Yield FIRST to let the confirmation modal close before heavy work
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // Now show progress UI
    ctx.addProcessingFoldersSync(allPathsBeingProcessed, 'delete')
    ctx.addProgressToast(toastId, `Deleting ${totalFiles} file${totalFiles !== 1 ? 's' : ''}...`, totalFiles)
    
    // ═══════════════════════════════════════════════════════════════════════════
    // OPTIMISTIC UI UPDATE: Remove files from store immediately for instant feedback
    // ═══════════════════════════════════════════════════════════════════════════
    const allPathsToRemove = files.map(f => f.path)
    ctx.removeFilesFromStore(allPathsToRemove)
    logDelete('info', 'Optimistic: Removed files from store for delete-server', { 
      count: allPathsToRemove.length 
    })
    
    // Yield again to let React paint the updated state
    await new Promise(resolve => setTimeout(resolve, 0))
    
    let deletedLocal = 0
    let deletedServer = 0
    const errors: string[] = []
    const startTime = Date.now()
    
    // STEP 1: Delete ALL local items first using batch operation
    if (deleteLocal) {
      const localItemsToDelete = files.filter(f => f.diffStatus !== 'cloud')
      if (localItemsToDelete.length > 0) {
        const localDeleteStepId = tracker.startStep('Delete local files', { 
          fileCount: localItemsToDelete.length 
        })
        const localDeleteStart = Date.now()
        
        // Release checkouts first
        await releaseCheckoutsForFiles(localItemsToDelete, user.id)
        
        // Batch delete local files
        const localPaths = localItemsToDelete.map(f => f.path)
        const localBatchResult = await window.electronAPI?.deleteBatch(localPaths, true) as BatchDeleteResult | undefined
        
        if (localBatchResult) {
          deletedLocal = localBatchResult.summary.succeeded
          
          // If any local deletions failed, restore those files
          const failedLocalPaths = new Set(
            localBatchResult.results.filter(r => !r.success).map(r => r.path)
          )
          if (failedLocalPaths.size > 0) {
            const failedFiles = localItemsToDelete.filter(f => failedLocalPaths.has(f.path))
            ctx.addFilesToStore(failedFiles)
            logDelete('warn', 'Restored files that failed local deletion', { count: failedFiles.length })
          }
        }
        
        tracker.endStep(localDeleteStepId, 'completed', { 
          succeeded: deletedLocal,
          durationMs: Date.now() - localDeleteStart
        })
      }
    }
    
    // STEP 2: Delete from server with concurrency limiting
    // Server operations still need individual API calls (no batch endpoint)
    let completedCount = 0
    
    if (uniqueFiles.length > 0) {
      const serverDeleteStepId = tracker.startStep('Delete from server', { 
        fileCount: uniqueFiles.length,
        concurrency: CONCURRENT_OPERATIONS
      })
      const serverDeleteStart = Date.now()
      
      const serverResults = await processWithConcurrency(uniqueFiles, CONCURRENT_OPERATIONS, async (file) => {
        if (!file.pdmData?.id) {
          completedCount++
          ctx.updateProgressToast(toastId, completedCount, Math.round((completedCount / totalFiles) * 100), undefined, `${completedCount}/${totalFiles}`)
          return false
        }
        try {
          const result = await softDeleteFile(file.pdmData.id, user.id)
          completedCount++
          ctx.updateProgressToast(toastId, completedCount, Math.round((completedCount / totalFiles) * 100), undefined, `${completedCount}/${totalFiles}`)
          return result.success
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          errors.push(`${file.name}: ${errorMsg}`)
          log.error('[Delete]', 'Failed to delete file from server', { fileName: file.name, error: errorMsg })
          completedCount++
          ctx.updateProgressToast(toastId, completedCount, Math.round((completedCount / totalFiles) * 100), undefined, `${completedCount}/${totalFiles}`)
          return false
        }
      })
      deletedServer = serverResults.filter(r => r).length
      
      tracker.endStep(serverDeleteStepId, 'completed', { 
        succeeded: deletedServer,
        failed: uniqueFiles.length - deletedServer,
        durationMs: Date.now() - serverDeleteStart
      })
      
      // Handle server deletion failures - restore files that failed
      const failedServerFiles = uniqueFiles.filter((_, i) => !serverResults[i])
      if (failedServerFiles.length > 0) {
        // Restore files that failed server deletion
        ctx.addFilesToStore(failedServerFiles)
        logDelete('warn', 'Restored files that failed server deletion', { 
          count: failedServerFiles.length 
        })
      }
      
      // If keeping local copies (deleteLocal = false), update successfully deleted files
      // to show as local-only (clear pdmData)
      if (!deleteLocal) {
        const keptLocalFiles = uniqueFiles.filter((f, i) => serverResults[i] && f.diffStatus !== 'cloud')
        
        if (keptLocalFiles.length > 0) {
          // Re-add these files with updated status (local-only)
          const localOnlyFiles = keptLocalFiles.map(f => ({
            ...f,
            pdmData: undefined,
            isSynced: false,
            diffStatus: 'added' as const
          }))
          ctx.addFilesToStore(localOnlyFiles)
          logDelete('info', 'Re-added kept local files with local-only status', {
            count: keptLocalFiles.length
          })
        }
      }
    }
    
    // Clean up processing indicators
    ctx.removeProcessingFolders(allPathsBeingProcessed)
    ctx.setLastOperationCompletedAt(Date.now())
    ctx.removeToast(toastId)
    
    const duration = Date.now() - startTime
    logDelete('info', 'Delete-server operation complete', {
      operationId,
      deletedServer,
      deletedLocal,
      durationMs: duration,
      totalDurationMs: Math.round(performance.now() - operationStart)
    })
    const failed = uniqueFiles.length - deletedServer
    
    // Build descriptive message
    let message = ''
    if (deletedServer > 0 && deletedLocal > 0) {
      message = `Deleted ${deletedServer} file${deletedServer !== 1 ? 's' : ''} from server (moved to trash) and removed local copies`
    } else if (deletedServer > 0) {
      message = `Deleted ${deletedServer} file${deletedServer !== 1 ? 's' : ''} from server (moved to trash)`
    } else if (deletedLocal > 0) {
      message = `Removed ${deletedLocal} local file${deletedLocal !== 1 ? 's' : ''}`
    } else {
      message = 'No files deleted'
    }
    
    // Show result toast
    if (deletedServer > 0 || deletedLocal > 0) {
      if (failed > 0 && errors.length > 0) {
        // Show error info when some files failed
        if (uniqueFiles.length === 1) {
          ctx.addToast('warning', `Failed to delete: ${errors[0]}`)
        } else if (errors.length === 1) {
          ctx.addToast('warning', `${message}. Error: ${errors[0]}`)
        } else {
          ctx.addToast('warning', `${message}. ${errors.length} error(s) - check logs for details`)
        }
      } else {
        ctx.addToast('success', message)
      }
    } else if (failed > 0 && errors.length > 0) {
      // All files failed
      if (errors.length === 1) {
        ctx.addToast('error', `Delete failed: ${errors[0]}`)
      } else {
        ctx.addToast('error', `Delete failed for ${failed} file(s) - check logs for details`)
      }
    }
    
    // No refresh needed - store updates are handled incrementally:
    // - Local files removed via removeFilesFromStore()
    // - Cloud-only files removed via removeFilesFromStore()
    // - Server deletion is reflected immediately in store updates
    
    // Complete operation tracking
    tracker.endOperation(failed === 0 ? 'completed' : 'failed', failed > 0 ? errors[0] : undefined)
    
    return {
      success: failed === 0,
      message,
      total: uniqueFiles.length || files.length,
      succeeded: deletedServer || deletedLocal,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      details: [
        `Deleted from server: ${deletedServer}`,
        `Deleted locally: ${deletedLocal}`
      ],
      duration
    }
  }
}
