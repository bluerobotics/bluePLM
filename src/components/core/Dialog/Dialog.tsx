import { X } from 'lucide-react'
import type { DialogProps } from './types'

export function Dialog({ open, onClose, title, children, className = '' }: DialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className={`relative bg-plm-bg-secondary border border-plm-border rounded-lg shadow-xl max-w-md w-full mx-4 ${className}`}>
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-plm-border">
            <h2 className="text-lg font-medium text-plm-fg">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-plm-bg-tertiary rounded"
            >
              <X size={18} className="text-plm-fg-muted" />
            </button>
          </div>
        )}
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
