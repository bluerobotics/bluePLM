import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileWarning, Loader2 } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import { useShallow } from 'zustand/react/shallow'
import { t } from '@/lib/i18n'
import { hasDesktop } from '@/lib/platform'
import {
  backupCopiesOf,
  listVaultObjectIssues,
  resolveVaultObjectIssue,
  restoreFromServerBackup,
  rollBackToLastGoodVersion,
  uploadLocalCopy,
  type VaultObjectIssue,
  type VaultObjectIssueRef,
} from '@/lib/vaultObjectIssues'
import { formatDate } from './utils'

const short = (hash: string | null) => (hash ? `${hash.slice(0, 12)}…` : '')

type Decision = { issueId: string; status: 'accepted' | 'unrecoverable' }

/**
 * Settings > Backup > Damaged files (admins). Every vault object a server backup or test found
 * damaged (its bytes do not hash to its name) or missing (a version names it, storage has nothing),
 * the file versions that name it, and what can be done, safest first: restore it from the server
 * backup, store this computer's copy, roll the file back to its last good version, or decide it
 * is unrecoverable (downloads then refuse it) or acceptable (with a note). Every repair that writes
 * storage is checked by the API against the content hash before and after it writes.
 */
export function DamagedFilesSection() {
  const { addToast, user, connectedVaults } = usePDMStore(
    useShallow((s) => ({ addToast: s.addToast, user: s.user, connectedVaults: s.connectedVaults })),
  )
  const [issues, setIssues] = useState<VaultObjectIssue[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [copies, setCopies] = useState<Record<string, { stored: boolean; count: number } | string>>(
    {},
  )
  const [decision, setDecision] = useState<Decision | null>(null)
  const [note, setNote] = useState('')
  const [showClosed, setShowClosed] = useState(false)

  const reload = useCallback(async () => {
    const result = await listVaultObjectIssues()
    setIssues(result.issues)
    setLoadError(result.error ?? null)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const damagedHashes = useMemo(
    () => new Set((issues ?? []).filter((i) => i.status !== 'repaired').map((i) => i.content_hash)),
    [issues],
  )

  const run = async (
    key: string,
    action: () => Promise<{ error?: string } | { success: boolean; error?: string }>,
    done: string,
  ) => {
    setBusy(key)
    try {
      const result = await action()
      if ('error' in result && result.error) addToast('error', result.error)
      else {
        addToast('success', done)
        await reload()
      }
    } finally {
      setBusy(null)
    }
  }

  const checkBackup = async (issue: VaultObjectIssue) => {
    setBusy(`copies:${issue.id}`)
    const result = await backupCopiesOf(issue.content_hash)
    setCopies((c) => ({
      ...c,
      [issue.id]: result.error
        ? result.error
        : { stored: !!result.data?.stored, count: result.data?.snapshots.length ?? 0 },
    }))
    setBusy(null)
  }

  const applyLocalCopy = async (issue: VaultObjectIssue, ref: VaultObjectIssueRef) => {
    const vault = connectedVaults.find((v) => v.id === ref.vault_id)
    if (!vault) {
      addToast('error', t('damagedFiles.localMissing'))
      return
    }
    const path = `${vault.localPath.replace(/[\\/]+$/, '')}/${ref.file_path}`
    const read = await window.electronAPI?.readFile(path)
    if (!read?.success || read.data === undefined) {
      addToast('error', t('damagedFiles.localMissing'))
      return
    }
    if (read.hash !== issue.content_hash) {
      addToast('error', t('damagedFiles.localNoMatch'))
      return
    }
    const bytes = Uint8Array.from(atob(read.data), (c) => c.charCodeAt(0))
    await run(
      `upload:${issue.id}`,
      () => uploadLocalCopy(issue.content_hash, bytes),
      t('damagedFiles.uploadDone'),
    )
  }

  if (issues === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-plm-fg-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('damagedFiles.title')}
      </div>
    )
  }

  const open = issues.filter((i) => i.status === 'open')
  const closed = issues.filter((i) => i.status !== 'open')
  const shown = showClosed ? issues : open

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <FileWarning
          className={`w-4 h-4 ${open.length ? 'text-amber-400' : 'text-plm-fg-muted'}`}
        />
        <h4 className="text-sm font-medium">{t('damagedFiles.title')}</h4>
        {closed.length > 0 && (
          <button
            className="ml-auto text-xs text-plm-fg-muted hover:text-plm-fg"
            onClick={() => setShowClosed(!showClosed)}
          >
            {showClosed
              ? t('damagedFiles.hideClosed')
              : t('damagedFiles.showClosed', { count: closed.length })}
          </button>
        )}
      </div>
      {loadError && <p className="text-xs text-plm-error">{loadError}</p>}
      {!loadError && open.length === 0 && (
        <p className="text-xs text-plm-fg-muted flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-plm-success" /> {t('damagedFiles.none')}
        </p>
      )}

      <ul className="space-y-2">
        {shown.map((issue) => {
          const latest = issue.refs.find((r) => r.is_latest && !r.file_deleted)
          const copy = copies[issue.id]
          const isOpen = issue.status === 'open'
          return (
            <li
              key={issue.id}
              className="p-3 rounded-lg border border-plm-border bg-plm-bg-secondary space-y-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 ${isOpen ? 'text-amber-400' : 'text-plm-fg-muted'}`}
                />
                <span className="font-medium">
                  {issue.kind === 'missing'
                    ? t('damagedFiles.kindMissing')
                    : t('damagedFiles.kindDamaged')}
                </span>
                <span className="text-plm-fg-muted">
                  {t('damagedFiles.foundOn', { when: formatDate(issue.first_seen_at) })}
                </span>
                <span className="ml-auto text-plm-fg-muted">
                  {t(`damagedFiles.status_${issue.status}`)}
                </span>
              </div>

              <ul className="space-y-0.5">
                {issue.refs.map((ref) => (
                  <li key={ref.file_version_id} className="break-all">
                    <span className="font-medium">{ref.file_path}</span> ·{' '}
                    {t('damagedFiles.version', { version: ref.version })}
                    {ref.is_latest && (
                      <span className="text-amber-300"> · {t('damagedFiles.current')}</span>
                    )}
                    {ref.file_deleted && (
                      <span className="text-plm-fg-muted"> · {t('damagedFiles.deleted')}</span>
                    )}
                    <span className="text-plm-fg-muted">
                      {' '}
                      ·{' '}
                      {t('damagedFiles.checkedIn', {
                        who: ref.created_by_email ?? '?',
                        when: ref.created_at ? formatDate(ref.created_at) : '?',
                      })}
                    </span>
                  </li>
                ))}
                {issue.refs.length === 0 && (
                  <li className="text-plm-fg-muted">{t('damagedFiles.noRefs')}</li>
                )}
              </ul>

              <div className="text-plm-fg-muted font-mono">
                {t('damagedFiles.expected', { hash: short(issue.content_hash) })}
                {issue.kind === 'damaged' && issue.actual_hash && (
                  <> · {t('damagedFiles.actual', { hash: short(issue.actual_hash) })}</>
                )}
              </div>

              {!isOpen && (
                <div className="text-plm-fg-muted">
                  {t('damagedFiles.resolved', {
                    who: issue.resolved_by_email ?? 'BluePLM',
                    when: issue.resolved_at ? formatDate(issue.resolved_at) : '',
                  })}
                  {issue.note && <> · {issue.note}</>}
                </div>
              )}

              {isOpen && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {copy === undefined ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={!!busy}
                      onClick={() => void checkBackup(issue)}
                    >
                      {busy === `copies:${issue.id}` && (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      )}
                      {t('damagedFiles.checkBackup')}
                    </button>
                  ) : typeof copy === 'string' ? (
                    <span className="text-plm-error">{copy}</span>
                  ) : copy.stored ? (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!!busy}
                      onClick={() =>
                        void run(
                          `restore:${issue.id}`,
                          () => restoreFromServerBackup(issue.content_hash),
                          t('damagedFiles.restoreDone'),
                        )
                      }
                    >
                      {t('damagedFiles.restore', { count: copy.count })}
                    </button>
                  ) : (
                    <span className="text-plm-fg-muted">{t('damagedFiles.backupLacks')}</span>
                  )}

                  {hasDesktop() && issue.refs.length > 0 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={!!busy}
                      onClick={() =>
                        void applyLocalCopy(
                          issue,
                          issue.refs.find((r) => r.is_latest) ?? issue.refs[0],
                        )
                      }
                    >
                      {t('damagedFiles.useLocal')}
                    </button>
                  )}

                  {latest && user && (
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={!!busy}
                      onClick={() =>
                        void run(
                          `rollback:${issue.id}`,
                          () =>
                            rollBackToLastGoodVersion(
                              issue,
                              latest,
                              { id: user.id, email: user.email },
                              damagedHashes,
                            ),
                          t('damagedFiles.rollbackDone'),
                        )
                      }
                    >
                      {t('damagedFiles.rollBack')}
                    </button>
                  )}

                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={!!busy}
                    onClick={() => {
                      setDecision({ issueId: issue.id, status: 'unrecoverable' })
                      setNote('')
                    }}
                  >
                    {t('damagedFiles.markUnrecoverable')}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={!!busy}
                    onClick={() => {
                      setDecision({ issueId: issue.id, status: 'accepted' })
                      setNote('')
                    }}
                  >
                    {t('damagedFiles.accept')}
                  </button>
                </div>
              )}

              {decision?.issueId === issue.id && (
                <div className="space-y-2 pt-1">
                  <p className="text-plm-fg-muted">
                    {decision.status === 'unrecoverable'
                      ? t('damagedFiles.unrecoverableHint')
                      : t('damagedFiles.acceptHint')}
                  </p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('damagedFiles.notePlaceholder')}
                    className="w-full px-2 py-1 rounded bg-plm-bg-primary border border-plm-border"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!!busy || (decision.status === 'accepted' && !note.trim())}
                      onClick={() =>
                        void run(
                          `decide:${issue.id}`,
                          async () => {
                            const result = await resolveVaultObjectIssue(
                              issue.id,
                              decision.status,
                              note,
                            )
                            if (result.success) setDecision(null)
                            return result
                          },
                          t('damagedFiles.decisionSaved'),
                        )
                      }
                    >
                      {t('damagedFiles.confirm')}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDecision(null)}>
                      {t('damagedFiles.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
