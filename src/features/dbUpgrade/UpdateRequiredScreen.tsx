import { useEffect, useState } from 'react'
import { Download, ExternalLink, RefreshCw } from 'lucide-react'

import { useTranslation } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { hasDesktop } from '@/lib/platform'
import { usePDMStore } from '@/stores/pdmStore'

import { BlockingScreen } from './BlockingScreen'
import { APP_VERSION } from './dbUpgradeActions'

const RELEASES_URL = 'https://github.com/bluerobotics/bluePLM/releases/latest'

/**
 * The app is below client_min_version(). The desktop downloads and installs the update on its own
 * (updater.ts mandatory mode; on macOS, which cannot install an unsigned build, the user downloads
 * it). The web build only needs a reload.
 */
export function UpdateRequiredScreen() {
  const { t } = useTranslation()
  const minVersion = usePDMStore((s) => s.dbGate.clientMinVersion) ?? ''
  const state = usePDMStore((s) => s.mandatoryUpdate)
  const setMandatoryUpdate = usePDMStore((s) => s.setMandatoryUpdate)
  const [startError, setStartError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.setMandatoryUpdate || !minVersion) return
    const unsubscribe = api.onMandatoryUpdateState((next) => setMandatoryUpdate(next))
    api
      .setMandatoryUpdate(minVersion)
      .then((result) => {
        if (!result.success) setStartError(result.error ?? null)
        else if (result.manual) {
          setMandatoryUpdate({ phase: 'manual', minVersion, downloadUrl: result.downloadUrl })
        }
      })
      .catch((error: unknown) => {
        log.warn('[DbUpgrade]', 'Mandatory update could not start', { error: String(error) })
        setStartError(String(error))
      })
    return unsubscribe
  }, [minVersion, attempt, setMandatoryUpdate])

  // The main process installs when its own countdown ends; this one only shows it.
  useEffect(() => {
    if (state?.phase !== 'installing' || state.seconds === undefined) {
      setSecondsLeft(null)
      return
    }
    setSecondsLeft(state.seconds)
    const timer = setInterval(() => setSecondsLeft((s) => (s && s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(timer)
  }, [state?.phase, state?.seconds])

  const downloadPage = state?.downloadUrl ?? RELEASES_URL

  const downloadLink = (
    <a
      href={downloadPage}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-secondary inline-flex items-center gap-2"
    >
      <ExternalLink size={14} />
      {t('dbUpgrade.updateDownloadPage')}
    </a>
  )

  if (!hasDesktop()) {
    return (
      <BlockingScreen icon={<Download size={28} />} title={t('dbUpgrade.updateTitle')}>
        <p>{t('dbUpgrade.updateBody', { min: minVersion, current: APP_VERSION })}</p>
        <p>{t('dbUpgrade.updateWebBody')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn btn-primary flex items-center gap-2"
        >
          <RefreshCw size={14} />
          {t('dbUpgrade.updateReload')}
        </button>
      </BlockingScreen>
    )
  }

  let status: string
  let failed = false
  switch (state?.phase) {
    case 'downloading':
      status = t('dbUpgrade.updateDownloading', {
        version: state.version ?? '',
        percent: Math.round(state.percent ?? 0),
      })
      break
    case 'installing':
      status = t('dbUpgrade.updateInstalling', {
        version: state.version ?? '',
        seconds: secondsLeft ?? state.seconds ?? 0,
      })
      break
    case 'no-update':
      status = t('dbUpgrade.updateNoUpdate', { min: minVersion })
      failed = true
      break
    case 'error':
      status = t('dbUpgrade.updateError', { message: state.message ?? '' })
      failed = true
      break
    case 'manual':
      status = t('dbUpgrade.updateManual')
      failed = true
      break
    default:
      status = startError
        ? t('dbUpgrade.updateError', { message: startError })
        : t('dbUpgrade.updateChecking')
      failed = !!startError
  }

  return (
    <BlockingScreen icon={<Download size={28} />} title={t('dbUpgrade.updateTitle')}>
      <p>{t('dbUpgrade.updateBody', { min: minVersion, current: APP_VERSION })}</p>
      <p className={failed ? 'text-plm-warning' : 'text-plm-fg-muted'}>{status}</p>
      {state?.phase === 'downloading' && (
        <progress className="w-full" max={100} value={Math.round(state.percent ?? 0)} />
      )}
      {failed && (
        <div className="flex flex-wrap gap-2">
          {state?.phase !== 'manual' && (
            <button
              type="button"
              onClick={() => {
                setStartError(null)
                setMandatoryUpdate(null)
                setAttempt((n) => n + 1)
              }}
              className="btn btn-primary flex items-center gap-2"
            >
              <RefreshCw size={14} />
              {t('dbUpgrade.updateRetry')}
            </button>
          )}
          {downloadLink}
        </div>
      )}
    </BlockingScreen>
  )
}
