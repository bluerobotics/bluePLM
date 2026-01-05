import React from 'react'
import type { LocalFile } from '@/stores/pdmStore'

export interface FileRowProps {
  file: LocalFile
  index: number
  isSelected: boolean
  isProcessing: boolean
  diffClass: string
  isDragTarget: boolean
  isCut: boolean
  rowHeight: number
  visibleColumns: { id: string; width: number }[]
  draggable: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  renderCell: (file: LocalFile, columnId: string) => React.ReactNode
}

export function FileRow({
  file,
  isSelected,
  isProcessing,
  diffClass,
  isDragTarget,
  isCut,
  rowHeight,
  visibleColumns,
  draggable,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  renderCell,
}: FileRowProps) {
  return (
    <tr
      className={`${isSelected ? 'selected' : ''} ${isProcessing ? 'processing' : ''} ${diffClass} ${isDragTarget ? 'drag-target' : ''} ${isCut ? 'opacity-50' : ''}`}
      style={{ height: rowHeight }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {visibleColumns.map(column => (
        <td key={column.id} style={{ width: column.width }}>
          {renderCell(file, column.id)}
        </td>
      ))}
    </tr>
  )
}
