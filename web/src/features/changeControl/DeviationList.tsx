import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { href, Link, navigate } from '@web/lib/router'
import { EmptyState, ErrorState, Loading, PageHeader } from '@web/shell/ui'
import { listDeviations } from './api'
import { useLoad, usePermissions } from './hooks'
import { DEVIATION_STATUSES, effectiveDeviationStatus, isExpiringSoon, matchesQuery, type DeviationStatus } from './model'
import { paths } from './routes'
import { DeviationStatusBadge, formatDate, inputClass, LinkButton, SectionTabs, WarningBadge } from './ui'

function isDeviationStatus(value: string | null): value is DeviationStatus {
  return !!value && (DEVIATION_STATUSES as readonly string[]).includes(value)
}

export function DeviationList({ query }: { query: URLSearchParams }) {
  const t = useT()
  const auth = useReadyAuth()
  const permissions = usePermissions()
  const orgId = auth.profile.org_id
  const { data, error, loading, reload } = useLoad(() => listDeviations(orgId), orgId)
  const [now] = useState(() => new Date())

  const search = query.get('q') ?? ''
  const statusParam = query.get('status')
  const status = isDeviationStatus(statusParam) ? statusParam : 'all'

  const setFilter = (next: { q?: string; status?: string }) => {
    const nextStatus = next.status ?? status
    navigate(href(['eco', 'deviations'], { q: next.q ?? search, status: nextStatus === 'all' ? undefined : nextStatus }), { replace: true })
  }

  const filtered = useMemo(
    () =>
      (data?.deviations ?? []).filter(
        (deviation) =>
          (status === 'all' || effectiveDeviationStatus(deviation, now) === status) &&
          matchesQuery(
            { number: deviation.deviation_number, title: deviation.title, description: deviation.description, extra: [deviation.deviation_type, ...(deviation.affected_part_numbers ?? [])] },
            search,
          ),
      ),
    [data, search, status, now],
  )

  return (
    <div>
      <PageHeader
        title={t('changeControl.title')}
        actions={
          permissions.deviations.create && (
            <LinkButton to={paths.deviationNew()} variant="primary">
              <Plus size={14} />
              {t('changeControl.deviation.new')}
            </LinkButton>
          )
        }
      >
        <SectionTabs active="deviations" />
      </PageHeader>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <input
          type="search"
          aria-label={t('changeControl.deviation.searchLabel')}
          placeholder={t('changeControl.deviation.searchPlaceholder')}
          value={search}
          onChange={(event) => setFilter({ q: event.target.value })}
          className={`${inputClass} max-w-xs flex-1`}
        />
        <select aria-label={t('changeControl.statusFilter')} value={status} onChange={(event) => setFilter({ status: event.target.value })} className={`${inputClass} w-auto`}>
          <option value="all">{t('changeControl.allStatuses')}</option>
          {DEVIATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`changeControl.deviationStatus.${value}`)}
            </option>
          ))}
        </select>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState>{data && data.deviations.length > 0 ? t('changeControl.deviation.noMatches') : t('changeControl.deviation.empty')}</EmptyState>
      ) : (
        <ul className="divide-y divide-plm-border border-y border-plm-border">
          {filtered.map((deviation) => (
            <li key={deviation.id}>
              <Link to={paths.deviation(deviation.id)} className="block px-4 py-2.5 hover:bg-plm-bg-lighter">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-plm-fg">{deviation.deviation_number}</span>
                  <DeviationStatusBadge status={effectiveDeviationStatus(deviation, now)} />
                  {isExpiringSoon(deviation, now) && <WarningBadge>{t('changeControl.deviation.expiresOn', { date: formatDate(deviation.expiration_date) })}</WarningBadge>}
                  <span className="ml-auto text-xs text-plm-fg-muted">{t('changeControl.fileCount', { count: data?.fileCounts.get(deviation.id) ?? 0 })}</span>
                </div>
                <div className="mt-0.5 truncate text-sm text-plm-fg-dim">{deviation.title}</div>
                {(deviation.affected_part_numbers?.length ?? 0) > 0 && (
                  <div className="mt-0.5 truncate font-mono text-xs text-plm-fg-muted">{deviation.affected_part_numbers?.join(', ')}</div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
