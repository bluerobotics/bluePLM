import { BrowserWindow } from 'electron';
export declare function getWorkingDirectory(): string | null;
export declare function setWorkingDirectoryExternal(dir: string | null): void;
export declare function clearHashCache(): void;
export interface FsHandlerDependencies {
    log: (message: string, data?: unknown) => void;
    logDebug: (message: string, data?: unknown) => void;
    logError: (message: string, data?: unknown) => void;
    logWarn: (message: string, data?: unknown) => void;
    isFileBeingThumbnailed: (filePath: string) => boolean;
    thumbnailsInProgress: Set<string>;
    restoreMainWindowFocus: () => void;
}
export declare function registerFsHandlers(window: BrowserWindow, deps: FsHandlerDependencies): void;
export declare function unregisterFsHandlers(): void;
