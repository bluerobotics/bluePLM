import { useState, useMemo, useCallback, useEffect } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { logSearch } from '@/lib/userActionLogger'
import type { SearchFilter, ParsedQuery } from '../types'
import { parseQuery } from '../utils'

/**
 * Hook for managing the main search state
 */
export function useSearchState() {
  // One selector per field so the search box re-renders only when a field it uses changes, rather
  // than on every store change (the selectorless usePDMStore() subscribes to the whole store).
  const searchQuery = usePDMStore((s) => s.searchQuery)
  const setSearchQuery = usePDMStore((s) => s.setSearchQuery)
  const setSearchType = usePDMStore((s) => s.setSearchType)
  const addRecentSearch = usePDMStore((s) => s.addRecentSearch)
  const searchScope = usePDMStore((s) => s.searchScope)
  const setSearchScope = usePDMStore((s) => s.setSearchScope)

  const [isOpen, setIsOpen] = useState(false)
  const [localQuery, setLocalQuery] = useState(searchQuery || '')
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  // Search is scoped per tab, so the store's searchQuery changes out from under us when the user
  // switches tabs. Mirror those external changes into the input; typing keeps them in sync already
  // (handleInputChange writes both), so this is a no-op there and only reacts to tab switches.
  useEffect(() => {
    setLocalQuery(searchQuery || '')
  }, [searchQuery])
  const [showFilters, setShowFilters] = useState(false)

  // Parse query for filter prefix
  const parsedQuery: ParsedQuery = useMemo(() => {
    return parseQuery(localQuery, activeFilter)
  }, [localQuery, activeFilter])

  // Execute global search
  const executeSearch = useCallback(() => {
    if (localQuery.trim()) {
      addRecentSearch?.(localQuery.trim())
      logSearch(localQuery, parsedQuery.filter)
      // Sync to global search
      setSearchQuery(localQuery)
      // Convert filter to searchType
      if (parsedQuery.filter === 'files') {
        setSearchType('files')
      } else if (parsedQuery.filter === 'folders') {
        setSearchType('folders')
      } else {
        setSearchType('all')
      }
    }
    setIsOpen(false)
  }, [localQuery, parsedQuery.filter, addRecentSearch, setSearchQuery, setSearchType])

  // Clear the search
  const clearSearch = useCallback(() => {
    setLocalQuery('')
    setSearchQuery('')
    setHighlightedIndex(-1)
  }, [setSearchQuery])

  // Handle input change
  const handleInputChange = useCallback(
    (value: string) => {
      setLocalQuery(value)
      setSearchQuery(value)
      setHighlightedIndex(-1)
      if (!isOpen) setIsOpen(true)
    },
    [isOpen, setSearchQuery],
  )

  return {
    // State
    localQuery,
    setLocalQuery,
    activeFilter,
    setActiveFilter,
    searchScope,
    setSearchScope,
    isOpen,
    setIsOpen,
    showFilters,
    setShowFilters,
    highlightedIndex,
    setHighlightedIndex,
    parsedQuery,
    // Actions
    executeSearch,
    clearSearch,
    handleInputChange,
    // Store dependencies needed by other hooks
    searchQuery,
    addRecentSearch,
  }
}
