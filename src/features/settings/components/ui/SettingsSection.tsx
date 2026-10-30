import type { ReactNode } from 'react'

interface SettingsSectionProps {
  /** Keep it equal to the settings search catalog's label when the catalog lists the section. */
  title?: ReactNode
  description?: ReactNode
  /** Buttons shown on the right of the heading ("Add", "Refresh"). */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * A titled part of a settings page. A page is a stack of sections (`SettingsPage`); a section
 * usually holds one SettingsGroup.
 */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className = '',
}: SettingsSectionProps) {
  return (
    <section className={`space-y-3 ${className}`}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-semibold text-plm-fg">{title}</h3>}
            {description && (
              <p className="mt-0.5 text-[12px] leading-relaxed text-plm-fg-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** The body of a settings page: its sections, evenly spaced. */
export function SettingsPage({ children }: { children: ReactNode }) {
  return <div className="space-y-8">{children}</div>
}
