/**
 * useDragState - Drag-and-drop state management hook
 * 
 * Manages all drag-and-drop functionality for the file browser including:
 * - Internal file dragging (within the app)
 * - External file dragging (from OS file explorer)
 * - Folder drop targets with visual feedback
 * - Column header dragging for reorder
 * - Selection box for multi-select
 * 
 * Key exports:
 * - draggedFiles, isDraggingOver, isExternalDrag, dragOverFolder
 * - draggingColumn, dragOverColumn, selectionBox
 * - handleDragStart, handleDragEnd, handleDragOver, handleDrop
 * - handleFolderDragOver, handleFolderDragLeave, handleDropOnFolder
 * 
 * @example
 * const {
 *   isDraggingOver,
 *   dragOverFolder,
 *   handleDragOver,
 *   handleDrop
 * } = useDragState({
 *   files, selectedFiles, vaultPath, handleMoveFiles, ...
 * })
 */
import { useState, useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { logDragDrop } from '@/lib/userActionLogger'
import { log } from '@/lib/logger'
import { buildFullPath } from '@/lib/utils/path'

/**
 * Interface for collected entries from DataTransfer
 * Includes both files and folders (including empty ones)
 */
interface CollectedEntry {
  path: string
  isDirectory: boolean
  relativePath: string  // Path relative to the dropped root for nested items
}

/**
 * Extract all file and folder paths from a DataTransfer, including empty folders.
 * Uses webkitGetAsEntry() API which properly handles directory structures.
 * Falls back to e.dataTransfer.files for browsers without directory support.
 * 
 * IMPORTANT: webkitGetAsEntry gives virtual paths (like /filename.txt), NOT real file system paths.
 * We must use getPathForFile() on the File objects from dataTransfer.files to get real paths,
 * then pass those real paths through the recursive directory traversal.
 */
async function collectEntriesFromDataTransfer(
  dataTransfer: DataTransfer,
  getPathForFile: (file: File) => string
): Promise<CollectedEntry[]> {
  const entries: CollectedEntry[] = []
  const items = dataTransfer.items
  const files = Array.from(dataTransfer.files)
  
  // Try to use webkitGetAsEntry for proper directory support
  if (items && items.length > 0) {
    const itemsArray = Array.from(items)
    
    for (let i = 0; i < itemsArray.length; i++) {
      const item = itemsArray[i]
      if (item.kind !== 'file') continue
      
      // Get the actual file system path from the File object at the same index
      // dataTransfer.files[i] corresponds to dataTransfer.items[i]
      const file = files[i]
      const rootPath = file ? getPathForFile(file) : null
      
      if (!rootPath) continue
      
      // Try webkitGetAsEntry for directory support
      const entry = item.webkitGetAsEntry?.()
      if (entry) {
        await collectFromEntry(entry, '', entries, rootPath)
      } else {
        // Fallback: get as regular file
        entries.push({ path: rootPath, isDirectory: false, relativePath: file.name })
      }
    }
  }
  
  // If no entries collected via webkitGetAsEntry, fall back to files array
  if (entries.length === 0) {
    for (const file of files) {
      const path = getPathForFile(file)
      if (path) {
        entries.push({ path, isDirectory: false, relativePath: file.name })
      }
    }
  }
  
  return entries
}

/**
 * Recursively collect entries from a FileSystemEntry
 * 
 * @param entry - The FileSystemEntry to process
 * @param parentRelativePath - The relative path of the parent (empty string for root items)
 * @param entries - Array to collect results into
 * @param rootPath - The actual file system path of the current item (NOT the virtual web path)
 */
async function collectFromEntry(
  entry: FileSystemEntry,
  parentRelativePath: string,
  entries: CollectedEntry[],
  rootPath: string
): Promise<void> {
  const relativePath = parentRelativePath ? `${parentRelativePath}/${entry.name}` : entry.name
  
  // Construct the actual file system path
  // For root items (parentRelativePath is empty): use rootPath directly
  // For nested items: append the entry name to rootPath
  const actualPath = !parentRelativePath 
    ? rootPath 
    : rootPath + (rootPath.includes('\\') ? '\\' : '/') + entry.name
  
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    // Always add the directory entry (even if empty)
    entries.push({ 
      path: actualPath, 
      isDirectory: true, 
      relativePath 
    })
    
    // Read directory contents
    const reader = dirEntry.createReader()
    const children = await readAllDirectoryEntries(reader)
    
    for (const child of children) {
      // Pass actualPath as the new rootPath for children
      await collectFromEntry(child, relativePath, entries, actualPath)
    }
  } else {
    // It's a file
    entries.push({ 
      path: actualPath,
      isDirectory: false, 
      relativePath 
    })
  }
}

