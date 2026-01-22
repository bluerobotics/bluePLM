import { useRef, useEffect, useCallback } from 'react'
import { useShallow } from 'zustand/shallow'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import { logSearch } from '@/lib/userActionLogger'
import type { CommandSearchProps, GoogleDriveFileResult, SearchFilter } from './types'
import { FILTER_OPTIONS } from './constants'
import { getCurrentFilter, getAvailableFilters } from './utils'
import { useSearchState, useGoogleDriveSearch, useLocalFileSearch, useKeyboardNavigation } from './hooks'
import { FilterButton } from './FilterButton'
import { FiltersDropdown } from './FiltersDropdown'
import { SearchInput } from './SearchInput'
import { SearchResults } from './SearchResults'

/**
 * Command search component with filters, local files, and Google Drive integration
 */
export function CommandSearch({ maxWidth = 'max-w-lg' }: CommandSearchProps) {
  const {
    toggleFileSelection,
    setGdriveOpenDocument,
    setActiveView,
    recentSearches,
    clearRecentSearches,
    setSearchQuery,
    setCurrentFolder,
    setSelectedFiles,
    expandedFolders,
    toggleFolder,
  } = usePDMStore(
    useShallow(s => ({
      toggleFileSelection: s.toggleFileSelection,
      setGdriveOpenDocument: s.setGdriveOpenDocument,
      setActiveView: s.setActiveView,
      recentSearches: s.recentSearches,
      clearRecentSearches: s.clearRecentSearches,
      setSearchQuery: s.setSearchQuery,
      setCurrentFolder: s.setCurrentFolder,
      setSelectedFiles: s.setSelectedFiles,
      expandedFolders: s.expandedFolders,
      toggleFolder: s.toggleFolder,
    }))
  )

  // Core search state
  const {
    localQuery,
    setLocalQuery,
    activeFilter,
    setActiveFilter,
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
    parsedQuery.filter
  )
  const { searchResults } = useLocalFileSearch(parsedQuery.searchTerm, parsedQuery.filter)

  // Refs
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Total navigable results
  const totalResults = searchResults.length + driveResults.length + (recentSearches?.length || 0)

  // Handle result selection
  const handleSelectResult = useCallback((file: LocalFile) => {
    toggleFileSelection(file.path, false)
    setIsOpen(false)
    if (localQuery.trim()) {
      addRecentSearch?.(localQuery.trim())
    }
    logSearch(localQuery, parsedQuery.filter)
  }, [toggleFileSelection, setIsOpen, localQuery, addRecentSearch, parsedQuery.filter])

  const handleSelectDriveResult = useCallback((file: GoogleDriveFileResult) => {
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
        webViewLink: file.webViewLink
      })
    } else if (file.webViewLink) {
      window.open(file.webViewLink, '_blank')
    }
  }, [setIsOpen, localQuery, addRecentSearch, setActiveView, setGdriveOpenDocument])

  // Handle "Open file location" - navigate to parent folder and select the file
  const handleOpenFileLocation = useCallback((file: LocalFile) => {
    setIsOpen(false)
    
    // Get the parent folder path from relativePath
    const parts = file.relativePath.split('/')
    parts.pop() // Remove the file name
    const parentPath = parts.join('/')
    
    // Expand all ancestor folders so the file is visible in the tree
    if (parentPath) {
      for (let i = 1; i <= parts.length; i++) {
        const ancestorPath = parts.slice(0, i).join('/')
        if (!expandedFolders.has(ancestorPath)) {
          toggleFolder(ancestorPath)
        }
      }
    }
    
    // Navigate to the parent folder
    setCurrentFolder(parentPath)
    
    // Select/highlight the file
    setSelectedFiles([file.path])
  }, [setIsOpen, expandedFolders, toggleFolder, setCurrentFolder, setSelectedFiles])

  // Keyboard navigation handlers
  const handleEnter = useCallback((index: number) => {
    if (index >= 0) {
      if (index < searchResults.length) {
        handleSelectResult(searchResults[index])
      } else if (index < searchResults.length + driveResults.length) {
        handleSelectDriveResult(driveResults[index - searchResults.length])
      } else {
        const recentIndex = index - searchResults.length - driveResults.length
        if (recentSearches?.[recentIndex]) {
          setLocalQuery(recentSearches[recentIndex])
          setSearchQuery(recentSearches[recentIndex])
        }
      }
    } else if (localQuery.trim()) {
      executeSearch()
    }
  }, [searchResults, driveResults, recentSearches, handleSelectResult, handleSelectDriveResult, setLocalQuery, setSearchQuery, localQuery, executeSearch])

  const handleEscape = useCallback(() => {
    if (isOpen) {
      setIsOpen(false)
    } else {
      setLocalQuery('')
      setSearchQuery('')
    }
    inputRef.current?.blur()
  }, [isOpen, setIsOpen, setLocalQuery, setSearchQuery])

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
  const handleFilterSelect = useCallback((filter: SearchFilter) => {
    setActiveFilter(filter)
    const option = FILTER_OPTIONS.find(f => f.id === filter)
    if (option?.prefix) {
      const currentTerm = parsedQuery.searchTerm
      setLocalQuery(option.prefix + currentTerm)
    } else {
      setLocalQuery(parsedQuery.searchTerm)
    }
    setShowFilters(false)
    inputRef.current?.focus()
  }, [setActiveFilter, parsedQuery.searchTerm, setLocalQuery, setShowFilters])

  // Recent search click handler
  const handleRecentSearchClick = useCallback((search: string) => {
    setLocalQuery(search)
    setSearchQuery(search)
    addRecentSearch?.(search)
    logSearch(search, 'recent')
  }, [setLocalQuery, setSearchQuery, addRecentSearch])

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
          placeholder={currentFilter.description}
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
        />
      )}

      {/* Search Results */}
      <SearchResults
        isOpen={isOpen}
        showFilters={showFilters}
        filters={availableFilters}
        currentFilter={parsedQuery.filter}
        localQuery={localQuery}
        searchResults={searchResults}
        driveResults={driveResults}
        isDriveSearching={isDriveSearching}
        isGdriveConnected={isGdriveConnected}
        recentSearches={recentSearches}
        highlightedIndex={highlightedIndex}
        onFilterSelect={handleFilterSelect}
        onShowMoreFilters={() => setShowFilters(true)}
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
