import { memo } from 'react'
import { List, LayoutGrid } from 'lucide-react'

export type ViewMode = 'list' | 'icons'

export interface ViewToggleProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

/**
 * Toggle between list and icon/grid view modes
 */
export const ViewToggle = memo(function ViewToggle({
  viewMode,
  onViewModeChange
}: ViewToggleProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onViewModeChange('list')}
        className={`btn btn-ghost btn-sm p-1 ${viewMode === 'list' ? 'bg-plm-accent/20 text-plm-accent' : ''}`}
        title="List view"
      >
        <List size={14} />
      </button>
      <button
        onClick={() => onViewModeChange('icons')}
        className={`btn btn-ghost btn-sm p-1 ${viewMode === 'icons' ? 'bg-plm-accent/20 text-plm-accent' : ''}`}
        title="Icon view"
      >
        <LayoutGrid size={14} />
      </button>
    </div>
  )
})