/**
 * Read all entries from a directory reader (handles batching)
 */
function readAllDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = []
    
    function readBatch() {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(entries)
          } else {
            entries.push(...batch)
            readBatch() // Continue reading
          }
        },
        (error) => reject(error)
      )
    }
    
    readBatch()
  })
}

export interface SelectionBox {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

export interface UseDragStateOptions {
  files: LocalFile[]
  selectedFiles: string[]
  userId: string | undefined
  vaultPath: string | null
  currentFolder: string
  onRefresh: (silent?: boolean) => void
  addToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
  addProgressToast: (id: string, message: string, total: number) => void
  updateProgressToast: (id: string, current: number, percent: number) => void
  removeToast: (id: string) => void
  setStatusMessage: (msg: string) => void
  handleMoveFiles: (filesToMove: LocalFile[], targetFolderPath: string) => Promise<void>
}

export interface UseDragStateReturn {
  // Internal dragged files (files being dragged within the app)
  draggedFiles: LocalFile[]
  setDraggedFiles: (files: LocalFile[]) => void
  
  // Drag over state for drop targets
  isDraggingOver: boolean
  setIsDraggingOver: (dragging: boolean) => void
  
  // External drag (from outside the app)
  isExternalDrag: boolean
  setIsExternalDrag: (external: boolean) => void
  
  // Folder drag target
  dragOverFolder: string | null
  setDragOverFolder: (folder: string | null) => void
  
  // Column dragging
  draggingColumn: string | null
  setDraggingColumn: (column: string | null) => void
  dragOverColumn: string | null
  setDragOverColumn: (column: string | null) => void
  
  // Selection box for marquee select
  selectionBox: SelectionBox | null
  setSelectionBox: (box: SelectionBox | null | ((prev: SelectionBox | null) => SelectionBox | null)) => void
  
  // Column resizing
  resizingColumn: string | null
  setResizingColumn: (column: string | null) => void
  
  // Reset all drag state
  resetDragState: () => void
  
  // Drag event handlers
  handleDragStart: (e: React.DragEvent, file: LocalFile) => void
  handleDragEnd: () => void
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => Promise<void>
  handleFolderDragOver: (e: React.DragEvent, folder: LocalFile) => void
  handleFolderDragLeave: (e: React.DragEvent) => void
  handleDropOnFolder: (e: React.DragEvent, targetFolder: LocalFile) => Promise<void>
  canMoveFiles: (filesToCheck: LocalFile[]) => boolean
}

/**
 * Hook for managing drag-and-drop state and handlers.
 */
export function useDragState(options: UseDragStateOptions): UseDragStateReturn {
  const {
    files,
    selectedFiles,
    vaultPath,
    currentFolder,
    onRefresh,
    addToast,
    addProgressToast,
    updateProgressToast,
    removeToast,
    setStatusMessage,
    handleMoveFiles
  } = options

  const [draggedFiles, setDraggedFiles] = useState<LocalFile[]>([])
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isExternalDrag, setIsExternalDrag] = useState(false)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  
  const resetDragState = useCallback(() => {
    setDraggedFiles([])
    setIsDraggingOver(false)
    setIsExternalDrag(false)
    setDragOverFolder(null)
    setDraggingColumn(null)
    setDragOverColumn(null)
    setSelectionBox(null)
    // Note: don't reset resizingColumn as it's managed separately
  }, [])

  // Check if files can be moved (always allowed - checkout not required for moving)
  const canMoveFiles = useCallback((_filesToCheck: LocalFile[]): boolean => {
    return true
  }, [])

