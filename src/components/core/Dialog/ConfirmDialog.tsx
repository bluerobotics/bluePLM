import { useEffect, useCallback } from 'react'
import { AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { Dialog } from './Dialog'
import type { ConfirmDialogProps } from './types'

const variantConfig = {
  danger: { icon: AlertTriangle, color: 'text-red-400', button: 'bg-red-600 hover:bg-red-700' },
  warning: { icon: AlertCircle, color: 'text-amber-400', button: 'bg-amber-600 hover:bg-amber-700' },
  info: { icon: Info, color: 'text-blue-400', button: 'bg-blue-600 hover:bg-blue-700' },
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  variant = 'info',
}: ConfirmDialogProps) {
  const config = variantConfig[variant]
  const Icon = config.icon
  
  // Handle Enter key to confirm
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm()
      onClose()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [onConfirm, onClose])
  
  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex gap-3">
        <Icon size={24} className={config.color} />
        <p className="text-plm-fg-muted">{message}</p>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-plm-fg-muted hover:bg-plm-bg-tertiary rounded"
        >
          {cancelText}
        </button>
        <button
          onClick={() => {
            onConfirm()
            onClose()
          }}
          className={`px-4 py-2 text-sm text-white rounded ${config.button}`}
        >
          {confirmText}
        </button>
      </div>
    </Dialog>
  )
}
