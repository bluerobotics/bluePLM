// Small pieces shared by the Reviews pages: chips, buttons, a modal and the error sentence.
import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useT, t as translate } from '@web/i18n'
import { ReviewRpcError } from '@/lib/supabase/reviews'
import type { ReviewErrorCode, ReviewOutcome, ReviewPriority } from '@/types/reviews'
import type { DueChip } from './reviewLogic'

const TRANSLATED_ERRORS: ReadonlySet<ReviewErrorCode> = new Set<ReviewErrorCode>([
  'FORBIDDEN',
  'REVIEW_NOT_FOUND',
  'REVIEW_CLOSED',
  'NOT_A_REVIEWER',
  'NOT_RESUBMITTABLE',
  'COMMENT_REQUIRED',
  'ITEM_NOT_OWED',
  'ITEM_NEEDS_NEW_VERSION',
  'SAME_VERSION',
  'VERSION_NOT_FOUND',
  'NO_ITEMS',
  'TOO_MANY_ITEMS',
  'NO_REVIEWERS',
  'NOTHING_OWED',
  'NOTHING_TO_RESUBMIT',
  'REVIEWER_NOT_FOUND',
  'REVIEWER_NO_VAULT_ACCESS',
  'TEAM_NOT_FOUND',
  'DUPLICATE_FILE',
])

/** A sentence for a failed review call: codes the user can act on are translated. */
export function describeReviewError(error: unknown): string {
  if (error instanceof ReviewRpcError && TRANSLATED_ERRORS.has(error.code)) {
    return translate(`reviews.errors.${error.code}`)
  }
  return error instanceof Error ? error.message : String(error)
}

export const buttonClass =
  'inline-flex items-center justify-center gap-1.5 rounded border border-plm-border-light px-3 py-1.5 text-sm text-plm-fg hover:bg-plm-bg-lighter disabled:cursor-not-allowed disabled:opacity-50'
export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded bg-plm-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-plm-accent-hover disabled:cursor-not-allowed disabled:opacity-50'
export const inputClass =
  'w-full rounded border border-plm-border bg-plm-input px-2 py-1.5 text-sm text-plm-fg focus:border-plm-accent focus:outline-none'

const STATUS_TONE: Record<ReviewOutcome, string> = {
  open: 'bg-plm-info/15 text-plm-info',
  approved: 'bg-plm-success/15 text-plm-success',
  changes_requested: 'bg-plm-warning/15 text-plm-warning',
  rejected: 'bg-plm-error/15 text-plm-error',
  cancelled: 'bg-plm-fg-muted/15 text-plm-fg-muted',
}

export function StatusChip({ status }: { status: ReviewOutcome }) {
  const t = useT()
  return <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TONE[status]}`}>{t(`reviews.status.${status}`)}</span>
}

export function PriorityChip({ priority }: { priority: ReviewPriority }) {
  const t = useT()
  const tone = priority === 'urgent' || priority === 'high' ? 'text-plm-error' : 'text-plm-fg-muted'
  return (
    <span className={`rounded border border-plm-border px-1.5 py-0.5 text-xs ${tone}`}>
      {t(`reviews.priority.${priority}`)}
    </span>
  )
}

export function DueChipView({ chip }: { chip: DueChip }) {
  const t = useT()
  const text =
    chip.tone === 'overdue'
      ? t('reviews.due.overdue', { count: -chip.days })
      : chip.tone === 'today'
        ? t('reviews.due.today')
        : t('reviews.due.inDays', { count: chip.days })
  const tone =
    chip.tone === 'overdue' ? 'text-plm-error' : chip.tone === 'later' ? 'text-plm-fg-muted' : 'text-plm-warning'
  return <span className={`rounded border border-plm-border px-1.5 py-0.5 text-xs ${tone}`}>{text}</span>
}

export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const cls =
    tone === 'error' ? 'text-plm-error' : tone === 'success' ? 'text-plm-success' : 'text-plm-fg-muted'
  return (
    <p className={`text-sm ${cls}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

/** A modal dialog: Escape and the close button call `onClose`; focus moves into it on open. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  // Callers pass a fresh arrow each render; read it through a ref so focus moves only once.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    ref.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full flex-col rounded-t-lg border border-plm-border bg-plm-bg-light shadow-xl outline-none sm:rounded-lg ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-plm-border px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-plm-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded p-1 text-plm-fg-muted hover:bg-plm-bg-lighter"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-plm-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/** Start a browser download from a URL without leaving the page. */
export function startDownload(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener noreferrer'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
