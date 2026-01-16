/**
 * Revision column cell renderer
 * 
 * Uses both contexts:
 * - useFilePaneContext() for UI state (editing state, refs)
 * - useFilePaneHandlers() for action handlers
 * 
 * NOTE: Drawing files (.slddrw) can have their revision locked via settings because
 * it typically comes from the drawing's revision table, not from editable properties.
 */
import { FileInput } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useFilePaneContext, useFilePaneHandlers } from '../../../context'
import type { CellRendererBaseProps } from './types'

export function RevisionCell({ file }: CellRendererBaseProps): React.ReactNode {
  // UI state from FilePaneContext
  const { editingCell, editValue, setEditValue, inlineEditInputRef } = useFilePaneContext()
  
  // Handlers from FilePaneHandlersContext
  const { isFileEditable, handleSaveCellEdit, handleCancelCellEdit, handleStartCellEdit } = useFilePaneHandlers()
  
  // Drawing lockout setting
  const lockDrawingRevision = usePDMStore(s => s.lockDrawingRevision)
  
  if (file.isDirectory) return ''
  
  // Drawing files can have their revision locked via settings
  const isDrawing = file.extension?.toLowerCase() === '.slddrw'
  const isDrawingLocked = isDrawing && lockDrawingRevision
  const canEditRevision = isFileEditable(file) && !isDrawingLocked
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
  
  // Determine appropriate tooltip message
  const getTooltip = () => {
    if (isDrawingLocked) return 'Drawing revision is driven by the drawing file'
    if (canEditRevision) return 'Click to edit'
    return 'Check out file to edit'
  }
  
  return (
    <span
      className={`flex items-center gap-1 w-full h-full px-1 rounded ${canEditRevision ? 'cursor-text hover:bg-plm-bg-light' : 'text-plm-fg-muted'}`}
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
      title={getTooltip()}
    >
      {displayValue}
      {isDrawingLocked && <FileInput size={12} className="text-plm-fg-muted/50 flex-shrink-0" />}
    </span>
  )
}
