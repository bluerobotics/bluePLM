import { useState } from 'react'
import { ChevronRight, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import type { SectionResult } from '@/lib/commands/testing/types'

interface TestResultSectionProps {
  section: SectionResult
}

/**
 * Expandable accordion for a single test section within a script result.
 * Shows section name with pass/fail icon, and expands to show individual assertions.
 */
export function TestResultSection({ section }: TestResultSectionProps) {
  const [expanded, setExpanded] = useState(!section.passed)

  return (
    <div className="border-l-2 border-[#30363d] ml-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono hover:bg-[#161b22] transition-colors"
      >
        <ChevronRight
          size={12}
          className={`text-slate-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
        {section.passed ? (
          <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
        ) : (
          <XCircle size={12} className="text-red-400 flex-shrink-0" />
        )}
        <span className={section.passed ? 'text-slate-300' : 'text-red-300'}>
          {section.name}
        </span>
        <span className="text-slate-600 ml-auto">
          {section.assertions.length} assertion{section.assertions.length !== 1 ? 's' : ''}
        </span>
      </button>

      {expanded && (
        <div className="pl-8 pr-3 pb-2 space-y-1">
          {section.error && (
            <div className="flex items-start gap-2 px-2 py-1.5 bg-red-500/10 rounded text-xs">
              <AlertCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-red-300 font-mono break-all">{section.error}</span>
            </div>
          )}
          {section.assertions.map((assertion, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 px-2 py-1 text-xs font-mono"
            >
              {assertion.passed ? (
                <CheckCircle2 size={11} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle size={11} className="text-red-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <div className={assertion.passed ? 'text-slate-400' : 'text-red-300'}>
                  {assertion.command}
                </div>
                {!assertion.passed && (
                  <div className="text-red-400/70 mt-0.5 break-all">
                    {assertion.message}
                  </div>
                )}
              </div>
            </div>
          ))}
          {section.assertions.length === 0 && !section.error && (
            <div className="text-slate-600 text-xs px-2 py-1 italic">
              No assertions in this section ({section.commandsRun} commands run)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
