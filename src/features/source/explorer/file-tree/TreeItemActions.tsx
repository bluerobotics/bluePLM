// Inline action buttons for tree items
import { Loader2 } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import type { OperationType, StagedCheckin, ToastType } from '@/stores/types'
import type { User } from '@/types/pdm'
import { getInitials } from '@/lib/utils'
import { 
  InlineCheckoutButton, 
  InlineDownloadButton, 
  InlineUploadButton, 
  InlineSyncButton,
  InlineCheckinButton,
  InlineStageCheckinButton,
  FolderDownloadButton,
  FolderUploadButton,
  FolderCheckinButton
} from '@/components/shared/InlineActions'
import { executeCommand } from '@/lib/commands'
import type { CheckoutUser } from '@/components/shared/FileItem'
import type { FolderDiffCounts } from './types'
import { useTreeHover } from './TreeHoverContext'

interface FileActionButtonsProps {
  file: LocalFile
  operationType: OperationType | null
  onRefresh?: (silent?: boolean) => void
  // Multi-select props
  selectedFiles: string[]
  selectedDownloadableFiles: LocalFile[]
  selectedUploadableFiles: LocalFile[]
  selectedCheckoutableFiles: LocalFile[]
  selectedCheckinableFiles: LocalFile[]
  selectedUpdatableFiles: LocalFile[]
  // Props passed from parent (eliminates store subscriptions)
  user: User | null
  isOfflineMode: boolean
  stageCheckin: (data: StagedCheckin) => void
  unstageCheckin: (path: string) => void
  getStagedCheckin: (path: string) => StagedCheckin | undefined
  addToast: (type: ToastType, message: string) => void
}

/**
 * Inline action buttons for individual files
 * Handles download, upload, checkout, checkin, and offline staging
 */
