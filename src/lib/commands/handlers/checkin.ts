/**
 * Checkin Command
 * 
 * Check in files after editing. This:
 * 1. Uploads new content if modified
 * 2. Updates metadata on server (auto-extracts from SolidWorks files if available)
 * 3. Releases the checkout lock
 * 4. Makes the local file read-only
 */

import type { Command, CheckinParams, CommandResult } from '../types'
import { getSyncedFilesFromSelection } from '../types'
import { ProgressTracker } from '../executor'
import { checkinFile, upsertFileReferences } from '../../supabase'
import type { SWReference } from '../../supabase/files/mutations'
import { processWithConcurrency, CONCURRENT_OPERATIONS, SW_CONCURRENT_OPERATIONS } from '../../concurrency'
import type { LocalFile, PendingMetadata } from '../../../stores/pdmStore'
import { usePDMStore } from '../../../stores/pdmStore'

// SolidWorks file extensions that support metadata extraction
const SW_EXTENSIONS = ['.sldprt', '.sldasm', '.slddrw']

// Only assemblies have references to extract
const ASSEMBLY_EXTENSIONS = ['.sldasm']

/**
 * Incremental Store Update Configuration
 * 
 * During batch operations (checking in many files), updating the store after
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
 * Pre-cached SolidWorks service status to avoid redundant IPC calls per file
 */
interface SwServiceStatus {
  running: boolean
  documentManagerAvailable: boolean
}

import type { SerializationSettings } from '../../serialization'

/**
 * Write pending metadata back to SolidWorks file before check-in
 * This syncs datacard changes to the actual file properties
 * @param swStatus - Pre-cached service status to avoid redundant IPC calls in batch operations
 * @param serSettings - Pre-fetched serialization settings (batch optimization)
 */
async function writeSolidWorksMetadata(
  fullPath: string,
  extension: string,
  pendingMetadata: PendingMetadata | undefined,
  swStatus: SwServiceStatus,
  serSettings: SerializationSettings | null
): Promise<boolean> {
  // Only process SolidWorks files with pending changes
  if (!SW_EXTENSIONS.includes(extension.toLowerCase()) || !pendingMetadata) {
    return true // Nothing to write
  }
  
  // Use pre-cached service status (avoids N IPC calls for N files)
  if (!swStatus.running || !swStatus.documentManagerAvailable) {
    console.debug('[Checkin] SolidWorks service/Document Manager not available, skipping metadata write-back')
    return true // Continue without writing (not a failure)
  }
  
  try {
    const { part_number, description, revision, config_tabs, config_descriptions } = pendingMetadata
    
    // Build file-level properties to write
    const fileProps: Record<string, string> = {}
    if (part_number) fileProps['Number'] = part_number
    if (description) fileProps['Description'] = description
    if (revision) fileProps['Revision'] = revision
    
    // Write file-level properties if any
    if (Object.keys(fileProps).length > 0) {
      console.debug('[Checkin] Writing file-level properties:', Object.keys(fileProps))
      const result = await window.electronAPI?.solidworks?.setProperties?.(fullPath, fileProps)
      if (!result?.success) {
        console.warn('[Checkin] Failed to write file-level properties:', result?.error)
      }
    }
    
    // Write per-configuration properties (tabs and descriptions)
    // Use batch API to write all configs in single IPC call (performance optimization)
    const hasConfigTabs = config_tabs && Object.keys(config_tabs).length > 0
    const hasConfigDescs = config_descriptions && Object.keys(config_descriptions).length > 0
    
    if (hasConfigTabs || hasConfigDescs) {
      // Get all configuration names to write to
      const configNames = new Set<string>()
      if (config_tabs) Object.keys(config_tabs).forEach(k => configNames.add(k))
      if (config_descriptions) Object.keys(config_descriptions).forEach(k => configNames.add(k))
      
      // Use pre-fetched serialization settings (batch optimization - avoids N DB calls)
      const { combineBaseAndTab } = await import('../../serialization')
      
      // Build all config properties in one object for batch API
      const allConfigProps: Record<string, Record<string, string>> = {}
      
      for (const configName of configNames) {
        const configProps: Record<string, string> = {}
        
        // If we have a tab number for this config, combine with base for full part number
        const tabNum = config_tabs?.[configName]
        if (tabNum && part_number && serSettings) {
          // part_number is the base number, combine with config's tab
          const fullPartNumber = combineBaseAndTab(part_number, tabNum, serSettings)
          if (fullPartNumber) {
            configProps['Number'] = fullPartNumber
          }
        }
        
        // Per-config description
        const configDesc = config_descriptions?.[configName]
        if (configDesc) {
          configProps['Description'] = configDesc
        }
        
        if (Object.keys(configProps).length > 0) {
          allConfigProps[configName] = configProps
        }
      }
      
      // Use batch API for all configs at once (1 IPC call instead of N)
      if (Object.keys(allConfigProps).length > 0) {
        console.debug(`[Checkin] Writing properties to ${Object.keys(allConfigProps).length} configs via batch API`)
        const result = await window.electronAPI?.solidworks?.setPropertiesBatch?.(fullPath, allConfigProps)
        if (!result?.success) {
          console.warn(`[Checkin] Batch properties write failed:`, result?.error)
        }
      }
    }
    
    return true
  } catch (err) {
    console.warn('[Checkin] Failed to write SolidWorks metadata:', err)
    return false // Non-fatal, continue with check-in
  }
}

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

