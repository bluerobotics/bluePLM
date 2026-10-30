import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Button, Callout, TextInput } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'
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
    return <div className="py-12 text-center text-[13px] text-plm-fg-muted">Not signed in</div>
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
    <SettingsPage>
      <SettingsSection title="What happens when you delete your account">
        <SettingsGroup>
          <ul className="list-disc space-y-1.5 py-3.5 pl-8 pr-4 text-[13px] text-plm-fg-dim marker:text-plm-error">
            <li>Your user profile will be permanently deleted</li>
            <li>You will be removed from your organization</li>
            <li>All your team memberships will be removed</li>
            <li>All your active sessions will be terminated</li>
            <li>Any files you have checked out will be released</li>
          </ul>
        </SettingsGroup>
        <Callout tone="info">
          Activity history and file versions you created will be preserved for audit purposes
        </Callout>
      </SettingsSection>

      <SettingsSection title="Danger zone">
        <SettingsGroup tone="danger">
          {!showConfirmation ? (
            <SettingRow
              label="This action is irreversible"
              description="Once you delete your account, there is no way to recover it. You will need to create a new account and be re-invited to any organizations."
            >
              <Button
                variant="danger-subtle"
                icon={<Trash2 size={14} />}
                onClick={() => setShowConfirmation(true)}
              >
                I want to delete my account
              </Button>
            </SettingRow>
          ) : (
            <div className="space-y-3 px-4 py-4">
              <label
                htmlFor="settings-delete-confirmation"
                className="block text-[13px] text-plm-fg-dim"
              >
                To confirm, type{' '}
                <span className="rounded bg-plm-bg-secondary px-1.5 py-0.5 font-mono font-semibold text-plm-fg">
                  {requiredConfirmation}
                </span>{' '}
                below:
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
    </SettingsPage>
  )
}
