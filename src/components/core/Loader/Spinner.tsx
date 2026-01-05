import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: number
  className?: string
}

export function Spinner({ size = 20, className = '' }: SpinnerProps) {
  return (
    <Loader2 
      size={size} 
      className={`animate-spin text-plm-fg-muted ${className}`} 
    />
  )
}
