import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { logSearch } from '@/lib/userActionLogger'
import type { SearchFilter, ParsedQuery } from '../types'
import { parseQuery, toPaneSearch, fromPaneSearch } from '../utils'

/**
 * Hook for managing the main search state
 */
export function useSearchState() {
  // One selector per field so the search box re-renders only when a field it uses changes, rather
  // than on every store change (the selectorless usePDMStore() subscribes to the whole store).
  const searchQuery = usePDMStore((s) => s.searchQuery)
  const searchType = usePDMStore((s) => s.searchType)
  const setSearchQuery = usePDMStore((s) => s.setSearchQuery)
  const setSearchType = usePDMStore((s) => s.setSearchType)
  const addRecentSearch = usePDMStore((s) => s.addRecentSearch)
  const searchScope = usePDMStore((s) => s.searchScope)
  const setSearchScope = usePDMStore((s) => s.setSearchScope)

  const [isOpen, setIsOpen] = useState(false)
  const [localQuery, setLocalQuery] = useState(() => fromPaneSearch(searchQuery, searchType))
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [showFilters, setShowFilters] = useState(false)

  // The pane search this box last wrote. The box holds the raw text ("folder:bracket") and the
  // store the bare term, so the two never compare equal; this tells our own writes apart from
  // changes made elsewhere.
  const lastWrittenRef = useRef(searchQuery)

  // The store's search changes out from under the box when the user switches tabs (search is
  // scoped per tab) or opens a folder (navigation leaves search). Mirror those into the box.
  useEffect(() => {
    if (searchQuery === lastWrittenRef.current) return
    lastWrittenRef.current = searchQuery
    setLocalQuery(fromPaneSearch(searchQuery, searchType))
    setActiveFilter('all')
    setHighlightedIndex(-1)
    // searchType changes together with searchQuery; reacting to the query alone is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery])

  // Parse query for filter prefix
  const parsedQuery: ParsedQuery = useMemo(() => {
    return parseQuery(localQuery, activeFilter)
  }, [localQuery, activeFilter])

  // Set the box's text and the pane search it stands for, together. `filter` is passed when the
  // caller is changing the filter in the same step, since activeFilter has not updated yet.
  const setQuery = useCallback(
    (value: string, filter: SearchFilter = activeFilter) => {
      setLocalQuery(value)
      const pane = toPaneSearch(parseQuery(value, filter))
      lastWrittenRef.current = pane.query
      setSearchType(pane.type)
      setSearchQuery(pane.query)
    },
    [activeFilter, setSearchQuery, setSearchType],
  )

  // Execute global search
  const executeSearch = useCallback(() => {
    if (localQuery.trim()) {
      addRecentSearch?.(localQuery.trim())
      logSearch(localQuery, parsedQuery.filter)
      setQuery(localQuery)
    }
    setIsOpen(false)
  }, [localQuery, parsedQuery.filter, addRecentSearch, setQuery])

  // Clear the search
  const clearSearch = useCallback(() => {
    setQuery('')
    setHighlightedIndex(-1)
  }, [setQuery])

  // Handle input change
  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value)
      setHighlightedIndex(-1)
      if (!isOpen) setIsOpen(true)
    },
    [isOpen, setQuery],
  )

  return {
    // State
    localQuery,
    setQuery,
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
