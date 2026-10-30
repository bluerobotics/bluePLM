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
 * A titled part of a settings page. A page has no title block of its own: it opens with its first
 * section's heading, as Claude's settings do. A section usually holds one SettingsGroup.
 */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className = '',
}: SettingsSectionProps) {
  return (
    <section className={className}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-4 pb-1">
          <div className="min-w-0">
            {title && (
              <h3 className="text-[16px] font-semibold leading-6 text-ui-fg">{title}</h3>
            )}
            {description && (
              <p className="mt-1 text-[14px] leading-[1.4] text-ui-fg-secondary">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {!title && !actions && description && (
        <p className="pb-1 text-[14px] leading-[1.4] text-ui-fg-secondary">{description}</p>
      )}
      {children}
    </section>
  )
}

/** The body of a settings page: its sections, 40px apart. */
export function SettingsPage({ children }: { children: ReactNode }) {
  return <div className="space-y-10">{children}</div>
}
