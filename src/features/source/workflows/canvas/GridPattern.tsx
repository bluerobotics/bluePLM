/**
 * GridPattern - Renders the grid lines for snap-to-grid functionality
 */
import { memo } from 'react'
import type { SnapSettings } from '../types'

interface GridPatternProps {
  snapSettings: SnapSettings
}

export const GridPattern = memo(function GridPattern({ snapSettings }: GridPatternProps) {
  if (!snapSettings.snapToGrid) return null
  
  return (
    <g className="pointer-events-none" opacity="0.15">
      {Array.from({ length: 100 }).map((_, i) => (
        <line
          key={`vgrid-${i}`}
          x1={i * snapSettings.gridSize - 2000}
          y1={-2000}
          x2={i * snapSettings.gridSize - 2000}
          y2={2000}
          stroke="currentColor"
          strokeWidth={0.5}
        />
      ))}
      {Array.from({ length: 100 }).map((_, i) => (
        <line
          key={`hgrid-${i}`}
          x1={-2000}
          y1={i * snapSettings.gridSize - 2000}
          x2={2000}
          y2={i * snapSettings.gridSize - 2000}
          stroke="currentColor"
          strokeWidth={0.5}
        />
      ))}
    </g>
  )
})
