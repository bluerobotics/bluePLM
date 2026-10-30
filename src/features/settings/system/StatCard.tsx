import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface StatCardProps {
  icon?: ReactNode
  label: string
  value: ReactNode
  /** A short line under the value ("of 16 GB", "peak 42%"). */
  detail?: ReactNode
  loading?: boolean
}

/** One figure in a grid of figures: a muted label, a large value, an optional detail line. */
export function StatCard({ icon, label, value, detail, loading = false }: StatCardProps) {
  return (
    <div className="rounded-lg border border-plm-border bg-plm-bg-light/60 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[12px] text-plm-fg-muted">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1.5 flex h-7 items-center text-[20px] font-semibold tabular-nums text-plm-fg">
        {loading ? <Loader2 size={16} className="animate-spin text-plm-fg-muted" /> : value}
      </div>
      {detail && <div className="mt-0.5 text-[12px] text-plm-fg-muted">{detail}</div>}
    </div>
  )
}

/** A responsive grid of StatCards. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
}
