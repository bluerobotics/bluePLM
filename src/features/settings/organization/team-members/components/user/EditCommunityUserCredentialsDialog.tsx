import { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Loader2 } from 'lucide-react'
import { Dialog } from '@/components/core/Dialog'
import { updateCommunityUser } from '@/lib/community'
import { usePDMStore } from '@/stores/pdmStore'
import type { OrgUser } from '../../types'
import type { CommunityMembershipRole } from '@/lib/community'
import { log } from '@/lib/logger'

interface EditCommunityUserCredentialsDialogProps {
  user: OrgUser
  onClose: () => void
  onUpdated: () => Promise<void> | void
}

/**
 * Community-only account editor. Credentials are deliberately kept outside of
 * the Supabase invitation/profile flow so a Community installation never
 * needs a Supabase session or API key to manage its users.
 */
export function EditCommunityUserCredentialsDialog({
  user,
  onClose,
  onUpdated,
}: EditCommunityUserCredentialsDialogProps) {
  const { t } = useTranslation()
  const { addToast } = usePDMStore()
  const [email, setEmail] = useState(user.email)
  const [displayName, setDisplayName] = useState(user.full_name ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const originalRole: Exclude<CommunityMembershipRole, 'owner'> =
    user.role === 'admin' || user.role === 'viewer' || user.role === 'guest' ? user.role : 'member'
  const [role, setRole] = useState<Exclude<CommunityMembershipRole, 'owner'>>(originalRole)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedName = displayName.trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      addToast('error', t('mdbSetup.validEmail'))
      return
    }
    if (normalizedName.length < 2) {
      addToast('error', t('mdbSetup.fullNameRequired'))
      return
    }
    if (password && password.length < 12) {
      addToast('error', t('mdbSetup.newPasswordTooShort'))
      return
    }
    if (password !== confirmPassword) {
      addToast('error', t('mdbSetup.passwordsMismatch'))
      return
    }

    const roleChanged = user.role !== 'owner' && role !== originalRole
    const changed =
      normalizedEmail !== user.email.toLowerCase() ||
      normalizedName !== (user.full_name ?? '').trim() ||
      password.length > 0 ||
      roleChanged
    if (!changed) {
      onClose()
      return
    }

    setIsSaving(true)
    try {
      await updateCommunityUser(user.id, {
        email: normalizedEmail,
        displayName: normalizedName,
        ...(password ? { password } : {}),
        ...(roleChanged ? { role } : {}),
      })
      await onUpdated()
      addToast('success', t('mdbSetup.updatedAccount', { name: normalizedName }))
      onClose()
    } catch (error) {
      log.error('[EditCommunityUserCredentialsDialog]', 'Failed to update MDB user', { error })
      addToast('error', t('mdbSetup.failedUpdate'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onClose={isSaving ? () => undefined : onClose} title={t('mdbSetup.editAccount')}>
      <div className="space-y-4">
        <p className="text-sm text-plm-fg-muted">{t('mdbSetup.editAccountHelp')}</p>
        <label className="block text-sm text-plm-fg">
          {t('mdbSetup.fullName')}
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={isSaving}
            className="input mt-1 w-full"
            autoComplete="name"
          />
        </label>
        <label className="block text-sm text-plm-fg">
          {t('mdbSetup.emailAddressRequired').replace(' *', '')}
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSaving}
            className="input mt-1 w-full"
            type="email"
            autoComplete="email"
          />
        </label>
        <label className="block text-sm text-plm-fg">
          {t('mdbSetup.newPassword')}{' '}
          <span className="text-plm-fg-muted">({t('mdbSetup.leaveBlankKeep')})</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSaving}
            className="input mt-1 w-full"
            type="password"
            autoComplete="new-password"
          />
        </label>
        <label className="block text-sm text-plm-fg">
          {t('mdbSetup.confirmNewPassword')}
          <input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={isSaving || !password}
            className="input mt-1 w-full"
            type="password"
            autoComplete="new-password"
          />
        </label>
        {user.role !== 'owner' && (
          <label className="block text-sm text-plm-fg">
            {t('mdbSetup.accountRole')}
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as Exclude<CommunityMembershipRole, 'owner'>)
              }
              disabled={isSaving}
              className="input mt-1 w-full"
            >
              <option value="admin">{t('mdbSetup.membershipRoleAdmin')}</option>
              <option value="member">{t('mdbSetup.membershipRoleMember')}</option>
              <option value="viewer">{t('mdbSetup.membershipRoleViewer')}</option>
              <option value="guest">{t('mdbSetup.membershipRoleGuest')}</option>
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={isSaving} className="btn btn-secondary">
            {t('mdbSetup.cancel')}
          </button>
          <button onClick={() => void handleSave()} disabled={isSaving} className="btn btn-primary">
            {isSaving && <Loader2 size={15} className="animate-spin" />}
            {t('mdbSetup.saveAccount')}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
