/**
 * Sync Metadata Command (Consolidated)
 * 
 * A single command for SolidWorks metadata synchronization that handles
 * both PULL and PUSH operations based on file type:
 * 
 * For DRAWINGS (.slddrw): PULL
 *   - Reads metadata from the SW file (or parent model via PRP)
 *   - Updates pendingMetadata in the store
 *   - Drawings are the source of truth for their metadata
 * 
 * For PARTS/ASSEMBLIES (.sldprt/.sldasm): PUSH  
 *   - Writes metadata from pendingMetadata/pdmData INTO the SW file
 *   - BluePLM is the source of truth for part/assembly metadata
 * 
 * REQUIREMENTS:
 *   - Only works on files checked out by the current user
 *   - Requires SolidWorks service with Document Manager available
 *   - Never auto-triggered (explicit user action only)
 */

import type { Command, CommandResult, LocalFile, BaseCommandParams } from '../types'
import { buildFullPath } from '../types'
import { ProgressTracker } from '../executor'
import { usePDMStore } from '../../../stores/pdmStore'
import { log } from '@/lib/logger'
import { normalizeTabNumber } from '@/lib/serialization'

// SolidWorks file extensions
const SW_EXTENSIONS = ['.sldprt', '.sldasm', '.slddrw']
const DRAWING_EXTENSIONS = ['.slddrw']
const PART_ASSEMBLY_EXTENSIONS = ['.sldprt', '.sldasm']

function logSync(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown>) {
  log[level]('[SyncMetadata]', message, context)
}

/**
 * Parameters for the sync-metadata command.
 */
export interface SyncMetadataParams extends BaseCommandParams {}

/**
 * Extracted metadata structure
 */
interface ExtractedMetadata {
  partNumber: string | null
  tabNumber: string | null
  description: string | null
  revision: string | null
  inheritedFromParent?: boolean
  parentModelPath?: string
  /** True if drawing needs SW API for inheritance but SW isn't running */
  drawingNeedsSwButNotRunning?: boolean
}

/**
 * Extract references from a drawing file
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
 * Extract part number, description, revision from properties dictionary
 */
function extractMetadataFromProperties(allProps: Record<string, string>): {
  partNumber: string | null
  tabNumber: string | null
  description: string | null
  revision: string | null
} {
  // Extract part number - "Number" is primary (used by BluePLM's "Save to File")
  const partNumberKeys = [
    'Number', 'No', 'No.',
    'Base Item Number',
    'PartNumber', 'Part Number', 'PARTNUMBER',
    'Part No', 'Part No.', 'PartNo',
    'ItemNumber', 'Item Number', 'ITEMNUMBER',
    'Item No', 'Item No.', 'ItemNo',
    'PN', 'P/N'
  ]
  
  let partNumber: string | null = null
  for (const key of partNumberKeys) {
    if (allProps[key] && allProps[key].trim() && !allProps[key].startsWith('$')) {
      partNumber = allProps[key].trim()
      break
    }
  }
  
  // Extract tab number
  // Note: Some SW templates store tab with leading dash (e.g., "-500")
  // Normalize to strip leading separators to prevent double-dash in combined numbers
  const tabNumberKeys = ['Tab Number', 'TabNumber', 'Tab No', 'Tab', 'TAB', 'Suffix']
  let tabNumber: string | null = null
  for (const key of tabNumberKeys) {
    if (allProps[key] && allProps[key].trim() && !allProps[key].startsWith('$')) {
      // Normalize to strip leading dash (default separator)
      tabNumber = normalizeTabNumber(allProps[key].trim())
      break
    }
  }
  
  // Extract description
  const descriptionKeys = [
    'Description', 'DESCRIPTION', 'description',
    'Desc', 'DESC', 'desc',
    'Title', 'TITLE',
    'Part Description', 'PartDescription'
  ]
  
  let description: string | null = null
  for (const key of descriptionKeys) {
    if (allProps[key] && allProps[key].trim() && !allProps[key].startsWith('$')) {
      description = allProps[key].trim()
      break
    }
  }
  
  // Extract revision
  const revisionKeys = [
    'Revision', 'REVISION', 'revision',
    'Rev', 'REV', 'rev',
    'Rev.', 'REV.'
  ]
  
  let revision: string | null = null
  for (const key of revisionKeys) {
    if (allProps[key] && allProps[key].trim() && !allProps[key].startsWith('$')) {
      revision = allProps[key].trim()
      break
    }
  }
  
  return { partNumber, tabNumber, description, revision }
}

