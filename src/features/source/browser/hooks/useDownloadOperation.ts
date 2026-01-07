/**
 * Hook for handling file download operations with progress tracking
 */
import { useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { formatBytes, formatSpeed } from '@/lib/utils'

interface UseDownloadOperationDeps {
  organization: { id: string } | null
  onRefresh: (silent?: boolean) => void
}

interface DownloadResult {
  downloaded: number
  failed: number
  wasCancelled: boolean
  totalTime: number
  avgSpeed: string
}

/**
 * Hook for downloading cloud-only files with progress tracking
 */
export function useDownloadOperation({ organization, onRefresh }: UseDownloadOperationDeps) {
  const {
    files,
    addToast,
    addProgressToast,
    updateProgressToast,
    removeToast,
    isProgressToastCancelled,
    addProcessingFolders,
    removeProcessingFolders,
  } = usePDMStore()

  /**
   * Collect all cloud-only files from a selection (including files inside folders)
   */
  const collectCloudOnlyFiles = useCallback((contextFiles: LocalFile[]): {
    filesToDownload: LocalFile[]
    foldersWithCloudFiles: string[]
  } => {
    const filesToDownload: LocalFile[] = []
    const foldersWithCloudFiles: string[] = []
    
    for (const item of contextFiles) {
      if (item.isDirectory) {
        const folderPath = item.relativePath.replace(/\\/g, '/')
        const filesInFolder = files.filter(f => {
          if (f.isDirectory) return false
          if (f.diffStatus !== 'cloud' && f.diffStatus !== 'cloud_new') return false
          const filePath = f.relativePath.replace(/\\/g, '/')
          return filePath.startsWith(folderPath + '/')
        })
        if (filesInFolder.length > 0) {
          filesToDownload.push(...filesInFolder)
          foldersWithCloudFiles.push(item.relativePath)
        }
      } else if (item.diffStatus === 'cloud' || item.diffStatus === 'cloud_new') {
        filesToDownload.push(item)
      }
    }
    
    // Remove duplicates
    const uniqueFiles = [...new Map(filesToDownload.map(f => [f.path, f])).values()]
    
    return { filesToDownload: uniqueFiles, foldersWithCloudFiles }
  }, [files])

  /**
   * Download a single file
   */
  const downloadOneFile = useCallback(async (
    file: LocalFile
  ): Promise<{ success: boolean; size: number }> => {
    if (!file.pdmData?.content_hash || !organization) {
      console.error('Download skip - missing content_hash or org:', file.name)
      return { success: false, size: 0 }
    }
    
    const fileSize = file.pdmData?.file_size || 0
    
    try {
      const { downloadFile } = await import('@/lib/storage')
      const { data: content, error } = await downloadFile(organization.id, file.pdmData.content_hash)
      
      if (error) {
        console.error('Download error for', file.name, ':', error)
        return { success: false, size: 0 }
      }
      
      if (!content) {
        console.error('Download returned no content for', file.name)
        return { success: false, size: 0 }
      }
      
      // Ensure parent directory exists
      const parentDir = file.path.substring(0, file.path.lastIndexOf('\\'))
      await window.electronAPI?.createFolder(parentDir)
      
      // Convert Blob to base64 for IPC transfer
      const arrayBuffer = await content.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
        binary += String.fromCharCode.apply(null, Array.from(chunk))
      }
      const base64 = btoa(binary)
      
      // Write file and check result
      const result = await window.electronAPI?.writeFile(file.path, base64)
      if (!result?.success) {
        console.error('Failed to write file:', file.name, result?.error)
        return { success: false, size: 0 }
      }
      return { success: true, size: fileSize }
    } catch (err) {
      console.error('Failed to download file:', file.name, err)
    }
    return { success: false, size: 0 }
  }, [organization])

  /**
   * Execute a batch download operation with progress tracking
   */
  const executeDownload = useCallback(async (
    contextFiles: LocalFile[]
  ): Promise<DownloadResult> => {
    const { filesToDownload: uniqueFiles, foldersWithCloudFiles } = collectCloudOnlyFiles(contextFiles)
    
    if (uniqueFiles.length === 0) {
      addToast('warning', 'No files to download')
      return { downloaded: 0, failed: 0, wasCancelled: false, totalTime: 0, avgSpeed: '0 B/s' }
    }
    
    // Mark folders as processing
    addProcessingFolders(foldersWithCloudFiles, 'download')
    
    // Yield to event loop so React can render spinners
    await new Promise(resolve => setTimeout(resolve, 0))
    
    const total = uniqueFiles.length
    const totalBytes = uniqueFiles.reduce((sum, f) => sum + (f.pdmData?.file_size || 0), 0)
    const startTime = Date.now()
    
    // Create progress toast
    const toastId = `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const folderName = foldersWithCloudFiles.length > 0 
      ? foldersWithCloudFiles[0].split('/').pop() 
      : `${total} files`
    addProgressToast(toastId, `Downloading ${folderName}...`, totalBytes)
    
    // Progress tracking
    let completedBytes = 0
    let lastUpdateTime = startTime
    let lastUpdateBytes = 0
    
    const updateProgress = () => {
      const now = Date.now()
      const elapsedSinceLastUpdate = (now - lastUpdateTime) / 1000
      const bytesSinceLastUpdate = completedBytes - lastUpdateBytes
      
      const recentSpeed = elapsedSinceLastUpdate > 0 ? bytesSinceLastUpdate / elapsedSinceLastUpdate : 0
      const overallElapsed = (now - startTime) / 1000
      const overallSpeed = overallElapsed > 0 ? completedBytes / overallElapsed : 0
      const displaySpeed = recentSpeed > 0 ? recentSpeed : overallSpeed
      
      const percent = totalBytes > 0 ? Math.round((completedBytes / totalBytes) * 100) : 0
      const label = `${formatBytes(completedBytes)}/${formatBytes(totalBytes)}`
      updateProgressToast(toastId, completedBytes, percent, formatSpeed(displaySpeed), label)
      
      lastUpdateTime = now
      lastUpdateBytes = completedBytes
    }
    
    // Check for cancellation
    let wasCancelled = false
    let downloaded = 0
    let failed = 0
    let downloadedBytes = 0
    
    if (isProgressToastCancelled(toastId)) {
      wasCancelled = true
    } else {
      console.log(`[Download] Starting parallel download of ${total} files`)
      
      // Download all files in parallel
      const results = await Promise.all(uniqueFiles.map(async (f) => {
        const result = await downloadOneFile(f)
        
        if (result.success) {
          completedBytes += result.size
        }
        
        updateProgress()
        return result
      }))
      
      for (const result of results) {
        if (result.success) {
          downloaded++
          downloadedBytes += result.size
        } else {
          failed++
        }
      }
    }
    
    // Cleanup
    removeToast(toastId)
    removeProcessingFolders(foldersWithCloudFiles)
    
    const totalTime = (Date.now() - startTime) / 1000
    const avgSpeed = formatSpeed(downloadedBytes / totalTime)
    
    // Show completion toast
    if (wasCancelled) {
      addToast('warning', 'Download cancelled.')
    } else if (failed > 0) {
      addToast('warning', `Downloaded ${downloaded}/${total} files in ${totalTime.toFixed(1)}s (${avgSpeed}). ${failed} failed.`)
    } else if (downloaded > 0) {
      addToast('success', `Downloaded ${downloaded} file${downloaded > 1 ? 's' : ''} in ${totalTime.toFixed(1)}s (${avgSpeed})`)
    } else {
      addToast('error', 'Failed to download files')
    }
    
    if (downloaded > 0) {
      onRefresh(true)
    }
    
    return { downloaded, failed, wasCancelled, totalTime, avgSpeed }
  }, [collectCloudOnlyFiles, downloadOneFile, addToast, addProgressToast, updateProgressToast, removeToast, isProgressToastCancelled, addProcessingFolders, removeProcessingFolders, onRefresh])

  /**
   * Get count of cloud-only files in selection
   */
  const getCloudOnlyCount = useCallback((contextFiles: LocalFile[]): number => {
    const { filesToDownload } = collectCloudOnlyFiles(contextFiles)
    return filesToDownload.length
  }, [collectCloudOnlyFiles])

  return {
    executeDownload,
    getCloudOnlyCount,
    collectCloudOnlyFiles,
  }
}
