// One folder of one vault, or search results inside the vault when `?q=` is set.
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronRight, Search, X } from 'lucide-react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { href, Link, navigate } from '@web/lib/router'
import { EmptyState, ErrorState, Loading, PageHeader } from '@web/shell/ui'
import { loadFolderFiles, loadSubfolders, MAX_FOLDER_FILES, searchVault, type VaultSummary } from './api'
import { useVaults } from './components'
import { FileTable } from './FileTable'
import { sortFiles, sortFolders, type SortState } from './listing'
import { breadcrumbs, normalizeFolderPath } from './paths'
import { MIN_SEARCH_LENGTH, normalizeSearch, SEARCH_LIMIT } from './search'
import { useLoad } from './useLoad'

const PAGE_ROWS = 500

export function FolderView({ vaultId, path, query }: { vaultId: string; path: string; query: string }) {
  const t = useT()
  const vaults = useVaults()

  if (vaults.status === 'loading') return <Loading />
  if (vaults.status === 'error') return <ErrorState message={vaults.error} onRetry={vaults.reload} />
  const vault = vaults.data.find((v) => v.id === vaultId)
  if (!vault) return <EmptyState>{t('files.folder.vaultNotFound')}</EmptyState>
  return <VaultFolder vault={vault} path={normalizeFolderPath(path)} query={normalizeSearch(query)} />
}

function VaultFolder({ vault, path, query }: { vault: VaultSummary; path: string; query: string }) {
  const t = useT()
  const crumbs = breadcrumbs(path)
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2].path : ''

  return (
    <div>
      <PageHeader title={vault.name}>
        <nav aria-label={t('files.folder.breadcrumbs')} className="mt-1 flex flex-wrap items-center gap-1 text-sm">
          <Link to={href(['files'])} className="text-plm-fg-muted hover:text-plm-fg hover:underline">
            {t('files.vaults.title')}
          </Link>
          <ChevronRight size={12} className="text-plm-fg-muted" />
          <Link
            to={href(['files', vault.id])}
            className="text-plm-fg-muted hover:text-plm-fg hover:underline"
            aria-current={crumbs.length === 0 && !query ? 'page' : undefined}
          >
            {vault.name}
          </Link>
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex min-w-0 items-center gap-1">
              <ChevronRight size={12} className="shrink-0 text-plm-fg-muted" />
              <Link
                to={href(['files', vault.id], { path: crumb.path })}
                className="break-all text-plm-fg-muted hover:text-plm-fg hover:underline"
                aria-current={index === crumbs.length - 1 && !query ? 'page' : undefined}
              >
                {crumb.name}
              </Link>
            </span>
          ))}
          {crumbs.length > 0 && !query && (
            <Link
              to={href(['files', vault.id], { path: parent || undefined })}
              className="ml-2 text-xs text-plm-accent hover:underline"
            >
              {t('files.folder.up')}
            </Link>
          )}
        </nav>
        <SearchForm vaultId={vault.id} path={path} query={query} />
      </PageHeader>
      {query ? <SearchResults vault={vault} query={query} /> : <FolderContents vault={vault} path={path} />}
    </div>
  )
}

function SearchForm({ vaultId, path, query }: { vaultId: string; path: string; query: string }) {
  const t = useT()
  const [text, setText] = useState(query)
  useEffect(() => setText(query), [query])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const q = normalizeSearch(text)
    navigate(href(['files', vaultId], { path: path || undefined, q: q || undefined }))
  }

  return (
    <form role="search" onSubmit={submit} className="mt-2 flex max-w-xl items-center gap-2">
      <label htmlFor="files-search" className="sr-only">
        {t('files.search.label')}
      </label>
      <div className="relative min-w-0 flex-1">
        <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-plm-fg-muted" />
        <input
          id="files-search"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('files.search.placeholder')}
          className="w-full rounded border border-plm-border-light bg-plm-input py-1.5 pl-7 pr-2 text-sm text-plm-fg placeholder:text-plm-fg-muted"
        />
      </div>
      <button
        type="submit"
        className="rounded border border-plm-border-light px-3 py-1.5 text-sm text-plm-fg hover:bg-plm-bg-lighter"
      >
        {t('files.search.submit')}
      </button>
      {query && (
        <Link
          to={href(['files', vaultId], { path: path || undefined })}
          aria-label={t('files.search.clear')}
          title={t('files.search.clear')}
          className="rounded p-1.5 text-plm-fg-muted hover:bg-plm-bg-lighter hover:text-plm-fg"
        >
          <X size={14} />
        </Link>
      )}
    </form>
  )
}

