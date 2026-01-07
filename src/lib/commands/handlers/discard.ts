/**
 * Discard Command
 * 
 * Discard local changes and revert to the server version.
 * For files that exist locally: downloads the server file and releases the checkout.
 * For 'deleted' files (checked out but deleted locally): just releases the checkout.
 */

import type { Command, DiscardParams, CommandResult, LocalFile } from '../types'
import { getDiscardableFilesFromSelection, getFilesInFolder } from '../types'
import { ProgressTracker } from '../executor'
import { checkinFile, undoCheckout } from '../../supabase'
import { getDownloadUrl } from '../../storage'
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'

// Detailed logging for discard operations
function logDiscard(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const logData = { timestamp, ...context }
  
  const prefix = '[Discard]'
  if (level === 'error') {
    console.error(prefix, message, logData)
  } else if (level === 'warn') {
    console.warn(prefix, message, logData)
  } else if (level === 'debug') {
    console.debug(prefix, message, logData)
  } else {
    console.log(prefix, message, logData)
  }
  
  try {
    window.electronAPI?.log(level, `${prefix} ${message}`, logData)
  } catch {
    // Ignore if electronAPI not available
  }
}

// Helper to get file context for logging
function getFileContext(file: LocalFile): Record<string, unknown> {
  return {
    fileName: file.name,
    relativePath: file.relativePath,
    fullPath: file.path,
    fileId: file.pdmData?.id,
    diffStatus: file.diffStatus,
    checkedOutBy: file.pdmData?.checked_out_by,
    checkedOutUser: file.pdmData?.checked_out_user?.email
  }
}

// Helper to analyze why files were filtered out
function analyzeFilterResults(
  files: LocalFile[],
  folderPath: string,
  userId: string
): {
  totalInFolder: number
  notSynced: number
  notCheckedOutByUser: number
  cloudOnly: number
  discardable: number
  samples: { notSynced: string[]; notCheckedOutByUser: string[]; cloudOnly: string[] }
} {
  const filesInFolder = getFilesInFolder(files, folderPath)
  const notSynced: LocalFile[] = []
  const notCheckedOutByUser: LocalFile[] = []
  const cloudOnly: LocalFile[] = []
  const discardable: LocalFile[] = []
  
  for (const f of filesInFolder) {
    if (!f.pdmData?.id) {
      notSynced.push(f)
    } else if (f.diffStatus === 'cloud' || f.diffStatus === 'cloud_new') {
      cloudOnly.push(f)
    } else if (f.pdmData.checked_out_by !== userId) {
      notCheckedOutByUser.push(f)
    } else {
      discardable.push(f)
    }
  }
  
  return {
    totalInFolder: filesInFolder.length,
    notSynced: notSynced.length,
    notCheckedOutByUser: notCheckedOutByUser.length,
    cloudOnly: cloudOnly.length,
    discardable: discardable.length,
    samples: {
      notSynced: notSynced.slice(0, 3).map(f => f.name),
      notCheckedOutByUser: notCheckedOutByUser.slice(0, 3).map(f => `${f.name} (by: ${f.pdmData?.checked_out_user?.email || f.pdmData?.checked_out_by || 'none'})`),
      cloudOnly: cloudOnly.slice(0, 3).map(f => f.name)
    }
  }
}

