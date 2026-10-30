import type { ReactNode } from 'react'

interface SettingsGroupProps {
  children: ReactNode
  /** Kept for callers; a destructive group reads the same, its buttons carry the danger. */
  tone?: 'default' | 'danger'
  className?: string
}

/** Rows of a section with a hairline between each: no box, no fill. */
export function SettingsGroup({ children, className = '' }: SettingsGroupProps) {
  return <div className={`divide-y divide-ui-divider ${className}`}>{children}</div>
}
