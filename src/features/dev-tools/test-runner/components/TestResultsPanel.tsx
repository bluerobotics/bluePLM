import { useState } from 'react'
import { ChevronRight, CheckCircle2, XCircle, MinusCircle, FileText } from 'lucide-react'
import type { TestRunResult, ScriptResult } from '@/lib/commands/testing/types'
import { TestSummaryBar } from './TestSummaryBar'
import { TestResultSection } from './TestResultSection'

interface TestResultsPanelProps {
  results: TestRunResult | null
}

/**
 * Bottom panel showing structured test results with expandable per-script accordions.
 * Includes a summary bar at top and expandable sections within each script.
 */
export function TestResultsPanel({ results }: TestResultsPanelProps) {
  if (!results) {
    return (
      <div className="flex flex-col h-full bg-[#0d1117]">
        <div className="flex-1 flex items-center justify-center text-slate-500 text-xs font-mono">
          <div className="text-center">
            <FileText size={24} className="mx-auto mb-2 text-slate-600" />
            <p>No test results yet.</p>
            <p className="text-slate-600 mt-1">Run tests to see results.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <TestSummaryBar results={results} />
      <div className="flex-1 overflow-y-auto">
        {results.scripts.map((script, idx) => (
          <ScriptResultAccordion key={idx} script={script} />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// ScriptResultAccordion — Expandable per-script result
// ============================================================================

function ScriptResultAccordion({ script }: { script: ScriptResult }) {
  const [expanded, setExpanded] = useState(!script.passed || script.skipped)

  const StatusIcon = script.skipped
    ? MinusCircle
    : script.passed
    ? CheckCircle2
    : XCircle

  const statusColor = script.skipped
    ? 'text-slate-500'
    : script.passed
    ? 'text-emerald-400'
    : 'text-red-400'

  const borderColor = script.skipped
    ? 'border-slate-700'
    : script.passed
    ? 'border-emerald-800'
    : 'border-red-800'

  return (
    <div className={`border-b ${borderColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-[#161b22] transition-colors"
      >
        <ChevronRight
          size={13}
          className={`text-slate-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
        <StatusIcon size={14} className={`${statusColor} flex-shrink-0`} />
        <span className="text-slate-200 font-medium truncate">
          {script.scriptName}
        </span>
        {script.skipped && script.skipReason && (
          <span className="text-slate-600 truncate">
            — {script.skipReason}
          </span>
        )}
        <span className="ml-auto text-slate-600 flex-shrink-0">
          {formatDuration(script.duration)}
        </span>
      </button>

      {expanded && !script.skipped && (
        <div className="pb-2">
          {script.sections.map((section, idx) => (
            <TestResultSection key={idx} section={section} />
          ))}
          {script.sections.length === 0 && (
            <div className="text-slate-600 text-xs px-6 py-2 italic font-mono">
              No sections in this script
            </div>
          )}
        </div>
      )}
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
