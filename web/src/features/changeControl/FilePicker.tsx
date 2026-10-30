// Find files in the vaults this user can see and pick some to tag. The desktop tags the files
// selected in its local file browser; the browser has no local selection, so it searches instead.
import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '@web/i18n'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { searchFiles, type FileSummary } from './api'
import { errorMessage } from './hooks'
import { sanitizeSearchTerm } from './model'
import { Button, inputClass } from './ui'

export function FilePicker({
  excludeIds,
  busy,
  onAdd,
  onCancel,
  children,
}: {
  /** Files already tagged; shown as such and not selectable. */
  excludeIds: ReadonlySet<string>
  busy: boolean
  onAdd: (files: FileSummary[]) => void
  onCancel: () => void
  /** Extra options shown above the add button. */
  children?: ReactNode
}) {
  const t = useT()
  const auth = useReadyAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FileSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Map<string, FileSummary>>(new Map())
  const term = sanitizeSearchTerm(query)
  const orgId = auth.profile.org_id
  const userId = auth.profile.id
  const isAdmin = auth.isAdmin

  useEffect(() => {
    if (term.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    let active = true
    setSearching(true)
    const timer = setTimeout(() => {
      searchFiles({ userId, orgId, isAdmin }, term).then(
        (files) => {
          if (!active) return
          setResults(files)
          setError(null)
          setSearching(false)
        },
        (err: unknown) => {
          if (!active) return
          setError(errorMessage(err))
          setSearching(false)
        },
      )
    }, 250)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [orgId, userId, isAdmin, term])

  const toggle = (file: FileSummary) =>
    setSelected((previous) => {
      const next = new Map(previous)
      if (next.has(file.id)) next.delete(file.id)
      else next.set(file.id, file)
      return next
    })

  return (
    <div className="flex flex-col gap-3 rounded border border-plm-border-light p-3">
      <label htmlFor="cc-file-search" className="text-xs font-medium text-plm-fg-dim">
        {t('changeControl.files.searchLabel')}
      </label>
      <input
        id="cc-file-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('changeControl.files.searchPlaceholder')}
        className={inputClass}
        autoComplete="off"
      />
      {error && <p className="text-xs text-plm-error">{error}</p>}
      {term.length >= 2 && !searching && results.length === 0 && !error && (
        <p className="text-xs text-plm-fg-muted">{t('common.noResults')}</p>
      )}
      {searching && <p className="text-xs text-plm-fg-muted">{t('common.loading')}</p>}
      {results.length > 0 && (
        <ul className="max-h-72 divide-y divide-plm-border overflow-auto rounded border border-plm-border">
          {results.map((file) => {
            const already = excludeIds.has(file.id)
            return (
              <li key={file.id}>
                <label className={`flex items-start gap-2 px-2 py-1.5 text-sm ${already ? 'opacity-60' : 'cursor-pointer hover:bg-plm-bg-lighter'}`}>
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={already}
                    checked={already || selected.has(file.id)}
                    onChange={() => toggle(file)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-plm-fg">{file.file_name}</span>
                    <span className="block truncate text-xs text-plm-fg-muted">
                      {[file.part_number, file.revision && t('changeControl.files.revision', { revision: file.revision }), file.file_path]
                        .filter(Boolean)
                        .join(' · ')}
                      {already && ` · ${t('changeControl.files.alreadyTagged')}`}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {children}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || selected.size === 0} onClick={() => onAdd([...selected.values()])}>
          {t('changeControl.files.addSelected', { count: selected.size })}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
