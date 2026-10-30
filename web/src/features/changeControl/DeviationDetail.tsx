import { useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Plus, X } from 'lucide-react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { Link, navigate } from '@web/lib/router'
import { ErrorState, Loading, NotFound, PageHeader } from '@web/shell/ui'
import {
  addFilesToDeviation,
  deleteDeviation,
  getDeviation,
  removeDeviationFile,
  updateDeviation,
  type DeviationDetailData,
  type FileSummary,
} from './api'
import { errorMessage, useLoad, usePermissions } from './hooks'
import {
  deviationStatusPatch,
  deviationStatusTargets,
  effectiveDeviationStatus,
  isExpiringSoon,
  isKnownDeviationType,
  mergePartNumbers,
  nullableText,
  type DeviationStatus,
} from './model'
import { paths } from './routes'
import { FilePicker } from './FilePicker'
import {
  Button,
  Card,
  ConfirmButton,
  DeviationStatusBadge,
  Fact,
  formatDate,
  formatDateTime,
  inputClass,
  LinkButton,
  Notice,
  Paragraphs,
  userLabel,
  WarningBadge,
} from './ui'

export function DeviationDetailPage({ id }: { id: string }) {
  const auth = useReadyAuth()
  const { data, error, loading, reload } = useLoad(() => getDeviation(id, { userId: auth.profile.id, orgId: auth.profile.org_id, isAdmin: auth.isAdmin }), id)
  if (loading && !data) return <Loading />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <NotFound />
  return <DeviationDetail data={data} reload={reload} />
}

