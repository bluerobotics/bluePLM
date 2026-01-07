import { BrowserWindow } from 'electron';
export interface MenuDependencies {
    log: (message: string, data?: unknown) => void;
}
export declare function createAppMenu(window: BrowserWindow, deps: MenuDependencies): void;
