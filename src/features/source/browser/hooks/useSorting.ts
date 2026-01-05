import { useMemo, useCallback } from 'react'
import type { LocalFile } from '@/stores/pdmStore'
import type { SortColumn, SortDirection } from '../types'
import { sortFiles, sortByRelevance } from '../utils/sorting'
import { 
  filterValidFiles, 
  getFilesInFolder, 
  filterBySearch, 
  getSearchScore 
} from '../utils/filtering'

export interface UseSortingOptions {
  files: LocalFile[]
  currentPath: string
  sortColumn: SortColumn
  sortDirection: SortDirection
  searchQuery?: string
  searchType?: 'all' | 'files' | 'folders'
  hideSolidworksTempFiles?: boolean
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
  toggleSort
}: UseSortingOptions): UseSortingReturn {
  
  const isSearching = !!(searchQuery && searchQuery.trim().length > 0)

  // Memoize sorted files to avoid expensive recomputation on every render
  const sortedFiles = useMemo(() => {
    // First filter out invalid files and optionally hide SolidWorks temp files
    const validFiles = filterValidFiles(files, { hideSolidworksTempFiles })
    
    let resultFiles: LocalFile[]
    
    if (isSearching) {
      // Search mode: filter by search query and sort by relevance
      const searchResults = filterBySearch(validFiles, searchQuery!, searchType)
      resultFiles = sortByRelevance(searchResults, (file) => getSearchScore(file, searchQuery!))
    } else {
      // Normal mode: filter to current folder and sort by column
      const folderFiles = getFilesInFolder(validFiles, currentPath)
      resultFiles = sortFiles(folderFiles, sortColumn, sortDirection, true)
    }
    
    return resultFiles
  }, [files, currentPath, isSearching, searchQuery, searchType, sortColumn, sortDirection, hideSolidworksTempFiles])

  // Toggle sort column (passed through from store)
  const toggleSortColumn = useCallback((columnId: string) => {
    toggleSort(columnId)
  }, [toggleSort])

  return {
    sortedFiles,
    isSearching,
    toggleSortColumn
  }
}
