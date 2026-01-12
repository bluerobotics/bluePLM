/**
 * Revision column cell renderer
 * 
 * Uses both contexts:
 * - useFilePaneContext() for UI state (editing state, refs)
 * - useFilePaneHandlers() for action handlers
 */
import { useFilePaneContext, useFilePaneHandlers } from '../../../context'
import type { CellRendererBaseProps } from './types'

export function RevisionCell({ file }: CellRendererBaseProps): React.ReactNode {
  // UI state from FilePaneContext
  const { editingCell, editValue, setEditValue, inlineEditInputRef } = useFilePaneContext()
  
  // Handlers from FilePaneHandlersContext
  const { isFileEditable, handleSaveCellEdit, handleCancelCellEdit, handleStartCellEdit } = useFilePaneHandlers()
  
  if (file.isDirectory) return ''
  
  const canEditRevision = isFileEditable(file)
  const isEditingRevision = editingCell?.path === file.path && editingCell?.column === 'revision'
  
  if (isEditingRevision && canEditRevision) {
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
  // Default to 'A' if no revision is set
  const displayValue = file.pendingMetadata?.revision !== undefined 
    ? file.pendingMetadata.revision 
    : (file.pdmData?.revision || 'A')
  
  return (
    <span
      className={`block w-full h-full px-1 rounded ${canEditRevision ? 'cursor-text hover:bg-plm-bg-light' : 'text-plm-fg-muted'}`}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (canEditRevision) {
          handleStartCellEdit(file, 'revision')
        }
      }}
      onMouseDown={(e) => {
        // Stop mousedown from triggering row drag or file focus
        e.stopPropagation()
      }}
      title={canEditRevision ? 'Click to edit' : 'Check out file to edit'}
    >
      {displayValue}
    </span>
  )
}
