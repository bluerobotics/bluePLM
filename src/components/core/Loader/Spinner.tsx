import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: number
  className?: string
  /** Set to true to pause animation without removing from DOM (preserves GPU layer) */
  paused?: boolean
}

/**
 * GPU-accelerated spinner component
 * Uses CSS containment and 3D transforms to ensure smooth animation
 * even during heavy main-thread JavaScript work
 */
export function Spinner({ size = 20, className = '', paused = false }: SpinnerProps) {
  return (
    <Loader2 
      size={size} 
      className={`animate-spin text-plm-fg-muted ${paused ? 'spinner-paused' : ''} ${className}`}
      style={{
        // Inline styles as backup for GPU acceleration
        // CSS classes provide the main optimization
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}
    />
  )
}
