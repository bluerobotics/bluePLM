/**
 * FileOperationLog Component
 * 
 * Main panel for viewing file operation logs in DevTools.
 * 
 * Features:
 * - List of operations with: type icon, file count, duration, status badge
 * - Filters: by type, by status, by time range (session/all)
 * - Clear button
 * - Click to expand/collapse individual operation details inline
 * - Multiple operations can be expanded simultaneously
 * - Auto-scroll to new operations (optional toggle)
 */

import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import { 
  Activity,
  Trash2,
  ChevronRight,
  ChevronDown,
  Filter,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Pin,
  PinOff,
  Upload,
  Download,
  FolderSync,
  Undo2,
  Unlock,
  Link2,
  RefreshCw,
  Clock,
  AlertTriangle
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'
import type { FileOperation, FileOperationType, OperationStatus } from '@/lib/fileOperationTracker'
import { formatDuration, getOperationDisplayName } from '@/lib/fileOperationTracker'
import { StepTimingRow } from './StepTimingRow'

// ============================================================================
// Constants
// ============================================================================

/** Session start timestamp for filtering */
const SESSION_START = Date.now()

/** Operation type colors */
const TYPE_COLORS: Record<FileOperationType, string> = {
  'checkin': 'text-cyan-400 bg-cyan-400/10',
  'checkout': 'text-cyan-400 bg-cyan-400/10',
  'download': 'text-emerald-400 bg-emerald-400/10',
  'get-latest': 'text-emerald-400 bg-emerald-400/10',
  'sync': 'text-teal-400 bg-teal-400/10',
  'discard': 'text-orange-400 bg-orange-400/10',
  'force-release': 'text-rose-400 bg-rose-400/10',
  'delete': 'text-red-400 bg-red-400/10',
  'sync-metadata': 'text-indigo-400 bg-indigo-400/10',
  'extract-references': 'text-purple-400 bg-purple-400/10'
}

/** Operation type icons */
function OperationIcon({ type, size = 14 }: { type: FileOperationType; size?: number }) {
  const color = TYPE_COLORS[type]?.split(' ')[0] || 'text-plm-fg-muted'
  
  switch (type) {
    case 'checkin':
      return <Upload size={size} className={color} />
    case 'checkout':
      return <Download size={size} className={color} />
    case 'download':
      return <Download size={size} className={color} />
    case 'get-latest':
      return <RefreshCw size={size} className={color} />
    case 'sync':
      return <FolderSync size={size} className={color} />
    case 'discard':
      return <Undo2 size={size} className={color} />
    case 'force-release':
      return <Unlock size={size} className={color} />
    case 'delete':
      return <Trash2 size={size} className={color} />
    case 'sync-metadata':
      return <FileText size={size} className={color} />
    case 'extract-references':
      return <Link2 size={size} className={color} />
    default:
      return <Activity size={size} className={color} />
  }
}

// ============================================================================
// Types
// ============================================================================

type TimeRange = 'session' | 'all'
type StatusFilter = 'all' | OperationStatus

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Status badge component
 */
const StatusBadge = memo(function StatusBadge({ 
  status, 
  small = false 
}: { 
  status: OperationStatus
  small?: boolean 
}) {
  const size = small ? 10 : 12
  
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={size} className="text-emerald-400" />
    case 'failed':
      return <XCircle size={size} className="text-red-400" />
    case 'running':
      return <Loader2 size={size} className="text-plm-accent animate-spin" />
    default:
      return null
  }
})

/**
 * Calculate step statistics for an operation
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

/**
 * Get duration color based on milliseconds
 */
function getDurationColor(ms: number | undefined): string {
  if (ms === undefined) return 'text-plm-fg-muted'
  if (ms < 1000) return 'text-emerald-400'
  if (ms < 5000) return 'text-amber-400'
  return 'text-red-400'
}

/**
 * Inline operation details shown when row is expanded
 */
