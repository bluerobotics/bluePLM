import { BrowserWindow } from 'electron';
export interface SystemHandlerDependencies {
    log: (message: string, data?: unknown) => void;
}
export declare function registerSystemHandlers(window: BrowserWindow, deps: SystemHandlerDependencies): void;
export declare function unregisterSystemHandlers(): void;
