import React from 'react'
import { Layers } from 'lucide-react'
import type { ConfigWithDepth } from '../../types'

export interface ConfigRowProps {
  config: ConfigWithDepth
  isSelected: boolean
  isEditable: boolean
  rowHeight: number
  visibleColumns: { id: string; width: number }[]
  basePartNumber: string
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onDescriptionChange: (value: string) => void
  onTabChange: (value: string) => void
}

export function ConfigRow({
  config,
  isSelected,
  isEditable,
  rowHeight,
  visibleColumns,
  basePartNumber,
  onClick,
  onContextMenu,
  onDescriptionChange,
  onTabChange,
}: ConfigRowProps) {
  return (
    <tr
      className={`config-row hover:bg-plm-bg-light/10 cursor-pointer ${
        isSelected 
          ? 'bg-cyan-500/15 ring-1 ring-cyan-500/30 ring-inset' 
          : 'bg-plm-bg-light/5'
      }`}
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
              <span className="text-plm-fg-dim text-[10px]">{config.depth > 0 ? '└' : '○'}</span>
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
            
            // When editable (checked out), show base number + editable tab input
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
                  onChange={(e) => onTabChange(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={basePartNumber ? 'Tab' : 'Item #'}
                  className="w-14 px-1 py-0.5 text-xs rounded border transition-colors text-center bg-transparent border-plm-border/30 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/20 text-plm-fg hover:border-plm-border"
                />
              </div>
            )
          })() : (
            <span className="text-plm-fg-dim text-xs">—</span>
          )}
        </td>
      ))}
    </tr>
  )
}
