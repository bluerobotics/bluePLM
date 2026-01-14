/**
 * Refresh Local Metadata Command
 * 
 * Extracts metadata from local SolidWorks files and updates pendingMetadata.
 * This is the "Refresh Metadata" option that works for both local and synced files.
 * 
 * For drawings, implements PRP (Part Reference Property) resolution:
 * - Gets references from the drawing to find the parent model
 * - Reads metadata from the parent model
 * - Uses parent's metadata if drawing's own metadata is empty/PRP
 * 
 * Key differences from sync-sw-metadata:
 * - Works on ANY SolidWorks file (local or synced)
 * - Updates pendingMetadata in store (for UI display)
 * - Does NOT sync to database (that happens during check-in)
 */

import type { Command, CommandResult, LocalFile, BaseCommandParams } from '../types'
import { buildFullPath } from '../types'
import { ProgressTracker } from '../executor'
import { usePDMStore } from '../../../stores/pdmStore'
import { log } from '@/lib/logger'

// SolidWorks file extensions
const SW_EXTENSIONS = ['.sldprt', '.sldasm', '.slddrw']
const DRAWING_EXTENSIONS = ['.slddrw']

function logRefresh(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown>) {
  log[level]('[RefreshLocalMetadata]', message, context)
}

/**
 * Parameters for the refresh-local-metadata command.
 */
export interface RefreshLocalMetadataParams extends BaseCommandParams {}

/**
 * Metadata extraction result
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
  // Extract part number
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
 * Extract metadata from a SolidWorks file
 * Handles PRP resolution for drawings
 */
