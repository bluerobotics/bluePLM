/**
 * AlignmentGuides - Renders visual guides for snapping states to alignment
 */
import { memo } from 'react'
import type { AlignmentGuides as AlignmentGuidesType } from '../types'

interface AlignmentGuidesProps {
  alignmentGuides: AlignmentGuidesType
}

export const AlignmentGuides = memo(function AlignmentGuides({ alignmentGuides }: AlignmentGuidesProps) {
  return (
    <>
      {alignmentGuides.vertical !== null && (
        <line
          x1={alignmentGuides.vertical}
          y1={-10000}
          x2={alignmentGuides.vertical}
          y2={10000}
          stroke="#60a5fa"
          strokeWidth={1}
          strokeDasharray="4,4"
          className="pointer-events-none"
        />
      )}
      {alignmentGuides.horizontal !== null && (
        <line
          x1={-10000}
          y1={alignmentGuides.horizontal}
          x2={10000}
          y2={alignmentGuides.horizontal}
          stroke="#60a5fa"
          strokeWidth={1}
          strokeDasharray="4,4"
          className="pointer-events-none"
        />
      )}
    </>
  )
})
