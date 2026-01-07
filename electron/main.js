// BluePLM Electron Main Process
// This file contains only app lifecycle, window creation, and imports handlers from modules
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
import { app, BrowserWindow, ipcMain, shell, screen, nativeTheme, session } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import * as Sentry from '@sentry/electron/main';
import { registerAllHandlers, initializeLogging, writeLog } from './handlers';
import { createAppMenu } from './menu';
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
// ============================================
// Sentry Error Tracking (Main Process)
// ============================================
var SENTRY_DSN = process.env.VITE_SENTRY_DSN || 'https://7e0fa5359dedac9d87c951c593def9fa@o4510557909417984.ingest.us.sentry.io/4510557913350144';
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
var sentryInitialized = false;
function initSentryMain() {
    if (sentryInitialized)
        return;
    var analyticsEnabled = readAnalyticsEnabled();
    if (analyticsEnabled && SENTRY_DSN) {
        try {
            Sentry.init({
                dsn: SENTRY_DSN,
                environment: process.env.NODE_ENV || 'production',
                release: app.getVersion(),
                sendDefaultPii: false,
            });
            sentryInitialized = true;
            log('[Sentry] Main process initialized');
        }
        catch (err) {
            console.error('[Sentry] Failed to initialize:', err);
        }
    }
    else {
        log('[Sentry] Not initialized (disabled by user or no DSN)');
    }
}
// ============================================
// Logging Utilities
// ============================================
var log = function (message, data) {
    writeLog('info', "[Main] ".concat(message), data);
};
var logError = function (message, data) {
    writeLog('error', "[Main] ".concat(message), data);
};
// Prevent crashes from taking down the whole app
process.on('uncaughtException', function (error) {
    writeLog('error', 'Uncaught exception', { error: error.message, stack: error.stack });
});
process.on('unhandledRejection', function (reason) {
    writeLog('error', 'Unhandled rejection', { reason: String(reason) });
});
var windowStateFile = path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
    try {
        if (fs.existsSync(windowStateFile)) {
            var data = fs.readFileSync(windowStateFile, 'utf-8');
            return JSON.parse(data);
        }
    }
    catch (err) {
        console.error('Failed to load window state:', err);
    }
    return { width: 1400, height: 900, isMaximized: false };
}
function saveWindowState(mainWindow) {
    if (!mainWindow)
        return;
    try {
        var isMaximized = mainWindow.isMaximized();
        var bounds = mainWindow.getBounds();
        var state = {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            isMaximized: isMaximized
        };
        fs.writeFileSync(windowStateFile, JSON.stringify(state, null, 2));
    }
    catch (err) {
        console.error('Failed to save window state:', err);
    }
}
// ============================================
// Main Window
// ============================================
var mainWindow = null;
var isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
// Follow system dark/light mode for web content
nativeTheme.themeSource = 'system';
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
var isTestMode = process.argv.includes('--test-mode') || process.env.BLUEPLM_TEST === '1';
var gotTheLock = isTestMode ? true : app.requestSingleInstanceLock();
if (!gotTheLock) {
    log('Another instance is running, quitting...');
    app.quit();
}
else {
    log(isTestMode ? 'Running in test mode (single instance lock bypassed)' : 'Got single instance lock');
}
// Helper to restore focus to main window after dialogs (fixes macOS UI freeze issue)
function restoreMainWindowFocus() {
    if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
        setImmediate(function () {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.focus();
            }
        });
    }
}
function createWindow() {
    log('Creating BrowserWindow...');
    var savedState = loadWindowState();
    // Validate window position is on a visible display
    var x = savedState.x;
    var y = savedState.y;
    if (x !== undefined && y !== undefined) {
        var displays = screen.getAllDisplays();
        var isOnDisplay = displays.some(function (display) {
            var _a = display.bounds, dx = _a.x, dy = _a.y, width = _a.width, height = _a.height;
            return x >= dx && x < dx + width && y >= dy && y < dy + height;
        });
        if (!isOnDisplay) {
            x = undefined;
            y = undefined;
        }
    }
    mainWindow = new BrowserWindow({
        x: x,
        y: y,
        width: savedState.width,
        height: savedState.height,
        minWidth: 600,
        minHeight: 300,
        backgroundColor: '#0a1929',
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#181818',
            symbolColor: '#cccccc',
            height: 36
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
        show: false
    });
    // Set up permission handler for geolocation
    session.defaultSession.setPermissionRequestHandler(function (webContents, permission, callback) {
        var allowedPermissions = ['geolocation', 'notifications', 'clipboard-read'];
        if (allowedPermissions.includes(permission)) {
            log("Granting permission: ".concat(permission));
            callback(true);
        }
        else {
            log("Denying permission: ".concat(permission));
            callback(false);
        }
    });
    // Restore maximized state
    if (savedState.isMaximized) {
        mainWindow.maximize();
    }
    // Save window state on changes
    mainWindow.on('resize', function () { return saveWindowState(mainWindow); });
    mainWindow.on('move', function () { return saveWindowState(mainWindow); });
    mainWindow.on('maximize', function () { return saveWindowState(mainWindow); });
    mainWindow.on('unmaximize', function () { return saveWindowState(mainWindow); });
    var windowShown = false;
    var showWindow = function () {
        if (!windowShown && mainWindow) {
            windowShown = true;
            mainWindow.show();
        }
    };
    mainWindow.once('ready-to-show', showWindow);
    setTimeout(showWindow, 5000);
    mainWindow.webContents.on('render-process-gone', function () { return log('Renderer process crashed!'); });
    mainWindow.webContents.on('did-fail-load', function (_event, errorCode, errorDescription) {
        log('Failed to load: ' + errorCode + ' ' + errorDescription);
    });
    mainWindow.webContents.on('did-finish-load', function () {
        var _a;
        log('Page finished loading');
        if (mainWindow) {
            // getTitleBarOverlayRect may not exist on all Electron versions
            var win = mainWindow;
            var overlayRect = ((_a = win.getTitleBarOverlayRect) === null || _a === void 0 ? void 0 : _a.call(win)) || { x: 0, y: 0, width: 138, height: 38 };
            mainWindow.webContents.send('titlebar-overlay-rect', overlayRect);
        }
    });
    var loadPath = isDev
        ? 'http://localhost:5173'
        : path.join(__dirname, '../dist/index.html');
    log('Loading: ' + loadPath);
    if (isDev) {
        mainWindow.loadURL(loadPath);
    }
    else {
        mainWindow.loadFile(loadPath).catch(function (err) { return log('Error loading file: ' + String(err)); });
    }
    // In production, intercept OAuth redirects
    if (!isDev) {
        mainWindow.webContents.on('will-navigate', function (event, navUrl) {
            if (navUrl.startsWith('http://localhost') && navUrl.includes('access_token')) {
                log('Intercepting OAuth redirect in main window');
                event.preventDefault();
                var url = new URL(navUrl);
                var hashFragment = url.hash || '';
                var queryString = url.search || '';
                var prodPath = path.join(__dirname, '../dist/index.html');
                var normalizedPath = prodPath.replace(/\\/g, '/');
                var fileUrl = "file:///".concat(normalizedPath).concat(queryString).concat(hashFragment);
                mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.loadURL(fileUrl);
            }
        });
    }
    // Keep track of Google auth windows
    var googleAuthWindow = null;
    // Handle popup windows from iframes (like Google sign-in)
    mainWindow.webContents.setWindowOpenHandler(function (_a) {
        var url = _a.url;
        log('[Window] Popup requested: ' + url.substring(0, 100));
        var isGoogleAuth = url.includes('accounts.google.com') ||
            url.includes('google.com/o/oauth2') ||
            url.includes('google.com/signin');
        if (isGoogleAuth) {
            log('[Window] Opening Google auth in Electron window');
            if (googleAuthWindow && !googleAuthWindow.isDestroyed()) {
                googleAuthWindow.close();
            }
            googleAuthWindow = new BrowserWindow({
                width: 500,
                height: 700,
                parent: process.platform === 'darwin' ? undefined : (mainWindow || undefined),
                modal: false,
                show: true,
                title: 'Sign in to Google',
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });
            googleAuthWindow.loadURL(url);
            googleAuthWindow.webContents.on('did-navigate', function (_, navUrl) {
                log('[Window] Auth window navigated to: ' + navUrl.substring(0, 80));
                var isDocumentUrl = navUrl.includes('docs.google.com/document/d/') ||
                    navUrl.includes('docs.google.com/spreadsheets/d/') ||
                    navUrl.includes('docs.google.com/presentation/d/') ||
                    navUrl.includes('docs.google.com/forms/d/') ||
                    navUrl.includes('drive.google.com/file/d/');
                if (isDocumentUrl) {
                    log('[Window] Sign-in complete, closing auth window');
                    if (googleAuthWindow && !googleAuthWindow.isDestroyed()) {
                        googleAuthWindow.close();
                    }
                }
            });
            googleAuthWindow.on('closed', function () {
                log('[Window] Google auth window closed');
                googleAuthWindow = null;
                mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents.send('gdrive:session-authenticated');
                if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.focus();
                }
            });
            return { action: 'deny' };
        }
        log('[Window] Opening in external browser: ' + url.substring(0, 80));
        shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
    // Register all IPC handlers
    registerAllHandlers(mainWindow, {
        restoreMainWindowFocus: restoreMainWindowFocus
    });
    // Create application menu
    createAppMenu(mainWindow, { log: log });
}
// ============================================
// App Lifecycle
// ============================================
app.on('second-instance', function () {
    if (mainWindow) {
        if (mainWindow.isMinimized())
            mainWindow.restore();
        mainWindow.focus();
    }
});
app.whenReady().then(function () {
    // Initialize file-based logging
    initializeLogging();
    // Initialize Sentry for crash reporting
    initSentryMain();
    log('App ready, creating window...');
    createWindow();
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
        else if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
        }
    });
    // Start CLI server in dev mode
    if (isDev || process.env.BLUEPLM_CLI === '1') {
        startCliServer();
    }
}).catch(function (err) {
    logError('Error during app ready', { error: String(err) });
});
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
// ============================================
// External CLI Server (for development/automation)
// ============================================
var CLI_PORT = 31337;
var cliServer = null;
var pendingCliRequests = new Map();
function startCliServer() {
    var _this = this;
    if (cliServer)
        return;
    cliServer = http.createServer(function (req, res) { return __awaiter(_this, void 0, void 0, function () {
        var body;
        var _this = this;
        return __generator(this, function (_a) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Content-Type', 'application/json');
            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return [2 /*return*/];
            }
            if (req.method !== 'POST') {
                res.writeHead(405);
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return [2 /*return*/];
            }
            body = '';
            req.on('data', function (chunk) { body += chunk; });
            req.on('end', function () { return __awaiter(_this, void 0, void 0, function () {
                var command, requestId_1, resultPromise, result, err_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            command = JSON.parse(body).command;
                            if (!command || typeof command !== 'string') {
                                res.writeHead(400);
                                res.end(JSON.stringify({ error: 'Missing command' }));
                                return [2 /*return*/];
                            }
                            log("[CLI Server] Received command: ".concat(command));
                            if (command === 'reload-app' || command === 'restart') {
                                log('[CLI Server] Reloading app...');
                                if (mainWindow) {
                                    mainWindow.webContents.reload();
                                    res.writeHead(200);
                                    res.end(JSON.stringify({ success: true, result: { outputs: [{ type: 'info', content: 'Reloading app...' }] } }));
                                }
                                else {
                                    res.writeHead(503);
                                    res.end(JSON.stringify({ error: 'No window' }));
                                }
                                return [2 /*return*/];
                            }
                            requestId_1 = "cli-".concat(Date.now(), "-").concat(Math.random().toString(36).substr(2, 9));
                            resultPromise = new Promise(function (resolve, reject) {
                                pendingCliRequests.set(requestId_1, { resolve: resolve, reject: reject });
                                setTimeout(function () {
                                    if (pendingCliRequests.has(requestId_1)) {
                                        pendingCliRequests.delete(requestId_1);
                                        reject(new Error('Command timeout'));
                                    }
                                }, 30000);
                            });
                            if (mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.webContents) {
                                mainWindow.webContents.send('cli-command', { requestId: requestId_1, command: command });
                            }
                            else {
                                res.writeHead(503);
                                res.end(JSON.stringify({ error: 'App not ready' }));
                                return [2 /*return*/];
                            }
                            return [4 /*yield*/, resultPromise];
                        case 1:
                            result = _a.sent();
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, result: result }));
                            return [3 /*break*/, 3];
                        case 2:
                            err_1 = _a.sent();
                            log("[CLI Server] Error: ".concat(err_1));
                            res.writeHead(500);
                            res.end(JSON.stringify({ error: String(err_1) }));
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            return [2 /*return*/];
        });
    }); });
    cliServer.listen(CLI_PORT, '127.0.0.1', function () {
        log("[CLI Server] Listening on http://127.0.0.1:".concat(CLI_PORT));
        console.log("\n\uD83D\uDCDF BluePLM CLI Server running on port ".concat(CLI_PORT));
        console.log("   Use: node cli/blueplm.js <command>\n");
    });
    cliServer.on('error', function (err) {
        if (err.code === 'EADDRINUSE') {
            log("[CLI Server] Port ".concat(CLI_PORT, " already in use"));
        }
        else {
            logError('[CLI Server] Error', { error: String(err) });
        }
    });
}
// IPC handler for CLI command responses from renderer
ipcMain.on('cli-response', function (_, _a) {
    var requestId = _a.requestId, result = _a.result;
    var pending = pendingCliRequests.get(requestId);
    if (pending) {
        pendingCliRequests.delete(requestId);
        pending.resolve(result);
    }
});