async function extractSolidWorksMetadata(
  fullPath: string,
  extension: string
): Promise<ExtractedMetadata | null> {
  if (!SW_EXTENSIONS.includes(extension.toLowerCase())) {
    return null
  }
  
  // Check if SW service is available
  const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
  if (!status?.data?.running || !status?.data?.documentManagerAvailable) {
    return null
  }
  
  const isDrawing = DRAWING_EXTENSIONS.includes(extension.toLowerCase())
  
  try {
    // For drawings, try PRP resolution first
    if (isDrawing) {
      logRefresh('debug', 'Drawing detected - checking for PRP inheritance', { fullPath })
      
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
      
      // Check for PRP references or empty metadata
      const hasPrpReference = Object.values(drawingProps).some(val => 
        typeof val === 'string' && (val.startsWith('$PRP:') || val.startsWith('$PRPSHEET:'))
      )
      const hasEmptyMetadata = !drawingProps['Number'] && !drawingProps['Description'] && 
                               !drawingProps['PartNumber'] && !drawingProps['Part Number']
      
      // Extract drawing's own metadata first - especially revision which comes from drawing's revision table
      const drawingMetadata = extractMetadataFromProperties(drawingProps)
      
      // If drawing has PRP or empty metadata for part number/description, inherit from parent model
      // BUT keep drawing's own revision (from revision table)
      if (hasPrpReference || hasEmptyMetadata) {
        logRefresh('info', 'PRP detected or empty metadata - attempting parent model inheritance for part number/description', { fullPath })
        
        const drawingRefs = await getDrawingReferences(fullPath)
        
        if (drawingRefs && drawingRefs.length > 0) {
          const parentRef = drawingRefs[0]
          
          // Construct full path to parent model
          const drawingDir = fullPath.substring(0, fullPath.lastIndexOf('\\') + 1) || 
                            fullPath.substring(0, fullPath.lastIndexOf('/') + 1)
          
          let parentFullPath = parentRef.path
          
          // If path is just filename (no directory), construct from drawing's directory
          if (!parentFullPath.includes('\\') && !parentFullPath.includes('/')) {
            // Try common extensions
            const parentExtensions = ['.SLDPRT', '.SLDASM', '.sldprt', '.sldasm']
            for (const ext of parentExtensions) {
              const testPath = drawingDir + parentFullPath + ext
              // Try this path
              const testResult = await window.electronAPI?.solidworks?.getProperties?.(testPath)
              if (testResult?.success) {
                parentFullPath = testPath
                break
              }
            }
            // If still no directory, add drawing's directory
            if (!parentFullPath.includes('\\') && !parentFullPath.includes('/')) {
              parentFullPath = drawingDir + parentFullPath
            }
          }
          
          const parentExt = parentFullPath.substring(parentFullPath.lastIndexOf('.')).toLowerCase()
          
          if (SW_EXTENSIONS.includes(parentExt) && parentExt !== '.slddrw') {
            logRefresh('info', 'Reading metadata from parent model', { 
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
              
              logRefresh('info', 'Inherited metadata from parent model', {
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
      }
      
      // If no PRP resolution needed, return drawing's own metadata
      return drawingMetadata
    }
    
    // Direct file metadata extraction (non-drawing or drawing without PRP)
    const result = await window.electronAPI?.solidworks?.getProperties?.(fullPath)
    if (!result?.success || !result.data) {
      return null
    }
    
    const data = result.data as {
      fileProperties?: Record<string, string>
      configurationProperties?: Record<string, Record<string, string>>
    }
    
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
    
    return extractMetadataFromProperties(allProps)
  } catch (err) {
    logRefresh('error', 'Exception extracting metadata', { fullPath, error: String(err) })
    return null
  }
}

/**
 * Get SolidWorks files from selection (both local and synced)
 * For directories, recursively includes all SW files inside
 */
function getSwFilesFromSelection(allFiles: LocalFile[], selectedFiles: LocalFile[]): LocalFile[] {
  const result: LocalFile[] = []
  
  for (const item of selectedFiles) {
    if (item.isDirectory) {
      // Get all SW files in the folder
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
  
  return result
}

export const refreshLocalMetadataCommand: Command<RefreshLocalMetadataParams> = {
  id: 'refresh-local-metadata',
  name: 'Refresh Metadata',
  description: 'Extract metadata from SolidWorks file properties',
  aliases: ['refresh-metadata', 'read-metadata'],
  usage: 'refresh-local-metadata <path>',
  
  validate({ files }, ctx) {
    if (!files || files.length === 0) {
      return 'No files selected'
    }
    
    // Get SolidWorks files (both local and synced)
    const swFiles = getSwFilesFromSelection(ctx.files, files)
    
    if (swFiles.length === 0) {
      return 'No SolidWorks files selected'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const operationId = `refresh-local-metadata-${Date.now()}`
    
    // Get SolidWorks files
    const filesToProcess = getSwFilesFromSelection(ctx.files, files)
    
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
    
    logRefresh('info', 'Starting metadata refresh', {
      operationId,
      selectedFileCount: files.length,
      swFileCount: filesToProcess.length
    })
    
    if (filesToProcess.length === 0) {
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
    
    // Progress tracking
    const toastId = `refresh-metadata-${Date.now()}`
    const total = filesToProcess.length
    const progress = new ProgressTracker(
      ctx,
      'refresh-local-metadata',
      toastId,
      `Reading metadata from ${total} file${total > 1 ? 's' : ''}...`,
      total
    )
    
    let succeeded = 0
    let failed = 0
    let updated = 0
    const errors: string[] = []
    
    // Get vault path for full path construction
    const vaultPath = ctx.vaultPath || ''
    
    // Process files
    for (const file of filesToProcess) {
      try {
        const fullPath = buildFullPath(vaultPath, file.relativePath)
        
        logRefresh('debug', 'Extracting metadata from file', { 
          fullPath, 
          extension: file.extension 
        })
        
        const metadata = await extractSolidWorksMetadata(fullPath, file.extension)
        
        if (metadata) {
          // Update pending metadata in store
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
          
          // Only update if we got something
          if (Object.keys(pendingUpdates).length > 0) {
            usePDMStore.getState().updatePendingMetadata(file.path, pendingUpdates)
            updated++
            
            logRefresh('info', 'Updated metadata for file', {
              filePath: file.path,
              partNumber: metadata.partNumber,
              description: metadata.description?.substring(0, 50),
              revision: metadata.revision,
              inheritedFromParent: metadata.inheritedFromParent
            })
          }
          
          succeeded++
        } else {
          // No metadata extracted (could be empty file or service issue)
          succeeded++ // Still count as success, just no data
          logRefresh('debug', 'No metadata found in file', { fullPath })
        }
      } catch (err) {
        failed++
        const errorMsg = `Failed to read ${file.name}: ${err instanceof Error ? err.message : String(err)}`
        errors.push(errorMsg)
        logRefresh('error', 'Failed to extract metadata', { 
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
    
    if (updated > 0) {
      ctx.addToast('success', `Refreshed metadata for ${updated} file${updated > 1 ? 's' : ''}`)
    } else if (succeeded > 0 && updated === 0) {
      ctx.addToast('info', 'No new metadata found in files')
    } else if (failed > 0) {
      ctx.addToast('error', `Failed to read ${failed} file${failed > 1 ? 's' : ''}`)
    }
    
    return {
      success: failed === 0,
      message: `Refreshed metadata: ${updated} updated, ${succeeded - updated} unchanged`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined
    }
  }
}
