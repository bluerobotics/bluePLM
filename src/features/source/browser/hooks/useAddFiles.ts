import { useCallback } from 'react'
import { log } from '@/lib/logger'
import type { LocalFile } from '@/stores/pdmStore'
import type { FileConflict, ConflictDialogState } from '../types'
import { buildFullPath } from '@/lib/utils/path'

export interface UseAddFilesOptions {
  vaultPath: string | null
  currentFolder: string
  files: LocalFile[]
  selectedFiles: string[]
  onRefresh: (silent?: boolean) => void
  addToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
  addProgressToast: (id: string, message: string, total: number) => void
  updateProgressToast: (id: string, current: number, percent: number) => void
  removeToast: (id: string) => void
  setStatusMessage: (msg: string) => void
  setConflictDialog: (dialog: ConflictDialogState | null) => void
}

export interface UseAddFilesReturn {
  handleAddFiles: () => Promise<void>
  handleAddFolder: () => Promise<void>
}

/**
 * Hook for adding files and folders via dialog
 */
export function useAddFiles({
  vaultPath,
  currentFolder,
  files,
  selectedFiles,
  onRefresh,
  addToast,
  addProgressToast,
  updateProgressToast,
  removeToast,
  setStatusMessage,
  setConflictDialog
}: UseAddFilesOptions): UseAddFilesReturn {

  // Helper to get unique filename with increment suffix
  const getUniqueFilename = useCallback(async (basePath: string, fileName: string): Promise<string> => {
    if (!window.electronAPI) return fileName
    
    const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''
    const nameWithoutExt = ext ? fileName.slice(0, -ext.length) : fileName
    
    let counter = 1
    let newName = fileName
    let newPath = buildFullPath(basePath, newName)
    
    while (await window.electronAPI.fileExists(newPath)) {
      newName = `${nameWithoutExt} (${counter})${ext}`
      newPath = buildFullPath(basePath, newName)
      counter++
    }
    
    return newName
  }, [])

  // Helper to copy files with conflict resolution
  const copyFilesWithResolution = useCallback(async (
    filesToCopy: Array<{ sourcePath: string; destPath: string; relativePath: string }>,
    resolution: 'overwrite' | 'rename' | 'skip',
    conflicts: Set<string>,
    toastId: string,
    totalFiles: number
  ) => {
    let successCount = 0
    let errorCount = 0
    let skippedCount = 0

    for (let i = 0; i < filesToCopy.length; i++) {
      const file = filesToCopy[i]
      const isConflict = conflicts.has(file.destPath)
      
      if (isConflict && resolution === 'skip') {
        skippedCount++
      } else {
        let finalDestPath = file.destPath
        
        if (isConflict && resolution === 'rename') {
          // Get the directory and filename
          const pathParts = file.destPath.replace(/\\/g, '/').split('/')
          const fileName = pathParts.pop() || ''
          const dirPath = pathParts.join('/')
          const newName = await getUniqueFilename(dirPath, fileName)
          finalDestPath = buildFullPath(dirPath, newName)
        }
        
        const copyResult = await window.electronAPI!.copyFile(file.sourcePath, finalDestPath)
        if (copyResult.success) {
          successCount++
        } else {
          errorCount++
          log.error('[AddFiles]', 'Failed to copy', { error: copyResult.error })
        }
      }
      
      const percent = Math.round(((i + 1) / totalFiles) * 100)
      updateProgressToast(toastId, i + 1, percent)
    }

    return { successCount, errorCount, skippedCount }
  }, [getUniqueFilename, updateProgressToast])

  // Add files via dialog
  const handleAddFiles = useCallback(async () => {
    if (!window.electronAPI || !vaultPath) {
      setStatusMessage('No vault connected')
      return
    }

    const result = await window.electronAPI.selectFiles()
    if (!result.success || !result.files || result.files.length === 0) {
      return // Cancelled or no files selected
    }

    // Determine the target folder - use current folder if set, otherwise vault root
    const selectedFolder = selectedFiles.length === 1 
      ? files.find(f => f.path === selectedFiles[0] && f.isDirectory)
      : null
    const targetFolder = selectedFolder?.relativePath || currentFolder || ''
    
    // Build file list and check for conflicts
    const filesToAdd: Array<{ sourcePath: string; destPath: string; relativePath: string; fileName: string }> = []
    const conflicts: FileConflict[] = []
    const nonConflicts: Array<{ sourcePath: string; destPath: string; relativePath: string }> = []
    
    for (const file of result.files) {
      const fileName = (file as { relativePath?: string; name: string; path: string }).relativePath || file.name
      const targetPath = targetFolder ? `${targetFolder}/${fileName}` : fileName
      const destPath = buildFullPath(vaultPath, targetPath)
      
      filesToAdd.push({ sourcePath: file.path, destPath, relativePath: targetPath, fileName })
      
      // Check if destination exists
      const exists = await window.electronAPI.fileExists(destPath)
      if (exists) {
        conflicts.push({ sourcePath: file.path, destPath, fileName, relativePath: targetPath })
      } else {
        nonConflicts.push({ sourcePath: file.path, destPath, relativePath: targetPath })
      }
    }
    
    // If there are conflicts, show dialog
    if (conflicts.length > 0) {
      setConflictDialog({
        conflicts,
        nonConflicts,
        targetFolder,
        onResolve: async (resolution, _applyToAll) => {
          setConflictDialog(null)
          
          if (resolution === 'skip' && nonConflicts.length === 0) {
            addToast('info', 'All files skipped')
            return
          }
          
          const totalFiles = filesToAdd.length
          const toastId = `add-files-${Date.now()}`
          const folderName = targetFolder ? targetFolder.split('/').pop() || targetFolder : 'vault root'
          addProgressToast(toastId, `Adding files to ${folderName}...`, totalFiles)
          
          try {
            const conflictPaths = new Set(conflicts.map(c => c.destPath))
            const { successCount, errorCount, skippedCount } = await copyFilesWithResolution(
              filesToAdd,
              resolution,
              conflictPaths,
              toastId,
              totalFiles
            )
            
            removeToast(toastId)
            
            if (errorCount === 0 && skippedCount === 0) {
              addToast('success', `Added ${successCount} file${successCount > 1 ? 's' : ''}`)
            } else if (skippedCount > 0) {
              addToast('info', `Added ${successCount}, skipped ${skippedCount}`)
            } else {
              addToast('warning', `Added ${successCount}, failed ${errorCount}`)
            }
            
            setTimeout(() => onRefresh(true), 100)
          } catch (err) {
            log.error('[AddFiles]', 'Error adding files', { error: err })
            removeToast(toastId)
            addToast('error', 'Failed to add files')
          }
        }
      })
      return
    }
    
    // No conflicts, proceed directly
    const totalFiles = result.files.length
    const toastId = `add-files-${Date.now()}`
    const folderName = targetFolder ? targetFolder.split('/').pop() || targetFolder : 'vault root'
    addProgressToast(toastId, `Adding ${totalFiles} file${totalFiles > 1 ? 's' : ''} to ${folderName}...`, totalFiles)

    try {
      let successCount = 0
      let errorCount = 0

      for (let i = 0; i < filesToAdd.length; i++) {
        const file = filesToAdd[i]
        const copyResult = await window.electronAPI.copyFile(file.sourcePath, file.destPath)
        if (copyResult.success) {
          successCount++
        } else {
          errorCount++
          log.error('[AddFiles]', 'Failed to copy', { error: copyResult.error })
        }
        
        const percent = Math.round(((i + 1) / totalFiles) * 100)
        updateProgressToast(toastId, i + 1, percent)
      }

      removeToast(toastId)
      
      if (errorCount === 0) {
        addToast('success', `Added ${successCount} file${successCount > 1 ? 's' : ''}`)
      } else {
        addToast('warning', `Added ${successCount}, failed ${errorCount}`)
      }

      // Refresh the file list (silent = true for background refresh without loading spinner)
      setTimeout(() => onRefresh(true), 100)

    } catch (err) {
      log.error('[AddFiles]', 'Error adding files', { error: err })
      removeToast(toastId)
      addToast('error', 'Failed to add files')
    }
  }, [vaultPath, currentFolder, files, selectedFiles, addToast, addProgressToast, updateProgressToast, removeToast, setStatusMessage, setConflictDialog, copyFilesWithResolution, onRefresh])

  // Add folder via dialog
  const handleAddFolder = useCallback(async () => {
    if (!window.electronAPI || !vaultPath) {
      setStatusMessage('No vault connected')
      return
    }

    const result = await window.electronAPI.selectFolder()
    if (!result.success || !result.files || result.files.length === 0) {
      return // Cancelled or empty folder
    }

    // Determine the target folder - use current folder if set, otherwise vault root
    const selectedFolder = selectedFiles.length === 1 
      ? files.find(f => f.path === selectedFiles[0] && f.isDirectory)
      : null
    const targetFolder = selectedFolder?.relativePath || currentFolder || ''
    const sourceFolderName = result.folderName || 'folder'
    
    // Build file list and check for conflicts
    const filesToAdd: Array<{ sourcePath: string; destPath: string; relativePath: string; fileName: string }> = []
    const conflicts: FileConflict[] = []
    const nonConflicts: Array<{ sourcePath: string; destPath: string; relativePath: string }> = []
    
    for (const file of result.files) {
      const targetPath = targetFolder ? `${targetFolder}/${file.relativePath}` : file.relativePath
      const destPath = buildFullPath(vaultPath, targetPath)
      
      filesToAdd.push({ sourcePath: file.path, destPath, relativePath: targetPath, fileName: file.name })
      
      // Check if destination exists
      const exists = await window.electronAPI.fileExists(destPath)
      if (exists) {
        conflicts.push({ sourcePath: file.path, destPath, fileName: file.name, relativePath: targetPath })
      } else {
        nonConflicts.push({ sourcePath: file.path, destPath, relativePath: targetPath })
      }
    }
    
    // If there are conflicts, show dialog
    if (conflicts.length > 0) {
      setConflictDialog({
        conflicts,
        nonConflicts,
        targetFolder,
        folderName: sourceFolderName,
        onResolve: async (resolution, _applyToAll) => {
          setConflictDialog(null)
          
          if (resolution === 'skip' && nonConflicts.length === 0) {
            addToast('info', 'All files skipped')
            return
          }
          
          const totalFiles = filesToAdd.length
          const toastId = `add-folder-${Date.now()}`
          const destFolderName = targetFolder ? targetFolder.split('/').pop() || targetFolder : 'vault root'
          addProgressToast(toastId, `Adding "${sourceFolderName}" to ${destFolderName}...`, totalFiles)
          
          try {
            const conflictPaths = new Set(conflicts.map(c => c.destPath))
            const { successCount, errorCount, skippedCount } = await copyFilesWithResolution(
              filesToAdd,
              resolution,
              conflictPaths,
              toastId,
              totalFiles
            )
            
            removeToast(toastId)
            
            if (errorCount === 0 && skippedCount === 0) {
              addToast('success', `Added folder "${sourceFolderName}" (${successCount} files)`)
            } else if (skippedCount > 0) {
              addToast('info', `Added ${successCount}, skipped ${skippedCount}`)
            } else {
              addToast('warning', `Added ${successCount}, failed ${errorCount}`)
            }
            
            setTimeout(() => onRefresh(true), 100)
          } catch (err) {
            log.error('[AddFiles]', 'Error adding folder', { error: err })
            removeToast(toastId)
            addToast('error', 'Failed to add folder')
          }
        }
      })
      return
    }
    
    // No conflicts, proceed directly
    const totalFiles = result.files.length
    const toastId = `add-folder-${Date.now()}`
    const destFolderName = targetFolder ? targetFolder.split('/').pop() || targetFolder : 'vault root'
    addProgressToast(toastId, `Adding "${sourceFolderName}" (${totalFiles} file${totalFiles > 1 ? 's' : ''}) to ${destFolderName}...`, totalFiles)

    try {
      let successCount = 0
      let errorCount = 0

      for (let i = 0; i < filesToAdd.length; i++) {
        const file = filesToAdd[i]
        const copyResult = await window.electronAPI.copyFile(file.sourcePath, file.destPath)
        if (copyResult.success) {
          successCount++
        } else {
          errorCount++
          log.error('[AddFiles]', 'Failed to copy', { error: copyResult.error })
        }
        
        const percent = Math.round(((i + 1) / totalFiles) * 100)
        updateProgressToast(toastId, i + 1, percent)
      }

      removeToast(toastId)
      
      if (errorCount === 0) {
        addToast('success', `Added folder "${sourceFolderName}" (${successCount} file${successCount > 1 ? 's' : ''})`)
      } else {
        addToast('warning', `Added ${successCount}, failed ${errorCount}`)
      }

      // Refresh the file list (silent = true for background refresh without loading spinner)
      setTimeout(() => onRefresh(true), 100)

    } catch (err) {
      log.error('[AddFiles]', 'Error adding folder', { error: err })
      removeToast(toastId)
      addToast('error', 'Failed to add folder')
    }
  }, [vaultPath, currentFolder, files, selectedFiles, addToast, addProgressToast, updateProgressToast, removeToast, setStatusMessage, setConflictDialog, copyFilesWithResolution, onRefresh])

  return { handleAddFiles, handleAddFolder }
}
