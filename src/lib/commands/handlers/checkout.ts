/**
 * Checkout Command
 * 
 * Check out files for editing. This:
 * 1. Locks the file on the server
 * 2. Makes the local file writable
 * 3. Auto-extracts SolidWorks metadata (if SW service available)
 */

import type { Command, CheckoutParams, CommandResult } from '../types'
import { getSyncedFilesFromSelection } from '../types'
import { ProgressTracker } from '../executor'
import { checkoutFile } from '../../supabase'
import { processWithConcurrency, CONCURRENT_OPERATIONS, SW_CONCURRENT_OPERATIONS } from '../../concurrency'
import type { LocalFile } from '../../../stores/pdmStore'
import { usePDMStore } from '../../../stores/pdmStore'

// SolidWorks file extensions that support metadata extraction
const SW_EXTENSIONS = ['.sldprt', '.sldasm', '.slddrw']

/**
 * Incremental Store Update Configuration
 * 
 * During batch operations (checking out many files), updating the store after
 * every single file causes excessive React re-renders and impacts performance.
 * Updating only at the end means the UI shows no progress until completion.
 * 
 * We use BOTH count-based and time-based flushing:
 * - FLUSH_INTERVAL: Flush every N files (prevents huge batches)
 * - FLUSH_TIME_MS: Flush at least every N ms (ensures UI updates even if files are slow)
 * 
 * This keeps the UI responsive regardless of file processing speed.
 */
const FLUSH_INTERVAL = 25  // Flush every 25 files
const FLUSH_TIME_MS = 500  // Flush at least every 500ms

/**
 * Extract metadata from SolidWorks file using the SW service
 * Returns null if service unavailable or extraction fails
 * @param swServiceRunning - Pre-cached service status to avoid redundant IPC calls
 */
async function extractSolidWorksMetadata(
  fullPath: string,
  extension: string,
  swServiceRunning: boolean
): Promise<{
  part_number?: string | null
  description?: string | null
} | null> {
  // Only process SolidWorks files
  if (!SW_EXTENSIONS.includes(extension.toLowerCase())) {
    return null
  }
  
  // Use pre-cached service status
  if (!swServiceRunning) {
    return null
  }
  
  try {
    const result = await window.electronAPI?.solidworks?.getProperties?.(fullPath)
    
    if (!result?.success || !result.data) {
      return null
    }
    
    const data = result.data as {
      fileProperties?: Record<string, string>
      configurationProperties?: Record<string, Record<string, string>>
    }
    
    // Merge file-level and active configuration properties
    const allProps: Record<string, string> = { ...data.fileProperties }
    
    // Also check configuration properties (use first config or "Default")
    const configProps = data.configurationProperties
    if (configProps) {
      const configName = Object.keys(configProps).find(k => 
        k.toLowerCase() === 'default' || k.toLowerCase() === 'standard'
      ) || Object.keys(configProps)[0]
      
      if (configName && configProps[configName]) {
        Object.assign(allProps, configProps[configName])
      }
    }
    
    // Extract part number from common property names
    const partNumberKeys = [
      'Base Item Number',  // SolidWorks Document Manager standard property
      'PartNumber', 'Part Number', 'Part No', 'Part No.', 'PartNo',
      'ItemNumber', 'Item Number', 'Item No', 'Item No.', 'ItemNo',
      'PN', 'P/N', 'Number', 'No', 'No.'
    ]
    let part_number: string | null = null
    for (const key of partNumberKeys) {
      if (allProps[key] && allProps[key].trim()) {
        part_number = allProps[key].trim()
        break
      }
    }
    // Case-insensitive fallback
    if (!part_number) {
      for (const [key, value] of Object.entries(allProps)) {
        const lowerKey = key.toLowerCase()
        if ((lowerKey.includes('part') && (lowerKey.includes('number') || lowerKey.includes('no'))) ||
            (lowerKey.includes('item') && (lowerKey.includes('number') || lowerKey.includes('no'))) ||
            lowerKey === 'pn' || lowerKey === 'p/n') {
          if (value && value.trim()) {
            part_number = value.trim()
            break
          }
        }
      }
    }
    
    // Extract description
    const description = allProps['Description'] || allProps['description'] || null
    
    return {
      part_number,
      description: description?.trim() || null
    }
  } catch (err) {
    console.warn('Failed to extract SolidWorks metadata:', err)
    return null
  }
}

