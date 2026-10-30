import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info'

// Quiet by default: coloured text on a faint tint, never a solid block.
const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-ui-field text-ui-fg-secondary',
  accent: 'bg-ui-accent/15 text-ui-accent',
  success: 'bg-ui-success/15 text-ui-success',
  warning: 'bg-ui-warning/15 text-ui-warning',
  error: 'bg-ui-danger/15 text-ui-danger',
  info: 'bg-ui-accent/15 text-ui-accent',
}

interface BadgeProps {
  tone?: BadgeTone
  icon?: ReactNode
  children: ReactNode
  className?: string
  title?: string
}

/** A small status or count label. */
export function Badge({ tone = 'neutral', icon, children, className = '', title }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium leading-4 ${TONE[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  )
}
