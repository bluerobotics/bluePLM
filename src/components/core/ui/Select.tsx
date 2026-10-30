import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

import { FIELD_CLASS } from './TextInput'

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md'
}

/** A native select with the app's field styling; pass `<option>`s as children. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'md', className = '', children, ...rest },
  ref,
) {
  return (
    <div className={`relative inline-flex ${className}`}>
      <select
        ref={ref}
        {...rest}
        className={`${FIELD_CLASS} cursor-pointer appearance-none pr-8 ${size === 'sm' ? 'h-7 pl-2' : 'h-8 pl-2.5'}`}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-plm-fg-muted"
      />
    </div>
  )
})
