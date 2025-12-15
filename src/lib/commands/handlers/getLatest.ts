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

export interface GetLatestParams {
  files: LocalFile[]
}

// Helper to get outdated files from selection (handles folders)
export function getOutdatedFilesFromSelection(files: LocalFile[], selection: LocalFile[]): LocalFile[] {
  const result: LocalFile[] = []
  
  for (const item of selection) {
    if (item.isDirectory) {
      const filesInFolder = getFilesInFolder(files, item.relativePath)
      const outdatedInFolder = filesInFolder.filter(f => f.diffStatus === 'outdated')
      result.push(...outdatedInFolder)
    } else if (item.diffStatus === 'outdated' && item.pdmData) {
      result.push(item)
    }
  }
  
  return Array.from(new Map(result.map(f => [f.path, f])).values())
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
    
    // Get outdated files from selection
    const outdatedFiles = getOutdatedFilesFromSelection(ctx.files, files)
    
    if (outdatedFiles.length === 0) {
      return {
        success: true,
        message: 'No files to update',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    // Track files being updated
    const filePaths = outdatedFiles.map(f => f.relativePath)
    ctx.addProcessingFolders(filePaths)
    
    // Yield to event loop so React can render spinners
    await new Promise(resolve => setTimeout(resolve, 0))
    
    const total = outdatedFiles.length
    
    // Progress tracking
    const toastId = `get-latest-${Date.now()}`
    const progressLabel = total === 1 
      ? `Updating ${outdatedFiles[0].name}...`
      : `Updating ${total} file${total > 1 ? 's' : ''}...`
    
    const progress = new ProgressTracker(
      ctx,
      'get-latest',
      toastId,
      progressLabel,
      total
    )
    
    let succeeded = 0
    let failed = 0
    const errors: string[] = []
    
    // Collect updates for batch store update
    const pendingUpdates: Array<{ path: string; updates: Partial<LocalFile> }> = []
    
    // Process all files in parallel
    const results = await Promise.all(outdatedFiles.map(async (file) => {
      if (!file.pdmData?.content_hash) {
        progress.update()
        return { success: false, error: `${file.name}: No content hash` }
      }
      
      try {
        const fullPath = buildFullPath(vaultPath, file.relativePath)
        
        // Get download URL for the server version
        const { url, error: urlError } = await getDownloadUrl(organization.id, file.pdmData.content_hash)
        if (urlError || !url) {
          progress.update()
          return { success: false, error: `${file.name}: ${urlError || 'Failed to get URL'}` }
        }
        
        // Remove read-only before overwriting
        await window.electronAPI?.setReadonly(fullPath, false)
        
        // Download and overwrite the local file
        const downloadResult = await window.electronAPI?.downloadUrl(url, fullPath)
        if (!downloadResult?.success) {
          progress.update()
          return { success: false, error: `${file.name}: Download failed` }
        }
        
        // Set read-only (file is not checked out)
        await window.electronAPI?.setReadonly(fullPath, true)
        
        // Queue update for batch processing
        pendingUpdates.push({
          path: file.path,
          updates: {
            localHash: file.pdmData.content_hash,
            diffStatus: undefined // No longer outdated
          }
        })
        
        progress.update()
        return { success: true }
        
      } catch (err) {
        progress.update()
        return { success: false, error: `${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}` }
      }
    }))
    
    // Apply all store updates in a single batch
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
    
    // Clean up
    ctx.removeProcessingFolders(filePaths)
    const { duration } = progress.finish()
    ctx.onRefresh?.(true)
    
    // Show result
    if (failed > 0) {
      ctx.addToast('warning', `Updated ${succeeded}/${total} files`)
    } else {
      ctx.addToast('success', `Updated ${succeeded} file${succeeded > 1 ? 's' : ''}`)
    }
    
    return {
      success: failed === 0,
      message: failed > 0 ? `Updated ${succeeded}/${total} files` : `Updated ${succeeded} file${succeeded > 1 ? 's' : ''}`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}

