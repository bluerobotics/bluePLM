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
// System handlers for Electron main process
import { app, ipcMain, BrowserWindow, clipboard } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as si from 'systeminformation';
// Module state
var mainWindow = null;
var log = console.log;
// Analytics settings
function getAnalyticsSettingsPath() {
    return path.join(app.getPath('userData'), 'analytics-settings.json');
}
function readAnalyticsEnabled() {
    try {
        var settingsPath = getAnalyticsSettingsPath();
        if (fs.existsSync(settingsPath)) {
            var data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            return (data === null || data === void 0 ? void 0 : data.enabled) === true;
        }
    }
    catch (_a) {
        // Ignore errors
    }
    return false;
}
function writeAnalyticsEnabled(enabled) {
    try {
        var settingsPath = getAnalyticsSettingsPath();
        fs.writeFileSync(settingsPath, JSON.stringify({ enabled: enabled }), 'utf8');
    }
    catch (err) {
        console.error('[Analytics] Failed to write settings:', err);
    }
}
export function registerSystemHandlers(window, deps) {
    var _this = this;
    mainWindow = window;
    log = deps.log;
    // App info handlers
    ipcMain.handle('app:get-version', function () { return app.getVersion(); });
    ipcMain.handle('app:get-platform', function () { return process.platform; });
    ipcMain.handle('app:get-app-version', function () { return app.getVersion(); });
    // Analytics handlers
    ipcMain.handle('analytics:set-enabled', function (_, enabled) {
        writeAnalyticsEnabled(enabled);
        return { success: true };
    });
    ipcMain.handle('analytics:get-enabled', function () {
        return { enabled: readAnalyticsEnabled() };
    });
    // Machine identification
    ipcMain.handle('app:get-machine-id', function () {
        var _a;
        try {
            var hostname = require('os').hostname();
            var cpus = require('os').cpus();
            var cpuInfo = ((_a = cpus[0]) === null || _a === void 0 ? void 0 : _a.model) || 'unknown';
            var raw = "".concat(hostname, "-").concat(cpuInfo, "-").concat(process.platform);
            var hash = crypto.createHash('sha256').update(raw).digest('hex');
            return hash.substring(0, 16);
        }
        catch (_b) {
            return 'unknown';
        }
    });
    ipcMain.handle('app:get-machine-name', function () {
        return require('os').hostname();
    });
    // Clipboard handlers
    ipcMain.handle('clipboard:write-text', function (_event, text) {
        try {
            clipboard.writeText(text);
            return { success: true };
        }
        catch (err) {
            return { success: false, error: String(err) };
        }
    });
    ipcMain.handle('clipboard:read-text', function () {
        try {
            return { success: true, text: clipboard.readText() };
        }
        catch (err) {
            return { success: false, error: String(err) };
        }
    });
    // Titlebar handlers
    ipcMain.handle('app:get-titlebar-overlay-rect', function () {
        var _a;
        if (!mainWindow)
            return { x: 0, y: 0, width: 138, height: 38 };
        // getTitleBarOverlayRect may not exist on all Electron versions
        var win = mainWindow;
        return ((_a = win.getTitleBarOverlayRect) === null || _a === void 0 ? void 0 : _a.call(win)) || { x: 0, y: 0, width: 138, height: 38 };
    });
    ipcMain.handle('app:set-titlebar-overlay', function (_event, options) {
        if (!mainWindow)
            return { success: false };
        try {
            if (mainWindow.setTitleBarOverlay) {
                mainWindow.setTitleBarOverlay({
                    color: options.color,
                    symbolColor: options.symbolColor,
                    height: 36
                });
            }
            return { success: true };
        }
        catch (err) {
            return { success: false, error: String(err) };
        }
    });
    // App control
    ipcMain.handle('app:reload', function () {
        if (mainWindow) {
            mainWindow.webContents.reload();
            return { success: true };
        }
        return { success: false, error: 'No window' };
    });
    ipcMain.handle('app:request-focus', function () {
        var _a;
        if (mainWindow && !mainWindow.isDestroyed()) {
            var allWindows = BrowserWindow.getAllWindows();
            for (var _i = 0, allWindows_1 = allWindows; _i < allWindows_1.length; _i++) {
                var win = allWindows_1[_i];
                if (win !== mainWindow && !win.isDestroyed()) {
                    log('[Window] Closing child window: ' + win.getTitle());
                    win.close();
                }
            }
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            if (process.platform === 'darwin') {
                (_a = app.dock) === null || _a === void 0 ? void 0 : _a.show();
            }
            return { success: true };
        }
        return { success: false, error: 'No window' };
    });
    // Performance window
    ipcMain.handle('app:open-performance-window', function () {
        var perfWindow = new BrowserWindow({
            width: 600,
            height: 500,
            title: 'Performance Monitor',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        var isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        if (isDev) {
            perfWindow.loadURL('http://localhost:5173/#/performance');
        }
        else {
            perfWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'), {
                hash: '/performance'
            });
        }
        return { success: true };
    });
    // Tab window creation
    ipcMain.handle('app:create-tab-window', function (_event, view, title, customData) {
        var tabWindow = new BrowserWindow({
            width: 1000,
            height: 700,
            title: title || 'BluePLM',
            webPreferences: {
                preload: path.join(__dirname, '..', 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false
            }
        });
        var isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        var queryParams = customData ? "?data=".concat(encodeURIComponent(JSON.stringify(customData))) : '';
        if (isDev) {
            tabWindow.loadURL("http://localhost:5173/#/".concat(view).concat(queryParams));
        }
        else {
            tabWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'), {
                hash: "/".concat(view).concat(queryParams)
            });
        }
        return { success: true, windowId: tabWindow.id };
    });
    // Zoom handlers
    ipcMain.handle('app:get-zoom-factor', function () {
        if (!mainWindow)
            return 1;
        return mainWindow.webContents.getZoomFactor();
    });
    ipcMain.handle('app:set-zoom-factor', function (_event, factor) {
        if (!mainWindow)
            return { success: false };
        mainWindow.webContents.setZoomFactor(factor);
        mainWindow.webContents.send('zoom-changed', factor);
        return { success: true };
    });
    // Window size handlers
    ipcMain.handle('app:get-window-size', function () {
        if (!mainWindow)
            return { width: 1400, height: 900 };
        var bounds = mainWindow.getBounds();
        return { width: bounds.width, height: bounds.height };
    });
    ipcMain.handle('app:set-window-size', function (_event, width, height) {
        if (!mainWindow)
            return { success: false };
        mainWindow.setSize(width, height);
        return { success: true };
    });
    ipcMain.handle('app:reset-window-size', function () {
        if (!mainWindow)
            return { success: false };
        mainWindow.setSize(1400, 900);
        mainWindow.center();
        mainWindow.webContents.setZoomFactor(1);
        mainWindow.webContents.send('zoom-changed', 1);
        return { success: true };
    });
    // System stats - returns data directly (no wrapper) for component compatibility
    ipcMain.handle('system:get-stats', function () { return __awaiter(_this, void 0, void 0, function () {
        var _a, cpuLoad, mem, diskLayout, netStats, cpuUsage, coreUsages, memoryUsed, memoryTotal, memoryPercent, diskUsed, diskTotal, diskPercent, mainDisk, rxSpeed, txSpeed, _i, netStats_1, iface, err_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, Promise.all([
                            si.currentLoad(),
                            si.mem(),
                            si.fsSize(),
                            si.networkStats()
                        ])];
                case 1:
                    _a = _b.sent(), cpuLoad = _a[0], mem = _a[1], diskLayout = _a[2], netStats = _a[3];
                    cpuUsage = Math.round(cpuLoad.currentLoad);
                    coreUsages = cpuLoad.cpus.map(function (c) { return Math.round(c.load); });
                    memoryUsed = mem.used;
                    memoryTotal = mem.total;
                    memoryPercent = Math.round((memoryUsed / memoryTotal) * 100);
                    diskUsed = 0;
                    diskTotal = 0;
                    diskPercent = 0;
                    if (diskLayout.length > 0) {
                        mainDisk = diskLayout[0];
                        diskUsed = mainDisk.used;
                        diskTotal = mainDisk.size;
                        diskPercent = Math.round(mainDisk.use);
                    }
                    rxSpeed = 0;
                    txSpeed = 0;
                    for (_i = 0, netStats_1 = netStats; _i < netStats_1.length; _i++) {
                        iface = netStats_1[_i];
                        rxSpeed += iface.rx_sec || 0;
                        txSpeed += iface.tx_sec || 0;
                    }
                    return [2 /*return*/, {
                            cpu: {
                                usage: cpuUsage,
                                cores: coreUsages
                            },
                            memory: {
                                used: memoryUsed,
                                total: memoryTotal,
                                percent: memoryPercent
                            },
                            disk: {
                                used: diskUsed,
                                total: diskTotal,
                                percent: diskPercent
                            },
                            network: {
                                rxSpeed: rxSpeed,
                                txSpeed: txSpeed
                            }
                        }];
                case 2:
                    err_1 = _b.sent();
                    console.error('[System] Failed to get stats:', err_1);
                    return [2 /*return*/, null];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Window state handlers
    ipcMain.handle('window:is-maximized', function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isMaximized(); });
    ipcMain.on('window:minimize', function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.minimize(); });
    ipcMain.on('window:maximize', function () {
        if (mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        }
        else {
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.maximize();
        }
    });
    ipcMain.on('window:close', function () { return mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.close(); });
}
export function unregisterSystemHandlers() {
    var handlers = [
        'app:get-version', 'app:get-platform', 'app:get-app-version',
        'analytics:set-enabled', 'analytics:get-enabled',
        'app:get-machine-id', 'app:get-machine-name',
        'clipboard:write-text', 'clipboard:read-text',
        'app:get-titlebar-overlay-rect', 'app:set-titlebar-overlay',
        'app:reload', 'app:request-focus', 'app:open-performance-window', 'app:create-tab-window',
        'app:get-zoom-factor', 'app:set-zoom-factor',
        'app:get-window-size', 'app:set-window-size', 'app:reset-window-size',
        'system:get-stats', 'window:is-maximized'
    ];
    for (var _i = 0, handlers_1 = handlers; _i < handlers_1.length; _i++) {
        var handler = handlers_1[_i];
        ipcMain.removeHandler(handler);
    }
    ipcMain.removeAllListeners('window:minimize');
    ipcMain.removeAllListeners('window:maximize');
    ipcMain.removeAllListeners('window:close');
}
