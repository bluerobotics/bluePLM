// Small building blocks shared by the Change Control pages.
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { getLanguage, t, useT } from '@web/i18n'
import { Link } from '@web/lib/router'
import type { ChecklistStatus, DeviationStatus, EcoStatus, FieldError } from './model'
import { displayUser } from './model'
import type { UserSummary } from './api'
import { paths } from './routes'

const TONES = {
  neutral: 'bg-plm-fg-muted/10 text-plm-fg-muted',
  info: 'bg-plm-info/10 text-plm-info',
  warning: 'bg-plm-warning/10 text-plm-warning',
  success: 'bg-plm-success/10 text-plm-success',
  error: 'bg-plm-error/10 text-plm-error',
  dim: 'bg-plm-fg-dim/10 text-plm-fg-dim',
} as const
type Tone = keyof typeof TONES

const ECO_TONES: Record<EcoStatus, Tone> = { open: 'info', in_progress: 'warning', completed: 'success', cancelled: 'dim' }
const DEVIATION_TONES: Record<DeviationStatus, Tone> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'error',
  closed: 'dim',
  expired: 'neutral',
}
const CHECKLIST_TONES: Record<ChecklistStatus, Tone> = {
  not_started: 'neutral',
  in_progress: 'warning',
  complete: 'success',
  blocked: 'error',
  na: 'dim',
}

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
}

export function EcoStatusBadge({ status }: { status: EcoStatus | null }) {
  const t = useT()
  const value = status ?? 'open'
  return <Badge tone={ECO_TONES[value]}>{t(`changeControl.ecoStatus.${value}`)}</Badge>
}

export function DeviationStatusBadge({ status }: { status: DeviationStatus }) {
  const t = useT()
  return <Badge tone={DEVIATION_TONES[status]}>{t(`changeControl.deviationStatus.${status}`)}</Badge>
}

export function ChecklistStatusBadge({ status }: { status: ChecklistStatus | null }) {
  const t = useT()
  const value = status ?? 'not_started'
  return <Badge tone={CHECKLIST_TONES[value]}>{t(`changeControl.checklistStatus.${value}`)}</Badge>
}

export function WarningBadge({ children }: { children: ReactNode }) {
  return <Badge tone="warning">{children}</Badge>
}

export function SectionTabs({ active }: { active: 'eco' | 'deviations' }) {
  const t = useT()
  const tab = (id: 'eco' | 'deviations', to: string) => (
    <Link
      to={to}
      aria-current={active === id ? 'page' : undefined}
      className={`rounded px-3 py-1 text-sm ${active === id ? 'bg-plm-selection text-plm-fg' : 'text-plm-fg-dim hover:bg-plm-bg-lighter hover:text-plm-fg'}`}
    >
      {t(`changeControl.tabs.${id}`)}
    </Link>
  )
  return (
    <nav className="mt-2 flex gap-1" aria-label={t('changeControl.tabs.label')}>
      {tab('eco', paths.ecoList())}
      {tab('deviations', paths.deviationList())}
    </nav>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-plm-accent text-white hover:bg-plm-accent-hover',
  secondary: 'border border-plm-border-light text-plm-fg hover:bg-plm-bg-lighter',
  danger: 'border border-plm-error/60 text-plm-error hover:bg-plm-error/10',
  ghost: 'text-plm-fg-dim hover:bg-plm-bg-lighter hover:text-plm-fg',
}

export function Button({ variant = 'secondary', className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1 rounded px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}

export function LinkButton({ to, children, variant = 'secondary' }: { to: string; children: ReactNode; variant?: ButtonVariant }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-1 rounded px-3 py-1 text-sm ${BUTTON_VARIANTS[variant]}`}>
      {children}
    </Link>
  )
}

/** A destructive action that asks once inline instead of a browser dialog. */
export function ConfirmButton({
  label,
  confirmLabel,
  prompt,
  onConfirm,
  disabled,
}: {
  label: ReactNode
  confirmLabel: string
  prompt: string
  onConfirm: () => void
  disabled?: boolean
}) {
  const t = useT()
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button variant="danger" onClick={() => setAsking(true)} disabled={disabled}>
        {label}
      </Button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group">
      <span className="text-sm text-plm-fg-muted">{prompt}</span>
      <Button
        variant="danger"
        disabled={disabled}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" onClick={() => setAsking(false)}>
        {t('common.cancel')}
      </Button>
    </span>
  )
}

export const inputClass =
  'w-full rounded border border-plm-border-light bg-plm-input px-2 py-1 text-sm text-plm-fg placeholder:text-plm-fg-muted focus:border-plm-accent focus:outline-none'

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: FieldError; hint?: string; children: ReactNode }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-plm-fg-dim">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-plm-fg-muted">{hint}</p>}
      {error && (
        <p className="text-xs text-plm-error" role="alert">
          {t(`changeControl.fieldErrors.${error}`)}
        </p>
      )}
    </div>
  )
}

export function Notice({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded px-3 py-2 text-sm ${tone === 'error' ? 'bg-plm-error/10 text-plm-error' : 'bg-plm-success/10 text-plm-success'}`}>
      {children}
    </p>
  )
}

export function Card({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded border border-plm-border bg-plm-bg-light">
      <div className="flex flex-wrap items-center gap-2 border-b border-plm-border px-3 py-2">
        <h2 className="text-sm font-semibold text-plm-fg">{title}</h2>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(getLanguage())
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(getLanguage())
}

export function userLabel(users: Map<string, UserSummary> | undefined, id: string | null | undefined): string {
  return displayUser(id ? users?.get(id) : undefined) ?? t('changeControl.unknownUser')
}

export function UserName({ id, users }: { id: string | null | undefined; users: Map<string, UserSummary> }) {
  const t = useT()
  return <>{displayUser(id ? users.get(id) : undefined) ?? t('changeControl.unknownUser')}</>
}

/** A label / value pair in a detail summary. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-plm-fg-muted">{label}</dt>
      <dd className="break-words text-sm text-plm-fg">{children}</dd>
    </div>
  )
}

/** Multi-line user text, shown as text (never HTML). */
export function Paragraphs({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap break-words text-sm text-plm-fg">{text}</p>
}
