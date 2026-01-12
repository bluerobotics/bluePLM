/**
 * Sync SolidWorks Metadata Command
 * 
 * Extract metadata from SolidWorks files and update the database.
 * Creates a new version if metadata has changed.
 * 
 * This can be triggered from:
 * - Right-click context menu
 * - Command palette
 */

import type { Command, CommandResult, LocalFile, SyncSwMetadataParams } from '../types'
import { getSyncedFilesFromSelection } from '../types'
import { ProgressTracker } from '../executor'
import { syncSolidWorksFileMetadata } from '../../supabase'
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'
import { log } from '@/lib/logger'
import { FileOperationTracker } from '../../fileOperationTracker'

// SolidWorks file extensions that support metadata extraction
const SW_EXTENSIONS = ['.sldprt', '.sldasm', '.slddrw']

function logSyncMeta(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown>) {
  log[level]('[SyncSWMetadata]', message, context)
}

/**
 * Extract metadata from SolidWorks file using the SW service
 */
async function extractSolidWorksMetadata(
  fullPath: string,
  extension: string
): Promise<{
  part_number?: string | null
  description?: string | null
  revision?: string | null
  customProperties?: Record<string, string | number | null>
} | null> {
  // Only process SolidWorks files
  if (!SW_EXTENSIONS.includes(extension.toLowerCase())) {
    return null
  }
  
  // Check if SolidWorks service is available
  const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
  if (!status?.data?.running) {
    logSyncMeta('debug', 'SolidWorks service not running', { fullPath })
    return null
  }
  
  try {
    const result = await window.electronAPI?.solidworks?.getProperties?.(fullPath)
    
    // Log raw result from SW service
    logSyncMeta('info', 'SW service raw response', { 
      fullPath, 
      success: result?.success,
      hasData: !!result?.data,
      error: result?.error,
      dataKeys: result?.data ? Object.keys(result.data) : [],
      filePropsCount: result?.data?.fileProperties ? Object.keys(result.data.fileProperties).length : 0,
      configPropsCount: result?.data?.configurationProperties ? Object.keys(result.data.configurationProperties).length : 0
    })
    
    if (!result?.success || !result.data) {
      logSyncMeta('warn', 'Failed to get properties from SolidWorks', { fullPath, error: result?.error })
      return null
    }
    
    const data = result.data as {
      fileProperties?: Record<string, string>
      configurationProperties?: Record<string, Record<string, string>>
    }
    
    // Log the actual properties
    logSyncMeta('info', 'SW file properties', { 
      fullPath,
      fileProperties: data.fileProperties,
      configNames: data.configurationProperties ? Object.keys(data.configurationProperties) : []
    })
    
    // Merge file-level and active configuration properties
    // Configuration properties take precedence over file-level properties
    const allProps: Record<string, string> = { ...data.fileProperties }
    
    // Also check configuration properties - try multiple common config names
    const configProps = data.configurationProperties
    if (configProps) {
      // Priority order: Default, Standard, first available
      const configNames = Object.keys(configProps)
      const preferredConfig = configNames.find(k => 
        k.toLowerCase() === 'default'
      ) || configNames.find(k => 
        k.toLowerCase() === 'standard'
      ) || configNames.find(k =>
        k.toLowerCase() === 'default configuration'
      ) || configNames[0]
      
      if (preferredConfig && configProps[preferredConfig]) {
        // Config properties override file-level properties
        Object.assign(allProps, configProps[preferredConfig])
      }
    }
    
    // Log all available properties for debugging
    const propKeys = Object.keys(allProps)
    logSyncMeta('debug', 'Available properties', { fullPath, properties: propKeys.join(', ') })
    
    // Extract part number from common property names (comprehensive list)
    // IMPORTANT: "Number" must be first - it's the property written by "Save to File" in the UI
    // and represents the user's current/intended part number. "Base Item Number" may contain
    // legacy or template values that would incorrectly override user edits.
    const partNumberKeys = [
      // Blue Robotics primary - this is what gets written by "Save to File"
      'Number', 'No', 'No.',
      // SolidWorks standard/common
      'Base Item Number',  // Document Manager standard property (may be stale)
      'PartNumber', 'Part Number', 'PARTNUMBER', 'PART NUMBER',
      'Part No', 'Part No.', 'PartNo', 'PARTNO', 'PART NO',
      // Item number variations
      'ItemNumber', 'Item Number', 'ITEMNUMBER', 'ITEM NUMBER',
      'Item No', 'Item No.', 'ItemNo', 'ITEMNO', 'ITEM NO',
      // Short forms
      'PN', 'P/N', 'pn', 'p/n',
      // Other common names
      'Document Number', 'DocumentNumber', 'Doc Number', 'DocNo',
      'Stock Code', 'StockCode', 'Stock Number', 'StockNumber',
      'Product Number', 'ProductNumber', 'SKU',
    ]
    
    let part_number: string | null = null
    for (const key of partNumberKeys) {
      if (allProps[key] && allProps[key].trim() && !allProps[key].startsWith('$')) {
        part_number = allProps[key].trim()
        logSyncMeta('debug', `Found part number in "${key}"`, { fullPath, partNumber: part_number })
        break
      }
    }
    
    // Case-insensitive fallback
    if (!part_number) {
      for (const [key, value] of Object.entries(allProps)) {
        const lowerKey = key.toLowerCase()
        // Skip formula references (start with $)
        if (value?.startsWith?.('$')) continue
        
        if ((lowerKey.includes('part') && (lowerKey.includes('number') || lowerKey.includes('no'))) ||
            (lowerKey.includes('item') && (lowerKey.includes('number') || lowerKey.includes('no'))) ||
            lowerKey === 'pn' || lowerKey === 'p/n' ||
            lowerKey.includes('stock') && (lowerKey.includes('code') || lowerKey.includes('number'))) {
          if (value && value.trim()) {
            part_number = value.trim()
            logSyncMeta('debug', `Found part number (fallback) in "${key}"`, { fullPath, partNumber: part_number })
            break
          }
        }
      }
    }
    
    // Extract description (comprehensive list)
    const descriptionKeys = [
      'Description', 'DESCRIPTION', 'description',
      'Desc', 'DESC', 'desc',
      'Title', 'TITLE', 'title',
      'Name', 'NAME', 'name',
      'Part Description', 'PartDescription', 'PART DESCRIPTION',
      'Component Description', 'ComponentDescription',
      'Item Description', 'ItemDescription',
    ]
    
    let description: string | null = null
    for (const key of descriptionKeys) {
      if (allProps[key] && allProps[key].trim() && !allProps[key].startsWith('$')) {
        description = allProps[key].trim()
        break
      }
    }
    
    // Case-insensitive fallback for description
    if (!description) {
      for (const [key, value] of Object.entries(allProps)) {
        const lowerKey = key.toLowerCase()
        if (value?.startsWith?.('$')) continue
        
        if (lowerKey.includes('description') || lowerKey.includes('desc')) {
          if (value && value.trim()) {
            description = value.trim()
            break
          }
        }
      }
    }
    
    // Extract revision (comprehensive list)
    const revisionKeys = [
      'Revision', 'REVISION', 'revision',
      'Rev', 'REV', 'rev',
      'Rev.', 'REV.',
      'RevLevel', 'Rev Level', 'Revision Level', 'RevisionLevel',
      'Rev No', 'RevNo', 'Rev Number', 'RevNumber',
      'Version', 'VERSION', 'version',
      'Ver', 'VER', 'ver',
      'ECO', 'ECN', 'Change Level', 'ChangeLevel',
      'Engineering Change', 'EngineeringChange',
    ]
    
    let revision: string | null = null
    for (const key of revisionKeys) {
      if (allProps[key] && allProps[key].trim() && !allProps[key].startsWith('$')) {
        revision = allProps[key].trim()
        break
      }
    }
    
    // Case-insensitive fallback for revision
    if (!revision) {
      for (const [key, value] of Object.entries(allProps)) {
        const lowerKey = key.toLowerCase()
        if (value?.startsWith?.('$')) continue
        
        if (lowerKey.includes('revision') || lowerKey === 'rev' || 
            lowerKey.includes('rev ') || lowerKey.startsWith('rev.')) {
          if (value && value.trim()) {
            revision = value.trim()
            break
          }
        }
      }
    }
    
    // Build custom properties object (exclude the ones we've already extracted)
    const excludeKeys = new Set([
      ...partNumberKeys, 
      ...descriptionKeys,
      ...revisionKeys
    ].map(k => k.toLowerCase()))
    
    const customProperties: Record<string, string | number | null> = {}
    for (const [key, value] of Object.entries(allProps)) {
      if (!excludeKeys.has(key.toLowerCase()) && value && !value.startsWith('$')) {
        customProperties[key] = value
      }
    }
    
    // Log extracted values at info level so it's visible
    logSyncMeta('info', 'Extracted metadata from SW file', { 
      fullPath, 
      partNumber: part_number, 
      description: description?.substring(0, 50), 
      revision,
      allPropertyKeys: Object.keys(allProps).join(', ')
    })
    
    return {
      part_number,
      description: description?.trim() || null,
      revision,
      customProperties: Object.keys(customProperties).length > 0 ? customProperties : undefined
    }
  } catch (err) {
    logSyncMeta('error', 'Exception extracting metadata', { fullPath, error: String(err) })
    return null
  }
}

