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
  const tabNumberKeys = ['Tab Number', 'TabNumber', 'Tab No', 'Tab', 'TAB', 'Suffix']
  let tabNumber: string | null = null
  for (const key of tabNumberKeys) {
    if (allProps[key] && allProps[key].trim() && !allProps[key].startsWith('$')) {
      tabNumber = allProps[key].trim()
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
      
      const parentResult = await window.electronAPI?.solidworks?.getProperties?.(parentFullPath)
      
      if (parentResult?.success && parentResult.data) {
        const parentData = parentResult.data as {
          fileProperties?: Record<string, string>
          configurationProperties?: Record<string, Record<string, string>>
        }
        
        const parentAllProps = { ...parentData.fileProperties }
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
  
  // If getReferences didn't find a valid parent, return drawing's own metadata
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
    
    // Check that at least some files are checked out by the current user
    const userId = ctx.user?.id
    const checkedOutByUser = swFiles.filter(f => 
      f.pdmData?.checked_out_by === userId
    )
    
    if (checkedOutByUser.length === 0) {
      return 'No files are checked out for editing. Check out files first to sync metadata.'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const operationId = `sync-metadata-${Date.now()}`
    const userId = ctx.user?.id
    
    // Get SolidWorks files
    const allSwFiles = getSwFilesFromSelection(ctx.files, files)
    
    // Filter to only files checked out by current user
    const filesToProcess = allSwFiles.filter(f => 
      f.pdmData?.checked_out_by === userId
    )
    
    const skippedCount = allSwFiles.length - filesToProcess.length
    if (skippedCount > 0) {
      logSync('info', 'Skipping files not checked out by current user', {
        operationId,
        skippedCount,
        processingCount: filesToProcess.length
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
                inheritedFromParent: metadata.inheritedFromParent
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
