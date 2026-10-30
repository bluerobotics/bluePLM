// `/reviews/<id>`: one review. Header and author actions, reviewers of the current round (withdrawn
// ones shown apart), the file list and the selected file's PDF, decisions and history. Every write
// is one of the review RPCs; the page re-reads the detail after each.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Ban, CheckCheck, Loader2, Pencil, RotateCcw } from 'lucide-react'
import { useT } from '@web/i18n'
import { href, Link } from '@web/lib/router'
import { EmptyState, ErrorState, Loading, PageHeader } from '@web/shell/ui'
import { approveAllRemaining, getReviewDetail, ReviewRpcError } from '@/lib/supabase/reviews'
import type { ReviewDetail, ReviewUser } from '@/types/reviews'
import { ItemPanel } from './ItemPanel'
import { CancelReviewDialog, EditMetaDialog, ResubmitDialog } from './ReviewDialogs'
import {
  activeReviewers,
  canApproveAll,
  displayName,
  dueChip,
  formatDateOnly,
  isOpenStatus,
  localDateString,
  owedByItem,
  usersById,
  withdrawnReviewers,
} from './reviewLogic'
import {
  buttonClass,
  describeReviewError,
  DueChipView,
  inputClass,
  Modal,
  Notice,
  primaryButtonClass,
  PriorityChip,
  StatusChip,
} from './reviewUi'
import { refreshReviewBadgeCount } from './useReviewBadgeCount'

type OpenDialog = 'meta' | 'cancel' | 'resubmit' | 'approveAll' | null

