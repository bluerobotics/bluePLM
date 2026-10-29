/**
 * The review's place in the file workflow (schema 110): how many files sit in a review stage, where
 * an approval takes them, what this review already moved, and, for the requester or an
 * administrator, the two moves: the approved files now, or the whole package once it is approved.
 * Hidden when workflows are off or no file of the review is in a review stage.
 */

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, GitBranch, Loader2 } from 'lucide-react'

import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { advanceReviewedFiles, getReviewWorkflowStatus } from '@/lib/supabase/reviews'
import { usePDMStore } from '@/stores/pdmStore'
import type { ReviewDetail, ReviewWorkflowStatus } from '@/types/reviews'

import { describeReviewError } from '../lib/reviewErrors'
import { summarizeReviewStage } from '../lib/reviewStage'

interface ReviewWorkflowBarProps {
  detail: ReviewDetail
  /** Called after a move, so the detail and the queue reload. */
  onChanged: () => void
}

export function ReviewWorkflowBar({ detail, onChanged }: ReviewWorkflowBarProps) {
  const addToast = usePDMStore((s) => s.addToast)
  const [status, setStatus] = useState<ReviewWorkflowStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const reviewId = detail.review.id

  const load = useCallback(async () => {
    try {
      setStatus(await getReviewWorkflowStatus(reviewId))
    } catch (error) {
      // The bar is an addition to the review; a failure here must not get in its way.
      log.warn('[Reviews]', 'Loading the review workflow status failed', { error, reviewId })
      setStatus(null)
    }
  }, [reviewId])

  // Reload whenever the review itself changed (a decision, a resubmit, a settle).
  const itemOutcomes = detail.items.map((i) => i.outcome).join(',')
  useEffect(() => {
    void load()
  }, [load, detail.review.status, itemOutcomes])

  if (!status) return null
  const summary = summarizeReviewStage(status, detail.review.status)
  if (!summary.relevant) return null

  const canMove = detail.me.isRequester || detail.me.isAdmin
  const move = async (onlyApproved: boolean) => {
    setBusy(true)
    try {
      const result = await advanceReviewedFiles(reviewId, onlyApproved)
      if (result.moved > 0)
        addToast('success', t('reviewDetail.workflow.moved', { count: result.moved }))
      const stuck = result.skipped.filter((s) => s.reason !== 'not_approved')
      if (stuck.length > 0) {
        addToast(
          'warning',
          t('reviewDetail.workflow.notMoved', {
            count: stuck.length,
            files: stuck
              .slice(0, 5)
              .map((s) => `${s.fileName} (${t(`reviewDetail.workflowReason.${s.reason}`)})`)
              .join(', '),
          }),
        )
      }
      await load()
      onChanged()
    } catch (error) {
      addToast('error', describeReviewError(error))
    } finally {
      setBusy(false)
    }
  }

  const next = summary.nextStates.join(', ')
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 border-b border-plm-border bg-plm-bg-light text-xs">
      <GitBranch size={13} className="text-plm-fg-muted flex-shrink-0" />
      {summary.inStage > 0 && (
        <span className="text-plm-fg">
          {next
            ? t('reviewDetail.workflow.waitingTo', { count: summary.inStage, state: next })
            : t('reviewDetail.workflow.waiting', { count: summary.inStage })}
        </span>
      )}
      {summary.moved.map((m) => (
        <span key={m.state} className="text-plm-success">
          {t('reviewDetail.workflow.movedTo', { count: m.count, state: m.state })}
        </span>
      ))}
      {summary.inStage > 0 && (
        <span className="text-plm-fg-muted">
          {status.onApproval === 'advance'
            ? status.packagePolicy === 'approved_only'
              ? t('reviewDetail.workflow.autoEach')
              : t('reviewDetail.workflow.autoPackage')
            : t('reviewDetail.workflow.held')}
        </span>
      )}

      {canMove && (summary.approvedWaiting > 0 || summary.packageReady) && (
        <div className="flex items-center gap-1.5 ml-auto">
          {busy && <Loader2 size={12} className="animate-spin text-plm-fg-muted" />}
          {summary.approvedWaiting > 0 && !summary.packageReady && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void move(true)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-plm-bg hover:bg-plm-highlight border border-plm-border disabled:opacity-50"
              title={t('reviewDetail.workflow.moveApprovedHint')}
            >
              <ArrowRight size={12} />
              {t('reviewDetail.workflow.moveApproved', { count: summary.approvedWaiting })}
            </button>
          )}
          {summary.packageReady && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void move(false)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-plm-accent/15 text-plm-accent hover:bg-plm-accent/25 disabled:opacity-50"
            >
              <ArrowRight size={12} />
              {t('reviewDetail.workflow.movePackage', { count: summary.inStage })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
