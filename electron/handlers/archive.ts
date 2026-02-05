/**
 * Archive Handlers for Electron main process
 * 
 * Provides ZIP creation functionality for Pack and Go operations.
 * Uses JSZip for cross-platform ZIP creation with streaming support.
 */
import { ipcMain, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'

// ============================================
// Module State
// ============================================

let mainWindow: BrowserWindow | null = null
let log: (message: string, data?: unknown) => void = console.log
let logError: (message: string, data?: unknown) => void = console.error

// ============================================
// Types
// ============================================

/** Input file specification for ZIP creation */
interface ZipFileInput {
  /** Absolute path to the source file on disk */
  path: string
  /** Relative path within the ZIP archive (preserves folder structure) */
  relativePath: string
}

/** Result of ZIP creation operation */
interface ZipResult {
  success: boolean
  /** Total bytes written to the ZIP file */
  totalSize?: number
  /** Number of files included in the ZIP */
  fileCount?: number
  /** Error message if operation failed */
  error?: string
}

/** Progress event sent during ZIP creation */
interface ZipProgressEvent {
  /** Current phase: 'reading' | 'compressing' | 'writing' */
  phase: 'reading' | 'compressing' | 'writing'
  /** Number of files processed so far */
  filesProcessed: number
  /** Total number of files to process */
  filesTotal: number
  /** Current file being processed */
  currentFile?: string
  /** Bytes written so far (only during 'writing' phase) */
  bytesWritten?: number
}

// ============================================
// Handler Dependencies
// ============================================

export interface ArchiveHandlerDependencies {
  log: (message: string, data?: unknown) => void
  logError: (message: string, data?: unknown) => void
}

// ============================================
// ZIP Creation Implementation
// ============================================

/**
 * Creates a ZIP archive from a list of files.
 * 
 * Features:
 * - Preserves folder structure using relativePath
 * - Streams large files efficiently (reads file by file, not all at once)
 * - Reports progress via IPC events
 * - Handles errors gracefully (missing files, permission denied, disk full)
 * 
 * @param files - Array of files to include in the ZIP
 * @param outputPath - Absolute path where the ZIP will be written
 * @param sender - WebContents to send progress events to
 * @returns Result object with success status and optional error
 */
async function createZipFromFilesImpl(
  files: ZipFileInput[],
  outputPath: string,
  sender: Electron.WebContents
): Promise<ZipResult> {
  const startTime = Date.now()
  const zip = new JSZip()
  
  log('[Archive] Starting ZIP creation', {
    fileCount: files.length,
    outputPath
  })
  
  // Emit initial progress
  sender.send('archive:progress', {
    phase: 'reading',
    filesProcessed: 0,
    filesTotal: files.length
  } satisfies ZipProgressEvent)
  
  // Phase 1: Read all files and add to ZIP
  const missingFiles: string[] = []
  const failedFiles: Array<{ path: string; error: string }> = []
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    
    try {
      // Check if file exists
      if (!fs.existsSync(file.path)) {
        missingFiles.push(file.relativePath)
        log('[Archive] File not found, skipping', { path: file.path })
        continue
      }
      
      // Read file as buffer (more efficient for binary files)
      const fileBuffer = await fs.promises.readFile(file.path)
      
      // Add to ZIP with relative path (preserves folder structure)
      // Normalize path separators for cross-platform compatibility
      const normalizedPath = file.relativePath.replace(/\\/g, '/')
      zip.file(normalizedPath, fileBuffer, {
        binary: true,
        // Preserve original modification time if available
        date: fs.statSync(file.path).mtime
      })
      
      // Emit progress
      sender.send('archive:progress', {
        phase: 'reading',
        filesProcessed: i + 1,
        filesTotal: files.length,
        currentFile: file.relativePath
      } satisfies ZipProgressEvent)
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      failedFiles.push({ path: file.relativePath, error: errorMessage })
      logError('[Archive] Failed to read file', { path: file.path, error: errorMessage })
    }
  }
  
  // Check if we have any files to include
  const filesAdded = files.length - missingFiles.length - failedFiles.length
  if (filesAdded === 0) {
    const error = missingFiles.length > 0 
      ? `No files found. Missing: ${missingFiles.slice(0, 3).join(', ')}${missingFiles.length > 3 ? ` (+${missingFiles.length - 3} more)` : ''}`
      : `All files failed to read. First error: ${failedFiles[0]?.error || 'Unknown error'}`
    
    logError('[Archive] No files to add to ZIP', { missingFiles, failedFiles })
    return { success: false, error }
  }
  
  // Phase 2: Generate ZIP buffer
  sender.send('archive:progress', {
    phase: 'compressing',
    filesProcessed: filesAdded,
    filesTotal: filesAdded
  } satisfies ZipProgressEvent)
  
  log('[Archive] Compressing files', { filesAdded })
  
  let zipBuffer: Buffer
  try {
    // Generate ZIP with DEFLATE compression
    // Use 'nodebuffer' type for Node.js compatibility
    zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }, // Balanced speed/compression
      streamFiles: true // Stream large files for memory efficiency
    }, (metadata) => {
      // Progress callback during generation
      sender.send('archive:progress', {
        phase: 'compressing',
        filesProcessed: Math.round((metadata.percent / 100) * filesAdded),
        filesTotal: filesAdded
      } satisfies ZipProgressEvent)
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logError('[Archive] Failed to generate ZIP', { error: errorMessage })
    return { success: false, error: `Failed to compress: ${errorMessage}` }
  }
  
  // Phase 3: Write to disk
  sender.send('archive:progress', {
    phase: 'writing',
    filesProcessed: filesAdded,
    filesTotal: filesAdded,
    bytesWritten: 0
  } satisfies ZipProgressEvent)
  
  log('[Archive] Writing ZIP to disk', { size: zipBuffer.length, outputPath })
  
  try {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      await fs.promises.mkdir(outputDir, { recursive: true })
    }
    
    // Write the ZIP file
    await fs.promises.writeFile(outputPath, zipBuffer)
    
    // Final progress event
    sender.send('archive:progress', {
      phase: 'writing',
      filesProcessed: filesAdded,
      filesTotal: filesAdded,
      bytesWritten: zipBuffer.length
    } satisfies ZipProgressEvent)
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    
    // Detect specific error types for better user feedback
    let userError = `Failed to write ZIP: ${errorMessage}`
    if (errorMessage.includes('ENOSPC')) {
      userError = 'Not enough disk space to create ZIP file'
    } else if (errorMessage.includes('EACCES') || errorMessage.includes('EPERM')) {
      userError = 'Permission denied. Cannot write to the selected location'
    } else if (errorMessage.includes('ENOENT')) {
      userError = 'Output directory does not exist'
    }
    
    logError('[Archive] Failed to write ZIP', { error: errorMessage, outputPath })
    return { success: false, error: userError }
  }
  
  const duration = Date.now() - startTime
  log('[Archive] ZIP creation complete', {
    fileCount: filesAdded,
    totalSize: zipBuffer.length,
    duration,
    missingFiles: missingFiles.length,
    failedFiles: failedFiles.length
  })
  
  return {
    success: true,
    fileCount: filesAdded,
    totalSize: zipBuffer.length
  }
}

