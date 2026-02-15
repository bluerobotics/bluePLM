import React, { memo } from 'react'
import { FilePen } from 'lucide-react'
import type { DrawingRefItem } from '@/stores/types'

export interface ConfigDrawingRowProps {
  /** The drawing reference item to display */
  item: DrawingRefItem
  /** Nesting depth within the config's drawing list (currently always 0) */
  depth: number
  /** Depth of the parent configuration in the file's config tree */
  configDepth: number
  rowHeight: number
  visibleColumns: { id: string; width: number }[]
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

/**
 * Custom comparison function for ConfigDrawingRow memoization.
 * Compares item identity, display properties, and layout props to prevent
 * unnecessary re-renders in the virtualized file list.
 */
function areConfigDrawingRowPropsEqual(
  prevProps: ConfigDrawingRowProps,
  nextProps: ConfigDrawingRowProps
): boolean {
  // Compare item identity and key display properties
  if (prevProps.item.id !== nextProps.item.id) return false
  if (prevProps.item.file_name !== nextProps.item.file_name) return false
  if (prevProps.item.part_number !== nextProps.item.part_number) return false
  if (prevProps.item.description !== nextProps.item.description) return false
  if (prevProps.item.revision !== nextProps.item.revision) return false
  if (prevProps.item.state !== nextProps.item.state) return false

  // Compare primitive props
  if (prevProps.depth !== nextProps.depth) return false
  if (prevProps.configDepth !== nextProps.configDepth) return false
  if (prevProps.rowHeight !== nextProps.rowHeight) return false

  // Compare visibleColumns array (shallow check on length, ids, and widths)
  if (prevProps.visibleColumns.length !== nextProps.visibleColumns.length) return false
  for (let i = 0; i < prevProps.visibleColumns.length; i++) {
    if (prevProps.visibleColumns[i].id !== nextProps.visibleColumns[i].id) return false
    if (prevProps.visibleColumns[i].width !== nextProps.visibleColumns[i].width) return false
  }

  return true
}

/**
 * Displays a drawing file under a part/assembly configuration row.
 * Shown when a user expands a configuration to see which drawings
 * reference that specific part/assembly config.
 *
 * Always renders a drawing icon (FilePen) since these items are
 * exclusively `.slddrw` files. Styled identically to ConfigBomRow
 * with matching indentation, tree connectors, and column rendering.
 */
export const ConfigDrawingRow = memo(function ConfigDrawingRow({
  item,
  depth,
  configDepth,
  rowHeight,
  visibleColumns,
  onClick,
  onContextMenu,
}: ConfigDrawingRowProps) {
  // Calculate indentation: base indent + parent config depth + item depth + extra for nesting under config
  const indentPx = 24 + (configDepth * 16) + (depth * 16) + 32

  return (
    <tr
      className="config-drawing-row cursor-pointer hover:bg-plm-bg-light/50"
      style={{ height: rowHeight }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {visibleColumns.map(column => (
        <td key={column.id} style={{ width: column.width }}>
          {column.id === 'name' ? (
            <div
              className="flex items-center gap-1.5"
              style={{
                minHeight: rowHeight - 8,
                paddingLeft: `${indentPx}px`
              }}
            >
              <span className="text-plm-fg-dim text-[10px]">├</span>
              <FilePen size={12} className="text-sky-300 flex-shrink-0" />
              <span className="truncate text-xs text-plm-fg-dim">{item.file_name}</span>
            </div>
          ) : column.id === 'itemNumber' ? (
            item.part_number ? (
              <span className="text-[10px] text-plm-fg-dim font-mono">{item.part_number}</span>
            ) : (
              <span className="text-plm-fg-dim/50 text-[10px]">—</span>
            )
          ) : column.id === 'description' ? (
            item.description ? (
              <span className="text-[10px] text-plm-fg-dim truncate">{item.description}</span>
            ) : (
              <span className="text-plm-fg-dim/50 text-[10px]">—</span>
            )
          ) : column.id === 'revision' ? (
            item.revision ? (
              <span className="text-[10px] text-plm-fg-dim">{item.revision}</span>
            ) : (
              <span className="text-plm-fg-dim/50 text-[10px]">—</span>
            )
          ) : column.id === 'state' ? (
            item.state ? (
              <span className="text-[10px] text-plm-fg-dim">{item.state}</span>
            ) : (
              <span className="text-plm-fg-dim/50 text-[10px]">—</span>
            )
          ) : (
            <span className="text-plm-fg-dim/50 text-[10px]">—</span>
          )}
        </td>
      ))}
    </tr>
  )
}, areConfigDrawingRowPropsEqual)
