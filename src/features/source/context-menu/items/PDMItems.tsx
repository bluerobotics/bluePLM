// src/features/source/context-menu/items/PDMItems.tsx
import { ArrowDown, ArrowUp, Undo2, RefreshCw, Network } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { executeCommand, getSyncedFilesFromSelection } from '@/lib/commands'
import { checkOperationPermission, getPermissionRequirement } from '@/lib/permissions'
import { SW_EXTENSIONS, ASSEMBLY_EXTENSIONS } from '../constants'

interface PDMItemsProps {
  files: LocalFile[]
  contextFiles: LocalFile[]
  syncedFilesInSelection: LocalFile[]
  unsyncedFilesInSelection: LocalFile[]
  anySynced: boolean
  anyUnsynced: boolean
  anyCloudOnly: boolean
  allCloudOnly: boolean
  allCheckedOut: boolean
  allCheckedIn: boolean
  checkoutableCount: number
  checkinableCount: number
  discardableCount: number
  allFolders: boolean
  multiSelect: boolean
  countLabel: string
  cloudOnlyCount: number
  userId: string | undefined
  checkForDifferentMachineCheckout: (files: LocalFile[]) => Promise<boolean>
  onClose: () => void
  onRefresh: (silent?: boolean) => void
}

export function PDMItems({
  files,
  contextFiles,
  syncedFilesInSelection,
  unsyncedFilesInSelection,
  anySynced,
  anyUnsynced,
  anyCloudOnly,
  allCloudOnly,
  allCheckedOut,
  allCheckedIn,
  checkoutableCount,
  checkinableCount,
  discardableCount,
  allFolders,
  multiSelect,
  countLabel,
  cloudOnlyCount,
  userId,
  checkForDifferentMachineCheckout,
  onClose,
  onRefresh
}: PDMItemsProps) {
  const { hasPermission, addToast } = usePDMStore()
  
  // Permission checks for operations
  const canCheckout = checkOperationPermission('checkout', hasPermission)
  const canCheckin = checkOperationPermission('checkin', hasPermission)
  const canSync = checkOperationPermission('sync', hasPermission)
  const canDownload = checkOperationPermission('download', hasPermission)
  const canDiscard = checkOperationPermission('discard', hasPermission)
  const canSyncMetadata = checkOperationPermission('sync-metadata', hasPermission)
  const canExtractRefs = checkOperationPermission('extract-references', hasPermission)
  
  const handleCheckout = () => {
    if (!canCheckout.allowed) {
      addToast('error', canCheckout.reason || getPermissionRequirement('checkout'))
      return
    }
    onClose()
    executeCommand('checkout', { files: contextFiles }, { onRefresh })
  }

  const handleCheckin = async () => {
    if (!canCheckin.allowed) {
      addToast('error', canCheckin.reason || getPermissionRequirement('checkin'))
      return
    }
    // Get files that would be checked in
    const syncedFiles = getSyncedFilesFromSelection(files, contextFiles)
    const filesToCheckin = syncedFiles.filter(f => f.pdmData?.checked_out_by === userId)
    
    // Check if any files are checked out on a different machine
    const hasDifferentMachineCheckout = await checkForDifferentMachineCheckout(filesToCheckin)
    if (hasDifferentMachineCheckout) return
    
    onClose()
    executeCommand('checkin', { files: contextFiles }, { onRefresh })
  }

  const handleFirstCheckin = () => {
    if (!canSync.allowed) {
      addToast('error', canSync.reason || getPermissionRequirement('sync'))
      return
    }
    onClose()
    executeCommand('sync', { files: contextFiles }, { onRefresh })
  }

  const handleDownload = () => {
    if (!canDownload.allowed) {
      addToast('error', canDownload.reason || getPermissionRequirement('download'))
      return
    }
    onClose()
    executeCommand('download', { files: contextFiles }, { onRefresh })
  }

  const handleDiscardCheckout = () => {
    if (!canDiscard.allowed) {
      addToast('error', canDiscard.reason || getPermissionRequirement('discard'))
      return
    }
    onClose()
    executeCommand('discard', { files: contextFiles }, { onRefresh })
  }

  const handleSyncMetadata = () => {
    if (!canSyncMetadata.allowed) {
      addToast('error', canSyncMetadata.reason || getPermissionRequirement('sync-metadata'))
      return
    }
    onClose()
    executeCommand('sync-metadata', { files: contextFiles }, { onRefresh })
  }

  const handleExtractReferences = () => {
    if (!canExtractRefs.allowed) {
      addToast('error', canExtractRefs.reason || getPermissionRequirement('extract-references'))
      return
    }
    onClose()
    executeCommand('extract-references', { files: contextFiles }, { onRefresh })
  }

  // Get SolidWorks files checked out by current user (sync-metadata requires checkout)
  const checkedOutSwFiles = syncedFilesInSelection.filter(f => 
    SW_EXTENSIONS.includes(f.extension.toLowerCase()) &&
    f.pdmData?.checked_out_by === userId
  )

  // Get synced assembly files (for BOM/reference extraction)
  const syncedAssemblyFiles = syncedFilesInSelection.filter(f => 
    ASSEMBLY_EXTENSIONS.includes(f.extension.toLowerCase())
  )

  // Determine disabled state and reason for each operation
  const checkoutDisabled = !canCheckout.allowed || !anySynced || allCheckedOut
  const checkoutReason = !canCheckout.allowed 
    ? `Requires ${getPermissionRequirement('checkout')}`
    : !anySynced 
      ? 'Download files first to enable checkout' 
      : allCheckedOut 
        ? 'Already checked out' 
        : ''
  
  const checkinDisabled = !canCheckin.allowed || allCheckedIn || checkinableCount === 0
  const checkinReason = !canCheckin.allowed
    ? `Requires ${getPermissionRequirement('checkin')}`
    : allCheckedIn 
      ? 'Already checked in' 
      : checkinableCount === 0 
        ? 'No files checked out by you' 
        : ''
  
  const syncDisabled = !canSync.allowed
  const syncReason = !canSync.allowed ? `Requires ${getPermissionRequirement('sync')}` : ''
  
  const discardDisabled = !canDiscard.allowed
  const discardReason = !canDiscard.allowed ? `Requires ${getPermissionRequirement('discard')}` : ''

  return (
    <>
      {/* Download - for cloud-only files - show at TOP for cloud folders */}
      {anyCloudOnly && (
        <div 
          className={`context-menu-item ${!canDownload.allowed ? 'disabled' : ''}`}
          onClick={handleDownload}
          title={!canDownload.allowed ? `Requires ${getPermissionRequirement('download')}` : ''}
        >
          <ArrowDown size={14} className={canDownload.allowed ? 'text-plm-success' : 'text-plm-fg-muted'} />
          Download {cloudOnlyCount > 0 ? `${cloudOnlyCount} files` : countLabel}
          {!canDownload.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
        </div>
      )}

      <div className="context-menu-separator" />

      {/* First Check In - for unsynced files */}
      {anyUnsynced && !allCloudOnly && (
        <div 
          className={`context-menu-item ${syncDisabled ? 'disabled' : ''}`}
          onClick={handleFirstCheckin}
          title={syncReason}
        >
          <ArrowUp size={14} className={syncDisabled ? 'text-plm-fg-muted' : 'text-plm-info'} />
          First Check In {unsyncedFilesInSelection.length > 0 ? `${unsyncedFilesInSelection.length} file${unsyncedFilesInSelection.length !== 1 ? 's' : ''}` : countLabel}
          {!canSync.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
        </div>
      )}

      {/* Check Out */}
      <div 
        className={`context-menu-item ${checkoutDisabled ? 'disabled' : ''}`}
        onClick={() => {
          if (checkoutDisabled) return
          handleCheckout()
        }}
        title={checkoutReason}
      >
        <ArrowDown size={14} className={checkoutDisabled ? 'text-plm-fg-muted' : 'text-plm-warning'} />
        Check Out {allFolders && !multiSelect && checkoutableCount > 0 ? `${checkoutableCount} files` : countLabel}
        {!canCheckout.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
        {canCheckout.allowed && !anySynced && <span className="text-xs text-plm-fg-muted ml-auto">(download first)</span>}
        {canCheckout.allowed && anySynced && allCheckedOut && <span className="text-xs text-plm-fg-muted ml-auto">(already out)</span>}
      </div>

      {/* Check In - only for synced files that exist locally (not 'deleted') */}
      {anySynced && (
        <div 
          className={`context-menu-item ${checkinDisabled ? 'disabled' : ''}`}
          onClick={() => {
            if (checkinDisabled) return
            handleCheckin()
          }}
          title={checkinReason}
        >
          <ArrowUp size={14} className={checkinDisabled ? 'text-plm-fg-muted' : 'text-plm-success'} />
          Check In {allFolders && !multiSelect && checkinableCount > 0 ? `${checkinableCount} files` : countLabel}
          {!canCheckin.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
          {canCheckin.allowed && allCheckedIn && <span className="text-xs text-plm-fg-muted ml-auto">(already in)</span>}
        </div>
      )}

      {/* Discard Checkout - for files checked out by current user */}
      {discardableCount > 0 && (
        <div 
          className={`context-menu-item ${discardDisabled ? '' : 'text-plm-warning'} ${discardDisabled ? 'disabled' : ''}`}
          onClick={handleDiscardCheckout}
          title={discardDisabled ? discardReason : 'Discard local changes and revert to server version'}
        >
          <Undo2 size={14} />
          Discard Checkout {discardableCount > 1 ? `(${discardableCount})` : ''}
          {!canDiscard.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
        </div>
      )}

      {/* Sync Metadata - for SW files checked out by current user */}
      {checkedOutSwFiles.length > 0 && (
        <div 
          className={`context-menu-item ${!canSyncMetadata.allowed ? 'disabled' : ''}`}
          onClick={handleSyncMetadata}
          title={!canSyncMetadata.allowed 
            ? `Requires ${getPermissionRequirement('sync-metadata')}`
            : 'Sync metadata between BluePLM and SolidWorks files'
          }
        >
          <RefreshCw size={14} className={canSyncMetadata.allowed ? 'text-plm-accent' : 'text-plm-fg-muted'} />
          Sync Metadata {checkedOutSwFiles.length > 1 ? `(${checkedOutSwFiles.length} files)` : ''}
          {!canSyncMetadata.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
        </div>
      )}

      {/* Extract Assembly References - for synced assembly files */}
      {syncedAssemblyFiles.length > 0 && (
        <div 
          className={`context-menu-item ${!canExtractRefs.allowed ? 'disabled' : ''}`}
          onClick={handleExtractReferences}
          title={!canExtractRefs.allowed 
            ? `Requires ${getPermissionRequirement('extract-references')}`
            : 'Extract and store assembly component references to enable Contains/Where-Used queries'
          }
        >
          <Network size={14} className={canExtractRefs.allowed ? 'text-plm-accent' : 'text-plm-fg-muted'} />
          Extract References {syncedAssemblyFiles.length > 1 ? `(${syncedAssemblyFiles.length} assemblies)` : ''}
          {!canExtractRefs.allowed && <span className="text-xs text-plm-fg-muted ml-auto">(no permission)</span>}
        </div>
      )}
    </>
  )
}