// ============================================
// IPC Handler Registration
// ============================================

export function registerArchiveHandlers(window: BrowserWindow, deps: ArchiveHandlerDependencies): void {
  mainWindow = window
  log = deps.log
  logError = deps.logError
  
  /**
   * Create a ZIP file from a list of source files
   * 
   * @param files - Array of {path, relativePath} objects
   * @param outputPath - Absolute path for the output ZIP file
   * @returns {success, totalSize?, fileCount?, error?}
   */
  ipcMain.handle('archive:create-zip', async (event, files: ZipFileInput[], outputPath: string): Promise<ZipResult> => {
    // Validate input
    if (!Array.isArray(files) || files.length === 0) {
      return { success: false, error: 'No files provided' }
    }
    
    if (!outputPath || typeof outputPath !== 'string') {
      return { success: false, error: 'Invalid output path' }
    }
    
    // Ensure output has .zip extension
    const normalizedOutput = outputPath.toLowerCase().endsWith('.zip') 
      ? outputPath 
      : `${outputPath}.zip`
    
    return createZipFromFilesImpl(files, normalizedOutput, event.sender)
  })
  
  log('[Archive] IPC handlers registered')
}

export function unregisterArchiveHandlers(): void {
  ipcMain.removeHandler('archive:create-zip')
}
