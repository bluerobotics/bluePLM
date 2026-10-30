// `/file/<id>`: metadata, checkout, versions, references and downloads for one file.
import { useState, type ReactNode } from 'react'
import { ChevronRight, ClipboardCheck, FileText, Lock } from 'lucide-react'
import { useT } from '@web/i18n'
import { href, Link, navigate } from '@web/lib/router'
import { RequestReviewDialog } from '@web/features/reviews/RequestReviewDialog'
import { EmptyState, ErrorState, Loading, NotFound, PageHeader } from '@web/shell/ui'
import { loadFile, loadMetadataColumns, type FileDetailRow, type VaultSummary } from './api'
import { DownloadButton, Panel, StateBadge, useVaults } from './components'
import { customPropertyRows } from './detail'
import { formatDateTime } from './format'
import { formatBytes, userName, type UserRef } from './listing'
import { parentFolder } from './paths'
import { FileReferences, FileVersions } from './FileHistory'
import { useLoad } from './useLoad'

export function FileDetail({ fileId }: { fileId: string }) {
  const t = useT()
  const vaults = useVaults()
  const file = useLoad(fileId, () => loadFile(fileId))

  if (file.status === 'loading' || vaults.status === 'loading') return <Loading />
  if (file.status === 'error') return <ErrorState message={file.error} onRetry={file.reload} />
  if (vaults.status === 'error') return <ErrorState message={vaults.error} onRetry={vaults.reload} />
  if (!file.data) return <NotFound />
  // RLS lets every org member read every file row; vault access is enforced here, in the UI.
  const vault = vaults.data.find((v) => v.id === file.data?.vault_id)
  if (!vault) return <EmptyState>{t('files.detail.noAccess')}</EmptyState>
  return <FileDetailBody file={file.data} vault={vault} vaultIds={vaults.data.map((v) => v.id)} />
}

