import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'

export type CalloutTone = 'info' | 'success' | 'warning' | 'error'

const TONE: Record<CalloutTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: 'border-plm-info/30 bg-plm-info/[0.07]', icon: 'text-plm-info', Icon: Info },
  success: {
    box: 'border-plm-success/30 bg-plm-success/[0.07]',
    icon: 'text-plm-success',
    Icon: CircleCheck,
  },
  warning: {
    box: 'border-plm-warning/30 bg-plm-warning/[0.07]',
    icon: 'text-plm-warning',
    Icon: TriangleAlert,
  },
  error: {
    box: 'border-plm-error/30 bg-plm-error/[0.07]',
    icon: 'text-plm-error',
    Icon: CircleAlert,
  },
}

interface CalloutProps {
  tone?: CalloutTone
  title?: ReactNode
  children?: ReactNode
  /** A button or link shown on the right. */
  action?: ReactNode
  className?: string
}

/** An inline note, warning or error inside a page; not a toast. */
export function Callout({ tone = 'info', title, children, action, className = '' }: CalloutProps) {
  const { box, icon, Icon } = TONE[tone]
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 ${box} ${className}`}>
      <Icon size={16} className={`mt-px flex-shrink-0 ${icon}`} aria-hidden />
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-plm-fg-dim">
        {title && <div className="font-medium text-plm-fg">{title}</div>}
        {children}
      </div>
      {action && <div className="flex-shrink-0 self-center">{action}</div>}
    </div>
  )
}
