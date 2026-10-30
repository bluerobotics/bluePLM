// Shared page pieces for every section, so loading, error and empty states look the same.
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useT } from '@web/i18n'

export function PageHeader({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-b border-plm-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 truncate text-base font-semibold text-plm-fg">{title}</h1>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Loading({ label }: { label?: string }) {
  const t = useT()
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-plm-fg-muted" role="status">
      <Loader2 size={16} className="animate-spin" />
      {label ?? t('common.loading')}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  const t = useT()
  return (
    <div className="p-6 text-sm" role="alert">
      <p className="text-plm-error">
        {message ? t('common.errorWithMessage', { message }) : t('common.unknownError')}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded border border-plm-border-light px-3 py-1 text-plm-fg hover:bg-plm-bg-lighter"
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-6 text-sm text-plm-fg-muted">{children}</div>
}

export function NotFound() {
  const t = useT()
  return (
    <div className="p-6">
      <h1 className="text-base font-semibold text-plm-fg">{t('common.notFound')}</h1>
      <p className="mt-1 text-sm text-plm-fg-muted">{t('common.notFoundBody')}</p>
    </div>
  )
}

export function Forbidden() {
  const t = useT()
  return <EmptyState>{t('common.forbidden')}</EmptyState>
}

/** Props every section root receives: the route below its own first segment. */
export interface SectionProps {
  segments: string[]
  query: URLSearchParams
}
