/**
 * OperationDetails Component
 * 
 * Displays detailed information about a file operation including:
 * - Operation summary header (type, files, total duration)
 * - List of all steps with timing bars
 * - Highlights slow steps (>100ms amber, >500ms red)
 * - Timeline visualization of step execution
 */

import { memo, useMemo } from 'react'
import { 
  X,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import type { FileOperation } from '@/lib/fileOperationTracker'
import { formatDuration, getOperationDisplayName } from '@/lib/fileOperationTracker'
import { StepTimingRow } from './StepTimingRow'

interface OperationDetailsProps {
  operation: FileOperation
  onClose: () => void
}

/**
 * Operation type icon component
 */
function OperationTypeIcon({ type: _type }: { type: FileOperation['type'] }) {
  // All operations use FileText for now, but this can be extended
  return <FileText size={16} className="text-plm-accent" />
}

/**
 * Status badge component
 */
function StatusBadge({ status, error }: { status: FileOperation['status']; error?: string }) {
  switch (status) {
    case 'completed':
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
          <CheckCircle2 size={12} />
          <span>Completed</span>
        </div>
      )
    case 'failed':
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium" title={error}>
          <XCircle size={12} />
          <span>Failed</span>
        </div>
      )
    case 'running':
      return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-plm-accent/20 text-plm-accent text-xs font-medium">
          <Loader2 size={12} className="animate-spin" />
          <span>Running</span>
        </div>
      )
    default:
      return null
  }
}

/**
 * Get total duration color
 */
function getDurationColor(ms: number | undefined): string {
  if (ms === undefined) return 'text-plm-fg-muted'
  if (ms < 1000) return 'text-emerald-400'
  if (ms < 5000) return 'text-amber-400'
  return 'text-red-400'
}

/**
 * Calculate step statistics
 */
function calculateStepStats(operation: FileOperation) {
  const steps = operation.steps
  const totalSteps = steps.length
  const completedSteps = steps.filter(s => s.status === 'completed').length
  const failedSteps = steps.filter(s => s.status === 'failed').length
  const slowSteps = steps.filter(s => s.durationMs !== undefined && s.durationMs >= 100).length
  const verySlowSteps = steps.filter(s => s.durationMs !== undefined && s.durationMs >= 500).length
  
  return { totalSteps, completedSteps, failedSteps, slowSteps, verySlowSteps }
}

export const OperationDetails = memo(function OperationDetails({
  operation,
  onClose
}: OperationDetailsProps) {
  const stats = useMemo(() => calculateStepStats(operation), [operation])
  
  // Get sorted steps by start time
  const sortedSteps = useMemo(() => {
    return [...operation.steps].sort((a, b) => a.startTime - b.startTime)
  }, [operation.steps])
  
  // Calculate total operation duration for the timing bars
  const totalDurationMs = operation.durationMs ?? 
    (operation.endTime ? operation.endTime - operation.startTime : Date.now() - operation.startTime)
  
  return (
    <div className="bg-plm-bg-light rounded-lg border border-plm-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-plm-border bg-plm-bg">
        <OperationTypeIcon type={operation.type} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-plm-fg">
              {getOperationDisplayName(operation.type)}
            </h3>
            <StatusBadge status={operation.status} error={operation.error} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-plm-fg-muted">
            <span>{operation.fileCount} file{operation.fileCount !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span className={`font-mono ${getDurationColor(totalDurationMs)}`}>
              {formatDuration(totalDurationMs)}
            </span>
            <span>•</span>
            <span>{stats.totalSteps} steps</span>
          </div>
        </div>
        
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-plm-highlight rounded transition-colors"
          title="Close details"
        >
          <X size={14} className="text-plm-fg-muted" />
        </button>
      </div>
      
      {/* Error message if failed */}
      {operation.error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-red-400">{operation.error}</span>
        </div>
      )}
      
      {/* Stats bar */}
      <div className="px-4 py-2 border-b border-plm-border/50 flex items-center gap-4 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-plm-fg-muted">{stats.completedSteps} completed</span>
        </div>
        {stats.failedSteps > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-red-400">{stats.failedSteps} failed</span>
          </div>
        )}
        {stats.slowSteps > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-amber-400">{stats.slowSteps} slow (&gt;100ms)</span>
          </div>
        )}
        {stats.verySlowSteps > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-red-400">{stats.verySlowSteps} very slow (&gt;500ms)</span>
          </div>
        )}
      </div>
      
      {/* File paths (collapsible) */}
      {operation.filePaths.length > 0 && (
        <details className="border-b border-plm-border/50">
          <summary className="px-4 py-2 text-xs text-plm-fg-muted cursor-pointer hover:bg-plm-highlight/30 transition-colors">
            <span className="ml-1">Files ({operation.filePaths.length})</span>
          </summary>
          <div className="px-4 pb-2 space-y-0.5">
            {operation.filePaths.map((path, idx) => (
              <div key={idx} className="text-[11px] text-plm-fg font-mono truncate" title={path}>
                {path}
              </div>
            ))}
          </div>
        </details>
      )}
      
      {/* Steps timeline */}
      <div className="max-h-[400px] overflow-y-auto">
        {sortedSteps.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-plm-fg-muted">
            No steps recorded yet
          </div>
        ) : (
          <div>
            {/* Timeline header */}
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-plm-bg-light border-b border-plm-border/50 text-[10px] uppercase tracking-wider text-plm-fg-muted font-medium">
              <div className="w-4" />
              <div className="flex-1">Step</div>
              <div className="w-32 text-center">Timeline</div>
              <div className="w-16 text-right">Duration</div>
              <div className="w-4" />
            </div>
            
            {/* Step rows */}
            {sortedSteps.map((step) => (
              <StepTimingRow
                key={step.id}
                step={step}
                totalDurationMs={totalDurationMs}
                operationStartTime={operation.startTime}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Footer with timing info */}
      <div className="px-4 py-2 border-t border-plm-border bg-plm-bg flex items-center justify-between text-[10px] text-plm-fg-muted">
        <div className="flex items-center gap-1">
          <Clock size={10} />
          <span>Started: {new Date(operation.startTime).toLocaleTimeString()}</span>
        </div>
        {operation.endTime && (
          <span>Ended: {new Date(operation.endTime).toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  )
})

export default OperationDetails