export const discardCommand: Command<DiscardParams> = {
  id: 'discard',
  name: 'Discard Changes',
  description: 'Discard local changes and revert to server version',
  aliases: ['revert', 'reset'],
  usage: 'discard <path>',
  
  validate({ files }, ctx) {
    if (ctx.isOfflineMode) {
      return 'Cannot discard changes while offline'
    }
    
    if (!ctx.user) {
      return 'Please sign in first'
    }
    
    if (!ctx.organization) {
      return 'No organization connected'
    }
    
    if (!ctx.vaultPath) {
      return 'No vault path configured'
    }
    
    if (!files || files.length === 0) {
      return 'No files selected'
    }
    
    // Get files checked out by current user (includes 'deleted' files)
    const discardableFiles = getDiscardableFilesFromSelection(ctx.files, files, ctx.user?.id)
    
    // Log filter analysis for debugging
    const folders = files.filter(f => f.isDirectory)
    if (folders.length > 0 && discardableFiles.length === 0) {
      for (const folder of folders) {
        const analysis = analyzeFilterResults(ctx.files, folder.relativePath, ctx.user.id)
        logDiscard('warn', 'No discardable files found in folder', {
          folder: folder.relativePath,
          userId: ctx.user.id,
          ...analysis
        })
      }
    }
    
    if (discardableFiles.length === 0) {
      return 'No files checked out by you to discard'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const user = ctx.user!
    const organization = ctx.organization!
    const operationId = `discard-${Date.now()}`
    
    logDiscard('info', 'Starting discard operation', {
      operationId,
      userId: user.id,
      selectedFileCount: files.length,
      selectedFolders: files.filter(f => f.isDirectory).map(f => f.relativePath),
      selectedFiles: files.filter(f => !f.isDirectory).map(f => f.name),
      contextFilesCount: ctx.files.length
    })
    
    // Get files checked out by current user (includes 'deleted' files)
    const filesToDiscard = getDiscardableFilesFromSelection(ctx.files, files, user.id)
    
    // Log detailed filter analysis for folders
    const folders = files.filter(f => f.isDirectory)
    for (const folder of folders) {
      const analysis = analyzeFilterResults(ctx.files, folder.relativePath, user.id)
      logDiscard('info', 'Folder filter analysis', {
        operationId,
        folder: folder.relativePath,
        ...analysis
      })
    }
    
    logDiscard('info', 'Files to discard after filtering', {
      operationId,
      count: filesToDiscard.length,
      files: filesToDiscard.map(f => ({
        name: f.name,
        diffStatus: f.diffStatus,
        checkedOutBy: f.pdmData?.checked_out_by
      }))
    })
    
    if (filesToDiscard.length === 0) {
      logDiscard('warn', 'No files to discard after filtering', {
        operationId,
        inputFilesCount: files.length
      })
      return {
        success: true,
        message: 'No files to discard',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    // Track folders being processed
    const foldersBeingProcessed = files
      .filter(f => f.isDirectory)
      .map(f => f.relativePath)
    ctx.addProcessingFolders(foldersBeingProcessed, 'sync')
    
    // Yield to event loop so React can render spinners before starting operation
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // Progress tracking
    const toastId = `discard-${Date.now()}`
    const total = filesToDiscard.length
    const progress = new ProgressTracker(
      ctx,
      'discard',
      toastId,
      `Discarding changes for ${total} file${total > 1 ? 's' : ''}...`,
      total
    )
    
    let succeeded = 0
    let failed = 0
    const errors: string[] = []
    
    // Process all files in parallel, collect updates for batch store update
    const pendingUpdates: Array<{ path: string; updates: Parameters<typeof ctx.updateFileInStore>[1] }> = []
    
    // Track paths to remove from store (deleted files that will become cloud-only)
    const pathsToRemove: string[] = []
    
    const results = await processWithConcurrency(filesToDiscard, CONCURRENT_OPERATIONS, async (file) => {
      const fileCtx = getFileContext(file)
      
      try {
        const contentHash = file.pdmData?.content_hash
        
        if (!contentHash) {
          logDiscard('warn', 'File has no content hash', { operationId, ...fileCtx })
          progress.update()
          return { success: false, error: `${file.name}: No content hash` }
        }
        
        // Check if file actually exists locally (don't trust diffStatus alone)
        const fileExists = await window.electronAPI?.fileExists(file.path)
        const isDeletedLocally = !fileExists || file.diffStatus === 'deleted'
        
        logDiscard('debug', 'Processing file', {
          operationId,
          ...fileCtx,
          contentHash,
          fileExists,
          isDeletedLocally
        })
        
        if (isDeletedLocally) {
          // For files that don't exist locally, just release checkout using undoCheckout
          // This is simpler than checkinFile and doesn't do any version/content logic
          const result = await undoCheckout(file.pdmData!.id, user.id)
          if (!result.success) {
            logDiscard('error', 'Failed to release checkout for deleted file', {
              operationId,
              ...fileCtx,
              error: result.error
            })
            progress.update()
            return { success: false, error: `${file.name}: ${result.error || 'Failed to release checkout'}` }
          }
          
          // Remove from store (will be re-added as 'cloud' on next refresh)
          pathsToRemove.push(file.path)
          logDiscard('debug', 'Released checkout for deleted file', { operationId, ...fileCtx })
        } else {
          // For files that exist locally, download server version to replace local changes
          const { url, error: urlError } = await getDownloadUrl(organization.id, contentHash)
          if (urlError || !url) {
            logDiscard('error', 'Failed to get download URL', {
              operationId,
              ...fileCtx,
              urlError
            })
            progress.update()
            return { success: false, error: `${file.name}: ${urlError || 'Failed to get download URL'}` }
          }
          
          await window.electronAPI?.setReadonly(file.path, false)
          const writeResult = await window.electronAPI?.downloadUrl(url, file.path)
          if (!writeResult?.success) {
            logDiscard('error', 'Download failed', { operationId, ...fileCtx })
            progress.update()
            return { success: false, error: `${file.name}: Download failed` }
          }
          
          // Release checkout using checkinFile (handles the file content properly)
          const result = await checkinFile(file.pdmData!.id, user.id)
          if (!result.success) {
            logDiscard('error', 'Failed to release checkout', { operationId, ...fileCtx })
            progress.update()
            return { success: false, error: `${file.name}: Failed to release checkout` }
          }
          
          // Set to read-only and update store
          await window.electronAPI?.setReadonly(file.path, true)
          pendingUpdates.push({
            path: file.path,
            updates: {
              pdmData: { ...file.pdmData!, checked_out_by: null, checked_out_user: null },
              localHash: contentHash,
              diffStatus: undefined,
              localActiveVersion: undefined
            }
          })
          logDiscard('debug', 'Discarded file successfully', { operationId, ...fileCtx })
        }
        progress.update()
        return { success: true }
        
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        logDiscard('error', 'Exception during discard', {
          operationId,
          ...fileCtx,
          error: errorMsg
        })
        progress.update()
        return { success: false, error: `${file.name}: ${errorMsg}` }
      }
    })
    
    // Apply all store updates in a single batch (avoids N re-renders)
    if (pendingUpdates.length > 0) {
      ctx.updateFilesInStore(pendingUpdates)
    }
    
    // Remove deleted files from store (they'll reappear as 'cloud' on next refresh)
    if (pathsToRemove.length > 0) {
      ctx.removeFilesFromStore(pathsToRemove)
    }
    
    // Count results
    for (const result of results) {
      if (result.success) succeeded++
      else {
        failed++
        if (result.error) errors.push(result.error)
      }
    }
    
    // Clean up - batch remove
    ctx.removeProcessingFolders(foldersBeingProcessed)
    const { duration } = progress.finish()
    
    logDiscard('info', 'Discard operation complete', {
      operationId,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    })
    
    // Small delay before refresh to let database changes propagate
    // This prevents race conditions with realtime subscriptions
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Force a full refresh (not silent) to ensure correct state after discard
    ctx.onRefresh?.(false)
    
    // Show result
    if (failed > 0) {
      ctx.addToast('warning', `Discarded ${succeeded}/${total} files`)
    } else {
      ctx.addToast('success', `Discarded ${succeeded} file${succeeded > 1 ? 's' : ''}`)
    }
    
    return {
      success: failed === 0,
      message: failed > 0 ? `Discarded ${succeeded}/${total} files` : `Discarded ${succeeded} file${succeeded > 1 ? 's' : ''}`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}

