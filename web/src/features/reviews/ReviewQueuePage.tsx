// `/reviews`: the review queue. `?filter=` picks the bucket (waiting on me, I requested, my teams,
// done), `?q=` searches, `?team=` narrows "my teams". Gate reviews arrive in "waiting on me" as
// their own rows and are decided in place.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { useT } from '@web/i18n'
import { href, Link, navigate } from '@web/lib/router'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { EmptyState, ErrorState, Loading, PageHeader } from '@web/shell/ui'
import { listReviewQueue } from '@/lib/supabase/reviews'
import type { ReviewQueueBucket, ReviewQueueRow } from '@/types/reviews'
import { GateReviewCard } from './GateReviewCard'
import { localDateString, parseBucket, QUEUE_BUCKETS, queueRowChips } from './reviewLogic'
import { buttonClass, describeReviewError, DueChipView, inputClass, PriorityChip, StatusChip } from './reviewUi'

const PAGE_SIZE = 50
const SEARCH_DELAY_MS = 300

export function ReviewQueuePage({ query }: { query: URLSearchParams }) {
  const t = useT()
  const auth = useReadyAuth()
  const bucket = parseBucket(query.get('filter'))
  const search = query.get('q') ?? ''
  const teamId = bucket === 'my_teams' ? (query.get('team') ?? '') : ''

  const [searchText, setSearchText] = useState(search)
  const [rows, setRows] = useState<ReviewQueueRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)

  const go = useCallback(
    (next: { filter?: ReviewQueueBucket; q?: string; team?: string }) => {
      const filter = next.filter ?? bucket
      navigate(
        href(['reviews'], {
          filter: filter === 'awaiting_me' ? undefined : filter,
          q: next.q ?? search,
          team: filter === 'my_teams' ? (next.team ?? teamId) : undefined,
        }),
        { replace: true },
      )
    },
    [bucket, search, teamId],
  )

  // Debounce typing into the `q` query parameter.
  useEffect(() => {
    if (searchText === search) return
    const timer = window.setTimeout(() => go({ q: searchText.trim() }), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [searchText, search, go])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    listReviewQueue({ bucket, search: search || null, teamId: teamId || null, limit: PAGE_SIZE })
      .then((page) => {
        if (!active) return
        setRows(page.rows)
        setCursor(page.nextCursor)
      })
      .catch((err: unknown) => {
        if (active) setError(describeReviewError(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [bucket, search, teamId, reloadCount])

  const loadMore = async () => {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const page = await listReviewQueue({ bucket, search: search || null, teamId: teamId || null, limit: PAGE_SIZE, cursor })
      setRows((prev) => [...prev, ...page.rows])
      setCursor(page.nextCursor)
    } catch (err) {
      setError(describeReviewError(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const today = useMemo(() => localDateString(), [])
  const gateRows = rows.filter((row) => row.kind === 'gate')
  const packageRows = rows.filter((row) => row.kind === 'package')

  return (
    <div>
      <PageHeader
        title={t('reviews.title')}
        actions={
          <button type="button" className={buttonClass} onClick={() => setReloadCount((n) => n + 1)}>
            <RefreshCw size={14} />
            <span className="hidden sm:inline">{t('reviews.queue.refresh')}</span>
          </button>
        }
      >
        <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label={t('reviews.queue.filter')}>
          {QUEUE_BUCKETS.map((b) => (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={b === bucket}
              onClick={() => go({ filter: b })}
              className={`rounded px-3 py-1 text-sm ${
                b === bucket ? 'bg-plm-selection text-plm-fg' : 'text-plm-fg-dim hover:bg-plm-bg-lighter'
              }`}
            >
              {t(`reviews.queue.bucket.${b}`)}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <Search size={14} className="pointer-events-none absolute left-2 top-2.5 text-plm-fg-muted" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t('reviews.queue.search')}
              aria-label={t('reviews.queue.search')}
              className={`${inputClass} pl-7`}
            />
          </label>
          {bucket === 'my_teams' && auth.teams.length > 0 && (
            <select
              value={teamId}
              onChange={(event) => go({ team: event.target.value })}
              aria-label={t('reviews.queue.team')}
              className={`${inputClass} w-auto`}
            >
              <option value="">{t('reviews.queue.allTeams')}</option>
              {auth.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </PageHeader>

      {loading ? (
        <Loading />
      ) : error && rows.length === 0 ? (
        <ErrorState message={error} onRetry={() => setReloadCount((n) => n + 1)} />
      ) : rows.length === 0 ? (
        <EmptyState>{t(`reviews.queue.empty.${bucket}`)}</EmptyState>
      ) : (
        <div className="space-y-4 p-4">
          {gateRows.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase text-plm-fg-muted">{t('reviews.gate.title')}</h2>
              <ul className="space-y-2">
                {gateRows.map((row) => (
                  <GateReviewCard key={row.id} row={row} />
                ))}
              </ul>
            </section>
          )}
          {packageRows.length > 0 && (
            <ul className="divide-y divide-plm-border rounded border border-plm-border">
              {packageRows.map((row) => (
                <QueueRow key={row.id} row={row} today={today} />
              ))}
            </ul>
          )}
          {error && <ErrorState message={error} />}
          {cursor && (
            <button type="button" className={buttonClass} disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? t('common.loading') : t('reviews.queue.loadMore')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function QueueRow({ row, today }: { row: ReviewQueueRow; today: string }) {
  const t = useT()
  const chips = queueRowChips(row, today)
  const preview = row.preview
  return (
    <li>
      <Link
        to={href(['reviews', row.id])}
        className="block px-3 py-2.5 hover:bg-plm-bg-lighter focus:bg-plm-bg-lighter focus:outline-none"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-plm-fg">{row.title}</span>
          <StatusChip status={row.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-plm-fg-muted">
          {preview && (
            <span className="truncate">
              {preview.fileName}
              {preview.version !== null && ` · ${t('reviews.detail.version', { version: preview.version })}`}
            </span>
          )}
          {row.requestedBy && (
            <span>{t('reviews.queue.requestedBy', { name: row.requestedBy.fullName || row.requestedBy.email })}</span>
          )}
          {row.round !== null && row.round > 1 && <span>{t('reviews.queue.round', { round: row.round })}</span>}
          {chips.progress && (
            <span>{t('reviews.queue.progress', { decided: chips.progress.decided, total: chips.progress.total })}</span>
          )}
          {row.itemsOwedByMe > 0 && (
            <span className="font-medium text-plm-accent">{t('reviews.queue.owedByMe', { count: row.itemsOwedByMe })}</span>
          )}
          {chips.priority && <PriorityChip priority={chips.priority} />}
          {chips.due && <DueChipView chip={chips.due} />}
        </div>
      </Link>
    </li>
  )
}
