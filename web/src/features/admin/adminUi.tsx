// Small building blocks shared by the admin tabs.
import { useCallback, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { getLanguage, t as translate, useT } from '@web/i18n'
import type { Result } from './adminData'

type Tone = 'default' | 'primary' | 'danger'

const TONES: Record<Tone, string> = {
  default: 'border border-plm-border-light text-plm-fg hover:bg-plm-bg-lighter',
  primary: 'bg-plm-accent text-white hover:bg-plm-accent-hover',
  danger: 'border border-plm-error text-plm-error hover:bg-plm-bg-lighter',
}

export function Button({ tone = 'default', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      className={`rounded px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${TONES[tone]} ${className}`}
      {...rest}
    />
  )
}

/** A destructive action that asks once inline before it runs. */
export function ConfirmButton({
  label,
  question,
  onConfirm,
  disabled,
  title,
}: {
  label: ReactNode
  question: string
  onConfirm: () => void
  disabled?: boolean
  title?: string
}) {
  const t = useT()
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button tone="danger" disabled={disabled} title={title} onClick={() => setAsking(true)}>
        {label}
      </Button>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-plm-fg-dim">{question}</span>
      <Button
        tone="danger"
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {t('admin.confirm')}
      </Button>
      <Button onClick={() => setAsking(false)}>{t('common.cancel')}</Button>
    </span>
  )
}

export interface Notice {
  tone: 'success' | 'error'
  text: string
}

export function NoticeBar({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  const t = useT()
  if (!notice) return null
  return (
    <div
      role={notice.tone === 'error' ? 'alert' : 'status'}
      className={`mx-4 mt-3 flex items-start gap-2 rounded border px-3 py-2 text-sm ${
        notice.tone === 'error' ? 'border-plm-error text-plm-error' : 'border-plm-success text-plm-success'
      }`}
    >
      <span className="min-w-0 flex-1 break-words">{notice.text}</span>
      <button type="button" className="text-xs text-plm-fg-muted hover:text-plm-fg" onClick={onClose}>
        {t('common.close')}
      </button>
    </div>
  )
}

/** Busy flag plus one notice line, for tabs that run one write at a time. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const run = useCallback(async (work: () => Promise<Notice>) => {
    setBusy(true)
    setNotice(null)
    try {
      setNotice(await work())
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }, [])
  return { busy, notice, setNotice, run }
}

export function CheckboxList({
  items,
  selected,
  onToggle,
  empty,
  disabled,
}: {
  items: Array<{ id: string; label: string }>
  selected: string[]
  onToggle: (id: string) => void
  empty: string
  disabled?: boolean
}) {
  if (items.length === 0) return <p className="text-xs text-plm-fg-muted">{empty}</p>
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-1.5 text-sm text-plm-fg">
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            disabled={disabled}
            onChange={() => onToggle(item.id)}
          />
          {item.label}
        </label>
      ))}
    </div>
  )
}

export function formatDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  try {
    return new Intl.DateTimeFormat(getLanguage(), { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  } catch {
    return date.toISOString()
  }
}

export const inputClass =
  'rounded border border-plm-border-light bg-plm-input px-2 py-1 text-sm text-plm-fg focus:border-plm-accent focus:outline-none'

/** The notice for a failed write. */
export function failure(result: Result): Notice {
  if (result.ok) return { tone: 'success', text: '' }
  if (result.error === 'refused') return { tone: 'error', text: translate('admin.errors.refused') }
  return { tone: 'error', text: translate('admin.errors.action', { message: result.error }) }
}