/**
 * PULL: Extract metadata from a drawing file (with PRP resolution)
 * Returns metadata read from the SW file (or parent model)
 */
async function pullDrawingMetadata(fullPath: string): Promise<ExtractedMetadata | null> {
  logSync('debug', 'PULL: Reading metadata from drawing', { fullPath })
  
  // Get drawing's own properties
  const drawingResult = await window.electronAPI?.solidworks?.getProperties?.(fullPath)
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
  
  // Extract drawing's own metadata first
  const drawingMetadata = extractMetadataFromProperties(drawingProps)
  
  // Helper to check if a value is a PRP reference (needs parent model lookup)
  const isPrpValue = (val: string | null | undefined): boolean => {
    return typeof val === 'string' && (val.startsWith('$PRP:') || val.startsWith('$PRPSHEET:'))
  }
  
  // Check if we need parent model inheritance
  const partNumberNeedsInheritance = !drawingMetadata.partNumber || isPrpValue(drawingMetadata.partNumber)
  const descriptionNeedsInheritance = !drawingMetadata.description || isPrpValue(drawingMetadata.description)
  
  // Also check raw properties for PRP values
  const rawPartNumberKeys = ['Number', 'PartNumber', 'Part Number', 'Part No', 'Part No.']
  const rawDescriptionKeys = ['Description', 'Desc', 'Title']
  const hasRawPrpPartNumber = rawPartNumberKeys.some(key => isPrpValue(drawingProps[key]))
  const hasRawPrpDescription = rawDescriptionKeys.some(key => isPrpValue(drawingProps[key]))
  
  const needsParentInheritance = (partNumberNeedsInheritance || hasRawPrpPartNumber) && 
                                 (descriptionNeedsInheritance || hasRawPrpDescription)
  
  // If drawing has valid metadata, skip expensive getReferences call
  if (!needsParentInheritance) {
    logSync('debug', 'Drawing has valid metadata - skipping parent model lookup', { 
      fullPath,
      partNumber: drawingMetadata.partNumber,
      description: drawingMetadata.description?.substring(0, 30)
    })
    return drawingMetadata
  }
  
  // Need parent model inheritance - this is expensive (9-13+ seconds for complex assemblies)
  logSync('info', 'Drawing needs parent model inheritance', { 
    fullPath,
    partNumberNeedsInheritance,
    descriptionNeedsInheritance
  })
  
  const drawingRefs = await getDrawingReferences(fullPath)
  
  if (drawingRefs && drawingRefs.length > 0) {
    const parentRef = drawingRefs[0]
    
    const refConfig = (parentRef as { configuration?: string }).configuration
    logSync('info', 'Drawing reference with configuration', {
      drawingPath: fullPath,
      parentPath: parentRef.path,
      parentFileName: parentRef.fileName,
      configurationFromDrawingView: refConfig || '(not provided by backend)'
    })
    
    // Construct full path to parent model
    const drawingDir = fullPath.substring(0, fullPath.lastIndexOf('\\') + 1) || 
                      fullPath.substring(0, fullPath.lastIndexOf('/') + 1)
    
    let parentFullPath = parentRef.path
    
    // If path is just filename (no directory), construct from drawing's directory
    if (!parentFullPath.includes('\\') && !parentFullPath.includes('/')) {
      const parentExtensions = ['.SLDPRT', '.SLDASM', '.sldprt', '.sldasm']
      for (const ext of parentExtensions) {
        const testPath = drawingDir + parentFullPath + ext
        const testResult = await window.electronAPI?.solidworks?.getProperties?.(testPath)
        if (testResult?.success) {
          parentFullPath = testPath
          break
        }
      }
      if (!parentFullPath.includes('\\') && !parentFullPath.includes('/')) {
        parentFullPath = drawingDir + parentFullPath
      }
    }
    
    const parentExt = parentFullPath.substring(parentFullPath.lastIndexOf('.')).toLowerCase()
    
    if (SW_EXTENSIONS.includes(parentExt) && parentExt !== '.slddrw') {
      logSync('info', 'Reading metadata from parent model', { 
        drawingPath: fullPath,
        parentModelPath: parentFullPath 
      })
      
      // Read directly from SW file - it's the authoritative source of truth
      // Base numbers are now propagated to all configs in saveConfigsToSWFile
      
      // Retry logic for getProperties - handles race condition when SW auto-starts
      // The first call may return empty data if SW was starting in background
      let parentResult = await window.electronAPI?.solidworks?.getProperties?.(parentFullPath)
      let parentData = parentResult?.data as {
        fileProperties?: Record<string, string>
        configurationProperties?: Record<string, Record<string, string>>
      } | undefined
      
      logSync('debug', 'Initial getProperties result', {
        parentFullPath,
        success: parentResult?.success,
        filePropsCount: Object.keys(parentData?.fileProperties || {}).length,
        configCount: Object.keys(parentData?.configurationProperties || {}).length,
        hasData: !!parentData
      })
      
      // If we got success but empty data, retry once after a short delay
      // This handles the race condition when SW auto-starts during getReferences
      const hasEmptyData = parentResult?.success && 
        (!parentData?.fileProperties || Object.keys(parentData.fileProperties).length === 0) &&
        (!parentData?.configurationProperties || Object.keys(parentData.configurationProperties).length === 0)
      
      if (hasEmptyData) {
        logSync('warn', 'Parent properties returned empty, retrying after delay', {
          parentModelPath: parentFullPath
        })
        await new Promise(resolve => setTimeout(resolve, 500))
        parentResult = await window.electronAPI?.solidworks?.getProperties?.(parentFullPath)
        parentData = parentResult?.data as typeof parentData
        logSync('debug', 'Retry getProperties result', {
          parentFullPath,
          retrySuccess: parentResult?.success,
          retryFilePropsCount: Object.keys(parentData?.fileProperties || {}).length,
          retryConfigCount: Object.keys(parentData?.configurationProperties || {}).length
        })
      }
      
      if (parentResult?.success && parentData) {
        // #region agent log - Hypothesis J: Log parent properties in detail
        const parentFileProps = parentData.fileProperties || {}
        const parentConfigProps = parentData.configurationProperties || {}
        logSync('info', 'Parent model raw properties', {
          parentModelPath: parentFullPath,
          filePropertyCount: Object.keys(parentFileProps).length,
          filePropertyNames: Object.keys(parentFileProps),
          filePropertyValues: Object.fromEntries(
            Object.entries(parentFileProps).slice(0, 20) // First 20 for brevity
          ),
          configCount: Object.keys(parentConfigProps).length,
          configNames: Object.keys(parentConfigProps)
        })
        
        // Log each config's properties
        for (const [configName, configValues] of Object.entries(parentConfigProps)) {
          logSync('info', `Parent config "${configName}" properties`, {
            parentModelPath: parentFullPath,
            configName,
            propertyCount: Object.keys(configValues).length,
            propertyNames: Object.keys(configValues),
            partNumberRelated: {
              'Number': configValues['Number'],
              'PartNumber': configValues['PartNumber'],
              'Part Number': configValues['Part Number'],
              'ItemNumber': configValues['ItemNumber']
            }
          })
        }
        // #endregion
        
        const parentAllProps = { ...parentData.fileProperties }
        if (parentConfigProps) {
          const parentConfigNames = Object.keys(parentConfigProps)
          
          // #region agent log - FIX: Use configuration from drawing view reference, not heuristic
          // The parentRef.configuration tells us exactly which config the drawing view is showing
          // This is the ROOT CAUSE fix - we were picking "default" or first config instead of
          // the actual configuration referenced by the drawing view (e.g., "T500X")
          const refConfig = (parentRef as { configuration?: string }).configuration
          
          let parentPreferredConfig: string | undefined
          let selectionReason: string
          
          if (refConfig && parentConfigNames.includes(refConfig)) {
            // Use the exact configuration from the drawing view reference
            parentPreferredConfig = refConfig
            selectionReason = `from drawing view reference: "${refConfig}"`
          } else if (refConfig && parentConfigNames.some(k => k.toLowerCase() === refConfig.toLowerCase())) {
            // Case-insensitive match
            parentPreferredConfig = parentConfigNames.find(k => k.toLowerCase() === refConfig.toLowerCase())
            selectionReason = `from drawing view reference (case-insensitive): "${refConfig}" -> "${parentPreferredConfig}"`
          } else {
            // Fallback to old heuristic only if no config from reference
            parentPreferredConfig = parentConfigNames.find(k => k.toLowerCase() === 'default')
              || parentConfigNames.find(k => k.toLowerCase() === 'standard')
              || parentConfigNames[0]
            selectionReason = refConfig 
              ? `fallback - ref config "${refConfig}" not found in [${parentConfigNames.join(', ')}]`
              : parentConfigNames.find(k => k.toLowerCase() === 'default') 
                ? 'fallback to "default"' 
                : parentConfigNames.find(k => k.toLowerCase() === 'standard')
                  ? 'fallback to "standard"'
                  : 'fallback to first config'
          }
          
          logSync('info', 'Parent config selection', {
            parentModelPath: parentFullPath,
            availableConfigs: parentConfigNames,
            refConfigFromDrawing: refConfig || '(not provided)',
            selectedConfig: parentPreferredConfig,
            selectionReason
          })
          // #endregion
          
          if (parentPreferredConfig && parentConfigProps[parentPreferredConfig]) {
            Object.assign(parentAllProps, parentConfigProps[parentPreferredConfig])
          }
        }
        
        // #region agent log - Hypothesis L: Log merged properties before extraction
        logSync('info', 'Merged parent properties (file + config)', {
          parentModelPath: parentFullPath,
          mergedPropertyCount: Object.keys(parentAllProps).length,
          mergedPropertyNames: Object.keys(parentAllProps),
          partNumberCandidates: {
            'Number': parentAllProps['Number'],
            'No': parentAllProps['No'],
            'PartNumber': parentAllProps['PartNumber'],
            'Part Number': parentAllProps['Part Number'],
            'ItemNumber': parentAllProps['ItemNumber'],
            'Item Number': parentAllProps['Item Number']
          }
        })
        // #endregion
        
        const parentMetadata = extractMetadataFromProperties(parentAllProps)
        
        logSync('info', 'Inherited metadata from parent model', {
          drawingPath: fullPath,
          parentModelPath: parentFullPath,
          inheritedPartNumber: parentMetadata.partNumber,
          inheritedDescription: parentMetadata.description?.substring(0, 50),
          drawingRevision: drawingMetadata.revision
        })
        
        // Inherit part number, tab number, and description from parent
        // BUT keep drawing's own revision (from revision table)
        return {
          partNumber: parentMetadata.partNumber,
          tabNumber: parentMetadata.tabNumber,
          description: parentMetadata.description,
          revision: drawingMetadata.revision, // Keep drawing's own revision!
          inheritedFromParent: true,
          parentModelPath: parentFullPath
        }
      }
    }
  }
  
  // If getReferences didn't find a valid parent, check if SW is running
  // This helps the user understand why inheritance didn't work for drawings
  if (needsParentInheritance) {
    // Check if SolidWorks is running - if not, we couldn't traverse drawing views
    try {
      const swStatus = await window.electronAPI?.solidworks?.getServiceStatus?.()
      const swRunning = swStatus?.data?.running === true
      
      if (!swRunning) {
        logSync('warn', 'Drawing needs parent inheritance but SolidWorks is not running', {
          fullPath,
          partNumberNeedsInheritance,
          descriptionNeedsInheritance
        })
        return {
          ...drawingMetadata,
          drawingNeedsSwButNotRunning: true
        }
      }
    } catch {
      // If we can't check SW status, just return metadata without flag
    }
  }
  
  // Return drawing's own metadata
  return drawingMetadata
}

