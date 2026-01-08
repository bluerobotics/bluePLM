/**
 * File status utilities for the file browser
 */
import type { LocalFile } from '@/stores/pdmStore'

export type DiffStatus = 
  | 'added' 
  | 'modified' 
  | 'moved' 
  | 'deleted' 
  | 'deleted_remote' 
  | 'outdated' 
  | 'cloud' 
  | 'ignored'
  | 'synced'
  | undefined

/**
 * Get the CSS class for a diff status (for row highlighting)
 */
export function getDiffStatusClass(status: DiffStatus): string {
  switch (status) {
    case 'added':
      return 'diff-added'
    case 'modified':
      return 'diff-modified'
    case 'moved':
      return 'diff-moved'
    case 'deleted':
      return 'diff-deleted'
    case 'deleted_remote':
      return 'diff-deleted-remote'
    case 'outdated':
      return 'diff-outdated'
    case 'cloud':
      return 'diff-cloud'
    case 'ignored':
      return 'diff-ignored'
    default:
      return ''
  }
}

/**
 * Get the ring/background style for card view based on diff status
 */
export function getDiffStatusCardClass(status: DiffStatus): string {
  switch (status) {
    case 'modified':
      return 'ring-1 ring-yellow-500/50 bg-yellow-500/5'
    case 'moved':
      return 'ring-1 ring-blue-500/50 bg-blue-500/5'
    case 'deleted':
      return 'ring-1 ring-red-500/50 bg-red-500/5'
    case 'outdated':
      return 'ring-1 ring-purple-500/50 bg-purple-500/5'
    case 'cloud':
      return 'ring-1 ring-plm-fg-muted/30 bg-plm-fg-muted/5'
    default:
      return ''
  }
}

/**
 * Get a human-readable label for a diff status
 */
export function getDiffStatusLabel(status: DiffStatus): string {
  switch (status) {
    case 'added':
      return 'Local only'
    case 'modified':
      return 'Modified'
    case 'moved':
      return 'Moved'
    case 'deleted':
      return 'Deleted'
    case 'deleted_remote':
      return 'Deleted from server'
    case 'outdated':
      return 'Outdated'
    case 'cloud':
      return 'Cloud only'
    case 'ignored':
      return 'Ignored'
    case 'synced':
      return 'Synced'
    default:
      return ''
  }
}

/**
 * Get the color for a diff status
 */
export function getDiffStatusColor(status: DiffStatus): string {
  switch (status) {
    case 'added':
      return '#9ca3af' // gray
    case 'modified':
      return '#facc15' // yellow
    case 'moved':
      return '#3b82f6' // blue
    case 'deleted':
      return '#ef4444' // red
    case 'deleted_remote':
      return '#ef4444' // red
    case 'outdated':
      return '#a855f7' // purple
    case 'cloud':
      return '#6b7280' // gray
    case 'ignored':
      return '#6b7280' // gray
    case 'synced':
      return '#22c55e' // green
    default:
      return '#6b7280' // gray
  }
}

/**
 * Check if a file is synced (exists on server and locally with no changes)
 */
export function isFileSynced(file: LocalFile): boolean {
  // A file is synced if it has pdmData and no diffStatus (or diffStatus is undefined)
  return !!(file.pdmData && !file.diffStatus)
}

/**
 * Check if a file exists only in the cloud (not downloaded)
 */
export function isCloudOnly(file: LocalFile): boolean {
  return file.diffStatus === 'cloud'
}

/**
 * Check if a file is local only (not synced to server)
 */
export function isLocalOnly(file: LocalFile): boolean {
  return file.diffStatus === 'added' || (!file.pdmData && file.diffStatus !== 'cloud')
}

/**
 * Check if a file has local modifications
 */
export function hasLocalModifications(file: LocalFile): boolean {
  return file.diffStatus === 'modified'
}

/**
 * Check if a file is outdated (server has newer version)
 */
export function isOutdated(file: LocalFile): boolean {
  return file.diffStatus === 'outdated'
}

/**
 * Check if a file is checked out by the current user
 */
export function isCheckedOutByMe(file: LocalFile, userId: string | undefined): boolean {
  return !!(userId && file.pdmData?.checked_out_by === userId)
}

/**
 * Check if a file is checked out by someone else
 */
export function isCheckedOutByOthers(file: LocalFile, userId: string | undefined): boolean {
  const checkedOutBy = file.pdmData?.checked_out_by
  return !!(checkedOutBy && checkedOutBy !== userId)
}

/**
 * Get the checkout status for a file relative to the current user
 */
export function getCheckoutStatus(
  file: LocalFile,
  userId: string | undefined
): 'mine' | 'others' | 'none' {
  if (!file.pdmData?.checked_out_by) return 'none'
  return file.pdmData.checked_out_by === userId ? 'mine' : 'others'
}

/**
 * Get folder checkout status based on contained files
 */
export function getFolderCheckoutStatus(
  folderPath: string,
  files: LocalFile[],
  userId: string | undefined
): 'mine' | 'others' | 'both' | null {
  const folderPrefix = folderPath + '/'
  const serverOnlyStatuses = ['cloud', 'deleted']
  
  const folderFiles = files.filter(f => {
    if (f.isDirectory) return false
    if (serverOnlyStatuses.includes(f.diffStatus || '')) return false
    return f.relativePath.replace(/\\/g, '/').startsWith(folderPrefix)
  })
  
  const hasMyCheckouts = folderFiles.some(f => f.pdmData?.checked_out_by === userId)
  const hasOthersCheckouts = folderFiles.some(f => 
    f.pdmData?.checked_out_by && f.pdmData.checked_out_by !== userId
  )
  
  if (hasMyCheckouts && hasOthersCheckouts) return 'both'
  if (hasOthersCheckouts) return 'others'
  if (hasMyCheckouts) return 'mine'
  return null
}

/**
 * Check if a folder is fully synced (all files synced)
 */
export function isFolderSynced(
  folderPath: string,
  files: LocalFile[]
): boolean {
  const folderPrefix = folderPath + '/'
  
  const folderFiles = files.filter(f => {
    if (f.isDirectory) return false
    return f.relativePath.replace(/\\/g, '/').startsWith(folderPrefix)
  })
  
  // No files means synced (empty folder)
  if (folderFiles.length === 0) return true
  
  // Check if any files are not synced
  return folderFiles.every(f => isFileSynced(f))
}