export function ReviewDetailPage({ reviewId }: { reviewId: string }) {
  const t = useT()
  const [detail, setDetail] = useState<ReviewDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await getReviewDetail(reviewId)
      setDetail(next)
      setError(null)
      setSelectedId((current) =>
        current && next.items.some((i) => i.id === current)
          ? current
          : (next.me.owedItemIds[0] ?? next.items[0]?.id ?? null),
      )
    } catch (err) {
      setError({
        message: describeReviewError(err),
        notFound: err instanceof ReviewRpcError && err.code === 'REVIEW_NOT_FOUND',
      })
    } finally {
      setLoading(false)
    }
  }, [reviewId])

  useEffect(() => {
    setLoading(true)
    setDetail(null)
    void load()
  }, [load])

  const afterWrite = useCallback(
    async (message?: string) => {
      setFlash(message ?? null)
      refreshReviewBadgeCount()
      await load()
    },
    [load],
  )

  const users = useMemo(() => (detail ? usersById(detail) : new Map<string, ReviewUser>()), [detail])
  const owed = useMemo(() => (detail ? owedByItem(detail) : {}), [detail])

  if (loading) return <Loading />
  if (error || !detail) {
    return (
      <div>
        <BackLink />
        {error?.notFound ? <EmptyState>{error.message}</EmptyState> : <ErrorState message={error?.message} onRetry={() => void load()} />}
      </div>
    )
  }

  const { review, me } = detail
  const today = localDateString()
  const due = isOpenStatus(review.status) ? dueChip(review.dueDate, today, review.overdue) : null
  const requester = displayName(review.requestedBy) ?? t('reviews.detail.unknownUser')
  const selected = detail.items.find((i) => i.id === selectedId) ?? null
  const currentRound = detail.rounds.find((r) => r.roundNumber === review.currentRound)
  const reviewers = activeReviewers(detail)
  const withdrawn = withdrawnReviewers(detail)

  return (
    <div>
      <BackLink />
      <PageHeader
        title={review.title}
        actions={
          <>
            {me.canEditMeta && (
              <button type="button" className={buttonClass} onClick={() => setDialog('meta')}>
                <Pencil size={14} />
                <span className="hidden sm:inline">{t('reviews.meta.edit')}</span>
              </button>
            )}
            {me.canResubmit && (
              <button type="button" className={buttonClass} onClick={() => setDialog('resubmit')}>
                <RotateCcw size={14} />
                <span className="hidden sm:inline">{t('reviews.resubmit.button')}</span>
              </button>
            )}
            {me.canCancel && (
              <button type="button" className={buttonClass} onClick={() => setDialog('cancel')}>
                <Ban size={14} />
                <span className="hidden sm:inline">{t('reviews.cancel.button')}</span>
              </button>
            )}
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-plm-fg-muted">
          <StatusChip status={review.status} />
          {review.priority !== 'normal' && <PriorityChip priority={review.priority} />}
          {due && <DueChipView chip={due} />}
          {review.dueDate && <span>{t('reviews.due.on', { date: formatDateOnly(review.dueDate) })}</span>}
          <span>{t(`reviews.mode.${review.mode}`)}</span>
          <span>{t('reviews.detail.round', { round: review.currentRound })}</span>
          <span>
            {t('reviews.detail.requested', {
              name: requester,
              when: review.requestedAt ? new Date(review.requestedAt).toLocaleString() : '',
            })}
          </span>
        </div>
        {review.message && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-plm-fg-dim">{review.message}</p>
        )}
        {currentRound?.note && review.currentRound > 1 && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-plm-fg-dim">
            {t('reviews.detail.roundNote', { round: currentRound.roundNumber, note: currentRound.note })}
          </p>
        )}
        {review.status === 'cancelled' && (
          <p className="mt-1 text-sm text-plm-fg-muted">
            {t('reviews.detail.cancelled', { name: displayName(review.cancelledBy) ?? t('reviews.detail.unknownUser') })}
            {review.cancelReason && ` · ${t('reviews.detail.cancelReason', { reason: review.cancelReason })}`}
          </p>
        )}
      </PageHeader>

      <div className="space-y-3 p-4">
        {flash && <Notice tone="success">{flash}</Notice>}
        {canApproveAll(detail) && (
          <button type="button" className={primaryButtonClass} onClick={() => setDialog('approveAll')}>
            <CheckCheck size={14} />
            {t('reviews.decision.approveAll', { count: me.owedItemIds.length })}
          </button>
        )}

        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase text-plm-fg-muted">{t('reviews.detail.reviewers')}</h2>
          {reviewers.length === 0 ? (
            <p className="text-sm text-plm-fg-muted">{t('reviews.detail.noReviewers')}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {reviewers.map((r, index) => (
                <li key={r.user?.id ?? index} className="rounded border border-plm-border px-2 py-1 text-xs text-plm-fg">
                  {displayName(r.user) ?? t('reviews.detail.unknownUser')}
                  <span className="ml-1 text-plm-fg-muted">{t(`reviews.detail.reviewerStatus.${r.status}`)}</span>
                </li>
              ))}
            </ul>
          )}
          {withdrawn.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-plm-fg-muted">{t('reviews.detail.withdrawnTitle')}</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {withdrawn.map((r, index) => (
                  <li key={r.user?.id ?? index} className="rounded border border-dashed border-plm-border px-2 py-1 text-xs text-plm-fg-muted">
                    {displayName(r.user) ?? t('reviews.detail.unknownUser')}
                    {r.withdrawnReason && <span className="ml-1">{t(`reviews.detail.withdrawn.${r.withdrawnReason}`)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {detail.items.length === 0 ? (
          <EmptyState>{t('reviews.detail.noItems')}</EmptyState>
        ) : (
          <div className="flex flex-col gap-3 lg:flex-row">
            <section className="lg:w-72 lg:shrink-0">
              <h2 className="mb-1 text-xs font-semibold uppercase text-plm-fg-muted">{t('reviews.detail.files')}</h2>
              <ul className="divide-y divide-plm-border rounded border border-plm-border">
                {detail.items.map((item) => {
                  const mine = me.owedItemIds.includes(item.id)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        aria-current={item.id === selectedId ? 'true' : undefined}
                        className={`block w-full px-3 py-2 text-left ${
                          item.id === selectedId ? 'bg-plm-selection' : 'hover:bg-plm-bg-lighter'
                        }`}
                      >
                        <span className="block truncate text-sm text-plm-fg" title={item.file.filePath}>
                          {item.file.fileName}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-plm-fg-muted">
                          <span>{t('reviews.detail.version', { version: item.version.version })}</span>
                          <span>{t(`reviews.detail.itemOutcome.${item.outcome}`)}</span>
                          {mine && <span className="font-medium text-plm-accent">{t('reviews.detail.owedByMe')}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
            <div className="min-w-0 flex-1">
              {selected && (
                <ItemPanel
                  key={selected.id}
                  detail={detail}
                  item={selected}
                  owedBy={owed[selected.id] ?? []}
                  users={users}
                  onDecided={afterWrite}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {dialog === 'meta' && (
        <EditMetaDialog
          review={review}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            void afterWrite(t('reviews.meta.saved'))
          }}
        />
      )}
      {dialog === 'cancel' && (
        <CancelReviewDialog
          reviewId={review.id}
          onClose={() => setDialog(null)}
          onCancelled={() => {
            setDialog(null)
            void afterWrite(t('reviews.cancel.done'))
          }}
        />
      )}
      {dialog === 'resubmit' && (
        <ResubmitDialog
          reviewId={review.id}
          items={detail.items}
          onClose={() => setDialog(null)}
          onResubmitted={(round) => {
            setDialog(null)
            void afterWrite(t('reviews.resubmit.done', { round }))
          }}
        />
      )}
      {dialog === 'approveAll' && (
        <ApproveAllDialog
          reviewId={review.id}
          count={me.owedItemIds.length}
          onClose={() => setDialog(null)}
          onDone={(decided) => {
            setDialog(null)
            void afterWrite(t('reviews.decision.approvedAll', { count: decided }))
          }}
        />
      )}
    </div>
  )
}

function BackLink() {
  const t = useT()
  return (
    <div className="px-4 pt-3">
      <Link to={href(['reviews'])} className="inline-flex items-center gap-1 text-sm text-plm-fg-dim hover:text-plm-fg">
        <ArrowLeft size={14} />
        {t('reviews.detail.back')}
      </Link>
    </div>
  )
}

function ApproveAllDialog({
  reviewId,
  count,
  onClose,
  onDone,
}: {
  reviewId: string
  count: number
  onClose: () => void
  onDone: (decided: number) => void
}) {
  const t = useT()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await approveAllRemaining(reviewId, comment)
      onDone(result.decided)
    } catch (err) {
      setError(describeReviewError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('reviews.decision.approveAll', { count })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={buttonClass} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void submit()}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('reviews.decision.approveAll', { count })}
          </button>
        </>
      }
    >
      <label className="block text-sm text-plm-fg-dim">
        {t('reviews.decision.approveAllPrompt')}
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          placeholder={t('reviews.decision.commentOptional')}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      {error && (
        <div className="mt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </Modal>
  )
}