/**
 * PUSH: Write metadata from BluePLM into a part/assembly file
 * Uses values from pendingMetadata (user edits) falling back to pdmData (database)
 */
async function pushPartAssemblyMetadata(
  file: LocalFile,
  fullPath: string
): Promise<{ success: boolean; error?: string }> {
  logSync('debug', 'PUSH: Writing metadata to part/assembly', { fullPath })
  
  // Get values to write - pendingMetadata takes precedence over pdmData
  const pending = file.pendingMetadata
  const pdm = file.pdmData
  
  const partNumber = pending?.part_number ?? pdm?.part_number
  const description = pending?.description ?? pdm?.description
  
  // Build properties object for setProperties
  // We use "Number" and "Description" as the standard property names
  const props: Record<string, string> = {}
  
  if (partNumber !== undefined && partNumber !== null) {
    props['Number'] = partNumber
  }
  if (description !== undefined && description !== null) {
    props['Description'] = description
  }
  
  if (Object.keys(props).length === 0) {
    logSync('debug', 'No metadata to write', { fullPath })
    return { success: true }
  }
  
  logSync('info', 'Writing properties to SW file', {
    fullPath,
    partNumber,
    description: description?.substring(0, 50)
  })
  
  // Write to file
  const result = await window.electronAPI?.solidworks?.setProperties(fullPath, props)
  
  if (!result?.success) {
    return { success: false, error: result?.error || 'Failed to write properties' }
  }
  
  // Also write to default configuration for PRP resolution in drawings
  const ext = file.extension.toLowerCase()
  if (ext !== '.slddrw') {
    const propsResult = await window.electronAPI?.solidworks?.getProperties?.(fullPath)
    if (propsResult?.success && propsResult.data) {
      const data = propsResult.data as {
        configurationProperties?: Record<string, Record<string, string>>
        configurations?: string[]
      }
      const configProps = data.configurationProperties
      if (configProps) {
        const configNames = Object.keys(configProps)
        const activeConfig = configNames.find(k => k.toLowerCase() === 'default')
          || configNames.find(k => k.toLowerCase() === 'standard')
          || configNames[0]
        
        if (activeConfig) {
          // Check which properties are missing in the configuration
          const configData = configProps[activeConfig] || {}
          const missingProps: Record<string, string> = {}
          if (props['Number'] && !configData['Number']) {
            missingProps['Number'] = props['Number']
          }
          if (props['Description'] && !configData['Description']) {
            missingProps['Description'] = props['Description']
          }
          if (Object.keys(missingProps).length > 0) {
            await window.electronAPI?.solidworks?.setProperties(fullPath, missingProps, activeConfig)
          }
        }
      }
    }
  }
  
  return { success: true }
}

