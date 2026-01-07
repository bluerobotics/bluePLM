import { Cloud, HardDrive, ArrowDown, ArrowUp, Plus, Loader2 } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import type { OperationType } from '@/stores/types'
import {
  InlineCheckinButton,
  FolderCheckinButton
} from '@/components/shared/InlineActions'
import type { FolderCheckoutInfo } from './hooks/useFileCardStatus'

export interface FileCardActionsProps {
  file: LocalFile
  isProcessing: boolean
  operationType: OperationType | null
  cloudFilesCount: number
  folderCheckoutInfo: FolderCheckoutInfo | null
  buttonIconSize: number
  spacing: number
  userId: string | undefined
  userAvatarUrl: string | undefined
  userFullName: string | undefined
  userEmail: string | undefined
  onDownload?: (e: React.MouseEvent, file: LocalFile) => void
  onCheckout?: (e: React.MouseEvent, file: LocalFile) => void
  onCheckin?: (e: React.MouseEvent, file: LocalFile) => void
  onUpload?: (e: React.MouseEvent, file: LocalFile) => void
}

/**
 * Action buttons for file cards (download, checkout, checkin, upload)
 */
export function FileCardActions({
  file,
  isProcessing,
  operationType,
  cloudFilesCount,
  folderCheckoutInfo,
  buttonIconSize,
  spacing,
  userId,
  userAvatarUrl,
  userFullName,
  userEmail,
  onDownload,
  onCheckout,
  onCheckin,
  onUpload
}: FileCardActionsProps) {
  // Show spinner for active operation, hide other buttons when processing
  const isDownloading = operationType === 'download'
  const isCheckingOut = operationType === 'checkout'
  const isCheckingIn = operationType === 'checkin'
  const isUploading = operationType === 'upload'
  const isSyncing = operationType === 'sync'

  return (
    <div className="absolute top-1 left-1 flex items-center z-10" style={{ gap: spacing }}>
      {/* Download for cloud files - show spinner when downloading */}
      {(file.diffStatus === 'cloud' || file.diffStatus === 'cloud_new') && !file.isDirectory && onDownload && (!isProcessing || isDownloading) && (
        <button
          className="group/download flex items-center gap-px p-0.5 rounded hover:bg-plm-info/30 transition-colors cursor-pointer"
          onClick={(e) => !isDownloading && onDownload(e, file)}
          title={isDownloading ? 'Downloading...' : 'Download'}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 size={buttonIconSize} className="text-plm-info animate-spin" />
          ) : file.diffStatus === 'cloud_new' ? (
            <Plus size={buttonIconSize} className="text-green-400 group-hover/download:text-plm-info transition-colors duration-200" />
          ) : (
            <Cloud size={buttonIconSize} className="text-plm-info group-hover/download:text-plm-info transition-colors duration-200" />
          )}
          {!isDownloading && (
            <ArrowDown size={buttonIconSize} className="text-plm-info opacity-0 group-hover/download:opacity-100 -ml-1 group-hover/download:ml-0 transition-all duration-200" />
          )}
        </button>
      )}

      {/* Folder download button - show spinner when downloading */}
      {file.isDirectory && (cloudFilesCount > 0 || file.diffStatus === 'cloud') && onDownload && (!isProcessing || isDownloading || isSyncing) && (
        <button
          className="group/folderdownload flex items-center gap-px p-0.5 rounded hover:bg-plm-info/30 transition-colors cursor-pointer"
          onClick={(e) => !(isDownloading || isSyncing) && onDownload(e, file)}
          title={isDownloading || isSyncing ? 'Downloading...' : (cloudFilesCount > 0 ? `Download ${cloudFilesCount} files` : 'Create folder locally')}
          disabled={isDownloading || isSyncing}
        >
          {isDownloading || isSyncing ? (
            <Loader2 size={buttonIconSize} className="text-plm-info animate-spin" />
          ) : (
            <>
              <Cloud size={buttonIconSize} className="text-plm-info" />
              {cloudFilesCount > 0 && (
                <span className="text-[10px] font-medium text-plm-info opacity-0 group-hover/folderdownload:opacity-100 transition-opacity">
                  {cloudFilesCount}
                </span>
              )}
              <ArrowDown size={buttonIconSize} className="text-plm-info opacity-0 group-hover/folderdownload:opacity-100 transition-opacity" />
            </>
          )}
        </button>
      )}

      {/* File check-in button - show spinner when checking in */}
      {!file.isDirectory && file.pdmData?.checked_out_by === userId && file.diffStatus !== 'deleted' && onCheckin && (!isProcessing || isCheckingIn) && (
        <InlineCheckinButton
          onClick={(e) => onCheckin(e, file)}
          isProcessing={isCheckingIn}
          userAvatarUrl={userAvatarUrl}
          userFullName={userFullName}
          userEmail={userEmail}
          title={isCheckingIn ? 'Checking in...' : 'Click to check in'}
        />
      )}

      {/* Folder check-in button - show spinner when checking in */}
      {file.isDirectory && folderCheckoutInfo && folderCheckoutInfo.checkedOutByMe > 0 && onCheckin && (!isProcessing || isCheckingIn) && (
        <FolderCheckinButton
          onClick={(e) => onCheckin(e, file)}
          isProcessing={isCheckingIn}
          users={[{ id: userId || '', name: userFullName || userEmail || '', avatar_url: userAvatarUrl, isMe: true, count: folderCheckoutInfo.checkedOutByMe }]}
          myCheckedOutCount={folderCheckoutInfo.checkedOutByMe}
          totalCheckouts={folderCheckoutInfo.checkedOutByMe}
          title={isCheckingIn ? 'Checking in...' : `Click to check in ${folderCheckoutInfo.checkedOutByMe} file${folderCheckoutInfo.checkedOutByMe > 1 ? 's' : ''}`}
        />
      )}

      {/* File checkout button - show spinner when checking out */}
      {!file.isDirectory && file.pdmData && !file.pdmData.checked_out_by && file.diffStatus !== 'cloud' && file.diffStatus !== 'cloud_new' && file.diffStatus !== 'deleted' && onCheckout && (!isProcessing || isCheckingOut) && (
        <button
          className="group/checkout flex items-center gap-px p-0.5 rounded hover:bg-plm-warning/20 transition-colors cursor-pointer"
          title={isCheckingOut ? 'Checking out...' : 'Click to check out'}
          onClick={(e) => !isCheckingOut && onCheckout(e, file)}
          disabled={isCheckingOut}
        >
          {isCheckingOut ? (
            <Loader2 size={buttonIconSize} className="text-plm-warning animate-spin" />
          ) : (
            <>
              <Cloud size={buttonIconSize} className="text-plm-success group-hover/checkout:text-plm-warning transition-colors duration-200" />
              <ArrowDown size={buttonIconSize} className="text-plm-warning opacity-0 group-hover/checkout:opacity-100 transition-opacity" />
            </>
          )}
        </button>
      )}

      {/* File upload button - show spinner when uploading */}
      {!file.isDirectory && !file.pdmData && file.diffStatus !== 'cloud' && file.diffStatus !== 'cloud_new' && file.diffStatus !== 'ignored' && onUpload && (!isProcessing || isUploading) && (
        <button
          className="group/fileupload flex items-center gap-px p-0.5 rounded hover:bg-plm-info/30 transition-colors cursor-pointer"
          title={isUploading ? 'Uploading...' : 'First Check In'}
          onClick={(e) => !isUploading && onUpload(e, file)}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 size={buttonIconSize} className="text-plm-info animate-spin" />
          ) : (
            <>
              <HardDrive size={buttonIconSize} className="text-plm-fg-muted group-hover/fileupload:text-plm-info transition-colors duration-200" />
              <ArrowUp size={buttonIconSize} className="text-plm-info opacity-0 group-hover/fileupload:opacity-100 transition-opacity" />
            </>
          )}
        </button>
      )}
    </div>
  )
}
