import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'

export type CalloutTone = 'info' | 'success' | 'warning' | 'error'

// A neutral panel; only the icon carries the tone.
const TONE: Record<CalloutTone, { icon: string; Icon: LucideIcon }> = {
  info: { icon: 'text-ui-fg-secondary', Icon: Info },
  success: { icon: 'text-ui-success', Icon: CircleCheck },
  warning: { icon: 'text-ui-warning', Icon: TriangleAlert },
  error: { icon: 'text-ui-danger', Icon: CircleAlert },
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
  const { icon, Icon } = TONE[tone]
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-ui-divider bg-ui-field/60 px-3.5 py-3 ${className}`}
    >
      <Icon size={16} className={`mt-0.5 flex-shrink-0 ${icon}`} aria-hidden />
      <div className="min-w-0 flex-1 text-[14px] leading-[1.45] text-ui-fg-secondary">
        {title && <div className="font-medium text-ui-fg">{title}</div>}
        {children}
      </div>
      {action && <div className="flex-shrink-0 self-center">{action}</div>}
    </div>
  )
}
