/**
 * Sync Command (First Check-In)
 * 
 * Upload new local files to the server for the first time.
 * This syncs files that exist locally but haven't been added to PDM yet.
 * 
 * For SolidWorks files, automatically extracts metadata (part number, description)
 * from file custom properties when the SolidWorks service is available.
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

// Helper to check if file is a SolidWorks temp lock file (~$filename.sldxxx)
function isSolidworksTempFile(name: string): boolean {
  return name.startsWith('~$')
}

// SolidWorks file extensions that support metadata extraction
const SW_EXTENSIONS = ['.sldprt', '.sldasm', '.slddrw']

// File types that have references to extract (assemblies reference components, drawings reference models)
const REFERENCE_FILE_EXTENSIONS = ['.sldasm', '.slddrw']

// Drawing extensions (need special handling for metadata inheritance)
const DRAWING_EXTENSIONS = ['.slddrw']

/**
 * Metadata extraction result from property dictionary
 */
interface ExtractedMetadata {
  partNumber: string | null
  tabNumber: string | null
  description: string | null
  revision: string | null
  customProperties: Record<string, string | number | null> | undefined
}

/**
 * Extract part number, description, revision from a properties dictionary
 * This is a shared helper used for both direct file properties and parent model inheritance
 */
function extractMetadataFromProperties(allProps: Record<string, string>): ExtractedMetadata {
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
  
  let partNumber: string | null = null
  for (const key of partNumberKeys) {
    if (allProps[key] && allProps[key].trim() && !allProps[key].startsWith('$')) {
      partNumber = allProps[key].trim()
      break
    }
  }
  
  // Case-insensitive fallback
  if (!partNumber) {
    for (const [key, value] of Object.entries(allProps)) {
      const lowerKey = key.toLowerCase()
      // Skip formula references (start with $)
      if (value?.startsWith?.('$')) continue
      
      if ((lowerKey.includes('part') && (lowerKey.includes('number') || lowerKey.includes('no'))) ||
          (lowerKey.includes('item') && (lowerKey.includes('number') || lowerKey.includes('no'))) ||
          lowerKey === 'pn' || lowerKey === 'p/n' ||
          lowerKey.includes('stock') && (lowerKey.includes('code') || lowerKey.includes('number'))) {
        if (value && value.trim()) {
          partNumber = value.trim()
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
  
  // Extract tab number (configuration variant suffix)
  const tabNumberKeys = [
    'Tab Number', 'TabNumber', 'Tab No', 'Tab', 'TAB',
    'Configuration Tab', 'ConfigTab', 'Config Tab',
    'Suffix', 'Variant', 'Config Suffix'
  ]
  
  let tabNumber: string | null = null
  for (const key of tabNumberKeys) {
    if (allProps[key] && allProps[key].trim() && !allProps[key].startsWith('$')) {
      tabNumber = allProps[key].trim()
      break
    }
  }
  
  // Case-insensitive fallback for tab number
  if (!tabNumber) {
    for (const [key, value] of Object.entries(allProps)) {
      const lowerKey = key.toLowerCase()
      if (value?.startsWith?.('$')) continue
      
      if (lowerKey.includes('tab') && (lowerKey.includes('number') || lowerKey.includes('no'))) {
        if (value && value.trim()) {
          tabNumber = value.trim()
          break
        }
      }
    }
  }
  
  // Build custom properties object (exclude the ones we've already extracted)
  const excludeKeys = new Set([
    ...partNumberKeys, 
    ...descriptionKeys,
    ...revisionKeys,
    ...tabNumberKeys
  ].map(k => k.toLowerCase()))
  
  const customProperties: Record<string, string | number | null> = {}
  for (const [key, value] of Object.entries(allProps)) {
    if (!excludeKeys.has(key.toLowerCase()) && value && !value.startsWith('$')) {
      customProperties[key] = value
    }
  }
  
  return {
    partNumber,
    tabNumber,
    description: description?.trim() || null,
    revision,
    customProperties: Object.keys(customProperties).length > 0 ? customProperties : undefined
  }
}

/**
 * Result type for SolidWorks metadata extraction
 */
interface SolidWorksMetadataResult {
  partNumber?: string | null
  tabNumber?: string | null
  description?: string | null
  revision?: string | null
  customProperties?: Record<string, string | number | null>
  /** True if metadata was inherited from parent model (for drawings) */
  inheritedFromParent?: boolean
  /** Path of parent model if inherited */
  parentModelPath?: string
}

/**
 * Extract references from a drawing file
 * Used to find the parent model for metadata inheritance
 */
async function getDrawingReferences(fullPath: string): Promise<Array<{
  path: string
  fileName: string
  exists: boolean
  fileType: string
}> | null> {
  try {
    const result = await window.electronAPI?.solidworks?.getReferences?.(fullPath)
    if (!result?.success || !result.data?.references) {
      return null
    }
    return result.data.references as Array<{
      path: string
      fileName: string
      exists: boolean
      fileType: string
    }>
  } catch {
    return null
  }
}

/**
 * Extract metadata from SolidWorks file using the SW service
 * Returns null if service unavailable or extraction fails
 * 
 * For drawings, implements PRP (Part Reference Property) resolution:
 * - Extracts references from the drawing to find the parent model
 * - Reads metadata from the first referenced model (part or assembly)
 * - Uses parent model's metadata for the drawing
 */
async function extractSolidWorksMetadata(
  fullPath: string,
  extension: string
): Promise<SolidWorksMetadataResult | null> {
  // Only process SolidWorks files
  if (!SW_EXTENSIONS.includes(extension.toLowerCase())) {
    return null
  }
  
  // Check if SolidWorks service is available AND Document Manager is initialized
  // DM requires a license key to be configured - without it, getProperties will hang
  const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
  if (!status?.data?.running || !status?.data?.documentManagerAvailable) {
    return null
  }
  
  const isDrawing = DRAWING_EXTENSIONS.includes(extension.toLowerCase())
  
  try {
    // ========================================
    // DRAWING PRP RESOLUTION
    // For drawings, metadata often uses Part Reference Properties (PRP) that
    // reference the parent model. We resolve this by:
    // 1. Getting references from the drawing to find the parent model
    // 2. Reading metadata from the first referenced model
    // 3. Using parent model metadata if drawing's own metadata is empty/PRP
    // ========================================
    if (isDrawing) {
      logSync('debug', 'Drawing detected - checking for PRP inheritance', { fullPath })
      
      // First, get the drawing's own properties to check for PRP references
      const drawingResult = await window.electronAPI?.solidworks?.getProperties?.(fullPath)
      
      // Check if drawing has PRP references or empty metadata
      const drawingData = drawingResult?.data as {
        fileProperties?: Record<string, string>
        configurationProperties?: Record<string, Record<string, string>>
      } | undefined
      
      const drawingProps = { ...drawingData?.fileProperties }
      const configProps = drawingData?.configurationProperties
      if (configProps) {
        const configNames = Object.keys(configProps)
        const preferredConfig = configNames.find(k => k.toLowerCase() === 'default') 
          || configNames.find(k => k.toLowerCase() === 'standard')
          || configNames[0]
        if (preferredConfig && configProps[preferredConfig]) {
          Object.assign(drawingProps, configProps[preferredConfig])
        }
      }
      
      // Check for PRP references (e.g., "$PRP:Description", "$PRPSHEET:Number")
      const hasPrpReference = Object.values(drawingProps).some(val => 
        typeof val === 'string' && (val.startsWith('$PRP:') || val.startsWith('$PRPSHEET:'))
      )
      
      // Check if metadata fields are empty
      const hasEmptyMetadata = !drawingProps['Number'] && !drawingProps['Description'] && 
                               !drawingProps['PartNumber'] && !drawingProps['Part Number']
      
      logSync('debug', 'Drawing property analysis', { 
        fullPath,
        hasPrpReference,
        hasEmptyMetadata,
        propertyKeys: Object.keys(drawingProps),
        sampleValues: {
          Number: drawingProps['Number']?.substring(0, 30),
          Description: drawingProps['Description']?.substring(0, 30)
        }
      })
      
      // If drawing has PRP references or empty metadata, try to inherit from parent model
      if (hasPrpReference || hasEmptyMetadata) {
        logSync('info', 'PRP detected or empty metadata - attempting parent model inheritance', { fullPath })
        
        // Get drawing references to find parent model
        const drawingRefs = await getDrawingReferences(fullPath)
        
        if (!drawingRefs || drawingRefs.length === 0) {
          logSync('warn', 'Drawing has no references - cannot inherit metadata from parent model', { 
            fullPath,
            hasPrpReference,
            hasEmptyMetadata
          })
          // Fall through to extract what we can from the drawing itself
        } else {
          // Use the FIRST referenced model for deterministic inheritance
          // This is typically the main model the drawing documents
          const parentRef = drawingRefs[0]
          
          // Construct full path to parent model
          // getReferences often returns just filename without path/extension
          // So we need to construct the full path from the drawing's directory
          const drawingDir = fullPath.substring(0, fullPath.lastIndexOf('\\') + 1) || 
                            fullPath.substring(0, fullPath.lastIndexOf('/') + 1)
          
          // Try to determine the full path to the parent model
          let parentFullPath = parentRef.path
          
          // If path doesn't look like a full path, construct it
          if (!parentFullPath.includes('\\') && !parentFullPath.includes('/')) {
            // Check if fileName has extension, if not try common SW extensions
            const hasExtension = parentRef.fileName.includes('.')
            if (hasExtension) {
              parentFullPath = drawingDir + parentRef.fileName
            } else {
              // Try .SLDPRT first (most common for drawings), then .SLDASM
              parentFullPath = drawingDir + parentRef.fileName + '.SLDPRT'
            }
          }
          
          logSync('info', 'Parent model chosen for metadata inheritance', {
            drawingPath: fullPath,
            parentModelPath: parentFullPath,
            originalRefPath: parentRef.path,
            parentModelName: parentRef.fileName,
            parentModelType: parentRef.fileType,
            totalReferences: drawingRefs.length
          })
          
          // Get metadata from the parent model
          const parentExt = '.' + parentFullPath.split('.').pop()?.toLowerCase()
          if (SW_EXTENSIONS.includes(parentExt)) {
            const parentResult = await window.electronAPI?.solidworks?.getProperties?.(parentFullPath)
            
            if (parentResult?.success && parentResult.data) {
              const parentData = parentResult.data as {
                fileProperties?: Record<string, string>
                configurationProperties?: Record<string, Record<string, string>>
              }
              
              // Merge parent's file and config properties
              const parentAllProps: Record<string, string> = { ...parentData.fileProperties }
              const parentConfigProps = parentData.configurationProperties
              if (parentConfigProps) {
                const parentConfigNames = Object.keys(parentConfigProps)
                const parentPreferredConfig = parentConfigNames.find(k => k.toLowerCase() === 'default')
                  || parentConfigNames.find(k => k.toLowerCase() === 'standard')
                  || parentConfigNames[0]
                if (parentPreferredConfig && parentConfigProps[parentPreferredConfig]) {
                  Object.assign(parentAllProps, parentConfigProps[parentPreferredConfig])
                }
              }
              
              // Extract metadata from parent model using standard property extraction
              const parentMetadata = extractMetadataFromProperties(parentAllProps)
              
              logSync('info', 'Inherited metadata from parent model', {
                drawingPath: fullPath,
                parentModelPath: parentFullPath,
                inheritedPartNumber: parentMetadata.partNumber,
                inheritedDescription: parentMetadata.description?.substring(0, 50),
                inheritedRevision: parentMetadata.revision
              })
              
              return {
                partNumber: parentMetadata.partNumber,
                tabNumber: parentMetadata.tabNumber,
                description: parentMetadata.description,
                revision: parentMetadata.revision,
                customProperties: parentMetadata.customProperties,
                inheritedFromParent: true,
                parentModelPath: parentFullPath
              }
            } else {
              logSync('warn', 'Failed to read parent model properties', {
                drawingPath: fullPath,
                parentModelPath: parentFullPath,
                error: parentResult?.error
              })
              // Fall through to extract what we can from the drawing itself
            }
          } else {
            logSync('debug', 'Parent model is not a SolidWorks file, skipping inheritance', {
              drawingPath: fullPath,
              parentModelPath: parentFullPath,
              parentExt
            })
          }
        }
      }
    }
    
    // Standard metadata extraction (for parts/assemblies, or drawings without PRP)
    const result = await window.electronAPI?.solidworks?.getProperties?.(fullPath)
    
    if (!result?.success || !result.data) {
      return null
    }
    
    const data = result.data as {
      fileProperties?: Record<string, string>
      configurationProperties?: Record<string, Record<string, string>>
    }
    
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
    
    // Use shared helper to extract metadata from properties
    const metadata = extractMetadataFromProperties(allProps)
    
    return {
      partNumber: metadata.partNumber,
      tabNumber: metadata.tabNumber,
      description: metadata.description,
      revision: metadata.revision,
      customProperties: metadata.customProperties
    }
  } catch {
    return null
  }
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
        
        // Extract SolidWorks metadata if this is a SW file and service is available
        const extractedMetadata = await extractSolidWorksMetadata(file.path, file.extension)
        
        // Merge pending metadata (user pre-assigned BR numbers) with extracted metadata
        // Pending metadata takes priority - user explicitly set these values before sync
        const metadata: ExtractedMetadata = {
          partNumber: file.pendingMetadata?.part_number ?? extractedMetadata?.partNumber ?? null,
          tabNumber: file.pendingMetadata?.tab_number ?? extractedMetadata?.tabNumber ?? null,
          description: file.pendingMetadata?.description ?? extractedMetadata?.description ?? null,
          revision: file.pendingMetadata?.revision ?? extractedMetadata?.revision ?? null,
          customProperties: extractedMetadata?.customProperties
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
        pendingUpdates.push({
          path: file.path,
          updates: { pdmData: syncedFile, localHash: readResult.hash, diffStatus: undefined, pendingMetadata: undefined }
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
