import { useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/core/ui'
import type { OrgUser } from '../../types'

interface RemoveFromAdminsDialogProps {
  user: OrgUser
  teamName: string
  onClose: () => void
  onConfirm: () => void
  isRemoving: boolean
}

export function RemoveFromAdminsDialog({
  user: _user,
  teamName,
  onClose,
  onConfirm,
  isRemoving,
}: RemoveFromAdminsDialogProps) {
  const [confirmText, setConfirmText] = useState('')

  const confirmPhrase = 'confirm'
  const isConfirmed = confirmText === confirmPhrase

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-ui-field border border-ui-divider rounded-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-full bg-ui-warning/20">
            <AlertTriangle className="w-5 h-5 text-ui-warning" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-ui-fg">Leave {teamName} Team</h3>
            <p className="text-[13px] text-ui-fg-secondary mt-1">This may affect your admin privileges</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="p-3 bg-ui-warning/10 border border-ui-warning/30 rounded-lg">
            <p className="text-[13px] text-ui-fg">
              You are about to remove yourself from the <strong>{teamName}</strong> team.
            </p>
            <ul className="text-[13px] text-ui-fg-secondary list-disc list-inside mt-2 space-y-1">
              <li>You may lose admin-level permissions</li>
              <li>You won't be able to manage team settings</li>
              <li>Another admin will need to add you back</li>
            </ul>
          </div>

          <div>
            <p className="text-[13px] text-ui-fg-secondary mb-2">
              To confirm, type <strong className="text-ui-fg">{confirmPhrase}</strong> below:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmPhrase}
              className="w-full px-3 py-2 bg-ui-bg border border-ui-divider rounded-lg text-ui-fg placeholder:text-ui-fg-secondary/50 focus:outline-none focus:border-ui-warning"
              autoFocus
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            disabled={!isConfirmed || isRemoving}
            className={`btn flex items-center gap-2 ${
              isConfirmed
                ? 'bg-ui-warning hover:bg-ui-warning/90 text-white'
                : 'bg-ui-fg-secondary/20 text-ui-fg-secondary cursor-not-allowed'
            }`}
          >
            {isRemoving ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
            {isRemoving ? 'Leaving...' : 'Leave Team'}
          </button>
        </div>
      </div>
    </div>
  )
}
