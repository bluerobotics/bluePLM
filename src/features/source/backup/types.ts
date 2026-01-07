import type { BackupStatus, BackupConfig, BackupSnapshot } from '@/lib/backup'

export interface BackupPanelProps {
  isAdmin: boolean
}

export interface BackupProgress {
  phase: string
  percent: number
  message: string
}

export interface DeleteConfirmTarget {
  id: string
  time: string
}

export interface BackupHistoryItemData extends BackupSnapshot {
  // BackupSnapshot already has all the fields we need
}

// Connected vault type from the store
export interface ConnectedVault {
  id: string
  name: string
  localPath: string
  isExpanded?: boolean
}

// ============================================
// Backup Status Viewer Types
// ============================================

/** Log levels for backup operations */
export type BackupLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success'

/** Phases of backup/restore operations */
export type BackupPhase = 
  | 'idle'
  | 'repo_check'
  | 'repo_init'
  | 'unlock'
  | 'file_scan'
  | 'backup'
  | 'retention'
  | 'restore'
  | 'metadata_import'
  | 'complete'
  | 'error'

/** A single log entry from backup operations */
export interface BackupLogEntry {
  level: BackupLogLevel
  phase: BackupPhase
  message: string
  timestamp: number
  metadata?: {
    operation?: string
    exitCode?: number
    filesProcessed?: number
    filesTotal?: number
    bytesProcessed?: number
    bytesTotal?: number
    currentFile?: string
    error?: string
    duration?: number
  }
}

/** Extended progress info with more detail (derived from log entries) */
export interface BackupDetailedProgress {
  phase: BackupPhase
  percent: number
  message: string
  filesProcessed?: number
  filesTotal?: number
  bytesProcessed?: number
  bytesTotal?: number
  currentFile?: string
  startedAt?: number
  elapsedMs?: number
}

/** Statistics for completed operations (derived from log entries) */
export interface BackupOperationStats {
  phase: BackupPhase
  success: boolean
  filesProcessed: number
  bytesTransferred: number
  errorsCount: number
  durationMs: number
}

/** Filter options for log console */
export type BackupLogFilter = 'all' | 'errors' | 'current'

// Re-export types from backup lib for convenience
export type { BackupStatus, BackupConfig, BackupSnapshot }
