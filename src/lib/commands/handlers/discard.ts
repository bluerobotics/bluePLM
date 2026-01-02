/**
 * Discard Command
 * 
 * Discard local changes and revert to the server version.
 * For files that exist locally: downloads the server file and releases the checkout.
 * For 'deleted' files (checked out but deleted locally): just releases the checkout.
 */

import type { Command, DiscardParams, CommandResult } from '../types'
import { getDiscardableFilesFromSelection } from '../types'
import { ProgressTracker } from '../executor'
import { checkinFile, undoCheckout } from '../../supabase'
import { getDownloadUrl } from '../../storage'

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
    
    if (discardableFiles.length === 0) {
      return 'No files checked out by you to discard'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const user = ctx.user!
    const organization = ctx.organization!
    
    // Get files checked out by current user (includes 'deleted' files)
    const filesToDiscard = getDiscardableFilesFromSelection(ctx.files, files, user.id)
    
    if (filesToDiscard.length === 0) {
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
    ctx.addProcessingFolders(foldersBeingProcessed)
    
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
    
    const results = await Promise.all(filesToDiscard.map(async (file) => {
      try {
        const contentHash = file.pdmData?.content_hash
        
        if (!contentHash) {
          progress.update()
          return { success: false, error: `${file.name}: No content hash` }
        }
        
        // Check if file actually exists locally (don't trust diffStatus alone)
        const fileExists = await window.electronAPI?.fileExists(file.path)
        const isDeletedLocally = !fileExists || file.diffStatus === 'deleted'
        
        if (isDeletedLocally) {
          // For files that don't exist locally, just release checkout using undoCheckout
          // This is simpler than checkinFile and doesn't do any version/content logic
          const result = await undoCheckout(file.pdmData!.id, user.id)
          if (!result.success) {
            progress.update()
            return { success: false, error: `${file.name}: ${result.error || 'Failed to release checkout'}` }
          }
          
          // Remove from store (will be re-added as 'cloud' on next refresh)
          pathsToRemove.push(file.path)
        } else {
          // For files that exist locally, download server version to replace local changes
          const { url, error: urlError } = await getDownloadUrl(organization.id, contentHash)
          if (urlError || !url) {
            progress.update()
            return { success: false, error: `${file.name}: ${urlError || 'Failed to get download URL'}` }
          }
          
          await window.electronAPI?.setReadonly(file.path, false)
          const writeResult = await window.electronAPI?.downloadUrl(url, file.path)
          if (!writeResult?.success) {
            progress.update()
            return { success: false, error: `${file.name}: Download failed` }
          }
          
          // Release checkout using checkinFile (handles the file content properly)
          const result = await checkinFile(file.pdmData!.id, user.id)
          if (!result.success) {
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
        }
        progress.update()
        return { success: true }
        
      } catch (err) {
        progress.update()
        return { success: false, error: `${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}` }
      }
    }))
    
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

