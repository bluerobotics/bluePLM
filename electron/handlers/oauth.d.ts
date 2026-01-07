import { BrowserWindow } from 'electron';
export interface OAuthHandlerDependencies {
    log: (message: string, data?: unknown) => void;
}
export declare function registerOAuthHandlers(window: BrowserWindow, deps: OAuthHandlerDependencies): void;
export declare function unregisterOAuthHandlers(): void;
