import { Loader2, Check, Package, Settings } from 'lucide-react'
import type { ConfigContextMenuState } from '../../hooks/useContextMenuState'

export interface ConfigContextMenuProps {
  configContextMenu: ConfigContextMenuState
  configCount: number
  isPartOrAsm: boolean
  isExportingConfigs: boolean
  onExportConfigs: (format: 'step' | 'iges' | 'stl') => void
  onClearSelection: () => void
  onClose: () => void
}

/**
 * Context menu for SolidWorks configuration rows.
 * Provides export options and selection management.
 */
export function ConfigContextMenu({
  configContextMenu,
  configCount,
  isPartOrAsm,
  isExportingConfigs,
  onExportConfigs,
  onClearSelection,
  onClose
}: ConfigContextMenuProps) {
  return (
    <>
      {/* Backdrop to close menu */}
      <div 
        className="fixed inset-0 z-50" 
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      
      {/* Menu content */}
      <div 
        className="context-menu z-[60]"
        style={{ left: configContextMenu.x, top: configContextMenu.y }}
      >
        {/* Header showing selection count */}
        <div className="px-3 py-1.5 text-xs text-plm-fg-muted border-b border-plm-border/50 mb-1">
          {configCount > 1 ? (
            <span className="text-cyan-400">{configCount} configurations selected</span>
          ) : (
            <span>Configuration: <span className="text-cyan-400">{configContextMenu.configName}</span></span>
          )}
        </div>
        
        {/* Export options for parts/assemblies */}
        {isPartOrAsm && (
          <>
            <div 
              className={`context-menu-item ${isExportingConfigs ? 'opacity-50' : ''}`}
              onClick={() => !isExportingConfigs && onExportConfigs('step')}
            >
              {isExportingConfigs ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Package size={14} className="text-emerald-400" />
              )}
              Export STEP {configCount > 1 ? `(${configCount})` : ''}
            </div>
            <div 
              className={`context-menu-item ${isExportingConfigs ? 'opacity-50' : ''}`}
              onClick={() => !isExportingConfigs && onExportConfigs('iges')}
            >
              {isExportingConfigs ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Package size={14} className="text-amber-400" />
              )}
              Export IGES {configCount > 1 ? `(${configCount})` : ''}
            </div>
            <div 
              className={`context-menu-item ${isExportingConfigs ? 'opacity-50' : ''}`}
              onClick={() => !isExportingConfigs && onExportConfigs('stl')}
            >
              {isExportingConfigs ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Package size={14} className="text-violet-400" />
              )}
              Export STL {configCount > 1 ? `(${configCount})` : ''}
            </div>
          </>
        )}
        
        {/* Export Options link */}
        <div className="context-menu-separator" />
        <div 
          className="context-menu-item text-plm-fg-muted"
          onClick={() => {
            onClose()
            // Navigate to export settings
            window.dispatchEvent(new CustomEvent('navigate-settings-tab', { detail: 'export' }))
          }}
        >
          <Settings size={14} />
          Export Options...
        </div>
        
        {/* Selection info */}
        {configCount > 1 && (
          <>
            <div className="context-menu-separator" />
            <div 
              className="context-menu-item text-plm-fg-muted"
              onClick={onClearSelection}
            >
              <Check size={14} />
              Clear Selection
            </div>
          </>
        )}
      </div>
    </>
  )
}
