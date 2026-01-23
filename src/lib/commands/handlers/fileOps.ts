/**
 * File Operations Commands
 * 
 * Commands: rename, move, copy, new-folder
 * These are registered commands for programmatic use.
 */

import type { Command, RenameParams, MoveParams, CopyParams, NewFolderParams, CommandResult, LocalFile } from '../types'
import { ProgressTracker } from '../executor'
import { updateFilePath, updateFolderPath, syncFolder, updateFolderServerPath } from '../../supabase'
import { getExtension } from '../../utils/path'
import { log } from '@/lib/logger'

/**
 * Rename Command - Rename a file or folder
 */
export const renameCommand: Command<RenameParams> = {
  id: 'rename',
  name: 'Rename',
  description: 'Rename a file or folder',
  aliases: ['ren'],
  usage: 'rename <old-name> <new-name>',
  
  validate({ file, newName }) {
    if (!file) {
      return 'No file selected'
    }
    
    if (!newName || newName.trim() === '') {
      return 'New name cannot be empty'
    }
    
    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*]/
    if (invalidChars.test(newName)) {
      return 'Name contains invalid characters'
    }
    
    return null
  },
  
  async execute({ file, newName }, ctx): Promise<CommandResult> {
    try {
      // Preserve the original file extension if not provided in the new name
      // Only applies to files, not directories
      let finalName = newName
      if (!file.isDirectory) {
        const originalExt = getExtension(file.name)
        const newNameExt = getExtension(newName)
        
        // If original file had an extension but new name doesn't, append the original extension
        if (originalExt && !newNameExt) {
          finalName = newName + originalExt
        }
      }
      
      // Rename locally first
      const oldPath = file.path
      const sep = file.path.includes('\\') ? '\\' : '/'
      const parentDir = oldPath.substring(0, oldPath.lastIndexOf(sep))
      const newPath = `${parentDir}${sep}${finalName}`
      
      // Compute paths for file watcher suppression
      const oldRelPath = file.relativePath
      const relParentDir = oldRelPath.substring(0, oldRelPath.lastIndexOf('/'))
      const newRelPath = relParentDir ? `${relParentDir}/${finalName}` : finalName
      
      // Register expected file changes to suppress file watcher during operation
      ctx.addExpectedFileChanges([oldRelPath, newRelPath])
      
      const renameResult = await window.electronAPI?.renameItem(oldPath, newPath)
      if (!renameResult?.success) {
        return {
          success: false,
          message: renameResult?.error || 'Failed to rename locally',
          total: 1,
          succeeded: 0,
          failed: 1
        }
      }
      
      // For synced files, update server path
      if (file.pdmData?.id) {
        if (file.isDirectory) {
          // Update file paths within the folder
          await updateFolderPath(oldRelPath, newRelPath)
          // Also update the folder record itself if it has one
          try {
            await updateFolderServerPath(file.pdmData.id, newRelPath)
            log.info('[Rename]', 'Updated folder path on server', { oldRelPath, newRelPath })
          } catch (err) {
            log.warn('[Rename]', 'Failed to update folder path on server', { 
              error: err instanceof Error ? err.message : String(err)
            })
          }
        } else {
          await updateFilePath(file.pdmData.id, newRelPath)
        }
      }
      
      // Optimistic UI update: rename in store immediately
      ctx.renameFileInStore(oldPath, newPath, finalName, false)
      
      // Mark operation complete to help suppress file watcher
      ctx.setLastOperationCompletedAt(Date.now())
      
      ctx.addToast('success', `Renamed to ${finalName}`)
      // No onRefresh needed - UI updates instantly via renameFileInStore
      
      return {
        success: true,
        message: `Renamed to ${finalName}`,
        total: 1,
        succeeded: 1,
        failed: 0
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
        total: 1,
        succeeded: 0,
        failed: 1
      }
    }
  }
}

/**
 * Move Command - Move files to a new location
 */
