import { Clock } from 'lucide-react'
import type { TestRunResult } from '@/lib/commands/testing/types'

interface TestSummaryBarProps {
  results: TestRunResult | null
}

/**
 * Summary bar showing pass/fail/skip counts and total duration.
 * Renders green for passed, red for failed, gray for skipped counts.
 */
export function TestSummaryBar({ results }: TestSummaryBarProps) {
  if (!results) return null

  const { totalPassed, totalFailed, totalSkipped, duration } = results

  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-[#161b22] border-b border-[#30363d] text-xs font-mono">
      <span className="text-emerald-400 font-medium">
        {totalPassed} passed
      </span>
      <span className="text-red-400 font-medium">
        {totalFailed} failed
      </span>
      <span className="text-slate-500 font-medium">
        {totalSkipped} skipped
      </span>
      <span className="text-[#30363d]">|</span>
      <span className="flex items-center gap-1 text-slate-400">
        <Clock size={11} />
        {formatDuration(duration)}
      </span>
      <span className="text-[#30363d]">|</span>
      <span className="text-slate-500">
        {results.passedAssertions}/{results.totalAssertions} assertions
      </span>
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(0)
  return `${minutes}m ${seconds}s`
}
