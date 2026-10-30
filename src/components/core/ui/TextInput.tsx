import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

/** Shared look of every text field: one height, one border, one focus ring. */
export const FIELD_CLASS =
  'w-full rounded-md border border-plm-border bg-plm-input text-[13px] text-plm-fg placeholder:text-plm-fg-muted/70 transition-colors outline-none hover:border-plm-border-light focus:border-plm-accent focus:ring-2 focus:ring-plm-accent/25 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-plm-error'

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
      className={`${FIELD_CLASS} ${size === 'sm' ? 'h-7 px-2' : 'h-8 px-2.5'} ${className}`}
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
      className={`${FIELD_CLASS} px-2.5 py-2 leading-relaxed ${className}`}
    />
  )
})
