import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

/** Shared look of every text field: one height, one fill, one focus ring. */
export const FIELD_CLASS =
  'w-full rounded-lg border border-ui-field-border bg-ui-field text-[14px] text-ui-fg placeholder:text-ui-fg-secondary transition-colors outline-none focus:border-ui-accent/70 focus:ring-2 focus:ring-ui-accent/25 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-ui-danger'

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md'
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { size = 'md', className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`${FIELD_CLASS} ${size === 'sm' ? 'h-6 px-2 text-[13px]' : 'h-7 px-2.5'} ${className}`}
    />
  )
})

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className = '', ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={`${FIELD_CLASS} px-3 py-2 leading-[1.45] ${className}`}
    />
  )
})
