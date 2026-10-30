interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** `sm` for dense lists and tables; `md` (default) for settings rows. */
  size?: 'sm' | 'md'
  id?: string
  title?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}

const TRACK = { sm: 'w-7 h-4', md: 'w-9 h-5' } as const
const KNOB = { sm: 'w-3 h-3', md: 'w-4 h-4' } as const
const KNOB_ON = { sm: 'translate-x-3', md: 'translate-x-4' } as const

/** An on/off switch (`role="switch"`): the control for a setting that applies at once. */
export function Switch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  id,
  title,
  ...aria
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      title={title}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...aria}
      className={`relative inline-flex flex-shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-plm-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-plm-bg disabled:cursor-not-allowed disabled:opacity-50 ${TRACK[size]} ${
        checked ? 'bg-plm-accent' : 'bg-plm-fg-muted/30 hover:bg-plm-fg-muted/40'
      }`}
    >
      <span
        aria-hidden
        className={`${KNOB[size]} rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? KNOB_ON[size] : 'translate-x-0'
        }`}
      />
    </button>
  )
}
