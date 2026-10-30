import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
  title?: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  'aria-label'?: string
}

/** A small set of mutually exclusive choices shown side by side (a radio group). */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex flex-shrink-0 items-center rounded-lg border border-ui-divider bg-ui-field p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-md border text-ui-fg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/50 disabled:cursor-not-allowed disabled:opacity-40 ${
              size === 'sm' ? 'h-6 px-2.5 text-[13px]' : 'h-7 px-3.5 text-[14px]'
            } ${
              selected
                ? 'border-ui-selected-border bg-ui-selected'
                : 'border-transparent hover:bg-ui-hover'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
