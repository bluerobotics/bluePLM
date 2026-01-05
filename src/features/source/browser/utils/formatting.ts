/**
 * Formatting utilities for the file browser
 */

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

/**
 * Format speed to human-readable rate
 */
export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`
  return `${bytesPerSec.toFixed(0)} B/s`
}

/**
 * Format duration in seconds to human-readable time
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`
}

/**
 * Get selection count label for context menus
 */
export function getCountLabel(fileCount: number, folderCount: number): string {
  if (fileCount === 0 && folderCount === 0) return ''
  
  const parts: string[] = []
  if (fileCount > 0) {
    parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`)
  }
  if (folderCount > 0) {
    parts.push(`${folderCount} folder${folderCount > 1 ? 's' : ''}`)
  }
  return `(${parts.join(', ')})`
}
