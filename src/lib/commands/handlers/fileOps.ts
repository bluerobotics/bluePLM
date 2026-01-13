/**
 * File Operations Commands
 * 
 * Commands: rename, move, copy, new-folder
 * These are registered commands for programmatic use.
 */

import type { Command, RenameParams, MoveParams, CopyParams, NewFolderParams, CommandResult, LocalFile } from '../types'
import { ProgressTracker } from '../executor'
import { updateFilePath, updateFolderPath } from '../../supabase'

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
      // Rename locally first
      const oldPath = file.path
      const sep = file.path.includes('\\') ? '\\' : '/'
      const parentDir = oldPath.substring(0, oldPath.lastIndexOf(sep))
      const newPath = `${parentDir}${sep}${newName}`
      
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
      
      // Compute new relative path
      const oldRelPath = file.relativePath
      const relParentDir = oldRelPath.substring(0, oldRelPath.lastIndexOf('/'))
      const newRelPath = relParentDir ? `${relParentDir}/${newName}` : newName
      
      // For synced files, update server path
      if (file.pdmData?.id) {
        if (file.isDirectory) {
          await updateFolderPath(oldRelPath, newRelPath)
        } else {
          await updateFilePath(file.pdmData.id, newRelPath)
        }
      }
      
      // Optimistic UI update: rename in store immediately
      ctx.renameFileInStore(oldPath, newPath, newName, false)
      
      ctx.addToast('success', `Renamed to ${newName}`)
      // No onRefresh needed - UI updates instantly via renameFileInStore
      
      return {
        success: true,
        message: `Renamed to ${newName}`,
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
            await updateFolderPath(file.relativePath, newRelPath)
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
        
        const copyResult = await window.electronAPI?.copyFile(file.path, destPath)
        if (!copyResult?.success) {
          failed++
          errors.push(`${file.name}: ${copyResult?.error || 'Failed to copy'}`)
        } else {
          succeeded++
          
          // Construct LocalFile for optimistic UI update
          const destName = destPath.substring(destPath.lastIndexOf(sep) + 1)
          const destRelativePath = targetFolder 
            ? `${targetFolder}/${destName}`
            : destName
          
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
      
      // Optimistic UI update: add new folder to store immediately
      const relativePath = parentPath ? `${parentPath}/${folderName}` : folderName
      const newFolder: LocalFile = {
        name: folderName,
        path: fullPath,
        relativePath,
        isDirectory: true,
        extension: '',
        size: 0,
        modifiedTime: new Date().toISOString(),
        isSynced: false,
        diffStatus: 'added'
      }
      ctx.addFilesToStore([newFolder])
      
      // Yield to browser to allow UI to repaint
      await new Promise(resolve => setTimeout(resolve, 0))
      
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
