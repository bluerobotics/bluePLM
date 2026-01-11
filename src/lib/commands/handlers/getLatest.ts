/**
 * Get Latest Command
 * 
 * Download newer versions of files from the server.
 * Used for outdated files (local exists but server has newer version).
 */

import type { Command, CommandResult, LocalFile } from '../types'
import { buildFullPath, getFilesInFolder } from '../types'
import { ProgressTracker } from '../executor'
import { getDownloadUrl } from '../../storage'
import { usePDMStore, MissingStorageFile } from '../../../stores/pdmStore'
import { isRetryableError, getNetworkErrorMessage, getBackoffDelay, sleep } from '../../network'
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'
import { log } from '@/lib/logger'
import { recordMetric } from '@/lib/performanceMetrics'

// Retry configuration
const MAX_RETRY_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 1000

export interface GetLatestParams {
  files: LocalFile[]
}

function logGetLatest(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown>) {
  log[level]('[GetLatest]', message, context)
}

// Build file context for logging
function getFileContext(file: LocalFile): Record<string, unknown> {
  return {
    fileName: file.name,
    relativePath: file.relativePath,
    fullPath: file.path,
    diffStatus: file.diffStatus,
    localHash: file.localHash?.substring(0, 12),
    serverHash: file.pdmData?.content_hash?.substring(0, 12),
    fileId: file.pdmData?.id,
    version: file.pdmData?.version,
    checkedOutBy: file.pdmData?.checked_out_by,
    state: file.pdmData?.workflow_state?.name
  }
}

// Helper to get outdated files from selection (handles folders)
export function getOutdatedFilesFromSelection(files: LocalFile[], selection: LocalFile[]): LocalFile[] {
  const result: LocalFile[] = []
  
  logGetLatest('debug', 'getOutdatedFilesFromSelection called', {
    totalFilesInContext: files.length,
    selectionCount: selection.length,
    selectionPaths: selection.map(f => ({ path: f.relativePath, diffStatus: f.diffStatus, isDir: f.isDirectory }))
  })
  
  for (const item of selection) {
    if (item.isDirectory) {
      const filesInFolder = getFilesInFolder(files, item.relativePath)
      const outdatedInFolder = filesInFolder.filter(f => f.diffStatus === 'outdated')
      logGetLatest('debug', 'Processing folder selection', {
        folder: item.relativePath,
        filesInFolder: filesInFolder.length,
        outdatedInFolder: outdatedInFolder.length,
        outdatedFiles: outdatedInFolder.map(f => f.name)
      })
      result.push(...outdatedInFolder)
    } else if (item.diffStatus === 'outdated' && item.pdmData) {
      logGetLatest('debug', 'Adding outdated file from selection', getFileContext(item))
      result.push(item)
    } else {
      logGetLatest('debug', 'Skipping non-outdated file', {
        name: item.name,
        diffStatus: item.diffStatus,
        hasPdmData: !!item.pdmData,
        reason: !item.pdmData ? 'no pdmData' : item.diffStatus !== 'outdated' ? 'not outdated status' : 'unknown'
      })
    }
  }
  
  const dedupedResult = Array.from(new Map(result.map(f => [f.path, f])).values())
  logGetLatest('debug', 'getOutdatedFilesFromSelection result', {
    beforeDedup: result.length,
    afterDedup: dedupedResult.length,
    files: dedupedResult.map(f => f.name)
  })
  
  return dedupedResult
}

