// The folder / search listing: a sortable table from tablet width up, a card list on phones.
import { ArrowDown, ArrowUp, FileText, Folder, Lock } from 'lucide-react'
import { useT } from '@web/i18n'
import { href, Link } from '@web/lib/router'
import { DownloadButton, StateBadge } from './components'
import { formatDate } from './format'
import { formatBytes, isSortKey, nextSort, SORT_KEYS, userName, type FileListRow, type SortKey, type SortState } from './listing'
import { joinPath, parentFolder } from './paths'

interface FileTableProps {
  vaultId: string
  orgId: string
  /** Folder the subfolder names belong to. */
  folder: string
  folders: string[]
  files: FileListRow[]
  sort: SortState
  onSort: (sort: SortState) => void
  /** Search results show the folder each file is in. */
  showFolder?: boolean
}

const COLUMN_CLASS: Record<SortKey, string> = {
  name: 'min-w-[14rem]',
  partNumber: 'whitespace-nowrap',
  description: 'min-w-[12rem]',
  revision: 'whitespace-nowrap',
  version: 'whitespace-nowrap text-right',
  state: 'whitespace-nowrap',
  checkedOutBy: 'whitespace-nowrap',
  modified: 'whitespace-nowrap',
  size: 'whitespace-nowrap text-right',
}

function folderHref(vaultId: string, path: string): string {
  return href(['files', vaultId], { path: path || undefined })
}

export function FileTable({ vaultId, orgId, folder, folders, files, sort, onSort, showFolder }: FileTableProps) {
  const t = useT()

  const header = (key: SortKey) => {
    const active = sort.key === key
    const Icon = sort.direction === 'asc' ? ArrowUp : ArrowDown
    return (
      <th
        key={key}
        scope="col"
        className={`px-2 py-1.5 font-medium ${COLUMN_CLASS[key]}`}
        aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => onSort(nextSort(sort, key))}
          className="inline-flex items-center gap-1 text-plm-fg-muted hover:text-plm-fg"
        >
          {t(`files.columns.${key}`)}
          {active && <Icon size={12} />}
        </button>
      </th>
    )
  }

  return (
    <>
      {/* Tablet and desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-plm-border text-xs">
            <tr>
              {header('name')}
              {showFolder && (
                <th scope="col" className="px-2 py-1.5 font-medium text-plm-fg-muted">
                  {t('files.columns.folder')}
                </th>
              )}
              {SORT_KEYS.filter((key) => key !== 'name').map(header)}
              <th scope="col" className="px-2 py-1.5">
                <span className="sr-only">{t('files.columns.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {folders.map((name) => (
              <tr key={`folder:${name}`} className="border-b border-plm-border hover:bg-plm-bg-lighter">
                <td className="px-2 py-1.5" colSpan={SORT_KEYS.length + (showFolder ? 2 : 1)}>
                  <Link
                    to={folderHref(vaultId, joinPath(folder, name))}
                    className="inline-flex items-center gap-2 text-plm-fg hover:underline"
                  >
                    <Folder size={15} className="shrink-0 text-plm-warning" />
                    {name}
                  </Link>
                </td>
              </tr>
            ))}
            {files.map((file) => {
              const owner = userName(file.checked_out_user)
              return (
                <tr key={file.id} className="border-b border-plm-border align-top hover:bg-plm-bg-lighter">
                  <td className="px-2 py-1.5">
                    <Link
                      to={href(['file', file.id])}
                      className="inline-flex items-center gap-2 break-all text-plm-fg hover:underline"
                    >
                      <FileText size={15} className="shrink-0 text-plm-fg-muted" />
                      {file.file_name}
                    </Link>
                  </td>
                  {showFolder && (
                    <td className="px-2 py-1.5 text-plm-fg-muted">
                      <Link to={folderHref(vaultId, parentFolder(file.file_path))} className="hover:underline">
                        {parentFolder(file.file_path) || '/'}
                      </Link>
                    </td>
                  )}
                  <td className="whitespace-nowrap px-2 py-1.5 text-plm-fg">{file.part_number}</td>
                  <td className="px-2 py-1.5 text-plm-fg-dim">{file.description}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-plm-fg">{file.revision}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-plm-fg-dim">{file.version}</td>
                  <td className="px-2 py-1.5">
                    <StateBadge row={file} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-plm-fg-dim">
                    {file.checked_out_by && (
                      <span className="inline-flex items-center gap-1">
                        <Lock size={12} className="text-plm-locked" />
                        {owner}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-plm-fg-dim">{formatDate(file.updated_at)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-plm-fg-dim">
                    {formatBytes(file.file_size)}
                  </td>
                  <td className="px-2 py-1">
                    <DownloadButton
                      compact
                      orgId={orgId}
                      hash={file.content_hash}
                      fileName={file.file_name}
                      label={t('files.download.currentNamed', { name: file.file_name })}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Phone */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 border-b border-plm-border px-4 py-2 text-sm">
          <label htmlFor="files-sort" className="text-plm-fg-muted">
            {t('files.sort.label')}
          </label>
          <select
            id="files-sort"
            value={sort.key}
            onChange={(event) => {
              if (isSortKey(event.target.value)) onSort({ key: event.target.value, direction: sort.direction })
            }}
            className="min-w-0 flex-1 rounded border border-plm-border-light bg-plm-input px-2 py-1 text-plm-fg"
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`files.columns.${key}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onSort({ key: sort.key, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
            aria-label={t('files.sort.toggleDirection')}
            title={t(sort.direction === 'asc' ? 'files.sort.ascending' : 'files.sort.descending')}
            className="rounded border border-plm-border-light p-1.5 text-plm-fg"
          >
            {sort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          </button>
        </div>
        <ul>
          {folders.map((name) => (
            <li key={`folder:${name}`} className="border-b border-plm-border">
              <Link
                to={folderHref(vaultId, joinPath(folder, name))}
                className="flex items-center gap-2 px-4 py-3 text-sm text-plm-fg"
              >
                <Folder size={16} className="shrink-0 text-plm-warning" />
                <span className="min-w-0 break-all">{name}</span>
              </Link>
            </li>
          ))}
          {files.map((file) => {
            const owner = userName(file.checked_out_user)
            return (
              <li key={file.id} className="border-b border-plm-border">
                <Link to={href(['file', file.id])} className="block px-4 py-3 text-sm">
                  <span className="flex items-center gap-2 text-plm-fg">
                    <FileText size={16} className="shrink-0 text-plm-fg-muted" />
                    <span className="min-w-0 break-all font-medium">{file.file_name}</span>
                  </span>
                  {showFolder && (
                    <span className="mt-0.5 block break-all text-xs text-plm-fg-muted">
                      {parentFolder(file.file_path) || '/'}
                    </span>
                  )}
                  {(file.part_number || file.description) && (
                    <span className="mt-1 block text-plm-fg-dim">
                      {[file.part_number, file.description].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-plm-fg-muted">
                    <StateBadge row={file} />
                    {file.revision && (
                      <span>
                        {t('files.columns.revision')} {file.revision}
                      </span>
                    )}
                    <span>
                      {t('files.columns.version')} {file.version}
                    </span>
                    {file.checked_out_by && (
                      <span className="inline-flex items-center gap-1">
                        <Lock size={12} className="text-plm-locked" />
                        {owner}
                      </span>
                    )}
                    <span>{formatBytes(file.file_size)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
