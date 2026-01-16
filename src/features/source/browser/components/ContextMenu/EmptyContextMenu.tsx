import { memo, type RefObject } from 'react'
import { Folder, Upload, FolderPlus, ClipboardPaste, RefreshCw, Undo2 } from 'lucide-react'
import { SolidWorksContextMenuItems } from '@/features/integrations/solidworks/components'

export interface EmptyContextMenuProps {
  x: number
  y: number
  /** Adjusted position to keep menu within viewport bounds */
  adjustedPos?: { x: number; y: number } | null
  /** Ref for measuring the menu element */
  menuRef?: RefObject<HTMLDivElement | null>
  /** Current folder path (relative to vault) */
  currentPath: string
  /** Vault root path */
  vaultPath: string | null
  hasClipboard: boolean
  hasUndoStack: boolean
  onNewFolder: () => void
  onAddFiles: () => void
  onAddFolder: () => void
  onPaste: () => void
  onRefresh: () => void
  onUndo: () => void
  onClose: () => void
}

/**
 * Context menu shown when right-clicking empty space in the file browser
 */
export const EmptyContextMenu = memo(function EmptyContextMenu({
  x,
  y,
  adjustedPos,
  menuRef,
  currentPath,
  vaultPath,
  hasClipboard,
  hasUndoStack,
  onNewFolder,
  onAddFiles,
  onAddFolder,
  onPaste,
  onRefresh,
  onUndo,
  onClose
}: EmptyContextMenuProps) {
  // Build the full target folder path for SOLIDWORKS file creation
  const targetFolder = vaultPath 
    ? (currentPath ? `${vaultPath}\\${currentPath}` : vaultPath)
    : ''
  
  return (
    <>
      <div 
        className="fixed inset-0 z-50" 
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          // Allow repositioning (handled by parent)
        }}
      />
      <div 
        ref={menuRef}
        className="context-menu"
        style={{ left: adjustedPos?.x ?? x, top: adjustedPos?.y ?? y }}
      >
        <div 
          className="context-menu-item"
          onClick={() => {
            onNewFolder()
            onClose()
          }}
        >
          <Folder size={14} />
          New Folder
        </div>
        <div 
          className="context-menu-item"
          onClick={() => {
            onAddFiles()
            onClose()
          }}
        >
          <Upload size={14} />
          Add Files...
        </div>
        <div 
          className="context-menu-item"
          onClick={() => {
            onAddFolder()
            onClose()
          }}
        >
          <FolderPlus size={14} />
          Add Folder...
        </div>
        <div 
          className={`context-menu-item ${!hasClipboard ? 'disabled' : ''}`}
          onClick={() => {
            if (hasClipboard) {
              onPaste()
            }
            onClose()
          }}
        >
          <ClipboardPaste size={14} />
          Paste
          <span className="text-xs text-plm-fg-muted ml-auto">Ctrl+V</span>
        </div>
        
        {/* SOLIDWORKS New File Items - conditionally rendered based on integration status */}
        {targetFolder && (
          <SolidWorksContextMenuItems
            targetFolder={targetFolder}
            onClose={onClose}
          />
        )}
        
        <div className="context-menu-separator" />
        <div 
          className="context-menu-item"
          onClick={() => {
            onRefresh()
            onClose()
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </div>
        <div className="context-menu-separator" />
        <div 
          className={`context-menu-item ${!hasUndoStack ? 'disabled' : ''}`}
          onClick={() => {
            if (hasUndoStack) {
              onUndo()
            }
            onClose()
          }}
        >
          <Undo2 size={14} />
          Undo
          <span className="text-xs text-plm-fg-muted ml-auto">Ctrl+Z</span>
        </div>
      </div>
    </>
  )
})