/**
 * Check if metadata has changed
 */
function hasMetadataChanged(
  file: LocalFile,
  newMetadata: { part_number?: string | null; description?: string | null; revision?: string | null }
): boolean {
  const currentPartNumber = file.pdmData?.part_number || null
  const currentDescription = file.pdmData?.description || null
  const currentRevision = file.pdmData?.revision || null
  
  const newPartNumber = newMetadata.part_number || null
  const newDescription = newMetadata.description || null
  const newRevision = newMetadata.revision || null
  
  return currentPartNumber !== newPartNumber || 
         currentDescription !== newDescription ||
         currentRevision !== newRevision
}

export const syncSwMetadataCommand: Command<SyncSwMetadataParams> = {
  id: 'sync-sw-metadata',
  name: 'Sync SolidWorks Metadata',
  description: 'Extract and sync metadata from SolidWorks file properties',
  aliases: ['sw-metadata', 'extract-metadata'],
  usage: 'sync-sw-metadata <path>',
  
  validate({ files }, ctx) {
    if (ctx.isOfflineMode) {
      return 'Cannot sync metadata while offline'
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
    
    // Get synced SolidWorks files
    const syncedFiles = getSyncedFilesFromSelection(ctx.files, files)
    const swFiles = syncedFiles.filter(f => SW_EXTENSIONS.includes(f.extension.toLowerCase()))
    
    if (swFiles.length === 0) {
      return 'No SolidWorks files selected'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const user = ctx.user!
    const operationId = `sync-sw-metadata-${Date.now()}`
    
    // Get synced SolidWorks files for tracker initialization
    const syncedFilesForTracker = getSyncedFilesFromSelection(ctx.files, files)
    const filesToProcessForTracker = syncedFilesForTracker.filter(f => SW_EXTENSIONS.includes(f.extension.toLowerCase()))
    
    // Initialize file operation tracker for DevTools monitoring
    const tracker = FileOperationTracker.start(
      'sync-metadata',
      filesToProcessForTracker.length,
      filesToProcessForTracker.map(f => f.relativePath)
    )
    
    // Check if SolidWorks service is running
    const swStatusStepId = tracker.startStep('Check SW service status')
    const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
    tracker.endStep(swStatusStepId, status?.data?.running ? 'completed' : 'failed', { 
      swRunning: !!status?.data?.running 
    })
    
    if (!status?.data?.running) {
      ctx.addToast('error', 'SolidWorks service is not running. Start it from Settings.')
      tracker.endOperation('failed', 'SolidWorks service is not running')
      return {
        success: false,
        message: 'SolidWorks service not running',
        total: 0,
        succeeded: 0,
        failed: 0,
        errors: ['SolidWorks service is not running']
      }
    }
    
    logSyncMeta('info', 'Starting SW metadata sync', {
      operationId,
      userId: user.id,
      selectedFileCount: files.length
    })
    
    // Get synced SolidWorks files
    const syncedFiles = getSyncedFilesFromSelection(ctx.files, files)
    const filesToProcess = syncedFiles.filter(f => SW_EXTENSIONS.includes(f.extension.toLowerCase()))
    
    if (filesToProcess.length === 0) {
      tracker.endOperation('completed')
      return {
        success: true,
        message: 'No SolidWorks files to process',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    // Track files being processed
    const filesBeingProcessed = filesToProcess.map(f => f.relativePath)
    ctx.addProcessingFoldersSync(filesBeingProcessed, 'sync')
    
    // Yield to event loop
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // Progress tracking
    const toastId = `sync-sw-metadata-${Date.now()}`
    const total = filesToProcess.length
    const progress = new ProgressTracker(
      ctx,
      'sync-sw-metadata',
      toastId,
      `Syncing metadata from ${total} file${total > 1 ? 's' : ''}...`,
      total
    )
    
    let succeeded = 0
    let failed = 0
    let updated = 0
    let unchanged = 0
    const errors: string[] = []
    
    // Process files in parallel
    const pendingUpdates: Array<{ path: string; updates: Parameters<typeof ctx.updateFileInStore>[1] }> = []
    
    // Start tracking the metadata sync phase
    const syncStepId = tracker.startStep('Extract and sync metadata', { 
      fileCount: filesToProcess.length, 
      concurrency: CONCURRENT_OPERATIONS 
    })
    const syncPhaseStart = Date.now()
    
    const results = await processWithConcurrency(filesToProcess, CONCURRENT_OPERATIONS, async (file) => {
      try {
        // Extract metadata from SW file
        const swMetadata = await extractSolidWorksMetadata(file.path, file.extension)
        
        if (!swMetadata) {
          logSyncMeta('warn', 'Failed to extract metadata', {
            operationId,
            fileName: file.name
          })
          progress.update()
          return { success: false, error: `${file.name}: Failed to extract metadata` }
        }
        
        logSyncMeta('debug', 'Extracted metadata', {
          operationId,
          fileName: file.name,
          partNumber: swMetadata.part_number,
          description: swMetadata.description?.substring(0, 50)
        })
        
        // Check if metadata has changed
        const metadataChanged = hasMetadataChanged(file, swMetadata)
        logSyncMeta('info', 'Comparing metadata', {
          operationId,
          fileName: file.name,
          dbPartNumber: file.pdmData?.part_number || null,
          dbDescription: file.pdmData?.description?.substring(0, 30) || null,
          dbRevision: file.pdmData?.revision || null,
          swPartNumber: swMetadata.part_number || null,
          swDescription: swMetadata.description?.substring(0, 30) || null,
          swRevision: swMetadata.revision || null,
          changed: metadataChanged
        })
        
        if (!metadataChanged) {
          logSyncMeta('info', 'Metadata unchanged - no update needed', { operationId, fileName: file.name })
          progress.update()
          return { success: true, changed: false }
        }
        
        // Update metadata on server (this creates a new version)
        const result = await syncSolidWorksFileMetadata(file.pdmData!.id, user.id, {
          part_number: swMetadata.part_number,
          description: swMetadata.description,
          revision: swMetadata.revision,
          custom_properties: swMetadata.customProperties
        })
        
        if (result.success && result.file) {
          // Queue store update
          pendingUpdates.push({
            path: file.path,
            updates: {
              pdmData: { ...file.pdmData!, ...result.file }
            }
          })
          
          logSyncMeta('info', 'Metadata updated', {
            operationId,
            fileName: file.name,
            newVersion: result.file.version
          })
          progress.update()
          return { success: true, changed: true }
        } else {
          logSyncMeta('error', 'Failed to update metadata', {
            operationId,
            fileName: file.name,
            error: result.error
          })
          progress.update()
          return { success: false, error: `${file.name}: ${result.error || 'Update failed'}` }
        }
      } catch (err) {
        logSyncMeta('error', 'Exception', {
          operationId,
          fileName: file.name,
          error: err instanceof Error ? err.message : String(err)
        })
        progress.update()
        return { success: false, error: `${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}` }
      }
    })
    
    // Count results
    for (const result of results) {
      if (result.success) {
        succeeded++
        if (result.changed) {
          updated++
        } else {
          unchanged++
        }
      } else {
        failed++
        if (result.error) errors.push(result.error)
      }
    }
    
    // End metadata sync step
    tracker.endStep(syncStepId, 'completed', { 
      succeeded, 
      failed,
      updated,
      unchanged,
      durationMs: Date.now() - syncPhaseStart
    })
    
    // Apply all store updates in a single atomic batch + clear processing folders
    const storeUpdateStepId = tracker.startStep('Atomic store update', { 
      updateCount: pendingUpdates.length 
    })
    const storeUpdateStart = performance.now()
    if (pendingUpdates.length > 0) {
      ctx.updateFilesAndClearProcessing(pendingUpdates, filesBeingProcessed)
    } else {
      ctx.removeProcessingFolders(filesBeingProcessed)
    }
    ctx.setLastOperationCompletedAt(Date.now())
    const storeUpdateDuration = Math.round(performance.now() - storeUpdateStart)
    tracker.endStep(storeUpdateStepId, 'completed', { durationMs: storeUpdateDuration })
    logSyncMeta('info', 'Store update complete', {
      durationMs: storeUpdateDuration,
      updateCount: pendingUpdates.length,
      timestamp: Date.now()
    })
    const { duration } = progress.finish()
    
    // Log final result
    logSyncMeta(failed > 0 ? 'warn' : 'info', 'Metadata sync complete', {
      operationId,
      total,
      succeeded,
      failed,
      updated,
      unchanged,
      duration
    })
    
    // Show result toast
    if (failed > 0) {
      ctx.addToast('warning', `Synced metadata: ${updated} updated, ${unchanged} unchanged, ${failed} failed`)
    } else if (updated > 0) {
      ctx.addToast('success', `Synced metadata: ${updated} file${updated > 1 ? 's' : ''} updated (new version created)`)
    } else {
      ctx.addToast('info', 'Metadata already up to date')
    }
    
    // Complete operation tracking
    tracker.endOperation(failed === 0 ? 'completed' : 'failed', failed > 0 ? errors[0] : undefined)
    
    return {
      success: failed === 0,
      message: `Synced ${succeeded} file${succeeded > 1 ? 's' : ''}: ${updated} updated, ${unchanged} unchanged`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}

