import { Play, CheckCircle2, XCircle, Minus, Loader2 } from 'lucide-react'
import type { ParsedTestScript } from '@/lib/commands/testing/types'

/** Status of a script in the test run lifecycle */
export type ScriptRunStatus = 'idle' | 'running' | 'passed' | 'failed'

interface ScriptListItemProps {
  script: ParsedTestScript
  status: ScriptRunStatus
  selected: boolean
  onToggleSelect: () => void
  onRun: () => void
}

/**
 * A single script row in the script browser.
 * Shows filename, @requires badges, run status icon, and play button.
 */
export function ScriptListItem({
  script,
  status,
  selected,
  onToggleSelect,
  onRun,
}: ScriptListItemProps) {
  const displayName = script.metadata.name || script.sourceFile || 'Unknown Script'

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-[#161b22] transition-colors group border-b border-[#30363d]/50">
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="w-3.5 h-3.5 rounded border-[#30363d] bg-[#0d1117] text-plm-accent focus:ring-0 focus:ring-offset-0 cursor-pointer flex-shrink-0"
      />

      {/* Status icon */}
      <div className="flex-shrink-0">
        <StatusIcon status={status} />
      </div>

      {/* Script info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono text-slate-200 truncate">
          {displayName}
        </div>
        {script.metadata.requires.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {script.metadata.requires.map((req) => (
              <span
                key={req}
                className="inline-block px-1.5 py-0 text-[9px] font-mono rounded bg-plm-accent/15 text-plm-accent border border-plm-accent/20"
              >
                {req}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRun()
        }}
        disabled={status === 'running'}
        className="p-1 rounded hover:bg-[#30363d] text-slate-400 hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        title="Run this script"
      >
        <Play size={12} />
      </button>
    </div>
  )
}

function StatusIcon({ status }: { status: ScriptRunStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 size={13} className="text-blue-400 animate-spin" />
    case 'passed':
      return <CheckCircle2 size={13} className="text-emerald-400" />
    case 'failed':
      return <XCircle size={13} className="text-red-400" />
    case 'idle':
    default:
      return <Minus size={13} className="text-slate-600" />
  }
}
