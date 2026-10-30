import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button, TextInput } from '@/components/core/ui'
import { SettingRow, SettingsGroup, SettingsSection } from '@/features/settings/components/ui'
import { getBackend } from '@/lib/backend'
import { log } from '@/lib/logger'
import { getSupabaseClient } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'

export function DeleteAccountSettings() {
  const { user, setUser, setOrganization, addToast } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      setUser: s.setUser,
      setOrganization: s.setOrganization,
      addToast: s.addToast,
    })),
  )
  const [confirmationText, setConfirmationText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  if (!user) {
    return <div className="py-12 text-center text-[14px] text-ui-fg-secondary">Not signed in</div>
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
      const { error } = await client.rpc('user_delete_account')

      if (error) {
        log.error('[Account]', 'Failed to delete account', { error })
        addToast('error', `Failed to delete account: ${error.message}`)
        setIsDeleting(false)
        return
      }

      // Sign out after successful deletion
      await getBackend().auth.signOut()
      setUser(null)
      setOrganization(null)

      addToast('success', 'Your account has been deleted successfully.')
    } catch (error) {
      log.error('[Account]', 'Error deleting account', { error: error })
      addToast('error', 'An unexpected error occurred while deleting your account.')
      setIsDeleting(false)
    }
  }

  return (
    <SettingsSection title="Delete account">
      <SettingsGroup>
        {!showConfirmation ? (
          <SettingRow
            label="Delete your account"
            description="Permanently removes your profile, organization and team memberships and signs out every device. Files you have checked out are released; activity history and file versions you created stay for audit. This cannot be undone."
          >
            <Button variant="danger-subtle" onClick={() => setShowConfirmation(true)}>
              Delete account
            </Button>
          </SettingRow>
        ) : (
          <div className="space-y-3 py-4">
            <label
              htmlFor="settings-delete-confirmation"
              className="block text-[14px] leading-[1.4] text-ui-fg-secondary"
            >
              To confirm, type{' '}
              <span className="rounded-md bg-ui-field px-1.5 py-0.5 font-mono text-ui-fg">
                {requiredConfirmation}
              </span>{' '}
              below.
            </label>
            <TextInput
              id="settings-delete-confirmation"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder={`Type "${requiredConfirmation}" to confirm`}
              disabled={isDeleting}
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowConfirmation(false)
                  setConfirmationText('')
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 size={14} />}
                loading={isDeleting}
                onClick={handleDeleteAccount}
                disabled={!isConfirmed}
              >
                {isDeleting ? 'Deleting account...' : 'Delete my account permanently'}
              </Button>
            </div>
          </div>
        )}
      </SettingsGroup>
    </SettingsSection>
  )
}
