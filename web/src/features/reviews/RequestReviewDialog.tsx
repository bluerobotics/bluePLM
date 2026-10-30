// Request a drawing review from the web. File ids are pinned to their latest checked-in version as
// the server records it (`getLatestCheckedInVersions`); version ids are used as given. Teams are
// sent as team ids and expanded on the server; the picker only previews who that reaches.
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { href, Link } from '@web/lib/router'
import {
  expandReviewerSelection,
  getLatestCheckedInVersions,
  getOrgTeamsWithMembers,
  requestReview,
  type LatestFileVersion,
  type TeamWithMembers,
} from '@/lib/supabase/reviews'
import type { RequestReviewResult, ReviewMode, ReviewPriority } from '@/types/reviews'
import { isDateOnly, requestBlockers, splitRequestTargets } from './reviewLogic'
import { getOrgUserDirectory, getVersionsByIds, type OrgUser } from './reviewsApi'
import { buttonClass, describeReviewError, inputClass, Modal, Notice, primaryButtonClass } from './reviewUi'
import { refreshReviewBadgeCount } from './useReviewBadgeCount'

const PRIORITIES: readonly ReviewPriority[] = ['low', 'normal', 'high', 'urgent']
const MODES: readonly ReviewMode[] = ['all', 'any']

export interface RequestReviewDialogProps {
  /** Files to review at their latest checked-in version. */
  fileIds?: string[]
  /** Specific `file_versions` ids to review. */
  fileVersionIds?: string[]
  onClose: () => void
  /** Called after the server created the review. */
  onRequested?: (reviewId: string) => void
}

interface Loaded {
  versions: LatestFileVersion[]
  leftOut: number
  teams: TeamWithMembers[]
  users: OrgUser[]
}

