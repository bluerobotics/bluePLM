import { memo } from 'react'
import { Link, Copy, Check } from 'lucide-react'

export interface ShareLinkModalProps {
  shareLink: string
  copied: boolean
  onCopy: () => void
  onClose: () => void
}

/**
 * Modal for displaying generated share links
 */
export const ShareLinkModal = memo(function ShareLinkModal({
  shareLink,
  copied,
  onCopy,
  onClose
}: ShareLinkModalProps) {
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
          <div className="w-10 h-10 rounded-full bg-plm-accent/20 flex items-center justify-center">
            <Link size={20} className="text-plm-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-plm-fg">Share Link Created</h3>
            <p className="text-sm text-plm-fg-muted">Copy the link below</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex gap-2">
            <input 
              type="text" 
              value={shareLink} 
              readOnly 
              className="flex-1 px-3 py-2 text-sm bg-plm-bg border border-plm-border rounded focus:outline-none" 
            />
            <button onClick={onCopy} className="btn bg-plm-accent hover:bg-plm-accent/90 text-white">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-xs text-plm-fg-muted">Expires in 7 days • Anyone with link can download</p>
          
          <div className="flex justify-end">
            <button onClick={onClose} className="btn bg-plm-accent hover:bg-plm-accent/90 text-white">Done</button>
          </div>
        </div>
      </div>
    </div>
  )
})
