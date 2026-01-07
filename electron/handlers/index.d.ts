import { BrowserWindow } from 'electron';
export { writeLog, initializeLogging } from './logging';
export { getWorkingDirectory } from './fs';
export { isFileBeingThumbnailed, getThumbnailsInProgress } from './solidworks';
export declare function setRestoreMainWindowFocus(fn: () => void): void;
export interface AllHandlerDependencies {
    restoreMainWindowFocus: () => void;
}
export declare function registerAllHandlers(mainWindow: BrowserWindow, deps: AllHandlerDependencies): void;
export declare function unregisterAllHandlers(): void;