/**
 * Extract and store assembly references after a successful check-in.
 * This populates the file_references table for Contains/Where-Used queries.
 * 
 * @param file - The checked-in assembly file
 * @param orgId - Organization ID
 * @param vaultId - Vault ID
 * @param vaultRootPath - Optional local vault root path for better path matching
 * @returns Promise that resolves when extraction is complete (non-blocking to check-in)
 */
async function extractAndStoreReferences(
  file: LocalFile,
  orgId: string,
  vaultId: string,
  vaultRootPath?: string
): Promise<void> {
  // Only process assemblies
  if (!ASSEMBLY_EXTENSIONS.includes(file.extension.toLowerCase())) {
    return
  }
  
  const fileId = file.pdmData?.id
  if (!fileId) {
    logCheckin('debug', 'Skipping reference extraction - no file ID', { fileName: file.name })
    return
  }
  
  // Check if SolidWorks service is running
  const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
  if (!status?.data?.running) {
    logCheckin('debug', 'Skipping reference extraction - SW service not running', { fileName: file.name })
    return
  }
  
  try {
    logCheckin('debug', 'Extracting assembly references', { 
      fileName: file.name,
      fullPath: file.path
    })
    
    // Call SolidWorks service to get references
    const result = await window.electronAPI?.solidworks?.getReferences?.(file.path)
    
    if (!result?.success || !result.data?.references) {
      logCheckin('debug', 'No references returned from SW service', { 
        fileName: file.name,
        error: result?.error
      })
      return
    }
    
    const swRefs = result.data.references as Array<{
      path: string
      fileName: string
      exists: boolean
      fileType: string
    }>
    
    logCheckin('debug', 'Got references from SW service', { 
      fileName: file.name,
      count: swRefs.length
    })
    
    // Convert SW service format to our SWReference format
    // The SW service returns one entry per unique component path
    // We map fileType to referenceType
    const references: SWReference[] = swRefs.map(ref => ({
      childFilePath: ref.path,
      quantity: 1, // SW service doesn't provide quantity in getReferences, default to 1
      referenceType: ref.fileType === 'assembly' ? 'component' : 
                     ref.fileType === 'part' ? 'component' : 'reference',
      configuration: undefined // Will be populated if we have BOM data
    }))
    
    // Store references in database (pass vault root for better path matching)
    const upsertResult = await upsertFileReferences(orgId, vaultId, fileId, references, vaultRootPath)
    
    if (upsertResult.success) {
      logCheckin('info', 'Stored assembly references', {
        fileName: file.name,
        inserted: upsertResult.inserted,
        updated: upsertResult.updated,
        deleted: upsertResult.deleted,
        skipped: upsertResult.skipped,
        skippedReasons: upsertResult.skippedReasons
      })
    } else {
      logCheckin('warn', 'Failed to store assembly references', {
        fileName: file.name,
        error: upsertResult.error
      })
    }
    
  } catch (err) {
    // Non-fatal - reference extraction failure shouldn't block check-in
    logCheckin('warn', 'Reference extraction failed', {
      fileName: file.name,
      error: err instanceof Error ? err.message : String(err)
    })
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
    workflowState: file.pdmData?.workflow_state?.name,
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
    
    // ========================================
    // PERFORMANCE OPTIMIZATION: Pre-fetch all values ONCE before the loop
    // This eliminates N redundant IPC/DB calls for N files
    // ========================================
    
    // Pre-fetch machine ID ONCE (avoids 80 getMachineId IPC calls for 80 files)
    const { getMachineId } = await import('../../backup')
    const machineId = await getMachineId()
    
    // Pre-fetch serialization settings ONCE (avoids 80 DB queries for 80 files)
    const { getSerializationSettings } = await import('../../serialization')
    const orgId = ctx.organization?.id
    const serializationSettings = orgId ? await getSerializationSettings(orgId) : null
    
    logCheckin('debug', 'Pre-fetched batch operation values', {
      operationId,
      machineId: machineId?.substring(0, 8) + '...',
      hasSerializationSettings: !!serializationSettings
    })
    
    // Pre-check SolidWorks service status ONCE (avoid checking for every file in batch)
    let swServiceStatus: SwServiceStatus = { running: false, documentManagerAvailable: false }
    try {
      const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
      swServiceStatus = {
        running: !!status?.data?.running,
        documentManagerAvailable: !!status?.data?.documentManagerAvailable
      }
    } catch {
      // SW service not available
    }
    
    // Track folders and files being processed (for spinner display) - batch add
    const foldersBeingProcessed = files
      .filter(f => f.isDirectory)
      .map(f => f.relativePath)
    const filesBeingProcessed = filesToCheckin.map(f => f.relativePath)
    const allPathsBeingProcessed = [...new Set([...foldersBeingProcessed, ...filesBeingProcessed])]
    ctx.addProcessingFolders(allPathsBeingProcessed, 'checkin')
    
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
    
    // Collect files for batch readonly operation (optimization: 1 IPC call instead of N)
    const filesToMakeReadonly: string[] = []
    
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
        logCheckin('debug', 'Incremental store flush', {
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
    const swFiles = filesToCheckin.filter(f => SW_EXTENSIONS.includes(f.extension.toLowerCase()))
    const nonSwFiles = filesToCheckin.filter(f => !SW_EXTENSIONS.includes(f.extension.toLowerCase()))
    
    logCheckin('info', 'Two-phase processing strategy', {
      operationId,
      totalFiles: filesToCheckin.length,
      swFiles: swFiles.length,
      nonSwFiles: nonSwFiles.length,
      swConcurrency: SW_CONCURRENT_OPERATIONS,
      nonSwConcurrency: CONCURRENT_OPERATIONS
    })
    
    /**
     * Process a single file for check-in
     * Extracted to avoid code duplication between phases
     */
    const processFile = async (file: LocalFile): Promise<{ success: boolean; error?: string; file?: LocalFile }> => {
      const fileCtx = getFileContext(file)
      const isSolidWorksFile = SW_EXTENSIONS.includes(file.extension.toLowerCase())
      const swOpStartTime = isSolidWorksFile ? Date.now() : null
      
      try {
        const wasFileMoved = file.pdmData?.file_path && 
          file.relativePath !== file.pdmData.file_path
        const wasFileRenamed = file.pdmData?.file_name && 
          file.name !== file.pdmData.file_name
        
        // PERFORMANCE OPTIMIZATION: Determine upfront if we can skip SW calls
        // If we have a cached hash AND no pending metadata, we don't need SW service at all
        const hasPendingMetadata = !!file.pendingMetadata
        const canUseCachedHash = !hasPendingMetadata && !!file.localHash
        const skipSolidWorksOps = !isSolidWorksFile || (canUseCachedHash && !hasPendingMetadata)
        
        logCheckin('debug', 'Checking in file', {
          operationId,
          ...fileCtx,
          wasFileMoved,
          wasFileRenamed,
          oldPath: wasFileMoved ? file.pdmData?.file_path : undefined,
          oldName: wasFileRenamed ? file.pdmData?.file_name : undefined,
          skipSolidWorksOps,
          canUseCachedHash,
          hasPendingMetadata
        })
        
        // If SolidWorks file is open, save it first to ensure we check in the latest changes
        // Skip this if we can use cached hash and have no pending metadata
        let metadataWasWritten = false
        if (isSolidWorksFile && !skipSolidWorksOps) {
          try {
            const docInfo = await window.electronAPI?.solidworks?.getDocumentInfo?.(file.path)
            if (docInfo?.success && docInfo.data?.isOpen && docInfo.data?.isDirty) {
              logCheckin('info', 'Saving open SolidWorks document before check-in', {
                operationId,
                fileName: file.name
              })
              const saveResult = await window.electronAPI?.solidworks?.saveDocument?.(file.path)
              if (saveResult?.success && saveResult.data?.saved) {
                logCheckin('info', 'SolidWorks document saved successfully', {
                  operationId,
                  fileName: file.name
                })
              } else if (!saveResult?.success) {
                logCheckin('warn', 'Failed to save SolidWorks document', {
                  operationId,
                  fileName: file.name,
                  error: saveResult?.error
                })
              }
            }
          } catch {
            // SW service not available - continue with regular checkin
          }
          
          // Write pending metadata back to SolidWorks file (syncs datacard → file)
          // Must happen BEFORE computing hash since it modifies the file
          if (hasPendingMetadata) {
            logCheckin('debug', 'Writing pending metadata to SolidWorks file', {
              operationId,
              fileName: file.name,
              hasPartNumber: !!file.pendingMetadata!.part_number,
              hasDescription: !!file.pendingMetadata!.description,
              hasConfigTabs: !!(file.pendingMetadata!.config_tabs && Object.keys(file.pendingMetadata!.config_tabs).length > 0),
              hasConfigDescs: !!(file.pendingMetadata!.config_descriptions && Object.keys(file.pendingMetadata!.config_descriptions).length > 0)
            })
            
            // Pass pre-fetched serialization settings (batch optimization)
            const writeSuccess = await writeSolidWorksMetadata(file.path, file.extension, file.pendingMetadata!, swServiceStatus, serializationSettings)
            if (writeSuccess) {
              metadataWasWritten = true
              logCheckin('info', 'Successfully wrote metadata to SolidWorks file', {
                operationId,
                fileName: file.name
              })
            }
          }
        }
        
        // Compute file hash - use streaming for efficiency
        // If metadata was written to file, we MUST compute fresh hash
        // Otherwise, use cached localHash if available (avoids re-reading unchanged files)
        let fileHash: string | undefined
        let fileSize: number | undefined
        
        // Recalculate since metadataWasWritten may have changed
        const usesCachedHash = !metadataWasWritten && !!file.localHash
        
        if (usesCachedHash) {
          // Use cached hash - file hasn't been modified since last scan
          fileHash = file.localHash
          fileSize = file.size
          logCheckin('debug', 'Using cached hash (no metadata write-back)', {
            operationId,
            fileName: file.name,
            cachedHash: fileHash?.substring(0, 12)
          })
        } else {
          // Compute fresh hash using streaming (memory-efficient for large files)
          const hashResult = await window.electronAPI?.hashFile(file.path)
          
          if (!hashResult?.success) {
            logCheckin('error', 'Failed to hash local file', {
              operationId,
              ...fileCtx,
              hashError: hashResult?.error
            })
            progress.update()
            return { success: false, error: `${file.name}: Failed to hash file - ${hashResult?.error || 'Unknown error'}` }
          }
          
          fileHash = hashResult.hash
          fileSize = hashResult.size
          logCheckin('debug', 'Computed fresh hash using streaming', {
            operationId,
            fileName: file.name,
            hash: fileHash?.substring(0, 12),
            size: fileSize,
            reason: metadataWasWritten ? 'metadata_written' : 'no_cached_hash'
          })
        }
        
        // Only use pending metadata if user made edits
        // Auto-extraction removed - it was opening every SW file in Document Manager
        // Metadata sync happens on checkout when properties are displayed
        const metadataToUse = file.pendingMetadata
        
        if (fileHash) {
          logCheckin('debug', 'Hash computed, checking in', {
            operationId,
            fileName: file.name,
            localHash: fileHash.substring(0, 12),
            size: fileSize
          })
          
          const result = await checkinFile(file.pdmData!.id, user.id, {
            newContentHash: fileHash,
            newFileSize: fileSize || file.size,
            newFilePath: wasFileMoved ? file.relativePath : undefined,
            newFileName: wasFileRenamed ? file.name : undefined,
            localActiveVersion: file.localActiveVersion,
            pendingMetadata: metadataToUse,
            // Batch optimization: skip per-file machine mismatch check (eliminates N SELECT + N IPC calls)
            machineId,
            skipMachineMismatchCheck: true
          })
          
          if (result.success && result.file) {
            // Collect for batch readonly operation (optimization: 1 IPC instead of N)
            filesToMakeReadonly.push(file.path)
            
            // If SolidWorks file is open, also set document to read-only
            // This allows checking in files without closing SolidWorks!
            if (SW_EXTENSIONS.includes(file.extension.toLowerCase())) {
              try {
                const docResult = await window.electronAPI?.solidworks?.setDocumentReadOnly?.(file.path, true)
                if (docResult?.success && docResult.data?.changed) {
                  logCheckin('info', 'Updated SolidWorks document to read-only', {
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
            
            // Queue update for batch processing
            pendingUpdates.push({
              path: file.path,
              updates: {
                pdmData: { ...file.pdmData!, ...result.file, checked_out_by: null, checked_out_user: null },
                localHash: fileHash,
                diffStatus: undefined,
                localActiveVersion: undefined,
                pendingMetadata: undefined
              }
            })
            
            // Flush periodically for real-time UI feedback (count OR time based)
            if (shouldFlush()) {
              flushPendingUpdates()
            }
            
            // Log timing for SW operations (helps diagnose service performance)
            if (swOpStartTime !== null) {
              const swOpDuration = Date.now() - swOpStartTime
              logCheckin('info', 'SolidWorks file checkin successful', {
                operationId,
                fileName: file.name,
                oldVersion: file.pdmData?.version,
                newVersion: result.file.version,
                swOperationDurationMs: swOpDuration
              })
            } else {
              logCheckin('info', 'File checkin successful', {
                operationId,
                fileName: file.name,
                oldVersion: file.pdmData?.version,
                newVersion: result.file.version,
                localActiveVersionCleared: file.localActiveVersion !== undefined,
                diffStatusCleared: file.diffStatus !== undefined
              })
            }
            progress.update()
            // Return file info for post-checkin processing (reference extraction)
            return { success: true, file }
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
            localActiveVersion: file.localActiveVersion,
            pendingMetadata: metadataToUse,
            // Batch optimization: skip per-file machine mismatch check (eliminates N SELECT + N IPC calls)
            machineId,
            skipMachineMismatchCheck: true
          })
          
          if (result.success && result.file) {
            // Collect for batch readonly operation (optimization: 1 IPC instead of N)
            filesToMakeReadonly.push(file.path)
            
            // If SolidWorks file is open, also set document to read-only
            if (SW_EXTENSIONS.includes(file.extension.toLowerCase())) {
              try {
                await window.electronAPI?.solidworks?.setDocumentReadOnly?.(file.path, true)
              } catch {
                // SW service not available or file not open - that's fine
              }
            }
            
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
            
            // Flush periodically for real-time UI feedback (count OR time based)
            if (shouldFlush()) {
              flushPendingUpdates()
            }
            
            // Log timing for SW operations (helps diagnose service performance)
            if (swOpStartTime !== null) {
              const swOpDuration = Date.now() - swOpStartTime
              logCheckin('info', 'SolidWorks metadata checkin successful', {
                operationId,
                fileName: file.name,
                oldVersion: file.pdmData?.version,
                newVersion: result.file.version,
                swOperationDurationMs: swOpDuration
              })
            } else {
              logCheckin('info', 'Metadata checkin successful', {
                operationId,
                fileName: file.name,
                oldVersion: file.pdmData?.version,
                newVersion: result.file.version,
                localActiveVersionCleared: file.localActiveVersion !== undefined,
                diffStatusCleared: file.diffStatus !== undefined
              })
            }
            progress.update()
            // Return file info for post-checkin processing (reference extraction)
            return { success: true, file }
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
    }
    
    // ========================================
    // PHASE 1: Process non-SolidWorks files at high concurrency (20)
    // These files don't need SW service, so no bottleneck
    // ========================================
    let nonSwResults: Array<{ success: boolean; error?: string; file?: LocalFile }> = []
    if (nonSwFiles.length > 0) {
      logCheckin('info', 'Phase 1: Processing non-SW files', {
        operationId,
        count: nonSwFiles.length,
        concurrency: CONCURRENT_OPERATIONS
      })
      const phase1Start = Date.now()
      nonSwResults = await processWithConcurrency(nonSwFiles, CONCURRENT_OPERATIONS, processFile)
      logCheckin('info', 'Phase 1 complete', {
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
    let swResults: Array<{ success: boolean; error?: string; file?: LocalFile }> = []
    if (swFiles.length > 0) {
      logCheckin('info', 'Phase 2: Processing SW files', {
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
      
      logCheckin('info', 'Phase 2 complete', {
        operationId,
        count: swFiles.length,
        durationMs: Date.now() - phase2Start
      })
    }
    
    // Combine results from both phases
    const results = [...nonSwResults, ...swResults]
    
    // Flush any remaining store updates not yet flushed during incremental processing
    if (pendingUpdates.length > lastFlushIndex) {
      logCheckin('info', 'Final store update flush', {
        operationId,
        remainingCount: pendingUpdates.length - lastFlushIndex,
        totalUpdates: pendingUpdates.length,
        paths: pendingUpdates.slice(lastFlushIndex).map(u => u.path)
      })
      flushPendingUpdates()
    }
    
    // Batch set readonly on all successful files (optimization: 1 IPC call instead of N)
    if (filesToMakeReadonly.length > 0) {
      logCheckin('debug', 'Setting readonly batch', {
        operationId,
        fileCount: filesToMakeReadonly.length
      })
      const batchReadonlyResult = await window.electronAPI?.setReadonlyBatch(
        filesToMakeReadonly.map(path => ({ path, readonly: true }))
      )
      if (batchReadonlyResult) {
        const failures = batchReadonlyResult.results?.filter(r => !r.success) || []
        if (failures.length > 0) {
          logCheckin('warn', 'Some files failed to set readonly', {
            operationId,
            failedCount: failures.length,
            failures: failures.slice(0, 5).map(f => ({ path: f.path, error: f.error }))
          })
        }
      }
    }
    
    // Count results and collect successfully checked-in files
    const successfulFiles: LocalFile[] = []
    for (const result of results) {
      if (result.success) {
        succeeded++
        if (result.file) {
          successfulFiles.push(result.file)
        }
      } else {
        failed++
        if (result.error) errors.push(result.error)
      }
    }
    
    // Extract and store assembly references in BACKGROUND (non-blocking)
    // This runs after all files are checked in, so child references are more likely to exist
    // We don't await this - it runs in background and logs its own results
    let extractionStarted = false
    const assemblyFiles: LocalFile[] = []
    
    if (successfulFiles.length > 0 && ctx.activeVaultId && ctx.organization?.id) {
      const assemblies = successfulFiles.filter(f => 
        ASSEMBLY_EXTENSIONS.includes(f.extension.toLowerCase())
      )
      assemblyFiles.push(...assemblies)
      
      if (assemblyFiles.length > 0) {
        // Check if SolidWorks service is running BEFORE attempting extraction
        const swStatus = await window.electronAPI?.solidworks?.getServiceStatus?.()
        const swRunning = swStatus?.data?.running
        
        if (!swRunning) {
          logCheckin('info', 'Skipping reference extraction - SW service not running', {
            operationId,
            assemblyCount: assemblyFiles.length,
            assemblies: assemblyFiles.map(f => f.name)
          })
          // Show info toast so user knows what to do
          ctx.addToast('info', `Assembly references not extracted — start SolidWorks service and use "Update from SW" in Contains tab`)
        } else {
          logCheckin('debug', 'Starting background reference extraction for assemblies', {
            operationId,
            assemblyCount: assemblyFiles.length,
            assemblies: assemblyFiles.map(f => f.name)
          })
          
          extractionStarted = true
          const vaultId = ctx.activeVaultId
          const orgId = ctx.organization.id
          const vaultRootPath = ctx.vaultPath || undefined
          
          // NON-BLOCKING: Fire-and-forget extraction - don't await!
          // This keeps the checkin responsive while references are extracted in background
          Promise.allSettled(
            assemblyFiles.map(f => extractAndStoreReferences(f, orgId, vaultId, vaultRootPath))
          ).then(extractResults => {
            const extractionSucceeded = extractResults.filter(r => r.status === 'fulfilled').length
            const extractionFailed = assemblyFiles.length - extractionSucceeded
            
            logCheckin('info', 'Background reference extraction complete', {
              operationId,
              total: assemblyFiles.length,
              succeeded: extractionSucceeded,
              failed: extractionFailed
            })
            
            // Show warning toast if extraction had failures
            if (extractionFailed > 0 && extractionSucceeded === 0) {
              ctx.addToast('warning', `Failed to extract component references`)
            } else if (extractionFailed > 0) {
              ctx.addToast('warning', `Reference extraction failed for ${extractionFailed}/${assemblyFiles.length} assemblies`)
            }
          }).catch(err => {
            logCheckin('error', 'Background reference extraction error', {
              operationId,
              error: err instanceof Error ? err.message : String(err)
            })
          })
        }
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
      assembliesProcessed: assemblyFiles.length,
      extractionStartedInBackground: extractionStarted,
      duration,
      errors: errors.length > 0 ? errors : undefined
    })
    
    // Build success message - don't mention extraction since it's async
    const checkinMsg = `Checked in ${succeeded} file${succeeded > 1 ? 's' : ''}`
    const extractionNote = extractionStarted 
      ? ` (extracting ${assemblyFiles.length} assembly reference${assemblyFiles.length > 1 ? 's' : ''} in background)`
      : ''
    const combinedSuccessMsg = `${checkinMsg}${extractionNote}`
    
    // Show result
    if (failed > 0) {
      // Show first error in toast for visibility
      const firstError = errors[0] || 'Unknown error'
      const moreText = errors.length > 1 ? ` (+${errors.length - 1} more)` : ''
      ctx.addToast('error', `Check-in failed: ${firstError}${moreText}`)
    } else {
      ctx.addToast('success', combinedSuccessMsg)
    }
    
    return {
      success: failed === 0,
      message: failed > 0 ? `Checked in ${succeeded}/${total} files` : combinedSuccessMsg,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}

