/**
 * Item Number column cell renderer
 * 
 * Uses both contexts:
 * - useFilePaneContext() for UI state (editing state, refs)
 * - useFilePaneHandlers() for action handlers
 */
import { useFilePaneContext, useFilePaneHandlers } from '../../../context'
import type { CellRendererBaseProps } from './types'

export function ItemNumberCell({ file }: CellRendererBaseProps): React.ReactNode {
  // UI state from FilePaneContext
  const { editingCell, editValue, setEditValue, inlineEditInputRef } = useFilePaneContext()
  
  // Handlers from FilePaneHandlersContext
  const { isFileEditable, handleSaveCellEdit, handleCancelCellEdit, handleStartCellEdit } = useFilePaneHandlers()
  
  if (file.isDirectory) return ''
  
  const canEditItemNumber = isFileEditable(file)
  const isEditingItemNumber = editingCell?.path === file.path && editingCell?.column === 'itemNumber'
  
  if (isEditingItemNumber && canEditItemNumber) {
    return (
      <input
        ref={inlineEditInputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSaveCellEdit()
          } else if (e.key === 'Escape') {
            handleCancelCellEdit()
          }
          e.stopPropagation()
        }}
        onBlur={handleSaveCellEdit}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        className="w-full bg-plm-bg border border-plm-accent rounded px-1 py-0 text-sm text-plm-fg focus:outline-none focus:ring-1 focus:ring-plm-accent"
      />
    )
  }
  
  return (
    <span
      className={`block w-full px-1 rounded ${canEditItemNumber ? 'cursor-text hover:bg-plm-bg-light' : ''} ${!file.pdmData?.part_number || !canEditItemNumber ? 'text-plm-fg-muted' : ''}`}
      onClick={(e) => {
        if (canEditItemNumber) {
          e.stopPropagation()
          handleStartCellEdit(file, 'itemNumber')
        }
      }}
      onMouseDown={(e) => {
        // Stop mousedown from triggering row drag or file focus
        if (canEditItemNumber) {
          e.stopPropagation()
        }
      }}
      title={canEditItemNumber ? 'Click to edit' : 'Check out file to edit'}
    >
      {file.pdmData?.part_number || file.pendingMetadata?.part_number || '-'}
    </span>
  )
}