export const moveCommand: Command<MoveParams> = {
  id: 'move',
  name: 'Move',
  description: 'Move files to a new location',
  aliases: ['mv'],
  usage: 'move <source...> <destination>',
  
  validate({ files, targetFolder }) {
    if (!files || files.length === 0) {
      return 'No files selected'
    }
    
    if (targetFolder === undefined) {
      return 'No target folder specified'
    }
    
    return null
  },
  
  async execute({ files, targetFolder }, ctx): Promise<CommandResult> {
    const toastId = `move-${Date.now()}`
    const total = files.length
    const progress = new ProgressTracker(ctx, 'move', toastId, `Moving ${total} file${total > 1 ? 's' : ''}...`, total)
    
    let succeeded = 0
    let failed = 0
    const errors: string[] = []
    
    // Register expected file changes to suppress file watcher during operation
    // Include both source (old) and destination (new) relative paths
    const expectedPaths: string[] = []
    for (const file of files) {
      expectedPaths.push(file.relativePath) // Source path
      const newRelPath = targetFolder ? `${targetFolder}/${file.name}` : file.name
      expectedPaths.push(newRelPath) // Destination path
    }
    ctx.addExpectedFileChanges(expectedPaths)
    
    for (const file of files) {
      try {
        // Move locally
        const sep = file.path.includes('\\') ? '\\' : '/'
        const vaultPath = ctx.vaultPath || ''
        const newPath = targetFolder 
          ? `${vaultPath}${sep}${targetFolder.replace(/\//g, sep)}${sep}${file.name}`
          : `${vaultPath}${sep}${file.name}`
        
        const moveResult = await window.electronAPI?.renameItem(file.path, newPath)
        if (!moveResult?.success) {
          failed++
          errors.push(`${file.name}: ${moveResult?.error || 'Failed to move'}`)
          progress.update()
          continue
        }
        
        // Compute new relative path for store update
        const newRelPath = targetFolder ? `${targetFolder}/${file.name}` : file.name
        
        // Update server if synced
        if (file.pdmData?.id) {
          if (file.isDirectory) {
            // Update file paths within the folder
            await updateFolderPath(file.relativePath, newRelPath)
            // Also update the folder record itself if it has one
            try {
              await updateFolderServerPath(file.pdmData.id, newRelPath)
              log.info('[Move]', 'Updated folder path on server', { 
                oldPath: file.relativePath, 
                newPath: newRelPath 
              })
            } catch (err) {
              log.warn('[Move]', 'Failed to update folder path on server', { 
                error: err instanceof Error ? err.message : String(err)
              })
            }
          } else {
            await updateFilePath(file.pdmData.id, newRelPath)
          }
        }
        
        // Optimistic UI update: update file path in store immediately
        ctx.renameFileInStore(file.path, newPath, newRelPath, true)
        
        succeeded++
      } catch (err) {
        failed++
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
      progress.update()
    }
    
    const { duration } = progress.finish()
    
    // Mark operation complete to help suppress file watcher
    ctx.setLastOperationCompletedAt(Date.now())
    
    if (!ctx.silent) {
      if (failed > 0) {
        ctx.addToast('error', `Moved ${succeeded}/${total} files`)
      } else {
        ctx.addToast('success', `Moved ${succeeded} file${succeeded > 1 ? 's' : ''}`)
      }
    }
    
    // No onRefresh needed - UI updates instantly via renameFileInStore
    
    return {
      success: failed === 0,
      message: failed > 0 ? `Moved ${succeeded}/${total} files` : `Moved ${succeeded} file${succeeded > 1 ? 's' : ''}`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}

/**
 * Generate a unique copy name for a file that already exists.
 * e.g., "file.txt" -> "file - Copy.txt" -> "file - Copy (2).txt" -> etc.
 */
async function generateUniqueCopyName(basePath: string, sep: string): Promise<string> {
  const lastSepIndex = basePath.lastIndexOf(sep)
  const dir = basePath.substring(0, lastSepIndex)
  const filename = basePath.substring(lastSepIndex + 1)
  
  // Split filename into name and extension
  const lastDotIndex = filename.lastIndexOf('.')
  const hasExtension = lastDotIndex > 0
  const name = hasExtension ? filename.substring(0, lastDotIndex) : filename
  const ext = hasExtension ? filename.substring(lastDotIndex) : ''
  
  // Try "name - Copy.ext" first
  let copyName = `${name} - Copy${ext}`
  let copyPath = `${dir}${sep}${copyName}`
  
  const exists = await window.electronAPI?.fileExists(copyPath)
  if (!exists) {
    return copyPath
  }
  
  // Try "name - Copy (N).ext" for N = 2, 3, 4, ...
  let counter = 2
  while (counter < 1000) { // Safety limit
    copyName = `${name} - Copy (${counter})${ext}`
    copyPath = `${dir}${sep}${copyName}`
    
    const copyExists = await window.electronAPI?.fileExists(copyPath)
    if (!copyExists) {
      return copyPath
    }
    counter++
  }
  
  // Fallback: use timestamp
  copyName = `${name} - Copy (${Date.now()})${ext}`
  return `${dir}${sep}${copyName}`
}

/**
 * Copy Command - Copy files to a new location
 */
export const copyCommand: Command<CopyParams> = {
  id: 'copy',
  name: 'Copy',
  description: 'Copy files to a new location',
  aliases: ['cp'],
  usage: 'copy <source...> <destination>',
  
  validate({ files, targetFolder }) {
    if (!files || files.length === 0) {
      return 'No files selected'
    }
    
    if (targetFolder === undefined) {
      return 'No target folder specified'
    }
    
    return null
  },
  
  async execute({ files, targetFolder }, ctx): Promise<CommandResult> {
    const toastId = `copy-${Date.now()}`
    const total = files.length
    const progress = new ProgressTracker(ctx, 'copy', toastId, `Copying ${total} file${total > 1 ? 's' : ''}...`, total)
    
    let succeeded = 0
    let failed = 0
    const errors: string[] = []
    const newFiles: LocalFile[] = []
    
    for (const file of files) {
      try {
        // Copy locally
        const sep = file.path.includes('\\') ? '\\' : '/'
        const vaultPath = ctx.vaultPath || ''
        let destPath = targetFolder 
          ? `${vaultPath}${sep}${targetFolder.replace(/\//g, sep)}${sep}${file.name}`
          : `${vaultPath}${sep}${file.name}`
        
        // Check if source and destination are the same, or if destination already exists
        // If so, generate a unique "Copy" name
        if (file.path === destPath) {
          destPath = await generateUniqueCopyName(destPath, sep)
        } else {
          const destExists = await window.electronAPI?.fileExists(destPath)
          if (destExists) {
            destPath = await generateUniqueCopyName(destPath, sep)
          }
        }
        
        // Compute destination relative path for file watcher suppression
        const destName = destPath.substring(destPath.lastIndexOf(sep) + 1)
        const destRelativePath = targetFolder 
          ? `${targetFolder}/${destName}`
          : destName
        
        // Register expected file change before copy operation
        ctx.addExpectedFileChanges([destRelativePath])
        
        const copyResult = await window.electronAPI?.copyFile(file.path, destPath)
        if (!copyResult?.success) {
          failed++
          errors.push(`${file.name}: ${copyResult?.error || 'Failed to copy'}`)
        } else {
          succeeded++
          
          // Construct LocalFile for optimistic UI update
          const newFile: LocalFile = {
            name: destName,
            path: destPath,
            relativePath: destRelativePath,
            isDirectory: file.isDirectory,
            extension: file.extension,
            size: file.size,
            modifiedTime: new Date().toISOString(),
            // Copied file is local-only (not synced to server)
            isSynced: false,
            diffStatus: 'added'
          }
          newFiles.push(newFile)
        }
      } catch (err) {
        failed++
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
      progress.update()
    }
    
    const { duration } = progress.finish()
    
    // Optimistic UI update: add new files to store immediately
    if (newFiles.length > 0) {
      ctx.addFilesToStore(newFiles)
      // Yield to browser to allow UI to repaint
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    
    // Mark operation complete to help suppress file watcher
    ctx.setLastOperationCompletedAt(Date.now())
    
    if (!ctx.silent) {
      if (failed > 0) {
        ctx.addToast('error', `Copied ${succeeded}/${total} files`)
      } else {
        ctx.addToast('success', `Copied ${succeeded} file${succeeded > 1 ? 's' : ''}`)
      }
    }
    
    // No onRefresh needed - UI updates instantly via addFilesToStore
    
    return {
      success: failed === 0,
      message: failed > 0 ? `Copied ${succeeded}/${total} files` : `Copied ${succeeded} file${succeeded > 1 ? 's' : ''}`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration
    }
  }
}

/**
 * New Folder Command - Create a new folder
 */
export const newFolderCommand: Command<NewFolderParams> = {
  id: 'new-folder',
  name: 'New Folder',
  description: 'Create a new folder',
  aliases: ['mkdir', 'md'],
  usage: 'mkdir <name>',
  
  validate({ folderName }, ctx) {
    if (!folderName || folderName.trim() === '') {
      return 'Folder name cannot be empty'
    }
    
    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*]/
    if (invalidChars.test(folderName)) {
      return 'Folder name contains invalid characters'
    }
    
    if (!ctx.vaultPath) {
      return 'No vault connected'
    }
    
    return null
  },
  
  async execute({ parentPath, folderName }, ctx): Promise<CommandResult> {
    try {
      const vaultPath = ctx.vaultPath!
      const sep = vaultPath.includes('\\') ? '\\' : '/'
      const fullPath = parentPath 
        ? `${vaultPath}${sep}${parentPath.replace(/\//g, sep)}${sep}${folderName}`
        : `${vaultPath}${sep}${folderName}`
      
      // Compute relative path for file watcher suppression
      const relativePath = parentPath ? `${parentPath}/${folderName}` : folderName
      
      // Register expected file changes to suppress file watcher during operation
      ctx.addExpectedFileChanges([relativePath])
      
      const result = await window.electronAPI?.createFolder(fullPath)
      if (!result?.success) {
        return {
          success: false,
          message: result?.error || 'Failed to create folder',
          total: 1,
          succeeded: 0,
          failed: 1
        }
      }
      
      // Sync folder to server immediately (if online and connected)
      let folderPdmData: { id: string; folder_path: string } | undefined
      if (ctx.activeVaultId && ctx.organization?.id && ctx.user?.id && !ctx.isOfflineMode) {
        const { folder, error } = await syncFolder(
          ctx.organization.id,
          ctx.activeVaultId,
          ctx.user.id,
          relativePath
        )
        if (error) {
          // Log warning but don't fail - local folder still created
          log.warn('[NewFolder]', 'Failed to sync folder to server', { 
            relativePath, 
            error: error instanceof Error ? error.message : String(error) 
          })
        } else if (folder) {
          folderPdmData = { id: folder.id, folder_path: folder.folder_path }
          log.info('[NewFolder]', 'Folder synced to server', { relativePath, folderId: folder.id })
        }
      }
      
      // Optimistic UI update: add new folder to store immediately
      const newFolder: LocalFile = {
        name: folderName,
        path: fullPath,
        relativePath,
        isDirectory: true,
        extension: '',
        size: 0,
        modifiedTime: new Date().toISOString(),
        isSynced: !!folderPdmData,
        diffStatus: folderPdmData ? undefined : 'added',
        // Store folder PDM data if synced (uses same pdmData field but with folder-specific shape)
        pdmData: folderPdmData ? { id: folderPdmData.id, folder_path: folderPdmData.folder_path } as any : undefined
      }
      ctx.addFilesToStore([newFolder])
      
      // Yield to browser to allow UI to repaint
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Mark operation complete to help suppress file watcher
      ctx.setLastOperationCompletedAt(Date.now())
      
      ctx.addToast('success', `Created folder: ${folderName}`)
      // No onRefresh needed - UI updates instantly via addFilesToStore
      
      return {
        success: true,
        message: `Created folder: ${folderName}`,
        total: 1,
        succeeded: 1,
        failed: 0
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
        total: 1,
        succeeded: 0,
        failed: 1
      }
    }
  }
}
