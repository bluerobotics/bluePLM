// Small pieces shared by the folder view and the file detail page.
import { useState, type ReactNode } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { createDownloadUrl, DownloadUnavailableError, loadVaults, startDownload, type VaultSummary } from './api'
import { safeColor, stateLabel, type WorkflowStateRef } from './listing'
import { useLoad } from './useLoad'

export function useVaults() {
  const auth = useReadyAuth()
  const { id: userId, org_id: orgId } = auth.profile
  const [refresh, setRefresh] = useState(0)
  const state = useLoad<VaultSummary[]>(`${userId}:${orgId}:${auth.isAdmin}:${refresh}`, () =>
    loadVaults(userId, orgId, auth.isAdmin, refresh > 0),
  )
  return { ...state, reload: () => setRefresh((n) => n + 1) }
}

export function StateBadge({ row }: { row: { workflow_state: WorkflowStateRef | null; state: string | null } }) {
  const label = stateLabel(row)
  if (!label) return null
  const color = safeColor(row.workflow_state?.color)
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded border border-plm-border-light px-1.5 py-0.5 text-xs text-plm-fg">
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full bg-plm-fg-muted"
        style={color ? { backgroundColor: color } : undefined}
      />
      <span className="truncate">{label}</span>
    </span>
  )
}

interface DownloadButtonProps {
  orgId: string
  hash: string | null
  fileName: string
  label: string
  /** Show only the icon (the label stays as the accessible name). */
  compact?: boolean
}

export function DownloadButton({ orgId, hash, fileName, label, compact }: DownloadButtonProps) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onClick = async () => {
    setBusy(true)
    setError(null)
    try {
      startDownload(await createDownloadUrl(orgId, hash, fileName))
    } catch (err) {
      setError(
        err instanceof DownloadUnavailableError
          ? t('files.download.noContent')
          : t('files.download.failed', { message: err instanceof Error ? err.message : String(err) }),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy || !hash}
        title={hash ? label : t('files.download.noContent')}
        aria-label={label}
        className="inline-flex items-center gap-1.5 rounded border border-plm-border-light px-2 py-1 text-sm text-plm-fg hover:bg-plm-bg-lighter disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {!compact && <span>{busy ? t('files.download.working') : t('files.download.current')}</span>}
      </button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-plm-error">
          {error}
        </span>
      )}
    </span>
  )
}

export function Panel({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`min-w-0 rounded border border-plm-border p-3 ${wide ? 'lg:col-span-2' : ''}`}>
      <h2 className="mb-3 text-sm font-semibold text-plm-fg">{title}</h2>
      {children}
    </section>
  )
}
