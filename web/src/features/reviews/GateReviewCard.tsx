// A workflow gate waiting on this user, in the "waiting on me" list. Gates keep their own contract:
// the decision goes only through `complete_gate_review`, which also moves the file once the last
// blocking gate clears.
import { useState, type ReactNode } from 'react'
import { CheckCircle2, Loader2, ShieldCheck, Undo2, XCircle } from 'lucide-react'
import { useT } from '@web/i18n'
import type { ReviewQueueRow } from '@/types/reviews'
import { validateGateDecision, type GateDecision } from './reviewLogic'
import { completeGateReview } from './reviewsApi'
import { inputClass, Notice } from './reviewUi'
import { refreshReviewBadgeCount } from './useReviewBadgeCount'

export function GateReviewCard({ row }: { row: ReviewQueueRow }) {
  const t = useT()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState<GateDecision | null>(null)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const gate = row.gate
  if (!gate) return null

  const decide = async (decision: GateDecision) => {
    const check = validateGateDecision(decision, comment)
    if (!check.ok) {
      setMessage({ tone: 'error', text: t('reviews.gate.commentRequired') })
      return
    }
    setBusy(decision)
    setMessage(null)
    try {
      const result = await completeGateReview(gate.pendingReviewId, decision, check.comment)
      if (!result.success) {
        setMessage({ tone: 'error', text: t('reviews.gate.failed', { message: result.errorMessage ?? '' }) })
        return
      }
      setMessage({
        tone: 'success',
        text: result.newStateName
          ? t('reviews.gate.advanced', { state: result.newStateName })
          : t('reviews.gate.recorded'),
      })
      setComment('')
      setDone(true)
      refreshReviewBadgeCount()
    } catch (error) {
      setMessage({
        tone: 'error',
        text: t('reviews.gate.failed', { message: error instanceof Error ? error.message : String(error) }),
      })
    } finally {
      setBusy(null)
    }
  }

  const buttons: Array<{ decision: GateDecision; label: string; icon: ReactNode; tone: string }> = [
    { decision: 'approved', label: t('reviews.gate.approve'), icon: <CheckCircle2 size={14} />, tone: 'bg-plm-success/15 text-plm-success hover:bg-plm-success/25' },
    { decision: 'kicked_back', label: t('reviews.gate.kickBack'), icon: <Undo2 size={14} />, tone: 'bg-plm-warning/15 text-plm-warning hover:bg-plm-warning/25' },
    { decision: 'rejected', label: t('reviews.gate.reject'), icon: <XCircle size={14} />, tone: 'bg-plm-error/15 text-plm-error hover:bg-plm-error/25' },
  ]

  return (
    <li className="rounded border border-plm-border bg-plm-bg-light p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck size={14} className="shrink-0 text-plm-warning" />
        <span className="min-w-0 truncate text-sm font-medium text-plm-fg" title={gate.filePath}>
          {gate.fileName}
        </span>
        <span className="ml-auto text-xs text-plm-fg-muted">{t('reviews.gate.label')}</span>
      </div>
      <p className="mt-1 text-xs text-plm-fg-muted">
        {t('reviews.gate.transition', { from: gate.fromStateName ?? '', to: gate.toStateName ?? '' })} · {gate.gateName}
      </p>
      {row.requestedBy && (
        <p className="mt-0.5 text-xs text-plm-fg-muted">
          {t('reviews.queue.requestedBy', { name: row.requestedBy.fullName || row.requestedBy.email })}
        </p>
      )}
      {!done && (
        <>
      <label className="mt-2 block text-xs text-plm-fg-muted">
        {t('reviews.gate.comment')}
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          placeholder={t('reviews.gate.commentRequired')}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {buttons.map((b) => (
          <button
            key={b.decision}
            type="button"
            disabled={busy !== null}
            onClick={() => void decide(b.decision)}
            className={`inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${b.tone}`}
          >
            {busy === b.decision ? <Loader2 size={14} className="animate-spin" /> : b.icon}
            {b.label}
          </button>
        ))}
      </div>
        </>
      )}
      {message && (
        <div className="mt-2">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
    </li>
  )
}
