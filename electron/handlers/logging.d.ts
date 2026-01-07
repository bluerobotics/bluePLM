import { BrowserWindow } from 'electron';
interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    data?: unknown;
}
export declare function writeLog(level: LogEntry['level'], message: string, data?: unknown): void;
export declare function initializeLogging(): void;
export interface LoggingHandlerDependencies {
}
export declare function registerLoggingHandlers(window: BrowserWindow, _deps: LoggingHandlerDependencies): void;
export declare function unregisterLoggingHandlers(): void;
export {};
