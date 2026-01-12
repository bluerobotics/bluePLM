/**
 * StepTimingRow Component
 * 
 * Displays a single step within an operation with:
 * - Step name and status icon
 * - Duration with color coding (green < 100ms, amber < 500ms, red >= 500ms)
 * - Visual timing bar proportional to total operation time
 * - Expandable metadata section
 */

import { useState, memo } from 'react'
import { 
  ChevronRight, 
  Check, 
  X, 
  Loader2,
  Info
} from 'lucide-react'
import type { OperationStep } from '@/lib/fileOperationTracker'
import { formatDuration } from '@/lib/fileOperationTracker'

interface StepTimingRowProps {
  step: OperationStep
  /** Total operation duration for calculating timing bar width */
  totalDurationMs: number
  /** Offset from operation start for positioning the timing bar */
  operationStartTime: number
  /** Nested substeps under this step */
  substeps?: OperationStep[]
  /** Whether this is a nested substep (affects indentation) */
  isSubstep?: boolean
}

/**
 * Get duration color class based on milliseconds
 */
function getDurationColor(ms: number | undefined): string {
  if (ms === undefined) return 'text-plm-fg-muted'
  if (ms < 100) return 'text-emerald-400'
  if (ms < 500) return 'text-amber-400'
  return 'text-red-400'
}

/**
 * Get background color for timing bar based on duration
 */
function getBarColor(ms: number | undefined): string {
  if (ms === undefined) return 'bg-plm-fg-muted/30'
  if (ms < 100) return 'bg-emerald-500/60'
  if (ms < 500) return 'bg-amber-500/60'
  return 'bg-red-500/60'
}

/**
 * Status icon component
 */
function StatusIcon({ status }: { status: OperationStep['status'] }) {
  switch (status) {
    case 'completed':
      return <Check size={12} className="text-emerald-400" />
    case 'failed':
      return <X size={12} className="text-red-400" />
    case 'running':
      return <Loader2 size={12} className="text-plm-accent animate-spin" />
    default:
      return null
  }
}

/**
 * Format metadata value for display
 */
function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toLocaleString()
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return `[${value.length} items]`
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export const StepTimingRow = memo(function StepTimingRow({
  step,
  totalDurationMs,
  operationStartTime,
  substeps,
  isSubstep = false
}: StepTimingRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const hasMetadata = step.metadata && Object.keys(step.metadata).length > 0
  const hasSubsteps = substeps && substeps.length > 0
  const isExpandable = hasMetadata || hasSubsteps
  
  // Calculate timing bar position and width
  const barWidthPercent = totalDurationMs > 0 && step.durationMs !== undefined
    ? Math.max(2, (step.durationMs / totalDurationMs) * 100)
    : 0
  
  const barLeftPercent = totalDurationMs > 0
    ? ((step.startTime - operationStartTime) / totalDurationMs) * 100
    : 0
  
  return (
    <div className={`border-b border-plm-border/30 last:border-b-0 ${isSubstep ? 'bg-plm-bg/50' : ''}`}>
      {/* Main row */}
      <div
        className={`flex items-center gap-2 px-3 py-2 hover:bg-plm-highlight/30 transition-colors ${
          isExpandable ? 'cursor-pointer' : ''
        } ${isSubstep ? 'pl-8' : ''}`}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        {/* Expand indicator / Status icon */}
        <div className="w-4 flex-shrink-0 flex items-center justify-center">
          {isExpandable ? (
            <ChevronRight 
              size={12} 
              className={`text-plm-fg-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
          ) : (
            <StatusIcon status={step.status} />
          )}
        </div>
        
        {/* Step name */}
        <div className={`flex-1 min-w-0 text-xs truncate ${isSubstep ? 'text-plm-fg-muted' : 'text-plm-fg'}`}>
          {step.name}
        </div>
        
        {/* Timing bar visualization */}
        <div className="w-32 h-3 bg-plm-bg rounded-sm relative overflow-hidden flex-shrink-0">
          {step.status !== 'running' && barWidthPercent > 0 && (
            <div
              className={`absolute top-0 h-full rounded-sm ${getBarColor(step.durationMs)}`}
              style={{
                left: `${Math.min(barLeftPercent, 100)}%`,
                width: `${Math.min(barWidthPercent, 100 - barLeftPercent)}%`
              }}
            />
          )}
          {step.status === 'running' && (
            <div className="absolute inset-0 bg-plm-accent/30 animate-pulse rounded-sm" />
          )}
        </div>
        
        {/* Duration */}
        <div className={`w-16 text-right text-xs font-mono flex-shrink-0 ${getDurationColor(step.durationMs)}`}>
          {step.status === 'running' ? (
            <span className="text-plm-accent">...</span>
          ) : (
            formatDuration(step.durationMs)
          )}
        </div>
        
        {/* Status icon (when metadata exists) */}
        {hasMetadata && (
          <div className="w-4 flex-shrink-0 flex items-center justify-center">
            <StatusIcon status={step.status} />
          </div>
        )}
      </div>
      
      {/* Expanded content: substeps and/or metadata */}
      {isExpanded && (
        <div className={isSubstep ? 'pl-8' : ''}>
          {/* Nested substeps */}
          {hasSubsteps && (
            <div className="border-l-2 border-plm-accent/30 ml-5">
              {substeps!.map((substep) => (
                <StepTimingRow
                  key={substep.id}
                  step={substep}
                  totalDurationMs={totalDurationMs}
                  operationStartTime={operationStartTime}
                  isSubstep
                />
              ))}
            </div>
          )}
          
          {/* Metadata */}
          {hasMetadata && (
            <div className="px-3 pb-2 pl-9">
              <div className="bg-plm-bg rounded-lg p-2 border border-plm-border/50">
                <div className="flex items-center gap-1 mb-1.5">
                  <Info size={10} className="text-plm-fg-muted" />
                  <span className="text-[10px] uppercase tracking-wider text-plm-fg-muted font-medium">
                    Metadata
                  </span>
                </div>
                <div className="space-y-1">
                  {Object.entries(step.metadata!).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-[11px]">
                      <span className="text-plm-fg-muted flex-shrink-0 w-24 truncate" title={key}>
                        {key}:
                      </span>
                      <span className="text-plm-fg font-mono break-all" title={formatMetadataValue(value)}>
                        {formatMetadataValue(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default StepTimingRow
