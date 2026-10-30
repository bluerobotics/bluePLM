import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-subtle'
export type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner in place of the icon and disables the button. */
  loading?: boolean
  /** Leading icon, usually a lucide icon at 14px. */
  icon?: ReactNode
}

// Claude style: neutral fills, a light-on-dark primary, red text for destructive actions.
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ui-fg text-ui-bg border border-transparent hover:bg-ui-fg/90',
  secondary: 'bg-ui-field text-ui-fg border border-ui-field-border hover:bg-ui-selected',
  ghost: 'bg-transparent text-ui-fg border border-transparent hover:bg-ui-hover',
  danger: 'bg-ui-danger text-white border border-transparent hover:bg-ui-danger/90',
  'danger-subtle':
    'bg-ui-field text-ui-danger border border-ui-field-border hover:bg-ui-danger/10 hover:border-ui-danger/40',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-8 px-3.5 text-[14px] gap-2 rounded-lg',
}

/** The app's button. One primary action per view; secondary for the rest; ghost in toolbars. */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      {...rest}
      className={`inline-flex flex-shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/50 focus-visible:ring-offset-1 focus-visible:ring-offset-ui-bg disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {loading ? <Loader2 size={size === 'sm' ? 12 : 14} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}
