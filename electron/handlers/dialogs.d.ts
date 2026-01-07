import { BrowserWindow } from 'electron';
export interface DialogHandlerDependencies {
    log: (message: string, data?: unknown) => void;
    restoreMainWindowFocus: () => void;
}
export declare function registerDialogHandlers(window: BrowserWindow, deps: DialogHandlerDependencies): void;
export declare function unregisterDialogHandlers(): void;