/**
 * Get SolidWorks files from selection (handles folders)
 */
function getSwFilesFromSelection(allFiles: LocalFile[], selectedFiles: LocalFile[]): LocalFile[] {
  const result: LocalFile[] = []
  
  for (const item of selectedFiles) {
    if (item.isDirectory) {
      const folderPath = item.relativePath.replace(/\\/g, '/')
      const filesInFolder = allFiles.filter(f => {
        if (f.isDirectory) return false
        const normalizedPath = f.relativePath.replace(/\\/g, '/')
        return normalizedPath.startsWith(folderPath + '/') &&
               SW_EXTENSIONS.includes(f.extension.toLowerCase())
      })
      result.push(...filesInFolder)
    } else if (SW_EXTENSIONS.includes(item.extension.toLowerCase())) {
      result.push(item)
    }
  }
  
  // Deduplicate by path
  return [...new Map(result.map(f => [f.path, f])).values()]
}

/**
 * Lightweight metadata refresh for specific files.
 * Used by file watcher for auto-refresh on save.
 * Only PULLs metadata (reads from file), does not PUSH.
 * 
 * This is a silent operation - no toasts or progress indicators.
 * Skips gracefully if SW service is unavailable.
 * 
 * @param files - Files to refresh (will filter to checked-out SW files)
 * @param vaultPath - The vault root path for constructing full paths
 * @param userId - Current user ID for filtering to checked-out files
 * @returns Count of refreshed and skipped files
 */
