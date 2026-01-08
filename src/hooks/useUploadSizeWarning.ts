/**
 * Hook for handling upload size warnings
 * 
 * Checks files against the user's upload size threshold before uploading,
 * and provides state and callbacks for the warning dialog.
 */

import { useCallback } from 'react'
import { usePDMStore, type LocalFile } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'
import type { LargeFile } from '@/components/shared/Dialogs'

/**
 * Check if any files exceed the upload size threshold
 */
export function checkFilesForSizeWarning(
  files: LocalFile[],
  thresholdMB: number,
  enabled: boolean
): { largeFiles: LargeFile[]; smallFiles: LocalFile[] } {
  if (!enabled || thresholdMB <= 0) {
    return { largeFiles: [], smallFiles: files }
  }
  
  const thresholdBytes = thresholdMB * 1024 * 1024
  const largeFiles: LargeFile[] = []
  const smallFiles: LocalFile[] = []
  
  for (const file of files) {
    if (file.isDirectory) {
      // Directories pass through - we only check actual files
      smallFiles.push(file)
      continue
    }
    
    const size = file.size ?? 0
    if (size > thresholdBytes) {
      largeFiles.push({
        name: file.name,
        relativePath: file.relativePath,
        size
      })
    } else {
      smallFiles.push(file)
    }
  }
  
  return { largeFiles, smallFiles }
}

/**
 * Check files and set pending upload if large files detected
 * Returns true if should proceed immediately, false if waiting for user decision
 */
export function checkAndSetPendingUpload(
  files: LocalFile[],
  command: 'sync' | 'checkin',
  options?: { extractReferences?: boolean },
  onRefresh?: (silent?: boolean) => void
): boolean {
  const state = usePDMStore.getState()
  const { uploadSizeWarningEnabled, uploadSizeWarningThreshold, setPendingLargeUpload } = state
  
  // If warning disabled, proceed immediately
  if (!uploadSizeWarningEnabled) {
    return true
  }
  
  const { largeFiles, smallFiles } = checkFilesForSizeWarning(
    files,
    uploadSizeWarningThreshold,
    uploadSizeWarningEnabled
  )
  
  // No large files, proceed immediately
  if (largeFiles.length === 0) {
    return true
  }
  
  // Large files detected, set pending upload for dialog
  setPendingLargeUpload({
    files,
    largeFiles,
    smallFiles,
    command,
    options,
    onRefresh
  })
  
  return false
}

/**
 * Hook for managing upload size warning state from the global store
 */
export function useUploadSizeWarning() {
  const { 
    pendingLargeUpload,
    clearPendingLargeUpload,
    uploadSizeWarningThreshold
  } = usePDMStore()
  
  /**
   * Handle user choosing to upload all files
   */
  const handleUploadAll = useCallback(async () => {
    if (!pendingLargeUpload) return
    
    const { files, command, options, onRefresh } = pendingLargeUpload
    clearPendingLargeUpload()
    
    // Execute the original command with all files
    await executeCommand(command, { files, ...options }, { onRefresh })
  }, [pendingLargeUpload, clearPendingLargeUpload])
  
  /**
   * Handle user choosing to skip large files
   */
  const handleSkipLarge = useCallback(async () => {
    if (!pendingLargeUpload) return
    
    const { smallFiles, command, options, onRefresh } = pendingLargeUpload
    clearPendingLargeUpload()
    
    // Execute the command with only small files
    if (smallFiles.length > 0) {
      await executeCommand(command, { files: smallFiles, ...options }, { onRefresh })
    }
  }, [pendingLargeUpload, clearPendingLargeUpload])
  
  /**
   * Handle user canceling the operation
   */
  const handleCancel = useCallback(() => {
    clearPendingLargeUpload()
  }, [clearPendingLargeUpload])
  
  return {
    pendingUpload: pendingLargeUpload,
    handleUploadAll,
    handleSkipLarge,
    handleCancel,
    thresholdMB: uploadSizeWarningThreshold
  }
}
