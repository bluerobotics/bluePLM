import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, Activity } from 'lucide-react'
import { useBackupLogs } from './hooks/useBackupLogs'
import { BackupLogConsole } from './BackupLogConsole'
import { BackupProgressTracker } from './BackupProgressTracker'

interface BackupStatusViewerProps {
  /** Whether a backup operation is currently running (from parent state) */
  isRunningBackup?: boolean
  /** Whether a restore operation is currently running (from parent state) */
  isRestoring?: boolean
  /** Force the viewer to be expanded */
  forceExpanded?: boolean
}

/**
 * Main container for backup/restore status visualization.
 * Shows real-time progress, logs, and error counts.
 * 
 * Features:
 * - Collapsible panel that auto-expands during operations
 * - Auto-expands on errors
 * - Shows error badge when collapsed
 * - Terminal-style log console
 * - Multi-phase progress tracking
 */
export function BackupStatusViewer({
  isRunningBackup = false,
  isRestoring = false,
  forceExpanded = false
}: BackupStatusViewerProps) {
  const {
    logs,
    filteredLogs,
    progress,
    isRunning,
    lastStats,
    errorCount,
    hasErrors,
    filter,
    setFilter,
    currentPhase,
    clearLogs,
    copyLogs,
    elapsedTime
  } = useBackupLogs()
  
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Determine the mode based on current phase or parent state
  const mode = isRestoring || currentPhase === 'restore' || currentPhase === 'metadata_import' 
    ? 'restore' 
    : 'backup'
  
  // Combined running state (from hook or parent)
  const operationRunning = isRunning || isRunningBackup || isRestoring
  
  // Auto-expand when operation starts or on errors
  useEffect(() => {
    if (operationRunning || forceExpanded) {
      setIsExpanded(true)
    }
  }, [operationRunning, forceExpanded])
  
  // Auto-expand when errors occur after completion
  useEffect(() => {
    if (hasErrors && !isRunning && currentPhase === 'complete') {
      setIsExpanded(true)
    }
  }, [hasErrors, isRunning, currentPhase])
  
  // Don't render anything if no logs and not running
  if (logs.length === 0 && !operationRunning && !lastStats) {
    return null
  }
  
  return (
    <div className="rounded-lg border border-plm-border overflow-hidden bg-plm-bg-secondary">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-plm-bg-tertiary transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${operationRunning ? 'text-plm-accent animate-pulse' : 'text-plm-fg-muted'}`} />
          <span className="font-medium text-sm">
            {mode === 'restore' ? 'Restore Status' : 'Backup Status'}
          </span>
          
          {/* Error badge */}
          {hasErrors && !isExpanded && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs">
              <AlertTriangle className="w-3 h-3" />
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          
          {/* Running indicator */}
          {operationRunning && (
            <span className="px-2 py-0.5 rounded-full bg-plm-accent/20 text-plm-accent text-xs animate-pulse">
              In Progress
            </span>
          )}
          
          {/* Completed indicator */}
          {!operationRunning && lastStats?.success && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
              Complete
            </span>
          )}
        </div>
        
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-plm-fg-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-plm-fg-muted" />
        )}
      </button>
      
      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-plm-border pt-4">
          {/* Progress tracker */}
          {(operationRunning || lastStats || progress) && (
            <BackupProgressTracker
              progress={progress}
              isRunning={operationRunning}
              currentPhase={currentPhase}
              lastStats={lastStats}
              elapsedTime={elapsedTime}
              mode={mode}
            />
          )}
          
          {/* Log console */}
          <BackupLogConsole
            logs={filteredLogs}
            filter={filter}
            onFilterChange={setFilter}
            onCopy={copyLogs}
            onClear={clearLogs}
          />
          
          {/* Summary stats when complete */}
          {lastStats && !operationRunning && (
            <div className={`p-3 rounded-lg text-sm ${
              lastStats.success 
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}>
              {lastStats.success ? (
                <div className="flex items-center justify-between">
                  <span>
                    ✓ {mode === 'restore' ? 'Restore' : 'Backup'} completed successfully
                  </span>
                  <span className="text-xs opacity-75">
                    {lastStats.filesProcessed} files • {formatDuration(lastStats.durationMs)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span>
                    ✗ {mode === 'restore' ? 'Restore' : 'Backup'} completed with {lastStats.errorsCount} error{lastStats.errorsCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs opacity-75">
                    Check logs for details
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
