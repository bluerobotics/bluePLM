import { useEffect, useState } from 'react'
import { Copy, KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { copyToClipboard } from '@/lib/clipboard'
import {
  confirmCommunityTotpEnrollment,
  disableCommunityTotp,
  getCommunityTotpStatus,
  startCommunityTotpEnrollment,
  type CommunityTotpEnrollment,
} from '@/lib/community'
import { usePDMStore } from '@/stores/pdmStore'
import { log } from '@/lib/logger'

export function CommunityAuthenticatorSettings() {
  const { t } = useTranslation()
  const { addToast } = usePDMStore()
  const [isLoading, setIsLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [enrollment, setEnrollment] = useState<CommunityTotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    void getCommunityTotpStatus()
      .then((status) => setEnabled(status.enabled))
      .catch((error) => {
        log.error('[CommunityAuthenticatorSettings]', 'Failed to load authenticator status', {
          error,
        })
        addToast('error', t('mdbSetup.authenticatorLoadFailed'))
      })
      .finally(() => setIsLoading(false))
  }, [addToast, t])

  const startEnrollment = async () => {
    setIsSaving(true)
    try {
      setEnrollment(await startCommunityTotpEnrollment())
      setCode('')
    } catch (error) {
      log.error('[CommunityAuthenticatorSettings]', 'Failed to start authenticator setup', {
        error,
      })
      addToast('error', t('mdbSetup.authenticatorStartFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const confirmEnrollment = async () => {
    if (!enrollment || !/^\d{6}$/.test(code)) return
    setIsSaving(true)
    try {
      await confirmCommunityTotpEnrollment(enrollment.enrollmentToken, code)
      setEnabled(true)
      setEnrollment(null)
      setCode('')
      addToast('success', t('mdbSetup.authenticatorEnabled'))
    } catch (error) {
      log.error('[CommunityAuthenticatorSettings]', 'Failed to confirm authenticator setup', {
        error,
      })
      addToast('error', t('mdbSetup.authenticatorConfirmFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const disable = async () => {
    if (!/^\d{6}$/.test(code)) return
    setIsSaving(true)
    try {
      await disableCommunityTotp(code)
      setEnabled(false)
      setCode('')
      addToast('success', t('mdbSetup.authenticatorDisabled'))
    } catch (error) {
      log.error('[CommunityAuthenticatorSettings]', 'Failed to disable authenticator', { error })
      addToast('error', t('mdbSetup.authenticatorDisableFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const copy = async (value: string) => {
    await copyToClipboard(value)
    addToast('success', t('mdbSetup.copied'))
  }

  return (
    <section>
      <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
        {t('mdbSetup.authenticatorApp')}
      </h2>
      <div className="p-4 bg-plm-bg rounded-lg border border-plm-border space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-lg ${enabled ? 'bg-plm-success/15 text-plm-success' : 'bg-plm-highlight text-plm-fg-muted'}`}
          >
            {enabled ? <ShieldCheck size={20} /> : <KeyRound size={20} />}
          </div>
          <div className="flex-1">
            <div className="text-base font-medium text-plm-fg">
              {enabled ? t('mdbSetup.authenticatorActive') : t('mdbSetup.authenticatorInactive')}
            </div>
            <p className="text-sm text-plm-fg-muted mt-1">{t('mdbSetup.authenticatorHelp')}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-plm-fg-muted">
            <Loader2 size={16} className="animate-spin" /> {t('mdbSetup.loading')}
          </div>
        ) : enrollment ? (
          <div className="space-y-3 border-t border-plm-border pt-4">
            <p className="text-sm text-plm-fg-muted">{t('mdbSetup.authenticatorEnrollmentHelp')}</p>
            <div>
              <label className="text-xs text-plm-fg-muted">
                {t('mdbSetup.authenticatorSecret')}
              </label>
              <div className="flex gap-2 mt-1">
                <code className="flex-1 px-3 py-2 rounded bg-plm-bg-light border border-plm-border text-plm-fg break-all">
                  {enrollment.secret}
                </code>
                <button
                  className="btn btn-secondary"
                  onClick={() => void copy(enrollment.secret)}
                  title={t('mdbSetup.copy')}
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-plm-fg-muted">
                {t('mdbSetup.authenticatorSetupUri')}
              </label>
              <div className="flex gap-2 mt-1">
                <code className="flex-1 px-3 py-2 rounded bg-plm-bg-light border border-plm-border text-plm-fg text-xs break-all">
                  {enrollment.provisioningUri}
                </code>
                <button
                  className="btn btn-secondary"
                  onClick={() => void copy(enrollment.provisioningUri)}
                  title={t('mdbSetup.copy')}
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
            <label className="block text-sm text-plm-fg">
              {t('mdbSetup.authenticatorCode')}
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input mt-1 w-full"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setEnrollment(null)
                  setCode('')
                }}
                disabled={isSaving}
              >
                {t('mdbSetup.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void confirmEnrollment()}
                disabled={isSaving || code.length !== 6}
              >
                {isSaving && <Loader2 size={16} className="animate-spin" />}
                {t('mdbSetup.enableAuthenticator')}
              </button>
            </div>
          </div>
        ) : enabled ? (
          <div className="space-y-3 border-t border-plm-border pt-4">
            <label className="block text-sm text-plm-fg">
              {t('mdbSetup.authenticatorCodeToDisable')}
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input mt-1 w-full"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
              />
            </label>
            <button
              className="btn btn-danger"
              onClick={() => void disable()}
              disabled={isSaving || code.length !== 6}
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <ShieldOff size={16} />}
              {t('mdbSetup.disableAuthenticator')}
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => void startEnrollment()}
            disabled={isSaving}
          >
            {isSaving && <Loader2 size={16} className="animate-spin" />}
            {t('mdbSetup.setUpAuthenticator')}
          </button>
        )}
      </div>
    </section>
  )
}