const InlineOperationDetails = memo(function InlineOperationDetails({
  operation
}: {
  operation: FileOperation
}) {
  const stats = useMemo(() => calculateStepStats(operation), [operation])
  
  // Get sorted top-level steps (no parentStepId) and group substeps by parent
  const { topLevelSteps, substepsByParent } = useMemo(() => {
    const topLevel: typeof operation.steps = []
    const byParent: Record<string, typeof operation.steps> = {}
    
    for (const step of operation.steps) {
      if (step.parentStepId) {
        if (!byParent[step.parentStepId]) {
          byParent[step.parentStepId] = []
        }
        byParent[step.parentStepId].push(step)
      } else {
        topLevel.push(step)
      }
    }
    
    // Sort top-level by start time
    topLevel.sort((a, b) => a.startTime - b.startTime)
    
    // Sort substeps within each parent by duration (longest first) for easier reading
    for (const parentId of Object.keys(byParent)) {
      byParent[parentId].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    }
    
    return { topLevelSteps: topLevel, substepsByParent: byParent }
  }, [operation.steps])
  
  // Calculate total operation duration for the timing bars
  const totalDurationMs = operation.durationMs ?? 
    (operation.endTime ? operation.endTime - operation.startTime : Date.now() - operation.startTime)
  
  return (
    <div className="bg-plm-bg border-b border-plm-border/50">
      {/* Error message if failed */}
      {operation.error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-red-400">{operation.error}</span>
        </div>
      )}
      
      {/* Stats bar */}
      <div className="px-4 py-2 border-b border-plm-border/30 flex items-center gap-4 text-[10px]">
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
        <details className="border-b border-plm-border/30">
          <summary className="px-4 py-2 text-xs text-plm-fg-muted cursor-pointer hover:bg-plm-highlight/30 transition-colors">
            <span className="ml-1">Files ({operation.filePaths.length})</span>
          </summary>
          <div className="px-4 pb-2 space-y-0.5 max-h-[150px] overflow-y-auto">
            {operation.filePaths.map((path, idx) => (
              <div key={idx} className="text-[11px] text-plm-fg font-mono truncate" title={path}>
                {path}
              </div>
            ))}
          </div>
        </details>
      )}
      
      {/* Steps timeline */}
      <div className="max-h-[300px] overflow-y-auto">
        {topLevelSteps.length === 0 ? (
          <div className="px-4 py-4 text-center text-xs text-plm-fg-muted">
            No steps recorded yet
          </div>
        ) : (
          <div>
            {/* Timeline header */}
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-plm-bg border-b border-plm-border/30 text-[10px] uppercase tracking-wider text-plm-fg-muted font-medium">
              <div className="w-4" />
              <div className="flex-1">Step</div>
              <div className="w-32 text-center">Timeline</div>
              <div className="w-16 text-right">Duration</div>
              <div className="w-4" />
            </div>
            
            {/* Step rows with nested substeps */}
            {topLevelSteps.map((step) => (
              <StepTimingRow
                key={step.id}
                step={step}
                totalDurationMs={totalDurationMs}
                operationStartTime={operation.startTime}
                substeps={substepsByParent[step.id]}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Footer with timing info */}
      <div className="px-4 py-2 border-t border-plm-border/30 flex items-center justify-between text-[10px] text-plm-fg-muted">
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

/**
 * Single operation row in the list with inline expandable details
 */
const OperationRow = memo(function OperationRow({
  operation,
  isExpanded,
  onToggle
}: {
  operation: FileOperation
  isExpanded: boolean
  onToggle: (id: string) => void
}) {
  const duration = operation.durationMs ?? (operation.endTime 
    ? operation.endTime - operation.startTime 
    : Date.now() - operation.startTime)
  
  // Duration color
  const durationColor = getDurationColor(duration)
  
  return (
    <div className="border-b border-plm-border/30">
      {/* Row header */}
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
          isExpanded 
            ? 'bg-plm-accent/10 hover:bg-plm-accent/15' 
            : 'hover:bg-plm-highlight/50'
        }`}
        onClick={() => onToggle(operation.id)}
      >
        {/* Expand indicator */}
        {isExpanded ? (
          <ChevronDown size={12} className="text-plm-accent transition-transform flex-shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-plm-fg-muted transition-transform flex-shrink-0" />
        )}
        
        {/* Operation icon */}
        <div className={`p-1 rounded ${TYPE_COLORS[operation.type]?.split(' ')[1] || 'bg-plm-bg'}`}>
          <OperationIcon type={operation.type} size={12} />
        </div>
        
        {/* Operation info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-plm-fg truncate">
            {getOperationDisplayName(operation.type)}
          </div>
          <div className="text-[10px] text-plm-fg-muted">
            {operation.fileCount} file{operation.fileCount !== 1 ? 's' : ''} · {operation.steps.length} steps
          </div>
        </div>
        
        {/* Duration */}
        <div className={`text-xs font-mono flex-shrink-0 ${durationColor}`}>
          {operation.status === 'running' ? (
            <span className="text-plm-accent">...</span>
          ) : (
            formatDuration(duration)
          )}
        </div>
        
        {/* Status */}
        <StatusBadge status={operation.status} small />
      </div>
      
      {/* Inline details when expanded */}
      {isExpanded && <InlineOperationDetails operation={operation} />}
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export function FileOperationLog() {
  // Store state
  const operations = usePDMStore(state => state.operations)
  const clearOperations = usePDMStore(state => state.clearOperations)
  
  // Local state
  const [typeFilter, setTypeFilter] = useState<FileOperationType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('session')
  const [autoScroll, setAutoScroll] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [expandedOperations, setExpandedOperations] = useState<Set<string>>(new Set())
  
  const listRef = useRef<HTMLDivElement>(null)
  const prevOperationsLength = useRef(operations.length)
  
  // Auto-scroll to new operations
  useEffect(() => {
    if (autoScroll && operations.length > prevOperationsLength.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
    prevOperationsLength.current = operations.length
  }, [operations.length, autoScroll])
  
  // Filter operations
  const filteredOperations = useMemo(() => {
    return operations.filter(op => {
      // Type filter
      if (typeFilter !== 'all' && op.type !== typeFilter) return false
      
      // Status filter
      if (statusFilter !== 'all' && op.status !== statusFilter) return false
      
      // Time range filter
      if (timeRange === 'session' && op.startTime < SESSION_START) return false
      
      return true
    })
  }, [operations, typeFilter, statusFilter, timeRange])
  
  // Stats for quick view
  const stats = useMemo(() => {
    return {
      total: filteredOperations.length,
      running: filteredOperations.filter(op => op.status === 'running').length,
      completed: filteredOperations.filter(op => op.status === 'completed').length,
      failed: filteredOperations.filter(op => op.status === 'failed').length
    }
  }, [filteredOperations])
  
  // Handle operation toggle (expand/collapse)
  const handleToggle = useCallback((id: string) => {
    setExpandedOperations(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])
  
  // Handle clear
  const handleClear = useCallback(() => {
    clearOperations()
    setExpandedOperations(new Set())
  }, [clearOperations])
  
  // All operation types for filter
  const operationTypes: FileOperationType[] = [
    'checkin', 'checkout', 'download', 'get-latest', 'sync',
    'discard', 'force-release', 'delete', 'sync-metadata', 'extract-references'
  ]
  
  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="bg-plm-bg rounded-lg p-3 border border-plm-border">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-plm-accent" />
          <span className="text-[10px] uppercase tracking-wide text-plm-fg-muted">
            File Operation Log
          </span>
          <span className="text-[9px] text-plm-fg-muted ml-2">
            ({stats.total} operations)
          </span>
          
          <div className="flex-1" />
          
          {/* Quick stats */}
          <div className="flex items-center gap-3 text-xs">
            {stats.running > 0 && (
              <span className="flex items-center gap-1 text-plm-accent">
                <Loader2 size={10} className="animate-spin" />
                {stats.running}
              </span>
            )}
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 size={10} />
              {stats.completed}
            </span>
            {stats.failed > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <XCircle size={10} />
                {stats.failed}
              </span>
            )}
          </div>
        </div>
        
        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-2">
          {(['checkin', 'checkout', 'download', 'sync'] as FileOperationType[]).map(type => {
            const count = filteredOperations.filter(op => op.type === type).length
            return (
              <div 
                key={type}
                className={`rounded p-2 ${TYPE_COLORS[type]?.split(' ')[1] || 'bg-plm-bg-light'} cursor-pointer hover:opacity-80 transition-opacity ${
                  typeFilter === type ? 'ring-1 ring-plm-accent' : ''
                }`}
                onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <OperationIcon type={type} size={12} />
                  <span className={`text-[10px] ${TYPE_COLORS[type]?.split(' ')[0]}`}>
                    {getOperationDisplayName(type)}
                  </span>
                </div>
                <div className={`text-lg font-mono tabular-nums ${TYPE_COLORS[type]?.split(' ')[0]}`}>
                  {count}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Operations list */}
      <div className="bg-plm-bg-lighter rounded-lg border border-plm-border overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 bg-plm-bg-light border-b border-plm-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
                showFilters ? 'bg-plm-accent/20 text-plm-accent' : 'hover:bg-plm-highlight text-plm-fg-muted'
              }`}
            >
              <Filter size={12} />
              Filters
            </button>
            
            <span className="text-xs text-plm-fg-muted">
              {filteredOperations.length} operation{filteredOperations.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Time range */}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="text-xs bg-plm-bg border border-plm-border rounded px-2 py-0.5 text-plm-fg"
            >
              <option value="session">This Session</option>
              <option value="all">All Time</option>
            </select>
            
            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1 rounded transition-colors ${
                autoScroll ? 'bg-plm-accent/30 text-plm-accent' : 'hover:bg-plm-highlight text-plm-fg-muted'
              }`}
              title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
            >
              {autoScroll ? <Pin size={12} /> : <PinOff size={12} />}
            </button>
            
            {/* Clear button */}
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-plm-fg-muted hover:text-plm-error rounded hover:bg-plm-bg transition-colors"
              title="Clear all operations"
            >
              <Trash2 size={12} />
              Clear
            </button>
          </div>
        </div>
        
        {/* Filter bar */}
        {showFilters && (
          <div className="px-3 py-2 border-b border-plm-border bg-plm-bg flex items-center gap-4 flex-wrap">
            {/* Type filter */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-plm-fg-muted uppercase tracking-wider">Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as FileOperationType | 'all')}
                className="text-xs bg-plm-input border border-plm-border rounded px-2 py-0.5 text-plm-fg"
              >
                <option value="all">All Types</option>
                {operationTypes.map(type => (
                  <option key={type} value={type}>{getOperationDisplayName(type)}</option>
                ))}
              </select>
            </div>
            
            {/* Status filter */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-plm-fg-muted uppercase tracking-wider">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="text-xs bg-plm-input border border-plm-border rounded px-2 py-0.5 text-plm-fg"
              >
                <option value="all">All Statuses</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            
            {/* Clear filters */}
            {(typeFilter !== 'all' || statusFilter !== 'all') && (
              <button
                onClick={() => {
                  setTypeFilter('all')
                  setStatusFilter('all')
                }}
                className="text-xs text-plm-accent hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        
        {/* Operations list */}
        <div 
          ref={listRef}
          className="max-h-[500px] overflow-y-auto"
        >
          {filteredOperations.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-plm-fg-muted">
              <Activity size={24} className="mx-auto mb-2 opacity-30" />
              No operations recorded yet.
              <br />
              <span className="text-xs">Perform file operations to see timing data.</span>
            </div>
          ) : (
            [...filteredOperations].reverse().map(operation => (
              <OperationRow
                key={operation.id}
                operation={operation}
                isExpanded={expandedOperations.has(operation.id)}
                onToggle={handleToggle}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default FileOperationLog
