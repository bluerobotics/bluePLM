import { useMemo, useCallback, useRef } from 'react'
import type { HiddenFolderPaths } from '@/lib/hiddenFolders'
import type { LocalFile } from '@/stores/pdmStore'
import type { SearchScope } from '@/types/pdm'
import type { SortColumn, SortDirection } from '../types'
import { sortFiles, sortByRelevance } from '../utils/sorting'
import {
  filterValidFiles,
  getFilesInFolder,
  filterBySearch,
  getSearchScore,
} from '../utils/filtering'
import { logExplorer } from '@/lib/userActionLogger'

export interface UseSortingOptions {
  files: LocalFile[]
  currentPath: string
  sortColumn: SortColumn
  sortDirection: SortDirection
  searchQuery?: string
  searchType?: 'all' | 'files' | 'folders'
  /** 'current-folder' limits search matches to the current folder (recursive); 'all-folders' searches the whole vault */
  searchScope?: SearchScope
  hideSolidworksTempFiles?: boolean
  /** Admin-only folder paths to strip from the list (empty for admins) */
  hiddenFolderPaths?: HiddenFolderPaths
  toggleSort: (columnId: string) => void
  setSortColumn: (column: string) => void
  setSortDirection: (direction: SortDirection) => void
}

export interface UseSortingReturn {
  sortedFiles: LocalFile[]
  isSearching: boolean
  toggleSortColumn: (columnId: string) => void
}

/**
 * Hook to manage file sorting with search and folder filtering
 */
export function useSorting({
  files,
  currentPath,
  sortColumn,
  sortDirection,
  searchQuery,
  searchType = 'all',
  searchScope = 'current-folder',
  hideSolidworksTempFiles = false,
  hiddenFolderPaths,
  toggleSort,
  setSortColumn,
  setSortDirection,
}: UseSortingOptions): UseSortingReturn {
  const isSearching = !!(searchQuery && searchQuery.trim().length > 0)

  // While searching, results are relevance-ordered by default. Once the user clicks a column
  // header we switch to that column's sort (like the folder view) and stay there for the rest of
  // the search. Rather than a boolean reset during render (a render-phase side effect the memo
  // read without depending on), we record the query the user last sorted under and compare it to
  // the current query inside the memo: a new search no longer matches, so it falls back to
  // relevance. Both transitions already change a memo dependency (searchQuery, or
  // sortColumn/sortDirection via the sort setters), so the memo recomputes either way.
  const sortedUnderQueryRef = useRef<string | undefined>(undefined)
  const userSortedThisSearch = sortedUnderQueryRef.current === searchQuery

  // Memoize sorted files to avoid expensive recomputation on every render
  const sortedFiles = useMemo(() => {
    const t0 = performance.now()
    logExplorer('useSorting RECALC START', {
      filesCount: files.length,
      currentPath,
      isSearching,
      sortColumn,
      sortDirection,
    })

    // First filter out invalid files and optionally hide SolidWorks temp files
    const validFiles = filterValidFiles(files, { hideSolidworksTempFiles, hiddenFolderPaths })
    const t1 = performance.now()

    let resultFiles: LocalFile[]

    if (isSearching) {
      // Search mode: filter by search query, then order by relevance unless the user has
      // picked a column to sort by, in which case sort the matches like the folder view.
      // When scope is 'current-folder', restrict the pool to the current folder (recursive)
      // before matching, so a scoped search does not leak across the whole vault.
      const searchPool =
        searchScope === 'current-folder' && currentPath
          ? validFiles.filter((file) => {
              const rel = file.relativePath.replace(/\\/g, '/')
              const base = currentPath.replace(/\\/g, '/')
              return rel === base || rel.startsWith(base + '/')
            })
          : validFiles
      const searchResults = filterBySearch(searchPool, searchQuery!, searchType)
      resultFiles = userSortedThisSearch
        ? sortFiles(searchResults, sortColumn, sortDirection, true)
        : sortByRelevance(searchResults, (file) => getSearchScore(file, searchQuery!))
    } else {
      // Normal mode: filter to current folder and sort by column
      const folderFiles = getFilesInFolder(validFiles, currentPath)
      const t2 = performance.now()
      resultFiles = sortFiles(folderFiles, sortColumn, sortDirection, true)
      const t3 = performance.now()
      logExplorer('useSorting RECALC END', {
        filterValidMs: Math.round(t1 - t0),
        getFilesInFolderMs: Math.round(t2 - t1),
        sortFilesMs: Math.round(t3 - t2),
        totalMs: Math.round(t3 - t0),
        validFilesCount: validFiles.length,
        folderFilesCount: folderFiles.length,
        resultCount: resultFiles.length,
      })
    }

    return resultFiles
  }, [
    files,
    currentPath,
    isSearching,
    searchQuery,
    searchType,
    searchScope,
    sortColumn,
    sortDirection,
    userSortedThisSearch,
    hideSolidworksTempFiles,
    hiddenFolderPaths,
  ])

  // Toggle sort column (passed through from store). When the user sorts during a search, record
  // the query it happened under so the results follow the chosen column instead of relevance.
  const toggleSortColumn = useCallback(
    (columnId: string) => {
      if (isSearching && sortedUnderQueryRef.current !== searchQuery) {
        // First sort of this search: the results are still in relevance order, so the store's
        // sortColumn/sortDirection still describe the previous folder sort. Toggling here would
        // flip a column the user is sorting for the first time straight to descending. Apply the
        // column's default (ascending) direction explicitly instead - the same direction
        // toggleSort gives a freshly chosen column.
        sortedUnderQueryRef.current = searchQuery
        setSortColumn(columnId)
        setSortDirection('asc')
        return
      }
      if (isSearching) sortedUnderQueryRef.current = searchQuery
      toggleSort(columnId)
    },
    [toggleSort, isSearching, searchQuery, setSortColumn, setSortDirection],
  )

  return {
    sortedFiles,
    isSearching,
    toggleSortColumn,
  }
}
