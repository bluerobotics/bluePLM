import { memo } from 'react'
import { Search } from 'lucide-react'

export interface SearchIndicatorProps {
  searchQuery: string
  searchType: 'all' | 'files' | 'folders'
  matchCount: number
}

/**
 * Search mode indicator showing current search query and results count
 */
export const SearchIndicator = memo(function SearchIndicator({
  searchQuery,
  searchType,
  matchCount
}: SearchIndicatorProps) {
  const typeLabel = searchType === 'files' ? 'Files' : searchType === 'folders' ? 'Folders' : 'Results'
  
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0 text-sm text-plm-fg-dim">
      <Search size={14} className="text-plm-accent" />
      <span>
        {typeLabel} for "<span className="text-plm-fg font-medium">{searchQuery}</span>"
      </span>
      <span className="text-plm-fg-muted">({matchCount} matches)</span>
    </div>
  )
})
