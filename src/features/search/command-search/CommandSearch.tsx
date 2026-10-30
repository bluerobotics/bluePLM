import { useRef, useEffect, useCallback } from 'react'
import { useShallow } from 'zustand/shallow'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import { logSearch } from '@/lib/userActionLogger'
import type { CommandSearchProps, GoogleDriveFileResult, SearchFilter } from './types'
import { FILTER_OPTIONS } from './constants'
import { getCurrentFilter, getAvailableFilters } from './utils'
import {
  useSearchState,
  useGoogleDriveSearch,
  useLocalFileSearch,
  useKeyboardNavigation,
  useOpenResult,
} from './hooks'
import { FilterButton } from './FilterButton'
import { FiltersDropdown } from './FiltersDropdown'
import { SearchInput } from './SearchInput'
import { SearchResults } from './SearchResults'

/**
 * Command search component with filters, local files, and Google Drive integration
 */
export function CommandSearch({ maxWidth = 'max-w-lg' }: CommandSearchProps) {
  const {
    setGdriveOpenDocument,
    setActiveView,
    recentSearches,
    clearRecentSearches,
    currentFolder,
  } = usePDMStore(
    useShallow((s) => ({
      setGdriveOpenDocument: s.setGdriveOpenDocument,
      setActiveView: s.setActiveView,
      recentSearches: s.recentSearches,
      clearRecentSearches: s.clearRecentSearches,
      currentFolder: s.currentFolder,
    })),
  )
  const openResult = useOpenResult()

  // Core search state
  const {
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
    executeSearch,
    clearSearch,
    handleInputChange,
    addRecentSearch,
  } = useSearchState()

  // Search hooks
  const { driveResults, isDriveSearching, isGdriveConnected } = useGoogleDriveSearch(
    parsedQuery.searchTerm,
    parsedQuery.filter,
  )
  const { searchResults } = useLocalFileSearch(
    parsedQuery.searchTerm,
    parsedQuery.filter,
    currentFolder,
    searchScope,
  )

  // Refs
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Total navigable results
  const totalResults = searchResults.length + driveResults.length + (recentSearches?.length || 0)

  // Empty the box (and the filter) after jumping to a result. Opening a folder clears the pane's
  // search on its own, but a dropdown-only filter ("by:", "state:") never set one, and its text
  // would be left behind in the box.
  const leaveSearch = useCallback(() => {
    setQuery('', 'all')
    setActiveFilter('all')
    inputRef.current?.blur()
  }, [setQuery, setActiveFilter])

  // Picking a result goes to it: a folder opens, a file opens its folder with the file selected.
  // Either way search ends, so the pane shows the folder rather than the results.
  const handleSelectResult = useCallback(
    (file: LocalFile) => {
      setIsOpen(false)
      if (localQuery.trim()) {
        addRecentSearch?.(localQuery.trim())
      }
      logSearch(localQuery, parsedQuery.filter)
      leaveSearch()
      openResult(file, 'open')
    },
    [setIsOpen, localQuery, addRecentSearch, parsedQuery.filter, leaveSearch, openResult],
  )

  const handleSelectDriveResult = useCallback(
    (file: GoogleDriveFileResult) => {
      setIsOpen(false)
      if (localQuery.trim()) {
        addRecentSearch?.(localQuery.trim())
      }
      logSearch(localQuery, 'drive')

      // Switch to Google Drive view and open the document
      setActiveView('google-drive')

      // For Google Workspace files, open inline; for others, open in new tab
      const isGoogleWorkspace = file.mimeType.startsWith('application/vnd.google-apps.')
      if (isGoogleWorkspace && file.mimeType !== 'application/vnd.google-apps.folder') {
        setGdriveOpenDocument({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink,
        })
      } else if (file.webViewLink) {
        window.open(file.webViewLink, '_blank')
      }
    },
    [setIsOpen, localQuery, addRecentSearch, setActiveView, setGdriveOpenDocument],
  )

  // "Open file location": a folder result opens its parent with the folder selected
  const handleOpenFileLocation = useCallback(
    (file: LocalFile) => {
      setIsOpen(false)
      leaveSearch()
      openResult(file, 'location')
    },
    [setIsOpen, leaveSearch, openResult],
  )

  // Keyboard navigation handlers
  const handleEnter = useCallback(
    (index: number) => {
      if (index >= 0) {
        if (index < searchResults.length) {
          handleSelectResult(searchResults[index])
        } else if (index < searchResults.length + driveResults.length) {
          handleSelectDriveResult(driveResults[index - searchResults.length])
        } else {
          const recentIndex = index - searchResults.length - driveResults.length
          if (recentSearches?.[recentIndex]) {
            setQuery(recentSearches[recentIndex])
          }
        }
      } else if (localQuery.trim()) {
        executeSearch()
      }
    },
    [
      searchResults,
      driveResults,
      recentSearches,
      handleSelectResult,
      handleSelectDriveResult,
      setQuery,
      localQuery,
      executeSearch,
    ],
  )

  const handleEscape = useCallback(() => {
    if (isOpen) {
      setIsOpen(false)
    } else {
      setQuery('')
    }
    inputRef.current?.blur()
  }, [isOpen, setIsOpen, setQuery])

  const { handleKeyDown } = useKeyboardNavigation({
    totalResults,
    highlightedIndex,
    setHighlightedIndex,
    isOpen,
    showFilters,
    activeFilter,
    setActiveFilter,
    isGdriveConnected,
    onEnter: handleEnter,
    onEscape: handleEscape,
  })

  // Filter selection handler
  const handleFilterSelect = useCallback(
    (filter: SearchFilter) => {
      setActiveFilter(filter)
      const option = FILTER_OPTIONS.find((f) => f.id === filter)
      setQuery((option?.prefix ?? '') + parsedQuery.searchTerm, filter)
      setShowFilters(false)
      inputRef.current?.focus()
    },
    [setActiveFilter, parsedQuery.searchTerm, setQuery, setShowFilters],
  )

  // Recent search click handler
  const handleRecentSearchClick = useCallback(
    (search: string) => {
      setQuery(search)
      addRecentSearch?.(search)
      logSearch(search, 'recent')
    },
    [setQuery, addRecentSearch],
  )

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowFilters(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [setIsOpen, setShowFilters])

  // Listen for global focus-search event (Ctrl+K)
  useEffect(() => {
    const handleFocusSearch = () => {
      inputRef.current?.focus()
      setIsOpen(true)
    }
    window.addEventListener('focus-search', handleFocusSearch)
    return () => window.removeEventListener('focus-search', handleFocusSearch)
  }, [setIsOpen])

  // Handle clear with focus
  const handleClear = useCallback(() => {
    clearSearch()
    inputRef.current?.focus()
  }, [clearSearch])

  const currentFilter = getCurrentFilter(parsedQuery.filter)
  const availableFilters = getAvailableFilters(isGdriveConnected)

  const folderName = currentFolder
    ? currentFolder.split(/[/\\]/).pop() || 'Root'
    : 'Root'
  const placeholder =
    searchScope === 'current-folder' ? `Search in ${folderName}...` : 'Search everything...'

  const handleScopeChange = useCallback(
    (scope: typeof searchScope) => {
      setSearchScope(scope)
      inputRef.current?.focus()
    },
    [setSearchScope],
  )

  return (
    <div ref={containerRef} className={`relative w-full ${maxWidth}`}>
      {/* Search Input Row */}
      <div className="relative flex items-center gap-1">
        <FilterButton
          currentFilter={currentFilter}
          isActive={showFilters || parsedQuery.filter !== 'all'}
          onClick={() => setShowFilters(!showFilters)}
        />
        <SearchInput
          value={localQuery}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          inputRef={inputRef}
          onClear={handleClear}
        />
      </div>

      {/* Filters Dropdown */}
      {showFilters && (
        <FiltersDropdown
          filters={availableFilters}
          currentFilter={parsedQuery.filter}
          onSelect={handleFilterSelect}
          searchScope={searchScope}
          onScopeChange={handleScopeChange}
        />
      )}

      {/* Search Results */}
      <SearchResults
        isOpen={isOpen}
        showFilters={showFilters}
        currentFilter={parsedQuery.filter}
        localQuery={localQuery}
        searchResults={searchResults}
        driveResults={driveResults}
        isDriveSearching={isDriveSearching}
        isGdriveConnected={isGdriveConnected}
        recentSearches={recentSearches}
        highlightedIndex={highlightedIndex}
        onSelectLocalResult={handleSelectResult}
        onSelectDriveResult={handleSelectDriveResult}
        onOpenFileLocation={handleOpenFileLocation}
        onRecentSearchClick={handleRecentSearchClick}
        onClearRecentSearches={() => clearRecentSearches?.()}
        onHighlightChange={setHighlightedIndex}
        dropdownRef={dropdownRef}
      />
    </div>
  )
}
