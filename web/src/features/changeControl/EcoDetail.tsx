import { useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Plus, X } from 'lucide-react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { Link, navigate } from '@web/lib/router'
import { ErrorState, Loading, NotFound, PageHeader } from '@web/shell/ui'
import { addFilesToEco, deleteEco, getEco, logEcoActivity, removeEcoFile, updateEco, type EcoDetailData, type FileSummary } from './api'
import { errorMessage, useLoad, usePermissions } from './hooks'
import { buildEcoHistory, ECO_ACTIVITY, ecoStatusPatch, ecoStatusTargets, isEcoActive, type EcoStatus } from './model'
import { paths } from './routes'
import { EcoChecklist } from './EcoChecklist'
import { FilePicker } from './FilePicker'
import { Button, Card, ConfirmButton, EcoStatusBadge, Fact, formatDateTime, LinkButton, Notice, Paragraphs, userLabel } from './ui'

export function EcoDetailPage({ id }: { id: string }) {
  const auth = useReadyAuth()
  const { data, error, loading, reload } = useLoad(() => getEco(id, { userId: auth.profile.id, orgId: auth.profile.org_id, isAdmin: auth.isAdmin }), id)
  if (loading && !data) return <Loading />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <NotFound />
  return <EcoDetail data={data} reload={reload} />
}

function EcoDetail({ data, reload }: { data: EcoDetailData; reload: () => void }) {
  const t = useT()
  const auth = useReadyAuth()
  const permissions = usePermissions()
  const { eco, users } = data
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const userId = auth.profile.id

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

  const changeStatus = (to: EcoStatus) =>
    run(async () => {
      await updateEco(eco.id, ecoStatusPatch(eco.status, to, userId, new Date().toISOString()))
      await logEcoActivity(eco.id, userId, ECO_ACTIVITY.statusChanged, { old: eco.status ?? 'open', new: to })
    })

  const addFiles = (files: FileSummary[]) =>
    run(async () => {
      await addFilesToEco(eco.id, files.map((file) => file.id), userId)
      await logEcoActivity(eco.id, userId, ECO_ACTIVITY.filesAdded, { new: files.map((file) => file.file_name).join(', ') })
      setPicking(false)
    })

  const removeFile = (linkId: string, fileName: string) =>
    run(async () => {
      await removeEcoFile(linkId)
      await logEcoActivity(eco.id, userId, ECO_ACTIVITY.fileRemoved, { old: fileName })
    })

  const remove = () => run(() => deleteEco(eco.id), () => navigate(paths.ecoList()))

  const taggedIds = useMemo(() => new Set(data.files.map((link) => link.file_id)), [data.files])
  const history = useMemo(() => buildEcoHistory(eco, data.activity), [eco, data.activity])

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link to={paths.ecoList()} aria-label={t('common.back')} className="text-plm-fg-dim hover:text-plm-fg">
              <ArrowLeft size={16} />
            </Link>
            <span className="font-mono">{eco.eco_number}</span>
            <EcoStatusBadge status={eco.status} />
          </span>
        }
        actions={
          permissions.eco.edit && (
            <LinkButton to={paths.ecoEdit(eco.id)}>
              <Pencil size={14} />
              {t('changeControl.edit')}
            </LinkButton>
          )
        }
      />
      <div className="flex max-w-4xl flex-col gap-4 p-4">
        {failure && <Notice tone="error">{failure}</Notice>}
        {eco.title && <h2 className="text-base font-medium text-plm-fg">{eco.title}</h2>}
        {eco.description ? <Paragraphs text={eco.description} /> : <p className="text-sm text-plm-fg-muted">{t('changeControl.noDescription')}</p>}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Fact label={t('changeControl.created')}>
            {t('changeControl.byOn', { name: userLabel(users, eco.created_by), date: formatDateTime(eco.created_at) })}
          </Fact>
          {eco.updated_at && (
            <Fact label={t('changeControl.updated')}>
              {eco.updated_by ? t('changeControl.byOn', { name: userLabel(users, eco.updated_by), date: formatDateTime(eco.updated_at) }) : formatDateTime(eco.updated_at)}
            </Fact>
          )}
          {eco.completed_at && <Fact label={t('changeControl.eco.completed')}>{formatDateTime(eco.completed_at)}</Fact>}
        </dl>

        {permissions.eco.edit && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-plm-fg-muted">{t('changeControl.changeStatus')}</span>
            {ecoStatusTargets(eco.status).map((status) => (
              <Button key={status} disabled={busy} onClick={() => void changeStatus(status)}>
                {t(`changeControl.ecoStatusAction.${status}`)}
              </Button>
            ))}
          </div>
        )}

        <Card
          title={t('changeControl.files.title', { count: data.files.length })}
          actions={
            permissions.eco.edit &&
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
              {!isEcoActive(eco.status) && <p className="mb-2 text-xs text-plm-warning">{t('changeControl.eco.closedTagWarning')}</p>}
              <FilePicker excludeIds={taggedIds} busy={busy} onAdd={(files) => void addFiles(files)} onCancel={() => setPicking(false)} />
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
                        link.file?.revision && t('changeControl.files.revision', { revision: link.file.revision }),
                        link.file?.file_path,
                        t('changeControl.byOn', { name: userLabel(users, link.created_by), date: formatDateTime(link.created_at) }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {link.notes && <div className="text-xs text-plm-fg-dim">{link.notes}</div>}
                  </div>
                  {permissions.eco.edit && (
                    <Button
                      variant="ghost"
                      aria-label={t('changeControl.files.remove')}
                      title={t('changeControl.files.remove')}
                      disabled={busy}
                      onClick={() => void removeFile(link.id, link.file?.file_name ?? link.file_id)}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <EcoChecklist data={data} reload={reload} />

        <Card title={t('changeControl.history.title')}>
          {history.length === 0 ? (
            <p className="text-sm text-plm-fg-muted">{t('changeControl.history.empty')}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {history.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <span className="text-plm-fg">{historyText(t, entry)}</span>
                  <span className="block text-xs text-plm-fg-muted">
                    {entry.userId ? t('changeControl.byOn', { name: userLabel(users, entry.userId), date: formatDateTime(entry.at) }) : formatDateTime(entry.at)}
                  </span>
                  {entry.notes && <span className="block whitespace-pre-wrap text-xs text-plm-fg-dim">{entry.notes}</span>}
                </li>
              ))}
            </ol>
          )}
        </Card>

        {permissions.eco.delete && (
          <div>
            <ConfirmButton
              label={t('changeControl.eco.delete')}
              confirmLabel={t('changeControl.eco.deleteConfirm')}
              prompt={t('changeControl.eco.deletePrompt', { number: eco.eco_number })}
              onConfirm={() => void remove()}
              disabled={busy}
            />
          </div>
        )}
      </div>
    </div>
  )
}