export async function refreshMetadataForFiles(
  files: LocalFile[],
  vaultPath: string,
  userId: string | undefined
): Promise<{ refreshed: number; skipped: number }> {
  // Filter to SolidWorks files checked out by the current user
  const swFiles = files.filter(f => {
    if (f.isDirectory) return false
    const ext = f.extension?.toLowerCase() || ''
    if (!SW_EXTENSIONS.includes(ext)) return false
    // Must be checked out by current user (or local-only)
    const isLocalOnly = !f.pdmData?.id
    const isCheckedOutByMe = f.pdmData?.checked_out_by === userId
    return isLocalOnly || isCheckedOutByMe
  })
  
  if (swFiles.length === 0) {
    return { refreshed: 0, skipped: files.length }
  }
  
  // Check if SolidWorks service is running - skip silently if not
  try {
    const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
    if (!status?.data?.running || !status?.data?.documentManagerAvailable) {
      logSync('debug', 'Auto-refresh skipped - SW service not available', {
        running: status?.data?.running,
        dmAvailable: status?.data?.documentManagerAvailable,
        fileCount: swFiles.length
      })
      return { refreshed: 0, skipped: swFiles.length }
    }
  } catch {
    // If we can't check status, skip silently
    return { refreshed: 0, skipped: swFiles.length }
  }
  
  logSync('info', 'Auto-refreshing metadata for changed files', {
    fileCount: swFiles.length,
    files: swFiles.map(f => f.name)
  })
  
  const store = usePDMStore.getState()
  let refreshed = 0
  
  for (const file of swFiles) {
    try {
      const fullPath = buildFullPath(vaultPath, file.relativePath)
      const ext = file.extension.toLowerCase()
      const isDrawing = DRAWING_EXTENSIONS.includes(ext)
      
      // For drawings: PULL metadata from file
      if (isDrawing) {
        const metadata = await pullDrawingMetadata(fullPath)
        
        if (metadata) {
          const pendingUpdates: Record<string, string | null | undefined> = {}
          
          if (metadata.partNumber !== null) {
            pendingUpdates.part_number = metadata.partNumber
          }
          if (metadata.tabNumber !== null) {
            pendingUpdates.tab_number = metadata.tabNumber
          }
          if (metadata.description !== null) {
            pendingUpdates.description = metadata.description
          }
          if (metadata.revision !== null) {
            pendingUpdates.revision = metadata.revision
          }
          
          if (Object.keys(pendingUpdates).length > 0) {
            store.updatePendingMetadata(file.path, pendingUpdates)
            refreshed++
            logSync('info', 'Auto-refresh: updated metadata from file', {
              filePath: file.relativePath,
              revision: metadata.revision,
              partNumber: metadata.partNumber
            })
          }
        }
      } else {
        // For parts/assemblies: Also PULL metadata (read from file)
        // We read the file properties to update pendingMetadata
        // This shows the user what's actually in the file after they saved it
        const result = await window.electronAPI?.solidworks?.getProperties?.(fullPath)
        const data = result?.data as {
          fileProperties?: Record<string, string>
          configurationProperties?: Record<string, Record<string, string>>
        } | undefined
        
        if (result?.success && data) {
          const allProps = { ...data.fileProperties }
          const configProps = data.configurationProperties
          if (configProps) {
            const configNames = Object.keys(configProps)
            const preferredConfig = configNames.find(k => k.toLowerCase() === 'default') 
              || configNames.find(k => k.toLowerCase() === 'standard')
              || configNames[0]
            if (preferredConfig && configProps[preferredConfig]) {
              Object.assign(allProps, configProps[preferredConfig])
            }
          }
          
          const metadata = extractMetadataFromProperties(allProps)
          const pendingUpdates: Record<string, string | null | undefined> = {}
          
          if (metadata.partNumber !== null) {
            pendingUpdates.part_number = metadata.partNumber
          }
          if (metadata.tabNumber !== null) {
            pendingUpdates.tab_number = metadata.tabNumber
          }
          if (metadata.description !== null) {
            pendingUpdates.description = metadata.description
          }
          if (metadata.revision !== null) {
            pendingUpdates.revision = metadata.revision
          }
          
          if (Object.keys(pendingUpdates).length > 0) {
            store.updatePendingMetadata(file.path, pendingUpdates)
            refreshed++
            logSync('info', 'Auto-refresh: updated metadata from file', {
              filePath: file.relativePath,
              revision: metadata.revision,
              partNumber: metadata.partNumber
            })
          }
        }
      }
    } catch (err) {
      // Silent failure - user can manually refresh if needed
      logSync('warn', 'Auto-refresh failed for file', {
        filePath: file.relativePath,
        error: String(err)
      })
    }
  }
  
  return { refreshed, skipped: swFiles.length - refreshed }
}

