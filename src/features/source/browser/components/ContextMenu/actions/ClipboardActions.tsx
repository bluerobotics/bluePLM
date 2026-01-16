/**
 * Clipboard actions for context menu (copy, cut, paste)
 */
import { Copy, Scissors, ClipboardPaste } from 'lucide-react'
import { useFilePaneContext } from '../../../context'
import type { ActionComponentProps } from './types'

interface ClipboardActionsProps extends ActionComponentProps {
  handleCopy: () => void
  handleCut: () => void
  handlePaste: () => void
}

export function ClipboardActions({
  onClose,
  handleCopy,
  handleCut,
  handlePaste,
}: ClipboardActionsProps) {
  const { clipboard } = useFilePaneContext()

  return (
    <>
      <div className="context-menu-separator" />
      
      {/* Copy */}
      <div 
        className="context-menu-item"
        onClick={() => {
          handleCopy()
          onClose()
        }}
      >
        <Copy size={14} />
        Copy
        <span className="text-xs text-plm-fg-muted ml-auto">Ctrl+C</span>
      </div>
      
      {/* Cut */}
      <div 
        className="context-menu-item"
        onClick={() => {
          handleCut()
          onClose()
        }}
      >
        <Scissors size={14} />
        Cut
        <span className="text-xs text-plm-fg-muted ml-auto">Ctrl+X</span>
      </div>
      
      {/* Paste */}
      <div 
        className={`context-menu-item ${!clipboard ? 'disabled' : ''}`}
        onClick={() => {
          if (clipboard) {
            handlePaste()
          }
          onClose()
        }}
      >
        <ClipboardPaste size={14} />
        Paste
        <span className="text-xs text-plm-fg-muted ml-auto">Ctrl+V</span>
      </div>
    </>
  )
}
