import { memo } from 'react'
import { Users, File, Check, Send, Loader2 } from 'lucide-react'
import type { LocalFile } from '@/stores/pdmStore'

export interface OrgUser {
  id: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
}

export interface NotifyModalProps {
  file: LocalFile
  orgUsers: OrgUser[]
  loadingUsers: boolean
  selectedUsers: string[]
  message: string
  isSubmitting: boolean
  onToggleUser: (userId: string) => void
  onMessageChange: (message: string) => void
  onSubmit: () => void
  onClose: () => void
}

/**
 * Modal for sending notifications about a file to team members
 */
export const NotifyModal = memo(function NotifyModal({
  file,
  orgUsers,
  loadingUsers,
  selectedUsers,
  message,
  isSubmitting,
  onToggleUser,
  onMessageChange,
  onSubmit,
  onClose
}: NotifyModalProps) {
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
            <Users size={20} className="text-plm-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-plm-fg">Notify Someone</h3>
            <p className="text-sm text-plm-fg-muted">Send a notification about this file</p>
          </div>
        </div>
        
        <div className="bg-plm-bg rounded border border-plm-border p-3 mb-4">
          <div className="flex items-center gap-2">
            <File size={16} className="text-plm-fg-muted" />
            <span className="text-plm-fg font-medium truncate">{file.name}</span>
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block text-xs text-plm-fg-muted uppercase tracking-wide mb-2">Select People to Notify</label>
          {loadingUsers ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 size={20} className="animate-spin text-plm-accent" />
            </div>
          ) : orgUsers.length === 0 ? (
            <p className="text-sm text-plm-fg-muted p-2">No other users in your organization</p>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-plm-border rounded bg-plm-bg">
              {orgUsers.map(orgUser => (
                <label key={orgUser.id} className="flex items-center gap-3 p-2 hover:bg-plm-highlight cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(orgUser.id)}
                    onChange={() => onToggleUser(orgUser.id)}
                    className="w-4 h-4 rounded border-plm-border text-plm-accent"
                  />
                  <div className="w-6 h-6 rounded-full bg-plm-accent/20 flex items-center justify-center">
                    <Users size={12} className="text-plm-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-plm-fg truncate">{orgUser.full_name || orgUser.email}</div>
                    {orgUser.full_name && <div className="text-xs text-plm-fg-muted truncate">{orgUser.email}</div>}
                  </div>
                  {selectedUsers.includes(orgUser.id) && <Check size={16} className="text-plm-accent flex-shrink-0" />}
                </label>
              ))}
            </div>
          )}
        </div>
        
        <div className="mb-4">
          <label className="block text-xs text-plm-fg-muted uppercase tracking-wide mb-2">Message</label>
          <textarea
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="What would you like to say about this file?"
            className="w-full px-3 py-2 text-sm bg-plm-bg border border-plm-border rounded resize-none focus:outline-none focus:border-plm-accent"
            rows={3}
          />
        </div>
        
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button
            onClick={onSubmit}
            disabled={selectedUsers.length === 0 || !message.trim() || isSubmitting}
            className="btn bg-plm-accent hover:bg-plm-accent/90 text-white disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send {selectedUsers.length > 0 && `(${selectedUsers.length})`}
          </button>
        </div>
      </div>
    </div>
  )
})
