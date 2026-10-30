import { memo } from 'react'
import { Search, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { usePDMStore } from '@/stores/pdmStore'

export interface SearchIndicatorProps {
  searchQuery: string
  searchType: 'all' | 'files' | 'folders'
  matchCount: number
}

/**
 * Search mode indicator showing current search query and results count, with a button that
 * leaves search and shows the current folder again. Clearing the store's query also empties the
 * search box, which mirrors it.
 */
export const SearchIndicator = memo(function SearchIndicator({
  searchQuery,
  searchType,
  matchCount,
}: SearchIndicatorProps) {
  const { t } = useTranslation()
  const setSearchQuery = usePDMStore((s) => s.setSearchQuery)
  const typeLabel =
    searchType === 'files' ? 'Files' : searchType === 'folders' ? 'Folders' : 'Results'

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0 text-sm text-plm-fg-dim">
      <Search size={14} className="text-plm-accent" />
      <span>
        {typeLabel} for "<span className="text-plm-fg font-medium">{searchQuery}</span>"
      </span>
      <span className="text-plm-fg-muted">({matchCount} matches)</span>
      <button
        type="button"
        onClick={() => setSearchQuery('')}
        title={t('fileBrowser.clearSearch')}
        aria-label={t('fileBrowser.clearSearch')}
        className="p-0.5 rounded text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
})
