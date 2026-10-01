import { useCallback, useEffect, useState } from 'react'
import {
  Shield,
  Key,
  Plus,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  UserCheck,
  Ban,
  Trash2,
  RefreshCw,
  FileText,
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import {
  generateAdminRecoveryCode,
  listAdminRecoveryCodes,
  revokeAdminRecoveryCode,
  deleteAdminRecoveryCode,
  type AdminRecoveryCode,
} from '@/lib/supabase'
import { copyToClipboard } from '@/lib/clipboard'
import { t } from '@/lib/i18n'

export function RecoveryCodeSettings() {
  const { user, organization, addToast, getEffectiveRole } = usePDMStore()
  const isAdmin = getEffectiveRole() === 'admin'

  const [codes, setCodes] = useState<AdminRecoveryCode[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  // Generate code dialog
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [description, setDescription] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(90)

  // Code display modal (shows ONCE after generation)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [acknowledgedWrite, setAcknowledgedWrite] = useState(false)

  // Revoke dialog
  const [revokingCode, setRevokingCode] = useState<AdminRecoveryCode | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [isRevoking, setIsRevoking] = useState(false)

  const loadCodes = useCallback(async () => {
    if (!organization) return

    setLoading(true)
    try {
      const { codes: fetchedCodes, error } = await listAdminRecoveryCodes(organization.id)
      if (error) {
        addToast('error', t('recoveryCodes.loadFailed', { error }))
      } else {
        setCodes(fetchedCodes)
      }
    } finally {
      setLoading(false)
    }
  }, [addToast, organization])

  // Load codes on mount
  useEffect(() => {
    if (organization && isAdmin) void loadCodes()
  }, [organization, isAdmin, loadCodes])

  const handleGenerate = async () => {
    if (!organization || !user) return

    setGenerating(true)
    try {
      const { success, code, error } = await generateAdminRecoveryCode(
        organization.id,
        user.id,
        description || undefined,
        expiresInDays,
      )

      if (success && code) {
        setGeneratedCode(code)
        setShowGenerateDialog(false)
        setDescription('')
        setExpiresInDays(90)
        void loadCodes()
      } else {
        addToast('error', error || t('recoveryCodes.generateFailed'))
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleCopyCode = async () => {
    if (!generatedCode) return

    const result = await copyToClipboard(generatedCode)
    if (result.success) {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } else {
      addToast('error', t('recoveryCodes.copyFailed'))
    }
  }

  const handleCloseCodeModal = () => {
    if (!acknowledgedWrite) {
      addToast('warning', t('recoveryCodes.confirmWrittenDown'))
      return
    }
    setGeneratedCode(null)
    setAcknowledgedWrite(false)
    setCodeCopied(false)
  }

  const handleRevoke = async () => {
    if (!revokingCode || !user) return

    setIsRevoking(true)
    try {
      const { success, error } = await revokeAdminRecoveryCode(
        revokingCode.id,
        user.id,
        revokeReason || undefined,
      )

      if (success) {
        addToast('success', t('recoveryCodes.revoked'))
        setRevokingCode(null)
        setRevokeReason('')
        void loadCodes()
      } else {
        addToast('error', error || t('recoveryCodes.revokeFailed'))
      }
    } finally {
      setIsRevoking(false)
    }
  }

  const handleDelete = async (codeId: string) => {
    const { success, error } = await deleteAdminRecoveryCode(codeId)

    if (success) {
      addToast('success', t('recoveryCodes.deleted'))
      void loadCodes()
    } else {
      addToast('error', error || t('recoveryCodes.deleteFailed'))
    }
  }

  const getCodeStatus = (code: AdminRecoveryCode) => {
    if (code.is_used)
      return { label: t('recoveryCodes.statusUsed'), color: 'text-plm-success', icon: UserCheck }
    if (code.is_revoked)
      return { label: t('recoveryCodes.statusRevoked'), color: 'text-plm-error', icon: Ban }
    if (new Date(code.expires_at) < new Date())
      return { label: t('recoveryCodes.statusExpired'), color: 'text-plm-fg-muted', icon: Clock }
    return { label: t('recoveryCodes.statusActive'), color: 'text-plm-accent', icon: Key }
  }

  const formatDate = (date: string | null) => {
    if (!date) return t('recoveryCodes.unknownDate')
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Non-admin view
  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <Shield size={40} className="mx-auto mb-4 text-plm-fg-muted opacity-50" />
        <p className="text-base text-plm-fg-muted">{t('recoveryCodes.adminOnly')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-plm-accent/10 flex items-center justify-center">
            <Key size={20} className="text-plm-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-plm-fg">{t('recoveryCodes.title')}</h2>
            <p className="text-sm text-plm-fg-muted">{t('recoveryCodes.subtitle')}</p>
          </div>
        </div>

        <button
          onClick={() => setShowGenerateDialog(true)}
          className="px-4 py-2 bg-plm-accent text-white rounded-lg hover:bg-plm-accent-hover transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          {t('recoveryCodes.generateCode')}
        </button>
      </div>

      {/* Warning Banner */}
      <div className="p-4 bg-plm-warning/10 border border-plm-warning/30 rounded-lg flex items-start gap-3">
        <AlertTriangle size={20} className="text-plm-warning flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-plm-warning">{t('recoveryCodes.securityTitle')}</p>
          <p className="text-plm-fg-muted mt-1">{t('recoveryCodes.securityDescription')}</p>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={24} className="animate-spin text-plm-fg-muted" />
        </div>
      )}

      {/* Empty state */}
      {!loading && codes.length === 0 && (
        <div className="text-center py-12 border border-plm-border rounded-lg bg-plm-bg-secondary">
          <Key size={40} className="mx-auto mb-4 text-plm-fg-muted opacity-50" />
          <p className="text-plm-fg-muted mb-2">{t('recoveryCodes.emptyTitle')}</p>
          <p className="text-sm text-plm-fg-muted/70 max-w-md mx-auto">
            {t('recoveryCodes.emptyDescription')}
          </p>
        </div>
      )}

      {/* Codes list */}
      {!loading && codes.length > 0 && (
        <div className="space-y-3">
          {codes.map((code) => {
            const status = getCodeStatus(code)
            const StatusIcon = status.icon

            return (
              <div
                key={code.id}
                className="p-4 border border-plm-border rounded-lg bg-plm-bg-secondary hover:bg-plm-bg-tertiary transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        code.is_used
                          ? 'bg-plm-success/10'
                          : code.is_revoked
                            ? 'bg-plm-error/10'
                            : new Date(code.expires_at) < new Date()
                              ? 'bg-plm-bg-tertiary'
                              : 'bg-plm-accent/10'
                      }`}
                    >
                      <StatusIcon size={16} className={status.color} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            code.is_used
                              ? 'bg-plm-success/10 text-plm-success'
                              : code.is_revoked
                                ? 'bg-plm-error/10 text-plm-error'
                                : new Date(code.expires_at) < new Date()
                                  ? 'bg-plm-bg-tertiary text-plm-fg-muted'
                                  : 'bg-plm-accent/10 text-plm-accent'
                          }`}
                        >
                          {status.label}
                        </span>
                        {code.description && (
                          <span className="text-sm text-plm-fg">{code.description}</span>
                        )}
                      </div>

                      <div className="mt-2 text-xs text-plm-fg-muted space-y-1">
                        <p>{t('recoveryCodes.createdAt', { date: formatDate(code.created_at) })}</p>
                        <p>{t('recoveryCodes.expiresAt', { date: formatDate(code.expires_at) })}</p>
                        {code.is_used && code.used_at && (
                          <p className="text-plm-success">
                            {t('recoveryCodes.usedAt', { date: formatDate(code.used_at) })}
                          </p>
                        )}
                        {code.is_revoked && code.revoked_at && (
                          <p className="text-plm-error">
                            {t('recoveryCodes.revokedAt', { date: formatDate(code.revoked_at) })}
                            {code.revoke_reason && ` - ${code.revoke_reason}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Only show revoke for active codes */}
                    {!code.is_used &&
                      !code.is_revoked &&
                      new Date(code.expires_at) > new Date() && (
                        <button
                          onClick={() => setRevokingCode(code)}
                          className="px-3 py-1.5 text-sm text-plm-error hover:bg-plm-error/10 rounded transition-colors"
                        >
                          {t('recoveryCodes.revoke')}
                        </button>
                      )}

                    {/* Delete for used/revoked/expired codes */}
                    {(code.is_used ||
                      code.is_revoked ||
                      new Date(code.expires_at) < new Date()) && (
                      <button
                        onClick={() => handleDelete(code.id)}
                        className="p-1.5 text-plm-fg-muted hover:text-plm-error hover:bg-plm-error/10 rounded transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Generate Code Dialog */}
      {showGenerateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-plm-bg border border-plm-border rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-plm-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-plm-accent/10 flex items-center justify-center">
                  <Key size={20} className="text-plm-accent" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-plm-fg">
                    {t('recoveryCodes.generateDialogTitle')}
                  </h3>
                  <p className="text-sm text-plm-fg-muted">
                    {t('recoveryCodes.generateDialogSubtitle')}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Warning */}
              <div className="p-3 bg-plm-warning/10 border border-plm-warning/30 rounded flex items-start gap-2">
                <AlertTriangle size={16} className="text-plm-warning flex-shrink-0 mt-0.5" />
                <p className="text-xs text-plm-warning">{t('recoveryCodes.oneTimeWarning')}</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-plm-fg mb-1">
                  {t('recoveryCodes.descriptionOptional')}
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('recoveryCodes.descriptionPlaceholder')}
                  className="w-full px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded text-plm-fg placeholder:text-plm-fg-muted focus:outline-none focus:ring-2 focus:ring-plm-accent"
                />
                <p className="text-xs text-plm-fg-muted mt-1">
                  {t('recoveryCodes.descriptionHelp')}
                </p>
              </div>

              {/* Expiration */}
              <div>
                <label className="block text-sm font-medium text-plm-fg mb-1">
                  {t('recoveryCodes.expiresIn')}
                </label>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded text-plm-fg focus:outline-none focus:ring-2 focus:ring-plm-accent"
                >
                  <option value={30}>{t('recoveryCodes.days', { count: 30 })}</option>
                  <option value={90}>{t('recoveryCodes.days', { count: 90 })}</option>
                  <option value={180}>{t('recoveryCodes.months', { count: 6 })}</option>
                  <option value={365}>{t('recoveryCodes.years', { count: 1 })}</option>
                  <option value={730}>{t('recoveryCodes.years', { count: 2 })}</option>
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-plm-border flex justify-end gap-3">
              <button
                onClick={() => setShowGenerateDialog(false)}
                className="px-4 py-2 text-plm-fg-muted hover:text-plm-fg transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 bg-plm-accent text-white rounded hover:bg-plm-accent-hover transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    {t('recoveryCodes.generating')}
                  </>
                ) : (
                  <>
                    <Key size={16} />
                    {t('recoveryCodes.generateCode')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generated Code Display Modal */}
      {generatedCode && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-plm-bg border border-plm-border rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="p-6 border-b border-plm-border bg-plm-warning/5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-plm-warning/10 flex items-center justify-center">
                  <AlertTriangle size={24} className="text-plm-warning" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-plm-fg">
                    {t('recoveryCodes.writeDownTitle')}
                  </h3>
                  <p className="text-sm text-plm-warning">{t('recoveryCodes.onlyTimeShown')}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* The Code */}
              <div className="text-center">
                <p className="text-sm text-plm-fg-muted mb-3">{t('recoveryCodes.yourCode')}</p>
                <div className="relative">
                  <div className="bg-plm-bg-secondary border-2 border-dashed border-plm-accent rounded-lg p-6">
                    <code className="text-3xl font-mono font-bold tracking-wider text-plm-accent">
                      {generatedCode}
                    </code>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="absolute top-2 right-2 p-2 text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-tertiary rounded transition-colors"
                    title={t('recoveryCodes.copyToClipboard')}
                  >
                    {codeCopied ? (
                      <Check size={20} className="text-plm-success" />
                    ) : (
                      <Copy size={20} />
                    )}
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-3">
                <h4 className="font-medium text-plm-fg flex items-center gap-2">
                  <FileText size={16} />
                  {t('recoveryCodes.nextStepsTitle')}
                </h4>
                <ol className="text-sm text-plm-fg-muted space-y-2 list-decimal list-inside">
                  <li>{t('recoveryCodes.nextStepWrite')}</li>
                  <li>{t('recoveryCodes.nextStepStore')}</li>
                  <li>{t('recoveryCodes.nextStepTell')}</li>
                  <li>{t('recoveryCodes.nextStepAvoidDigital')}</li>
                </ol>
              </div>

              {/* How to use */}
              <div className="p-3 bg-plm-bg-secondary rounded-lg">
                <h4 className="font-medium text-plm-fg text-sm mb-2">
                  {t('recoveryCodes.useTitle')}
                </h4>
                <p className="text-xs text-plm-fg-muted">{t('recoveryCodes.useDescription')}</p>
              </div>

              {/* Acknowledgment */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledgedWrite}
                  onChange={(e) => setAcknowledgedWrite(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-plm-border text-plm-accent focus:ring-plm-accent"
                />
                <span className="text-sm text-plm-fg">{t('recoveryCodes.acknowledgement')}</span>
              </label>
            </div>

            <div className="p-4 border-t border-plm-border">
              <button
                onClick={handleCloseCodeModal}
                disabled={!acknowledgedWrite}
                className="w-full px-4 py-2 bg-plm-accent text-white rounded hover:bg-plm-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {acknowledgedWrite ? t('recoveryCodes.doneClose') : t('recoveryCodes.confirmSaved')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Code Dialog */}
      {revokingCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-plm-bg border border-plm-border rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-plm-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-plm-error/10 flex items-center justify-center">
                  <Ban size={20} className="text-plm-error" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-plm-fg">
                    {t('recoveryCodes.revokeDialogTitle')}
                  </h3>
                  <p className="text-sm text-plm-fg-muted">
                    {t('recoveryCodes.revokeDialogSubtitle')}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-plm-fg-muted">
                {revokingCode.description
                  ? t('recoveryCodes.revokeConfirmNamed', {
                      description: revokingCode.description,
                    })
                  : t('recoveryCodes.revokeConfirm')}
              </p>

              <div>
                <label className="block text-sm font-medium text-plm-fg mb-1">
                  {t('recoveryCodes.reasonOptional')}
                </label>
                <input
                  type="text"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder={t('recoveryCodes.reasonPlaceholder')}
                  className="w-full px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded text-plm-fg placeholder:text-plm-fg-muted focus:outline-none focus:ring-2 focus:ring-plm-accent"
                />
              </div>
            </div>

            <div className="p-4 border-t border-plm-border flex justify-end gap-3">
              <button
                onClick={() => {
                  setRevokingCode(null)
                  setRevokeReason('')
                }}
                className="px-4 py-2 text-plm-fg-muted hover:text-plm-fg transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleRevoke}
                disabled={isRevoking}
                className="px-4 py-2 bg-plm-error text-white rounded hover:bg-plm-error/80 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isRevoking ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    {t('recoveryCodes.revoking')}
                  </>
                ) : (
                  <>
                    <Ban size={16} />
                    {t('recoveryCodes.revokeCode')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
