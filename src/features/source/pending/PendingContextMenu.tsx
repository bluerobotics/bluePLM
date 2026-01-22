/**
 * Context menu for Pending pane rows
 * Provides file operations appropriate to each row type
 */
import { memo, useEffect, useRef } from 'react'
import { 
  FolderOpen, 
  ExternalLink, 
  Copy, 
  Upload, 
  Trash2, 
  ArrowUp, 
  Undo2, 
  Unlock 
} from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'

// Row types that can appear in the Pending pane
export type PendingRowType = 
  | 'open-file'        // Files currently open in SolidWorks
  | 'selected-item'    // Components selected in SolidWorks
  | 'new-file'         // Unsynced local files
  | 'checked-out-mine' // Files I have checked out
  | 'checked-out-other'// Files checked out by others
  | 'deleted-remote'   // Files deleted from server (orphaned local)

export interface PendingContextMenuProps {
  // Position
  x: number
  y: number
  // File info
  file: LocalFile | null
  filePath: string
  fileName: string
  // Row type determines available actions
  rowType: PendingRowType
  // Admin check for force release
  isAdmin: boolean
  // Handlers
  onClose: () => void
  onOpen: (filePath: string) => void
  onShowInExplorer: (filePath: string) => void
  onCopyPath: (filePath: string) => void
  onCheckIn: (file: LocalFile) => void
  onDelete: (file: LocalFile) => void
  onDiscard: (file: LocalFile) => void
  onReupload: (file: LocalFile) => void
  onForceRelease: (file: LocalFile) => void
}

export const PendingContextMenu = memo(function PendingContextMenu({
  x,
  y,
  file,
  filePath,
  fileName: _fileName, // Used for future enhancements (e.g., menu header)
  rowType,
  isAdmin,
  onClose,
  onOpen,
  onShowInExplorer,
  onCopyPath,
  onCheckIn,
  onDelete,
  onDiscard,
  onReupload,
  onForceRelease,
}: PendingContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Adjust position if menu would go off-screen
  useEffect(() => {
    if (!menuRef.current) return
    
    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    
    // Adjust horizontal position
    if (x + rect.width > viewportWidth - 10) {
      menu.style.left = `${viewportWidth - rect.width - 10}px`
    }
    
    // Adjust vertical position
    if (y + rect.height > viewportHeight - 10) {
      menu.style.top = `${viewportHeight - rect.height - 10}px`
    }
  }, [x, y])
  
  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
  
  // Determine which actions are available based on row type
  const canOpen = true // All rows can open
  const canShowInExplorer = true // All rows can show in explorer
  const canCopyPath = true // All rows can copy path
  const canCheckIn = rowType === 'new-file' || rowType === 'checked-out-mine'
  const canDelete = rowType === 'new-file' || rowType === 'deleted-remote'
  const canDiscard = rowType === 'checked-out-mine'
  const canReupload = rowType === 'deleted-remote'
  const canForceRelease = rowType === 'checked-out-other' && isAdmin
  
  return (
    <>
      {/* Overlay to close menu on click */}
      <div 
        className="fixed inset-0 z-50" 
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      
      {/* Context menu */}
      <div 
        ref={menuRef}
        className="context-menu z-[60]"
        style={{ left: x, top: y }}
      >
        {/* Open file */}
        {canOpen && (
          <button
            className="context-menu-item"
            onClick={() => {
              onOpen(filePath)
              onClose()
            }}
          >
            <ExternalLink size={14} />
            <span>Open</span>
          </button>
        )}
        
        {/* Show in Explorer */}
        {canShowInExplorer && (
          <button
            className="context-menu-item"
            onClick={() => {
              onShowInExplorer(filePath)
              onClose()
            }}
          >
            <FolderOpen size={14} />
            <span>Show in Explorer</span>
          </button>
        )}
        
        {/* Copy path */}
        {canCopyPath && (
          <button
            className="context-menu-item"
            onClick={() => {
              onCopyPath(filePath)
              onClose()
            }}
          >
            <Copy size={14} />
            <span>Copy Path</span>
          </button>
        )}
        
        {/* Separator before PDM actions */}
        {(canCheckIn || canDiscard || canReupload || canForceRelease || canDelete) && (
          <div className="context-menu-separator" />
        )}
        
        {/* Check In (for new files and checked out files) */}
        {canCheckIn && file && (
          <button
            className="context-menu-item"
            onClick={() => {
              onCheckIn(file)
              onClose()
            }}
          >
            {rowType === 'new-file' ? <Upload size={14} /> : <ArrowUp size={14} />}
            <span>Check In</span>
          </button>
        )}
        
        {/* Discard (for checked out files) */}
        {canDiscard && file && (
          <button
            className="context-menu-item text-plm-warning"
            onClick={() => {
              onDiscard(file)
              onClose()
            }}
          >
            <Undo2 size={14} />
            <span>Discard Changes</span>
          </button>
        )}
        
        {/* Re-upload (for deleted remote files) */}
        {canReupload && file && (
          <button
            className="context-menu-item"
            onClick={() => {
              onReupload(file)
              onClose()
            }}
          >
            <Upload size={14} />
            <span>Re-upload to Server</span>
          </button>
        )}
        
        {/* Force Release (admin only, for others' checkouts) */}
        {canForceRelease && file && (
          <button
            className="context-menu-item danger"
            onClick={() => {
              onForceRelease(file)
              onClose()
            }}
          >
            <Unlock size={14} />
            <span>Force Release</span>
          </button>
        )}
        
        {/* Delete (for new files and deleted remote files) */}
        {canDelete && file && (
          <button
            className="context-menu-item danger"
            onClick={() => {
              onDelete(file)
              onClose()
            }}
          >
            <Trash2 size={14} />
            <span>{rowType === 'deleted-remote' ? 'Delete Local' : 'Delete'}</span>
          </button>
        )}
      </div>
    </>
  )
})