export function FileActionButtons({
  file,
  operationType,
  onRefresh,
  selectedFiles,
  selectedDownloadableFiles,
  selectedUploadableFiles,
  selectedCheckoutableFiles,
  selectedCheckinableFiles,
  selectedUpdatableFiles,
  user,
  isOfflineMode,
  stageCheckin,
  unstageCheckin,
  getStagedCheckin,
  addToast
}: FileActionButtonsProps) {
  // Get hover refs and setters from context
  // PERFORMANCE: Reading from refs doesn't cause re-renders. The highlight
  // will be correct when the component renders (e.g., scrolling in virtualized list).
  const {
    downloadHoveredRef,
    uploadHoveredRef,
    checkoutHoveredRef,
    checkinHoveredRef,
    updateHoveredRef,
    setIsDownloadHovered,
    setIsUploadHovered,
    setIsCheckoutHovered,
    setIsCheckinHovered,
    setIsUpdateHovered
  } = useTreeHover()
  
  if (file.isDirectory) return null
  
  // Inline action: Download a single file or get latest
  const handleInlineDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    const isMultiSelect = selectedFiles.includes(file.path) && selectedDownloadableFiles.length > 1
    
    if (isMultiSelect) {
      const outdatedFiles = selectedDownloadableFiles.filter(f => f.diffStatus === 'outdated')
      const cloudFiles = selectedDownloadableFiles.filter(f => f.diffStatus === 'cloud')
      
      if (outdatedFiles.length > 0) {
        executeCommand('get-latest', { files: outdatedFiles }, { onRefresh })
      }
      if (cloudFiles.length > 0) {
        executeCommand('download', { files: cloudFiles }, { onRefresh })
      }
      setIsDownloadHovered(false)
      setIsUpdateHovered(false)
      return
    }
    
    if (file.diffStatus === 'outdated') {
      executeCommand('get-latest', { files: [file] }, { onRefresh })
    } else {
      executeCommand('download', { files: [file] }, { onRefresh })
    }
    setIsDownloadHovered(false)
    setIsUpdateHovered(false)
  }
  
  // Inline action: Check out a file
  const handleInlineCheckout = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    const isMultiSelect = selectedFiles.includes(file.path) && selectedCheckoutableFiles.length > 1
    const targetFiles = isMultiSelect ? selectedCheckoutableFiles : [file]
    
    executeCommand('checkout', { files: targetFiles }, { onRefresh })
    setIsCheckoutHovered(false)
  }
  
  // Inline action: Check in a file
  const handleInlineCheckin = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    const isMultiSelect = selectedFiles.includes(file.path) && selectedCheckinableFiles.length > 1
    const targetFiles = isMultiSelect ? selectedCheckinableFiles : [file]
    
    executeCommand('checkin', { files: targetFiles }, { onRefresh })
    setIsCheckinHovered(false)
  }
  
  // Inline action: First check in (upload) a file
  const handleInlineFirstCheckin = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    const isMultiSelect = selectedFiles.includes(file.path) && selectedUploadableFiles.length > 1
    const targetFiles = isMultiSelect ? selectedUploadableFiles : [file]
    
    executeCommand('sync', { files: targetFiles }, { onRefresh })
    setIsUploadHovered(false)
  }
  
  // Stage/unstage a file for check-in (offline mode)
  const handleStageCheckin = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    const existingStaged = getStagedCheckin(file.relativePath)
    
    if (existingStaged) {
      unstageCheckin(file.relativePath)
      addToast('info', `Unstaged "${file.name}" from check-in queue`)
    } else {
      stageCheckin({
        relativePath: file.relativePath,
        fileName: file.name,
        localHash: file.localHash || '',
        stagedAt: new Date().toISOString(),
        serverVersion: file.pdmData?.version,
        serverHash: file.pdmData?.content_hash || undefined
      })
      addToast('success', `Staged "${file.name}" for check-in when online`)
    }
  }
  
  // Show delete spinner when deleting
  if (operationType === 'delete') {
    return <Loader2 size={16} className="text-red-400 animate-spin" />
  }
  
  return (
    <>
      {/* Download for cloud files - only when online */}
      {!isOfflineMode && file.diffStatus === 'cloud' && (
        <InlineDownloadButton
          onClick={handleInlineDownload}
          isProcessing={operationType === 'download'}
          selectedCount={selectedFiles.includes(file.path) && selectedDownloadableFiles.length > 1 ? selectedDownloadableFiles.length : undefined}
          isSelectionHovered={selectedFiles.includes(file.path) && selectedDownloadableFiles.length > 1 && downloadHoveredRef.current}
          onMouseEnter={() => selectedDownloadableFiles.length > 1 && selectedFiles.includes(file.path) && setIsDownloadHovered(true)}
          onMouseLeave={() => setIsDownloadHovered(false)}
        />
      )}
      
      {/* Sync outdated files - only when online */}
      {!isOfflineMode && file.diffStatus === 'outdated' && (
        <InlineSyncButton 
          onClick={handleInlineDownload}
          isProcessing={operationType === 'sync'}
          selectedCount={selectedFiles.includes(file.path) && selectedUpdatableFiles.length > 1 ? selectedUpdatableFiles.length : undefined}
          isSelectionHovered={selectedFiles.includes(file.path) && selectedUpdatableFiles.length > 1 && updateHoveredRef.current}
          onMouseEnter={() => selectedUpdatableFiles.length > 1 && selectedFiles.includes(file.path) && setIsUpdateHovered(true)}
          onMouseLeave={() => setIsUpdateHovered(false)}
        />
      )}
      
      {/* Stage Check-In button (offline mode) */}
      {isOfflineMode && file.diffStatus !== 'cloud' && (() => {
        const isStaged = !!getStagedCheckin(file.relativePath)
        const hasLocalChanges = file.diffStatus === 'added' || file.diffStatus === 'modified'
        if (!hasLocalChanges && !isStaged) return null
        return (
          <InlineStageCheckinButton
            onClick={handleStageCheckin}
            isStaged={isStaged}
            title={isStaged 
              ? 'Click to unstage (keep working on file)' 
              : 'Stage for check-in when online'
            }
          />
        )
      })()}
      
      {/* First Check In for local-only files - only when online */}
      {!isOfflineMode && (!file.pdmData || file.diffStatus === 'added' || file.diffStatus === 'deleted_remote') && file.diffStatus !== 'cloud' && (
        <InlineUploadButton 
          onClick={handleInlineFirstCheckin}
          isProcessing={operationType === 'upload' || operationType === 'sync'}
          selectedCount={selectedFiles.includes(file.path) && selectedUploadableFiles.length > 1 ? selectedUploadableFiles.length : undefined}
          isSelectionHovered={selectedFiles.includes(file.path) && selectedUploadableFiles.length > 1 && uploadHoveredRef.current}
          onMouseEnter={() => selectedUploadableFiles.length > 1 && selectedFiles.includes(file.path) && setIsUploadHovered(true)}
          onMouseLeave={() => setIsUploadHovered(false)}
        />
      )}
      
      {/* Checkout/Checkin buttons for synced files */}
      {(() => {
        const showCheckout = !isOfflineMode && file.pdmData && !file.pdmData.checked_out_by && file.diffStatus !== 'cloud' && file.diffStatus !== 'deleted'
        const showCheckin = !isOfflineMode && file.pdmData?.checked_out_by === user?.id && file.diffStatus !== 'deleted'
        const checkedOutByOther = file.pdmData?.checked_out_by && file.pdmData.checked_out_by !== user?.id
        const checkedOutUser = checkedOutByOther ? (file.pdmData as any)?.checked_out_user : null
        const showOfflineCheckoutIndicator = isOfflineMode && file.pdmData?.checked_out_by === user?.id
        
        if (!showCheckout && !showCheckin && !checkedOutByOther && !showOfflineCheckoutIndicator) return null
        
        return (
          <span className="flex items-center gap-0.5 ml-1">
            {showCheckout && (
              <InlineCheckoutButton 
                onClick={handleInlineCheckout}
                isProcessing={operationType === 'checkout'}
                selectedCount={selectedFiles.includes(file.path) && selectedCheckoutableFiles.length > 1 ? selectedCheckoutableFiles.length : undefined}
                isSelectionHovered={selectedFiles.includes(file.path) && selectedCheckoutableFiles.length > 1 && checkoutHoveredRef.current}
                onMouseEnter={() => selectedCheckoutableFiles.length > 1 && selectedFiles.includes(file.path) && setIsCheckoutHovered(true)}
                onMouseLeave={() => setIsCheckoutHovered(false)}
              />
            )}
            {showCheckin && (
              <InlineCheckinButton
                onClick={handleInlineCheckin}
                isProcessing={operationType === 'checkin'}
                userAvatarUrl={user?.avatar_url ?? undefined}
                userFullName={user?.full_name ?? undefined}
                userEmail={user?.email}
                selectedCount={selectedFiles.includes(file.path) && selectedCheckinableFiles.length > 1 ? selectedCheckinableFiles.length : undefined}
                isSelectionHovered={selectedFiles.includes(file.path) && selectedCheckinableFiles.length > 1 && checkinHoveredRef.current}
                onMouseEnter={() => selectedCheckinableFiles.length > 1 && selectedFiles.includes(file.path) && setIsCheckinHovered(true)}
                onMouseLeave={() => setIsCheckinHovered(false)}
              />
            )}
            {showOfflineCheckoutIndicator && (
              <div 
                className="relative w-5 h-5 flex-shrink-0" 
                title="You have this file checked out (use stage button to queue check-in)"
              >
                {user?.avatar_url ? (
                  <img 
                    src={user.avatar_url} 
                    alt={user?.full_name || user?.email?.split('@')[0] || 'You'}
                    className="w-5 h-5 rounded-full object-cover ring-2 ring-plm-accent"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      target.nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                ) : null}
                <div 
                  className={`w-5 h-5 rounded-full bg-plm-accent/30 text-plm-accent flex items-center justify-center text-[9px] font-medium ring-2 ring-plm-accent ${user?.avatar_url ? 'hidden' : ''}`}
                >
                  {getInitials(user?.full_name || user?.email?.split('@')[0] || 'U')}
                </div>
              </div>
            )}
            {checkedOutByOther && (
              <div 
                className="relative w-5 h-5 flex-shrink-0" 
                title={`Checked out by ${checkedOutUser?.full_name || checkedOutUser?.email?.split('@')[0] || 'Someone'}`}
              >
                {checkedOutUser?.avatar_url ? (
                  <img 
                    src={checkedOutUser.avatar_url} 
                    alt={checkedOutUser?.full_name || checkedOutUser?.email?.split('@')[0] || 'User'}
                    className="w-5 h-5 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      target.nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                ) : null}
                <div 
                  className={`w-5 h-5 rounded-full bg-plm-accent/30 text-plm-accent flex items-center justify-center text-[9px] font-medium absolute inset-0 ${checkedOutUser?.avatar_url ? 'hidden' : ''}`}
                >
                  {getInitials(checkedOutUser?.full_name || checkedOutUser?.email?.split('@')[0] || 'U')}
                </div>
              </div>
            )}
          </span>
        )
      })()}
    </>
  )
}

interface FolderActionButtonsProps {
  file: LocalFile
  diffCounts: FolderDiffCounts | null
  localOnlyCount: number
  checkoutUsers: CheckoutUser[]
  checkedOutByMeCount: number
  totalCheckouts: number
  syncedCount: number
  operationType: OperationType | null
  onRefresh?: (silent?: boolean) => void
  // Props passed from parent (eliminates store subscriptions)
  isOfflineMode: boolean
  // NOTE: allFiles prop removed for O(N) performance optimization.
  // We now use diffCounts (pre-computed) instead of filtering allFiles.
}

/**
 * Inline action buttons for folders
 * Handles batch operations like download all, checkin all, etc.
 * 
 * PERFORMANCE: Uses pre-computed diffCounts instead of filtering allFiles.
 * This reduces per-folder operations from O(N) to O(1) lookups.
 */
export function FolderActionButtons({
  file,
  diffCounts,
  localOnlyCount,
  checkoutUsers,
  checkedOutByMeCount,
  totalCheckouts,
  syncedCount,
  operationType,
  onRefresh,
  isOfflineMode
}: FolderActionButtonsProps) {
  
  if (!file.isDirectory) return null
  
  // Use computed diffCounts.cloud instead of stale folder diffStatus
  // diffCounts.cloud is derived from actual children, so it updates when files are downloaded
  const shouldShow = localOnlyCount > 0 || 
    (diffCounts && (diffCounts.cloud > 0 || diffCounts.outdated > 0)) || 
    checkoutUsers.length > 0 || 
    syncedCount > 0
  
  if (!shouldShow) return null
  
  /**
   * Handle download/get-latest for folder.
   * Uses pre-computed diffCounts to determine which commands to execute.
   * Commands operate on the folder itself - the command system handles
   * finding and processing files within the folder.
   */
  const handleInlineDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    
    // Use pre-computed diffCounts for O(1) lookup instead of O(N) filter
    // diffCounts.cloud is derived from actual children, so it updates when files are downloaded
    const hasOutdated = diffCounts && diffCounts.outdated > 0
    const hasCloud = diffCounts && diffCounts.cloud > 0
    
    if (hasOutdated) {
      executeCommand('get-latest', { files: [file] }, { onRefresh })
    }
    if (hasCloud) {
      executeCommand('download', { files: [file] }, { onRefresh })
    }
  }
  
  const handleInlineCheckout = (e: React.MouseEvent) => {
    e.stopPropagation()
    executeCommand('checkout', { files: [file] }, { onRefresh })
  }
  
  const handleInlineCheckin = (e: React.MouseEvent) => {
    e.stopPropagation()
    executeCommand('checkin', { files: [file] }, { onRefresh })
  }
  
  const handleInlineFirstCheckin = (e: React.MouseEvent) => {
    e.stopPropagation()
    executeCommand('sync', { files: [file] }, { onRefresh })
  }
  
  // Show delete spinner when deleting
  if (operationType === 'delete') {
    return <Loader2 size={16} className="text-red-400 animate-spin ml-auto mr-0.5" />
  }
  
  return (
    <span className="flex items-center gap-1 ml-auto mr-0.5 text-[10px]">
      {/* 1. Update (outdated) - only when online */}
      {!isOfflineMode && diffCounts && diffCounts.outdated > 0 && (
        <InlineSyncButton
          onClick={handleInlineDownload}
          count={diffCounts.outdated}
          isProcessing={operationType === 'sync'}
        />
      )}
      {/* 2. Cloud files to download - only when online */}
      {/* Use computed diffCounts.cloud from children, not stale folder diffStatus */}
      {!isOfflineMode && diffCounts && diffCounts.cloud > 0 && (
        <FolderDownloadButton
          onClick={(e) => handleInlineDownload(e)}
          cloudCount={diffCounts.cloud}
          isProcessing={operationType === 'download'}
        />
      )}
      {/* 3. Avatar checkout (users with check-in button) - only when online */}
      {!isOfflineMode && checkoutUsers.length > 0 && (
        <FolderCheckinButton
          onClick={handleInlineCheckin}
          users={checkoutUsers}
          myCheckedOutCount={checkedOutByMeCount}
          totalCheckouts={totalCheckouts}
          isProcessing={operationType === 'checkin'}
        />
      )}
      {/* 4. Green cloud - synced files ready to checkout - only when online */}
      {!isOfflineMode && syncedCount > 0 && (
        <InlineCheckoutButton
          onClick={handleInlineCheckout}
          count={syncedCount}
          isProcessing={operationType === 'checkout'}
        />
      )}
      {/* 5. Local files - clickable upload button when online only */}
      {!isOfflineMode && localOnlyCount > 0 && (
        <FolderUploadButton
          onClick={handleInlineFirstCheckin}
          localCount={localOnlyCount}
          isProcessing={operationType === 'upload' || operationType === 'sync'}
        />
      )}
    </span>
  )
}