export const getLatestCommand: Command<GetLatestParams> = {
  id: 'get-latest' as any,
  name: 'Get Latest',
  description: 'Download newer versions of files from server',
  aliases: ['gl', 'update'],
  usage: 'get-latest <path> [--recursive]',
  
  validate({ files }, ctx) {
    if (ctx.isOfflineMode) {
      return 'Cannot get latest while offline'
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
    
    // Get outdated files
    const outdatedFiles = getOutdatedFilesFromSelection(ctx.files, files)
    
    if (outdatedFiles.length === 0) {
      return 'No outdated files to update'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const organization = ctx.organization!
    const vaultPath = ctx.vaultPath!
    const operationId = `get-latest-${Date.now()}`
    
    logGetLatest('info', 'Starting get-latest operation', {
      operationId,
      orgId: organization.id,
      vaultPath,
      inputFilesCount: files.length,
      contextFilesCount: ctx.files.length,
      inputFiles: files.map(f => ({ name: f.name, diffStatus: f.diffStatus, isDir: f.isDirectory }))
    })
    
    // Get outdated files from selection
    const outdatedFiles = getOutdatedFilesFromSelection(ctx.files, files)
    
    logGetLatest('info', 'Outdated files after filtering', {
      operationId,
      count: outdatedFiles.length,
      files: outdatedFiles.map(f => getFileContext(f))
    })
    
    if (outdatedFiles.length === 0) {
      logGetLatest('warn', 'No outdated files found - returning early', {
        operationId,
        inputFilesCount: files.length,
        inputFileStatuses: files.map(f => ({ name: f.name, diffStatus: f.diffStatus, hasPdmData: !!f.pdmData }))
      })
      return {
        success: true,
        message: 'No files to update',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    // Track files AND folders being updated early for immediate spinner feedback
    // Include folder paths so folder inline buttons show spinners
    const outdatedFilePaths = outdatedFiles.map(f => f.relativePath)
    const selectedFolderPaths = files.filter(f => f.isDirectory).map(f => f.relativePath)
    const allPathsToTrack = [...new Set([...outdatedFilePaths, ...selectedFolderPaths])]
    
    // Record operation start for DevTools monitoring
    const operationStartTime = Date.now()
    recordMetric('GetLatest', 'Operation started', {
      fileCount: outdatedFiles.length,
      folderCount: selectedFolderPaths.length
    })
    
    ctx.addProcessingFolders(allPathsToTrack, 'sync')
    
    // Yield to event loop so React can render spinners BEFORE downloads start
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // Create progress toast immediately so user sees feedback
    const toastId = `get-latest-${Date.now()}`
    const progressLabel = outdatedFiles.length === 1 
      ? `Updating ${outdatedFiles[0].name}...`
      : `Updating ${outdatedFiles.length} file${outdatedFiles.length > 1 ? 's' : ''}...`
    
    const progress = new ProgressTracker(
      ctx,
      'get-latest',
      toastId,
      progressLabel,
      outdatedFiles.length
    )
    
    // Skip pre-validation - it was too slow (500-3000ms per file via Supabase storage list API)
    // Missing files are detected during download and handled gracefully
    const filesToProcess = outdatedFiles
    const missingStorageFiles: LocalFile[] = [] // Populated during download if any fail
    
    // Register expected file changes to suppress file watcher during operation
    const filePaths = filesToProcess.map(f => f.relativePath)
    ctx.addExpectedFileChanges(filePaths)
    
    const total = filesToProcess.length
    
    // Update progress label to show download phase
    progress.setStatus(`0/${total}`)
    
    let succeeded = 0
    let failed = 0
    const errors: string[] = []
    
    // Collect updates for batch store update
    const pendingUpdates: Array<{ path: string; updates: Partial<LocalFile> }> = []
    
    // Process files with limited concurrency
    const results = await processWithConcurrency(filesToProcess, CONCURRENT_OPERATIONS, async (file) => {
      const fileCtx = getFileContext(file)
      
      if (!file.pdmData?.content_hash) {
        logGetLatest('error', 'File has no content hash - skipping', {
          operationId,
          ...fileCtx,
          pdmDataPresent: !!file.pdmData,
          contentHashPresent: !!file.pdmData?.content_hash
        })
        progress.update()
        return { success: false, error: `${file.name}: No content hash` }
      }
      
      try {
        const fullPath = buildFullPath(vaultPath, file.relativePath)
        
        logGetLatest('debug', 'Processing file for update', {
          operationId,
          ...fileCtx,
          fullPath
        })
        
        // Get download URL for the server version
        const { url, error: urlError } = await getDownloadUrl(organization.id, file.pdmData.content_hash)
        if (urlError || !url) {
          logGetLatest('error', 'Failed to get download URL', {
            operationId,
            ...fileCtx,
            urlError,
            orgId: organization.id
          })
          progress.update()
          return { success: false, error: `${file.name}: ${urlError || 'Failed to get URL'}` }
        }
        
        logGetLatest('debug', 'Got download URL, removing read-only', {
          operationId,
          fileName: file.name
        })
        
        // Remove read-only before overwriting
        const readonlyOffResult = await window.electronAPI?.setReadonly(fullPath, false)
        if (readonlyOffResult?.success === false) {
          logGetLatest('warn', 'Failed to remove read-only flag', {
            operationId,
            fileName: file.name,
            fullPath,
            error: readonlyOffResult.error
          })
        }
        
        // Download and overwrite the local file with retry logic
        let downloadResult: { success: boolean; error?: string; size?: number; hash?: string } | undefined
        let lastDownloadError: string | undefined
        
        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
          logGetLatest('debug', 'Downloading file', {
            operationId,
            fileName: file.name,
            fullPath,
            attempt
          })
          
          downloadResult = await window.electronAPI?.downloadUrl(url, fullPath)
          
          if (downloadResult?.success) {
            break // Success, exit retry loop
          }
          
          lastDownloadError = downloadResult?.error || 'unknown error'
          
          // Check if error is retryable
          if (isRetryableError(lastDownloadError) && attempt < MAX_RETRY_ATTEMPTS) {
            const delayMs = getBackoffDelay(attempt, RETRY_BASE_DELAY_MS)
            logGetLatest('warn', 'Download failed (network issue), retrying...', {
              operationId,
              fileName: file.name,
              attempt,
              maxAttempts: MAX_RETRY_ATTEMPTS,
              error: lastDownloadError,
              retryDelayMs: Math.round(delayMs)
            })
            await sleep(delayMs)
          } else {
            // Not retryable or max attempts reached
            break
          }
        }
        
        if (!downloadResult?.success) {
          const userMessage = getNetworkErrorMessage(lastDownloadError || 'unknown error')
          logGetLatest('error', 'Download failed after retries', {
            operationId,
            ...fileCtx,
            fullPath,
            downloadError: lastDownloadError,
            userMessage
          })
          progress.update()
          return { success: false, error: `${file.name}: ${userMessage}` }
        }
        
        logGetLatest('debug', 'Download succeeded, setting read-only', {
          operationId,
          fileName: file.name,
          downloadedSize: downloadResult.size,
          downloadedHash: downloadResult.hash?.substring(0, 12)
        })
        
        // Set read-only (file is not checked out)
        const readonlyOnResult = await window.electronAPI?.setReadonly(fullPath, true)
        if (readonlyOnResult?.success === false) {
          logGetLatest('warn', 'Failed to set read-only flag', {
            operationId,
            fileName: file.name,
            error: readonlyOnResult.error
          })
        }
        
        // Queue update for batch processing
        pendingUpdates.push({
          path: file.path,
          updates: {
            localHash: file.pdmData.content_hash,
            diffStatus: undefined // No longer outdated
          }
        })
        
        logGetLatest('info', 'File updated successfully', {
          operationId,
          fileName: file.name,
          newLocalHash: file.pdmData.content_hash?.substring(0, 12)
        })
        
        progress.update()
        return { success: true }
        
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logGetLatest('error', 'Exception while updating file', {
          operationId,
          ...fileCtx,
          error: errorMsg,
          stack: err instanceof Error ? err.stack : undefined
        })
        progress.update()
        return { success: false, error: `${file.name}: ${errorMsg}` }
      }
    })
    
    // Count results
    for (const result of results) {
      if (result.success) succeeded++
      else {
        failed++
        if (result.error) errors.push(result.error)
      }
    }
    
    // Apply store updates AND clear processing state atomically
    // Using updateFilesAndClearProcessing() combines both updates into ONE set() call,
    // preventing two expensive re-render cycles with O(N x depth) folderMetrics computation.
    // This eliminates the ~5 second UI freeze that occurred with separate calls.
    const storeUpdateStart = performance.now()
    logGetLatest('info', 'Updates finished, starting store update', {
      operationId,
      updateCount: pendingUpdates.length,
      paths: pendingUpdates.map(u => u.path),
      pathsToTrackCount: allPathsToTrack.length,
      timestamp: Date.now()
    })
    ctx.updateFilesAndClearProcessing(pendingUpdates, allPathsToTrack)
    ctx.setLastOperationCompletedAt(Date.now())
    logGetLatest('debug', 'Store update complete', {
      operationId,
      durationMs: Math.round(performance.now() - storeUpdateStart),
      timestamp: Date.now()
    })
    
    // Delay clearing expected file changes to allow file watcher suppression to work
    // The 5 second window ensures late file system events are still suppressed
    const pathsToClear = [...filePaths] // Only file paths, not folder paths
    setTimeout(() => {
      ctx.clearExpectedFileChanges(pathsToClear)
      logGetLatest('debug', 'Expected file changes cleared (delayed)', {
        operationId,
        count: pathsToClear.length,
        timestamp: Date.now()
      })
    }, 5000)
    const { duration } = progress.finish()
    
    // Include pre-validated missing files in totals
    const totalAttempted = total + missingStorageFiles.length
    const totalFailed = failed + missingStorageFiles.length
    
    logGetLatest('info', 'Get-latest operation complete', {
      operationId,
      totalAttempted,
      downloaded: total,
      succeeded,
      failed,
      preValidatedMissing: missingStorageFiles.length,
      duration,
      errors: errors.length > 0 ? errors : undefined,
      pendingUpdatesApplied: pendingUpdates.length
    })
    
    // Note: No ctx.onRefresh() call needed here - the incremental store updates
    // via ctx.updateFilesInStore(pendingUpdates) at line 428 are sufficient.
    // This avoids a redundant full filesystem rescan that would add ~5s latency.
    
    // Note: Missing storage files were already detected during pre-validation
    // and the modal was already triggered. We only need to handle download errors here.
    
    // Detect any additional "orphaned files" that slipped through pre-validation
    const objectNotFoundErrors = errors.filter(e => 
      e.includes('Object not found') || 
      e.includes('not found in cloud storage') ||
      e.includes('File not found')
    )
    
    if (objectNotFoundErrors.length > 0) {
      // Some files failed with "not found" during download - add to existing missing files
      const additionalMissing: MissingStorageFile[] = filesToProcess
        .filter(f => {
          const errorForFile = errors.find(e => e.startsWith(f.name + ':'))
          return errorForFile && (
            errorForFile.includes('Object not found') ||
            errorForFile.includes('not found in cloud storage') ||
            errorForFile.includes('File not found')
          )
        })
        .map(f => ({
          fileId: f.pdmData?.id || '',
          fileName: f.name,
          filePath: f.relativePath,
          serverHash: f.pdmData?.content_hash || '',
          version: f.pdmData?.version || 0,
          detectedAt: new Date().toISOString()
        }))
      
      if (additionalMissing.length > 0) {
        // Merge with any existing missing files from pre-validation
        const existingMissing = usePDMStore.getState().missingStorageFiles
        const allMissing = [...existingMissing, ...additionalMissing]
        usePDMStore.getState().setMissingStorageFiles(allMissing)
        
        logGetLatest('warn', 'Additional orphaned files detected during download', {
          operationId,
          additionalCount: additionalMissing.length
        })
      }
    }
    
    // Show result toast (unless only missing storage files, which show a modal)
    const hasOnlyMissingStorageIssues = totalFailed > 0 && 
      totalFailed === (missingStorageFiles.length + objectNotFoundErrors.length)
    
    if (totalFailed > 0) {
      if (!hasOnlyMissingStorageIssues) {
        // Some failures were NOT due to missing storage - show warning
        ctx.addToast('warning', `Updated ${succeeded}/${totalAttempted} files`)
      }
      // If only missing storage issues, the modal provides the information
    } else {
      ctx.addToast('success', `Updated ${succeeded} file${succeeded > 1 ? 's' : ''}`)
    }
    
    // Record operation complete for DevTools monitoring
    const totalOperationDuration = Date.now() - operationStartTime
    recordMetric('GetLatest', 'Operation complete', {
      fileCount: totalAttempted,
      succeeded,
      failed: totalFailed,
      durationMs: totalOperationDuration
    })
    
    return {
      success: totalFailed === 0,
      message: totalFailed > 0 
        ? `Updated ${succeeded}/${totalAttempted} files` 
        : `Updated ${succeeded} file${succeeded > 1 ? 's' : ''}`,
      total: totalAttempted,
      succeeded,
      failed: totalFailed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}

