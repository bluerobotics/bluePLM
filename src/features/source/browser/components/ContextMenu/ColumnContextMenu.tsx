import { memo } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export interface ColumnConfig {
  id: string
  label: string
  width: number
  minWidth?: number
  visible: boolean
  sortable: boolean
}

export interface ColumnContextMenuProps {
  x: number
  y: number
  columns: ColumnConfig[]
  getColumnLabel: (columnId: string) => string
  onToggleVisibility: (columnId: string) => void
  onClose: () => void
}

/**
 * Context menu for toggling column visibility
 */
export const ColumnContextMenu = memo(function ColumnContextMenu({
  x,
  y,
  columns,
  getColumnLabel,
  onToggleVisibility,
  onClose
}: ColumnContextMenuProps) {
  return (
    <>
      <div 
        className="fixed inset-0 z-50" 
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          // Allow repositioning on right-click (handled by parent)
        }}
      />
      <div 
        className="context-menu max-h-96 overflow-y-auto"
        style={{ left: x, top: y }}
      >
        <div className="px-3 py-1.5 text-xs text-plm-fg-muted uppercase tracking-wide border-b border-plm-border mb-1">
          Show/Hide Columns
        </div>
        {columns.map(column => (
          <div 
            key={column.id}
            className="context-menu-item"
            onClick={() => onToggleVisibility(column.id)}
          >
            {column.visible ? (
              <Eye size={14} className="text-plm-success" />
            ) : (
              <EyeOff size={14} className="text-plm-fg-muted" />
            )}
            <span className={column.visible ? '' : 'text-plm-fg-muted'}>{getColumnLabel(column.id)}</span>
          </div>
        ))}
      </div>
    </>
  )
})
