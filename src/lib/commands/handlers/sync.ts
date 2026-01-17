/**
 * Sync Command (First Check-In)
 * 
 * Upload new local files to the server for the first time.
 * This syncs files that exist locally but haven't been added to PDM yet.
 * 
 * NOTE: Metadata extraction from SolidWorks files has been removed for performance.
 * Users should use "Save to File" to write metadata to SW files before first check-in,
 * or manually enter metadata in the datacard before syncing.
 */

import type { Command, SyncParams, CommandResult } from '../types'
import { getUnsyncedFilesFromSelection } from '../types'
import { ProgressTracker } from '../executor'
import { syncFile, upsertFileReferences } from '../../supabase'
import type { SWReference } from '../../supabase/files/mutations'
import { usePDMStore } from '../../../stores/pdmStore'
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'
import { log } from '@/lib/logger'
import { FileOperationTracker } from '../../fileOperationTracker'
import { addToSyncIndex } from '../../cache/localSyncIndex'

// Helper to check if file is a SolidWorks temp lock file (~$filename.sldxxx)
function isSolidworksTempFile(name: string): boolean {
  return name.startsWith('~$')
}

// File types that have references to extract (assemblies reference components, drawings reference models)
const REFERENCE_FILE_EXTENSIONS = ['.sldasm', '.slddrw']

// Drawing extensions (need special handling for reference type)
const DRAWING_EXTENSIONS = ['.slddrw']

/**
 * Metadata for sync operation (from pending UI input)
 */
interface SyncMetadata {
  partNumber: string | null
  tabNumber: string | null
  description: string | null
  revision: string | null
  customProperties: Record<string, string | number | null> | undefined
}

// Detailed logging for sync operations
function logSync(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown>) {
  log[level]('[Sync]', message, context)
}

/**
 * Synced file info for reference extraction
 */
interface SyncedFileInfo {
  fileId: string
  fileName: string
  filePath: string  // Local absolute path
  extension: string
}

