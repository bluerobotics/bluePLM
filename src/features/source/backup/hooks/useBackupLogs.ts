import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  BackupLogEntry,
  BackupDetailedProgress,
  BackupOperationStats,
  BackupLogFilter,
  BackupPhase
} from '../types'

const MAX_LOG_ENTRIES = 500

// Map progress phase strings (from Electron) to BackupPhase enum values
// The backup handler sends human-readable phase names in progress events
const PROGRESS_PHASE_MAP: Record<string, BackupPhase> = {
  'Initializing': 'repo_check',
  'Checking': 'repo_check',
  'Metadata': 'file_scan',
  'Backing up': 'backup',
  'Vault 1/1': 'backup',
  'Local Backup': 'backup',
  'Cleanup': 'retention',
  'Complete': 'complete',
  'Connecting': 'repo_check',
  'Restoring': 'restore',
  'Checking for metadata': 'restore'
}

// Map a progress phase string to a BackupPhase
function mapProgressPhase(phase: string): BackupPhase {
  // First check for exact match
  if (PROGRESS_PHASE_MAP[phase]) {
    return PROGRESS_PHASE_MAP[phase]
  }
  // Check for partial matches (e.g., "Vault 2/3" should map to 'backup')
  for (const [key, value] of Object.entries(PROGRESS_PHASE_MAP)) {
    if (phase.startsWith(key) || phase.includes(key)) {
      return value
    }
  }
  // Default fallback
  return 'idle'
}

interface UseBackupLogsReturn {
  // Log entries
  logs: BackupLogEntry[]
  filteredLogs: BackupLogEntry[]
  
  // Progress state
  progress: BackupDetailedProgress | null
  isRunning: boolean
  
  // Stats for completed operation
  lastStats: BackupOperationStats | null
  
  // Error tracking
  errorCount: number
  hasErrors: boolean
  
  // Filter controls
  filter: BackupLogFilter
  setFilter: (filter: BackupLogFilter) => void
  currentPhase: BackupPhase
  
  // Actions
  clearLogs: () => void
  copyLogs: () => Promise<void>
  addLog: (entry: BackupLogEntry) => void
  
  // Timing
  elapsedTime: number
  startTime: number | null
}

/**
 * Hook to manage backup/restore log state from IPC events.
 * Subscribes to backup:log, backup:detailed-progress, and backup:complete events.
 */
