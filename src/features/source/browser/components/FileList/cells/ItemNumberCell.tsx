/**
 * Item Number column cell renderer
 */
import { useFileBrowserContext } from '../../../context'
import type { CellRendererBaseProps } from './types'

export function ItemNumberCell({ 
  file, 
  isFileEditable,
  handleSaveCellEdit,
  handleCancelCellEdit,
  handleStartCellEdit,
}: CellRendererBaseProps): React.ReactNode {
  const { editingCell, editValue, setEditValue, inlineEditInputRef } = useFileBrowserContext()
  
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
      className={`px-1 rounded ${canEditItemNumber ? 'cursor-text hover:bg-plm-bg-light' : ''} ${!file.pdmData?.part_number || !canEditItemNumber ? 'text-plm-fg-muted' : ''}`}
      onClick={(e) => {
        if (canEditItemNumber) {
          e.stopPropagation()
          handleStartCellEdit(file, 'itemNumber')
        }
      }}
      title={canEditItemNumber ? 'Click to edit' : 'Check out file to edit'}
    >
      {file.pdmData?.part_number || '-'}
    </span>
  )
}
