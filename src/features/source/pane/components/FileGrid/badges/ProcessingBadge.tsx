import { Loader2 } from 'lucide-react'

export interface ProcessingBadgeProps {
  buttonSize: number
  buttonIconSize: number
}

/**
 * Badge showing processing spinner
 */
export function ProcessingBadge({ buttonSize, buttonIconSize }: ProcessingBadgeProps) {
  return (
    <div className="absolute top-1 left-1 flex items-center z-10">
      <div
        className="rounded-full bg-plm-accent/30 flex items-center justify-center"
        style={{ width: buttonSize, height: buttonSize }}
      >
        <Loader2 size={buttonIconSize} className="text-plm-accent animate-spin" />
      </div>
    </div>
  )
}