type Translate = (key: string, params?: Record<string, string | number>) => string

const STATUS_VALUES = new Set(['open', 'in_progress', 'completed', 'cancelled'])
const CHECKLIST_VALUES = new Set(['not_started', 'in_progress', 'complete', 'blocked', 'na'])

function historyText(t: Translate, entry: { action: string; oldValue: string | null; newValue: string | null }): string {
  const ecoStatus = (value: string | null) => (value && STATUS_VALUES.has(value) ? t(`changeControl.ecoStatus.${value}`) : (value ?? ''))
  const itemStatus = (value: string | null) => (value && CHECKLIST_VALUES.has(value) ? t(`changeControl.checklistStatus.${value}`) : (value ?? ''))
  switch (entry.action) {
    case ECO_ACTIVITY.created:
      return t('changeControl.history.created')
    case ECO_ACTIVITY.edited:
      return t('changeControl.history.edited')
    case ECO_ACTIVITY.statusChanged:
      return entry.oldValue
        ? t('changeControl.history.statusChanged', { from: ecoStatus(entry.oldValue), to: ecoStatus(entry.newValue) })
        : t('changeControl.history.statusSet', { to: ecoStatus(entry.newValue) })
    case ECO_ACTIVITY.filesAdded:
      return t('changeControl.history.filesAdded', { files: entry.newValue ?? '' })
    case ECO_ACTIVITY.fileRemoved:
      return t('changeControl.history.fileRemoved', { file: entry.oldValue ?? '' })
    case ECO_ACTIVITY.itemStatus:
      return t('changeControl.history.itemStatus', { from: itemStatus(entry.oldValue), to: itemStatus(entry.newValue) })
    case ECO_ACTIVITY.templateApplied:
      return t('changeControl.history.templateApplied', { template: entry.newValue ?? '' })
    case ECO_ACTIVITY.gateApproved:
      return t('changeControl.history.gateApproved', { gate: entry.newValue ?? '' })
    default:
      return entry.action
  }
}
