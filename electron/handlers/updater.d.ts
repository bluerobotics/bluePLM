import { BrowserWindow } from 'electron';
export interface UpdaterHandlerDependencies {
    log: (message: string, data?: unknown) => void;
    logError: (message: string, data?: unknown) => void;
}
export declare function registerUpdaterHandlers(window: BrowserWindow, deps: UpdaterHandlerDependencies): void;
export declare function unregisterUpdaterHandlers(): void;
