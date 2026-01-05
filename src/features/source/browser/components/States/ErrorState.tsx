import { memo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

/**
 * Error state component shown when there's an error loading files
 */
export const ErrorState = memo(function ErrorState({
  title = 'Failed to load files',
  message = 'There was an error loading the file list. Please try again.',
  onRetry
}: ErrorStateProps) {
  return (
    <div className="empty-state">
      <AlertTriangle className="empty-state-icon text-plm-error" />
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-description">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn btn-primary btn-sm mt-4"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  )
})