export const syncMetadataCommand: Command<SyncMetadataParams> = {
  id: 'sync-metadata',
  name: 'Sync Metadata',
  description: 'Sync metadata between BluePLM and SolidWorks files (PULL for drawings, PUSH for parts/assemblies)',
  aliases: ['sync-sw-metadata', 'refresh-metadata', 'refresh-local-metadata'],
  usage: 'sync-metadata <path>',
  
  validate({ files }, ctx) {
    if (!files || files.length === 0) {
      return 'No files selected'
    }
    
    // Get SolidWorks files
    const swFiles = getSwFilesFromSelection(ctx.files, files)
    
    if (swFiles.length === 0) {
      return 'No SolidWorks files selected'
    }
    
    // Check that at least some files are eligible:
    // - Local only (not synced yet), OR
    // - Checked out by the current user
    const userId = ctx.user?.id
    const eligibleFiles = swFiles.filter(f => {
      const isLocalOnly = !f.pdmData?.id
      const isCheckedOutByMe = f.pdmData?.checked_out_by === userId
      return isLocalOnly || isCheckedOutByMe
    })
    
    if (eligibleFiles.length === 0) {
      return 'No eligible files. Files must be local-only or checked out for editing.'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const operationId = `sync-metadata-${Date.now()}`
    const userId = ctx.user?.id
    
    // Get SolidWorks files
    const allSwFiles = getSwFilesFromSelection(ctx.files, files)
    
    // Filter to eligible files:
    // - Local only (not synced yet), OR
    // - Checked out by current user
    const filesToProcess = allSwFiles.filter(f => {
      const isLocalOnly = !f.pdmData?.id
      const isCheckedOutByMe = f.pdmData?.checked_out_by === userId
      return isLocalOnly || isCheckedOutByMe
    })
    
    const skippedCount = allSwFiles.length - filesToProcess.length
    if (skippedCount > 0) {
      logSync('info', 'Skipping files not eligible for metadata sync', {
        operationId,
        skippedCount,
        processingCount: filesToProcess.length,
        reason: 'Files must be local-only or checked out by you'
      })
    }
    
    // Check if SolidWorks service is running
    const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
    
    if (!status?.data?.running) {
      ctx.addToast('error', 'SolidWorks service is not running. Start it from Settings.')
      return {
        success: false,
        message: 'SolidWorks service not running',
        total: 0,
        succeeded: 0,
        failed: 0,
        errors: ['SolidWorks service is not running']
      }
    }
    
    if (!status?.data?.documentManagerAvailable) {
      ctx.addToast('error', 'Document Manager not available. Configure license key in Settings.')
      return {
        success: false,
        message: 'Document Manager not available',
        total: 0,
        succeeded: 0,
        failed: 0,
        errors: ['Document Manager not available']
      }
    }
    
    logSync('info', 'Starting metadata sync', {
      operationId,
      selectedFileCount: files.length,
      swFileCount: filesToProcess.length,
      skippedNotCheckedOut: skippedCount
    })
    
    if (filesToProcess.length === 0) {
      if (skippedCount > 0) {
        ctx.addToast('warning', `Skipped ${skippedCount} files - not checked out by you`)
      }
      return {
        success: true,
        message: 'No files to process',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    // Track files being processed
    const filesBeingProcessed = filesToProcess.map(f => f.relativePath)
    ctx.addProcessingFoldersSync(filesBeingProcessed, 'sync')
    
    // Progress tracking
    const toastId = `sync-metadata-${Date.now()}`
    const total = filesToProcess.length
    const progress = new ProgressTracker(
      ctx,
      'sync-metadata',
      toastId,
      `Syncing metadata for ${total} file${total > 1 ? 's' : ''}...`,
      total
    )
    
    let succeeded = 0
    let failed = 0
    let pulled = 0  // Drawings where we pulled metadata
    let pushed = 0  // Parts/assemblies where we pushed metadata
    let drawingsNeedingSw = 0  // Drawings that need SW for parent inheritance
    const errors: string[] = []
    
    // Get vault path for full path construction
    const vaultPath = ctx.vaultPath || ''
    const store = usePDMStore.getState()
    
    // Process files
    for (const file of filesToProcess) {
      try {
        const fullPath = buildFullPath(vaultPath, file.relativePath)
        const ext = file.extension.toLowerCase()
        const isDrawing = DRAWING_EXTENSIONS.includes(ext)
        const isPartOrAssembly = PART_ASSEMBLY_EXTENSIONS.includes(ext)
        
        if (isDrawing) {
          // PULL: Read metadata from drawing -> update pendingMetadata
          logSync('debug', 'Processing drawing (PULL)', { fullPath })
          
          const metadata = await pullDrawingMetadata(fullPath)
          
          if (metadata) {
            // Track if this drawing needed SW but it wasn't running
            if (metadata.drawingNeedsSwButNotRunning) {
              drawingsNeedingSw++
            }
            
            // Build pending updates from extracted metadata
            const pendingUpdates: Record<string, string | null | undefined> = {}
            
            if (metadata.partNumber !== null) {
              pendingUpdates.part_number = metadata.partNumber
            }
            if (metadata.tabNumber !== null) {
              pendingUpdates.tab_number = metadata.tabNumber
            }
            if (metadata.description !== null) {
              pendingUpdates.description = metadata.description
            }
            if (metadata.revision !== null) {
              pendingUpdates.revision = metadata.revision
            }
            
            if (Object.keys(pendingUpdates).length > 0) {
              store.updatePendingMetadata(file.path, pendingUpdates)
              pulled++
              logSync('info', 'PULL complete - updated pendingMetadata', {
                filePath: file.path,
                partNumber: metadata.partNumber,
                description: metadata.description?.substring(0, 50),
                inheritedFromParent: metadata.inheritedFromParent,
                neededSwButNotRunning: metadata.drawingNeedsSwButNotRunning
              })
            }
          }
          
          succeeded++
        } else if (isPartOrAssembly) {
          // PUSH: Write metadata from BluePLM -> into SW file
          logSync('debug', 'Processing part/assembly (PUSH)', { fullPath })
          
          const result = await pushPartAssemblyMetadata(file, fullPath)
          
          if (result.success) {
            pushed++
            succeeded++
            logSync('info', 'PUSH complete - wrote to SW file', { filePath: file.path })
          } else {
            failed++
            const errorMsg = `Failed to write ${file.name}: ${result.error}`
            errors.push(errorMsg)
            logSync('error', 'PUSH failed', { filePath: file.path, error: result.error })
          }
        } else {
          // Unknown SW file type - just count as success
          succeeded++
        }
      } catch (err) {
        failed++
        const errorMsg = `Failed to process ${file.name}: ${err instanceof Error ? err.message : String(err)}`
        errors.push(errorMsg)
        logSync('error', 'Exception processing file', { 
          filePath: file.path, 
          error: String(err) 
        })
      }
      
      progress.update()
    }
    
    // Clear processing state
    ctx.removeProcessingFolders(filesBeingProcessed)
    
    // Finish progress toast
    progress.finish()
    
    // Show result toast
    const parts: string[] = []
    if (pulled > 0) parts.push(`${pulled} drawing${pulled > 1 ? 's' : ''} updated`)
    if (pushed > 0) parts.push(`${pushed} part${pushed > 1 ? 's' : ''}/assembl${pushed > 1 ? 'ies' : 'y'} synced`)
    if (skippedCount > 0) parts.push(`${skippedCount} skipped (not checked out)`)
    if (failed > 0) parts.push(`${failed} failed`)
    
    if (failed > 0) {
      ctx.addToast('warning', `Sync complete: ${parts.join(', ')}`)
    } else if (drawingsNeedingSw > 0) {
      // Some drawings couldn't inherit from parent because SW isn't running
      ctx.addToast('warning', `Open SolidWorks to sync drawing metadata from parent parts`)
    } else if (pulled > 0 || pushed > 0) {
      ctx.addToast('success', `Sync complete: ${parts.join(', ')}`)
    } else {
      ctx.addToast('info', 'No metadata changes to sync')
    }
    
    return {
      success: failed === 0,
      message: `Synced metadata: ${parts.join(', ')}`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined
    }
  }
}
