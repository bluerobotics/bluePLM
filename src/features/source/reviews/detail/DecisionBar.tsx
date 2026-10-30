/**
 * Decide the current item: Approve, Approve with comments, Request changes, Reject. A comment is
 * required for every decision except Approve (decision 2). Keyboard: A, Shift+A, C, R decide by
 * default (the registry's `reviews.*` actions, rebindable); Ctrl+Enter sends a comment; Escape
 * closes it. J / K belong to the detail pane
 * (`useReviewItemKeys`), so they work for everyone viewing the review, not only reviewers.
 */

import { useEffect, useRef, useState } from 'react'
import { CheckCheck, CheckCircle2, Loader2, MessageSquareMore, Undo2, XCircle } from 'lucide-react'

import { t } from '@/lib/i18n'
import type { ReviewDecision } from '@/types/reviews'

import { useShortcuts, type ShortcutHandler } from '@/lib/keybindings'

interface DecisionBarProps {
  /** The current item is owed by me in this round. */
  canDecide: boolean
  /** Items I still owe across the review. */
  owedCount: number
  busy: boolean
  onDecide: (decision: ReviewDecision, comment: string | null) => void
  onApproveAll: (comment: string | null) => void
}

const COMMENTED: ReviewDecision[] = ['approved_with_comments', 'changes_requested', 'rejected']

export function DecisionBar({
  canDecide,
  owedCount,
  busy,
  onDecide,
  onApproveAll,
}: DecisionBarProps) {
  const [pending, setPending] = useState<ReviewDecision | 'approve_all' | null>(null)
  const [comment, setComment] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)

  // Escape drops an unsent decision.
  useEffect(() => {
    if (!pending) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return
      setPending(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  // Decision shortcuts while the review is open (ignored while typing or under a dialog).
  const decideBy =
    (decision: ReviewDecision): ShortcutHandler =>
    () => {
      if (!canDecide || busy) return
      if (decision === 'approved') onDecide('approved', null)
      else setPending(decision)
    }
  useShortcuts(
    'reviews',
    {
      'reviews.approve': decideBy('approved'),
      'reviews.approveWithComments': decideBy('approved_with_comments'),
      'reviews.requestChanges': decideBy('changes_requested'),
      'reviews.reject': decideBy('rejected'),
    },
    { blockedByModal: true },
  )

  useEffect(() => {
    if (pending) textRef.current?.focus()
  }, [pending])

  // A new item resets an unsent decision.
  useEffect(() => {
    if (!canDecide) setPending(null)
  }, [canDecide])

  const needsComment = pending !== null && pending !== 'approve_all' && COMMENTED.includes(pending)
  const sendDisabled = busy || (needsComment && !comment.trim())

  const send = () => {
    if (!pending || sendDisabled) return
    const text = comment.trim() || null
    if (pending === 'approve_all') onApproveAll(text)
    else onDecide(pending, text)
    setPending(null)
    setComment('')
  }

  const BUTTON = 'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded disabled:opacity-50'

  return (
    <div className="border-t border-plm-border bg-plm-sidebar px-3 py-2 space-y-2 flex-shrink-0">
      {pending && (
        <div className="space-y-1">
          <p className="text-[11px] text-plm-fg-muted">
            {t(`reviewDetail.prompt.${pending}`)}
          </p>
          <textarea
            ref={textRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                send()
              } else if (e.key === 'Escape') {
                setPending(null)
              }
            }}
            rows={3}
            placeholder={
              needsComment ? t('reviewDetail.decision.commentRequired') : t('reviewDetail.decision.commentOptional')
            }
            className="w-full px-2 py-1 text-xs bg-plm-bg-light border border-plm-border rounded focus:outline-none focus:border-plm-accent"
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={send}
              disabled={sendDisabled}
              className={`${BUTTON} bg-plm-accent text-white hover:bg-plm-accent/90`}
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              {t('reviewDetail.decision.send')}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className={`${BUTTON} text-plm-fg-muted hover:bg-plm-highlight`}
            >
              {t('reviewQueue.cancel')}
            </button>
            <span className="ml-auto text-[10px] text-plm-fg-muted">{t('reviewDetail.decision.sendHint')}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={!canDecide || busy}
          onClick={() => onDecide('approved', null)}
          className={`${BUTTON} bg-plm-success/15 text-plm-success hover:bg-plm-success/25`}
          title={t('reviewDetail.decision.keyHint', { key: 'A' })}
        >
          <CheckCircle2 size={12} />
          {t('reviewDetail.decision.approved')}
        </button>
        <button
          type="button"
          disabled={!canDecide || busy}
          onClick={() => setPending('approved_with_comments')}
          className={`${BUTTON} bg-plm-success/10 text-plm-success hover:bg-plm-success/20`}
          title={t('reviewDetail.decision.keyHint', { key: 'Shift+A' })}
        >
          <MessageSquareMore size={12} />
          {t('reviewDetail.decision.approved_with_comments')}
        </button>
        <button
          type="button"
          disabled={!canDecide || busy}
          onClick={() => setPending('changes_requested')}
          className={`${BUTTON} bg-plm-warning/15 text-plm-warning hover:bg-plm-warning/25`}
          title={t('reviewDetail.decision.keyHint', { key: 'C' })}
        >
          <Undo2 size={12} />
          {t('reviewDetail.decision.changes_requested')}
        </button>
        <button
          type="button"
          disabled={!canDecide || busy}
          onClick={() => setPending('rejected')}
          className={`${BUTTON} bg-plm-error/15 text-plm-error hover:bg-plm-error/25`}
          title={t('reviewDetail.decision.keyHint', { key: 'R' })}
        >
          <XCircle size={12} />
          {t('reviewDetail.decision.rejected')}
        </button>

        {owedCount > 1 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setPending('approve_all')}
            className={`${BUTTON} ml-auto bg-plm-success/10 text-plm-success hover:bg-plm-success/20`}
          >
            <CheckCheck size={12} />
            {t('reviewDetail.decision.approveAll', { count: owedCount })}
          </button>
        )}
      </div>
      <p className="text-[10px] text-plm-fg-muted">{t('reviewDetail.decision.shortcuts')}</p>
    </div>
  )
}
