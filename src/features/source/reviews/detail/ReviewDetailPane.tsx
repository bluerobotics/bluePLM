/**
 * The open review in the Reviews view's main area: header, item list with per-item status and
 * per-reviewer decisions, the pinned version's PDF with its markups, and the decision bar.
 *
 * Built for a reviewer working a long queue: J/K move between items (for anyone viewing the
 * review), A/C/R decide, and after a decision the view moves to the next item still owed. When
 * none is left the queue reloads.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { t } from '@/lib/i18n'
import { log } from '@/lib/logger'
import { approveAllRemaining, respondToItems } from '@/lib/supabase/reviews'
import { usePDMStore } from '@/stores/pdmStore'
import type { ReviewDecision, ReviewUser } from '@/types/reviews'

import { useReviewDetail } from '../hooks/useReviewDetail'
import { useReviewItemKeys } from '../hooks/useReviewItemKeys'
import { nextOwedItem, stepItem } from '../lib/decisionKeys'
import { describeReviewError } from '../lib/reviewErrors'
import { DecisionBar } from './DecisionBar'
import { ItemDecisions } from './ItemDecisions'
import { ItemPreview } from './ItemPreview'
import { ResubmitDialog } from './ResubmitDialog'
import { ReviewHeader } from './ReviewHeader'
import { ReviewItemList } from './ReviewItemList'
import { ReviewWorkflowBar } from './ReviewWorkflowBar'

export function ReviewDetailPane() {
  const reviewId = usePDMStore((s) => s.activeReviewId)
  const activeItemId = usePDMStore((s) => s.activeReviewItemId)
  const setActiveReviewId = usePDMStore((s) => s.setActiveReviewId)
  const setActiveItemId = usePDMStore((s) => s.setActiveReviewItemId)
  const refreshQueue = usePDMStore((s) => s.requestReviewQueueRefresh)
  const addToast = usePDMStore((s) => s.addToast)

  const { detail, loading, error, reload } = useReviewDetail(reviewId)
  const [busy, setBusy] = useState(false)
  const [resubmitOpen, setResubmitOpen] = useState(false)
  const [markupRound, setMarkupRound] = useState<number | null>(null)

  const items = useMemo(() => detail?.items ?? [], [detail])
  const itemIds = useMemo(() => items.map((i) => i.id), [items])
  const owedIds = useMemo(() => detail?.me.owedItemIds ?? [], [detail])
  const owedSet = useMemo(() => new Set(owedIds), [owedIds])

  // Pick an item when none is chosen (or the chosen one is not in this review): first owed, else first.
  useEffect(() => {
    if (!detail || items.length === 0) return
    if (activeItemId && itemIds.includes(activeItemId)) return
    setActiveItemId(owedIds[0] ?? itemIds[0])
  }, [detail, items.length, itemIds, owedIds, activeItemId, setActiveItemId])

  // A new item or review shows the current round's markups.
  useEffect(() => setMarkupRound(null), [activeItemId, reviewId])

  const item = items.find((i) => i.id === activeItemId) ?? null
  const currentRound = detail?.review.currentRound ?? 1
  const shownRound = markupRound ?? currentRound
  const reviewOpen = detail?.review.status === 'open' || detail?.review.status === 'changes_requested'
  const canMarkup =
    !!detail &&
    reviewOpen &&
    shownRound === currentRound &&
    (detail.me.isRequester || detail.me.isReviewer || detail.me.isAdmin)
  const canDecide = !!detail && detail.me.canRespond && !!item && owedSet.has(item.id)

  const usersById = useMemo(() => {
    const map = new Map<string, ReviewUser>()
    for (const r of detail?.reviewers ?? []) if (r.user) map.set(r.user.id, r.user)
    const requester = detail?.review.requestedBy
    if (requester) map.set(requester.id, requester)
    return map
  }, [detail])

  const goNext = useCallback(
    () => setActiveItemId(stepItem(itemIds, activeItemId, 1)),
    [itemIds, activeItemId, setActiveItemId],
  )
  const goPrevious = useCallback(
    () => setActiveItemId(stepItem(itemIds, activeItemId, -1)),
    [itemIds, activeItemId, setActiveItemId],
  )
  useReviewItemKeys(!!detail, goNext, goPrevious)

  const decide = useCallback(
    async (decision: ReviewDecision, comment: string | null) => {
      if (!reviewId || !item) return
      setBusy(true)
      try {
        const result = await respondToItems(reviewId, [{ itemId: item.id, decision, comment }])
        const next = nextOwedItem(itemIds, owedIds, item.id)
        if (next) setActiveItemId(next)
        else addToast('success', t('reviewDetail.decision.allDone'))
        if (result.owedRemaining === 0) log.info('[Reviews]', 'Finished my part of a review', { reviewId })
        refreshQueue()
      } catch (decideError) {
        addToast('error', describeReviewError(decideError))
      } finally {
        setBusy(false)
      }
    },
    [reviewId, item, itemIds, owedIds, setActiveItemId, addToast, refreshQueue],
  )

  const approveAll = useCallback(
    async (comment: string | null) => {
      if (!reviewId) return
      setBusy(true)
      try {
        const result = await approveAllRemaining(reviewId, comment)
        addToast('success', t('reviewDetail.decision.approvedAll', { count: result.decided }))
        refreshQueue()
      } catch (approveError) {
        addToast('error', describeReviewError(approveError))
      } finally {
        setBusy(false)
      }
    },
    [reviewId, addToast, refreshQueue],
  )

  if (!reviewId) return null

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center bg-plm-bg">
        {error ? (
          <p className="text-sm text-plm-error">{error}</p>
        ) : (
          <Loader2 size={20} className={`text-plm-fg-muted ${loading ? 'animate-spin' : ''}`} />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-plm-bg">
      <ReviewHeader
        detail={detail}
        onBack={() => setActiveReviewId(null)}
        onResubmit={() => setResubmitOpen(true)}
        onChanged={() => {
          refreshQueue()
          void reload()
        }}
      />

      <ReviewWorkflowBar
        detail={detail}
        onChanged={() => {
          refreshQueue()
          void reload()
        }}
      />

      <div className="flex-1 flex min-h-0">
        {/* Items and decisions */}
        <div className="w-64 flex-shrink-0 border-r border-plm-border flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0">
            <ReviewItemList
              items={items}
              activeItemId={activeItemId}
              owedItemIds={owedSet}
              onSelect={setActiveItemId}
            />
          </div>
          {item && (
            <div className="max-h-[45%] overflow-y-auto border-t border-plm-border">
              <ItemDecisions
                item={item}
                usersById={usersById}
                currentRound={currentRound}
                markupRound={shownRound}
                onShowRound={setMarkupRound}
              />
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {item ? (
            <ItemPreview
              key={`${item.id}:${shownRound}`}
              reviewId={detail.review.id}
              item={item}
              round={shownRound}
              canMarkup={canMarkup}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-plm-fg-muted">
              {t('reviewDetail.noItems')}
            </div>
          )}
          {detail.me.canRespond && (
            <DecisionBar
              // An unsent decision and its comment belong to one item: never send them for another.
              key={`${detail.review.id}:${item?.id ?? ''}`}
              canDecide={canDecide}
              owedCount={owedIds.length}
              busy={busy}
              onDecide={(decision, comment) => void decide(decision, comment)}
              onApproveAll={(comment) => void approveAll(comment)}
            />
          )}
        </div>
      </div>

      <ResubmitDialog
        open={resubmitOpen}
        reviewId={detail.review.id}
        items={items}
        onClose={() => setResubmitOpen(false)}
        onDone={() => {
          setResubmitOpen(false)
          refreshQueue()
        }}
      />
    </div>
  )
}