function useSort() {
  return useState<SortState>({ key: 'name', direction: 'asc' })
}

function FolderContents({ vault, path }: { vault: VaultSummary; path: string }) {
  const t = useT()
  const orgId = useReadyAuth().profile.org_id
  const [sort, setSort] = useSort()
  const [visible, setVisible] = useState(PAGE_ROWS)
  const key = `${vault.id}\u0000${path}`
  const files = useLoad(key, () => loadFolderFiles(vault.id, path))
  const folders = useLoad(key, () => loadSubfolders(vault.id, path))

  useEffect(() => setVisible(PAGE_ROWS), [key])

  const sortedFiles = useMemo(() => (files.data ? sortFiles(files.data.files, sort) : []), [files.data, sort])
  const sortedFolders = useMemo(() => (folders.data ? sortFolders(folders.data.names, sort) : []), [folders.data, sort])

  if (files.status === 'loading') return <Loading />
  if (files.status === 'error') return <ErrorState message={files.error} onRetry={files.reload} />

  const empty = sortedFiles.length === 0 && folders.status === 'ready' && sortedFolders.length === 0
  return (
    <div>
      {folders.status === 'loading' && <Loading label={t('files.folder.loadingFolders')} />}
      {folders.status === 'error' && (
        <ErrorState message={t('files.folder.foldersFailed', { message: folders.error })} onRetry={folders.reload} />
      )}
      {folders.data?.truncated && <Notice>{t('files.folder.truncatedFolders')}</Notice>}
      {files.data.truncated && <Notice>{t('files.folder.truncatedFiles', { count: MAX_FOLDER_FILES })}</Notice>}
      {empty ? (
        <EmptyState>{t('files.folder.empty')}</EmptyState>
      ) : (
        <>
          <p className="px-4 pt-2 text-xs text-plm-fg-muted">
            {t('files.folder.counts', { folders: sortedFolders.length, files: sortedFiles.length })}
          </p>
          <FileTable
            vaultId={vault.id}
            orgId={orgId}
            folder={path}
            folders={sortedFolders}
            files={sortedFiles.slice(0, visible)}
            sort={sort}
            onSort={setSort}
          />
          {sortedFiles.length > visible && (
            <div className="p-4">
              <button
                type="button"
                onClick={() => setVisible((n) => n + PAGE_ROWS)}
                className="rounded border border-plm-border-light px-3 py-1 text-sm text-plm-fg hover:bg-plm-bg-lighter"
              >
                {t('files.folder.showMore', { count: Math.min(PAGE_ROWS, sortedFiles.length - visible) })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SearchResults({ vault, query }: { vault: VaultSummary; query: string }) {
  const t = useT()
  const orgId = useReadyAuth().profile.org_id
  const [sort, setSort] = useSort()
  const tooShort = query.length < MIN_SEARCH_LENGTH
  const results = useLoad(`${vault.id}\u0000${query}`, () => searchVault(vault.id, query))
  const sorted = useMemo(() => (results.data ? sortFiles(results.data.files, sort) : []), [results.data, sort])

  if (tooShort) return <EmptyState>{t('files.search.tooShort', { count: MIN_SEARCH_LENGTH })}</EmptyState>
  if (results.status === 'loading') return <Loading />
  if (results.status === 'error') return <ErrorState message={results.error} onRetry={results.reload} />
  if (sorted.length === 0) return <EmptyState>{t('files.search.none', { query })}</EmptyState>

  return (
    <div>
      <h2 className="px-4 pt-3 text-sm font-medium text-plm-fg">{t('files.search.results', { query })}</h2>
      {results.data.limited && <Notice>{t('files.search.limited', { count: SEARCH_LIMIT })}</Notice>}
      <FileTable
        vaultId={vault.id}
        orgId={orgId}
        folder=""
        folders={[]}
        files={sorted}
        sort={sort}
        onSort={setSort}
        showFolder
      />
    </div>
  )
}

function Notice({ children }: { children: string }) {
  return <p className="mx-4 mt-2 rounded border border-plm-warning px-3 py-2 text-xs text-plm-warning">{children}</p>
}
