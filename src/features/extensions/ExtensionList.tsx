/**
 * ExtensionList - Display a list of extensions with filtering
 *
 * Supports both installed extensions and store extensions.
 * Provides filtering, sorting, and action callbacks.
 */
import { useState, useMemo } from 'react'
import { Search, Grid, List, RefreshCw } from 'lucide-react'

import { Button, SegmentedControl, Select, TextInput } from '@/components/core/ui'
import type { InstalledExtension, StoreExtensionListing } from '@/stores/types'

import { ExtensionCard } from './ExtensionCard'

interface ExtensionListProps {
  // Data sources
  installedExtensions?: InstalledExtension[]
  storeExtensions?: StoreExtensionListing[]

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
  onRefresh?: () => void

  className?: string
}

type ViewMode = 'grid' | 'list'
type SortOption = 'name' | 'recent' | 'popular'
type FilterOption = 'all' | 'verified' | 'installed'

export function ExtensionList({
  installedExtensions = [],
  storeExtensions = [],
  loading = false,
  emptyMessage = 'No extensions found',
  showSearch = true,
  showFilters = true,
  showViewToggle = true,
  onViewDetails,
  onInstall,
  onUninstall,
  onRefresh,
  className = '',
}: ExtensionListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [filterBy, setFilterBy] = useState<FilterOption>('all')

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
      result = result.filter(
        (ext) =>
          ext.name.toLowerCase().includes(query) ||
          ext.description?.toLowerCase().includes(query) ||
          ext.publisher.name.toLowerCase().includes(query) ||
          ext.tags.some((tag) => tag.toLowerCase().includes(query)),
      )
    }

    // Apply filter option
    switch (filterBy) {
      case 'verified':
        result = result.filter((ext) => ext.verified)
        break
      case 'installed':
        result = result.filter((ext) => installedMap.has(ext.extensionId))
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
  }, [storeExtensions, searchQuery, filterBy, sortBy, installedMap])

  // Filter installed extensions
  const filteredInstalledExtensions = useMemo(() => {
    if (!searchQuery) return installedExtensions

    const query = searchQuery.toLowerCase()
    return installedExtensions.filter(
      (ext) =>
        ext.manifest.name.toLowerCase().includes(query) ||
        ext.manifest.description?.toLowerCase().includes(query) ||
        ext.manifest.publisher.toLowerCase().includes(query),
    )
  }, [installedExtensions, searchQuery])

  // Determine which list to show
  const showingStoreExtensions = storeExtensions.length > 0
  const extensions = showingStoreExtensions ? filteredStoreExtensions : filteredInstalledExtensions

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Toolbar */}
      {(showSearch || showFilters || showViewToggle) && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {/* Search */}
          {showSearch && (
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted"
              />
              <TextInput
                type="text"
                placeholder="Search extensions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
                aria-label="Search extensions"
              />
            </div>
          )}

          {/* Filters */}
          {showFilters && (
            <>
              <Select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as FilterOption)}
                aria-label="Filter"
              >
                <option value="all">All</option>
                <option value="verified">Verified</option>
                <option value="installed">Installed</option>
              </Select>

              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                aria-label="Sort"
              >
                <option value="name">Name</option>
                <option value="recent">Recently Updated</option>
                <option value="popular">Popular</option>
              </Select>
            </>
          )}

          {/* View toggle */}
          {showViewToggle && (
            <SegmentedControl<ViewMode>
              value={viewMode}
              onChange={setViewMode}
              aria-label="View"
              options={[
                { value: 'grid', label: <Grid size={14} />, title: 'Grid view' },
                { value: 'list', label: <List size={14} />, title: 'List view' },
              ]}
            />
          )}

          {/* Refresh button */}
          {onRefresh && (
            <Button
              variant="ghost"
              onClick={onRefresh}
              disabled={loading}
              title="Refresh"
              aria-label="Refresh"
              icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            />
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && extensions.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[13px] text-plm-fg-muted">
            <RefreshCw size={16} className="animate-spin" />
            <span>Loading extensions...</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && extensions.length === 0 && (
        <div className="rounded-lg border border-plm-border bg-plm-bg-light/60 px-4 py-3 text-[13px] text-plm-fg-muted">
          <span>{emptyMessage}</span>
          {searchQuery && (
            <Button size="sm" variant="ghost" onClick={() => setSearchQuery('')} className="ml-2">
              Clear search
            </Button>
          )}
        </div>
      )}

      {/* Extension list */}
      {extensions.length > 0 && (
        <div
          className={`flex-1 overflow-y-auto ${
            viewMode === 'grid'
              ? 'grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 auto-rows-min'
              : 'flex flex-col gap-2'
          }`}
        >
          {showingStoreExtensions
            ? filteredStoreExtensions.map((storeExt) => {
                const installed = installedMap.get(storeExt.extensionId)

                return (
                  <ExtensionCard
                    key={storeExt.id}
                    extension={installed}
                    storeExtension={storeExt}
                    compact={viewMode === 'list'}
                    onViewDetails={() => onViewDetails?.(storeExt.extensionId)}
                    onInstall={onInstall ? () => onInstall(storeExt.extensionId) : undefined}
                    onUninstall={onUninstall ? () => onUninstall(storeExt.extensionId) : undefined}
                  />
                )
              })
            : filteredInstalledExtensions.map((ext) => {
                return (
                  <ExtensionCard
                    key={ext.manifest.id}
                    extension={ext}
                    compact={viewMode === 'list'}
                    onViewDetails={() => onViewDetails?.(ext.manifest.id)}
                    onUninstall={onUninstall ? () => onUninstall(ext.manifest.id) : undefined}
                  />
                )
              })}
        </div>
      )}
    </div>
  )
}
