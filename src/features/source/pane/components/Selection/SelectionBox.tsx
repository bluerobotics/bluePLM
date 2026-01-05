import { memo } from 'react'
import type { SelectionBox as SelectionBoxType } from '../../types'
import { getSelectionBoxBounds } from '../../utils/selection'

export interface SelectionBoxOverlayProps {
  box: SelectionBoxType
}

/**
 * Visual selection box overlay for multi-select
 */
export const SelectionBoxOverlay = memo(function SelectionBoxOverlay({ box }: SelectionBoxOverlayProps) {
  const bounds = getSelectionBoxBounds(box)
  
  return (
    <div
      className="absolute border border-plm-accent bg-plm-accent/10 pointer-events-none z-10"
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
    />
  )
})
