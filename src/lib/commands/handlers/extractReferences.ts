/**
 * Extract References Command
 * 
 * Extract and store assembly references for existing synced files.
 * This is useful for:
 * 1. Importing existing vaults with assemblies (backfilling references)
 * 2. Rebuilding corrupted or deleted references
 * 3. Backfilling when SW service wasn't running during initial sync
 */

import type { Command, ExtractReferencesParams, CommandResult, LocalFile } from '../types'
import { getSyncedFilesFromSelection } from '../types'
import { ProgressTracker } from '../executor'
import { upsertFileReferences } from '../../supabase'
import type { SWReference } from '../../supabase/files/mutations'

// Only assemblies have references to extract
const ASSEMBLY_EXTENSIONS = ['.sldasm']

// Detailed logging for extract operations
function logExtract(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown>) {
  const prefix = '[ExtractReferences]'
  if (level === 'error') {
    console.error(prefix, message, context)
  } else if (level === 'warn') {
    console.warn(prefix, message, context)
  } else if (level === 'debug') {
    console.debug(prefix, message, context)
  } else {
    console.log(prefix, message, context)
  }
  
  try {
    window.electronAPI?.log(level, `${prefix} ${message}`, context)
  } catch {
    // Ignore if electronAPI not available
  }
}

/**
 * Info about a synced file for reference extraction
 */
interface SyncedFileInfo {
  fileId: string
  fileName: string
  filePath: string  // Local absolute path
  extension: string
}

/**
 * Get synced assembly files from selection
 */
function getSyncedAssemblyFiles(files: LocalFile[], selection: LocalFile[]): SyncedFileInfo[] {
  const syncedFiles = getSyncedFilesFromSelection(files, selection)
  
  // Filter to assemblies only and extract required info
  return syncedFiles
    .filter(f => ASSEMBLY_EXTENSIONS.includes(f.extension.toLowerCase()))
    .filter(f => f.pdmData?.id) // Must have database record
    .map(f => ({
      fileId: f.pdmData!.id,
      fileName: f.name,
      filePath: f.path,
      extension: f.extension
    }))
}

