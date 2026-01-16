/**
 * File system actions for context menu (copy path, show in explorer, pin, rename)
 */
import { Copy, FolderOpen, Pencil, Star } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { copyToClipboard } from '@/lib/clipboard'
import type { ActionComponentProps } from './types'

interface FileSystemActionsProps extends ActionComponentProps {
  platform: string
  startRenaming: (file: LocalFile) => void
  userId: string | undefined
}

export function FileSystemActions({
  contextFiles,
  multiSelect,
  firstFile,
  onClose,
  platform,
  startRenaming,
  userId,
}: FileSystemActionsProps) {
  const {
    activeVaultId,
    connectedVaults,
    pinnedFolders,
    pinFolder,
    unpinFolder,
    addToast,
  } = usePDMStore()

  const allCloudOnly = contextFiles.every(f => f.diffStatus === 'cloud')
  const isFolder = firstFile.isDirectory

  // Don't show for cloud-only files
  if (allCloudOnly) {
    return null
  }

  // Check rename eligibility
  const isSyncedFile = !!firstFile.pdmData
  const isCheckedOutByMe = firstFile.pdmData?.checked_out_by === userId
  const canRename = !isSyncedFile || isCheckedOutByMe

  // Check pin status
  const isPinned = activeVaultId ? pinnedFolders.some(
    p => p.path === firstFile.relativePath && p.vaultId === activeVaultId
  ) : false
  const currentVault = activeVaultId ? connectedVaults.find(v => v.id === activeVaultId) : null

  return (
    <>
      {/* Show in Explorer/Finder */}
      <div 
        className="context-menu-item"
        onClick={() => {
          window.electronAPI?.openInExplorer(firstFile.path)
          onClose()
        }}
      >
        <FolderOpen size={14} />
        {platform === 'darwin' ? 'Reveal in Finder' : 'Show in Explorer'}
      </div>
      
      {/* Copy Path(s) */}
      <div 
        className="context-menu-item"
        onClick={async () => {
          const paths = contextFiles.map(f => f.path).join('\n')
          const result = await copyToClipboard(paths)
          if (result.success) {
            addToast('success', `Copied ${contextFiles.length > 1 ? contextFiles.length + ' paths' : 'path'} to clipboard`)
          }
          onClose()
        }}
      >
        <Copy size={14} />
        Copy Path{multiSelect ? 's' : ''}
      </div>
      
      {/* Copy Folder Path - for files only, copies the directory portion */}
      {!firstFile.isDirectory && !multiSelect && (
        <div 
          className="context-menu-item"
          onClick={async () => {
            // Extract directory path by removing the filename
            const sep = platform === 'win32' ? '\\' : '/'
            const lastSepIndex = firstFile.path.lastIndexOf(sep)
            const folderPath = lastSepIndex > 0 ? firstFile.path.substring(0, lastSepIndex) : firstFile.path
            const result = await copyToClipboard(folderPath)
            if (result.success) {
              addToast('success', 'Copied folder path to clipboard')
            }
            onClose()
          }}
        >
          <Copy size={14} />
          Copy Folder Path
        </div>
      )}
      
      <div className="context-menu-separator" />
      
      {/* Pin/Unpin - single item only */}
      {!multiSelect && activeVaultId && (
        <div 
          className="context-menu-item"
          onClick={() => {
            if (isPinned) {
              unpinFolder(firstFile.relativePath)
              addToast('info', `Unpinned ${firstFile.name}`)
            } else {
              pinFolder(firstFile.relativePath, activeVaultId, currentVault?.name || 'Vault', firstFile.isDirectory)
              addToast('success', `Pinned ${firstFile.name}`)
            }
            onClose()
          }}
        >
          <Star size={14} className={isPinned ? 'fill-plm-warning text-plm-warning' : ''} />
          {isPinned ? 'Unpin' : `Pin ${isFolder ? 'Folder' : 'File'}`}
        </div>
      )}
      
      {/* Rename - single item, not cloud only */}
      {!multiSelect && (
        <div 
          className={`context-menu-item ${!canRename ? 'disabled' : ''}`}
          onClick={() => {
            if (canRename) {
              startRenaming(firstFile)
            }
          }}
          title={!canRename ? 'Check out file first to rename' : ''}
        >
          <Pencil size={14} />
          Rename
          {!canRename && <span className="text-xs text-plm-fg-muted ml-auto">(checkout required)</span>}
        </div>
      )}
    </>
  )
}
