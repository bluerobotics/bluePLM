import { memo } from 'react'

export interface LoadingStateProps {
  message?: string
}

/**
 * Loading state component shown while files are being loaded
 */
export const LoadingState = memo(function LoadingState({
  message = 'Loading vault...'
}: LoadingStateProps) {
  return (
    <div className="absolute inset-0 z-30 bg-plm-bg/80 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-plm-accent/30 border-t-plm-accent rounded-full animate-spin" />
        <span className="text-sm text-plm-fg-muted">{message}</span>
      </div>
    </div>
  )
})
