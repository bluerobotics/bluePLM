/**
 * Description column cell renderer
 * 
 * Uses both contexts:
 * - useFilePaneContext() for UI state (editing state, refs)
 * - useFilePaneHandlers() for action handlers
 * 
 * NOTE: Drawing files can have their description locked via settings because
 * it typically comes from the referenced model, not from editable properties.
 */
import { FileInput } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useFilePaneContext, useFilePaneHandlers } from '../../../context'
import type { CellRendererBaseProps } from './types'

export function DescriptionCell({ file }: CellRendererBaseProps): React.ReactNode {
  // UI state from FilePaneContext
  const { editingCell, editValue, setEditValue, inlineEditInputRef } = useFilePaneContext()
  
  // Handlers from FilePaneHandlersContext
  const { isFileEditable, handleSaveCellEdit, handleCancelCellEdit, handleStartCellEdit } = useFilePaneHandlers()
  
  // Drawing lockout setting
  const lockDrawingDescription = usePDMStore(s => s.lockDrawingDescription)
  
  if (file.isDirectory) return ''
  
  // Drawing files can have their description locked via settings
  const isDrawing = file.extension?.toLowerCase() === '.slddrw'
  const isDrawingLocked = isDrawing && lockDrawingDescription
  const canEditDescription = isFileEditable(file) && !isDrawingLocked
  const isEditingDescription = editingCell?.path === file.path && editingCell?.column === 'description'
  
  if (isEditingDescription && canEditDescription) {
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
  const displayValue = file.pendingMetadata?.description !== undefined 
    ? (file.pendingMetadata.description ?? '-') 
    : (file.pdmData?.description || '-')
  const hasValue = displayValue !== '-'
  
  // Get appropriate tooltip
  const getTooltip = () => {
    if (isDrawingLocked) return 'Drawing description is inherited from the referenced model'
    if (canEditDescription) return displayValue !== '-' ? displayValue : 'Click to edit'
    return 'Check out file to edit'
  }
  
  return (
    <span
      className={`flex items-center gap-1 w-full h-full px-1 rounded truncate ${canEditDescription ? 'cursor-text hover:bg-plm-bg-light' : 'select-text cursor-text'} ${!hasValue || !canEditDescription ? 'text-plm-fg-muted' : ''}`}
      onClick={(e) => {
        if (canEditDescription) {
          e.stopPropagation()
          e.preventDefault()
          handleStartCellEdit(file, 'description')
        }
        // Allow click through for text selection when not editable
      }}
      onMouseDown={(e) => {
        // Only stop propagation for editable cells to prevent row selection during edit
        // For non-editable cells, allow native text selection
        if (canEditDescription) {
          e.stopPropagation()
        }
      }}
      onDragStart={(e) => {
        // Prevent row drag when user is trying to select text
        e.preventDefault()
        e.stopPropagation()
      }}
      draggable={false}
      title={getTooltip()}
    >
      <span className="truncate">{displayValue}</span>
      {isDrawingLocked && <FileInput size={12} className="text-plm-fg-muted/50 flex-shrink-0" />}
    </span>
  )
}
