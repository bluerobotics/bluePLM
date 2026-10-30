// One review item: its pinned version, the drawing PDF, a download of the reviewed version, the
// caller's decision when they owe one, who else still owes it, and every round's decisions.
import { useEffect, useState, type ReactNode } from 'react'
import { Download, ExternalLink, FileQuestion, FileX, Loader2 } from 'lucide-react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { respondToItems } from '@/lib/supabase/reviews'
import type { ReviewDecision, ReviewDetail, ReviewItemDetail, ReviewUser } from '@/types/reviews'
import { DECISIONS, decisionNeedsComment, displayName, planItemPreview, validateDecision } from './reviewLogic'
import { downloadVaultBlob, signedVaultDownloadUrl } from './reviewsApi'
import { buttonClass, describeReviewError, inputClass, Notice, primaryButtonClass, startDownload } from './reviewUi'

interface ItemPanelProps {
  detail: ReviewDetail
  item: ReviewItemDetail
  /** User ids that still owe this item in the current round. */
  owedBy: string[]
  users: Map<string, ReviewUser>
  onDecided: (message?: string) => Promise<void>
}

export function ItemPanel({ detail, item, owedBy, users, onDecided }: ItemPanelProps) {
  const t = useT()
  const auth = useReadyAuth()
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const mine = detail.me.canRespond && detail.me.owedItemIds.includes(item.id)
  const others = owedBy.filter((id) => id !== detail.me.userId)
  const nameOf = (id: string) => displayName(users.get(id)) ?? t('reviews.detail.unknownUser')

  const download = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      startDownload(await signedVaultDownloadUrl(auth.organization.id, item.version.contentHash, item.file.fileName))
    } catch (err) {
      setDownloadError(t('reviews.download.failed', { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-plm-fg" title={item.file.filePath}>
          {item.file.fileName}
        </h2>
        <button type="button" className={buttonClass} disabled={downloading || item.file.deleted} onClick={() => void download()}>
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {t('reviews.download.button', { version: item.version.version })}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-plm-fg-muted">
        <span className="break-all">{item.file.filePath}</span>
        {item.version.revision && <span>{t('reviews.detail.revision', { revision: item.version.revision })}</span>}
        <span>{t(`reviews.detail.itemOutcome.${item.outcome}`)}</span>
        {item.file.latestVersion !== null && item.file.latestVersion > item.version.version && (
          <span className="text-plm-warning">{t('reviews.detail.newerExists', { version: item.file.latestVersion })}</span>
        )}
        {item.file.deleted && <span className="text-plm-error">{t('reviews.detail.deleted')}</span>}
      </div>
      {downloadError && <Notice tone="error">{downloadError}</Notice>}

      <PdfView item={item} orgId={auth.organization.id} />

      {mine && <DecisionBar reviewId={detail.review.id} itemId={item.id} onDecided={onDecided} />}
      {others.length > 0 && (
        <p className="text-xs text-plm-fg-muted">{t('reviews.detail.owedBy', { names: others.map(nameOf).join(', ') })}</p>
      )}

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase text-plm-fg-muted">{t('reviews.detail.history')}</h3>
        {item.rounds.every((r) => r.decisions.length === 0 && !r.carriedForward) ? (
          <p className="text-sm text-plm-fg-muted">{t('reviews.detail.noDecisions')}</p>
        ) : (
          <ol className="space-y-2">
            {[...item.rounds]
              .sort((a, b) => b.roundNumber - a.roundNumber)
              .map((round) => (
                <li key={round.roundNumber} className="rounded border border-plm-border p-2">
                  <p className="text-xs text-plm-fg-muted">
                    {t('reviews.detail.roundHeading', {
                      round: round.roundNumber,
                      version: round.version !== null ? t('reviews.detail.version', { version: round.version }) : '',
                    })}
                    {' · '}
                    {round.carriedForward
                      ? t('reviews.detail.carried')
                      : t(`reviews.detail.itemOutcome.${round.outcome}`)}
                  </p>
                  {round.decisions.length > 0 && (
                    <ul className="mt-1 space-y-1">
                      {round.decisions.map((d) => (
                        <li key={`${d.reviewerId}-${d.decidedAt}`} className="text-sm">
                          <span className="text-plm-fg">{nameOf(d.reviewerId)}</span>{' '}
                          <span className="text-plm-fg-muted">
                            {t(`reviews.decision.past.${d.decision}`)} · {new Date(d.decidedAt).toLocaleString()}
                            {d.legacy && ` · ${t('reviews.detail.legacy')}`}
                          </span>
                          {d.comment && <p className="whitespace-pre-wrap text-plm-fg-dim">{d.comment}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
          </ol>
        )}
      </section>
    </div>
  )
}

/** The pinned version's PDF, fetched from storage and shown from a `blob:` URL. */
function PdfView({ item, orgId }: { item: ReviewItemDetail; orgId: string }) {
  const t = useT()
  const plan = planItemPreview(item)
  const hash = plan.kind === 'pdfFile' || plan.kind === 'render' ? plan.storageHash : null
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hash) return
    let active = true
    let objectUrl: string | null = null
    setUrl(null)
    setError(null)
    downloadVaultBlob(orgId, hash)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
        setUrl(objectUrl)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [hash, orgId])

  if (plan.kind === 'pending') {
    return (
      <Placeholder icon={<FileQuestion size={20} />} title={t('reviews.pdf.pending')} hint={t('reviews.pdf.pendingHint')} />
    )
  }
  if (plan.kind === 'unsupported') {
    return (
      <Placeholder icon={<FileX size={20} />} title={t('reviews.pdf.unsupported')} hint={t('reviews.pdf.unsupportedHint')} />
    )
  }
  if (error) return <Notice tone="error">{t('reviews.pdf.failed', { message: error })}</Notice>
  if (!url) {
    return (
      <p className="flex items-center gap-2 text-sm text-plm-fg-muted" role="status">
        <Loader2 size={14} className="animate-spin" />
        {t('reviews.pdf.loading')}
      </p>
    )
  }
  return (
    <div>
      <div className="mb-1 flex justify-end">
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-plm-accent hover:underline">
          <ExternalLink size={12} />
          {t('reviews.pdf.openInTab')}
        </a>
      </div>
      <iframe
        src={url}
        title={t('reviews.pdf.frameTitle', { name: item.file.fileName })}
        className="h-[60vh] w-full rounded border border-plm-border bg-white lg:h-[75vh]"
      />
    </div>
  )
}

function Placeholder({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3 rounded border border-dashed border-plm-border p-4 text-plm-fg-muted">
      {icon}
      <div>
        <p className="text-sm font-medium text-plm-fg">{title}</p>
        <p className="mt-0.5 text-sm">{hint}</p>
      </div>
    </div>
  )
}

const DECISION_TONE: Record<ReviewDecision, string> = {
  approved: 'bg-plm-success/15 text-plm-success hover:bg-plm-success/25',
  approved_with_comments: 'bg-plm-success/10 text-plm-success hover:bg-plm-success/20',
  changes_requested: 'bg-plm-warning/15 text-plm-warning hover:bg-plm-warning/25',
  rejected: 'bg-plm-error/15 text-plm-error hover:bg-plm-error/25',
}

function DecisionBar({
  reviewId,
  itemId,
  onDecided,
}: {
  reviewId: string
  itemId: string
  onDecided: (message?: string) => Promise<void>
}) {
  const t = useT()
  const [pending, setPending] = useState<ReviewDecision | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (decision: ReviewDecision) => {
    const check = validateDecision(decision, comment)
    if (!check.ok) {
      setPending(decision)
      setError(t('reviews.decision.commentMissing'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await respondToItems(reviewId, [{ itemId, decision, comment: check.comment }])
      await onDecided(t('reviews.decision.sent'))
    } catch (err) {
      setError(describeReviewError(err))
    } finally {
      setBusy(false)
    }
  }

  const choose = (decision: ReviewDecision) => {
    setError(null)
    if (decision === 'approved' && !pending) {
      void send(decision)
      return
    }
    setPending(decision)
  }

  return (
    <section className="rounded border border-plm-accent/40 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase text-plm-fg-muted">{t('reviews.decision.yourDecision')}</h3>
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((d) => (
          <button
            key={d}
            type="button"
            disabled={busy}
            aria-pressed={pending === d}
            onClick={() => choose(d)}
            className={`rounded px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${DECISION_TONE[d]} ${
              pending === d ? 'ring-1 ring-current' : ''
            }`}
          >
            {t(`reviews.decision.${d}`)}
          </button>
        ))}
      </div>
      {pending && (
        <div className="mt-2 space-y-2">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            autoFocus
            aria-label={decisionNeedsComment(pending) ? t('reviews.decision.commentRequired') : t('reviews.decision.commentOptional')}
            placeholder={decisionNeedsComment(pending) ? t('reviews.decision.commentRequired') : t('reviews.decision.commentOptional')}
            className={inputClass}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void send(pending)}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              {t('reviews.decision.send')} · {t(`reviews.decision.${pending}`)}
            </button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => setPending(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </section>
  )
}
