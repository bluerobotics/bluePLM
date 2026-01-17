import React, { memo } from 'react'
import { Layers, FileInput, ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import type { ConfigWithDepth } from '../../types'

export interface ConfigRowProps {
  config: ConfigWithDepth
  isSelected: boolean
  isEditable: boolean
  rowHeight: number
  visibleColumns: { id: string; width: number }[]
  basePartNumber: string
  /** Configuration-specific revision (from drawing propagation) */
  configRevision?: string
  /** Whether this config can be expanded to show BOM (only for assemblies) */
  isExpandable?: boolean
  /** Whether the BOM section is currently expanded */
  isBomExpanded?: boolean
  /** Whether the BOM is currently loading */
  isBomLoading?: boolean
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onDescriptionChange: (value: string) => void
  onTabChange: (value: string) => void
  /** Handler for toggling BOM expansion */
  onToggleBom?: (e: React.MouseEvent) => void
}

/**
 * Custom comparison function for ConfigRow memoization.
 * Compares props that affect rendering, skipping callback functions.
 */
function areConfigRowPropsEqual(
  prevProps: ConfigRowProps,
  nextProps: ConfigRowProps
): boolean {
  // Compare config identity and key properties
  if (prevProps.config.name !== nextProps.config.name) return false
  if (prevProps.config.depth !== nextProps.config.depth) return false
  if (prevProps.config.description !== nextProps.config.description) return false
  if (prevProps.config.tabNumber !== nextProps.config.tabNumber) return false
  if (prevProps.config.isActive !== nextProps.config.isActive) return false
  
  // Compare primitive props
  if (prevProps.isSelected !== nextProps.isSelected) return false
  if (prevProps.isEditable !== nextProps.isEditable) return false
  if (prevProps.rowHeight !== nextProps.rowHeight) return false
  if (prevProps.basePartNumber !== nextProps.basePartNumber) return false
  if (prevProps.configRevision !== nextProps.configRevision) return false
  if (prevProps.isExpandable !== nextProps.isExpandable) return false
  if (prevProps.isBomExpanded !== nextProps.isBomExpanded) return false
  if (prevProps.isBomLoading !== nextProps.isBomLoading) return false
  
  // Compare visibleColumns array (shallow check on length and ids)
  if (prevProps.visibleColumns.length !== nextProps.visibleColumns.length) return false
  for (let i = 0; i < prevProps.visibleColumns.length; i++) {
    if (prevProps.visibleColumns[i].id !== nextProps.visibleColumns[i].id) return false
    if (prevProps.visibleColumns[i].width !== nextProps.visibleColumns[i].width) return false
  }
  
  return true
}

export const ConfigRow = memo(function ConfigRow({
  config,
  isSelected,
  isEditable,
  rowHeight,
  visibleColumns,
  basePartNumber,
  configRevision,
  isExpandable,
  isBomExpanded,
  isBomLoading,
  onClick,
  onContextMenu,
  onDescriptionChange,
  onTabChange,
  onToggleBom,
}: ConfigRowProps) {
  return (
    <tr
      className={`config-row cursor-pointer ${isSelected ? 'selected' : ''}`}
      style={{ height: rowHeight }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {visibleColumns.map(column => (
        <td key={column.id} style={{ width: column.width }}>
          {column.id === 'name' ? (
            <div 
              className="flex items-center gap-1" 
              style={{ 
                minHeight: rowHeight - 8,
                paddingLeft: `${24 + (config.depth * 16)}px`
              }}
            >
              {/* BOM expansion toggle for assemblies */}
              {isExpandable ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleBom?.(e)
                  }}
                  className="p-0.5 -ml-1 hover:bg-plm-bg-light rounded transition-colors"
                  title={isBomExpanded ? 'Collapse BOM' : 'Expand BOM'}
                >
                  {isBomLoading ? (
                    <Loader2 size={10} className="text-plm-fg-muted animate-spin" />
                  ) : isBomExpanded ? (
                    <ChevronDown size={10} className="text-plm-fg-muted" />
                  ) : (
                    <ChevronRight size={10} className="text-plm-fg-muted" />
                  )}
                </button>
              ) : (
                <span className="text-plm-fg-dim text-[10px]">{config.depth > 0 ? '└' : '○'}</span>
              )}
              <Layers size={12} className={`flex-shrink-0 ${isSelected ? 'text-cyan-400' : config.depth > 0 ? 'text-amber-400/40' : 'text-amber-400/60'}`} />
              <span className={`truncate text-sm ${isSelected ? 'text-cyan-300' : config.depth > 0 ? 'text-plm-fg-dim' : 'text-plm-fg-muted'}`}>{config.name}</span>
              {config.isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" title="Active configuration" />
              )}
            </div>
          ) : column.id === 'description' ? (
            <input
              type="text"
              value={config.description || ''}
              onChange={(e) => onDescriptionChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              disabled={!isEditable}
              placeholder="Description"
              className={`w-full px-1.5 py-0.5 text-xs rounded border transition-colors bg-transparent
                ${isEditable 
                  ? 'border-plm-border/30 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 text-plm-fg hover:border-plm-border' 
                  : 'border-transparent text-plm-fg-muted cursor-default'
                }
              `}
            />
          ) : column.id === 'itemNumber' ? (() => {
            // Get base number from parent file
            const tabNumber = config.tabNumber || ''
            const hasTabColumn = visibleColumns.some(c => c.id === 'tabNumber')
            
            // When not editable (checked in), show as single inline text
            if (!isEditable) {
              const fullNumber = basePartNumber && tabNumber 
                ? `${basePartNumber}-${tabNumber}`
                : basePartNumber || tabNumber || ''
              return fullNumber ? (
                <span className="text-xs text-plm-fg-muted">{fullNumber}</span>
              ) : (
                <span className="text-plm-fg-dim text-xs">—</span>
              )
            }
            
            // When editable (checked out):
            // If Tab column is visible, just show base number (tab is in separate column)
            // If Tab column is NOT visible, show base number + inline tab input
            if (hasTabColumn) {
              return basePartNumber ? (
                <span className="text-xs text-plm-fg">{basePartNumber}</span>
              ) : (
                <span className="text-plm-fg-dim text-xs">—</span>
              )
            }
            
            // Tab column not visible - show inline tab input next to base number
            return (
              <div className="flex items-center gap-0.5">
                {basePartNumber && (
                  <>
                    <span className="text-xs text-plm-fg">{basePartNumber}</span>
                    <span className="text-plm-fg-dim text-xs">-</span>
                  </>
                )}
                <input
                  type="text"
                  value={tabNumber}
                  onChange={(e) => onTabChange(e.target.value.toUpperCase())}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={basePartNumber ? 'Tab' : 'Item #'}
                  className="w-14 px-1 py-0.5 text-xs rounded border transition-colors text-center bg-transparent border-plm-border/30 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 text-plm-fg hover:border-plm-border"
                />
              </div>
            )
          })() : column.id === 'tabNumber' ? (() => {
            // Separate tab number column for config rows
            const tabNumber = config.tabNumber || ''
            
            if (!isEditable) {
              return tabNumber ? (
                <span className="text-xs text-plm-fg-muted">{tabNumber}</span>
              ) : (
                <span className="text-plm-fg-dim text-xs">—</span>
              )
            }
            
            // Editable tab number input
            return (
              <input
                type="text"
                value={tabNumber}
                onChange={(e) => onTabChange(e.target.value.toUpperCase())}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="-XXX"
                className="w-16 px-1 py-0.5 text-xs rounded border transition-colors text-center bg-transparent border-plm-border/30 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 text-plm-fg hover:border-plm-border"
              />
            )
          })() : column.id === 'revision' ? (
            // Configuration-specific revision (from drawing propagation)
            // This is read-only as it's driven by drawing revisions
            configRevision ? (
              <span 
                className="flex items-center gap-1 text-xs text-plm-fg-muted"
                title="Configuration revision (from drawing)"
              >
                {configRevision}
                <FileInput size={10} className="text-plm-fg-muted/50 flex-shrink-0" />
              </span>
            ) : (
              <span className="text-plm-fg-dim text-xs">—</span>
            )
          ) : (
            <span className="text-plm-fg-dim text-xs">—</span>
          )}
        </td>
      ))}
    </tr>
  )
}, areConfigRowPropsEqual)
