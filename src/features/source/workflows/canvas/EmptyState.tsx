/**
 * EmptyState - Displayed when no states exist in the workflow
 */
import { memo } from 'react'
import { GitBranch } from 'lucide-react'

interface EmptyStateProps {
  hasStates: boolean
  hasWorkflow: boolean
}

export const EmptyState = memo(function EmptyState({ hasStates, hasWorkflow }: EmptyStateProps) {
  if (hasStates || !hasWorkflow) return null
  
  return (
    <div className="absolute inset-0 flex items-center justify-center text-plm-fg-muted pointer-events-none">
      <div className="text-center">
        <GitBranch size={48} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">
          No states defined. Click "Add State" to add your first state.
        </p>
      </div>
    </div>
  )
})
