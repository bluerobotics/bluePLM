// Author actions on a review: priority and due date (`update_review_meta`), cancel
// (`cancel_review`) and resubmit with newer versions (`resubmit_review`). The title is not
// editable: no review RPC changes it.
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useT } from '@web/i18n'
import { cancelReview, resubmitReview, updateReviewMeta } from '@/lib/supabase/reviews'
import type { ReviewHeader, ReviewItemDetail, ReviewMetaPatch, ReviewPriority } from '@/types/reviews'
import {
  defaultResubmitSelection,
  isDateOnly,
  itemsNeedingNewVersion,
  newerVersionOptions,
  planResubmit,
  type VersionOption,
} from './reviewLogic'
import { getFileVersionOptions } from './reviewsApi'
import { buttonClass, describeReviewError, inputClass, Modal, Notice, primaryButtonClass } from './reviewUi'

const PRIORITIES: readonly ReviewPriority[] = ['low', 'normal', 'high', 'urgent']

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="mt-2">
      <Notice tone="error">{error}</Notice>
    </div>
  )
}

export function EditMetaDialog({
  review,
  onClose,
  onSaved,
}: {
  review: ReviewHeader
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const [priority, setPriority] = useState<ReviewPriority>(review.priority)
  const [dueDate, setDueDate] = useState(review.dueDate ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch: ReviewMetaPatch = {}
  if (priority !== review.priority) patch.priority = priority
  if ((dueDate || null) !== review.dueDate) patch.dueDate = isDateOnly(dueDate) ? dueDate : null
  const changed = Object.keys(patch).length > 0

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateReviewMeta(review.id, patch)
      onSaved()
    } catch (err) {
      setError(describeReviewError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('reviews.meta.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={buttonClass} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={primaryButtonClass} disabled={busy || !changed} onClick={() => void save()}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-sm text-plm-fg-dim">
          {t('reviews.priority.label')}
          <select value={priority} onChange={(e) => setPriority(e.target.value as ReviewPriority)} className={`mt-1 ${inputClass}`}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`reviews.priority.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-plm-fg-dim">
          {t('reviews.meta.dueDate')}
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        {dueDate && (
          <button type="button" className={buttonClass} onClick={() => setDueDate('')}>
            {t('reviews.meta.clearDue')}
          </button>
        )}
      </div>
      <ErrorLine error={error} />
    </Modal>
  )
}

export function CancelReviewDialog({
  reviewId,
  onClose,
  onCancelled,
}: {
  reviewId: string
  onClose: () => void
  onCancelled: () => void
}) {
  const t = useT()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await cancelReview(reviewId, reason)
      onCancelled()
    } catch (err) {
      setError(describeReviewError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('reviews.cancel.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={buttonClass} onClick={onClose}>
            {t('reviews.cancel.keep')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="inline-flex items-center gap-1.5 rounded bg-plm-error px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('reviews.cancel.confirm')}
          </button>
        </>
      }
    >
      <p className="text-sm text-plm-fg-dim">{t('reviews.cancel.message')}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder={t('reviews.cancel.reason')}
        aria-label={t('reviews.cancel.reason')}
        className={`mt-2 ${inputClass}`}
      />
      <ErrorLine error={error} />
    </Modal>
  )
}

export function ResubmitDialog({
  reviewId,
  items,
  onClose,
  onResubmitted,
}: {
  reviewId: string
  items: ReviewItemDetail[]
  onClose: () => void
  onResubmitted: (round: number) => void
}) {
  const t = useT()
  const needing = useMemo(() => itemsNeedingNewVersion(items), [items])
  const [versionsByFile, setVersionsByFile] = useState<Record<string, VersionOption[]> | null>(null)
  const [selection, setSelection] = useState<Record<string, string | null>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const fileIds = Array.from(new Set(needing.map((i) => i.fileId)))
    Promise.all(fileIds.map(async (id) => [id, await getFileVersionOptions(id)] as const))
      .then((entries) => {
        if (!active) return
        const byFile = Object.fromEntries(entries)
        setVersionsByFile(byFile)
        setSelection(defaultResubmitSelection(items, byFile))
      })
      .catch((err: unknown) => {
        if (active) setError(describeReviewError(err))
      })
    return () => {
      active = false
    }
  }, [needing, items])

  const plan = planResubmit(items, selection)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await resubmitReview(reviewId, plan.payload, note)
      onResubmitted(result.round)
    } catch (err) {
      setError(describeReviewError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('reviews.resubmit.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className={buttonClass} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={primaryButtonClass} disabled={busy || !plan.ready} onClick={() => void submit()}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('reviews.resubmit.submit')}
          </button>
        </>
      }
    >
      <p className="text-sm text-plm-fg-dim">{t('reviews.resubmit.intro')}</p>
      {!versionsByFile && !error ? (
        <p className="mt-3 text-sm text-plm-fg-muted">{t('common.loading')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {needing.map((item) => {
            const options = newerVersionOptions(item, versionsByFile?.[item.fileId] ?? [])
            return (
              <li key={item.id} className="rounded border border-plm-border p-2">
                <p className="truncate text-sm text-plm-fg" title={item.file.filePath}>
                  {item.file.fileName}
                  <span className="ml-2 text-xs text-plm-fg-muted">
                    {t('reviews.resubmit.reviewed', { version: item.version.version })}
                  </span>
                </p>
                {options.length === 0 ? (
                  <p className="mt-1 text-xs text-plm-warning">{t('reviews.resubmit.noNewer')}</p>
                ) : (
                  <select
                    value={selection[item.id] ?? ''}
                    onChange={(e) => setSelection((prev) => ({ ...prev, [item.id]: e.target.value || null }))}
                    aria-label={item.file.fileName}
                    className={`mt-1 ${inputClass}`}
                  >
                    {options.map((o) => (
                      <option key={o.fileVersionId} value={o.fileVersionId}>
                        {o.revision
                          ? t('reviews.resubmit.optionRev', { version: o.version, revision: o.revision })
                          : t('reviews.resubmit.option', { version: o.version })}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <label className="mt-3 block text-sm text-plm-fg-dim">
        {t('reviews.resubmit.note')}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`mt-1 ${inputClass}`} />
      </label>
      {versionsByFile && plan.missing.length > 0 && (
        <p className="mt-2 text-xs text-plm-warning">{t('reviews.resubmit.missing', { count: plan.missing.length })}</p>
      )}
      <ErrorLine error={error} />
    </Modal>
  )
}
