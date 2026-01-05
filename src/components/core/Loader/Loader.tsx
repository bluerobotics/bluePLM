import { Spinner } from './Spinner'

interface LoaderProps {
  text?: string
  size?: number
  className?: string
}

export function Loader({ text, size = 24, className = '' }: LoaderProps) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <Spinner size={size} />
      {text && <span className="text-plm-fg-muted">{text}</span>}
    </div>
  )
}
