import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Database, ExternalLink, Loader2 } from 'lucide-react'

import { useTranslation } from '@/lib/i18n'
import { getCurrentConfig } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type {
  DbUpgradeBundleInfo,
  DbUpgradeError,
  DbUpgradePlanStep,
} from '@/types/electron/dbUpgrade'

import { BlockingScreen } from './BlockingScreen'
import {
  applyDbUpgrade,
  dbUpgradeContext,
  planDbUpgrade,
  submitConnectionString,
} from './dbUpgradeActions'
import { estimatePending, projectRefFromUrl, REQUIRED_SCHEMA_VERSION } from './gateDecision'

/** Error codes from the main process to their message keys. */
const ERROR_KEYS: Record<string, string> = {
  format: 'dbUpgrade.error.format',
  'transaction-pooler': 'dbUpgrade.error.transactionPooler',
  'no-password': 'dbUpgrade.error.noPassword',
  'password-brackets': 'dbUpgrade.error.passwordBrackets',
  'project-mismatch': 'dbUpgrade.error.projectMismatch',
  'no-credential': 'dbUpgrade.error.noCredential',
  connect: 'dbUpgrade.error.connect',
  running: 'dbUpgrade.error.running',
}

function useStepLabel() {
  const { t } = useTranslation()
  return (step: DbUpgradePlanStep): string => {
    switch (step.kind) {
      case 'baseline':
        return t('dbUpgrade.stepBaseline')
      case 'legacy':
        return t('dbUpgrade.stepLegacy')
      case 'adopt':
        return t('dbUpgrade.stepAdopt')
      case 'verify':
        return t('dbUpgrade.stepVerify')
      default:
        return step.name
    }
  }
}

function ErrorDetails({ error }: { error: DbUpgradeError }) {
  const { t } = useTranslation()
  const stepLabel = useStepLabel()
  return (
    <div className="space-y-2 rounded border border-plm-error/50 bg-plm-bg p-3 text-xs">
      <p className="font-medium text-plm-error">{error.message}</p>
      {error.step && <p>{t('dbUpgrade.errorStep', { name: stepLabel(error.step) })}</p>}
      {error.file && (
        <p>
          {error.line !== null
            ? t('dbUpgrade.errorFile', { file: error.file, line: error.line })
            : t('dbUpgrade.errorFileNoLine', { file: error.file })}
        </p>
      )}
      {error.detail && <p>{t('dbUpgrade.errorDetail', { detail: error.detail })}</p>}
      {error.hint && <p>{t('dbUpgrade.errorHint', { hint: error.hint })}</p>}
      {error.where && <p>{t('dbUpgrade.errorWhere', { where: error.where })}</p>}
      {error.statement && (
        <div>
          <p className="mb-1 text-plm-fg-muted">{t('dbUpgrade.errorStatement')}</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-plm-bg-secondary p-2 font-mono">
            {error.statement}
          </pre>
        </div>
      )}
      {error.step && <p className="text-plm-fg-muted">{t('dbUpgrade.failedRolledBack')}</p>}
    </div>
  )
}

