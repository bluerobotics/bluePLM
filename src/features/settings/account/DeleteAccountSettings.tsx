import { useState } from 'react'
import { AlertTriangle, Loader2, Trash2, UserX } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { getSupabaseClient, signOut } from '@/lib/supabase'

export function DeleteAccountSettings() {
  const { user, setUser, setOrganization, addToast } = usePDMStore()
  const [confirmationText, setConfirmationText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  if (!user) {
    return (
      <div className="text-center py-12 text-plm-fg-muted text-base">
        Not signed in
      </div>
    )
  }

  // The text user must type to confirm deletion
  const requiredConfirmation = user.full_name || user.email.split('@')[0]
  const isConfirmed = confirmationText === requiredConfirmation

  const handleDeleteAccount = async () => {
    if (!isConfirmed || isDeleting) return

    setIsDeleting(true)
    try {
      const client = getSupabaseClient()

      // Call the RPC function to delete the user account
      const { error } = await client.rpc('delete_user_account')

      if (error) {
        console.error('Failed to delete account:', error)
        addToast('error', `Failed to delete account: ${error.message}`)
        setIsDeleting(false)
        return
      }

      // Sign out after successful deletion
      await signOut()
      setUser(null)
      setOrganization(null)

      addToast('success', 'Your account has been deleted successfully.')
    } catch (err) {
      console.error('Error deleting account:', err)
      addToast('error', 'An unexpected error occurred while deleting your account.')
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Warning Header */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-plm-error/20 text-plm-error">
            <UserX size={24} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-plm-fg">Delete Account</h2>
            <p className="text-sm text-plm-fg-muted">Permanently remove your account and data</p>
          </div>
        </div>
      </section>

      {/* What happens section */}
      <section className="p-4 bg-plm-bg rounded-lg border border-plm-border">
        <h3 className="text-base font-medium text-plm-fg mb-3">What happens when you delete your account:</h3>
        <ul className="space-y-2 text-sm text-plm-fg-muted">
          <li className="flex items-start gap-2">
            <span className="text-plm-error mt-0.5">•</span>
            <span>Your user profile will be permanently deleted</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-plm-error mt-0.5">•</span>
            <span>You will be removed from your organization</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-plm-error mt-0.5">•</span>
            <span>All your team memberships will be removed</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-plm-error mt-0.5">•</span>
            <span>All your active sessions will be terminated</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-plm-error mt-0.5">•</span>
            <span>Any files you have checked out will be released</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-plm-warning mt-0.5">•</span>
            <span className="text-plm-warning">Activity history and file versions you created will be preserved for audit purposes</span>
          </li>
        </ul>
      </section>

      {/* Warning banner */}
      <section className="p-4 bg-plm-error/10 border border-plm-error/30 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-plm-error flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-base font-medium text-plm-error">This action is irreversible</p>
            <p className="text-sm text-plm-error/80 mt-1">
              Once you delete your account, there is no way to recover it. You will need to create a new account and be re-invited to any organizations.
            </p>
          </div>
        </div>
      </section>

      {/* Delete button / confirmation */}
      <section className="p-4 bg-plm-bg rounded-lg border border-plm-border">
        {!showConfirmation ? (
          <button
            onClick={() => setShowConfirmation(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-plm-error/20 text-plm-error border border-plm-error/30 rounded-lg hover:bg-plm-error/30 transition-colors font-medium"
          >
            <Trash2 size={18} />
            I want to delete my account
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-plm-fg-muted mb-2">
                To confirm, type <span className="font-mono font-semibold text-plm-fg bg-plm-bg-secondary px-1.5 py-0.5 rounded">{requiredConfirmation}</span> below:
              </label>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={`Type "${requiredConfirmation}" to confirm`}
                className="w-full bg-plm-bg-secondary border border-plm-border rounded-lg px-3 py-2.5 text-base focus:border-plm-error focus:outline-none"
                disabled={isDeleting}
                autoFocus
              />
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={!isConfirmed || isDeleting}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  isConfirmed && !isDeleting
                    ? 'bg-plm-error text-white hover:bg-plm-error/90'
                    : 'bg-plm-error/20 text-plm-error/50 cursor-not-allowed'
                }`}
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Deleting account...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    Delete my account permanently
                  </>
                )}
              </button>
              
              <button
                onClick={() => {
                  setShowConfirmation(false)
                  setConfirmationText('')
                }}
                disabled={isDeleting}
                className="px-4 py-2.5 text-plm-fg-muted hover:text-plm-fg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
