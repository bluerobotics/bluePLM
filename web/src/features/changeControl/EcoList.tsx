import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { href, Link, navigate } from '@web/lib/router'
import { EmptyState, ErrorState, Loading, PageHeader } from '@web/shell/ui'
import { listEcos } from './api'
import { useLoad, usePermissions } from './hooks'
import { ECO_STATUSES, matchesQuery, type EcoStatus } from './model'
import { paths } from './routes'
import { EcoStatusBadge, formatDate, inputClass, LinkButton, SectionTabs, userLabel } from './ui'

function isEcoStatus(value: string | null): value is EcoStatus {
  return !!value && (ECO_STATUSES as readonly string[]).includes(value)
}

export function EcoList({ query }: { query: URLSearchParams }) {
  const t = useT()
  const auth = useReadyAuth()
  const permissions = usePermissions()
  const orgId = auth.profile.org_id
  const { data, error, loading, reload } = useLoad(() => listEcos(orgId), orgId)

  const search = query.get('q') ?? ''
  const statusParam = query.get('status')
  const status = isEcoStatus(statusParam) ? statusParam : 'all'

  const setFilter = (next: { q?: string; status?: string }) =>
    navigate(href(['eco'], { q: next.q ?? search, status: (next.status ?? status) === 'all' ? undefined : (next.status ?? status) }), { replace: true })

  const filtered = useMemo(
    () =>
      (data?.ecos ?? []).filter(
        (eco) =>
          (status === 'all' || (eco.status ?? 'open') === status) &&
          matchesQuery({ number: eco.eco_number, title: eco.title, description: eco.description }, search),
      ),
    [data, search, status],
  )

  return (
    <div>
      <PageHeader
        title={t('changeControl.title')}
        actions={
          permissions.eco.create && (
            <LinkButton to={paths.ecoNew()} variant="primary">
              <Plus size={14} />
              {t('changeControl.eco.new')}
            </LinkButton>
          )
        }
      >
        <SectionTabs active="eco" />
      </PageHeader>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <input
          type="search"
          aria-label={t('changeControl.eco.searchLabel')}
          placeholder={t('changeControl.eco.searchPlaceholder')}
          value={search}
          onChange={(event) => setFilter({ q: event.target.value })}
          className={`${inputClass} max-w-xs flex-1`}
        />
        <select
          aria-label={t('changeControl.statusFilter')}
          value={status}
          onChange={(event) => setFilter({ status: event.target.value })}
          className={`${inputClass} w-auto`}
        >
          <option value="all">{t('changeControl.allStatuses')}</option>
          {ECO_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`changeControl.ecoStatus.${value}`)}
            </option>
          ))}
        </select>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState>{data && data.ecos.length > 0 ? t('changeControl.eco.noMatches') : t('changeControl.eco.empty')}</EmptyState>
      ) : (
        <ul className="divide-y divide-plm-border border-y border-plm-border">
          {filtered.map((eco) => (
            <li key={eco.id}>
              <Link to={paths.eco(eco.id)} className="block px-4 py-2.5 hover:bg-plm-bg-lighter">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-plm-fg">{eco.eco_number}</span>
                  <EcoStatusBadge status={eco.status} />
                  <span className="ml-auto text-xs text-plm-fg-muted">
                    {t('changeControl.fileCount', { count: data?.fileCounts.get(eco.id) ?? 0 })}
                  </span>
                </div>
                {eco.title && <div className="mt-0.5 truncate text-sm text-plm-fg-dim">{eco.title}</div>}
                <div className="mt-0.5 text-xs text-plm-fg-muted">
                  {t('changeControl.createdBy', { name: userLabel(data?.users, eco.created_by), date: formatDate(eco.created_at) })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
