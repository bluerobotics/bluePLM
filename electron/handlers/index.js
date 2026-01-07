import { registerFsHandlers, unregisterFsHandlers, getWorkingDirectory } from './fs';
import { registerBackupHandlers, unregisterBackupHandlers } from './backup';
import { registerSolidWorksHandlers, unregisterSolidWorksHandlers, isFileBeingThumbnailed, getThumbnailsInProgress } from './solidworks';
import { registerDialogHandlers, unregisterDialogHandlers } from './dialogs';
import { registerSystemHandlers, unregisterSystemHandlers } from './system';
import { registerLoggingHandlers, unregisterLoggingHandlers, writeLog } from './logging';
import { registerUpdaterHandlers, unregisterUpdaterHandlers } from './updater';
import { registerOAuthHandlers, unregisterOAuthHandlers } from './oauth';
// Logging utilities for main.ts
export { writeLog, initializeLogging } from './logging';
// Re-export getters
export { getWorkingDirectory } from './fs';
export { isFileBeingThumbnailed, getThumbnailsInProgress } from './solidworks';
// Convenience log functions
var log = function (message, data) {
    writeLog('info', "[Main] ".concat(message), data);
};
var logDebug = function (message, data) {
    writeLog('debug', "[Main] ".concat(message), data);
};
var logError = function (message, data) {
    writeLog('error', "[Main] ".concat(message), data);
};
var logWarn = function (message, data) {
    writeLog('warn', "[Main] ".concat(message), data);
};
// Helper to restore focus to main window after dialogs
var restoreMainWindowFocusFn = function () { };
export function setRestoreMainWindowFocus(fn) {
    restoreMainWindowFocusFn = fn;
}
export function registerAllHandlers(mainWindow, deps) {
    restoreMainWindowFocusFn = deps.restoreMainWindowFocus;
    // Create shared dependencies
    var fsHandlerDeps = {
        log: log,
        logDebug: logDebug,
        logError: logError,
        logWarn: logWarn,
        isFileBeingThumbnailed: isFileBeingThumbnailed,
        thumbnailsInProgress: getThumbnailsInProgress(),
        restoreMainWindowFocus: restoreMainWindowFocusFn
    };
    var backupHandlerDeps = {
        log: log,
        logError: logError,
        getWorkingDirectory: getWorkingDirectory
    };
    var solidWorksHandlerDeps = {
        log: log
    };
    var dialogHandlerDeps = {
        log: log,
        restoreMainWindowFocus: restoreMainWindowFocusFn
    };
    var systemHandlerDeps = {
        log: log
    };
    var loggingHandlerDeps = {};
    var updaterHandlerDeps = {
        log: log,
        logError: logError
    };
    var oauthHandlerDeps = {
        log: log
    };
    // Register all handlers
    registerFsHandlers(mainWindow, fsHandlerDeps);
    registerBackupHandlers(mainWindow, backupHandlerDeps);
    registerSolidWorksHandlers(mainWindow, solidWorksHandlerDeps);
    registerDialogHandlers(mainWindow, dialogHandlerDeps);
    registerSystemHandlers(mainWindow, systemHandlerDeps);
    registerLoggingHandlers(mainWindow, loggingHandlerDeps);
    registerUpdaterHandlers(mainWindow, updaterHandlerDeps);
    registerOAuthHandlers(mainWindow, oauthHandlerDeps);
    log('All IPC handlers registered');
}
export function unregisterAllHandlers() {
    unregisterFsHandlers();
    unregisterBackupHandlers();
    unregisterSolidWorksHandlers();
    unregisterDialogHandlers();
    unregisterSystemHandlers();
    unregisterLoggingHandlers();
    unregisterUpdaterHandlers();
    unregisterOAuthHandlers();
}
