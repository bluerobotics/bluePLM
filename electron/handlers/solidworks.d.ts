import { BrowserWindow } from 'electron';
export declare function isFileBeingThumbnailed(filePath: string): boolean;
export declare function getThumbnailsInProgress(): Set<string>;
export interface SolidWorksHandlerDependencies {
    log: (message: string, data?: unknown) => void;
}
export declare function registerSolidWorksHandlers(window: BrowserWindow, deps: SolidWorksHandlerDependencies): void;
export declare function unregisterSolidWorksHandlers(): void;
