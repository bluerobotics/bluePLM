// Versions and references (contains, where-used, drawings) of one file.
import { useMemo } from 'react'
import { FileText } from 'lucide-react'
import { useT } from '@web/i18n'
import { href, Link } from '@web/lib/router'
import { ErrorState, Loading } from '@web/shell/ui'
import { loadReferences, loadVersions, type FileDetailRow } from './api'
import { DownloadButton, Panel } from './components'
import { groupReferences, splitWhereUsed, type ReferenceItem, type ReferenceRow } from './detail'
import { formatDateTime } from './format'
import { formatBytes, userName } from './listing'
import { useLoad } from './useLoad'

export function FileVersions({ file }: { file: FileDetailRow }) {
  const t = useT()
  const versions = useLoad(file.id, () => loadVersions(file.id))

  if (versions.status === 'loading') return <Loading />
  if (versions.status === 'error') {
    return (
      <ErrorState message={t('files.detail.versionsFailed', { message: versions.error })} onRetry={versions.reload} />
    )
  }
  if (versions.data.length === 0) return <p className="text-sm text-plm-fg-muted">{t('files.detail.noVersions')}</p>

  return (
    <ol className="divide-y divide-plm-border">
      {versions.data.map((version) => (
        <li key={version.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-plm-fg">
                {t('files.detail.versionNumber', { version: version.version })}
              </span>
              {version.revision && (
                <span className="text-plm-fg-dim">
                  {t('files.detail.revision')} {version.revision}
                </span>
              )}
              {version.state && <span className="text-plm-fg-dim">{version.state}</span>}
              <span className="text-plm-fg-muted">{formatDateTime(version.created_at)}</span>
              {userName(version.created_by_user) && (
                <span className="text-plm-fg-muted">{userName(version.created_by_user)}</span>
              )}
              <span className="text-plm-fg-muted">{formatBytes(version.file_size)}</span>
            </div>
            <p
              className={`mt-1 whitespace-pre-wrap break-words ${version.comment ? 'text-plm-fg' : 'italic text-plm-fg-muted'}`}
            >
              {version.comment?.trim() || t('files.detail.noComment')}
            </p>
          </div>
          <DownloadButton
            orgId={file.org_id}
            hash={version.content_hash}
            fileName={file.file_name}
            label={t('files.download.version', { version: version.version })}
          />
        </li>
      ))}
    </ol>
  )
}

/**
 * `vaultIds` are the vaults this user may open. RLS on `files` is org-wide, so a reference to a
 * file in another vault comes back from the query and must be dropped here, like the detail page
 * itself refuses such a file.
 */
export function FileReferences({ fileId, vaultIds }: { fileId: string; vaultIds: readonly string[] }) {
  const t = useT()
  const refs = useLoad(fileId, () => loadReferences(fileId))
  const vaultKey = vaultIds.join(',')
  const grouped = useMemo(() => {
    if (!refs.data) return null
    const allowed = new Set(vaultKey.split(','))
    const visible = (rows: ReferenceRow[]) => rows.filter((row) => !!row.other?.vault_id && allowed.has(row.other.vault_id))
    return {
      contains: groupReferences(visible(refs.data.contains)),
      ...splitWhereUsed(groupReferences(visible(refs.data.whereUsed))),
    }
  }, [refs.data, vaultKey])

  if (refs.status === 'loading') {
    return (
      <Panel title={t('files.detail.contains')} wide>
        <Loading />
      </Panel>
    )
  }
  if (refs.status === 'error' || !grouped) {
    return (
      <Panel title={t('files.detail.contains')} wide>
        <ErrorState message={t('files.detail.referencesFailed', { message: refs.error ?? '' })} onRetry={refs.reload} />
      </Panel>
    )
  }
  return (
    <>
      <Panel title={t('files.detail.contains')}>
        <ReferenceList items={grouped.contains} empty={t('files.detail.noContains')} />
      </Panel>
      <Panel title={t('files.detail.whereUsed')}>
        <ReferenceList items={grouped.parents} empty={t('files.detail.noWhereUsed')} />
      </Panel>
      <Panel title={t('files.detail.drawings')} wide>
        <ReferenceList items={grouped.drawings} empty={t('files.detail.noDrawings')} />
      </Panel>
    </>
  )
}

function ReferenceList({ items, empty }: { items: ReferenceItem[]; empty: string }) {
  const t = useT()
  if (items.length === 0) return <p className="text-sm text-plm-fg-muted">{empty}</p>
  return (
    <ul className="divide-y divide-plm-border">
      {items.map((item) => {
        const typeKey = `files.referenceType.${item.referenceType}`
        const typeLabel = t(typeKey) === typeKey ? item.referenceType : t(typeKey)
        return (
          <li key={item.file.id} className="py-2 text-sm">
            <Link
              to={href(['file', item.file.id])}
              className="inline-flex items-center gap-2 break-all text-plm-fg hover:underline"
            >
              <FileText size={14} className="shrink-0 text-plm-fg-muted" />
              {item.file.file_name}
            </Link>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-plm-fg-muted">
              {item.file.part_number && <span>{item.file.part_number}</span>}
              {item.file.revision && (
                <span>
                  {t('files.columns.revision')} {item.file.revision}
                </span>
              )}
              {item.file.state && <span>{item.file.state}</span>}
              <span>{typeLabel}</span>
              {item.quantity > 1 && <span>{t('files.detail.quantity', { count: item.quantity })}</span>}
              {item.configurations.length > 0 && (
                <span>{t('files.detail.configurations', { list: item.configurations.join(', ') })}</span>
              )}
            </div>
            {item.file.description && <p className="mt-0.5 text-xs text-plm-fg-dim">{item.file.description}</p>}
          </li>
        )
      })}
    </ul>
  )
}
