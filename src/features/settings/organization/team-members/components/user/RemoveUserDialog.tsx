import { useState } from 'react'
import { AlertTriangle, Loader2, UserMinus } from 'lucide-react'
import { Button } from '@/components/core/ui'
import type { OrgUser } from '../../types'

interface RemoveUserDialogProps {
  user: OrgUser
  onClose: () => void
  onConfirm: () => void
  isRemoving: boolean
  isSelf?: boolean
}

export function RemoveUserDialog({
  user,
  onClose,
  onConfirm,
  isRemoving,
  isSelf = false,
}: RemoveUserDialogProps) {
  const [confirmText, setConfirmText] = useState('')

  const displayName = user.full_name || user.email
  const confirmPhrase = isSelf ? 'confirm' : displayName
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
          <div className="p-2 rounded-full bg-ui-danger/20">
            <AlertTriangle className="w-5 h-5 text-ui-danger" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-ui-fg">
              {isSelf ? 'Leave Organization' : 'Remove User from Organization'}
            </h3>
            <p className="text-[13px] text-ui-fg-secondary mt-1">This action cannot be undone</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="p-3 bg-ui-danger/10 border border-ui-danger/30 rounded-lg">
            <p className="text-[13px] text-ui-fg">
              {isSelf ? (
                <>
                  You are about to <strong>leave this organization</strong>. You will:
                </>
              ) : (
                <>
                  You are about to remove <strong>{displayName}</strong> from this organization.
                  They will:
                </>
              )}
            </p>
            <ul className="text-[13px] text-ui-fg-secondary list-disc list-inside mt-2 space-y-1">
              <li>Lose access to all vaults and files</li>
              <li>Be removed from all teams</li>
              <li>Need to be re-invited to rejoin</li>
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
              className="w-full px-3 py-2 bg-ui-bg border border-ui-divider rounded-lg text-ui-fg placeholder:text-ui-fg-secondary/50 focus:outline-none focus:border-ui-danger"
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
                ? 'bg-ui-danger hover:bg-ui-danger/90 text-white'
                : 'bg-ui-fg-secondary/20 text-ui-fg-secondary cursor-not-allowed'
            }`}
          >
            {isRemoving ? <Loader2 size={16} className="animate-spin" /> : <UserMinus size={16} />}
            {isRemoving ? 'Removing...' : isSelf ? 'Leave Organization' : 'Remove User'}
          </button>
        </div>
      </div>
    </div>
  )
}
