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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
// File system handlers for Electron main process
import { ipcMain, shell, dialog, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import chokidar from 'chokidar';
import { exec } from 'child_process';
import { promisify } from 'util';
var execAsync = promisify(exec);
// Module-level state
var mainWindow = null;
var workingDirectory = null;
var fileWatcher = null;
var pendingDeleteOperations = 0;
var deleteWatcherStopPromise = null;
// Hash cache to avoid recomputing hashes for unchanged files
var hashCache = new Map();
// Track delete operations for debugging
var deleteOperationCounter = 0;
// External log function reference (will be set during registration)
var log = console.log;
var logDebug = console.log;
var logError = console.error;
var logWarn = console.warn;
// External thumbnail tracking function reference
var isFileBeingThumbnailed = function () { return false; };
var thumbnailsInProgress = new Set();
// Helper to restore focus to main window after dialogs
var restoreMainWindowFocus = function () { };
// Calculate SHA-256 hash of a file
function hashFileSync(filePath) {
    var fileBuffer = fs.readFileSync(filePath);
    var hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
}
// Helper to recursively copy a directory
function copyDirSync(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    var entries = fs.readdirSync(src, { withFileTypes: true });
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var entry = entries_1[_i];
        var srcPath = path.join(src, entry.name);
        var destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        }
        else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
// Helper to recursively get all files in a directory with relative paths
function getAllFilesInDir(dirPath, _baseFolder) {
    var files = [];
    function walkDir(currentPath) {
        try {
            var items = fs.readdirSync(currentPath, { withFileTypes: true });
            for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
                var item = items_1[_i];
                if (item.name.startsWith('.'))
                    continue;
                var fullPath = path.join(currentPath, item.name);
                if (item.isDirectory()) {
                    walkDir(fullPath);
                }
                else {
                    var stats = fs.statSync(fullPath);
                    var relativePath = path.relative(path.dirname(dirPath), fullPath).replace(/\\/g, '/');
                    files.push({
                        name: item.name,
                        path: fullPath,
                        relativePath: relativePath,
                        extension: path.extname(item.name).toLowerCase(),
                        size: stats.size,
                        modifiedTime: stats.mtime.toISOString()
                    });
                }
            }
        }
        catch (err) {
            log('Error walking directory: ' + String(err));
        }
    }
    walkDir(dirPath);
    return files;
}
// Try to find what process has a file locked using Windows commands
function findLockingProcess(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var fileName, _i, _a, handleExe, stdout, lines, _b, psCommand, stdout, processes, procList, procInfo, e_1, dir, baseName, tempFile, fd, nodeErr, err_1;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    fileName = path.basename(filePath);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 11, , 12]);
                    _i = 0, _a = ['handle64.exe', 'handle.exe'];
                    _c.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 7];
                    handleExe = _a[_i];
                    _c.label = 3;
                case 3:
                    _c.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, execAsync("".concat(handleExe, " -accepteula \"").concat(fileName, "\" 2>nul"), { timeout: 5000 })];
                case 4:
                    stdout = (_c.sent()).stdout;
                    if (stdout && stdout.trim() && !stdout.includes('No matching handles found')) {
                        lines = stdout.split('\n').filter(function (l) { return l.includes(fileName) || l.match(/^\w+\.exe/i); });
                        if (lines.length > 0) {
                            log("[LockDetect] ".concat(handleExe, " output:\n").concat(stdout.trim()));
                            return [2 /*return*/, "".concat(handleExe, ": ").concat(lines.slice(0, 3).join(' | '))];
                        }
                    }
                    return [3 /*break*/, 6];
                case 5:
                    _b = _c.sent();
                    return [3 /*break*/, 6];
                case 6:
                    _i++;
                    return [3 /*break*/, 2];
                case 7:
                    _c.trys.push([7, 9, , 10]);
                    psCommand = "Get-Process | Where-Object { $_.Path -like '*SolidWorks*' -or $_.ProcessName -like '*SLDWORKS*' -or $_.ProcessName -like '*explorer*' } | Select-Object ProcessName, Id | ConvertTo-Json";
                    return [4 /*yield*/, execAsync("powershell -Command \"".concat(psCommand, "\""), { timeout: 5000 })];
                case 8:
                    stdout = (_c.sent()).stdout;
                    if (stdout && stdout.trim()) {
                        processes = JSON.parse(stdout);
                        procList = Array.isArray(processes) ? processes : [processes];
                        if (procList.length > 0) {
                            procInfo = procList.map(function (p) { return "".concat(p.ProcessName, "(").concat(p.Id, ")"); }).join(', ');
                            log("[LockDetect] Potential locking processes: ".concat(procInfo));
                            return [2 /*return*/, "Potential: ".concat(procInfo)];
                        }
                    }
                    return [3 /*break*/, 10];
                case 9:
                    e_1 = _c.sent();
                    log("[LockDetect] PowerShell check failed: ".concat(e_1));
                    return [3 /*break*/, 10];
                case 10:
                    dir = path.dirname(filePath);
                    baseName = path.basename(filePath, path.extname(filePath));
                    tempFile = path.join(dir, "~$".concat(baseName).concat(path.extname(filePath)));
                    if (fs.existsSync(tempFile)) {
                        log("[LockDetect] Found SolidWorks temp file: ".concat(tempFile));
                        return [2 /*return*/, "SolidWorks temp file exists: ~$".concat(fileName, " (file is open in SolidWorks)")];
                    }
                    // Method 4: Try to open the file exclusively
                    try {
                        fd = fs.openSync(filePath, fs.constants.O_RDWR | fs.constants.O_EXCL);
                        fs.closeSync(fd);
                        log("[LockDetect] File is NOT locked (opened successfully)");
                        return [2 /*return*/, null];
                    }
                    catch (openErr) {
                        nodeErr = openErr;
                        if (nodeErr.code === 'EBUSY' || nodeErr.code === 'EACCES') {
                            log("[LockDetect] Confirmed file is locked: ".concat(nodeErr.code));
                            return [2 /*return*/, "File is locked (".concat(nodeErr.code, ") but process unknown")];
                        }
                    }
                    return [2 /*return*/, null];
                case 11:
                    err_1 = _c.sent();
                    log("[LockDetect] Detection failed: ".concat(err_1));
                    return [2 /*return*/, null];
                case 12: return [2 /*return*/];
            }
        });
    });
}
// Stop file watcher
function stopFileWatcher() {
    return __awaiter(this, void 0, void 0, function () {
        var watcher;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!fileWatcher) return [3 /*break*/, 2];
                    log('Stopping file watcher');
                    watcher = fileWatcher;
                    fileWatcher = null;
                    return [4 /*yield*/, watcher.close()];
                case 1:
                    _a.sent();
                    log('File watcher closed');
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
// File watcher for detecting external changes
function startFileWatcher(dirPath) {
    stopFileWatcher();
    log('Starting file watcher for: ' + dirPath);
    var debounceTimer = null;
    var changedFiles = new Set();
    fileWatcher = chokidar.watch(dirPath, {
        persistent: true,
        ignoreInitial: true,
        usePolling: false,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        },
        ignorePermissionErrors: true,
        ignored: [
            /(^|[\/\\])\../,
            /node_modules/,
            /\.git/,
            /desktop\.ini/i,
            /thumbs\.db/i,
            /\$RECYCLE\.BIN/i,
            /System Volume Information/i,
            /~\$/,
            /\.tmp$/i,
            /\.swp$/i
        ]
    });
    var notifyChanges = function () {
        if (changedFiles.size > 0 && mainWindow) {
            var files = Array.from(changedFiles);
            changedFiles.clear();
            log('File changes detected: ' + files.length + ' files');
            mainWindow.webContents.send('files-changed', files);
        }
        debounceTimer = null;
    };
    var handleChange = function (filePath) {
        var relativePath = path.relative(dirPath, filePath).replace(/\\/g, '/');
        changedFiles.add(relativePath);
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        var delay = changedFiles.size > 10 ? 2000 : 1000;
        debounceTimer = setTimeout(notifyChanges, delay);
    };
    fileWatcher.on('change', handleChange);
    fileWatcher.on('add', handleChange);
    fileWatcher.on('unlink', handleChange);
    fileWatcher.on('error', function (error) {
        var err = error;
        if (err.code === 'EPERM' || err.code === 'EACCES') {
            return;
        }
        log('File watcher error: ' + String(error));
    });
}
// Native file drag icon
var DRAG_ICON = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABjSURBVFhH7c0xDQAgDAXQskKxgBUsYAErWMECFv7OwEImXEOTN/wdPwEAAAAAAACU7F0z27sZuweeAAAAAAAAlOzdM9u7GbsHngAAAAAAAJTs3TPbuxm7B56AAAAAgF9mZgO0VARYFxh/1QAAAABJRU5ErkJggg==');
// Export getters for module state
export function getWorkingDirectory() {
    return workingDirectory;
}
export function setWorkingDirectoryExternal(dir) {
    workingDirectory = dir;
}
export function clearHashCache() {
    hashCache.clear();
}
export function registerFsHandlers(window, deps) {
    var _this = this;
    mainWindow = window;
    log = deps.log;
    logDebug = deps.logDebug;
    logError = deps.logError;
    logWarn = deps.logWarn;
    isFileBeingThumbnailed = deps.isFileBeingThumbnailed;
    thumbnailsInProgress = deps.thumbnailsInProgress;
    restoreMainWindowFocus = deps.restoreMainWindowFocus;
    // Working directory handlers
    ipcMain.handle('working-dir:select', function () { return __awaiter(_this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dialog.showOpenDialog(mainWindow, {
                        title: 'Select Working Directory',
                        properties: ['openDirectory', 'createDirectory']
                    })];
                case 1:
                    result = _a.sent();
                    restoreMainWindowFocus();
                    if (!result.canceled && result.filePaths.length > 0) {
                        workingDirectory = result.filePaths[0];
                        hashCache.clear();
                        log('Working directory set: ' + workingDirectory);
                        startFileWatcher(workingDirectory);
                        return [2 /*return*/, { success: true, path: workingDirectory }];
                    }
                    return [2 /*return*/, { success: false, canceled: true }];
            }
        });
    }); });
    ipcMain.handle('working-dir:get', function () { return workingDirectory; });
    ipcMain.handle('working-dir:clear', function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    log('Clearing working directory and stopping file watcher');
                    return [4 /*yield*/, stopFileWatcher()];
                case 1:
                    _a.sent();
                    workingDirectory = null;
                    hashCache.clear();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); });
    ipcMain.handle('working-dir:set', function (_, newPath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (fs.existsSync(newPath)) {
                workingDirectory = newPath;
                hashCache.clear();
                startFileWatcher(newPath);
                return [2 /*return*/, { success: true, path: workingDirectory }];
            }
            return [2 /*return*/, { success: false, error: 'Path does not exist' }];
        });
    }); });
    ipcMain.handle('working-dir:create', function (_, newPath) { return __awaiter(_this, void 0, void 0, function () {
        var expandedPath, os;
        return __generator(this, function (_a) {
            try {
                expandedPath = newPath;
                if (newPath.startsWith('~')) {
                    os = require('os');
                    expandedPath = newPath.replace(/^~/, os.homedir());
                }
                if (!fs.existsSync(expandedPath)) {
                    fs.mkdirSync(expandedPath, { recursive: true });
                    log('Created working directory: ' + expandedPath);
                }
                workingDirectory = expandedPath;
                hashCache.clear();
                startFileWatcher(expandedPath);
                return [2 /*return*/, { success: true, path: workingDirectory }];
            }
            catch (err) {
                log('Error creating working directory: ' + String(err));
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    // File read/write handlers
    ipcMain.handle('fs:read-file', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        var data, hash;
        return __generator(this, function (_a) {
            try {
                data = fs.readFileSync(filePath);
                hash = crypto.createHash('sha256').update(data).digest('hex');
                return [2 /*return*/, {
                        success: true,
                        data: data.toString('base64'),
                        size: data.length,
                        hash: hash
                    }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('fs:write-file', function (_, filePath, base64Data) { return __awaiter(_this, void 0, void 0, function () {
        var buffer, dir, nodeErr, hash, nodeErr, errorMsg;
        return __generator(this, function (_a) {
            logDebug('Writing file', { filePath: filePath, dataLength: base64Data === null || base64Data === void 0 ? void 0 : base64Data.length });
            try {
                if (!filePath) {
                    logError('Write file: missing file path');
                    return [2 /*return*/, { success: false, error: 'Missing file path' }];
                }
                if (!base64Data) {
                    logError('Write file: missing data', { filePath: filePath });
                    return [2 /*return*/, { success: false, error: 'Missing file data' }];
                }
                buffer = Buffer.from(base64Data, 'base64');
                logDebug('Decoded buffer', { filePath: filePath, bufferSize: buffer.length });
                dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    logDebug('Creating parent directory', { dir: dir });
                    try {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    catch (mkdirErr) {
                        nodeErr = mkdirErr;
                        logError('Failed to create parent directory', {
                            dir: dir,
                            error: String(mkdirErr),
                            code: nodeErr.code
                        });
                        return [2 /*return*/, { success: false, error: "Failed to create directory: ".concat(mkdirErr) }];
                    }
                }
                try {
                    fs.accessSync(dir, fs.constants.W_OK);
                }
                catch (_b) {
                    logError('No write permission', { dir: dir, filePath: filePath });
                    return [2 /*return*/, { success: false, error: "No write permission to directory: ".concat(dir) }];
                }
                fs.writeFileSync(filePath, buffer);
                hash = crypto.createHash('sha256').update(buffer).digest('hex');
                logDebug('File written successfully', {
                    filePath: filePath,
                    size: buffer.length,
                    hash: hash.substring(0, 12) + '...'
                });
                return [2 /*return*/, { success: true, hash: hash, size: buffer.length }];
            }
            catch (err) {
                nodeErr = err;
                logError('Write file error', {
                    filePath: filePath,
                    error: String(err),
                    code: nodeErr.code,
                    syscall: nodeErr.syscall
                });
                errorMsg = String(err);
                if (nodeErr.code === 'EACCES' || nodeErr.code === 'EPERM') {
                    errorMsg = "Permission denied: Cannot write to ".concat(filePath);
                }
                else if (nodeErr.code === 'ENOSPC') {
                    errorMsg = "Disk full: Not enough space to write file";
                }
                else if (nodeErr.code === 'EROFS') {
                    errorMsg = "Read-only file system: Cannot write files";
                }
                else if (nodeErr.code === 'EBUSY') {
                    errorMsg = "File is busy/locked: ".concat(filePath);
                }
                else if (nodeErr.code === 'ENAMETOOLONG') {
                    errorMsg = "Path too long: ".concat(filePath.length, " characters");
                }
                return [2 /*return*/, { success: false, error: errorMsg }];
            }
            return [2 /*return*/];
        });
    }); });
    // Download file directly in main process
    ipcMain.handle('fs:download-url', function (event, url, destPath) { return __awaiter(_this, void 0, void 0, function () {
        var operationId, startTime, dir, https_1, http_1, client_1, REQUEST_TIMEOUT_MS_1, err_2, duration;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    operationId = "dl-".concat(Date.now());
                    startTime = Date.now();
                    logDebug("[".concat(operationId, "] Starting download"), {
                        destPath: destPath,
                        urlLength: url === null || url === void 0 ? void 0 : url.length,
                        urlPrefix: (url === null || url === void 0 ? void 0 : url.substring(0, 80)) + '...'
                    });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    if (!url) {
                        logError("[".concat(operationId, "] Missing URL parameter"));
                        return [2 /*return*/, { success: false, error: 'Missing URL parameter' }];
                    }
                    if (!destPath) {
                        logError("[".concat(operationId, "] Missing destination path parameter"));
                        return [2 /*return*/, { success: false, error: 'Missing destination path parameter' }];
                    }
                    dir = path.dirname(destPath);
                    logDebug("[".concat(operationId, "] Ensuring directory exists"), { dir: dir });
                    if (!fs.existsSync(dir)) {
                        try {
                            fs.mkdirSync(dir, { recursive: true });
                            logDebug("[".concat(operationId, "] Created directory"), { dir: dir });
                        }
                        catch (mkdirErr) {
                            logError("[".concat(operationId, "] Failed to create directory"), {
                                dir: dir,
                                error: String(mkdirErr),
                                code: mkdirErr.code
                            });
                            return [2 /*return*/, { success: false, error: "Failed to create directory: ".concat(mkdirErr) }];
                        }
                    }
                    try {
                        fs.accessSync(dir, fs.constants.W_OK);
                    }
                    catch (accessErr) {
                        logError("[".concat(operationId, "] No write permission to directory"), {
                            dir: dir,
                            error: String(accessErr),
                            code: accessErr.code
                        });
                        return [2 /*return*/, { success: false, error: "No write permission to directory: ".concat(dir) }];
                    }
                    return [4 /*yield*/, import('https')];
                case 2:
                    https_1 = _a.sent();
                    return [4 /*yield*/, import('http')];
                case 3:
                    http_1 = _a.sent();
                    client_1 = url.startsWith('https') ? https_1 : http_1;
                    REQUEST_TIMEOUT_MS_1 = 120000;
                    return [2 /*return*/, new Promise(function (resolve) {
                            logDebug("[".concat(operationId, "] Initiating HTTP request"), { timeoutMs: REQUEST_TIMEOUT_MS_1 });
                            var request = client_1.get(url, { timeout: REQUEST_TIMEOUT_MS_1 }, function (response) {
                                logDebug("[".concat(operationId, "] Got response"), {
                                    statusCode: response.statusCode,
                                    statusMessage: response.statusMessage,
                                    headers: {
                                        contentLength: response.headers['content-length'],
                                        contentType: response.headers['content-type']
                                    }
                                });
                                if (response.statusCode === 301 || response.statusCode === 302) {
                                    var redirectUrl = response.headers.location;
                                    logDebug("[".concat(operationId, "] Following redirect"), { redirectUrl: redirectUrl === null || redirectUrl === void 0 ? void 0 : redirectUrl.substring(0, 80) });
                                    if (redirectUrl) {
                                        var redirectClient = redirectUrl.startsWith('https') ? https_1 : http_1;
                                        var redirectRequest_1 = redirectClient.get(redirectUrl, { timeout: REQUEST_TIMEOUT_MS_1 }, function (redirectResponse) {
                                            logDebug("[".concat(operationId, "] Redirect response"), {
                                                statusCode: redirectResponse.statusCode,
                                                statusMessage: redirectResponse.statusMessage
                                            });
                                            handleResponse(redirectResponse);
                                        });
                                        redirectRequest_1.on('error', function (err) {
                                            logError("[".concat(operationId, "] Redirect request error"), {
                                                error: String(err),
                                                code: err.code
                                            });
                                            resolve({ success: false, error: "Redirect failed: ".concat(err) });
                                        });
                                        redirectRequest_1.on('timeout', function () {
                                            logError("[".concat(operationId, "] Redirect request timeout"));
                                            redirectRequest_1.destroy();
                                            resolve({ success: false, error: 'Request timed out (during redirect)' });
                                        });
                                        return;
                                    }
                                }
                                handleResponse(response);
                            });
                            request.on('error', function (err) {
                                var nodeErr = err;
                                logError("[".concat(operationId, "] HTTP request error"), {
                                    error: String(err),
                                    code: nodeErr.code,
                                    syscall: nodeErr.syscall,
                                    hostname: nodeErr.hostname
                                });
                                var errorMsg = String(err);
                                if (nodeErr.code === 'ENOTFOUND') {
                                    errorMsg = "Network error: Could not reach server. Check your internet connection.";
                                }
                                else if (nodeErr.code === 'ECONNREFUSED') {
                                    errorMsg = "Connection refused by server.";
                                }
                                else if (nodeErr.code === 'ETIMEDOUT') {
                                    errorMsg = "Connection timed out. The server may be slow or unreachable.";
                                }
                                else if (nodeErr.code === 'ECONNRESET') {
                                    errorMsg = "Connection reset. The download was interrupted.";
                                }
                                resolve({ success: false, error: errorMsg });
                            });
                            request.on('timeout', function () {
                                logError("[".concat(operationId, "] Request timeout"));
                                request.destroy();
                                resolve({ success: false, error: 'Request timed out' });
                            });
                            function handleResponse(response) {
                                if (response.statusCode !== 200) {
                                    logError("[".concat(operationId, "] HTTP error status"), {
                                        statusCode: response.statusCode,
                                        statusMessage: response.statusMessage,
                                        headers: response.headers
                                    });
                                    var errorMsg = "HTTP ".concat(response.statusCode, ": ").concat(response.statusMessage || 'Unknown error');
                                    if (response.statusCode === 404) {
                                        errorMsg = "File not found on server (HTTP 404). The download URL may have expired.";
                                    }
                                    else if (response.statusCode === 403) {
                                        errorMsg = "Access denied (HTTP 403). The download URL may have expired or you don't have permission.";
                                    }
                                    else if (response.statusCode === 500) {
                                        errorMsg = "Server error (HTTP 500). Please try again later.";
                                    }
                                    else if (response.statusCode === 503) {
                                        errorMsg = "Service unavailable (HTTP 503). The server may be overloaded.";
                                    }
                                    resolve({ success: false, error: errorMsg });
                                    return;
                                }
                                var contentLength = parseInt(response.headers['content-length'] || '0', 10);
                                logDebug("[".concat(operationId, "] Starting file write"), {
                                    destPath: destPath,
                                    contentLength: contentLength,
                                    contentType: response.headers['content-type']
                                });
                                var writeStream;
                                try {
                                    writeStream = fs.createWriteStream(destPath);
                                }
                                catch (createErr) {
                                    logError("[".concat(operationId, "] Failed to create write stream"), {
                                        destPath: destPath,
                                        error: String(createErr),
                                        code: createErr.code
                                    });
                                    resolve({ success: false, error: "Failed to create file: ".concat(createErr) });
                                    return;
                                }
                                var hashStream = crypto.createHash('sha256');
                                var downloaded = 0;
                                var lastProgressTime = Date.now();
                                var lastDownloaded = 0;
                                response.on('data', function (chunk) {
                                    downloaded += chunk.length;
                                    hashStream.update(chunk);
                                    var now = Date.now();
                                    if (now - lastProgressTime >= 100) {
                                        var bytesSinceLast = downloaded - lastDownloaded;
                                        var timeSinceLast = (now - lastProgressTime) / 1000;
                                        var speed = timeSinceLast > 0 ? bytesSinceLast / timeSinceLast : 0;
                                        event.sender.send('download-progress', {
                                            loaded: downloaded,
                                            total: contentLength,
                                            speed: speed
                                        });
                                        lastProgressTime = now;
                                        lastDownloaded = downloaded;
                                    }
                                });
                                response.on('error', function (err) {
                                    logError("[".concat(operationId, "] Response stream error"), {
                                        error: String(err),
                                        downloaded: downloaded,
                                        contentLength: contentLength
                                    });
                                    writeStream.destroy();
                                    try {
                                        fs.unlinkSync(destPath);
                                    }
                                    catch (_a) { }
                                    resolve({ success: false, error: "Download stream error: ".concat(err) });
                                });
                                response.pipe(writeStream);
                                writeStream.on('finish', function () {
                                    var hash = hashStream.digest('hex');
                                    var duration = Date.now() - startTime;
                                    log("[".concat(operationId, "] Download complete"), {
                                        destPath: destPath,
                                        size: downloaded,
                                        hash: hash.substring(0, 12) + '...',
                                        duration: duration,
                                        speedMBps: (downloaded / 1024 / 1024 / (duration / 1000)).toFixed(2)
                                    });
                                    resolve({ success: true, hash: hash, size: downloaded });
                                });
                                writeStream.on('error', function (err) {
                                    var nodeErr = err;
                                    logError("[".concat(operationId, "] Write stream error"), {
                                        destPath: destPath,
                                        error: String(err),
                                        code: nodeErr.code,
                                        downloaded: downloaded,
                                        contentLength: contentLength
                                    });
                                    var errorMsg = "Failed to write file: ".concat(err);
                                    if (nodeErr.code === 'ENOSPC') {
                                        errorMsg = "Disk full: Not enough space to save the file.";
                                    }
                                    else if (nodeErr.code === 'EACCES' || nodeErr.code === 'EPERM') {
                                        errorMsg = "Permission denied: Cannot write to ".concat(destPath);
                                    }
                                    else if (nodeErr.code === 'EROFS') {
                                        errorMsg = "Read-only file system: Cannot write files.";
                                    }
                                    try {
                                        fs.unlinkSync(destPath);
                                    }
                                    catch (_a) { }
                                    resolve({ success: false, error: errorMsg });
                                });
                            }
                        })];
                case 4:
                    err_2 = _a.sent();
                    duration = Date.now() - startTime;
                    logError("[".concat(operationId, "] Download exception"), {
                        destPath: destPath,
                        error: String(err_2),
                        stack: err_2.stack,
                        duration: duration
                    });
                    return [2 /*return*/, { success: false, error: "Download failed: ".concat(err_2) }];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('fs:file-exists', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, fs.existsSync(filePath)];
        });
    }); });
    ipcMain.handle('fs:get-hash', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        var hash;
        return __generator(this, function (_a) {
            try {
                hash = hashFileSync(filePath);
                return [2 /*return*/, { success: true, hash: hash }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    // List files from any directory
    ipcMain.handle('fs:list-dir-files', function (_, dirPath) { return __awaiter(_this, void 0, void 0, function () {
        function walkDir(dir, baseDir) {
            try {
                var items = fs.readdirSync(dir, { withFileTypes: true });
                for (var _i = 0, items_2 = items; _i < items_2.length; _i++) {
                    var item = items_2[_i];
                    if (item.name.startsWith('.'))
                        continue;
                    var fullPath = path.join(dir, item.name);
                    var relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
                    var stats = fs.statSync(fullPath);
                    if (item.isDirectory()) {
                        files.push({
                            name: item.name,
                            path: fullPath,
                            relativePath: relativePath,
                            isDirectory: true,
                            extension: '',
                            size: 0,
                            modifiedTime: stats.mtime.toISOString()
                        });
                        walkDir(fullPath, baseDir);
                    }
                    else {
                        var fileHash = void 0;
                        try {
                            var fileData = fs.readFileSync(fullPath);
                            fileHash = crypto.createHash('sha256').update(fileData).digest('hex');
                        }
                        catch (_a) {
                            // Skip hash if file can't be read
                        }
                        files.push({
                            name: item.name,
                            path: fullPath,
                            relativePath: relativePath,
                            isDirectory: false,
                            extension: path.extname(item.name).toLowerCase(),
                            size: stats.size,
                            modifiedTime: stats.mtime.toISOString(),
                            hash: fileHash
                        });
                    }
                }
            }
            catch (err) {
                log('Error reading directory: ' + String(err));
            }
        }
        var files;
        return __generator(this, function (_a) {
            if (!dirPath || !fs.existsSync(dirPath)) {
                return [2 /*return*/, { success: false, error: 'Directory does not exist' }];
            }
            files = [];
            walkDir(dirPath, dirPath);
            files.sort(function (a, b) {
                if (a.isDirectory && !b.isDirectory)
                    return -1;
                if (!a.isDirectory && b.isDirectory)
                    return 1;
                return a.relativePath.localeCompare(b.relativePath);
            });
            return [2 /*return*/, { success: true, files: files }];
        });
    }); });
    // Fast file listing - no hash computation
    ipcMain.handle('fs:list-working-files', function () { return __awaiter(_this, void 0, void 0, function () {
        function walkDir(dir, baseDir) {
            try {
                var items = fs.readdirSync(dir, { withFileTypes: true });
                for (var _i = 0, items_3 = items; _i < items_3.length; _i++) {
                    var item = items_3[_i];
                    if (item.name.startsWith('.'))
                        continue;
                    var fullPath = path.join(dir, item.name);
                    var relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
                    var stats = fs.statSync(fullPath);
                    if (item.isDirectory()) {
                        files.push({
                            name: item.name,
                            path: fullPath,
                            relativePath: relativePath,
                            isDirectory: true,
                            extension: '',
                            size: 0,
                            modifiedTime: stats.mtime.toISOString()
                        });
                        walkDir(fullPath, baseDir);
                    }
                    else {
                        seenPaths.add(relativePath);
                        var fileHash = void 0;
                        var cached = hashCache.get(relativePath);
                        var mtimeMs = stats.mtime.getTime();
                        if (cached && cached.size === stats.size && cached.mtime === mtimeMs) {
                            fileHash = cached.hash;
                        }
                        files.push({
                            name: item.name,
                            path: fullPath,
                            relativePath: relativePath,
                            isDirectory: false,
                            extension: path.extname(item.name).toLowerCase(),
                            size: stats.size,
                            modifiedTime: stats.mtime.toISOString(),
                            hash: fileHash
                        });
                    }
                }
            }
            catch (err) {
                log('Error reading directory: ' + String(err));
            }
        }
        var files, seenPaths;
        return __generator(this, function (_a) {
            if (!workingDirectory) {
                return [2 /*return*/, { success: false, error: 'No working directory set' }];
            }
            files = [];
            seenPaths = new Set();
            walkDir(workingDirectory, workingDirectory);
            // Clean up cache entries for files that no longer exist
            Array.from(hashCache.keys()).forEach(function (cachedPath) {
                if (!seenPaths.has(cachedPath)) {
                    hashCache.delete(cachedPath);
                }
            });
            files.sort(function (a, b) {
                if (a.isDirectory && !b.isDirectory)
                    return -1;
                if (!a.isDirectory && b.isDirectory)
                    return 1;
                return a.relativePath.localeCompare(b.relativePath);
            });
            return [2 /*return*/, { success: true, files: files }];
        });
    }); });
    // Compute hashes for files in batches
    ipcMain.handle('fs:compute-file-hashes', function (event, filePaths) { return __awaiter(_this, void 0, void 0, function () {
        var results, batchSize, processed, total, i, batch, _i, batch_1, file, cached, fileData, hash, percent;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!workingDirectory) {
                        return [2 /*return*/, { success: false, error: 'No working directory set' }];
                    }
                    results = [];
                    batchSize = 20;
                    processed = 0;
                    total = filePaths.length;
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < filePaths.length)) return [3 /*break*/, 4];
                    batch = filePaths.slice(i, i + batchSize);
                    for (_i = 0, batch_1 = batch; _i < batch_1.length; _i++) {
                        file = batch_1[_i];
                        try {
                            cached = hashCache.get(file.relativePath);
                            if (cached && cached.size === file.size && cached.mtime === file.mtime) {
                                results.push({ relativePath: file.relativePath, hash: cached.hash });
                                processed++;
                                continue;
                            }
                            fileData = fs.readFileSync(file.path);
                            hash = crypto.createHash('sha256').update(fileData).digest('hex');
                            hashCache.set(file.relativePath, { size: file.size, mtime: file.mtime, hash: hash });
                            results.push({ relativePath: file.relativePath, hash: hash });
                            processed++;
                        }
                        catch (_b) {
                            hashCache.delete(file.relativePath);
                            processed++;
                        }
                    }
                    percent = Math.round((processed / total) * 100);
                    event.sender.send('hash-progress', { processed: processed, total: total, percent: percent });
                    return [4 /*yield*/, new Promise(function (resolve) { return setImmediate(resolve); })];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    i += batchSize;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, { success: true, results: results }];
            }
        });
    }); });
    ipcMain.handle('fs:create-folder', function (_, folderPath) { return __awaiter(_this, void 0, void 0, function () {
        var stats, nodeErr, errorMsg;
        return __generator(this, function (_a) {
            logDebug('Creating folder', { folderPath: folderPath });
            try {
                if (!folderPath) {
                    logError('Create folder: missing path parameter');
                    return [2 /*return*/, { success: false, error: 'Missing folder path' }];
                }
                if (fs.existsSync(folderPath)) {
                    stats = fs.statSync(folderPath);
                    if (stats.isDirectory()) {
                        logDebug('Folder already exists', { folderPath: folderPath });
                        return [2 /*return*/, { success: true }];
                    }
                    else {
                        logError('Path exists but is not a directory', { folderPath: folderPath });
                        return [2 /*return*/, { success: false, error: 'Path exists but is not a directory' }];
                    }
                }
                fs.mkdirSync(folderPath, { recursive: true });
                logDebug('Folder created successfully', { folderPath: folderPath });
                return [2 /*return*/, { success: true }];
            }
            catch (err) {
                nodeErr = err;
                logError('Failed to create folder', {
                    folderPath: folderPath,
                    error: String(err),
                    code: nodeErr.code,
                    syscall: nodeErr.syscall
                });
                errorMsg = String(err);
                if (nodeErr.code === 'EACCES' || nodeErr.code === 'EPERM') {
                    errorMsg = "Permission denied: Cannot create folder at ".concat(folderPath);
                }
                else if (nodeErr.code === 'ENOSPC') {
                    errorMsg = "Disk full: Cannot create folder";
                }
                else if (nodeErr.code === 'ENOENT') {
                    errorMsg = "Invalid path: Parent directory does not exist";
                }
                else if (nodeErr.code === 'ENAMETOOLONG') {
                    errorMsg = "Path too long: ".concat(folderPath.length, " characters");
                }
                else if (nodeErr.code === 'EROFS') {
                    errorMsg = "Read-only file system: Cannot create folders";
                }
                return [2 /*return*/, { success: false, error: errorMsg }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('fs:is-dir-empty', function (_, dirPath) { return __awaiter(_this, void 0, void 0, function () {
        var stat, entries;
        return __generator(this, function (_a) {
            try {
                if (!fs.existsSync(dirPath)) {
                    return [2 /*return*/, { success: false, error: 'Directory does not exist' }];
                }
                stat = fs.statSync(dirPath);
                if (!stat.isDirectory()) {
                    return [2 /*return*/, { success: false, error: 'Path is not a directory' }];
                }
                entries = fs.readdirSync(dirPath);
                return [2 /*return*/, { success: true, empty: entries.length === 0 }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('fs:delete', function (_, targetPath) { return __awaiter(_this, void 0, void 0, function () {
        var deleteStartTime, fileName, deleteOpId, preStats, needsWatcherPause, watcherStopStart_1, attemptDelete, stats, isFile, result, totalTime, err_3, errStr, errorMsg, fileName_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    deleteStartTime = Date.now();
                    fileName = path.basename(targetPath);
                    deleteOpId = ++deleteOperationCounter;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 10, , 11]);
                    log("[Delete #".concat(deleteOpId, "] START: ").concat(fileName));
                    log("[Delete #".concat(deleteOpId, "] Full path: ").concat(targetPath));
                    if (!fs.existsSync(targetPath)) {
                        log("[Delete #".concat(deleteOpId, "] Path does not exist: ").concat(targetPath));
                        return [2 /*return*/, { success: false, error: 'Path does not exist' }];
                    }
                    try {
                        preStats = fs.statSync(targetPath);
                        log("[Delete #".concat(deleteOpId, "] File stats - size: ").concat(preStats.size, ", mode: ").concat(preStats.mode.toString(8), ", isFile: ").concat(preStats.isFile()));
                    }
                    catch (e) {
                        log("[Delete #".concat(deleteOpId, "] Could not stat file: ").concat(e));
                    }
                    if (!isFileBeingThumbnailed(targetPath)) return [3 /*break*/, 3];
                    log("[Delete #".concat(deleteOpId, "] WARNING: File is currently being thumbnailed! Waiting 200ms..."));
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 200); })];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    if (thumbnailsInProgress.size > 0) {
                        log("[Delete #".concat(deleteOpId, "] Files currently being thumbnailed: ").concat(Array.from(thumbnailsInProgress).map(function (p) { return path.basename(p); }).join(', ')));
                    }
                    needsWatcherPause = workingDirectory && (targetPath === workingDirectory ||
                        workingDirectory.startsWith(targetPath) ||
                        targetPath.startsWith(workingDirectory));
                    log("[Delete #".concat(deleteOpId, "] Needs watcher pause: ").concat(needsWatcherPause, ", workingDirectory: ").concat(workingDirectory));
                    if (!needsWatcherPause) return [3 /*break*/, 5];
                    pendingDeleteOperations++;
                    log("[Delete #".concat(deleteOpId, "] Pending delete ops: ").concat(pendingDeleteOperations, ", fileWatcher exists: ").concat(!!fileWatcher));
                    if (pendingDeleteOperations === 1) {
                        log("[Delete #".concat(deleteOpId, "] First delete op - stopping file watcher..."));
                        watcherStopStart_1 = Date.now();
                        deleteWatcherStopPromise = (function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, stopFileWatcher()];
                                    case 1:
                                        _a.sent();
                                        log("[Delete] File watcher stopped in ".concat(Date.now() - watcherStopStart_1, "ms"));
                                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 100); })];
                                    case 2:
                                        _a.sent();
                                        log("[Delete] Buffer wait complete, total watcher stop time: ".concat(Date.now() - watcherStopStart_1, "ms"));
                                        return [2 /*return*/];
                                }
                            });
                        }); })();
                    }
                    if (!deleteWatcherStopPromise) return [3 /*break*/, 5];
                    log("[Delete #".concat(deleteOpId, "] Waiting for watcher stop promise..."));
                    return [4 /*yield*/, deleteWatcherStopPromise];
                case 4:
                    _a.sent();
                    log("[Delete #".concat(deleteOpId, "] Watcher stop promise resolved"));
                    _a.label = 5;
                case 5:
                    attemptDelete = function (filePath_1, isFile_1) {
                        var args_1 = [];
                        for (var _i = 2; _i < arguments.length; _i++) {
                            args_1[_i - 2] = arguments[_i];
                        }
                        return __awaiter(_this, __spreadArray([filePath_1, isFile_1], args_1, true), void 0, function (filePath, isFile, retries) {
                            var _loop_1, attempt, state_1;
                            if (retries === void 0) { retries = 3; }
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _loop_1 = function (attempt) {
                                            var trashErr_1, deleteErr_1, errStr, isLocked, lockInfo, delay_1;
                                            return __generator(this, function (_b) {
                                                switch (_b.label) {
                                                    case 0:
                                                        log("[Delete #".concat(deleteOpId, "] Attempt ").concat(attempt, "/").concat(retries, " for: ").concat(fileName));
                                                        _b.label = 1;
                                                    case 1:
                                                        _b.trys.push([1, 3, , 11]);
                                                        log("[Delete #".concat(deleteOpId, "] Trying shell.trashItem..."));
                                                        return [4 /*yield*/, shell.trashItem(filePath)];
                                                    case 2:
                                                        _b.sent();
                                                        log("[Delete #".concat(deleteOpId, "] SUCCESS via Recycle Bin: ").concat(fileName, " (attempt ").concat(attempt, ")"));
                                                        return [2 /*return*/, { value: { success: true } }];
                                                    case 3:
                                                        trashErr_1 = _b.sent();
                                                        log("[Delete #".concat(deleteOpId, "] shell.trashItem failed: ").concat(trashErr_1));
                                                        _b.label = 4;
                                                    case 4:
                                                        _b.trys.push([4, 5, , 10]);
                                                        log("[Delete #".concat(deleteOpId, "] Trying fs.").concat(isFile ? 'unlinkSync' : 'rmSync', "..."));
                                                        if (isFile) {
                                                            fs.unlinkSync(filePath);
                                                        }
                                                        else {
                                                            fs.rmSync(filePath, { recursive: true, force: true });
                                                        }
                                                        log("[Delete #".concat(deleteOpId, "] SUCCESS via fs delete: ").concat(fileName, " (attempt ").concat(attempt, ")"));
                                                        return [2 /*return*/, { value: { success: true } }];
                                                    case 5:
                                                        deleteErr_1 = _b.sent();
                                                        errStr = String(deleteErr_1);
                                                        isLocked = errStr.includes('EBUSY') || errStr.includes('resource busy');
                                                        log("[Delete #".concat(deleteOpId, "] fs delete failed: ").concat(errStr));
                                                        log("[Delete #".concat(deleteOpId, "] Is locked (EBUSY): ").concat(isLocked));
                                                        if (!isLocked) return [3 /*break*/, 7];
                                                        log("[Delete #".concat(deleteOpId, "] Attempting to detect locking process..."));
                                                        return [4 /*yield*/, findLockingProcess(filePath)];
                                                    case 6:
                                                        lockInfo = _b.sent();
                                                        if (lockInfo) {
                                                            log("[Delete #".concat(deleteOpId, "] LOCK DETECTION: ").concat(lockInfo));
                                                        }
                                                        else {
                                                            log("[Delete #".concat(deleteOpId, "] LOCK DETECTION: Could not determine locking process"));
                                                        }
                                                        _b.label = 7;
                                                    case 7:
                                                        if (!(isLocked && attempt < retries)) return [3 /*break*/, 9];
                                                        delay_1 = attempt * 300;
                                                        log("[Delete #".concat(deleteOpId, "] File locked, waiting ").concat(delay_1, "ms before retry..."));
                                                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, delay_1); })];
                                                    case 8:
                                                        _b.sent();
                                                        return [2 /*return*/, "continue"];
                                                    case 9:
                                                        log("[Delete #".concat(deleteOpId, "] FAILED after ").concat(attempt, " attempts: ").concat(fileName));
                                                        throw deleteErr_1;
                                                    case 10: return [3 /*break*/, 11];
                                                    case 11: return [2 /*return*/];
                                                }
                                            });
                                        };
                                        attempt = 1;
                                        _a.label = 1;
                                    case 1:
                                        if (!(attempt <= retries)) return [3 /*break*/, 4];
                                        return [5 /*yield**/, _loop_1(attempt)];
                                    case 2:
                                        state_1 = _a.sent();
                                        if (typeof state_1 === "object")
                                            return [2 /*return*/, state_1.value];
                                        _a.label = 3;
                                    case 3:
                                        attempt++;
                                        return [3 /*break*/, 1];
                                    case 4: return [2 /*return*/, { success: false, error: 'Max retries exceeded' }];
                                }
                            });
                        });
                    };
                    _a.label = 6;
                case 6:
                    _a.trys.push([6, , 8, 9]);
                    stats = fs.statSync(targetPath);
                    isFile = !stats.isDirectory();
                    if (isFile && (stats.mode & 128) === 0) {
                        log("[Delete #".concat(deleteOpId, "] Clearing read-only attribute for: ").concat(fileName));
                        fs.chmodSync(targetPath, stats.mode | 128);
                    }
                    return [4 /*yield*/, attemptDelete(targetPath, isFile)];
                case 7:
                    result = _a.sent();
                    totalTime = Date.now() - deleteStartTime;
                    log("[Delete #".concat(deleteOpId, "] END: ").concat(fileName, " - success: ").concat(result.success, ", total time: ").concat(totalTime, "ms"));
                    if (!result.success) {
                        return [2 /*return*/, result];
                    }
                    return [2 /*return*/, { success: true }];
                case 8:
                    if (needsWatcherPause) {
                        pendingDeleteOperations--;
                        log("[Delete #".concat(deleteOpId, "] Complete, pending ops remaining: ").concat(pendingDeleteOperations));
                        if (pendingDeleteOperations === 0) {
                            deleteWatcherStopPromise = null;
                            if (workingDirectory && fs.existsSync(workingDirectory)) {
                                log("[Delete] All deletes complete, restarting file watcher");
                                startFileWatcher(workingDirectory);
                            }
                        }
                    }
                    return [7 /*endfinally*/];
                case 9: return [3 /*break*/, 11];
                case 10:
                    err_3 = _a.sent();
                    log("[Delete #".concat(deleteOpId, "] EXCEPTION for ").concat(fileName, ": ").concat(String(err_3)));
                    errStr = String(err_3);
                    errorMsg = errStr;
                    if (errStr.includes('EBUSY') || errStr.includes('resource busy')) {
                        fileName_1 = path.basename(targetPath);
                        errorMsg = "EBUSY: ".concat(fileName_1, " is locked (close it in the other application first)");
                    }
                    else if (errStr.includes('EPERM') || errStr.includes('permission denied')) {
                        errorMsg = "Permission denied - file may be read-only or in use";
                    }
                    else if (errStr.includes('ENOENT')) {
                        errorMsg = "File not found";
                    }
                    return [2 /*return*/, { success: false, error: errorMsg }];
                case 11: return [2 /*return*/];
            }
        });
    }); });
    // Native file drag
    ipcMain.on('fs:start-drag', function (event, filePaths) {
        log('fs:start-drag received: ' + filePaths.length + ' files');
        var validPaths = filePaths.filter(function (p) {
            try {
                var exists = fs.existsSync(p);
                var isFile = exists && fs.statSync(p).isFile();
                if (!exists)
                    log('  File does not exist: ' + p);
                if (exists && !isFile)
                    log('  Not a file: ' + p);
                return isFile;
            }
            catch (err) {
                log('  Error checking file: ' + p + ' ' + String(err));
                return false;
            }
        });
        if (validPaths.length === 0) {
            log('No valid paths for drag');
            return;
        }
        log('Valid paths for drag: ' + validPaths.join(', '));
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                log('Calling startDrag via mainWindow.webContents');
                // Use single file if only one, otherwise use first file
                var file = validPaths[0];
                mainWindow.webContents.startDrag({
                    file: file,
                    icon: DRAG_ICON
                });
                log('startDrag completed');
            }
            else {
                log('mainWindow not available, using event.sender');
                var file = validPaths[0];
                event.sender.startDrag({
                    file: file,
                    icon: DRAG_ICON
                });
                log('startDrag via event.sender completed');
            }
        }
        catch (err) {
            log('startDrag error: ' + String(err));
        }
    });
    ipcMain.handle('fs:rename', function (_, oldPath, newPath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            try {
                fs.renameSync(oldPath, newPath);
                return [2 /*return*/, { success: true }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('fs:copy-file', function (_, sourcePath, destPath) { return __awaiter(_this, void 0, void 0, function () {
        var stats, destDir;
        return __generator(this, function (_a) {
            try {
                stats = fs.statSync(sourcePath);
                if (stats.isDirectory()) {
                    copyDirSync(sourcePath, destPath);
                    log('Copied directory: ' + sourcePath + ' -> ' + destPath);
                }
                else {
                    destDir = path.dirname(destPath);
                    if (!fs.existsSync(destDir)) {
                        fs.mkdirSync(destDir, { recursive: true });
                    }
                    fs.copyFileSync(sourcePath, destPath);
                    log('Copied file: ' + sourcePath + ' -> ' + destPath);
                }
                return [2 /*return*/, { success: true }];
            }
            catch (err) {
                log('Error copying: ' + String(err));
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('fs:move-file', function (_, sourcePath, destPath) { return __awaiter(_this, void 0, void 0, function () {
        var stats, destDir;
        return __generator(this, function (_a) {
            try {
                stats = fs.statSync(sourcePath);
                destDir = path.dirname(destPath);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }
                try {
                    fs.renameSync(sourcePath, destPath);
                    log('Moved (rename): ' + sourcePath + ' -> ' + destPath);
                    return [2 /*return*/, { success: true }];
                }
                catch (renameErr) {
                    log('Rename failed, trying copy+delete: ' + String(renameErr));
                }
                if (stats.isDirectory()) {
                    copyDirSync(sourcePath, destPath);
                    fs.rmSync(sourcePath, { recursive: true, force: true });
                    log('Moved (copy+delete) directory: ' + sourcePath + ' -> ' + destPath);
                }
                else {
                    fs.copyFileSync(sourcePath, destPath);
                    fs.unlinkSync(sourcePath);
                    log('Moved (copy+delete) file: ' + sourcePath + ' -> ' + destPath);
                }
                return [2 /*return*/, { success: true }];
            }
            catch (err) {
                log('Error moving: ' + String(err));
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('fs:open-in-explorer', function (_, targetPath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            shell.showItemInFolder(targetPath);
            return [2 /*return*/, { success: true }];
        });
    }); });
    ipcMain.handle('fs:open-file', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        var error, err_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, shell.openPath(filePath)];
                case 1:
                    error = _a.sent();
                    if (error) {
                        console.error('[Main] Failed to open file:', filePath, error);
                        return [2 /*return*/, { success: false, error: error }];
                    }
                    return [2 /*return*/, { success: true }];
                case 2:
                    err_4 = _a.sent();
                    console.error('[Main] Error opening file:', filePath, err_4);
                    return [2 /*return*/, { success: false, error: String(err_4) }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('fs:set-readonly', function (_, filePath, readonly) { return __awaiter(_this, void 0, void 0, function () {
        var stats, currentMode, newMode, newMode;
        return __generator(this, function (_a) {
            try {
                stats = fs.statSync(filePath);
                if (stats.isDirectory()) {
                    return [2 /*return*/, { success: true }];
                }
                currentMode = stats.mode;
                if (readonly) {
                    newMode = currentMode & ~146;
                    fs.chmodSync(filePath, newMode);
                }
                else {
                    newMode = currentMode | 128;
                    fs.chmodSync(filePath, newMode);
                }
                return [2 /*return*/, { success: true }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('fs:is-readonly', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        var stats, isReadonly;
        return __generator(this, function (_a) {
            try {
                stats = fs.statSync(filePath);
                isReadonly = (stats.mode & 128) === 0;
                return [2 /*return*/, { success: true, readonly: isReadonly }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
}
export function unregisterFsHandlers() {
    var handlers = [
        'working-dir:select', 'working-dir:get', 'working-dir:clear', 'working-dir:set', 'working-dir:create',
        'fs:read-file', 'fs:write-file', 'fs:download-url', 'fs:file-exists', 'fs:get-hash',
        'fs:list-dir-files', 'fs:list-working-files', 'fs:compute-file-hashes',
        'fs:create-folder', 'fs:is-dir-empty', 'fs:delete', 'fs:rename', 'fs:copy-file', 'fs:move-file',
        'fs:open-in-explorer', 'fs:open-file', 'fs:set-readonly', 'fs:is-readonly'
    ];
    for (var _i = 0, handlers_1 = handlers; _i < handlers_1.length; _i++) {
        var handler = handlers_1[_i];
        ipcMain.removeHandler(handler);
    }
    ipcMain.removeListener('fs:start-drag', function () { });
}