function FileDetailBody({ file, vault, vaultIds }: { file: FileDetailRow; vault: VaultSummary; vaultIds: string[] }) {
  const t = useT()
  const folder = parentFolder(file.file_path)
  const columns = useLoad(file.org_id, () => loadMetadataColumns(file.org_id))
  const properties = customPropertyRows(file.custom_properties, columns.data ?? [])
  const configRevisions = customPropertyRows(file.configuration_revisions, [])
  const fileTypeKey = `files.fileType.${file.file_type}`
  const fileTypeLabel = t(fileTypeKey) === fileTypeKey ? file.file_type : t(fileTypeKey)
  const [requesting, setRequesting] = useState(false)

  return (
    <div>
      {requesting && (
        <RequestReviewDialog
          fileIds={[file.id]}
          onClose={() => setRequesting(false)}
          onRequested={(reviewId) => navigate(href(['reviews', reviewId]))}
        />
      )}
      <PageHeader
        title={
          <span className="inline-flex min-w-0 items-center gap-2">
            <FileText size={16} className="shrink-0 text-plm-fg-muted" />
            <span className="truncate">{file.file_name}</span>
          </span>
        }
        actions={
          <>
            {!file.deleted_at && (
              <button
                type="button"
                onClick={() => setRequesting(true)}
                className="flex items-center gap-1 rounded border border-plm-border-light px-2 py-1 text-sm text-plm-fg hover:bg-plm-bg-lighter"
              >
                <ClipboardCheck size={14} />
                {t('files.detail.requestReview')}
              </button>
            )}
            <DownloadButton
              orgId={file.org_id}
              hash={file.content_hash}
              fileName={file.file_name}
              label={t('files.download.currentNamed', { name: file.file_name })}
            />
          </>
        }
      >
        <nav aria-label={t('files.folder.breadcrumbs')} className="mt-1 flex flex-wrap items-center gap-1 text-sm">
          <Link to={href(['files', vault.id])} className="text-plm-fg-muted hover:text-plm-fg hover:underline">
            {vault.name}
          </Link>
          {folder && (
            <>
              <ChevronRight size={12} className="text-plm-fg-muted" />
              <Link
                to={href(['files', vault.id], { path: folder })}
                className="break-all text-plm-fg-muted hover:text-plm-fg hover:underline"
              >
                {folder}
              </Link>
            </>
          )}
        </nav>
      </PageHeader>

      {file.deleted_at && (
        <p role="status" className="mx-4 mt-3 rounded border border-plm-error px-3 py-2 text-sm text-plm-error">
          {t('files.detail.deleted')}
        </p>
      )}

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <Panel title={t('files.detail.details')}>
          <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
            <Field label={t('files.detail.partNumber')}>{file.part_number}</Field>
            <Field label={t('files.detail.description')}>{file.description}</Field>
            <Field label={t('files.detail.revision')}>{file.revision}</Field>
            <Field label={t('files.detail.version')}>{String(file.version)}</Field>
            <Field label={t('files.detail.state')}>
              <StateBadge row={file} />
            </Field>
            <Field label={t('files.detail.stateChanged')}>{formatDateTime(file.state_changed_at)}</Field>
            <Field label={t('files.detail.type')}>{fileTypeLabel}</Field>
            <Field label={t('files.detail.path')}>
              <span className="break-all">{file.file_path}</span>
            </Field>
            <Field label={t('files.detail.size')}>{formatBytes(file.file_size)}</Field>
            <Field label={t('files.detail.created')}>{byUser(t, file.created_at, file.created_by_user)}</Field>
            <Field label={t('files.detail.updated')}>{byUser(t, file.updated_at, file.updated_by_user)}</Field>
            <Field label={t('files.detail.checkedOut')}>
              <CheckoutInfo file={file} />
            </Field>
            {file.eco_tags && file.eco_tags.length > 0 && (
              <Field label={t('files.detail.ecoTags')}>{file.eco_tags.join(', ')}</Field>
            )}
          </dl>
          {configRevisions.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-xs font-medium uppercase text-plm-fg-muted">
                {t('files.detail.configurationRevisions')}
              </h3>
              <PropertyList rows={configRevisions} />
            </>
          )}
        </Panel>

        <Panel title={t('files.detail.customProperties')}>
          {properties.length === 0 ? (
            <p className="text-sm text-plm-fg-muted">{t('files.detail.noCustomProperties')}</p>
          ) : (
            <PropertyList rows={properties} />
          )}
        </Panel>

        <Panel title={t('files.detail.versions')} wide>
          <FileVersions file={file} />
        </Panel>

        <FileReferences fileId={file.id} vaultIds={vaultIds} />
      </div>
    </div>
  )
}

type Translate = ReturnType<typeof useT>

function byUser(t: Translate, date: string | null, user: UserRef | null): string {
  const when = formatDateTime(date)
  const who = userName(user)
  if (when && who) return t('files.detail.byUser', { date: when, name: who })
  return when || who || ''
}

function CheckoutInfo({ file }: { file: FileDetailRow }) {
  const t = useT()
  if (!file.checked_out_by) return <span className="text-plm-fg-muted">{t('files.detail.notCheckedOut')}</span>
  const name = userName(file.checked_out_user) ?? ''
  return (
    <span className="block">
      <span className="inline-flex items-center gap-1 text-plm-fg">
        <Lock size={12} className="text-plm-locked" />
        {t('files.detail.checkedOutBy', { name, date: formatDateTime(file.checked_out_at) })}
      </span>
      {file.checked_out_by_machine_name && (
        <span className="block text-xs text-plm-fg-muted">
          {t('files.detail.checkedOutOn', { machine: file.checked_out_by_machine_name })}
        </span>
      )}
      {file.lock_message && (
        <span className="block text-xs text-plm-fg-muted">
          {t('files.detail.lockMessage')}: {file.lock_message}
        </span>
      )}
    </span>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-plm-fg-muted">{label}</dt>
      <dd className="min-w-0 text-plm-fg">{children}</dd>
    </>
  )
}

function PropertyList({ rows }: { rows: Array<{ key: string; label: string; value: string }> }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map((row) => (
        <Field key={row.key} label={row.label}>
          <span className="whitespace-pre-wrap break-words">{row.value}</span>
        </Field>
      ))}
    </dl>
  )
}
