import { memo, useState } from 'react'
import { Eye, EyeOff, Save, Send, Download, RotateCcw, User } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'

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
 * Context menu for toggling column visibility and managing column defaults
 */
export const ColumnContextMenu = memo(function ColumnContextMenu({
  x,
  y,
  columns,
  getColumnLabel,
  onToggleVisibility,
  onClose
}: ColumnContextMenuProps) {
  const [showPushConfirm, setShowPushConfirm] = useState(false)
  const isAdmin = usePDMStore(s => s.getEffectiveRole()) === 'admin'
  const organization = usePDMStore(s => s.organization)
  const user = usePDMStore(s => s.user)
  const addToast = usePDMStore(s => s.addToast)

  const handleSaveUserDefaults = async () => {
    const result = await usePDMStore.getState().saveUserColumnDefaults()
    if (result.success) {
      addToast('success', 'Saved as your personal defaults')
    } else {
      addToast('error', result.error || 'Failed to save defaults')
    }
    onClose()
  }

  const handleLoadUserDefaults = async () => {
    const result = await usePDMStore.getState().loadUserColumnDefaults()
    if (result.success) {
      addToast('success', 'Loaded your personal defaults')
    } else {
      addToast('error', result.error || 'Failed to load defaults')
    }
    onClose()
  }

  const handleSaveOrgDefaults = async () => {
    const result = await usePDMStore.getState().saveOrgColumnDefaults()
    if (result.success) {
      addToast('success', 'Saved as organization defaults')
    } else {
      addToast('error', result.error || 'Failed to save defaults')
    }
    onClose()
  }

  const handlePushToAll = async () => {
    const result = await usePDMStore.getState().forceOrgColumnDefaults()
    if (result.success) {
      addToast('success', 'Column layout pushed to all users')
    } else {
      addToast('error', result.error || 'Failed to push column layout')
    }
    onClose()
  }

  const handleLoadOrgDefaults = async () => {
    const result = await usePDMStore.getState().loadOrgColumnDefaults()
    if (result.success) {
      addToast('success', 'Loaded organization defaults')
    } else {
      addToast('error', result.error || 'Failed to load defaults')
    }
    onClose()
  }

  const handleResetToDefaults = () => {
    usePDMStore.getState().resetColumnsToDefaults()
    addToast('info', 'Reset to application defaults')
    onClose()
  }

  if (showPushConfirm) {
    return (
      <>
        <div className="fixed inset-0 z-50" onClick={onClose} />
        <div
          className="context-menu w-64"
          style={{ left: x, top: y }}
        >
          <div className="px-3 py-2 text-sm text-plm-fg">
            Override <strong>every user's</strong> column layout with yours?
          </div>
          <div className="flex gap-1.5 px-3 py-2 border-t border-plm-border">
            <button
              onClick={() => setShowPushConfirm(false)}
              className="flex-1 px-2 py-1 text-xs rounded hover:bg-plm-highlight text-plm-fg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handlePushToAll}
              className="flex-1 px-2 py-1 text-xs rounded bg-plm-warning text-white hover:bg-plm-warning/90"
            >
              Push
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div 
        className="fixed inset-0 z-50" 
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
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

        {user && (
          <>
            <div className="border-t border-plm-border my-1" />
            
            <div
              className="context-menu-item"
              onClick={handleSaveUserDefaults}
            >
              <User size={14} className="text-plm-accent" />
              <span>Save as My Defaults</span>
            </div>
            
            <div
              className="context-menu-item"
              onClick={handleLoadUserDefaults}
            >
              <Download size={14} className="text-plm-fg-muted" />
              <span>Load My Defaults</span>
            </div>
          </>
        )}

        {organization && (
          <>
            <div className="border-t border-plm-border my-1" />
            
            {isAdmin && (
              <div
                className="context-menu-item"
                onClick={handleSaveOrgDefaults}
              >
                <Save size={14} className="text-plm-accent" />
                <span>Save as Org Default</span>
              </div>
            )}
            
            {isAdmin && (
              <div
                className="context-menu-item"
                onClick={() => setShowPushConfirm(true)}
              >
                <Send size={14} className="text-plm-warning" />
                <span>Push to All Users</span>
              </div>
            )}
            
            <div
              className="context-menu-item"
              onClick={handleLoadOrgDefaults}
            >
              <Download size={14} className="text-plm-fg-muted" />
              <span>Load Org Defaults</span>
            </div>
            
            <div
              className="context-menu-item"
              onClick={handleResetToDefaults}
            >
              <RotateCcw size={14} className="text-plm-fg-muted" />
              <span>Reset to App Defaults</span>
            </div>
          </>
        )}
      </div>
    </>
  )
})
