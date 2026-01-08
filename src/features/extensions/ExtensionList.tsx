/**
 * ExtensionList - Display a list of extensions with filtering
 * 
 * Supports both installed extensions and store extensions.
 * Provides filtering, sorting, and action callbacks.
 */
import { useState, useMemo } from 'react'
import { Search, Filter, Grid, List, RefreshCw } from 'lucide-react'
import { ExtensionCard } from './ExtensionCard'
import type { InstalledExtension, StoreExtensionListing, ExtensionUpdateAvailable } from '@/stores/types'

interface ExtensionListProps {
  // Data sources
  installedExtensions?: InstalledExtension[]
  storeExtensions?: StoreExtensionListing[]
  updates?: ExtensionUpdateAvailable[]
  
  // UI state
  loading?: boolean
  emptyMessage?: string
  
  // Filters
  showSearch?: boolean
  showFilters?: boolean
  showViewToggle?: boolean
  
  // Callbacks
  onViewDetails?: (extensionId: string) => void
  onInstall?: (extensionId: string) => void
  onUninstall?: (extensionId: string) => void
  onUpdate?: (extensionId: string) => void
  onEnable?: (extensionId: string) => void
  onDisable?: (extensionId: string) => void
  onRefresh?: () => void
  
  className?: string
}

type ViewMode = 'grid' | 'list'
type SortOption = 'name' | 'recent' | 'popular'
type FilterOption = 'all' | 'verified' | 'installed' | 'updates'

export function ExtensionList({
  installedExtensions = [],
  storeExtensions = [],
  updates = [],
  loading = false,
  emptyMessage = 'No extensions found',
  showSearch = true,
  showFilters = true,
  showViewToggle = true,
  onViewDetails,
  onInstall,
  onUninstall,
  onUpdate,
  onEnable,
  onDisable,
  onRefresh,
  className = '',
}: ExtensionListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [filterBy, setFilterBy] = useState<FilterOption>('all')

  // Create update lookup map
  const updatesMap = useMemo(() => {
    const map = new Map<string, ExtensionUpdateAvailable>()
    for (const update of updates) {
      map.set(update.extensionId, update)
    }
    return map
  }, [updates])

  // Create installed lookup map
  const installedMap = useMemo(() => {
    const map = new Map<string, InstalledExtension>()
    for (const ext of installedExtensions) {
      map.set(ext.manifest.id, ext)
    }
    return map
  }, [installedExtensions])

  // Filter and sort store extensions
  const filteredStoreExtensions = useMemo(() => {
    let result = [...storeExtensions]
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(ext =>
        ext.name.toLowerCase().includes(query) ||
        ext.description?.toLowerCase().includes(query) ||
        ext.publisher.name.toLowerCase().includes(query) ||
        ext.tags.some(tag => tag.toLowerCase().includes(query))
      )
    }
    
    // Apply filter option
    switch (filterBy) {
      case 'verified':
        result = result.filter(ext => ext.verified)
        break
      case 'installed':
        result = result.filter(ext => installedMap.has(ext.extensionId))
        break
      case 'updates':
        result = result.filter(ext => updatesMap.has(ext.extensionId))
        break
    }
    
    // Apply sorting
    switch (sortBy) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'recent':
        result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        break
      case 'popular':
        result.sort((a, b) => b.downloadCount - a.downloadCount)
        break
    }
    
    return result
  }, [storeExtensions, searchQuery, filterBy, sortBy, installedMap, updatesMap])

  // Filter installed extensions
  const filteredInstalledExtensions = useMemo(() => {
    if (!searchQuery) return installedExtensions
    
    const query = searchQuery.toLowerCase()
    return installedExtensions.filter(ext =>
      ext.manifest.name.toLowerCase().includes(query) ||
      ext.manifest.description?.toLowerCase().includes(query) ||
      ext.manifest.publisher.toLowerCase().includes(query)
    )
  }, [installedExtensions, searchQuery])

  // Determine which list to show
  const showingStoreExtensions = storeExtensions.length > 0
  const extensions = showingStoreExtensions ? filteredStoreExtensions : filteredInstalledExtensions

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Toolbar */}
      {(showSearch || showFilters || showViewToggle) && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Search */}
          {showSearch && (
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="text"
                placeholder="Search extensions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg
                  text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
          
          {/* Filters */}
          {showFilters && (
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-500" />
              <select
                value={filterBy}
                onChange={e => setFilterBy(e.target.value as FilterOption)}
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm 
                  text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="verified">Verified</option>
                <option value="installed">Installed</option>
                {updates.length > 0 && (
                  <option value="updates">Updates ({updates.length})</option>
                )}
              </select>
              
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm 
                  text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="name">Name</option>
                <option value="recent">Recently Updated</option>
                <option value="popular">Popular</option>
              </select>
            </div>
          )}
          
          {/* View toggle */}
          {showViewToggle && (
            <div className="flex items-center border border-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
                title="Grid view"
              >
                <Grid size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
                title="List view"
              >
                <List size={16} />
              </button>
            </div>
          )}
          
          {/* Refresh button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 rounded-lg 
                transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      )}
      
      {/* Loading state */}
      {loading && extensions.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <RefreshCw size={32} className="animate-spin" />
            <span>Loading extensions...</span>
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {!loading && extensions.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <p>{emptyMessage}</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-blue-400 hover:text-blue-300 text-sm"
              >
                Clear search
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Extension list */}
      {extensions.length > 0 && (
        <div
          className={`flex-1 overflow-y-auto ${
            viewMode === 'grid'
              ? 'grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-min'
              : 'flex flex-col gap-2'
          }`}
        >
          {showingStoreExtensions
            ? filteredStoreExtensions.map(storeExt => {
                const installed = installedMap.get(storeExt.extensionId)
                const update = updatesMap.get(storeExt.extensionId)
                
                return (
                  <ExtensionCard
                    key={storeExt.id}
                    extension={installed}
                    storeExtension={storeExt}
                    update={update}
                    compact={viewMode === 'list'}
                    onViewDetails={() => onViewDetails?.(storeExt.extensionId)}
                    onInstall={() => onInstall?.(storeExt.extensionId)}
                    onUninstall={() => onUninstall?.(storeExt.extensionId)}
                    onUpdate={() => onUpdate?.(storeExt.extensionId)}
                    onEnable={() => onEnable?.(storeExt.extensionId)}
                    onDisable={() => onDisable?.(storeExt.extensionId)}
                  />
                )
              })
            : filteredInstalledExtensions.map(ext => {
                const update = updatesMap.get(ext.manifest.id)
                
                return (
                  <ExtensionCard
                    key={ext.manifest.id}
                    extension={ext}
                    update={update}
                    compact={viewMode === 'list'}
                    onViewDetails={() => onViewDetails?.(ext.manifest.id)}
                    onUninstall={() => onUninstall?.(ext.manifest.id)}
                    onUpdate={() => onUpdate?.(ext.manifest.id)}
                    onEnable={() => onEnable?.(ext.manifest.id)}
                    onDisable={() => onDisable?.(ext.manifest.id)}
                  />
                )
              })}
        </div>
      )}
    </div>
  )
}
