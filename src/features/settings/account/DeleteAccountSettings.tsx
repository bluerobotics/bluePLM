import { useState } from 'react'
import { AlertTriangle, Loader2, Trash2, UserX } from 'lucide-react'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
import { deleteCurrentAccount, signOut } from '@/lib/supabase'
import { t } from '@/lib/i18n'

export function DeleteAccountSettings() {
  const { user, setUser, setOrganization, addToast } = usePDMStore()
  const [confirmationText, setConfirmationText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  if (!user) {
    return (
      <div className="text-center py-12 text-plm-fg-muted text-base">
        {t('deleteAccount.notSignedIn')}
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
      const { error } = await deleteCurrentAccount()

      if (error) {
        log.error('[Account]', 'Failed to delete account', { error })
        addToast('error', t('deleteAccount.failed', { error: error.message }))
        setIsDeleting(false)
        return
      }

      // Sign out after successful deletion
      await signOut()
      setUser(null)
      setOrganization(null)

      addToast('success', t('deleteAccount.deleted'))
    } catch (error) {
      log.error('[Account]', 'Error deleting account', { error: error })
      addToast('error', t('deleteAccount.unexpectedError'))
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
            <h2 className="text-lg font-semibold text-plm-fg">{t('deleteAccount.title')}</h2>
            <p className="text-sm text-plm-fg-muted">{t('deleteAccount.subtitle')}</p>
          </div>
        </div>
      </section>

      {/* What happens section */}
      <section className="p-4 bg-plm-bg rounded-lg border border-plm-border">
        <h3 className="text-base font-medium text-plm-fg mb-3">{t('deleteAccount.whatHappens')}</h3>
        <ul className="space-y-2 text-sm text-plm-fg-muted">
          <li className="flex items-start gap-2">
            <span className="text-plm-error mt-0.5">•</span>
            <span>{t('deleteAccount.profileDeleted')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-plm-error mt-0.5">•</span>
            <span>{t('deleteAccount.removedFromOrganization')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-plm-error mt-0.5">•</span>
            <span>{t('deleteAccount.teamMembershipsRemoved')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-plm-error mt-0.5">•</span>
            <span>{t('deleteAccount.sessionsTerminated')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-plm-error mt-0.5">•</span>
            <span>{t('deleteAccount.checkoutsReleased')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-plm-warning mt-0.5">•</span>
            <span className="text-plm-warning">{t('deleteAccount.auditHistoryPreserved')}</span>
          </li>
        </ul>
      </section>

      {/* Warning banner */}
      <section className="p-4 bg-plm-error/10 border border-plm-error/30 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-plm-error flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-base font-medium text-plm-error">
              {t('deleteAccount.irreversible')}
            </p>
            <p className="text-sm text-plm-error/80 mt-1">
              {t('deleteAccount.irreversibleDescription')}
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
            {t('deleteAccount.requestDelete')}
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-plm-fg-muted mb-2">
                {t('deleteAccount.confirmPrefix')}{' '}
                <span className="font-mono font-semibold text-plm-fg bg-plm-bg-secondary px-1.5 py-0.5 rounded">
                  {requiredConfirmation}
                </span>{' '}
                {t('deleteAccount.confirmSuffix')}
              </label>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={t('deleteAccount.confirmPlaceholder', {
                  value: requiredConfirmation,
                })}
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
                    {t('deleteAccount.deleting')}
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    {t('deleteAccount.deletePermanently')}
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
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