function DeviationDetail({ data, reload }: { data: DeviationDetailData; reload: () => void }) {
  const t = useT()
  const auth = useReadyAuth()
  const permissions = usePermissions()
  const { deviation, users } = data
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [pinVersion, setPinVersion] = useState(false)
  const [tagNotes, setTagNotes] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [now] = useState(() => new Date())
  const userId = auth.profile.id
  const canEdit = permissions.deviations.edit
  const status = effectiveDeviationStatus(deviation, now)

  const run = async (action: () => Promise<void>, after: () => void = reload) => {
    setBusy(true)
    setFailure(null)
    try {
      await action()
      after()
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = (to: DeviationStatus) => {
    const result = deviationStatusPatch(deviation.status, to, userId, new Date().toISOString(), reason)
    if (!result.ok) {
      setFailure(t('changeControl.deviation.reasonRequired'))
      return
    }
    void run(async () => {
      await updateDeviation(deviation.id, result.patch)
      setRejecting(false)
      setReason('')
    })
  }

  const addFiles = (files: FileSummary[]) =>
    run(async () => {
      await addFilesToDeviation(deviation.id, files, userId, {
        pinVersion,
        notes: nullableText(tagNotes),
        affectedPartNumbers: mergePartNumbers(deviation.affected_part_numbers, files.map((file) => file.part_number)),
      })
      setPicking(false)
      setTagNotes('')
    })

  const removeFile = (linkId: string) => run(() => removeDeviationFile(linkId))
  const remove = () => run(() => deleteDeviation(deviation.id), () => navigate(paths.deviationList()))

  const taggedIds = useMemo(() => new Set(data.files.map((link) => link.file_id)), [data.files])
  const typeLabel = deviation.deviation_type
    ? isKnownDeviationType(deviation.deviation_type)
      ? t(`changeControl.deviationType.${deviation.deviation_type.toLowerCase()}`)
      : deviation.deviation_type
    : null

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link to={paths.deviationList()} aria-label={t('common.back')} className="text-plm-fg-dim hover:text-plm-fg">
              <ArrowLeft size={16} />
            </Link>
            <span className="font-mono">{deviation.deviation_number}</span>
            <DeviationStatusBadge status={status} />
            {isExpiringSoon(deviation, now) && <WarningBadge>{t('changeControl.deviation.expiresOn', { date: formatDate(deviation.expiration_date) })}</WarningBadge>}
          </span>
        }
        actions={
          canEdit && (
            <LinkButton to={paths.deviationEdit(deviation.id)}>
              <Pencil size={14} />
              {t('changeControl.edit')}
            </LinkButton>
          )
        }
      />
      <div className="flex max-w-4xl flex-col gap-4 p-4">
        {failure && <Notice tone="error">{failure}</Notice>}
        <h2 className="text-base font-medium text-plm-fg">{deviation.title}</h2>
        {deviation.description ? <Paragraphs text={deviation.description} /> : <p className="text-sm text-plm-fg-muted">{t('changeControl.noDescription')}</p>}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {typeLabel && <Fact label={t('changeControl.deviation.type')}>{typeLabel}</Fact>}
          <Fact label={t('changeControl.deviation.effectiveDate')}>{formatDate(deviation.effective_date) || t('changeControl.notSet')}</Fact>
          <Fact label={t('changeControl.deviation.expirationDate')}>{formatDate(deviation.expiration_date) || t('changeControl.deviation.noExpiration')}</Fact>
          <Fact label={t('changeControl.created')}>
            {t('changeControl.byOn', { name: userLabel(users, deviation.created_by), date: formatDateTime(deviation.created_at) })}
          </Fact>
          {deviation.updated_at && (
            <Fact label={t('changeControl.updated')}>
              {deviation.updated_by
                ? t('changeControl.byOn', { name: userLabel(users, deviation.updated_by), date: formatDateTime(deviation.updated_at) })
                : formatDateTime(deviation.updated_at)}
            </Fact>
          )}
          {deviation.approved_by && (
            <Fact label={t('changeControl.deviation.approved')}>
              {t('changeControl.byOn', { name: userLabel(users, deviation.approved_by), date: formatDateTime(deviation.approved_at) })}
            </Fact>
          )}
        </dl>
        {deviation.rejection_reason && (
          <div>
            <p className="text-xs text-plm-fg-muted">{t('changeControl.deviation.rejectionReason')}</p>
            <p className="whitespace-pre-wrap text-sm text-plm-error">{deviation.rejection_reason}</p>
          </div>
        )}
        {(deviation.affected_part_numbers?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs text-plm-fg-muted">{t('changeControl.deviation.partNumbers')}</p>
            <p className="break-words font-mono text-sm text-plm-fg">{deviation.affected_part_numbers?.join(', ')}</p>
          </div>
        )}

        {canEdit && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-plm-fg-muted">{t('changeControl.changeStatus')}</span>
              {deviationStatusTargets(deviation.status).map((target) =>
                target === 'rejected' ? (
                  <Button key={target} disabled={busy || rejecting} onClick={() => setRejecting(true)}>
                    {t('changeControl.deviationStatusAction.rejected')}
                  </Button>
                ) : (
                  <Button key={target} disabled={busy} onClick={() => changeStatus(target)}>
                    {t(`changeControl.deviationStatusAction.${target}`)}
                  </Button>
                ),
              )}
            </div>
            {rejecting && (
              <div className="flex flex-col gap-2 rounded border border-plm-border-light p-3">
                <label htmlFor="dev-reject-reason" className="text-xs font-medium text-plm-fg-dim">
                  {t('changeControl.deviation.rejectionReason')}
                </label>
                <textarea id="dev-reject-reason" rows={3} className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
                <div className="flex gap-2">
                  <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => changeStatus('rejected')}>
                    {t('changeControl.deviationStatusAction.rejected')}
                  </Button>
                  <Button variant="ghost" onClick={() => setRejecting(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <Card
          title={t('changeControl.files.title', { count: data.files.length })}
          actions={
            canEdit &&
            !picking && (
              <Button onClick={() => setPicking(true)} disabled={busy}>
                <Plus size={14} />
                {t('changeControl.files.add')}
              </Button>
            )
          }
        >
          {picking && (
            <div className="mb-3">
              <FilePicker excludeIds={taggedIds} busy={busy} onAdd={(files) => void addFiles(files)} onCancel={() => setPicking(false)}>
                <label className="flex items-center gap-2 text-sm text-plm-fg">
                  <input type="checkbox" checked={pinVersion} onChange={(event) => setPinVersion(event.target.checked)} />
                  {t('changeControl.deviation.pinVersion')}
                </label>
                <input
                  aria-label={t('changeControl.files.notes')}
                  placeholder={t('changeControl.files.notes')}
                  value={tagNotes}
                  onChange={(event) => setTagNotes(event.target.value)}
                  className={inputClass}
                />
              </FilePicker>
            </div>
          )}
          {data.files.length === 0 ? (
            <p className="text-sm text-plm-fg-muted">{t('changeControl.files.empty')}</p>
          ) : (
            <ul className="divide-y divide-plm-border">
              {data.files.map((link) => (
                <li key={link.id} className="flex items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    {link.file ? (
                      <Link to={paths.file(link.file_id)} className="block truncate text-sm text-plm-accent hover:underline">
                        {link.file.file_name}
                      </Link>
                    ) : (
                      <span className="text-sm text-plm-fg-muted">{t('changeControl.files.unavailable')}</span>
                    )}
                    <div className="truncate text-xs text-plm-fg-muted">
                      {[
                        link.file?.part_number,
                        link.file_version !== null
                          ? t('changeControl.files.pinned', { revision: link.file_revision ?? '', version: link.file_version })
                          : t('changeControl.files.allVersions'),
                        link.file?.file_path,
                        t('changeControl.byOn', { name: userLabel(users, link.created_by), date: formatDateTime(link.created_at) }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {link.notes && <div className="text-xs text-plm-fg-dim">{link.notes}</div>}
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      aria-label={t('changeControl.files.remove')}
                      title={t('changeControl.files.remove')}
                      disabled={busy}
                      onClick={() => void removeFile(link.id)}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {permissions.deviations.delete && (
          <div>
            <ConfirmButton
              label={t('changeControl.deviation.delete')}
              confirmLabel={t('changeControl.deviation.deleteConfirm')}
              prompt={t('changeControl.deviation.deletePrompt', { number: deviation.deviation_number })}
              onConfirm={() => void remove()}
              disabled={busy}
            />
          </div>
        )}
      </div>
    </div>
  )
}