// Detailed logging for checkout operations
function logCheckout(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown>) {
  const timestamp = new Date().toISOString()
  const logData = { timestamp, ...context }
  
  const prefix = '[Checkout]'
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
    checkedOutBy: file.pdmData?.checked_out_by,
    version: file.pdmData?.version,
    state: file.pdmData?.workflow_state?.name
  }
}

export const checkoutCommand: Command<CheckoutParams> = {
  id: 'checkout',
  name: 'Check Out',
  description: 'Check out files for editing',
  aliases: ['co'],
  usage: 'checkout <path> [--recursive]',
  
  validate({ files }, ctx) {
    if (ctx.isOfflineMode) {
      return 'Cannot check out files while offline'
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
    
    // Get synced files that can be checked out
    const syncedFiles = getSyncedFilesFromSelection(ctx.files, files)
    const checkoutable = syncedFiles.filter(f => !f.pdmData?.checked_out_by)
    
    if (checkoutable.length === 0) {
      // Check if all are already checked out
      if (syncedFiles.length > 0 && syncedFiles.every(f => f.pdmData?.checked_out_by)) {
        return 'All files are already checked out'
      }
      return 'No synced files to check out'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const user = ctx.user!
    const operationId = `checkout-${Date.now()}`
    
    logCheckout('info', 'Starting checkout operation', {
      operationId,
      userId: user.id,
      selectedFileCount: files.length
    })
    
    // Pre-fetch machine info ONCE before processing files (avoid redundant IPC calls)
    const { getMachineId, getMachineName } = await import('../../backup')
    const [machineId, machineName] = await Promise.all([
      getMachineId(),
      getMachineName()
    ])
    
    // Pre-check SolidWorks service status ONCE (avoid checking for every file)
    let swServiceRunning = false
    try {
      const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
      swServiceRunning = !!status?.data?.running
    } catch {
      // SW service not available
    }
    
    // Get files that can be checked out
    const syncedFiles = getSyncedFilesFromSelection(ctx.files, files)
    const filesToCheckout = syncedFiles.filter(f => !f.pdmData?.checked_out_by)
    
    logCheckout('debug', 'Filtered files for checkout', {
      operationId,
      syncedCount: syncedFiles.length,
      checkoutableCount: filesToCheckout.length,
      alreadyCheckedOut: syncedFiles.filter(f => f.pdmData?.checked_out_by).length
    })
    
    if (filesToCheckout.length === 0) {
      logCheckout('info', 'No files to check out', { operationId })
      return {
        success: true,
        message: 'No files to check out',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    // Track folders and files being processed (for spinner display) - batch add
    const foldersBeingProcessed = files
      .filter(f => f.isDirectory)
      .map(f => f.relativePath)
    const filesBeingProcessed = filesToCheckout.map(f => f.relativePath)
    const allPathsBeingProcessed = [...new Set([...foldersBeingProcessed, ...filesBeingProcessed])]
    ctx.addProcessingFolders(allPathsBeingProcessed, 'checkout')
    
    // Yield to event loop so React can render spinners before starting operation
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // Progress tracking
    const toastId = `checkout-${Date.now()}`
    const total = filesToCheckout.length
    const progress = new ProgressTracker(
      ctx,
      'checkout',
      toastId,
      `Checking out ${total} file${total > 1 ? 's' : ''}...`,
      total
    )
    
    let succeeded = 0
    let failed = 0
    const errors: string[] = []
    
    // Process all files in parallel, collect updates for batch store update
    const pendingUpdates: Array<{ path: string; updates: Parameters<typeof ctx.updateFileInStore>[1] }> = []
    
    // Track flush position and timing for incremental store updates
    let lastFlushIndex = 0
    let lastFlushTime = Date.now()
    
    /**
     * Flush pending store updates to provide real-time UI feedback.
     * Called periodically during batch operations based on count OR time.
     */
    const flushPendingUpdates = () => {
      const updateCount = pendingUpdates.length
      if (updateCount > lastFlushIndex) {
        const updatesToFlush = pendingUpdates.slice(lastFlushIndex)
        ctx.updateFilesInStore(updatesToFlush)
        lastFlushIndex = updateCount
        lastFlushTime = Date.now()
        logCheckout('debug', 'Incremental store flush', {
          operationId,
          flushedCount: updatesToFlush.length,
          totalProcessed: updateCount
        })
      }
    }
    
    /**
     * Check if we should flush based on count OR time threshold.
     * This keeps UI responsive even when individual files take a long time.
     */
    const shouldFlush = (): boolean => {
      const countThreshold = pendingUpdates.length - lastFlushIndex >= FLUSH_INTERVAL
      const timeThreshold = Date.now() - lastFlushTime >= FLUSH_TIME_MS
      return countThreshold || (pendingUpdates.length > lastFlushIndex && timeThreshold)
    }
    
    // ========================================
    // TWO-PHASE PROCESSING: Prevent SolidWorks service flooding
    // 
    // The SolidWorks service uses a serial stdin/stdout pipe, so high concurrency
    // (e.g., 20 files) overwhelms it and causes timeouts/crashes.
    // 
    // Strategy:
    // 1. Process non-SW files first at high concurrency (20) - no service bottleneck
    // 2. Process SW files second at low concurrency (3) - respects serial pipe limit
    // ========================================
    
    // Split files into SW and non-SW for two-phase processing
    const swFiles = filesToCheckout.filter(f => SW_EXTENSIONS.includes(f.extension.toLowerCase()))
    const nonSwFiles = filesToCheckout.filter(f => !SW_EXTENSIONS.includes(f.extension.toLowerCase()))
    
    logCheckout('info', 'Two-phase processing strategy', {
      operationId,
      totalFiles: filesToCheckout.length,
      swFiles: swFiles.length,
      nonSwFiles: nonSwFiles.length,
      swConcurrency: SW_CONCURRENT_OPERATIONS,
      nonSwConcurrency: CONCURRENT_OPERATIONS
    })
    
    /**
     * Process a single file for checkout
     * Extracted to avoid code duplication between phases
     */
    const processFile = async (file: LocalFile): Promise<{ success: boolean; error?: string }> => {
      const fileCtx = getFileContext(file)
      const isSolidWorksFile = SW_EXTENSIONS.includes(file.extension.toLowerCase())
      const swOpStartTime = isSolidWorksFile ? Date.now() : null
      
      try {
        logCheckout('debug', 'Checking out file', { operationId, ...fileCtx })
        
        const result = await checkoutFile(file.pdmData!.id, user.id, user.email, {
          machineId,
          machineName
        })
        
        if (result.success) {
          // Make file writable on file system
          const readonlyResult = await window.electronAPI?.setReadonly(file.path, false)
          if (readonlyResult?.success === false) {
            logCheckout('warn', 'Failed to clear read-only flag', {
              operationId,
              fileName: file.name,
              error: readonlyResult.error
            })
          }
          
          // If SolidWorks file is open, also change document read-only state
          // This allows checking out files without closing SolidWorks!
          if (SW_EXTENSIONS.includes(file.extension.toLowerCase())) {
            try {
              const docResult = await window.electronAPI?.solidworks?.setDocumentReadOnly?.(file.path, false)
              if (docResult?.success && docResult.data?.changed) {
                logCheckout('info', 'Updated SolidWorks document to read-write', {
                  operationId,
                  fileName: file.name,
                  wasReadOnly: docResult.data.wasReadOnly,
                  isNowReadOnly: docResult.data.isNowReadOnly
                })
              }
            } catch {
              // SW service not available or file not open - that's fine
            }
          }
          
          // Auto-extract SolidWorks metadata on checkout
          const swMetadata = await extractSolidWorksMetadata(file.path, file.extension, swServiceRunning)
          if (swMetadata) {
            logCheckout('debug', 'Extracted SolidWorks metadata on checkout', {
              operationId,
              fileName: file.name,
              partNumber: swMetadata.part_number,
              description: swMetadata.description?.substring(0, 50)
            })
          }
          
          // Queue update for batch processing
          // Include SW metadata as pendingMetadata so it shows in UI and can be compared
          pendingUpdates.push({
            path: file.path,
            updates: {
              pdmData: {
                ...file.pdmData!,
                checked_out_by: user.id,
                checked_out_user: { full_name: user.full_name, email: user.email, avatar_url: user.avatar_url }
              },
              // Store extracted SW metadata - will be used on checkin if no manual edits
              pendingMetadata: swMetadata || undefined
            }
          })
          
          // Flush periodically for real-time UI feedback (count OR time based)
          if (shouldFlush()) {
            flushPendingUpdates()
          }
          
          // Log timing for SW operations (helps diagnose service performance)
          if (swOpStartTime !== null) {
            const swOpDuration = Date.now() - swOpStartTime
            logCheckout('info', 'SolidWorks file checkout successful', {
              operationId,
              fileName: file.name,
              swOperationDurationMs: swOpDuration
            })
          } else {
            logCheckout('debug', 'File checkout successful', { operationId, fileName: file.name })
          }
          progress.update()
          return { success: true }
        } else {
          logCheckout('error', 'File checkout failed', {
            operationId,
            ...fileCtx,
            error: result.error
          })
          progress.update()
          return { success: false, error: `${file.name}: ${result.error || 'Unknown error'}` }
        }
      } catch (err) {
        logCheckout('error', 'Checkout exception', {
          operationId,
          ...fileCtx,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        })
        progress.update()
        return { success: false, error: `${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}` }
      }
    }
    
    // ========================================
    // PHASE 1: Process non-SolidWorks files at high concurrency (20)
    // These files don't need SW service, so no bottleneck
    // ========================================
    let nonSwResults: Array<{ success: boolean; error?: string }> = []
    if (nonSwFiles.length > 0) {
      logCheckout('info', 'Phase 1: Processing non-SW files', {
        operationId,
        count: nonSwFiles.length,
        concurrency: CONCURRENT_OPERATIONS
      })
      const phase1Start = Date.now()
      nonSwResults = await processWithConcurrency(nonSwFiles, CONCURRENT_OPERATIONS, processFile)
      logCheckout('info', 'Phase 1 complete', {
        operationId,
        count: nonSwFiles.length,
        durationMs: Date.now() - phase1Start
      })
    }
    
    // ========================================
    // PHASE 2: Process SolidWorks files at low concurrency (3)
    // Respects the serial stdin/stdout pipe limit of the SW service
    // Sets batch flag to pause status polling during heavy operations
    // ========================================
    let swResults: Array<{ success: boolean; error?: string }> = []
    if (swFiles.length > 0) {
      logCheckout('info', 'Phase 2: Processing SW files', {
        operationId,
        count: swFiles.length,
        concurrency: SW_CONCURRENT_OPERATIONS
      })
      const phase2Start = Date.now()
      
      // Set batch operation flag to pause status polling
      usePDMStore.getState().setIsBatchSWOperationRunning(true)
      try {
        swResults = await processWithConcurrency(swFiles, SW_CONCURRENT_OPERATIONS, processFile)
      } finally {
        // Always reset flag, even if processing fails
        usePDMStore.getState().setIsBatchSWOperationRunning(false)
      }
      
      logCheckout('info', 'Phase 2 complete', {
        operationId,
        count: swFiles.length,
        durationMs: Date.now() - phase2Start
      })
    }
    
    // Combine results from both phases
    const results = [...nonSwResults, ...swResults]
    
    // Flush any remaining store updates not yet flushed during incremental processing
    if (pendingUpdates.length > lastFlushIndex) {
      logCheckout('debug', 'Final store update flush', {
        operationId,
        remainingCount: pendingUpdates.length - lastFlushIndex,
        totalUpdates: pendingUpdates.length
      })
      flushPendingUpdates()
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
    logCheckout(failed > 0 ? 'warn' : 'info', 'Checkout operation complete', {
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
      ctx.addToast('error', `Checkout failed: ${firstError}${moreText}`)
    } else {
      ctx.addToast('success', `Checked out ${succeeded} file${succeeded > 1 ? 's' : ''}`)
    }
    
    return {
      success: failed === 0,
      message: failed > 0 ? `Checked out ${succeeded}/${total} files` : `Checked out ${succeeded} file${succeeded > 1 ? 's' : ''}`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}