export const extractReferencesCommand: Command<ExtractReferencesParams> = {
  id: 'extract-references',
  name: 'Extract References',
  description: 'Extract and store assembly references to database for Contains/Where-Used queries',
  aliases: ['extract-refs', 'rebuild-bom'],
  usage: 'extract-references <path> [--all]',
  
  validate({ files }, ctx) {
    if (ctx.isOfflineMode) {
      return 'Cannot extract references while offline'
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
    
    // Check for synced assembly files
    const assemblyFiles = getSyncedAssemblyFiles(ctx.files, files)
    
    if (assemblyFiles.length === 0) {
      return 'No synced assembly files (.sldasm) in selection'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const organization = ctx.organization!
    const activeVaultId = ctx.activeVaultId!
    const vaultRootPath = ctx.vaultPath || undefined
    
    // Get synced assembly files
    const assemblyFiles = getSyncedAssemblyFiles(ctx.files, files)
    
    if (assemblyFiles.length === 0) {
      return {
        success: true,
        message: 'No assembly files to process',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    logExtract('info', 'Starting batch reference extraction', {
      assemblyCount: assemblyFiles.length
    })
    
    // Check if SolidWorks service is running
    const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
    if (!status?.data?.running) {
      logExtract('warn', 'SolidWorks service not running', {})
      ctx.addToast('error', 'SolidWorks service is not running. Please start SolidWorks and try again.')
      return {
        success: false,
        message: 'SolidWorks service is not running',
        total: assemblyFiles.length,
        succeeded: 0,
        failed: assemblyFiles.length,
        errors: ['SolidWorks service is required to extract assembly references']
      }
    }
    
    const total = assemblyFiles.length
    
    // Progress tracking
    const toastId = `extract-refs-${Date.now()}`
    const progress = new ProgressTracker(
      ctx,
      'extract-references',
      toastId,
      `Extracting references from ${total} assembl${total > 1 ? 'ies' : 'y'}...`,
      total
    )
    
    let succeeded = 0
    let failed = 0
    let skipped = 0
    const errors: string[] = []
    const details: string[] = []
    
    // Process assemblies sequentially to avoid overwhelming the SW service
    for (let i = 0; i < assemblyFiles.length; i++) {
      const assembly = assemblyFiles[i]
      
      try {
        logExtract('debug', `Processing assembly (${i + 1}/${total})`, {
          fileName: assembly.fileName
        })
        
        // Call SolidWorks service to get references
        const result = await window.electronAPI?.solidworks?.getReferences?.(assembly.filePath)
        
        if (!result?.success) {
          logExtract('debug', 'Failed to get references from SW service', {
            fileName: assembly.fileName,
            error: result?.error
          })
          
          // Check if this is an access error (file might be open in SW)
          if (result?.error?.includes('access') || result?.error?.includes('locked')) {
            errors.push(`${assembly.fileName}: File is locked or in use`)
            failed++
          } else if (result?.error) {
            // Report specific error
            errors.push(`${assembly.fileName}: ${result.error}`)
            failed++
          } else {
            // Unknown failure
            details.push(`${assembly.fileName}: Could not read references (file may need to be opened in SolidWorks first)`)
            skipped++
          }
          progress.update()
          continue
        }
        
        const swRefs = result.data?.references as Array<{
          path: string
          fileName: string
          exists: boolean
          fileType: string
        }> | undefined
        
        if (!swRefs || swRefs.length === 0) {
          logExtract('debug', 'Assembly has no references', { fileName: assembly.fileName })
          details.push(`${assembly.fileName}: No references found`)
          skipped++
          progress.update()
          continue
        }
        
        // Convert SW service format to our SWReference format
        const references: SWReference[] = swRefs.map(ref => ({
          childFilePath: ref.path,
          quantity: 1, // SW service doesn't provide quantity in getReferences, default to 1
          referenceType: ref.fileType === 'assembly' ? 'component' : 
                         ref.fileType === 'part' ? 'component' : 'reference',
          configuration: undefined
        }))
        
        // Store references in database (pass vault root for better path matching)
        const upsertResult = await upsertFileReferences(
          organization.id,
          activeVaultId,
          assembly.fileId,
          references,
          vaultRootPath
        )
        
        if (upsertResult.success) {
          logExtract('debug', 'Stored references', {
            fileName: assembly.fileName,
            inserted: upsertResult.inserted,
            updated: upsertResult.updated,
            deleted: upsertResult.deleted,
            skipped: upsertResult.skipped,
            skippedReasons: upsertResult.skippedReasons
          })
          
          const refCount = upsertResult.inserted + upsertResult.updated
          details.push(`${assembly.fileName}: ${refCount} reference${refCount !== 1 ? 's' : ''} stored`)
          succeeded++
        } else {
          logExtract('warn', 'Failed to store references', {
            fileName: assembly.fileName,
            error: upsertResult.error
          })
          errors.push(`${assembly.fileName}: ${upsertResult.error || 'Failed to store references'}`)
          failed++
        }
        
      } catch (err) {
        logExtract('warn', 'Reference extraction failed for assembly', {
          fileName: assembly.fileName,
          error: err instanceof Error ? err.message : String(err)
        })
        errors.push(`${assembly.fileName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        failed++
      }
      
      progress.update()
    }
    
    const { duration } = progress.finish()
    
    // Log summary
    logExtract('info', 'Batch reference extraction complete', {
      total,
      succeeded,
      failed,
      skipped,
      duration
    })
    
    // Show appropriate toast with helpful context
    if (failed > 0) {
      const failedMsg = errors.length > 0 ? `: ${errors[0]}` : ''
      ctx.addToast('warning', `Extracted references: ${succeeded} succeeded, ${failed} failed${skipped > 0 ? `, ${skipped} skipped` : ''}${failedMsg}`)
    } else if (succeeded > 0) {
      ctx.addToast('success', `Extracted references from ${succeeded} assembl${succeeded > 1 ? 'ies' : 'y'}${skipped > 0 ? ` (${skipped} skipped)` : ''}`)
    } else if (skipped > 0) {
      // All files were skipped
      ctx.addToast('info', `No references found in ${skipped} assembl${skipped > 1 ? 'ies' : 'y'}. These may be empty assemblies or have no synced components.`)
    } else {
      ctx.addToast('info', `No assembly files to process`)
    }
    
    return {
      success: failed === 0,
      message: failed > 0 
        ? `Extracted references: ${succeeded}/${total} succeeded`
        : `Extracted references from ${succeeded} assembl${succeeded > 1 ? 'ies' : 'y'}`,
      total,
      succeeded,
      failed,
      details: details.length > 0 ? details : undefined,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}
