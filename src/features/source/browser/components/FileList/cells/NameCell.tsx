/**
 * Name column cell renderer - handles file/folder display with icons, buttons, and avatars
 * 
 * Uses both contexts:
 * - useFilePaneContext() for UI state
 * - useFilePaneHandlers() for action handlers
 */
import {
  ChevronDown,
  ChevronRight,
  HardDrive,
  Loader2,
  Save
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { ListRowIcon } from '../ListRowIcon'
import {
  InlineCheckoutButton,
  InlineDownloadButton,
  InlineUploadButton,
  InlineSyncButton,
  InlineCheckinButton,
  FolderDownloadButton,
  FolderUploadButton,
  FolderCheckinButton
} from '@/components/shared/InlineActions'
import type { CheckoutUser } from '../../../types'
import { useFilePaneContext, useFilePaneHandlers } from '../../../context'
import type { CellRendererBaseProps } from './types'

export function NameCell({ file }: CellRendererBaseProps): React.ReactNode {
  // UI state from FilePaneContext
  const {
    listRowSize,
    lowercaseExtensions,
    columns,
    user,
    selectedFiles,
    renamingFile,
    renameValue,
    renameInputRef,
    setRenameValue,
    setRenamingFile,
    expandedConfigFiles,
    loadingConfigs,
    folderMetrics,
    isDownloadHovered,
    setIsDownloadHovered,
    isUploadHovered,
    setIsUploadHovered,
    isCheckoutHovered,
    setIsCheckoutHovered,
    isCheckinHovered,
    setIsCheckinHovered,
    isUpdateHovered,
    setIsUpdateHovered,
  } = useFilePaneContext()

  // Handlers from FilePaneHandlersContext
  const {
    handleRename,
    getProcessingOperation,
    getFolderCheckoutStatus,
    isFolderSynced,
    canHaveConfigs,
    toggleFileConfigExpansion,
    hasPendingConfigChanges,
    savingConfigsToSW,
    saveConfigsToSWFile,
    selectedDownloadableFiles,
    selectedUploadableFiles,
    selectedCheckoutableFiles,
    selectedCheckinableFiles,
    selectedUpdatableFiles,
    handleInlineDownload,
    handleInlineUpload,
    handleInlineCheckout,
    handleInlineCheckin,
  } = useFilePaneHandlers()

  // Get operation type for this file (if any operation is in progress)
  const operationType = getProcessingOperation(file.relativePath, file.isDirectory)

  const isSynced = !!file.pdmData
  const isBeingRenamed = renamingFile?.path === file.path
  
  // Icon size scales with row size, but has a minimum of 16
  const iconSize = Math.max(16, listRowSize - 8)
  
  // Rename mode
  if (isBeingRenamed) {
    const renameIconSize = Math.max(16, listRowSize - 8)
    return (
      <div className="flex items-center gap-2" style={{ minHeight: listRowSize }}>
        <ListRowIcon 
          file={file} 
          size={renameIconSize} 
          folderCheckoutStatus={file.isDirectory ? getFolderCheckoutStatus(file.relativePath) : undefined}
          isFolderSynced={file.isDirectory ? isFolderSynced(file.relativePath) : undefined}
        />
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleRename()
            } else if (e.key === 'Escape') {
              setRenamingFile(null)
              setRenameValue('')
            }
          }}
          onBlur={handleRename}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-plm-bg border border-plm-accent rounded px-2 py-0.5 text-sm text-plm-fg focus:outline-none focus:ring-1 focus:ring-plm-accent"
        />
      </div>
    )
  }
  
  const fileStatusColumnVisible = columns.find(c => c.id === 'fileStatus')?.visible
  
  // Format filename with lowercase extension if setting is on
  const formatFilename = (name: string, ext: string | undefined) => {
    if (!ext || file.isDirectory) return name
    const baseName = name.slice(0, -ext.length)
    const formattedExt = lowercaseExtensions !== false ? ext.toLowerCase() : ext
    return baseName + formattedExt
  }
  const displayFilename = formatFilename(file.name, file.extension)
  
  // Use pre-computed folder metrics (O(1) lookup instead of O(n) iterations)
  const fm = file.isDirectory ? folderMetrics.get(file.relativePath) : null
  const checkoutableFilesCount = fm?.checkoutableFilesCount || 0
  const localOnlyFilesCount = fm?.localOnlyFilesCount || 0
  const cloudFilesCount = fm?.cloudFilesCount || 0
  const myCheckedOutFilesCount = fm?.myCheckedOutFilesCount || 0
  const totalCheckedOutFilesCount = fm?.totalCheckedOutFilesCount || 0
  
  // Get checkout users for avatars (for both files and folders)
  const getCheckoutAvatars = (): CheckoutUser[] => {
    if (file.isDirectory) {
      return fm?.checkoutUsers || []
    } else if (file.pdmData?.checked_out_by) {
      const isMe = file.pdmData.checked_out_by === user?.id
      if (isMe) {
        return []
      } else {
        const checkedOutUser = file.pdmData.checked_out_user
        return [{
          id: file.pdmData.checked_out_by,
          name: checkedOutUser?.full_name || checkedOutUser?.email?.split('@')[0] || 'Someone',
          avatar_url: checkedOutUser?.avatar_url ?? undefined,
          isMe: false
        }]
      }
    }
    return []
  }
  
  const checkoutUsers = getCheckoutAvatars()
  const maxShow = 3
  
  // Check if this file's name should be dimmed (part of multi-select action hover)
  const isNameDimmed = !file.isDirectory && (
    (isDownloadHovered && selectedDownloadableFiles.some(f => f.path === file.path)) ||
    (isUploadHovered && selectedUploadableFiles.some(f => f.path === file.path)) ||
    (isCheckoutHovered && selectedCheckoutableFiles.some(f => f.path === file.path)) ||
    (isCheckinHovered && selectedCheckinableFiles.some(f => f.path === file.path)) ||
    (isUpdateHovered && selectedUpdatableFiles.some(f => f.path === file.path))
  )
  
  const hasConfigs = canHaveConfigs(file)
  const isExpanded = expandedConfigFiles.has(file.path)
  const isLoadingConfigs = loadingConfigs.has(file.path)
  
  return (
    <div className="flex items-center gap-1 group/name" style={{ minHeight: listRowSize }}>
      {/* Expand button for SW files with configurations */}
      {hasConfigs ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFileConfigExpansion(file)
          }}
          className="p-0.5 -ml-1 hover:bg-plm-bg-light/50 rounded transition-colors flex-shrink-0"
          title={isExpanded ? 'Collapse configurations' : 'Expand configurations'}
        >
          {isLoadingConfigs ? (
            <Loader2 size={12} className="animate-spin text-plm-fg-muted" />
          ) : isExpanded ? (
            <ChevronDown size={12} className="text-cyan-400" />
          ) : (
            <ChevronRight size={12} className="text-plm-fg-muted" />
          )}
        </button>
      ) : (
        <span className="w-4 flex-shrink-0" /> 
      )}
      <ListRowIcon 
        file={file} 
        size={iconSize} 
        folderCheckoutStatus={file.isDirectory ? getFolderCheckoutStatus(file.relativePath) : undefined}
        isFolderSynced={file.isDirectory ? isFolderSynced(file.relativePath) : undefined}
      />
      <span className={`truncate flex-1 transition-opacity duration-200 ${isNameDimmed ? 'opacity-50' : ''} ${file.diffStatus === 'cloud' || file.diffStatus === 'cloud_new' ? 'italic text-plm-fg-muted' : ''} ${file.diffStatus === 'cloud_new' ? 'text-green-400' : ''}`}>{displayFilename}</span>
      
      {/* Save metadata badge for SW files with pending config changes */}
      {hasConfigs && hasPendingConfigChanges(file) && file.pdmData?.checked_out_by === user?.id && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            saveConfigsToSWFile(file)
          }}
          disabled={savingConfigsToSW.has(file.path)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded
            bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 
            border border-cyan-500/30 hover:border-cyan-500/50
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors flex-shrink-0 ml-1"
          title="Save pending metadata to SolidWorks file"
        >
          {savingConfigsToSW.has(file.path) ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <Save size={10} />
          )}
          Save metadata
        </button>
      )}
      
      {/* Delete spinner for folders */}
      {file.isDirectory && operationType === 'delete' && (
        <Loader2 size={16} className="text-red-400 animate-spin ml-auto mr-0.5" />
      )}
      
      {/* Folder inline buttons - each button shows independently, only active one shows spinner */}
      {file.isDirectory && operationType !== 'delete' && (checkoutUsers.length > 0 || cloudFilesCount > 0 || file.diffStatus === 'cloud' || checkoutableFilesCount > 0 || localOnlyFilesCount > 0 || (fm?.outdatedFilesCount || 0) > 0) && (
        <span className="flex items-center gap-1 ml-auto mr-0.5 text-[10px]">
          {/* Sync/update button */}
          {(fm?.outdatedFilesCount || 0) > 0 && (
            <InlineSyncButton
              onClick={(e) => handleInlineDownload(e, file)}
              count={fm?.outdatedFilesCount || 0}
              isProcessing={operationType === 'sync'}
            />
          )}
          {/* Download button */}
          {(cloudFilesCount > 0 || file.diffStatus === 'cloud') && (
            <FolderDownloadButton
              onClick={(e) => handleInlineDownload(e, file)}
              cloudCount={cloudFilesCount}
              isProcessing={operationType === 'download'}
            />
          )}
          {/* Checkin button */}
          {checkoutUsers.length > 0 && (
            <FolderCheckinButton
              onClick={(e) => handleInlineCheckin(e, file)}
              users={checkoutUsers}
              myCheckedOutCount={myCheckedOutFilesCount}
              totalCheckouts={totalCheckedOutFilesCount}
              isProcessing={operationType === 'checkin'}
            />
          )}
          {/* Checkout button */}
          {checkoutableFilesCount > 0 && (
            <InlineCheckoutButton
              onClick={(e) => handleInlineCheckout(e, file)}
              count={checkoutableFilesCount}
              isProcessing={operationType === 'checkout'}
            />
          )}
          {/* Upload button */}
          {localOnlyFilesCount > 0 && (
            <FolderUploadButton
              onClick={(e) => handleInlineUpload(e, file)}
              localCount={localOnlyFilesCount}
              isProcessing={operationType === 'upload'}
            />
          )}
        </span>
      )}
      
      {/* Status icon for files without checkout users */}
      {!file.isDirectory && checkoutUsers.length === 0 && !fileStatusColumnVisible && (() => {
        if (file.diffStatus === 'cloud' || file.diffStatus === 'cloud_new') {
          return null
        }
        if (isSynced && !file.pdmData?.checked_out_by) {
          return null
        }
        if (isSynced && file.pdmData?.checked_out_by) {
          return null
        }
        if (file.diffStatus === 'ignored') {
          return <span title="Local only (ignored from sync)"><HardDrive size={12} className="text-plm-fg-muted flex-shrink-0" /></span>
        }
        if (!file.pdmData && file.diffStatus !== 'added') {
          return <span title="Local only - not synced"><HardDrive size={12} className="text-plm-fg-muted flex-shrink-0" /></span>
        }
        return null
      })()}
      
      {/* Delete spinner for files */}
      {!file.isDirectory && operationType === 'delete' && (
        <Loader2 size={16} className="text-red-400 animate-spin" />
      )}
      
      {/* Download for individual cloud files */}
      {!file.isDirectory && operationType !== 'delete' && (file.diffStatus === 'cloud' || file.diffStatus === 'cloud_new') && (
        <InlineDownloadButton
          onClick={(e) => handleInlineDownload(e, file)}
          isCloudNew={file.diffStatus === 'cloud_new'}
          isProcessing={operationType === 'download'}
          selectedCount={selectedFiles.includes(file.path) && selectedDownloadableFiles.length > 1 ? selectedDownloadableFiles.length : undefined}
          isSelectionHovered={selectedFiles.includes(file.path) && selectedDownloadableFiles.length > 1 && isDownloadHovered}
          onMouseEnter={() => selectedDownloadableFiles.length > 1 && selectedFiles.includes(file.path) && setIsDownloadHovered(true)}
          onMouseLeave={() => setIsDownloadHovered(false)}
        />
      )}
      
      {/* Sync outdated files */}
      {!file.isDirectory && operationType !== 'delete' && file.diffStatus === 'outdated' && (
        <InlineSyncButton 
          onClick={(e) => handleInlineDownload(e, file)}
          isProcessing={operationType === 'sync'}
          selectedCount={selectedFiles.includes(file.path) && selectedUpdatableFiles.length > 1 ? selectedUpdatableFiles.length : undefined}
          isSelectionHovered={selectedFiles.includes(file.path) && selectedUpdatableFiles.length > 1 && isUpdateHovered}
          onMouseEnter={() => selectedUpdatableFiles.length > 1 && selectedFiles.includes(file.path) && setIsUpdateHovered(true)}
          onMouseLeave={() => setIsUpdateHovered(false)}
        />
      )}
      
      {/* First Check In - for local only files */}
      {!file.isDirectory && operationType !== 'delete' && !file.pdmData && file.diffStatus !== 'cloud' && file.diffStatus !== 'cloud_new' && file.diffStatus !== 'ignored' && (
        <InlineUploadButton 
          onClick={(e) => handleInlineUpload(e, file)}
          isProcessing={operationType === 'upload'}
          selectedCount={selectedFiles.includes(file.path) && selectedUploadableFiles.length > 1 ? selectedUploadableFiles.length : undefined}
          isSelectionHovered={selectedFiles.includes(file.path) && selectedUploadableFiles.length > 1 && isUploadHovered}
          onMouseEnter={() => selectedUploadableFiles.length > 1 && selectedFiles.includes(file.path) && setIsUploadHovered(true)}
          onMouseLeave={() => setIsUploadHovered(false)}
        />
      )}
      
      {/* Checkout/Checkin buttons for FILES - each shows independently */}
      {!file.isDirectory && operationType !== 'delete' && (
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {file.pdmData && !file.pdmData.checked_out_by && file.diffStatus !== 'cloud' && file.diffStatus !== 'cloud_new' && (
            <InlineCheckoutButton
              onClick={(e) => handleInlineCheckout(e, file)}
              isProcessing={operationType === 'checkout'}
              selectedCount={selectedFiles.includes(file.path) && selectedCheckoutableFiles.length > 1 ? selectedCheckoutableFiles.length : undefined}
              isSelectionHovered={selectedFiles.includes(file.path) && selectedCheckoutableFiles.length > 1 && isCheckoutHovered}
              onMouseEnter={() => selectedCheckoutableFiles.length > 1 && selectedFiles.includes(file.path) && setIsCheckoutHovered(true)}
              onMouseLeave={() => setIsCheckoutHovered(false)}
            />
          )}
          {file.pdmData?.checked_out_by === user?.id && file.diffStatus !== 'deleted' && (
            <InlineCheckinButton
              onClick={(e) => handleInlineCheckin(e, file)}
              isProcessing={operationType === 'checkin'}
              userAvatarUrl={user?.avatar_url ?? undefined}
              userFullName={user?.full_name ?? undefined}
              userEmail={user?.email}
              selectedCount={selectedFiles.includes(file.path) && selectedCheckinableFiles.length > 1 ? selectedCheckinableFiles.length : undefined}
              isSelectionHovered={selectedFiles.includes(file.path) && selectedCheckinableFiles.length > 1 && isCheckinHovered}
              onMouseEnter={() => selectedCheckinableFiles.length > 1 && selectedFiles.includes(file.path) && setIsCheckinHovered(true)}
              onMouseLeave={() => setIsCheckinHovered(false)}
            />
          )}
          {/* Avatar for files checked out by OTHERS */}
          {file.pdmData?.checked_out_by && file.pdmData.checked_out_by !== user?.id && checkoutUsers.filter(u => !u.isMe).length > 0 && (
            <span className="flex items-center flex-shrink-0 -space-x-1.5 ml-0.5" title={checkoutUsers.filter(u => !u.isMe).map(u => u.name).join(', ')}>
              {checkoutUsers.filter(u => !u.isMe).slice(0, maxShow).map((u, i) => (
                <div key={u.id} className="relative" style={{ zIndex: maxShow - i }}>
                  {u.avatar_url ? (
                    <img 
                      src={u.avatar_url} 
                      alt={u.name}
                      className="w-5 h-5 rounded-full bg-plm-bg object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        target.nextElementSibling?.classList.remove('hidden')
                      }}
                    />
                  ) : null}
                  <div 
                    className={`w-5 h-5 rounded-full bg-plm-accent/30 text-plm-accent flex items-center justify-center text-[9px] font-medium ${u.avatar_url ? 'hidden' : ''}`}
                  >
                    {getInitials(u.name)}
                  </div>
                </div>
              ))}
              {checkoutUsers.filter(u => !u.isMe).length > maxShow && (
                <div 
                  className="w-5 h-5 rounded-full bg-plm-bg-light flex items-center justify-center text-[9px] font-medium text-plm-fg-muted"
                  style={{ zIndex: 0 }}
                >
                  +{checkoutUsers.filter(u => !u.isMe).length - maxShow}
                </div>
              )}
            </span>
          )}
        </span>
      )}
    </div>
  )
}
