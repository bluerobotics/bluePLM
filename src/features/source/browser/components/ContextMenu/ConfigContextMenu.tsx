import { useState, useRef } from 'react'
import { Loader2, Check, Package, Settings, FolderOpen, FolderDown } from 'lucide-react'
import type { ConfigContextMenuState } from '../../hooks/useContextMenuState'
import { ContextSubmenu } from './components'

export interface ConfigContextMenuProps {
  configContextMenu: ConfigContextMenuState
  configCount: number
  isPartOrAsm: boolean
  isExportingConfigs: boolean
  onExportConfigs: (format: 'step' | 'iges' | 'stl', outputFolder?: string) => void
  onClearSelection: () => void
  onClose: () => void
}

type ExportFormat = 'step' | 'iges' | 'stl'

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
  // Track which export submenu is currently open
  const [exportSubmenu, setExportSubmenu] = useState<ExportFormat | null>(null)
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnterExport = (format: ExportFormat) => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current)
    }
    setExportSubmenu(format)
  }

  const handleMouseLeaveExport = () => {
    submenuTimeoutRef.current = setTimeout(() => {
      setExportSubmenu(null)
    }, 150)
  }

  const handleExportHere = (format: ExportFormat) => {
    if (!isExportingConfigs) {
      onExportConfigs(format)
    }
  }

  const handleExportTo = async (format: ExportFormat) => {
    if (isExportingConfigs) return
    
    // Open folder picker dialog
    const result = await window.electronAPI?.selectFolder()
    if (result?.success && result.folderPath) {
      onExportConfigs(format, result.folderPath)
    }
  }

  const formatConfig: Record<ExportFormat, { label: string; colorClass: string }> = {
    step: { label: 'STEP', colorClass: 'text-emerald-400' },
    iges: { label: 'IGES', colorClass: 'text-amber-400' },
    stl: { label: 'STL', colorClass: 'text-violet-400' },
  }

  const renderExportSubmenu = (format: ExportFormat) => {
    const config = formatConfig[format]
    const countLabel = configCount > 1 ? ` (${configCount})` : ''
    
    return (
      <div 
        key={format}
        className={`context-menu-item relative ${isExportingConfigs ? 'opacity-50' : ''}`}
        onMouseEnter={() => handleMouseEnterExport(format)}
        onMouseLeave={handleMouseLeaveExport}
        onClick={(e) => {
          e.stopPropagation()
          setExportSubmenu(exportSubmenu === format ? null : format)
        }}
      >
        {isExportingConfigs ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Package size={14} className={config.colorClass} />
        )}
        Export {config.label}{countLabel}
        <span className="text-xs text-plm-fg-muted ml-auto">▶</span>
        
        {/* Export destination submenu */}
        {exportSubmenu === format && (
          <ContextSubmenu
            minWidth={140}
            onMouseEnter={() => {
              if (submenuTimeoutRef.current) {
                clearTimeout(submenuTimeoutRef.current)
              }
              setExportSubmenu(format)
            }}
            onMouseLeave={handleMouseLeaveExport}
          >
            <div 
              className="context-menu-item"
              onClick={(e) => {
                e.stopPropagation()
                handleExportHere(format)
              }}
            >
              <FolderDown size={14} className={config.colorClass} />
              Export Here
            </div>
            <div 
              className="context-menu-item"
              onClick={(e) => {
                e.stopPropagation()
                handleExportTo(format)
              }}
            >
              <FolderOpen size={14} className="text-plm-fg-muted" />
              Export To...
            </div>
          </ContextSubmenu>
        )}
      </div>
    )
  }

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
            {renderExportSubmenu('step')}
            {renderExportSubmenu('iges')}
            {renderExportSubmenu('stl')}
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
