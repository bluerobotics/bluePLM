/**
 * Expandable section for context menu
 * Shows a "More Actions" button that expands to reveal additional options
 */
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ReactNode } from 'react'

interface ExpandableSectionProps {
  expanded: boolean
  onToggle: () => void
  children: ReactNode
  /** Number of hidden items to show in the label */
  hiddenCount?: number
}

export function ExpandableSection({ 
  expanded, 
  onToggle, 
  children,
  hiddenCount,
}: ExpandableSectionProps) {
  return (
    <>
      {/* Expand/Collapse toggle */}
      <div className="context-menu-separator" />
      <div 
        className="context-menu-expand-toggle"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        {expanded ? (
          <>
            <ChevronUp size={14} />
            <span>Less Actions</span>
          </>
        ) : (
          <>
            <ChevronDown size={14} />
            <span>More Actions{hiddenCount ? ` (${hiddenCount})` : ''}</span>
          </>
        )}
      </div>
      
      {/* Expandable content */}
      {expanded && (
        <div className="context-menu-expanded-section">
          {children}
        </div>
      )}
    </>
  )
}
