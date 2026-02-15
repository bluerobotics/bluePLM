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
import { log } from '@/lib/logger'
import { FileOperationTracker } from '../../fileOperationTracker'

// File types that have references to extract (assemblies reference components, drawings reference models)
const REFERENCE_FILE_EXTENSIONS = ['.sldasm', '.slddrw']

// Drawing extensions (need special handling for reference type)
const DRAWING_EXTENSIONS = ['.slddrw']

function logExtract(level: 'info' | 'warn' | 'error' | 'debug', message: string, context: Record<string, unknown>) {
  log[level]('[ExtractReferences]', message, context)
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
 * Get synced files with references from selection (assemblies and drawings)
 */
function getSyncedFilesWithReferences(files: LocalFile[], selection: LocalFile[]): SyncedFileInfo[] {
  const syncedFiles = getSyncedFilesFromSelection(files, selection)
  
  // Filter to assemblies and drawings, and extract required info
  return syncedFiles
    .filter(f => REFERENCE_FILE_EXTENSIONS.includes(f.extension.toLowerCase()))
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
  description: 'Extract and store file references (assemblies and drawings) to database for Contains/Where-Used queries',
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
    
    // Check for synced files with references (assemblies and drawings)
    const filesWithRefs = getSyncedFilesWithReferences(ctx.files, files)
    
    if (filesWithRefs.length === 0) {
      return 'No synced assemblies (.sldasm) or drawings (.slddrw) in selection'
    }
    
    return null
  },
  
  async execute({ files }, ctx): Promise<CommandResult> {
    const organization = ctx.organization!
    const activeVaultId = ctx.activeVaultId!
    const vaultRootPath = ctx.vaultPath || undefined
    
    // Get synced files with references (assemblies and drawings)
    const filesWithRefs = getSyncedFilesWithReferences(ctx.files, files)
    
    // Initialize file operation tracker for DevTools monitoring
    const tracker = FileOperationTracker.start(
      'extract-references',
      filesWithRefs.length,
      filesWithRefs.map(f => f.filePath)
    )
    
    if (filesWithRefs.length === 0) {
      tracker.endOperation('completed')
      return {
        success: true,
        message: 'No files with references to process',
        total: 0,
        succeeded: 0,
        failed: 0
      }
    }
    
    const assembliesCount = filesWithRefs.filter(f => f.extension.toLowerCase() === '.sldasm').length
    const drawingsCount = filesWithRefs.filter(f => f.extension.toLowerCase() === '.slddrw').length
    
    logExtract('info', 'Starting batch reference extraction', {
      fileCount: filesWithRefs.length,
      assemblies: assembliesCount,
      drawings: drawingsCount
    })
    
    // Check if SolidWorks service is running
    const swStatusStepId = tracker.startStep('Check SW service status')
    const status = await window.electronAPI?.solidworks?.getServiceStatus?.()
    tracker.endStep(swStatusStepId, status?.data?.running ? 'completed' : 'failed', { 
      swRunning: !!status?.data?.running 
    })
    
    if (!status?.data?.running) {
      logExtract('warn', 'SolidWorks service not running', {})
      ctx.addToast('error', 'SolidWorks service is not running. Please start SolidWorks and try again.')
      tracker.endOperation('failed', 'SolidWorks service is not running')
      return {
        success: false,
        message: 'SolidWorks service is not running',
        total: filesWithRefs.length,
        succeeded: 0,
        failed: filesWithRefs.length,
        errors: ['SolidWorks service is required to extract file references']
      }
    }
    
    const total = filesWithRefs.length
    
    // Progress tracking
    const toastId = `extract-refs-${Date.now()}`
    const progress = new ProgressTracker(
      ctx,
      'extract-references',
      toastId,
      `Extracting references from ${total} file${total > 1 ? 's' : ''}...`,
      total
    )
    
    let succeeded = 0
    let failed = 0
    let skipped = 0
    const errors: string[] = []
    const details: string[] = []
    
    // Start tracking the extraction phase
    const extractStepId = tracker.startStep('Extract file references', { 
      fileCount: filesWithRefs.length,
      assemblies: assembliesCount,
      drawings: drawingsCount
    })
    const extractPhaseStart = Date.now()
    
    // Process files sequentially to avoid overwhelming the SW service
    for (let i = 0; i < filesWithRefs.length; i++) {
      const file = filesWithRefs[i]
      const isDrawing = DRAWING_EXTENSIONS.includes(file.extension.toLowerCase())
      
      try {
        logExtract('debug', `Processing file (${i + 1}/${total})`, {
          fileName: file.fileName,
          isDrawing
        })
        
        // Call SolidWorks service to get references
        const result = await window.electronAPI?.solidworks?.getReferences?.(file.filePath)
        
        if (!result?.success) {
          logExtract('debug', 'Failed to get references from SW service', {
            fileName: file.fileName,
            isDrawing,
            error: result?.error
          })
          
          // Check if this is an access error (file might be open in SW)
          if (result?.error?.includes('access') || result?.error?.includes('locked')) {
            errors.push(`${file.fileName}: File is locked or in use`)
            failed++
          } else if (result?.error) {
            // Report specific error
            errors.push(`${file.fileName}: ${result.error}`)
            failed++
          } else {
            // Unknown failure
            details.push(`${file.fileName}: Could not read references (file may need to be opened in SolidWorks first)`)
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
          configuration?: string
        }> | undefined
        
        if (!swRefs || swRefs.length === 0) {
          logExtract('debug', 'File has no references', { fileName: file.fileName, isDrawing })
          details.push(`${file.fileName}: No references found`)
          skipped++
          progress.update()
          continue
        }
        
        // Convert SW service format to our SWReference format
        // Reference types differ based on file type:
        // - Assemblies: components (parts and sub-assemblies)
        // - Drawings: model references (the parts/assemblies the drawing documents)
        const references: SWReference[] = swRefs.map(ref => ({
          childFilePath: ref.path,
          quantity: 1, // SW service doesn't provide quantity in getReferences, default to 1
          referenceType: isDrawing
            ? 'reference'  // Drawings reference models they document
            : (ref.fileType === 'assembly' ? 'component' : 
               ref.fileType === 'part' ? 'component' : 'reference'),
          configuration: ref.configuration || undefined
        }))
        
        // Store references in database (pass vault root for better path matching)
        const upsertResult = await upsertFileReferences(
          organization.id,
          activeVaultId,
          file.fileId,
          references,
          vaultRootPath
        )
        
        if (upsertResult.success) {
          logExtract('debug', 'Stored references', {
            fileName: file.fileName,
            isDrawing,
            inserted: upsertResult.inserted,
            updated: upsertResult.updated,
            deleted: upsertResult.deleted,
            skipped: upsertResult.skipped,
            skippedReasons: upsertResult.skippedReasons
          })
          
          const refCount = upsertResult.inserted + upsertResult.updated
          details.push(`${file.fileName}: ${refCount} reference${refCount !== 1 ? 's' : ''} stored`)
          succeeded++
        } else {
          logExtract('warn', 'Failed to store references', {
            fileName: file.fileName,
            isDrawing,
            error: upsertResult.error
          })
          errors.push(`${file.fileName}: ${upsertResult.error || 'Failed to store references'}`)
          failed++
        }
        
      } catch (err) {
        logExtract('warn', 'Reference extraction failed for file', {
          fileName: file.fileName,
          isDrawing,
          error: err instanceof Error ? err.message : String(err)
        })
        errors.push(`${file.fileName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        failed++
      }
      
      progress.update()
    }
    
    // End extraction step
    tracker.endStep(extractStepId, 'completed', { 
      succeeded, 
      failed,
      skipped,
      durationMs: Date.now() - extractPhaseStart
    })
    
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
      ctx.addToast('success', `Extracted references from ${succeeded} file${succeeded > 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped)` : ''}`)
    } else if (skipped > 0) {
      // All files were skipped
      ctx.addToast('info', `No references found in ${skipped} file${skipped > 1 ? 's' : ''}. These may be empty assemblies/drawings or have no synced components.`)
    } else {
      ctx.addToast('info', `No files with references to process`)
    }
    
    // Complete operation tracking
    tracker.endOperation(failed === 0 ? 'completed' : 'failed', failed > 0 ? errors[0] : undefined)
    
    return {
      success: failed === 0,
      message: failed > 0 
        ? `Extracted references: ${succeeded}/${total} succeeded`
        : `Extracted references from ${succeeded} file${succeeded > 1 ? 's' : ''}`,
      total,
      succeeded,
      failed,
      details: details.length > 0 ? details : undefined,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}
