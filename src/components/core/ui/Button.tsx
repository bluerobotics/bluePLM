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

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-plm-accent text-white border border-transparent shadow-sm hover:bg-plm-accent-hover',
  secondary:
    'bg-plm-bg-light text-plm-fg border border-plm-border hover:bg-plm-highlight hover:border-plm-border-light',
  ghost:
    'bg-transparent text-plm-fg-dim border border-transparent hover:bg-plm-highlight hover:text-plm-fg',
  danger: 'bg-plm-error text-white border border-transparent shadow-sm hover:opacity-90',
  'danger-subtle':
    'bg-transparent text-plm-error border border-plm-error/40 hover:bg-plm-error/10 hover:border-plm-error/60',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-md',
  md: 'h-8 px-3.5 text-[13px] gap-2 rounded-md',
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
      className={`inline-flex flex-shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-plm-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-plm-bg disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {loading ? <Loader2 size={size === 'sm' ? 12 : 14} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}
