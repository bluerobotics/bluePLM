/**
 * Hook to centralize file status logic
 * Replaces scattered status checks across components
 */
import { useMemo } from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface FileStatus {
  // Sync status
  isCloudOnly: boolean
  isLocalOnly: boolean
  isSynced: boolean
  isOutdated: boolean
  isModified: boolean
  isIgnored: boolean
  isOrphaned: boolean
  
  // Checkout status
  isCheckedOut: boolean
  isCheckedOutByMe: boolean
  isCheckedOutByOthers: boolean
  checkedOutBy: string | null
  
  // Capabilities
  canCheckout: boolean
  canCheckin: boolean
  canUpload: boolean
  canDownload: boolean
  canEdit: boolean
  canRename: boolean
  canDelete: boolean
  canMove: boolean
  
  // State - workflow state name (varies by organization's workflow configuration)
  state: string | null
  isReleased: boolean
  isWip: boolean
  isInReview: boolean
  isObsolete: boolean
}

/**
 * Compute comprehensive file status from a LocalFile
 * 
 * @param file - The file to analyze
 * @param userId - Current user ID for ownership checks
 * @returns FileStatus object with all status flags
 */
export function useFileStatus(file: LocalFile | null, userId?: string): FileStatus {
  return useMemo(() => {
    if (!file) {
      return getDefaultStatus()
    }
    
    const diffStatus = file.diffStatus
    const pdmData = file.pdmData
    const checkedOutBy = pdmData?.checked_out_by ?? null
    
    // Sync status
    const isCloudOnly = diffStatus === 'cloud'
    const isLocalOnly = !pdmData && diffStatus !== 'ignored'
    const isSynced = !!pdmData && !isCloudOnly
    const isOutdated = diffStatus === 'outdated'
    const isModified = diffStatus === 'modified'
    const isIgnored = diffStatus === 'ignored'
    const isOrphaned = diffStatus === 'deleted_remote'
    
    // Checkout status
    const isCheckedOut = !!checkedOutBy
    const isCheckedOutByMe = checkedOutBy === userId
    const isCheckedOutByOthers = isCheckedOut && checkedOutBy !== userId
    
    // State - workflow_state contains the current workflow state object
    const workflowState = pdmData?.workflow_state
    const stateName = workflowState?.name ?? null
    const isReleased = stateName === 'released'
    const isWip = stateName === 'wip'
    const isInReview = stateName === 'in_review'
    const isObsolete = stateName === 'obsolete'
    
    // Capabilities
    const canCheckout = isSynced && !isCloudOnly && !isCheckedOut
    const canCheckin = isCheckedOutByMe && !isCloudOnly
    const canUpload = isLocalOnly || isOrphaned
    const canDownload = isCloudOnly || isOutdated
    const canEdit = isCheckedOutByMe || isLocalOnly
    const canRename = !isSynced || isCheckedOutByMe
    const canDelete = !isCheckedOutByOthers
    const canMove = !isCheckedOutByOthers
    
    return {
      // Sync status
      isCloudOnly,
      isLocalOnly,
      isSynced,
      isOutdated,
      isModified,
      isIgnored,
      isOrphaned,
      
      // Checkout status
      isCheckedOut,
      isCheckedOutByMe,
      isCheckedOutByOthers,
      checkedOutBy,
      
      // Capabilities
      canCheckout,
      canCheckin,
      canUpload,
      canDownload,
      canEdit,
      canRename,
      canDelete,
      canMove,
      
      // State
      state: stateName,
      isReleased,
      isWip,
      isInReview,
      isObsolete,
    }
  }, [file, userId])
}

/**
 * Get file status without React hook (for non-component contexts)
 */
