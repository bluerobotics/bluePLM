/**
 * Checkout Command
 * 
 * Check out files for editing. This:
 * 1. Locks the file on the server
 * 2. Makes the local file writable
 */

import type { Command, CheckoutParams, CommandResult } from '../types'
import { getSyncedFilesFromSelection } from '../types'
import { ProgressTracker } from '../executor'
import { checkoutFile } from '../../supabase'
import type { LocalFile } from '../../../stores/pdmStore'

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
    state: file.pdmData?.state
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
    ctx.addProcessingFolders(allPathsBeingProcessed)
    
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
    
    const results = await Promise.all(filesToCheckout.map(async (file) => {
      const fileCtx = getFileContext(file)
      
      try {
        logCheckout('debug', 'Checking out file', { operationId, ...fileCtx })
        
        const result = await checkoutFile(file.pdmData!.id, user.id)
        
        if (result.success) {
          // Make file writable
          const readonlyResult = await window.electronAPI?.setReadonly(file.path, false)
          if (readonlyResult?.success === false) {
            logCheckout('warn', 'Failed to clear read-only flag', {
              operationId,
              fileName: file.name,
              error: readonlyResult.error
            })
          }
          
          // Queue update for batch processing
          pendingUpdates.push({
            path: file.path,
            updates: {
              pdmData: {
                ...file.pdmData!,
                checked_out_by: user.id,
                checked_out_user: { full_name: user.full_name, email: user.email, avatar_url: user.avatar_url }
              }
            }
          })
          
          logCheckout('debug', 'File checkout successful', { operationId, fileName: file.name })
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

