/**
 * useColumnHandlers - Table column interaction handlers hook
 * 
 * Provides handlers for managing table column interactions:
 * - Column resize: Click and drag column borders to resize
 * - Column reorder: Drag column headers to reorder
 * - Column context menu: Right-click to toggle column visibility
 * 
 * Key exports:
 * - handleColumnResize - Start column resize operation
 * - handleColumnDragStart/Over/Leave/Drop/End - Drag-drop reorder
 * - handleColumnHeaderContextMenu - Show column visibility menu
 * 
 * @example
 * const {
 *   handleColumnResize,
 *   handleColumnDragStart,
 *   handleColumnDrop
 * } = useColumnHandlers({
 *   columns, setColumnWidth, reorderColumns, ...dragState
 * })
 */
import { useCallback } from 'react'
import type { ColumnConfig } from '@/stores/types'

export interface ColumnHandlersDeps {
  // Column data
  columns: ColumnConfig[]
  
  // Store actions
  setColumnWidth: (columnId: string, width: number) => void
  reorderColumns: (newColumns: ColumnConfig[]) => void
  
  // Drag state
  draggingColumn: string | null
  setDraggingColumn: (column: string | null) => void
  setDragOverColumn: (column: string | null) => void
  setResizingColumn: (column: string | null) => void
  
  // Context menu state
  setColumnContextMenu: (state: { x: number; y: number } | null) => void
}

export interface UseColumnHandlersReturn {
  handleColumnResize: (e: React.MouseEvent, columnId: string) => void
  handleColumnDragStart: (e: React.DragEvent, columnId: string) => void
  handleColumnDragOver: (e: React.DragEvent, columnId: string) => void
  handleColumnDragLeave: () => void
  handleColumnDrop: (e: React.DragEvent, targetColumnId: string) => void
  handleColumnDragEnd: () => void
  handleColumnHeaderContextMenu: (e: React.MouseEvent) => void
}

/**
 * Hook for managing column interactions: resize, drag-drop reorder, and context menu.
 */
export function useColumnHandlers(deps: ColumnHandlersDeps): UseColumnHandlersReturn {
  const {
    columns,
    setColumnWidth,
    reorderColumns,
    draggingColumn,
    setDraggingColumn,
    setDragOverColumn,
    setResizingColumn,
    setColumnContextMenu,
  } = deps

  const handleColumnResize = useCallback((e: React.MouseEvent, columnId: string) => {
    e.preventDefault()
    setResizingColumn(columnId)

    const startX = e.clientX
    const column = columns.find(c => c.id === columnId)
    if (!column) return
    const startWidth = column.width

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startX
      setColumnWidth(columnId, startWidth + diff)
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [columns, setColumnWidth, setResizingColumn])

  const handleColumnDragStart = useCallback((e: React.DragEvent, columnId: string) => {
    setDraggingColumn(columnId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', columnId)
  }, [setDraggingColumn])

  const handleColumnDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    if (draggingColumn && draggingColumn !== columnId) {
      setDragOverColumn(columnId)
    }
  }, [draggingColumn, setDragOverColumn])

  const handleColumnDragLeave = useCallback(() => {
    setDragOverColumn(null)
  }, [setDragOverColumn])

  const handleColumnDrop = useCallback((e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault()
    if (!draggingColumn || draggingColumn === targetColumnId) {
      setDraggingColumn(null)
      setDragOverColumn(null)
      return
    }

    // Reorder columns
    const newColumns = [...columns]
    const dragIndex = newColumns.findIndex(c => c.id === draggingColumn)
    const dropIndex = newColumns.findIndex(c => c.id === targetColumnId)
    
    if (dragIndex !== -1 && dropIndex !== -1) {
      const [removed] = newColumns.splice(dragIndex, 1)
      newColumns.splice(dropIndex, 0, removed)
      reorderColumns(newColumns)
    }

    setDraggingColumn(null)
    setDragOverColumn(null)
  }, [columns, draggingColumn, reorderColumns, setDraggingColumn, setDragOverColumn])

  const handleColumnDragEnd = useCallback(() => {
    setDraggingColumn(null)
    setDragOverColumn(null)
  }, [setDraggingColumn, setDragOverColumn])

  const handleColumnHeaderContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setColumnContextMenu({ x: e.clientX, y: e.clientY })
  }, [setColumnContextMenu])

  return {
    handleColumnResize,
    handleColumnDragStart,
    handleColumnDragOver,
    handleColumnDragLeave,
    handleColumnDrop,
    handleColumnDragEnd,
    handleColumnHeaderContextMenu,
  }
}
