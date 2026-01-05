import { memo } from 'react'
import { AlertTriangle } from 'lucide-react'

export interface CustomConfirmDialogProps {
  title: string
  message: string
  warning?: string
  confirmText: string
  confirmDanger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Generic confirmation dialog with optional warning message
 */
export const CustomConfirmDialog = memo(function CustomConfirmDialog({
  title,
  message,
  warning,
  confirmText,
  confirmDanger,
  onConfirm,
  onCancel
}: CustomConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-plm-bg-light border border-plm-border rounded-lg p-6 max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full ${confirmDanger ? 'bg-plm-error/20' : 'bg-plm-warning/20'} flex items-center justify-center`}>
            <AlertTriangle size={20} className={confirmDanger ? 'text-plm-error' : 'text-plm-warning'} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-plm-fg">{title}</h3>
          </div>
        </div>

        <p className="text-sm text-plm-fg-dim mb-4">{message}</p>

        {warning && (
          <div className="bg-plm-warning/10 border border-plm-warning/30 rounded p-3 mb-4">
            <div className="flex items-start gap-2 text-sm text-plm-warning">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{warning}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="btn btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm()
              onCancel()
            }}
            className={confirmDanger ? 'btn btn-danger' : 'btn btn-primary'}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
})