export function RequestReviewDialog({ fileIds, fileVersionIds, onClose, onRequested }: RequestReviewDialogProps) {
  const t = useT()
  const auth = useReadyAuth()
  const orgId = auth.organization.id
  const me = auth.profile.id
  const targets = useMemo(
    () => splitRequestTargets({ fileIds, fileVersionIds }),
    // The id lists are compared by content so a caller passing a fresh array does not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [(fileIds ?? []).join(','), (fileVersionIds ?? []).join(',')],
  )

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<ReviewMode>('all')
  const [priority, setPriority] = useState<ReviewPriority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [reviewerIds, setReviewerIds] = useState<string[]>([])
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [peopleSearch, setPeopleSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RequestReviewResult | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      getLatestCheckedInVersions(targets.fileIds),
      targets.fileVersionIds.length > 0 ? getVersionsByIds(targets.fileVersionIds) : Promise.resolve([]),
      getOrgTeamsWithMembers(orgId),
      getOrgUserDirectory(orgId),
    ])
      .then(([latest, pinned, teams, users]) => {
        if (!active) return
        // One version per file: an explicit version id wins over a file's latest.
        const byFile = new Map<string, LatestFileVersion>()
        for (const v of latest) byFile.set(v.fileId, v)
        for (const v of pinned) byFile.set(v.fileId, v)
        const versions = Array.from(byFile.values())
        const asked = targets.fileIds.length + targets.fileVersionIds.length
        setLoaded({ versions, leftOut: Math.max(0, asked - latest.length - pinned.length), teams: teams.teams, users })
        if (teams.error) setLoadError(teams.error)
      })
      .catch((err: unknown) => {
        if (active) setLoadError(describeReviewError(err))
      })
    return () => {
      active = false
    }
  }, [targets, orgId])

  const expanded = useMemo(
    () => expandReviewerSelection({ reviewerIds, teamIds }, loaded?.teams ?? [], me),
    [reviewerIds, teamIds, loaded, me],
  )
  const blockers = requestBlockers(loaded?.versions.length ?? 0, expanded.userIds.length)
  const people = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase()
    return (loaded?.users ?? [])
      .filter((u) => u.id !== me)
      .filter((u) => !q || u.email.toLowerCase().includes(q) || (u.fullName ?? '').toLowerCase().includes(q))
  }, [loaded, peopleSearch, me])

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const submit = async () => {
    if (!loaded || blockers.length > 0) return
    setBusy(true)
    setError(null)
    try {
      const res = await requestReview({
        fileVersionIds: loaded.versions.map((v) => v.fileVersionId),
        reviewerIds,
        teamIds,
        title: title.trim() || null,
        message: message.trim() || null,
        mode,
        priority,
        dueDate: isDateOnly(dueDate) ? dueDate : null,
      })
      setResult(res)
      refreshReviewBadgeCount()
      onRequested?.(res.reviewId)
    } catch (err) {
      setError(describeReviewError(err))
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Modal
        title={t('reviews.request.title')}
        onClose={onClose}
        footer={
          <>
            <button type="button" className={buttonClass} onClick={onClose}>
              {t('common.close')}
            </button>
            <Link to={href(['reviews', result.reviewId])} onClick={onClose} className={primaryButtonClass}>
              {t('reviews.request.open')}
            </Link>
          </>
        }
      >
        <Notice tone="success">
          {t('reviews.request.sent', { items: result.itemCount, count: result.reviewerIds.length })}
        </Notice>
        {result.skipped.length > 0 && (
          <p className="mt-2 text-sm text-plm-fg-muted">{t('reviews.request.skipped', { count: result.skipped.length })}</p>
        )}
      </Modal>
    )
  }

  const emptyTeamNames = expanded.emptyTeamIds
    .map((id) => loaded?.teams.find((team) => team.id === id)?.name)
    .filter((name): name is string => !!name)

  return (
    <Modal
      title={t('reviews.request.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className={buttonClass} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            disabled={busy || !loaded || blockers.length > 0}
            onClick={() => void submit()}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {t('reviews.request.submit')}
          </button>
        </>
      }
    >
      {!loaded ? (
        loadError ? <Notice tone="error">{loadError}</Notice> : <p className="text-sm text-plm-fg-muted">{t('reviews.request.loading')}</p>
      ) : (
        <div className="space-y-4">
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase text-plm-fg-muted">{t('reviews.request.files')}</h3>
            <ul className="max-h-40 overflow-y-auto rounded border border-plm-border text-sm">
              {loaded.versions.map((v) => (
                <li key={v.fileVersionId} className="flex gap-2 border-b border-plm-border px-2 py-1 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate text-plm-fg" title={v.filePath}>
                    {v.fileName}
                  </span>
                  <span className="text-xs text-plm-fg-muted">{t('reviews.request.version', { version: v.version })}</span>
                </li>
              ))}
            </ul>
            {loaded.leftOut > 0 && (
              <p className="mt-1 text-xs text-plm-warning">{t('reviews.request.noVersion', { count: loaded.leftOut })}</p>
            )}
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-plm-fg-dim sm:col-span-2">
              {t('reviews.request.reviewTitle')}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('reviews.request.reviewTitlePlaceholder')}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-sm text-plm-fg-dim sm:col-span-2">
              {t('reviews.request.message')}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                placeholder={t('reviews.request.messagePlaceholder')}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-sm text-plm-fg-dim">
              {t('reviews.mode.label')}
              <select value={mode} onChange={(e) => setMode(e.target.value as ReviewMode)} className={`mt-1 ${inputClass}`}>
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`reviews.mode.${m}`)}
                  </option>
                ))}
              </select>
              <span className="mt-0.5 block text-xs text-plm-fg-muted">{t(`reviews.modeHint.${mode}`)}</span>
            </label>
            <label className="block text-sm text-plm-fg-dim">
              {t('reviews.priority.label')}
              <select value={priority} onChange={(e) => setPriority(e.target.value as ReviewPriority)} className={`mt-1 ${inputClass}`}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`reviews.priority.${p}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-plm-fg-dim">
              {t('reviews.request.dueDate')}
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`mt-1 ${inputClass}`} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-1 text-xs font-semibold uppercase text-plm-fg-muted">{t('reviews.request.teams')}</legend>
              {loaded.teams.length === 0 ? (
                <p className="text-sm text-plm-fg-muted">{t('reviews.request.noTeams')}</p>
              ) : (
                <ul className="max-h-48 overflow-y-auto rounded border border-plm-border">
                  {loaded.teams.map((team) => (
                    <li key={team.id}>
                      <label className="flex items-center gap-2 px-2 py-1 text-sm text-plm-fg hover:bg-plm-bg-lighter">
                        <input
                          type="checkbox"
                          checked={teamIds.includes(team.id)}
                          onChange={() => setTeamIds((prev) => toggle(prev, team.id))}
                        />
                        <span className="min-w-0 flex-1 truncate">{team.name}</span>
                        {teamIds.includes(team.id) && (
                          <span className="text-xs text-plm-fg-muted">
                            {t('reviews.request.teamCount', { count: expanded.byTeam[team.id]?.length ?? 0 })}
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-xs font-semibold uppercase text-plm-fg-muted">{t('reviews.request.people')}</legend>
              <input
                type="search"
                value={peopleSearch}
                onChange={(e) => setPeopleSearch(e.target.value)}
                placeholder={t('reviews.request.searchPeople')}
                aria-label={t('reviews.request.searchPeople')}
                className={`mb-1 ${inputClass}`}
              />
              {people.length === 0 ? (
                <p className="text-sm text-plm-fg-muted">{t('reviews.request.noPeople')}</p>
              ) : (
                <ul className="max-h-48 overflow-y-auto rounded border border-plm-border">
                  {people.map((u) => (
                    <li key={u.id}>
                      <label className="flex items-center gap-2 px-2 py-1 text-sm text-plm-fg hover:bg-plm-bg-lighter">
                        <input
                          type="checkbox"
                          checked={reviewerIds.includes(u.id)}
                          onChange={() => setReviewerIds((prev) => toggle(prev, u.id))}
                        />
                        <span className="min-w-0 flex-1 truncate">{u.fullName || u.email}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          </div>

          <p className="text-sm text-plm-fg-dim">{t('reviews.request.reaches', { count: expanded.userIds.length })}</p>
          {emptyTeamNames.length > 0 && (
            <p className="text-xs text-plm-warning">{t('reviews.request.emptyTeams', { names: emptyTeamNames.join(', ') })}</p>
          )}
          {blockers.map((b) => (
            <p key={b} className="text-xs text-plm-fg-muted">
              {t(`reviews.request.blocker.${b}`)}
            </p>
          ))}
          {loadError && <Notice tone="error">{loadError}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </Modal>
  )
}
