import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info'

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-plm-fg-muted/15 text-plm-fg-dim',
  accent: 'bg-plm-accent/15 text-plm-accent',
  success: 'bg-plm-success/15 text-plm-success',
  warning: 'bg-plm-warning/15 text-plm-warning',
  error: 'bg-plm-error/15 text-plm-error',
  info: 'bg-plm-info/15 text-plm-info',
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
      className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium leading-none ${TONE[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  )
}