export function useBackupLogs(): UseBackupLogsReturn {
  const [logs, setLogs] = useState<BackupLogEntry[]>([])
  const [progress, setProgress] = useState<BackupDetailedProgress | null>(null)
  const [lastStats, setLastStats] = useState<BackupOperationStats | null>(null)
  const [filter, setFilter] = useState<BackupLogFilter>('all')
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  // Calculate current phase from progress or last log
  const currentPhase: BackupPhase = progress?.phase as BackupPhase || 
    (logs.length > 0 ? logs[logs.length - 1].phase : 'idle')
  
  // Count errors
  const errorCount = logs.filter(log => log.level === 'error').length
  const hasErrors = errorCount > 0
  
  // Is operation running
  const isRunning = progress !== null && currentPhase !== 'complete' && currentPhase !== 'error'
  
  // Elapsed time ticker
  useEffect(() => {
    if (isRunning && startTime) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Date.now() - startTime)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isRunning, startTime])
  
  // Filter logs based on current filter
  const filteredLogs = logs.filter(log => {
    switch (filter) {
      case 'errors':
        return log.level === 'error' || log.level === 'warn'
      case 'current':
        return log.phase === currentPhase
      default:
        return true
    }
  })
  
  // Helper to process and add a log entry
  const processLogEntry = useCallback((typedEntry: BackupLogEntry) => {
    // Check if this is a new operation starting
    const isNewOperation = typedEntry.phase === 'idle' || typedEntry.phase === 'repo_check'
    
    setLogs(prev => {
      const lastPhase = prev[prev.length - 1]?.phase
      const wasComplete = lastPhase === 'complete' || lastPhase === 'error'
      
      // Start fresh if: new operation after completion, or logs are empty
      if ((isNewOperation && wasComplete) || prev.length === 0) {
        setStartTime(Date.now())
        setElapsedTime(0)
        setLastStats(null)
        return [typedEntry]
      }
      
      // Otherwise just add the entry
      const newLogs = [...prev, typedEntry]
      return newLogs.length > MAX_LOG_ENTRIES ? newLogs.slice(-MAX_LOG_ENTRIES) : newLogs
    })
    
    // If this is a complete or error phase with stats, save them
    if ((typedEntry.phase === 'complete' || typedEntry.phase === 'error') && typedEntry.metadata) {
      setLastStats({
        phase: typedEntry.phase,
        success: typedEntry.phase === 'complete',
        filesProcessed: typedEntry.metadata.filesProcessed || 0,
        bytesTransferred: typedEntry.metadata.bytesProcessed || 0,
        errorsCount: typedEntry.level === 'error' ? 1 : 0,
        durationMs: typedEntry.metadata.duration || 0
      })
      setProgress(null)
    }
  }, [])
  
  // Public method to manually add a log entry (for renderer-side logging like metadata import)
  const addLog = useCallback((entry: BackupLogEntry) => {
    processLogEntry(entry)
  }, [processLogEntry])
  
  // Subscribe to IPC events
  useEffect(() => {
    const cleanups: (() => void)[] = []
    
    // Subscribe to unified log events from Electron main process
    if (window.electronAPI?.onBackupLog) {
      const cleanup = window.electronAPI.onBackupLog((entry) => {
        console.log('[BACKUP-DEBUG] Received IPC log:', entry.phase, entry.message)
        
        // Convert IPC entry to our typed entry
        const typedEntry: BackupLogEntry = {
          level: entry.level,
          phase: entry.phase as BackupPhase,
          message: entry.message,
          timestamp: entry.timestamp,
          metadata: entry.metadata
        }
        
        processLogEntry(typedEntry)
      })
      cleanups.push(cleanup)
    } else {
      console.warn('[BACKUP-DEBUG] onBackupLog not available on electronAPI')
    }
    
    // Also listen to the existing basic progress for UI updates
    if (window.electronAPI?.onBackupProgress) {
      const cleanup = window.electronAPI.onBackupProgress((prog) => {
        // Map the human-readable phase to our BackupPhase enum
        const mappedPhase = mapProgressPhase(prog.phase)
        console.log('[BACKUP-DEBUG] Received progress:', prog.phase, '->', mappedPhase, prog.percent, prog.message)
        setProgress({
          phase: mappedPhase,
          percent: prog.percent,
          message: prog.message
        })
      })
      cleanups.push(cleanup)
    } else {
      console.warn('[BACKUP-DEBUG] onBackupProgress not available on electronAPI')
    }
    
    // Listen for renderer-side log events (custom event from useBackupOperations)
    const handleRendererLog = (event: Event) => {
      const customEvent = event as CustomEvent<BackupLogEntry>
      console.log('[BACKUP-DEBUG] Received renderer log:', customEvent.detail.phase, customEvent.detail.message)
      processLogEntry(customEvent.detail)
    }
    window.addEventListener('backup:renderer-log', handleRendererLog)
    cleanups.push(() => window.removeEventListener('backup:renderer-log', handleRendererLog))
    
    return () => {
      cleanups.forEach(cleanup => cleanup())
    }
  }, [processLogEntry])
  
  // Clear logs action
  const clearLogs = useCallback(() => {
    setLogs([])
    setProgress(null)
    setLastStats(null)
    setStartTime(null)
    setElapsedTime(0)
  }, [])
  
  // Copy logs to clipboard
  const copyLogs = useCallback(async () => {
    const logText = logs
      .map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString()
        const meta = log.metadata ? ` ${JSON.stringify(log.metadata)}` : ''
        return `[${time}] [${log.level.toUpperCase()}] [${log.phase}] ${log.message}${meta}`
      })
      .join('\n')
    
    if (window.electronAPI?.copyToClipboard) {
      await window.electronAPI.copyToClipboard(logText)
    } else {
      await navigator.clipboard.writeText(logText)
    }
  }, [logs])
  
  return {
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
    addLog,
    elapsedTime,
    startTime
  }
}
