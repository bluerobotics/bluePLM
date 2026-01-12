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
  
  // Prioritize pendingMetadata over pdmData - pending edits should always show
  const displayValue = file.pendingMetadata?.part_number !== undefined 
    ? (file.pendingMetadata.part_number ?? '-') 
    : (file.pdmData?.part_number || '-')
  const hasValue = displayValue !== '-'
  
  return (
    <span
      className={`block w-full h-full px-1 rounded ${canEditItemNumber ? 'cursor-text hover:bg-plm-bg-light' : ''} ${!hasValue || !canEditItemNumber ? 'text-plm-fg-muted' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (canEditItemNumber) {
          handleStartCellEdit(file, 'itemNumber')
        }
      }}
      onMouseDown={(e) => {
        // Stop mousedown from triggering row drag or file focus
        e.stopPropagation()
      }}
      title={canEditItemNumber ? 'Click to edit' : 'Check out file to edit'}
    >
      {displayValue}
    </span>
  )
}
