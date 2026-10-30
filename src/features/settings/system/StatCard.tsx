import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface StatCardProps {
  /** Kept for callers; figures show no icon, like Claude's settings. */
  icon?: ReactNode
  label: string
  value: ReactNode
  /** A short line under the value ("of 16 GB", "peak 42%"). */
  detail?: ReactNode
  loading?: boolean
}

/** One figure in a row of figures: a muted label over a larger value, no box. */
export function StatCard({ label, value, detail, loading = false }: StatCardProps) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[13px] text-ui-fg-secondary">{label}</div>
      <div className="mt-1 flex h-7 items-center text-[20px] font-medium tabular-nums text-ui-fg">
        {loading ? <Loader2 size={16} className="animate-spin text-ui-fg-secondary" /> : value}
      </div>
      {detail && <div className="mt-0.5 text-[13px] text-ui-fg-secondary">{detail}</div>}
    </div>
  )
}

/** A row of StatCards, separated by spacing only. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-8 gap-y-4 py-4 md:grid-cols-4">{children}</div>
}
