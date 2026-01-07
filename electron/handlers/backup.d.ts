import { BrowserWindow } from 'electron';
export type BackupLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';
export type BackupPhase = 'idle' | 'repo_check' | 'repo_init' | 'unlock' | 'file_scan' | 'backup' | 'retention' | 'restore' | 'metadata_import' | 'complete' | 'error';
export interface BackupLogEntry {
    level: BackupLogLevel;
    phase: BackupPhase;
    message: string;
    timestamp: number;
    metadata?: {
        operation?: string;
        exitCode?: number;
        filesProcessed?: number;
        filesTotal?: number;
        bytesProcessed?: number;
        bytesTotal?: number;
        currentFile?: string;
        error?: string;
        duration?: number;
    };
}
export interface BackupOperationStats {
    phase: BackupPhase;
    startTime: number;
    endTime?: number;
    filesProcessed: number;
    filesTotal: number;
    bytesProcessed: number;
    bytesTotal: number;
    errorsEncountered: number;
}
export interface BackupHandlerDependencies {
    log: (message: string, data?: unknown) => void;
    logError: (message: string, data?: unknown) => void;
    getWorkingDirectory: () => string | null;
}
export declare function registerBackupHandlers(window: BrowserWindow, deps: BackupHandlerDependencies): void;
export declare function unregisterBackupHandlers(): void;
