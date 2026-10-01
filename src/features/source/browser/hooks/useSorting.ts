import { useMemo, useCallback, useRef } from 'react'
import type { HiddenFolderPaths } from '@/lib/hiddenFolders'
import type { LocalFile } from '@/stores/pdmStore'
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
  hideSolidworksTempFiles?: boolean
  /** Admin-only folder paths to strip from the list (empty for admins) */
  hiddenFolderPaths?: HiddenFolderPaths
  toggleSort: (columnId: string) => void
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
  hideSolidworksTempFiles = false,
  hiddenFolderPaths,
  toggleSort,
}: UseSortingOptions): UseSortingReturn {
  const isSearching = !!(searchQuery && searchQuery.trim().length > 0)

  // While searching, results are relevance-ordered by default. Once the user clicks a column
  // header we switch to that column's sort (like the folder view) and stay there for the rest
  // of the search. The flag resets synchronously whenever the query changes so a fresh search
  // goes back to relevance. Both transitions coincide with a real dependency change below
  // (searchQuery, or sortColumn/sortDirection via toggleSort), so the memo always recomputes.
  const userSortedDuringSearchRef = useRef(false)
  const prevSearchQueryRef = useRef(searchQuery)
  if (prevSearchQueryRef.current !== searchQuery) {
    prevSearchQueryRef.current = searchQuery
    userSortedDuringSearchRef.current = false
  }

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
      const searchResults = filterBySearch(validFiles, searchQuery!, searchType)
      resultFiles = userSortedDuringSearchRef.current
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
    sortColumn,
    sortDirection,
    hideSolidworksTempFiles,
    hiddenFolderPaths,
  ])

  // Toggle sort column (passed through from store). When the user sorts during a search, flag it
  // so the search results follow the chosen column instead of relevance order.
  const toggleSortColumn = useCallback(
    (columnId: string) => {
      if (isSearching) userSortedDuringSearchRef.current = true
      toggleSort(columnId)
    },
    [toggleSort, isSearching],
  )

  return {
    sortedFiles,
    isSearching,
    toggleSortColumn,
  }
}
