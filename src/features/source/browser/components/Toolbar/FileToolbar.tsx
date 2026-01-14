import { memo } from 'react'
import { CrumbBar } from '@/components/layout'
import { ViewToggle, type ViewMode } from './ViewToggle'
import { SizeSlider } from './SizeSlider'
import { AddMenu } from './AddMenu'
import { PathActions } from './PathActions'
import { SearchIndicator } from './SearchIndicator'
import { CardViewFieldsPopover } from './CardViewFieldsPopover'

export interface FileToolbarProps {
  // Navigation
  currentPath: string
  vaultPath: string | null
  vaultName: string
  onNavigate: (path: string) => void
  onNavigateRoot: () => void
  onNavigateUp: () => void
  onNavigateBack: () => void
  onNavigateForward: () => void
  canGoBack: boolean
  canGoForward: boolean
  onRefresh: () => void
  
  // Search
  isSearching: boolean
  searchQuery: string
  searchType: 'all' | 'files' | 'folders'
  matchCount: number
  
  // View
  viewMode: ViewMode
  iconSize: number
  listRowSize: number
  onViewModeChange: (mode: ViewMode) => void
  onIconSizeChange: (size: number) => void
  onListRowSizeChange: (size: number) => void
  
  // Actions
  onAddFiles: () => void
  onAddFolder: () => void
  
  // Misc
  platform: string
  addToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
}

/**
 * Main toolbar component for the file browser
 */
export const FileToolbar = memo(function FileToolbar({
  currentPath,
  vaultPath,
  vaultName,
  onNavigate,
  onNavigateRoot,
  onNavigateUp,
  onNavigateBack,
  onNavigateForward,
  canGoBack,
  canGoForward,
  onRefresh,
  isSearching,
  searchQuery,
  searchType,
  matchCount,
  viewMode,
  iconSize,
  listRowSize,
  onViewModeChange,
  onIconSizeChange,
  onListRowSizeChange,
  onAddFiles,
  onAddFolder,
  platform,
  addToast
}: FileToolbarProps) {
  return (
    <div className="crumb-bar-container h-12 bg-plm-bg-lighter border-b border-plm-border flex items-center px-3 flex-shrink-0 gap-2">
      {/* Breadcrumb / Search indicator */}
      {isSearching ? (
        <SearchIndicator
          searchQuery={searchQuery}
          searchType={searchType}
          matchCount={matchCount}
        />
      ) : (
        <CrumbBar
          currentPath={currentPath}
          vaultPath={vaultPath || ''}
          vaultName={vaultName}
          onNavigate={onNavigate}
          onNavigateRoot={onNavigateRoot}
          onNavigateUp={onNavigateUp}
          onBack={onNavigateBack}
          onForward={onNavigateForward}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onRefresh={onRefresh}
        />
      )}
      
      {/* Path actions */}
      <PathActions
        currentPath={currentPath}
        vaultPath={vaultPath}
        platform={platform}
        addToast={addToast}
      />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <AddMenu
          onAddFiles={onAddFiles}
          onAddFolder={onAddFolder}
        />
        
        {/* Separator */}
        <div className="w-px h-5 bg-plm-border mx-1" />
        
        {/* View mode toggle */}
        <ViewToggle
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
        
        {/* Card view fields config - only show in icon view */}
        {viewMode === 'icons' && (
          <CardViewFieldsPopover />
        )}
        
        {/* Size slider */}
        <SizeSlider
          viewMode={viewMode}
          iconSize={iconSize}
          listRowSize={listRowSize}
          onIconSizeChange={onIconSizeChange}
          onListRowSizeChange={onListRowSizeChange}
        />
      </div>
    </div>
  )
})
