import type { ReactNode } from 'react'

interface SettingRowProps {
  /** The setting's name. Keep it equal to the settings search catalog's label for this setting. */
  label: ReactNode
  description?: ReactNode
  /** The control: a Switch, Select, Button, SegmentedControl and the like. */
  children?: ReactNode
  /** The id of the control, so clicking the label focuses it. */
  htmlFor?: string
  /** Shown after the label: a Badge such as "Admin" or "Beta". */
  badge?: ReactNode
  /** Put the control under the text at full width (lists, text areas, wide editors). */
  stacked?: boolean
  /** Dim the text when the setting does not apply right now. The control disables itself. */
  disabled?: boolean
  className?: string
}

/**
 * One setting: its name and a sentence about it on the left, its control on the right. Rows go
 * inside a SettingsGroup, which draws the dividers between them.
 */
export function SettingRow({
  label,
  description,
  children,
  htmlFor,
  badge,
  stacked = false,
  disabled = false,
  className = '',
}: SettingRowProps) {
  const LabelTag = htmlFor ? 'label' : 'div'
  return (
    <div
      data-setting-row=""
      className={`flex gap-x-8 gap-y-3 px-4 py-3.5 ${
        stacked ? 'flex-col' : 'items-center justify-between'
      } ${disabled ? 'opacity-60' : ''} ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <LabelTag htmlFor={htmlFor} className="text-[13px] font-medium text-plm-fg">
            {label}
          </LabelTag>
          {badge}
        </div>
        {description && (
          <div className="mt-0.5 text-[12px] leading-relaxed text-plm-fg-muted">{description}</div>
        )}
      </div>
      {children && (
        <div className={stacked ? 'w-full min-w-0' : 'flex flex-shrink-0 items-center gap-2'}>
          {children}
        </div>
      )}
    </div>
  )
}
