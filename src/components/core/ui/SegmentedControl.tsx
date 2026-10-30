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
      className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-lg border border-plm-border bg-plm-bg-light p-0.5"
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
            className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-plm-accent/60 disabled:cursor-not-allowed disabled:opacity-50 ${
              size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-3 text-[13px]'
            } ${
              selected
                ? 'bg-plm-bg text-plm-fg shadow-sm ring-1 ring-plm-border'
                : 'text-plm-fg-muted hover:text-plm-fg'
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
