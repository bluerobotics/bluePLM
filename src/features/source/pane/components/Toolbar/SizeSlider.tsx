import { memo } from 'react'
import { List, Grid, LayoutGrid } from 'lucide-react'
import type { ViewMode } from './ViewToggle'

export interface SizeSliderProps {
  viewMode: ViewMode
  iconSize: number
  listRowSize: number
  onIconSizeChange: (size: number) => void
  onListRowSizeChange: (size: number) => void
}

/**
 * Size slider for adjusting icon size or list row height
 */
export const SizeSlider = memo(function SizeSlider({
  viewMode,
  iconSize,
  listRowSize,
  onIconSizeChange,
  onListRowSizeChange
}: SizeSliderProps) {
  if (viewMode === 'icons') {
    return (
      <div className="flex items-center gap-2 ml-2">
        <Grid size={12} className="text-plm-fg-muted" />
        <input
          type="range"
          min="48"
          max="256"
          value={iconSize}
          onChange={(e) => onIconSizeChange(Number(e.target.value))}
          className="w-20 h-1 accent-plm-accent cursor-pointer"
          title={`Icon size: ${iconSize}px`}
        />
        <LayoutGrid size={16} className="text-plm-fg-muted" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 ml-2">
      <List size={12} className="text-plm-fg-muted" />
      <input
        type="range"
        min="16"
        max="64"
        value={listRowSize}
        onChange={(e) => onListRowSizeChange(Number(e.target.value))}
        className="w-20 h-1 accent-plm-accent cursor-pointer"
        title={`Row height: ${listRowSize}px`}
      />
      <List size={16} className="text-plm-fg-muted" />
    </div>
  )
})
