import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  AlertCircle,
  Search,
  Database,
  HardDrive,
  FolderSync,
  FileCheck,
  Clock
} from 'lucide-react'
import type { BackupPhase, BackupDetailedProgress, BackupOperationStats } from './types'

interface BackupProgressTrackerProps {
  progress: BackupDetailedProgress | null
  isRunning: boolean
  currentPhase: BackupPhase
  lastStats: BackupOperationStats | null
  elapsedTime: number
  mode: 'backup' | 'restore'
}

// Phase definitions for backup and restore
const BACKUP_PHASES: { phase: BackupPhase; label: string; icon: typeof Circle }[] = [
  { phase: 'repo_check', label: 'Repository Check', icon: Search },
  { phase: 'file_scan', label: 'Scanning Files', icon: FolderSync },
  { phase: 'backup', label: 'Uploading', icon: HardDrive },
  { phase: 'retention', label: 'Retention Policy', icon: FileCheck },
  { phase: 'complete', label: 'Complete', icon: CheckCircle2 }
]

const RESTORE_PHASES: { phase: BackupPhase; label: string; icon: typeof Circle }[] = [
  { phase: 'repo_check', label: 'Repository Check', icon: Search },
  { phase: 'restore', label: 'Restoring Files', icon: FolderSync },
  { phase: 'metadata_import', label: 'Importing Metadata', icon: Database },
  { phase: 'complete', label: 'Complete', icon: CheckCircle2 }
]

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getPhaseIndex(phases: typeof BACKUP_PHASES, phase: BackupPhase): number {
  return phases.findIndex(p => p.phase === phase)
}

/**
 * Multi-phase progress tracker showing current operation status.
 * Displays phase indicators, progress bar, and file/byte counters.
 */
export function BackupProgressTracker({
  progress,
  isRunning,
  currentPhase,
  lastStats,
  elapsedTime,
  mode
}: BackupProgressTrackerProps) {
  const phases = mode === 'restore' ? RESTORE_PHASES : BACKUP_PHASES
  const currentPhaseIndex = getPhaseIndex(phases, currentPhase)
  const isComplete = currentPhase === 'complete'
  const hasError = currentPhase === 'error'
  
  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">
            {isComplete ? (
              <span className="text-emerald-400">Complete</span>
            ) : hasError ? (
              <span className="text-red-400">Error</span>
            ) : (
              progress?.message || 'Waiting...'
            )}
          </span>
          <span className="text-plm-fg-muted">
            {progress?.percent != null ? `${Math.round(progress.percent)}%` : '—'}
          </span>
        </div>
        
        <div className="w-full bg-plm-bg-tertiary rounded-full h-2 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-300 ${
              hasError ? 'bg-red-500' :
              isComplete ? 'bg-emerald-500' :
              'bg-plm-accent'
            }`}
            style={{ width: `${progress?.percent ?? 0}%` }}
          />
        </div>
      </div>
      
      {/* Phase indicators */}
      <div className="flex items-center justify-between px-1">
        {phases.map((phaseInfo, index) => {
          const Icon = phaseInfo.icon
          const isPast = index < currentPhaseIndex
          const isCurrent = phaseInfo.phase === currentPhase
          
          return (
            <div key={phaseInfo.phase} className="flex flex-col items-center gap-1">
              <div className={`relative ${
                isPast ? 'text-emerald-400' :
                isCurrent && isRunning ? 'text-plm-accent' :
                isCurrent && hasError ? 'text-red-400' :
                isCurrent ? 'text-emerald-400' :
                'text-plm-fg-muted opacity-50'
              }`}>
                {isCurrent && isRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isCurrent && hasError ? (
                  <AlertCircle className="w-4 h-4" />
                ) : isPast || (isCurrent && isComplete) ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>
              <span className={`text-[10px] ${
                isCurrent ? 'text-plm-fg font-medium' : 'text-plm-fg-muted'
              }`}>
                {phaseInfo.label}
              </span>
            </div>
          )
        })}
      </div>
      
      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-plm-fg-muted border-t border-plm-border pt-2">
        {/* Phase info */}
        <span className="flex items-center gap-1.5">
          <span className="capitalize">{currentPhase.replace('_', ' ')}</span>
        </span>
        
        {/* File/byte counts */}
        {(progress?.filesProcessed != null || lastStats?.filesProcessed != null) && (
          <span>
            {progress?.filesProcessed ?? lastStats?.filesProcessed ?? 0}
            {(progress?.filesTotal ?? 0) > 0 && ` / ${progress?.filesTotal}`} files
          </span>
        )}
        
        {/* Bytes transferred */}
        {(progress?.bytesProcessed != null || lastStats?.bytesTransferred != null) && (
          <span>
            {formatBytes(progress?.bytesProcessed ?? lastStats?.bytesTransferred ?? 0)}
          </span>
        )}
        
        {/* Elapsed time */}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTime(elapsedTime)}
        </span>
      </div>
    </div>
  )
}
