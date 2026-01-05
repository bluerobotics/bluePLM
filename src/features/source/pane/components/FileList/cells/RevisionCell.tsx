/**
 * Revision column cell renderer
 * 
 * Uses both contexts:
 * - useFileBrowserContext() for UI state (editing state, refs)
 * - useFileBrowserHandlers() for action handlers
 */
import { useFileBrowserContext, useFileBrowserHandlers } from '../../../context'
import type { CellRendererBaseProps } from './types'

export function RevisionCell({ file }: CellRendererBaseProps): React.ReactNode {
  // UI state from FileBrowserContext
  const { editingCell, editValue, setEditValue, inlineEditInputRef } = useFileBrowserContext()
  
  // Handlers from FileBrowserHandlersContext
  const { isFileEditable, handleSaveCellEdit, handleCancelCellEdit, handleStartCellEdit } = useFileBrowserHandlers()
  
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
  
  return (
    <span
      className={`px-1 rounded ${canEditRevision ? 'cursor-text hover:bg-plm-bg-light' : 'text-plm-fg-muted'}`}
      onClick={(e) => {
        if (canEditRevision) {
          e.stopPropagation()
          handleStartCellEdit(file, 'revision')
        }
      }}
      title={canEditRevision ? 'Click to edit' : 'Check out file to edit'}
    >
      {file.pdmData?.revision || 'A'}
    </span>
  )
}
