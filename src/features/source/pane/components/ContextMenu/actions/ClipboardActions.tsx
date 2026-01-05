/**
 * Clipboard actions for context menu (copy, cut, paste)
 */
import { Copy, Scissors, ClipboardPaste } from 'lucide-react'
import { useFileBrowserContext } from '../../../context'
import type { ActionComponentProps } from './types'

interface ClipboardActionsProps extends ActionComponentProps {
  handleCopy: () => void
  handleCut: () => void
  handlePaste: () => void
  canCut: boolean
  userId: string | undefined
}

export function ClipboardActions({
  onClose,
  handleCopy,
  handleCut,
  handlePaste,
  canCut,
}: ClipboardActionsProps) {
  const { clipboard } = useFileBrowserContext()

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
        className={`context-menu-item ${!canCut ? 'disabled' : ''}`}
        onClick={() => {
          if (canCut) {
            handleCut()
            onClose()
          }
        }}
        title={!canCut ? 'Check out files first to move them' : undefined}
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