  // Handle drag start - HTML5 drag initiates, Electron adds native file data
  const handleDragStart = useCallback((e: React.DragEvent, file: LocalFile) => {
    logDragDrop('Started dragging files', { fileName: file.name, isDirectory: file.isDirectory })
    // Get files to drag - now supports both files and folders
    let filesToDrag: LocalFile[]
    if (selectedFiles.includes(file.path) && selectedFiles.length > 1) {
      // Multiple selection - include both files and folders (can't drag cloud-only files)
      filesToDrag = files.filter(f => selectedFiles.includes(f.path) && f.diffStatus !== 'cloud')
    } else if (file.diffStatus !== 'cloud') {
      filesToDrag = [file]
    } else {
      e.preventDefault()
      return
    }
    
    if (filesToDrag.length === 0) {
      e.preventDefault()
      return
    }
    
    // Track dragged files for internal move operations
    setDraggedFiles(filesToDrag)
    
    const filePaths = filesToDrag.map(f => f.path)
    log.debug('[Drag]', 'Starting drag for files', { paths: filePaths })
    
    // Set up HTML5 drag data
    e.dataTransfer.effectAllowed = 'copyMove'
    e.dataTransfer.setData('text/plain', filePaths.join('\n'))
    e.dataTransfer.setData('application/x-plm-files', JSON.stringify(filesToDrag.map(f => f.relativePath)))
    
    // Use DownloadURL format for single file (non-folder) - this enables actual file copy to external apps
    if (filesToDrag.length === 1 && !filesToDrag[0].isDirectory) {
      const filePath = filesToDrag[0].path
      const fileName = filesToDrag[0].name
      const ext = filesToDrag[0].extension?.toLowerCase() || ''
      const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.step': 'application/step',
        '.stp': 'application/step',
        '.sldprt': 'application/octet-stream',
        '.sldasm': 'application/octet-stream',
        '.slddrw': 'application/octet-stream',
        '.dxf': 'application/dxf',
        '.dwg': 'application/acad',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
      }
      const mime = mimeTypes[ext] || 'application/octet-stream'
      const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`
      e.dataTransfer.setData('DownloadURL', `${mime}:${fileName}:${fileUrl}`)
    }
    
    // Create a custom drag image showing file/folder count
    const dragPreview = document.createElement('div')
    dragPreview.style.cssText = 'position:absolute;left:-1000px;padding:8px 12px;background:#1e293b;border:1px solid #3b82f6;border-radius:6px;color:white;font-size:13px;display:flex;align-items:center;gap:6px;'
    const iconSvg = file.isDirectory 
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
    const label = filesToDrag.length > 1 ? `${filesToDrag.length} items` : file.name
    dragPreview.innerHTML = `${iconSvg}${label}`
    document.body.appendChild(dragPreview)
    e.dataTransfer.setDragImage(dragPreview, 20, 20)
    setTimeout(() => dragPreview.remove(), 0)
    
    // Also call Electron's startDrag for native multi-file support (only for files, not folders)
    const filePathsForNative = filesToDrag.filter(f => !f.isDirectory).map(f => f.path)
    if (filePathsForNative.length > 0) {
      window.electronAPI?.startDrag(filePathsForNative)
    }
  }, [files, selectedFiles])

  // Handle drag end - clear dragged files state
  const handleDragEnd = useCallback(() => {
    setDraggedFiles([])
    setDragOverFolder(null)
  }, [])

  // Handle drag over a folder row
  const handleFolderDragOver = useCallback((e: React.DragEvent, folder: LocalFile) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Accept if we have local dragged files OR cross-view drag from Explorer OR external files
    const hasPdmFiles = e.dataTransfer.types.includes('application/x-plm-files')
    const hasExternalFiles = e.dataTransfer.types.includes('Files') && !hasPdmFiles
    
    if (draggedFiles.length === 0 && !hasPdmFiles && !hasExternalFiles) return
    
    // For external file drops, just show the target highlight and set copy effect
    if (hasExternalFiles) {
      e.dataTransfer.dropEffect = 'copy'
      setDragOverFolder(folder.relativePath)
      // Hide the big overlay since we're targeting a specific folder
      setIsDraggingOver(false)
      return
    }
    
    // For local drags, we can check everything
    // For cross-view drags, we can't check details until drop, just show target
    const filesToCheck = draggedFiles.length > 0 ? draggedFiles : []
    
    if (filesToCheck.length > 0) {
      // Don't allow dropping a folder into itself or its children
      const isDroppingIntoSelf = filesToCheck.some(f => 
        f.isDirectory && (folder.relativePath === f.relativePath || folder.relativePath.startsWith(f.relativePath + '/'))
      )
      if (isDroppingIntoSelf) return
      
      // Don't allow dropping if the target is the current parent
      const wouldStayInPlace = filesToCheck.every(f => {
        const parentPath = f.relativePath.includes('/') 
          ? f.relativePath.substring(0, f.relativePath.lastIndexOf('/'))
          : ''
        return parentPath === folder.relativePath
      })
      if (wouldStayInPlace) return
      
      // Check if all files can be moved
      if (!canMoveFiles(filesToCheck)) {
        e.dataTransfer.dropEffect = 'none'
        return
      }
    }
    
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolder(folder.relativePath)
  }, [draggedFiles, canMoveFiles])

  // Handle drag leave from a folder row
  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolder(null)
  }, [])

  // Handle drop onto a folder row
  const handleDropOnFolder = useCallback(async (e: React.DragEvent, targetFolder: LocalFile) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolder(null)
    setIsDraggingOver(false)
    setIsExternalDrag(false)
    
    if (!window.electronAPI || !vaultPath) {
      setDraggedFiles([])
      return
    }
    
    // Check for external files first (from outside the app)
    const hasPdmFiles = e.dataTransfer.types.includes('application/x-plm-files')
    const droppedExternalFiles = Array.from(e.dataTransfer.files)
    
    if ((droppedExternalFiles.length > 0 || e.dataTransfer.items.length > 0) && !hasPdmFiles) {
      // Handle external file/folder drop onto this folder
      // Use webkitGetAsEntry for proper folder support (including empty folders)
      const entries = await collectEntriesFromDataTransfer(
        e.dataTransfer,
        (file) => window.electronAPI?.getPathForFile(file) || ''
      )
      
      // If no entries from webkitGetAsEntry, fall back to traditional file handling
      if (entries.length === 0) {
        for (const file of droppedExternalFiles) {
          try {
            const filePath = window.electronAPI.getPathForFile(file)
            if (filePath) {
              // Check if it's a directory
              const dirCheck = await window.electronAPI.isDirectory(filePath)
              entries.push({ 
                path: filePath, 
                isDirectory: dirCheck.success && dirCheck.isDirectory === true,
                relativePath: file.name 
              })
            }
          } catch (err) {
            log.error('[Drag]', 'Error getting file path', { error: err })
          }
        }
      }

      if (entries.length === 0) {
        setStatusMessage('Could not get file paths')
        setTimeout(() => setStatusMessage(''), 3000)
        return
      }

      // Separate directories and files - process directories first to create structure
      const directories = entries.filter(e => e.isDirectory)
      const fileEntries = entries.filter(e => !e.isDirectory)
      
      const totalItems = entries.length
      const toastId = `drop-files-${Date.now()}`
      addProgressToast(toastId, `Adding ${totalItems} item${totalItems > 1 ? 's' : ''} to ${targetFolder.name}...`, totalItems)

      try {
        let successCount = 0
        let errorCount = 0
        let processed = 0

        // First create all directories (including empty ones)
        for (const dir of directories) {
          const destPath = buildFullPath(vaultPath, targetFolder.relativePath + '/' + dir.relativePath)

          log.debug('[Drop]', 'Creating directory in folder', { relativePath: dir.relativePath, destPath })

          // First try to copy the directory (handles non-empty directories)
          const copyResult = await window.electronAPI.copyFile(dir.path, destPath)
          if (copyResult.success) {
            successCount++
          } else {
            // If copy failed, try creating the folder directly (for empty folders)
            const createResult = await window.electronAPI.createFolder(destPath)
            if (createResult.success) {
              successCount++
            } else {
              errorCount++
              log.error('[Drop]', `Failed to create directory ${dir.relativePath}`, { error: createResult.error })
            }
          }
          
          processed++
          const percent = Math.round((processed / totalItems) * 100)
          updateProgressToast(toastId, processed, percent)
        }

        // Then copy all files
        for (const file of fileEntries) {
          const destPath = buildFullPath(vaultPath, targetFolder.relativePath + '/' + file.relativePath)

          log.debug('[Drop]', 'Copying file to folder', { relativePath: file.relativePath, destPath })

          const result = await window.electronAPI.copyFile(file.path, destPath)
          if (result.success) {
            successCount++
          } else {
            errorCount++
            log.error('[Drop]', `Failed to copy ${file.relativePath}`, { error: result.error })
          }
          
          processed++
          const percent = Math.round((processed / totalItems) * 100)
          updateProgressToast(toastId, processed, percent)
        }

        removeToast(toastId)
        
        if (errorCount === 0) {
          addToast('success', `Added ${successCount} item${successCount > 1 ? 's' : ''} to ${targetFolder.name}`)
        } else {
          addToast('warning', `Added ${successCount}, failed ${errorCount}`)
        }

        // Refresh the file list
        setTimeout(() => onRefresh(), 100)
      } catch (err) {
        log.error('[Drag]', 'Error adding files', { error: err })
        removeToast(toastId)
        addToast('error', 'Failed to add files')
      }
      return
    }
    
    // Get files from local state or from data transfer (cross-view drag)
    let filesToMove: LocalFile[] = []
    
    if (draggedFiles.length > 0) {
      filesToMove = draggedFiles
      setDraggedFiles([])
    } else {
      // Try to get from data transfer (drag from Explorer View)
      const pdmFilesData = e.dataTransfer.getData('application/x-plm-files')
      if (pdmFilesData) {
        try {
          const relativePaths: string[] = JSON.parse(pdmFilesData)
          filesToMove = files.filter(f => relativePaths.includes(f.relativePath))
        } catch (err) {
          log.error('[Drag]', 'Failed to parse drag data', { error: err })
          return
        }
      }
    }
    
    if (filesToMove.length === 0) return
    
    // Use the helper function to perform the move
    await handleMoveFiles(filesToMove, targetFolder.relativePath)
    
    onRefresh(true)
  }, [vaultPath, files, draggedFiles, addProgressToast, updateProgressToast, removeToast, addToast, setStatusMessage, onRefresh, handleMoveFiles])

  // Drag and Drop handlers for container (supports external files + cross-view drag)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Check for external files (from outside the app)
    if (e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('application/x-plm-files')) {
      setIsDraggingOver(true)
      setIsExternalDrag(true)
      e.dataTransfer.dropEffect = 'copy'
      return
    }
    
    // Check for cross-view drag from Explorer (internal move)
    if (e.dataTransfer.types.includes('application/x-plm-files')) {
      // Don't show big overlay for internal moves - folder row highlighting is sufficient
      // Only set isDraggingOver if we're not over a specific folder (to enable drop on current folder)
      if (!dragOverFolder) {
        setIsDraggingOver(true)
        setIsExternalDrag(false)
      }
      e.dataTransfer.dropEffect = 'move'
    }
  }, [dragOverFolder])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear if leaving the container entirely (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setIsDraggingOver(false)
      setIsExternalDrag(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
    setIsExternalDrag(false)

    if (!window.electronAPI || !vaultPath) {
      setStatusMessage('No vault connected')
      return
    }

    logDragDrop('Dropped files', { targetFolder: currentFolder })
    // First check for cross-view drag from Explorer (move files to current folder)
    const pdmFilesData = e.dataTransfer.getData('application/x-plm-files')
    if (pdmFilesData) {
      try {
        const relativePaths: string[] = JSON.parse(pdmFilesData)
        const filesToMove = files.filter(f => relativePaths.includes(f.relativePath))
        
        if (filesToMove.length > 0) {
          // Move to current folder
          await handleMoveFiles(filesToMove, currentFolder)
          return
        }
      } catch (err) {
        log.error('[Drag]', 'Failed to parse drag data', { error: err })
      }
    }

    // Handle external files being dropped - use webkitGetAsEntry for proper folder support
    const entries = await collectEntriesFromDataTransfer(
      e.dataTransfer,
      (file) => window.electronAPI?.getPathForFile(file) || ''
    )
    
    // If no entries from webkitGetAsEntry, fall back to traditional file handling
    if (entries.length === 0) {
      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length === 0) return
      
      for (const file of droppedFiles) {
        try {
          const filePath = window.electronAPI.getPathForFile(file)
          if (filePath) {
            // Check if it's a directory
            const dirCheck = await window.electronAPI.isDirectory(filePath)
            entries.push({ 
              path: filePath, 
              isDirectory: dirCheck.success && dirCheck.isDirectory === true,
              relativePath: file.name 
            })
          }
        } catch (err) {
          log.error('[Drag]', 'Error getting file path', { error: err })
        }
      }
    }

    if (entries.length === 0) {
      setStatusMessage('Could not get file paths')
      setTimeout(() => setStatusMessage(''), 3000)
      return
    }

    // Determine destination folder
    const destFolder = currentFolder || ''
    
    // Separate directories and files - process directories first to create structure
    const directories = entries.filter(e => e.isDirectory)
    const fileEntries = entries.filter(e => !e.isDirectory)
    
    const totalItems = entries.length
    const toastId = `drop-files-${Date.now()}`
    addProgressToast(toastId, `Adding ${totalItems} item${totalItems > 1 ? 's' : ''}...`, totalItems)

    try {
      let successCount = 0
      let errorCount = 0
      let processed = 0

      // First create all directories (including empty ones)
      for (const dir of directories) {
        const destPath = destFolder 
          ? buildFullPath(vaultPath, destFolder + '/' + dir.relativePath)
          : buildFullPath(vaultPath, dir.relativePath)

        log.debug('[Drop]', 'Creating directory', { relativePath: dir.relativePath, destPath })

        // First try to copy the directory (handles non-empty directories)
        const copyResult = await window.electronAPI.copyFile(dir.path, destPath)
        if (copyResult.success) {
          successCount++
        } else {
          // If copy failed, try creating the folder directly (for empty folders)
          const createResult = await window.electronAPI.createFolder(destPath)
          if (createResult.success) {
            successCount++
          } else {
            errorCount++
            log.error('[Drop]', `Failed to create directory ${dir.relativePath}`, { error: createResult.error })
          }
        }
        
        processed++
        const percent = Math.round((processed / totalItems) * 100)
        updateProgressToast(toastId, processed, percent)
      }

      // Then copy all files
      for (const file of fileEntries) {
        const destPath = destFolder 
          ? buildFullPath(vaultPath, destFolder + '/' + file.relativePath)
          : buildFullPath(vaultPath, file.relativePath)

        log.debug('[Drop]', 'Copying file', { relativePath: file.relativePath, destPath })

        const result = await window.electronAPI.copyFile(file.path, destPath)
        if (result.success) {
          successCount++
        } else {
          errorCount++
          log.error('[Drop]', `Failed to copy ${file.relativePath}`, { error: result.error })
        }
        
        processed++
        const percent = Math.round((processed / totalItems) * 100)
        updateProgressToast(toastId, processed, percent)
      }

      removeToast(toastId)
      
      if (errorCount === 0) {
        addToast('success', `Added ${successCount} item${successCount > 1 ? 's' : ''}`)
      } else {
        addToast('warning', `Added ${successCount}, failed ${errorCount}`)
      }

      // Refresh the file list
      setTimeout(() => onRefresh(), 100)

    } catch (err) {
      log.error('[Drag]', 'Error adding files', { error: err })
      removeToast(toastId)
      addToast('error', 'Failed to add files')
    }
  }, [vaultPath, currentFolder, files, addProgressToast, updateProgressToast, removeToast, addToast, setStatusMessage, onRefresh, handleMoveFiles])
  
  return {
    draggedFiles,
    setDraggedFiles,
    isDraggingOver,
    setIsDraggingOver,
    isExternalDrag,
    setIsExternalDrag,
    dragOverFolder,
    setDragOverFolder,
    draggingColumn,
    setDraggingColumn,
    dragOverColumn,
    setDragOverColumn,
    selectionBox,
    setSelectionBox,
    resizingColumn,
    setResizingColumn,
    resetDragState,
    // Drag handlers
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFolderDragOver,
    handleFolderDragLeave,
    handleDropOnFolder,
    canMoveFiles,
  }
}
