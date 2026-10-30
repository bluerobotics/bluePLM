import type { ReactNode } from 'react'

interface SettingsGroupProps {
  children: ReactNode
  /** `danger` outlines the group in the error colour, for destructive actions. */
  tone?: 'default' | 'danger'
  className?: string
}

/** A card of SettingRows (or any blocks), with a hairline between each. */
export function SettingsGroup({ children, tone = 'default', className = '' }: SettingsGroupProps) {
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-plm-bg-light/60 divide-y ${
        tone === 'danger'
          ? 'border-plm-error/40 divide-plm-error/20'
          : 'border-plm-border divide-plm-border'
      } ${className}`}
    >
      {children}
    </div>
  )
}
