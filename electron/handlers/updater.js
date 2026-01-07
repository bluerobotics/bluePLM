var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
// Auto-updater handlers for Electron main process
import { app, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { autoUpdater } from 'electron-updater';
// Module state
var mainWindow = null;
var log = console.log;
var logError = console.error;
// Update state
var updateAvailable = null;
var updateDownloaded = false;
var downloadProgress = null;
var isUserInitiatedCheck = false;
// Update check timing
var lastUpdateCheck = 0;
var UPDATE_CHECK_COOLDOWN = 30 * 1000;
var UPDATE_CHECK_INTERVAL = 2 * 60 * 1000;
var updateCheckTimer = null;
var isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
function getUpdateReminderFile() {
    return path.join(app.getPath('userData'), 'update-reminder.json');
}
function loadUpdateReminder() {
    try {
        var reminderFile = getUpdateReminderFile();
        if (fs.existsSync(reminderFile)) {
            var data = fs.readFileSync(reminderFile, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (_a) { }
    return null;
}
function saveUpdateReminder(reminder) {
    try {
        fs.writeFileSync(getUpdateReminderFile(), JSON.stringify(reminder, null, 2));
    }
    catch (_a) { }
}
function clearUpdateReminder() {
    try {
        var reminderFile = getUpdateReminderFile();
        if (fs.existsSync(reminderFile)) {
            fs.unlinkSync(reminderFile);
        }
    }
    catch (_a) { }
}
function shouldShowUpdate(version) {
    var reminder = loadUpdateReminder();
    if (!reminder)
        return true;
    if (reminder.version !== version) {
        clearUpdateReminder();
        return true;
    }
    var TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    var timeSincePostponed = Date.now() - reminder.postponedAt;
    if (timeSincePostponed >= TWENTY_FOUR_HOURS) {
        log('Update reminder expired, showing update');
        clearUpdateReminder();
        return true;
    }
    return false;
}
function performAutoUpdateCheck(reason) {
    return __awaiter(this, void 0, void 0, function () {
        var now, timeSinceLastCheck, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (isDev)
                        return [2 /*return*/];
                    now = Date.now();
                    timeSinceLastCheck = now - lastUpdateCheck;
                    if (timeSinceLastCheck < UPDATE_CHECK_COOLDOWN) {
                        log("[Update] Skipping check (".concat(reason, ") - checked ").concat(Math.round(timeSinceLastCheck / 1000), "s ago"));
                        return [2 /*return*/];
                    }
                    if (updateAvailable && !updateDownloaded) {
                        log("[Update] Skipping check (".concat(reason, ") - update already available: v").concat(updateAvailable.version));
                        return [2 /*return*/];
                    }
                    lastUpdateCheck = now;
                    log("[Update] Checking for updates (".concat(reason, ")..."));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, autoUpdater.checkForUpdates()];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _a.sent();
                    log("[Update] Auto check failed: ".concat(String(err_1)));
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
export function registerUpdaterHandlers(window, deps) {
    var _this = this;
    mainWindow = window;
    log = deps.log;
    logError = deps.logError;
    // Configure auto-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
        info: function (message) { return log("[AutoUpdater] ".concat(message)); },
        warn: function (message) { return log("[AutoUpdater] ".concat(message)); },
        error: function (message) { return logError("[AutoUpdater] ".concat(message)); },
        debug: function (message) { return log("[AutoUpdater] ".concat(message)); }
    };
    // Auto-updater event handlers
    autoUpdater.on('checking-for-update', function () {
        log('Checking for updates...');
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('updater:checking');
    });
    autoUpdater.on('update-available', function (info) {
        log('Update available: ' + info.version);
        updateAvailable = info;
        if (shouldShowUpdate(info.version)) {
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('updater:available', {
                version: info.version,
                releaseDate: info.releaseDate,
                releaseNotes: info.releaseNotes
            });
        }
        else {
            log('Update notification suppressed - user postponed recently');
        }
        isUserInitiatedCheck = false;
    });
    autoUpdater.on('update-not-available', function (info) {
        log('No update available, current version is latest');
        updateAvailable = null;
        isUserInitiatedCheck = false;
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('updater:not-available', {
            version: info.version
        });
    });
    autoUpdater.on('download-progress', function (progress) {
        downloadProgress = progress;
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('updater:download-progress', {
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total
        });
    });
    autoUpdater.on('update-downloaded', function (info) {
        log('Update downloaded: ' + info.version);
        updateDownloaded = true;
        downloadProgress = null;
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('updater:downloaded', {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes
        });
    });
    autoUpdater.on('error', function (error) {
        logError('Auto-updater error', { error: error.message });
        downloadProgress = null;
        if (isUserInitiatedCheck) {
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('updater:error', {
                message: error.message
            });
        }
        isUserInitiatedCheck = false;
    });
    // IPC handlers
    ipcMain.handle('updater:check', function () { return __awaiter(_this, void 0, void 0, function () {
        var err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    if (isDev) {
                        log('Skipping update check in development mode');
                        return [2 /*return*/, { success: false, error: 'Updates disabled in development' }];
                    }
                    isUserInitiatedCheck = true;
                    return [4 /*yield*/, autoUpdater.checkForUpdates()];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true, updateInfo: updateAvailable }];
                case 2:
                    err_2 = _a.sent();
                    logError('Failed to check for updates', { error: String(err_2) });
                    isUserInitiatedCheck = false;
                    return [2 /*return*/, { success: false, error: String(err_2) }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('updater:download', function () { return __awaiter(_this, void 0, void 0, function () {
        var err_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    if (!updateAvailable) {
                        return [2 /*return*/, { success: false, error: 'No update available' }];
                    }
                    log('Starting update download...');
                    return [4 /*yield*/, autoUpdater.downloadUpdate()];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 2:
                    err_3 = _a.sent();
                    logError('Failed to download update', { error: String(err_3) });
                    return [2 /*return*/, { success: false, error: String(err_3) }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('updater:install', function () {
        if (!updateDownloaded) {
            return { success: false, error: 'No update downloaded' };
        }
        log('Installing update and restarting...');
        setImmediate(function () {
            try {
                if (process.platform === 'darwin') {
                    log('[Update] macOS: Using app.relaunch + app.exit for update installation');
                    autoUpdater.autoInstallOnAppQuit = true;
                    app.relaunch();
                    app.exit(0);
                }
                else {
                    autoUpdater.quitAndInstall(false, true);
                }
            }
            catch (err) {
                logError('[Update] quitAndInstall failed, trying fallback', { error: String(err) });
                try {
                    app.relaunch();
                    app.exit(0);
                }
                catch (_a) {
                    app.quit();
                }
            }
        });
        return { success: true };
    });
    ipcMain.handle('updater:get-status', function () {
        var shouldShow = updateAvailable ? shouldShowUpdate(updateAvailable.version) : false;
        return {
            updateAvailable: (updateAvailable && shouldShow) ? {
                version: updateAvailable.version,
                releaseDate: updateAvailable.releaseDate,
                releaseNotes: updateAvailable.releaseNotes
            } : null,
            updateDownloaded: updateDownloaded,
            downloadProgress: downloadProgress ? {
                percent: downloadProgress.percent,
                bytesPerSecond: downloadProgress.bytesPerSecond,
                transferred: downloadProgress.transferred,
                total: downloadProgress.total
            } : null
        };
    });
    ipcMain.handle('updater:postpone', function (_, version) {
        log("User postponed update for version ".concat(version));
        saveUpdateReminder({
            version: version,
            postponedAt: Date.now()
        });
        return { success: true };
    });
    ipcMain.handle('updater:clear-reminder', function () {
        log('Clearing update reminder');
        clearUpdateReminder();
        return { success: true };
    });
    ipcMain.handle('updater:get-reminder', function () {
        return loadUpdateReminder();
    });
    // Download specific version installer
    ipcMain.handle('updater:download-version', function (_, version, downloadUrl) { return __awaiter(_this, void 0, void 0, function () {
        var https_1, http_1, tempDir, urlParts, fileName, filePath_1, downloadWithRedirects_1, err_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    log("Downloading specific version: ".concat(version, " from ").concat(downloadUrl));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, import('https')];
                case 2:
                    https_1 = _a.sent();
                    return [4 /*yield*/, import('http')];
                case 3:
                    http_1 = _a.sent();
                    tempDir = path.join(app.getPath('temp'), 'blueplm-updates');
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }
                    urlParts = new URL(downloadUrl);
                    fileName = path.basename(urlParts.pathname);
                    filePath_1 = path.join(tempDir, fileName);
                    downloadWithRedirects_1 = function (url) {
                        return new Promise(function (resolve) {
                            var protocol = url.startsWith('https') ? https_1 : http_1;
                            protocol.get(url, function (response) {
                                if (response.statusCode === 302 || response.statusCode === 301) {
                                    var redirectUrl = response.headers.location;
                                    if (redirectUrl) {
                                        log("Following redirect to: ".concat(redirectUrl));
                                        downloadWithRedirects_1(redirectUrl).then(resolve);
                                        return;
                                    }
                                }
                                if (response.statusCode !== 200) {
                                    resolve({ success: false, error: "HTTP ".concat(response.statusCode) });
                                    return;
                                }
                                var totalBytes = parseInt(response.headers['content-length'] || '0', 10);
                                var downloadedBytes = 0;
                                var lastProgressUpdate = Date.now();
                                var lastBytes = 0;
                                var file = fs.createWriteStream(filePath_1);
                                response.on('data', function (chunk) {
                                    downloadedBytes += chunk.length;
                                    var now = Date.now();
                                    if (now - lastProgressUpdate >= 100) {
                                        var elapsed = (now - lastProgressUpdate) / 1000;
                                        var bytesPerSecond = elapsed > 0 ? (downloadedBytes - lastBytes) / elapsed : 0;
                                        var percent = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
                                        if (mainWindow) {
                                            mainWindow.webContents.send('update-download-progress', {
                                                percent: percent,
                                                bytesPerSecond: bytesPerSecond,
                                                transferred: downloadedBytes,
                                                total: totalBytes
                                            });
                                        }
                                        lastProgressUpdate = now;
                                        lastBytes = downloadedBytes;
                                    }
                                });
                                response.pipe(file);
                                file.on('finish', function () {
                                    file.close();
                                    log("Downloaded installer to: ".concat(filePath_1));
                                    resolve({ success: true, filePath: filePath_1 });
                                });
                                file.on('error', function (err) {
                                    fs.unlink(filePath_1, function () { });
                                    resolve({ success: false, error: String(err) });
                                });
                            }).on('error', function (err) {
                                resolve({ success: false, error: String(err) });
                            });
                        });
                    };
                    return [4 /*yield*/, downloadWithRedirects_1(downloadUrl)];
                case 4: return [2 /*return*/, _a.sent()];
                case 5:
                    err_4 = _a.sent();
                    logError('Failed to download version installer', { error: String(err_4) });
                    return [2 /*return*/, { success: false, error: String(err_4) }];
                case 6: return [2 /*return*/];
            }
        });
    }); });
    // Run downloaded installer
    ipcMain.handle('updater:run-installer', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        var err_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    log("Running installer: ".concat(filePath));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    if (!fs.existsSync(filePath)) {
                        return [2 /*return*/, { success: false, error: 'Installer file not found' }];
                    }
                    return [4 /*yield*/, shell.openPath(filePath)];
                case 2:
                    _a.sent();
                    setTimeout(function () {
                        app.quit();
                    }, 1000);
                    return [2 /*return*/, { success: true }];
                case 3:
                    err_5 = _a.sent();
                    logError('Failed to run installer', { error: String(err_5) });
                    return [2 /*return*/, { success: false, error: String(err_5) }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    // Start periodic update checks
    if (!isDev) {
        setTimeout(function () {
            performAutoUpdateCheck('startup');
        }, 5000);
        updateCheckTimer = setInterval(function () {
            performAutoUpdateCheck('periodic');
        }, UPDATE_CHECK_INTERVAL);
        mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.on('focus', function () {
            performAutoUpdateCheck('window-focus');
        });
    }
}
export function unregisterUpdaterHandlers() {
    if (updateCheckTimer) {
        clearInterval(updateCheckTimer);
        updateCheckTimer = null;
    }
    var handlers = [
        'updater:check', 'updater:download', 'updater:install', 'updater:get-status',
        'updater:postpone', 'updater:clear-reminder', 'updater:get-reminder',
        'updater:download-version', 'updater:run-installer'
    ];
    for (var _i = 0, handlers_1 = handlers; _i < handlers_1.length; _i++) {
        var handler = handlers_1[_i];
        ipcMain.removeHandler(handler);
    }
}
