import type { ReactNode } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, Loader2, TrendingUp, Users } from 'lucide-react'

import { formatBytes } from '@/lib/utils/format'

import type { ActivityTimeRange, DailyActivity, NetworkStats } from './supabaseActivity'

const SERIES = [
  { key: 'checkins', label: 'Check-ins', swatch: 'bg-emerald-500' },
  { key: 'checkouts', label: 'Checkouts', swatch: 'bg-blue-500' },
  { key: 'creates', label: 'Creates', swatch: 'bg-purple-500' },
  { key: 'other', label: 'Other', swatch: 'bg-orange-500' },
] as const

function pct(part: number, total: number): string {
  return `${total > 0 ? (part / total) * 100 : 0}%`
}

function bucketTitle(timeRange: ActivityTimeRange, date: string): string {
  if (timeRange === '24h') {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (timeRange === 'all') return date
  return new Date(date).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function SummaryStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-ui-fg-secondary">{icon}</span>
      <div className="min-w-0">
        <div className="text-[13px] text-ui-fg-secondary">{label}</div>
        <div className="text-[14px] font-medium tabular-nums text-ui-fg">{value}</div>
      </div>
    </div>
  )
}

interface SupabaseActivityChartProps {
  timeRange: ActivityTimeRange
  dailyActivity: DailyActivity[]
  networkStats: NetworkStats
  loading: boolean
}

/** Summary figures and a stacked bar chart of vault activity over the chosen time range. */
export function SupabaseActivityChart({
  timeRange,
  dailyActivity,
  networkStats,
  loading,
}: SupabaseActivityChartProps) {
  const maxTotal = Math.max(...dailyActivity.map((d) => d.total), 1)

  return (
    <>
      <div className="grid grid-cols-2 gap-4 px-4 py-3.5 md:grid-cols-4">
        <SummaryStat
          icon={<ArrowUpRight size={14} />}
          label="Data In"
          value={formatBytes(networkStats.totalBytesIn)}
        />
        <SummaryStat
          icon={<ArrowDownRight size={14} />}
          label="Data Out (est.)"
          value={formatBytes(networkStats.totalBytesOut)}
        />
        <SummaryStat
          icon={<Activity size={14} />}
          label="Total Events"
          value={networkStats.totalEvents.toLocaleString()}
        />
        <SummaryStat
          icon={<Users size={14} />}
          label="Active Users"
          value={String(networkStats.activeUsers)}
        />
      </div>

      <div className="space-y-3 px-4 py-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-ui-fg-secondary" />
          </div>
        ) : (
          <div className="flex h-32 items-end gap-1">
            {dailyActivity.map((day, idx) => {
              const height = (day.total / maxTotal) * 100
              const isLast = idx === dailyActivity.length - 1
              const other = day.stateChanges + day.deletes
              return (
                <div
                  key={day.date}
                  className="group relative flex flex-1 flex-col items-center gap-1"
                >
                  {/* Stacked bar: dynamic heights need inline styles */}
                  <div
                    className="relative w-full overflow-hidden rounded-t transition-opacity group-hover:opacity-80"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  >
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-emerald-500"
                      style={{ height: pct(day.checkins, day.total) }}
                    />
                    <div
                      className="absolute left-0 right-0 bg-blue-500"
                      style={{
                        bottom: pct(day.checkins, day.total),
                        height: pct(day.checkouts, day.total),
                      }}
                    />
                    <div
                      className="absolute left-0 right-0 bg-purple-500"
                      style={{
                        bottom: pct(day.checkins + day.checkouts, day.total),
                        height: pct(day.creates, day.total),
                      }}
                    />
                    <div
                      className="absolute left-0 right-0 top-0 bg-orange-500"
                      style={{ height: pct(other, day.total) }}
                    />
                  </div>

                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-ui-divider bg-ui-field p-2 text-[13px] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    <div className="mb-1 font-medium text-ui-fg">
                      {bucketTitle(timeRange, day.date)}
                    </div>
                    <div className="space-y-0.5 text-ui-fg-secondary">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-sm bg-emerald-500" />
                        Check-ins: {day.checkins}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-sm bg-blue-500" />
                        Checkouts: {day.checkouts}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-sm bg-purple-500" />
                        Creates: {day.creates}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-sm bg-orange-500" />
                        Other: {other}
                      </div>
                      <div className="mt-1 border-t border-ui-divider pt-1">
                        <div>Data in: {formatBytes(day.bytesIn)}</div>
                        <div>Users: {day.uniqueUsers}</div>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[12px] ${isLast ? 'font-medium text-ui-accent' : 'text-ui-fg-secondary'}`}
                  >
                    {day.dayLabel.substring(0, 3)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ui-fg-secondary">
          <div className="flex flex-wrap items-center gap-4">
            {SERIES.map((series) => (
              <span key={series.key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${series.swatch}`} />
                {series.label}
              </span>
            ))}
          </div>
          {!loading && networkStats.peakEvents > 0 && (
            <span className="flex items-center gap-1.5">
              <TrendingUp size={12} className="text-ui-accent" />
              Peak: <strong className="font-medium text-ui-fg">
                {networkStats.peakEvents}
              </strong>{' '}
              events {timeRange === '24h' ? 'at' : 'on'} {networkStats.peakDay}
            </span>
          )}
        </div>
      </div>
    </>
  )
}
