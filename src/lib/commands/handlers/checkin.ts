/**
 * Checkin Command
 * 
 * Check in files after editing. This:
 * 1. Uploads new content if modified
 * 2. Updates metadata on server
 * 3. Releases the checkout lock
 * 4. Makes the local file read-only
 */

import type { Command, CheckinParams, CommandResult } from '../types'
import { getSyncedFilesFromSelection } from '../types'
import { ProgressTracker } from '../executor'
import { checkinFile } from '../../supabase'
import type { LocalFile } from '../../../stores/pdmStore'

// Detailed logging for checkin operations
function logCheckin(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const logData = { timestamp, ...context }
  
  const prefix = '[Checkin]'
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

function getFileContext(file: LocalFile): Record<string, unknown> {
  return {
    fileName: file.name,
    relativePath: file.relativePath,
    fullPath: file.path,
    fileId: file.pdmData?.id,
    fileSize: file.size,
    localHash: file.localHash?.substring(0, 12),
    serverHash: file.pdmData?.content_hash?.substring(0, 12),
    version: file.pdmData?.version,
    state: file.pdmData?.state,
    hasPendingMetadata: !!file.pendingMetadata
  }
}

export const checkinCommand: Command<CheckinParams> = {
  id: 'checkin',
  name: 'Check In',
  description: 'Check in files after editing',
  aliases: ['ci'],
  usage: 'checkin <path> [--message "commit message"]',
  
  validate({ files }, ctx) {
    if (ctx.isOfflineMode) {
      return 'Cannot check in files while offline'
    }
    
    if (!ctx.user) {
      return 'Please sign in first'
    }
    
    if (!ctx.organization) {
      return 'No organization connected'
    }
    
    if (!files || files.length === 0) {
      return 'No files selected'
    }
    
    // Get synced files checked out by current user
    const syncedFiles = getSyncedFilesFromSelection(ctx.files, files)
    const checkinable = syncedFiles.filter(f => f.pdmData?.checked_out_by === ctx.user?.id)
    
    if (checkinable.length === 0) {
      // Check if files exist but aren't checked out by user
      if (syncedFiles.length > 0) {
        const checkedOutByOthers = syncedFiles.filter(f => 
          f.pdmData?.checked_out_by && f.pdmData.checked_out_by !== ctx.user?.id
        )
        if (checkedOutByOthers.length > 0) {
          return 'Files are checked out by other users'
        }
        return 'Files are not checked out by you'
      }
      return 'No files checked out by you'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const user = ctx.user!
    const operationId = `checkin-${Date.now()}`
    
    logCheckin('info', 'Starting checkin operation', {
      operationId,
      userId: user.id,
      selectedFileCount: files.length
    })
    
    // Get files checked out by current user
    const syncedFiles = getSyncedFilesFromSelection(ctx.files, files)
    const filesToCheckin = syncedFiles.filter(f => f.pdmData?.checked_out_by === user.id)
    
    logCheckin('debug', 'Filtered files for checkin', {
      operationId,
      syncedCount: syncedFiles.length,
      checkinableCount: filesToCheckin.length,
      checkedOutByOthers: syncedFiles.filter(f => f.pdmData?.checked_out_by && f.pdmData.checked_out_by !== user.id).length
    })
    
    if (filesToCheckin.length === 0) {
      logCheckin('info', 'No files to check in', { operationId })
      return {
        success: true,
        message: 'No files to check in',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    // Track folders and files being processed (for spinner display)
    const foldersBeingProcessed = files
      .filter(f => f.isDirectory)
      .map(f => f.relativePath)
    const filesBeingProcessed = filesToCheckin.map(f => f.relativePath)
    const allPathsBeingProcessed = [...new Set([...foldersBeingProcessed, ...filesBeingProcessed])]
    ctx.addProcessingFolders(allPathsBeingProcessed)
    
    // Yield to event loop so React can render spinners before starting operation
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // Progress tracking
    const toastId = `checkin-${Date.now()}`
    const total = filesToCheckin.length
    const progress = new ProgressTracker(
      ctx,
      'checkin',
      toastId,
      `Checking in ${total} file${total > 1 ? 's' : ''}...`,
      total
    )
    
    let succeeded = 0
    let failed = 0
    const errors: string[] = []
    
    // Process all files in parallel, collect updates for batch store update
    const pendingUpdates: Array<{ path: string; updates: Parameters<typeof ctx.updateFileInStore>[1] }> = []
    
    const results = await Promise.all(filesToCheckin.map(async (file) => {
      const fileCtx = getFileContext(file)
      
      try {
        const wasFileMoved = file.pdmData?.file_path && 
          file.relativePath !== file.pdmData.file_path
        const wasFileRenamed = file.pdmData?.file_name && 
          file.name !== file.pdmData.file_name
        
        logCheckin('debug', 'Checking in file', {
          operationId,
          ...fileCtx,
          wasFileMoved,
          wasFileRenamed,
          oldPath: wasFileMoved ? file.pdmData?.file_path : undefined,
          oldName: wasFileRenamed ? file.pdmData?.file_name : undefined
        })
        
        // Read file to get hash
        const readResult = await window.electronAPI?.readFile(file.path)
        
        if (!readResult?.success) {
          logCheckin('error', 'Failed to read local file', {
            operationId,
            ...fileCtx,
            readError: readResult?.error
          })
          progress.update()
          return { success: false, error: `${file.name}: Failed to read file - ${readResult?.error || 'Unknown error'}` }
        }
        
        if (readResult?.success && readResult.hash) {
          logCheckin('debug', 'File read successful, uploading', {
            operationId,
            fileName: file.name,
            localHash: readResult.hash.substring(0, 12),
            size: readResult.size
          })
          
          const result = await checkinFile(file.pdmData!.id, user.id, {
            newContentHash: readResult.hash,
            newFileSize: file.size,
            newFilePath: wasFileMoved ? file.relativePath : undefined,
            newFileName: wasFileRenamed ? file.name : undefined,
            pendingMetadata: file.pendingMetadata
          })
          
          if (result.success && result.file) {
            // Make file read-only
            const readonlyResult = await window.electronAPI?.setReadonly(file.path, true)
            if (readonlyResult?.success === false) {
              logCheckin('warn', 'Failed to set read-only flag', {
                operationId,
                fileName: file.name,
                error: readonlyResult.error
              })
            }
            
            // Queue update for batch processing
            pendingUpdates.push({
              path: file.path,
              updates: {
                pdmData: { ...file.pdmData!, ...result.file, checked_out_by: null, checked_out_user: null },
                localHash: readResult.hash,
                diffStatus: undefined,
                localActiveVersion: undefined,
                pendingMetadata: undefined
              }
            })
            
            logCheckin('debug', 'File checkin successful', {
              operationId,
              fileName: file.name,
              newVersion: result.file.version
            })
            progress.update()
            return { success: true }
          } else {
            logCheckin('error', 'Checkin API call failed', {
              operationId,
              ...fileCtx,
              error: result.error
            })
            progress.update()
            return { success: false, error: `${file.name}: ${result.error || 'Check in failed'}` }
          }
        } else {
          // Metadata-only checkin (no content change)
          logCheckin('debug', 'Metadata-only checkin', {
            operationId,
            fileName: file.name
          })
          
          const result = await checkinFile(file.pdmData!.id, user.id, {
            newFilePath: wasFileMoved ? file.relativePath : undefined,
            newFileName: wasFileRenamed ? file.name : undefined,
            pendingMetadata: file.pendingMetadata
          })
          
          if (result.success && result.file) {
            await window.electronAPI?.setReadonly(file.path, true)
            // Queue update for batch processing
            pendingUpdates.push({
              path: file.path,
              updates: {
                pdmData: { ...file.pdmData!, ...result.file, checked_out_by: null, checked_out_user: null },
                localHash: result.file.content_hash,
                diffStatus: undefined,
                localActiveVersion: undefined,
                pendingMetadata: undefined
              }
            })
            
            logCheckin('debug', 'Metadata checkin successful', {
              operationId,
              fileName: file.name
            })
            progress.update()
            return { success: true }
          } else {
            logCheckin('error', 'Metadata checkin failed', {
              operationId,
              ...fileCtx,
              error: result.error
            })
            progress.update()
            return { success: false, error: `${file.name}: ${result.error || 'Check in failed'}` }
          }
        }
      } catch (err) {
        logCheckin('error', 'Checkin exception', {
          operationId,
          ...fileCtx,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        })
        progress.update()
        return { success: false, error: `${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}` }
      }
    }))
    
    // Apply all store updates in a single batch (avoids N re-renders)
    if (pendingUpdates.length > 0) {
      ctx.updateFilesInStore(pendingUpdates)
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
    ctx.removeProcessingFolders(allPathsBeingProcessed)
    const { duration } = progress.finish()
    
    // Log final result
    logCheckin(failed > 0 ? 'warn' : 'info', 'Checkin operation complete', {
      operationId,
      total,
      succeeded,
      failed,
      duration,
      errors: errors.length > 0 ? errors : undefined
    })
    
    // Show result
    if (failed > 0) {
      // Show first error in toast for visibility
      const firstError = errors[0] || 'Unknown error'
      const moreText = errors.length > 1 ? ` (+${errors.length - 1} more)` : ''
      ctx.addToast('error', `Check-in failed: ${firstError}${moreText}`)
    } else {
      ctx.addToast('success', `Checked in ${succeeded} file${succeeded > 1 ? 's' : ''}`)
    }
    
    return {
      success: failed === 0,
      message: failed > 0 ? `Checked in ${succeeded}/${total} files` : `Checked in ${succeeded} file${succeeded > 1 ? 's' : ''}`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}