/** An org admin on the desktop app: give the connection once, check, apply. */
export function AdminUpgradeScreen() {
  const { t } = useTranslation()
  const stepLabel = useStepLabel()
  const recordedVersion = usePDMStore((s) => s.dbGate.recordedVersion)
  const run = usePDMStore((s) => s.dbUpgradeRun)
  const [bundle, setBundle] = useState<DbUpgradeBundleInfo | null>(null)
  const [connectionString, setConnectionString] = useState('')
  const [remember, setRemember] = useState(false)
  const [canRemember, setCanRemember] = useState(false)
  const [remembered, setRemembered] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)

  useEffect(() => {
    const api = window.electronAPI?.dbUpgrade
    const ctx = dbUpgradeContext()
    if (!api) return
    void api.getBundle().then(setBundle)
    if (ctx) {
      void api.getCredentialStatus(ctx).then((status) => {
        setCanRemember(status.canRemember)
        setRemembered(status.remembered)
        setRemember(status.remembered)
      })
    }
  }, [])

  const busy = run.phase === 'planning' || run.phase === 'applying'
  const done = run.phase === 'succeeded'

  /** Hands over a typed string first; with none typed, the held or remembered one is used. */
  const withCredential = async (action: () => Promise<void>) => {
    setInputError(null)
    if (connectionString.trim()) {
      const error = await submitConnectionString(connectionString, remember && canRemember)
      if (error) {
        setInputError(error)
        return
      }
      // The string now lives only in the main process.
      setConnectionString('')
      setRemembered(remember && canRemember)
    }
    await action()
  }

  const projectRef = projectRefFromUrl(getCurrentConfig()?.url)
  const dashboardUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}?showConnect=true`
    : 'https://supabase.com/dashboard'

  const estimate = estimatePending(recordedVersion, bundle?.migrations ?? [])
  const plannedSteps = run.plan?.steps ?? null
  const progress = run.progress
  const result = run.result
  const refusal = run.plan?.refusal ?? null

  const errorKey = inputError ?? run.errorCode
  const errorText = errorKey
    ? t(ERROR_KEYS[errorKey] ?? 'dbUpgrade.error.connect', { message: run.errorMessage ?? '' })
    : null

  return (
    <BlockingScreen icon={<Database size={28} />} title={t(recordedVersion === null ? 'dbUpgrade.setupTitle' : 'dbUpgrade.adminTitle')}>
      <p>
        {recordedVersion === null
          ? t('dbUpgrade.adminIntroUnknown')
          : t('dbUpgrade.adminIntro', { from: recordedVersion, to: REQUIRED_SCHEMA_VERSION })}
      </p>

      {run.automatic && run.phase === 'applying' && (
        <p className="text-plm-info">{t('dbUpgrade.automaticNotice')}</p>
      )}

      <div>
        <h2 className="mb-1 font-medium">{t('dbUpgrade.pendingHeading')}</h2>
        <ol className="list-decimal space-y-0.5 pl-5 font-mono text-xs">
          {plannedSteps
            ? plannedSteps.map((step, index) => {
                const current =
                  run.phase === 'applying' && progress?.phase === 'step' && progress.stepIndex === index
                return (
                  <li key={`${step.kind}-${step.name}`} className={current ? 'text-plm-accent' : ''}>
                    {stepLabel(step)}
                  </li>
                )
              })
            : [
                ...(estimate.needsLegacy ? [<li key="legacy">{t('dbUpgrade.stepLegacy')}</li>] : []),
                ...estimate.migrations.map((m) => <li key={m.name}>{m.name}</li>),
                ...(estimate.unknownStart
                  ? [<li key="unknown">{t('dbUpgrade.stepUnknown')}</li>]
                  : [<li key="verify">{t('dbUpgrade.stepVerify')}</li>]),
              ]}
        </ol>
      </div>

      {!done && (
        <div className="space-y-2">
          <label className="block font-medium" htmlFor="db-upgrade-connection">
            {t('dbUpgrade.connectionLabel')}
          </label>
          <p className="text-xs text-plm-fg-muted">{t('dbUpgrade.connectionHelp')}</p>
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-plm-accent hover:underline"
          >
            <ExternalLink size={12} />
            {t('dbUpgrade.openDashboard')}
          </a>
          {remembered && !connectionString && (
            <p className="text-xs text-plm-success">{t('dbUpgrade.usingRemembered')}</p>
          )}
          <input
            id="db-upgrade-connection"
            type="password"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            placeholder="postgresql://postgres.<project>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres"
            className="w-full rounded border border-plm-border bg-plm-input px-2 py-1.5 font-mono text-xs"
          />
          {canRemember ? (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={remember}
                disabled={busy}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t('dbUpgrade.remember')}</span>
            </label>
          ) : (
            <p className="text-xs text-plm-fg-muted">{t('dbUpgrade.rememberUnavailable')}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void withCredential(planDbUpgrade)}
              className="btn btn-secondary"
            >
              {t('dbUpgrade.check')}
            </button>
            <button
              type="button"
              disabled={busy || !!refusal}
              onClick={() => void withCredential(() => applyDbUpgrade(false))}
              className="btn btn-primary"
            >
              {t('dbUpgrade.apply')}
            </button>
            {remembered && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void window.electronAPI?.dbUpgrade.forgetCredential().then(() => {
                    setRemembered(false)
                    setRemember(false)
                  })
                }}
                className="btn btn-ghost text-xs"
              >
                {t('dbUpgrade.forget')}
              </button>
            )}
          </div>
        </div>
      )}

      {busy && (
        <p className="flex items-center gap-2 text-plm-fg-muted">
          <Loader2 size={14} className="animate-spin" />
          {run.phase === 'planning' || progress?.phase === 'planning' || !progress
            ? t('dbUpgrade.planning')
            : progress.phase === 'waiting-for-lock'
              ? t('dbUpgrade.waitingForLock')
              : progress.step && progress.stepIndex !== undefined && progress.stepCount
                ? t('dbUpgrade.progressStep', {
                    index: progress.stepIndex + 1,
                    count: progress.stepCount,
                    name: stepLabel(progress.step),
                  })
                : t('dbUpgrade.planning')}
        </p>
      )}

      {run.phase === 'planned' && run.plan?.upToDate && (
        <p className="text-plm-success">{t('dbUpgrade.upToDate')}</p>
      )}
      {refusal && <p className="text-plm-error">{t('dbUpgrade.refused', { message: refusal.message })}</p>}

      {done && (
        <p className="flex items-center gap-2 text-plm-success">
          <CheckCircle2 size={16} />
          {t('dbUpgrade.succeeded', { version: result?.finalVersion ?? '' })}
        </p>
      )}

      {errorText && (
        <p className="flex items-start gap-2 text-plm-error">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {errorText}
        </p>
      )}
      {run.phase === 'failed' && result?.error && !refusal && (
        <div>
          <h2 className="mb-1 font-medium text-plm-error">{t('dbUpgrade.failedTitle')}</h2>
          <ErrorDetails error={result.error} />
        </div>
      )}
    </BlockingScreen>
  )
}