export function getFileStatus(file: LocalFile | null, userId?: string): FileStatus {
  if (!file) {
    return getDefaultStatus()
  }
  
  const diffStatus = file.diffStatus
  const pdmData = file.pdmData
  const checkedOutBy = pdmData?.checked_out_by ?? null
  
  // Sync status
  const isCloudOnly = diffStatus === 'cloud'
  const isLocalOnly = !pdmData && diffStatus !== 'ignored'
  const isSynced = !!pdmData && !isCloudOnly
  const isOutdated = diffStatus === 'outdated'
  const isModified = diffStatus === 'modified'
  const isIgnored = diffStatus === 'ignored'
  const isOrphaned = diffStatus === 'deleted_remote'
  
  // Checkout status
  const isCheckedOut = !!checkedOutBy
  const isCheckedOutByMe = checkedOutBy === userId
  const isCheckedOutByOthers = isCheckedOut && checkedOutBy !== userId
  
  // State - workflow_state contains the current workflow state object
  const workflowState = pdmData?.workflow_state
  const stateName = workflowState?.name ?? null
  const isReleased = stateName === 'released'
  const isWip = stateName === 'wip'
  const isInReview = stateName === 'in_review'
  const isObsolete = stateName === 'obsolete'
  
  // Capabilities
  const canCheckout = isSynced && !isCloudOnly && !isCheckedOut
  const canCheckin = isCheckedOutByMe && !isCloudOnly
  const canUpload = isLocalOnly || isOrphaned
  const canDownload = isCloudOnly || isOutdated
  const canEdit = isCheckedOutByMe || isLocalOnly
  const canRename = !isSynced || isCheckedOutByMe
  const canDelete = !isCheckedOutByOthers
  const canMove = !isCheckedOutByOthers
  
  return {
    // Sync status
    isCloudOnly,
    isLocalOnly,
    isSynced,
    isOutdated,
    isModified,
    isIgnored,
    isOrphaned,
    
    // Checkout status
    isCheckedOut,
    isCheckedOutByMe,
    isCheckedOutByOthers,
    checkedOutBy,
    
    // Capabilities
    canCheckout,
    canCheckin,
    canUpload,
    canDownload,
    canEdit,
    canRename,
    canDelete,
    canMove,
    
    // State
    state: stateName,
    isReleased,
    isWip,
    isInReview,
    isObsolete,
  }
}

function getDefaultStatus(): FileStatus {
  return {
    isCloudOnly: false,
    isLocalOnly: false,
    isSynced: false,
    isOutdated: false,
    isModified: false,
    isIgnored: false,
    isOrphaned: false,
    isCheckedOut: false,
    isCheckedOutByMe: false,
    isCheckedOutByOthers: false,
    checkedOutBy: null,
    canCheckout: false,
    canCheckin: false,
    canUpload: false,
    canDownload: false,
    canEdit: false,
    canRename: false,
    canDelete: false,
    canMove: false,
    state: null,
    isReleased: false,
    isWip: false,
    isInReview: false,
    isObsolete: false,
  }
}

/**
 * Get a human-readable status label for display
 */
export function getStatusLabel(status: FileStatus): string {
  if (status.isCloudOnly) return 'Cloud Only'
  if (status.isLocalOnly) return 'Local Only'
  if (status.isOrphaned) return 'Orphaned'
  if (status.isIgnored) return 'Ignored'
  if (status.isOutdated) return 'Outdated'
  if (status.isModified) return 'Modified'
  if (status.isSynced) return 'Synced'
  return 'Unknown'
}

/**
 * Get the status color class for Tailwind
 */
export function getStatusColorClass(status: FileStatus): string {
  if (status.isCloudOnly) return 'text-plm-info'
  if (status.isLocalOnly) return 'text-plm-warning'
  if (status.isOrphaned) return 'text-plm-error'
  if (status.isIgnored) return 'text-plm-fg-muted'
  if (status.isOutdated) return 'text-plm-warning'
  if (status.isModified) return 'text-plm-success'
  if (status.isSynced) return 'text-plm-fg'
  return 'text-plm-fg-muted'
}