export const syncCommand: Command<SyncParams> = {
  id: 'sync',
  name: 'First Check In',
  description: 'Upload new files to the server for the first time',
  aliases: ['upload', 'add'],
  usage: 'sync <path> [--recursive]',
  
  validate({ files }, ctx) {
    if (ctx.isOfflineMode) {
      return 'Cannot sync files while offline'
    }
    
    if (!ctx.user) {
      return 'Please sign in first'
    }
    
    if (!ctx.organization) {
      return 'No organization connected'
    }
    
    if (!ctx.activeVaultId) {
      return 'No vault selected'
    }
    
    if (!files || files.length === 0) {
      return 'No files selected'
    }
    
    // Get unsynced files
    const unsyncedFiles = getUnsyncedFilesFromSelection(ctx.files, files)
    
    if (unsyncedFiles.length === 0) {
      return 'No unsynced files to upload'
    }
    
    return null
  },
  
  async execute({ files, extractReferences }, ctx): Promise<CommandResult> {
    const user = ctx.user!
    const organization = ctx.organization!
    const activeVaultId = ctx.activeVaultId!
    
    // Get unsynced files (for tracker initialization)
    const unsyncedFilesForTracker = getUnsyncedFilesFromSelection(ctx.files, files)
    
    // Initialize file operation tracker for DevTools monitoring
    const tracker = FileOperationTracker.start(
      'sync',
      unsyncedFilesForTracker.length,
      unsyncedFilesForTracker.map(f => f.relativePath)
    )
    
    // Get unsynced files
    let filesToSync = getUnsyncedFilesFromSelection(ctx.files, files)
    
    // Filter out SolidWorks temp files (~$) when setting is enabled
    const { ignoreSolidworksTempFiles } = usePDMStore.getState()
    if (ignoreSolidworksTempFiles) {
      filesToSync = filesToSync.filter(f => !isSolidworksTempFile(f.name))
    }
    
    if (filesToSync.length === 0) {
      tracker.endOperation('completed')
      return {
        success: true,
        message: 'No files to sync',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    // Track folders and files being processed (for spinner display)
    const foldersBeingProcessed = files
      .filter(f => f.isDirectory)
      .map(f => f.relativePath)
    const filesBeingProcessed = filesToSync.map(f => f.relativePath)

    // Only track actual files being processed - folders show spinners via computed state
    const allPathsBeingProcessed = [...new Set([...foldersBeingProcessed, ...filesBeingProcessed])]
    ctx.addProcessingFoldersSync(allPathsBeingProcessed, 'upload')
    
    // Yield to event loop so React can render spinners before starting operation
    await new Promise(resolve => setTimeout(resolve, 0))
    
    const total = filesToSync.length
    
    // Progress tracking
    const toastId = `sync-${Date.now()}`
    const progress = new ProgressTracker(
      ctx,
      'sync',
      toastId,
      `Uploading ${total} file${total > 1 ? 's' : ''}...`,
      total
    )
    
    let succeeded = 0
    let failed = 0
    const errors: string[] = []
    
    // Process all files in parallel, collect updates for batch store update
    const pendingUpdates: Array<{ path: string; updates: Parameters<typeof ctx.updateFileInStore>[1] }> = []
    
    // Track synced file info for reference extraction
    const syncedFileInfos: SyncedFileInfo[] = []
    
    // Start tracking the upload phase
    const uploadStepId = tracker.startStep('Upload files', { 
      fileCount: filesToSync.length, 
      concurrency: CONCURRENT_OPERATIONS 
    })
    const uploadPhaseStart = Date.now()
    
    const results = await processWithConcurrency(filesToSync, CONCURRENT_OPERATIONS, async (file) => {
      try {
        const readResult = await window.electronAPI?.readFile(file.path)
        
        // Allow empty files (data can be empty string, but hash should always exist)
        if (!readResult?.success || readResult.data === undefined || !readResult.hash) {
          progress.update()
          return { success: false, error: `Failed to read ${file.name}` }
        }
        
        // Use pending metadata from the UI (user pre-assigned values before sync)
        // NOTE: Auto-extraction from SW files removed for performance
        // Users should use "Save to File" or enter metadata in datacard before syncing
        const metadata: SyncMetadata = {
          partNumber: file.pendingMetadata?.part_number ?? null,
          tabNumber: file.pendingMetadata?.tab_number ?? null,
          description: file.pendingMetadata?.description ?? null,
          revision: file.pendingMetadata?.revision ?? null,
          customProperties: undefined
        }
        
        const { error, file: syncedFile } = await syncFile(
          organization.id, activeVaultId, user.id,
          file.relativePath, file.name, file.extension, file.size,
          readResult.hash, readResult.data,
          metadata
        )
        
        if (error || !syncedFile) {
          progress.update()
          const errorMsg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null ? (error as any).message || String(error) : String(error || 'Upload failed'))
          return { success: false, error: `${file.name}: ${errorMsg}` }
        }
        
        await window.electronAPI?.setReadonly(file.path, true)
        // Queue update for batch processing (also clear pendingMetadata since it's now synced)
        const typedSyncedFileVersion = syncedFile as { version?: number }
        pendingUpdates.push({
          path: file.path,
          updates: { 
            pdmData: syncedFile, 
            localHash: readResult.hash, 
            localVersion: typedSyncedFileVersion.version, // Track the new version after sync
            diffStatus: undefined, 
            pendingMetadata: undefined 
          }
        })
        progress.update()
        
        // Track synced file info for reference extraction
        const typedSyncedFile = syncedFile as { id: string }
        return { 
          success: true, 
          fileInfo: {
            fileId: typedSyncedFile.id,
            fileName: file.name,
            filePath: file.path,
            extension: file.extension
          }
        }
        
      } catch (err) {
        progress.update()
        return { success: false, error: `${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}` }
      }
    })
    
    // Count results and collect synced file infos
    for (const result of results) {
      if (result.success) {
        succeeded++
        if (result.fileInfo) {
          syncedFileInfos.push(result.fileInfo)
        }
      } else {
        failed++
        if (result.error) errors.push(result.error)
      }
    }
    
    // End upload step
    tracker.endStep(uploadStepId, 'completed', { 
      succeeded, 
      failed,
      durationMs: Date.now() - uploadPhaseStart
    })
    
    // Apply all store updates in a single atomic batch + clear processing folders
    const storeUpdateStepId = tracker.startStep('Atomic store update', { 
      updateCount: pendingUpdates.length 
    })
    const storeUpdateStart = performance.now()
    if (pendingUpdates.length > 0) {
      ctx.updateFilesAndClearProcessing(pendingUpdates, allPathsBeingProcessed)
    } else {
      ctx.removeProcessingFolders(allPathsBeingProcessed)
    }
    ctx.setLastOperationCompletedAt(Date.now())
    const storeUpdateDuration = Math.round(performance.now() - storeUpdateStart)
    tracker.endStep(storeUpdateStepId, 'completed', { durationMs: storeUpdateDuration })
    logSync('info', 'Store update complete', {
      durationMs: storeUpdateDuration,
      updateCount: pendingUpdates.length,
      timestamp: Date.now()
    })
    const { duration } = progress.finish()
    
    // Show sync result
    if (failed > 0) {
      ctx.addToast('warning', `Synced ${succeeded}/${total} files`)
    } else {
      ctx.addToast('success', `Synced ${succeeded} file${succeeded > 1 ? 's' : ''} to cloud`)
    }
    
    // Update the local sync index with successfully synced file paths
    // This tracks which files have been synced for orphan detection
    if (succeeded > 0 && activeVaultId) {
      const syncedPaths = pendingUpdates.map(u => {
        // Convert absolute path back to relative path
        const file = filesToSync.find(f => f.path === u.path)
        return file?.relativePath
      }).filter((p): p is string => !!p)
      
      if (syncedPaths.length > 0) {
        addToSyncIndex(activeVaultId, syncedPaths).catch(err => {
          logSync('warn', 'Failed to update sync index after sync', { error: String(err) })
        })
      }
    }
    
    // Extract references if requested (assemblies reference components, drawings reference models)
    // This is useful for importing existing vaults with assemblies and drawings
    if (extractReferences && syncedFileInfos.length > 0) {
      const referenceFileInfos = syncedFileInfos.filter(info => 
        REFERENCE_FILE_EXTENSIONS.includes(info.extension.toLowerCase())
      )
      
      if (referenceFileInfos.length > 0) {
        logSync('info', 'Starting reference extraction phase', { 
          fileCount: referenceFileInfos.length,
          assemblies: referenceFileInfos.filter(f => f.extension.toLowerCase() === '.sldasm').length,
          drawings: referenceFileInfos.filter(f => f.extension.toLowerCase() === '.slddrw').length
        })
        
        // Show progress toast for reference extraction
        const refToastId = `sync-refs-${Date.now()}`
        ctx.addProgressToast(
          refToastId, 
          `Extracting references (0/${referenceFileInfos.length})...`, 
          referenceFileInfos.length
        )
        
        // Create a wrapper that updates progress
        let refProgress = 0
        const updateRefProgress = () => {
          refProgress++
          ctx.updateProgressToast(
            refToastId, 
            refProgress, 
            Math.round((refProgress / referenceFileInfos.length) * 100),
            undefined,
            `Extracting references (${refProgress}/${referenceFileInfos.length})`
          )
        }
        
        // Process assemblies and drawings with progress tracking
        const refResult = await extractFileReferencesWithProgress(
          referenceFileInfos,
          organization.id,
          activeVaultId,
          ctx.vaultPath || undefined,
          updateRefProgress
        )
        
        ctx.removeToast(refToastId)
        
        if (refResult.processed > 0) {
          ctx.addToast('success', `Extracted references for ${refResult.processed} file${refResult.processed > 1 ? 's' : ''}`)
        } else if (refResult.skipped > 0) {
          ctx.addToast('info', `Skipped reference extraction (SW service not running or no references found)`)
        }
        
        logSync('info', 'Reference extraction complete', refResult)
      }
    }
    
    // Complete operation tracking
    tracker.endOperation(failed === 0 ? 'completed' : 'failed', failed > 0 ? errors[0] : undefined)
    
    return {
      success: failed === 0,
      message: failed > 0 ? `Synced ${succeeded}/${total} files` : `Synced ${succeeded} file${succeeded > 1 ? 's' : ''} to cloud`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}

/**
 * Extract references with progress callback
 * Handles both assemblies (component references) and drawings (model references)
 */
async function extractFileReferencesWithProgress(
  files: SyncedFileInfo[],
  orgId: string,
  vaultId: string,
  vaultRootPath: string | undefined,
  onProgress: () => void
): Promise<{ processed: number; skipped: number; errors: number }> {
  let processed = 0
  let skipped = 0
  let errors = 0
  
  // Check if SolidWorks service is running
  const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
  if (!status?.data?.running) {
    logSync('info', 'Skipping reference extraction - SW service not running', { 
      fileCount: files.length 
    })
    return { processed: 0, skipped: files.length, errors: 0 }
  }
  
  // Process files sequentially to avoid overwhelming the SW service
  for (const file of files) {
    const isDrawing = DRAWING_EXTENSIONS.includes(file.extension.toLowerCase())
    
    try {
      // Call SolidWorks service to get references
      const result = await window.electronAPI?.solidworks?.getReferences?.(file.filePath)
      
      if (!result?.success || !result.data?.references) {
        logSync('debug', 'No references returned', {
          fileName: file.fileName,
          isDrawing,
          error: result?.error
        })
        skipped++
        onProgress()
        continue
      }
      
      const swRefs = result.data.references as Array<{
        path: string
        fileName: string
        exists: boolean
        fileType: string
      }>
      
      if (swRefs.length === 0) {
        logSync('debug', 'File has no references', { fileName: file.fileName, isDrawing })
        skipped++
        onProgress()
        continue
      }
      
      // Convert SW service format to our SWReference format
      // Reference types differ based on file type:
      // - Assemblies: components (parts and sub-assemblies)
      // - Drawings: model references (the parts/assemblies the drawing documents)
      const references: SWReference[] = swRefs.map(ref => ({
        childFilePath: ref.path,
        quantity: 1,
        referenceType: isDrawing 
          ? 'reference'  // Drawings reference models they document
          : (ref.fileType === 'assembly' ? 'component' : 
             ref.fileType === 'part' ? 'component' : 'reference'),
        configuration: undefined
      }))
      
      logSync('debug', 'Extracted references', {
        fileName: file.fileName,
        isDrawing,
        referenceCount: references.length,
        firstReference: references[0]?.childFilePath
      })
      
      // Store references in database (pass vault root for better path matching)
      const upsertResult = await upsertFileReferences(orgId, vaultId, file.fileId, references, vaultRootPath)
      
      if (upsertResult.success) {
        processed++
        logSync('info', 'Stored file references', {
          fileName: file.fileName,
          isDrawing,
          inserted: upsertResult.inserted,
          updated: upsertResult.updated,
          deleted: upsertResult.deleted,
          skipped: upsertResult.skipped
        })
        
        if (upsertResult.skippedReasons && upsertResult.skippedReasons.length > 0) {
          logSync('debug', 'Some references skipped', {
            fileName: file.fileName,
            skippedReasons: upsertResult.skippedReasons
          })
        }
      } else {
        logSync('warn', 'Failed to store references', {
          fileName: file.fileName,
          error: upsertResult.error
        })
        errors++
      }
      
    } catch (err) {
      logSync('warn', 'Reference extraction failed', {
        fileName: file.fileName,
        isDrawing,
        error: err instanceof Error ? err.message : String(err)
      })
      errors++
    }
    
    onProgress()
  }
  
  return { processed, skipped, errors }
}
