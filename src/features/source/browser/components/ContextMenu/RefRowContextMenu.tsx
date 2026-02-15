import { Navigation } from 'lucide-react'
import type { RefRowContextMenuState } from '../../hooks/useContextMenuState'

export interface RefRowContextMenuProps {
  refRowContextMenu: RefRowContextMenuState
  onNavigateToFile: () => void
  onClose: () => void
}

/**
 * Context menu for DrawingRefRow and ConfigDrawingRow.
 * Provides a "Navigate to file" action that navigates to the
 * referenced file's folder, selects it, and scrolls it into view.
 */
export function RefRowContextMenu({
  refRowContextMenu,
  onNavigateToFile,
  onClose
}: RefRowContextMenuProps) {
  return (
    <>
      {/* Backdrop to close menu on click */}
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />

      {/* Menu positioned at cursor */}
      <div
        className="context-menu z-[60]"
        style={{ left: refRowContextMenu.x, top: refRowContextMenu.y }}
      >
        <div className="py-1">
          <button
            className="context-menu-item"
            onClick={(e) => {
              e.stopPropagation()
              onNavigateToFile()
              onClose()
            }}
          >
            <Navigation size={14} />
            Navigate to file
          </button>
        </div>
      </div>
    </>
  )
}
