// src/features/source/context-menu/items/FileOperationItems.tsx
import { ExternalLink, FolderOpen, Edit, FolderPlus } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'
import { usePDMStore } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'

interface FileOperationItemsProps {
  firstFile: LocalFile
  multiSelect: boolean
  isFolder: boolean
  platform: string
  userId: string | undefined
  onRename?: (file: LocalFile) => void
  onNewFolder?: () => void
  onClose: () => void
  onRefresh: (silent?: boolean) => void
}

export function FileOperationItems({
  firstFile,
  multiSelect,
  isFolder,
  platform,
  userId,
  onRename,
  onNewFolder,
  onClose,
  onRefresh
}: FileOperationItemsProps) {
  const { files } = usePDMStore()
  
  const handleOpen = () => {
    onClose()
    executeCommand('open', { file: firstFile }, { onRefresh })
  }

  const handleShowInExplorer = () => {
    onClose()
    executeCommand('show-in-explorer', { path: firstFile.path }, { onRefresh })
  }

  // Check rename permissions
  const isSynced = !!firstFile.pdmData
  const isCheckedOutByMe = firstFile.pdmData?.checked_out_by === userId
  
  // Empty folders don't require checkout to rename - there are no files to protect
  const isEmptyFolder = isFolder && !files.some(f => {
    if (f.isDirectory) return false
    const filePath = f.relativePath.replace(/\\/g, '/')
    const folderPath = firstFile.relativePath.replace(/\\/g, '/')
    return filePath.startsWith(folderPath + '/')
  })
  
  const canRename = !isSynced || isCheckedOutByMe || isEmptyFolder
  
  // Check if the specific file/folder exists locally (not cloud-only)
  // This is different from allCloudOnly which derives folder status from children,
  // causing empty local folders to be incorrectly treated as cloud-only
  const isLocalItem = firstFile.diffStatus !== 'cloud'

  return (
    <>
      {/* Open - only for local files/folders (not cloud-only) */}
      {!multiSelect && isLocalItem && (
        <div className="context-menu-item" onClick={handleOpen}>
          <ExternalLink size={14} />
          {isFolder ? 'Open Folder' : 'Open'}
        </div>
      )}
      
      {/* Show in Explorer/Finder */}
      {isLocalItem && (
        <div className="context-menu-item" onClick={handleShowInExplorer}>
          <FolderOpen size={14} />
          {platform === 'darwin' ? 'Reveal in Finder' : 'Show in Explorer'}
        </div>
      )}
      
      {/* Rename - right after pin */}
      {onRename && !multiSelect && isLocalItem && (
        <div 
          className={`context-menu-item ${!canRename ? 'disabled' : ''}`}
          onClick={() => { 
            if (canRename) {
              onRename(firstFile)
              onClose()
            }
          }}
          title={!canRename ? 'Check out file first to rename' : ''}
        >
          <Edit size={14} />
          Rename
          <span className="text-xs text-plm-fg-muted ml-auto">
            {!canRename ? '(checkout required)' : 'F2'}
          </span>
        </div>
      )}
      
      {/* New Folder */}
      {onNewFolder && isFolder && !multiSelect && isLocalItem && (
        <>
          <div className="context-menu-separator" />
          <div className="context-menu-item" onClick={() => { onNewFolder(); onClose(); }}>
            <FolderPlus size={14} />
            New Folder
          </div>
        </>
      )}
    </>
  )
}
