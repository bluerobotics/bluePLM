/**
 * Container component for Command Confirmation Dialog
 * 
 * Renders a confirmation dialog when a command handler calls ctx.confirm().
 * The dialog state is managed via the store, and the promise resolution
 * is handled by the executor's resolveCommandConfirm() function.
 */

import { memo, useEffect, useCallback } from 'react'
import { AlertTriangle, File } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { resolveCommandConfirm } from '@/lib/commands/executor'

const MAX_VISIBLE_FILES = 5

export const CommandConfirmContainer = memo(function CommandConfirmContainer() {
  const pendingConfirm = usePDMStore(s => s.pendingCommandConfirm)
  
  const handleConfirm = useCallback(() => {
    resolveCommandConfirm(true)
  }, [])
  
  const handleCancel = useCallback(() => {
    resolveCommandConfirm(false)
  }, [])
  
  // Handle keyboard shortcuts
  useEffect(() => {
    if (!pendingConfirm) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleConfirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancel()
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pendingConfirm, handleConfirm, handleCancel])
  
  if (!pendingConfirm) return null
  
  const { title, message, items, confirmText = 'Continue' } = pendingConfirm
  
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={handleCancel}
    >
      <div
        className="bg-plm-bg-light border border-plm-border rounded-lg p-6 max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-plm-warning/20 flex items-center justify-center">
            <AlertTriangle size={20} className="text-plm-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-plm-fg">{title}</h3>
          </div>
        </div>

        <p className="text-sm text-plm-fg-dim mb-4">{message}</p>

        {items && items.length > 0 && (
          <div className="bg-plm-bg rounded border border-plm-border p-3 mb-4 max-h-40 overflow-y-auto">
            {items.length === 1 ? (
              <div className="flex items-center gap-2">
                <File size={16} className="text-plm-fg-muted flex-shrink-0" />
                <span className="text-plm-fg font-medium truncate">{items[0]}</span>
              </div>
            ) : (
              <>
                <div className="text-sm text-plm-fg mb-2">
                  {items.length} file{items.length > 1 ? 's' : ''}
                </div>
                <div className="space-y-1">
                  {items.slice(0, MAX_VISIBLE_FILES).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <File size={14} className="text-plm-fg-muted flex-shrink-0" />
                      <span className="text-plm-fg-dim truncate">{item}</span>
                    </div>
                  ))}
                  {items.length > MAX_VISIBLE_FILES && (
                    <div className="text-xs text-plm-fg-muted mt-1">
                      ...and {items.length - MAX_VISIBLE_FILES} more
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={handleCancel}
            className="btn btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="btn btn-primary"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
})
