import { memo } from 'react'
import { ArrowDown, File, Send, Loader2 } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'

export interface CheckoutRequestModalProps {
  file: LocalFile
  message: string
  isSubmitting: boolean
  onMessageChange: (message: string) => void
  onSubmit: () => void
  onClose: () => void
}

/**
 * Modal for requesting checkout of a file that's currently checked out by someone else
 */
export const CheckoutRequestModal = memo(function CheckoutRequestModal({
  file,
  message,
  isSubmitting,
  onMessageChange,
  onSubmit,
  onClose
}: CheckoutRequestModalProps) {
  return (
    <div 
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-plm-bg-light border border-plm-border rounded-lg p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-plm-warning/20 flex items-center justify-center">
            <ArrowDown size={20} className="text-plm-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-plm-fg">Request Checkout</h3>
            <p className="text-sm text-plm-fg-muted">Ask to check out this file</p>
          </div>
        </div>
        
        <div className="bg-plm-bg rounded border border-plm-border p-3 mb-4">
          <div className="flex items-center gap-2">
            <File size={16} className="text-plm-fg-muted" />
            <span className="text-plm-fg font-medium truncate">{file.name}</span>
          </div>
          <div className="mt-2 text-xs text-plm-fg-muted">
            Currently checked out - a notification will be sent to the user who has this file.
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block text-xs text-plm-fg-muted uppercase tracking-wide mb-2">Message (optional)</label>
          <textarea
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="Why do you need this file? Any deadline?"
            className="w-full px-3 py-2 text-sm bg-plm-bg border border-plm-border rounded resize-none focus:outline-none focus:border-plm-accent"
            rows={3}
          />
        </div>
        
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="btn bg-plm-warning hover:bg-plm-warning/90 text-white disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send Request
          </button>
        </div>
      </div>
    </div>
  )
})
