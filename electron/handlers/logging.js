var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
// Logging handlers for Electron main process
import { app, ipcMain, shell, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
// Default settings
var DEFAULT_LOG_RETENTION = {
    maxFiles: 100,
    maxAgeDays: 7,
    maxSizeMb: 10,
    maxTotalSizeMb: 500
};
// Module state
var mainWindow = null;
var logRetentionSettings = __assign({}, DEFAULT_LOG_RETENTION);
var logRecordingEnabled = true;
var logFilePath = null;
var logStream = null;
var currentLogSize = 0;
var logSettingsFilePath = null;
var logBuffer = [];
var LOG_BUFFER_MAX = 1000;
function getLogSettingsPath() {
    if (!logSettingsFilePath) {
        logSettingsFilePath = path.join(app.getPath('userData'), 'log-settings.json');
    }
    return logSettingsFilePath;
}
function getLogRecordingStatePath() {
    return path.join(app.getPath('userData'), 'log-recording-state.json');
}
function loadLogRecordingState() {
    try {
        var statePath = getLogRecordingStatePath();
        if (fs.existsSync(statePath)) {
            var data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            logRecordingEnabled = data.enabled !== false;
        }
    }
    catch (_a) {
        logRecordingEnabled = true;
    }
    return logRecordingEnabled;
}
function saveLogRecordingState(enabled) {
    try {
        var statePath = getLogRecordingStatePath();
        fs.writeFileSync(statePath, JSON.stringify({ enabled: enabled }), 'utf8');
        logRecordingEnabled = enabled;
        return true;
    }
    catch (_a) {
        return false;
    }
}
function loadLogRetentionSettings() {
    var _a, _b, _c, _d;
    try {
        var settingsPath = getLogSettingsPath();
        if (fs.existsSync(settingsPath)) {
            var data = fs.readFileSync(settingsPath, 'utf8');
            var loaded = JSON.parse(data);
            logRetentionSettings = {
                maxFiles: (_a = loaded.maxFiles) !== null && _a !== void 0 ? _a : DEFAULT_LOG_RETENTION.maxFiles,
                maxAgeDays: (_b = loaded.maxAgeDays) !== null && _b !== void 0 ? _b : DEFAULT_LOG_RETENTION.maxAgeDays,
                maxSizeMb: (_c = loaded.maxSizeMb) !== null && _c !== void 0 ? _c : DEFAULT_LOG_RETENTION.maxSizeMb,
                maxTotalSizeMb: (_d = loaded.maxTotalSizeMb) !== null && _d !== void 0 ? _d : DEFAULT_LOG_RETENTION.maxTotalSizeMb
            };
        }
    }
    catch (_e) {
        logRetentionSettings = __assign({}, DEFAULT_LOG_RETENTION);
    }
    return logRetentionSettings;
}
function saveLogRetentionSettings(settings) {
    try {
        var settingsPath = getLogSettingsPath();
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        logRetentionSettings = settings;
        return true;
    }
    catch (_a) {
        return false;
    }
}
function formatDateForFilename(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    var hours = String(date.getHours()).padStart(2, '0');
    var minutes = String(date.getMinutes()).padStart(2, '0');
    var seconds = String(date.getSeconds()).padStart(2, '0');
    return "".concat(year, "-").concat(month, "-").concat(day, "_").concat(hours, "-").concat(minutes, "-").concat(seconds);
}
function cleanupOldLogFiles(logsDir) {
    try {
        var maxFiles = logRetentionSettings.maxFiles, maxAgeDays = logRetentionSettings.maxAgeDays, maxTotalSizeMb = logRetentionSettings.maxTotalSizeMb;
        var now = Date.now();
        var maxAgeMs = maxAgeDays > 0 ? maxAgeDays * 24 * 60 * 60 * 1000 : 0;
        var maxTotalSizeBytes = maxTotalSizeMb > 0 ? maxTotalSizeMb * 1024 * 1024 : 0;
        var logFiles = fs.readdirSync(logsDir)
            .filter(function (f) { return f.startsWith('blueplm-') && f.endsWith('.log'); })
            .map(function (filename) {
            var filePath = path.join(logsDir, filename);
            var stats = fs.statSync(filePath);
            return {
                name: filename,
                path: filePath,
                mtime: stats.mtime.getTime(),
                size: stats.size
            };
        })
            .sort(function (a, b) { return b.mtime - a.mtime; });
        // Delete old files by age
        if (maxAgeDays > 0) {
            for (var _i = 0, logFiles_1 = logFiles; _i < logFiles_1.length; _i++) {
                var file = logFiles_1[_i];
                var age = now - file.mtime;
                if (age > maxAgeMs) {
                    try {
                        fs.unlinkSync(file.path);
                    }
                    catch (_a) { }
                }
            }
        }
        // Re-read after age cleanup
        logFiles = fs.readdirSync(logsDir)
            .filter(function (f) { return f.startsWith('blueplm-') && f.endsWith('.log'); })
            .map(function (filename) {
            var filePath = path.join(logsDir, filename);
            var stats = fs.statSync(filePath);
            return {
                name: filename,
                path: filePath,
                mtime: stats.mtime.getTime(),
                size: stats.size
            };
        })
            .sort(function (a, b) { return b.mtime - a.mtime; });
        // Delete files beyond count limit
        if (maxFiles > 0 && logFiles.length >= maxFiles) {
            var filesToDelete = logFiles.slice(maxFiles - 1);
            for (var _b = 0, filesToDelete_1 = filesToDelete; _b < filesToDelete_1.length; _b++) {
                var file = filesToDelete_1[_b];
                try {
                    fs.unlinkSync(file.path);
                }
                catch (_c) { }
            }
            logFiles = logFiles.slice(0, maxFiles - 1);
        }
        // Delete files beyond total size limit
        if (maxTotalSizeBytes > 0) {
            var totalSize = logFiles.reduce(function (sum, f) { return sum + f.size; }, 0);
            while (totalSize > maxTotalSizeBytes && logFiles.length > 1) {
                var oldestFile = logFiles.pop();
                try {
                    fs.unlinkSync(oldestFile.path);
                    totalSize -= oldestFile.size;
                }
                catch (_d) { }
            }
        }
    }
    catch (_e) { }
}
function rotateLogFile() {
    try {
        if (logStream) {
            logStream.end();
            logStream = null;
        }
        var logsDir = path.join(app.getPath('userData'), 'logs');
        cleanupOldLogFiles(logsDir);
        var newTimestamp = formatDateForFilename(new Date());
        logFilePath = path.join(logsDir, "blueplm-".concat(newTimestamp, ".log"));
        logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
        currentLogSize = 0;
        var header = "".concat('='.repeat(60), "\nBluePLM Log (continued)\nRotated: ").concat(new Date().toISOString(), "\nVersion: ").concat(app.getVersion(), "\n").concat('='.repeat(60), "\n\n");
        logStream.write(header);
        currentLogSize += Buffer.byteLength(header, 'utf8');
    }
    catch (_a) { }
}
// Write log entry
export function writeLog(level, message, data) {
    var entry = {
        timestamp: new Date().toISOString(),
        level: level,
        message: message,
        data: data
    };
    logBuffer.push(entry);
    if (logBuffer.length > LOG_BUFFER_MAX) {
        logBuffer.shift();
    }
    var dataStr = data !== undefined ? " ".concat(JSON.stringify(data)) : '';
    var logLine = "[".concat(entry.timestamp, "] [").concat(level.toUpperCase(), "] ").concat(message).concat(dataStr, "\n");
    if (level === 'error') {
        console.error(logLine.trim());
    }
    else if (level === 'warn') {
        console.warn(logLine.trim());
    }
    else {
        console.log(logLine.trim());
    }
    if (logRecordingEnabled && logStream) {
        var lineBytes = Buffer.byteLength(logLine, 'utf8');
        var maxSize = logRetentionSettings.maxSizeMb * 1024 * 1024;
        if (currentLogSize + lineBytes > maxSize) {
            rotateLogFile();
        }
        logStream.write(logLine);
        currentLogSize += lineBytes;
    }
}
// Initialize logging
export function initializeLogging() {
    try {
        loadLogRetentionSettings();
        loadLogRecordingState();
        var logsDir = path.join(app.getPath('userData'), 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        var sessionTimestamp = formatDateForFilename(new Date());
        logFilePath = path.join(logsDir, "blueplm-".concat(sessionTimestamp, ".log"));
        cleanupOldLogFiles(logsDir);
        logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
        currentLogSize = 0;
        var startupHeader = "".concat('='.repeat(60), "\nBluePLM Session Log\nStarted: ").concat(new Date().toISOString(), "\nVersion: ").concat(app.getVersion(), "\nPlatform: ").concat(process.platform, " ").concat(process.arch, "\nElectron: ").concat(process.versions.electron, "\nNode: ").concat(process.versions.node, "\n").concat('='.repeat(60), "\n\n");
        logStream.write(startupHeader);
        currentLogSize += Buffer.byteLength(startupHeader, 'utf8');
    }
    catch (err) {
        console.error('Failed to initialize logging:', err);
    }
}
export function registerLoggingHandlers(window, _deps) {
    var _this = this;
    mainWindow = window;
    // Get log entries from buffer
    ipcMain.handle('logs:get-entries', function () {
        return logBuffer.slice(-100);
    });
    // Get current log file path
    ipcMain.handle('logs:get-path', function () {
        return logFilePath;
    });
    // Export logs
    ipcMain.handle('logs:export', function () { return __awaiter(_this, void 0, void 0, function () {
        var result, logsDir, logFiles, content, _i, logFiles_2, file, filePath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dialog.showSaveDialog(mainWindow, {
                        title: 'Export Logs',
                        defaultPath: "blueplm-logs-".concat(formatDateForFilename(new Date()), ".log"),
                        filters: [{ name: 'Log Files', extensions: ['log'] }]
                    })];
                case 1:
                    result = _a.sent();
                    if (!result.canceled && result.filePath) {
                        try {
                            logsDir = path.join(app.getPath('userData'), 'logs');
                            logFiles = fs.readdirSync(logsDir)
                                .filter(function (f) { return f.startsWith('blueplm-') && f.endsWith('.log'); })
                                .sort();
                            content = '';
                            for (_i = 0, logFiles_2 = logFiles; _i < logFiles_2.length; _i++) {
                                file = logFiles_2[_i];
                                filePath = path.join(logsDir, file);
                                content += fs.readFileSync(filePath, 'utf8');
                                content += '\n\n';
                            }
                            fs.writeFileSync(result.filePath, content);
                            return [2 /*return*/, { success: true, path: result.filePath }];
                        }
                        catch (err) {
                            return [2 /*return*/, { success: false, error: String(err) }];
                        }
                    }
                    return [2 /*return*/, { success: false, canceled: true }];
            }
        });
    }); });
    // Get logs directory
    ipcMain.handle('logs:get-dir', function () {
        return path.join(app.getPath('userData'), 'logs');
    });
    // Get crashes directory
    ipcMain.handle('logs:get-crashes-dir', function () {
        return path.join(app.getPath('userData'), 'Crashpad', 'reports');
    });
    // List crash files
    ipcMain.handle('logs:list-crashes', function () { return __awaiter(_this, void 0, void 0, function () {
        var crashDir, files;
        return __generator(this, function (_a) {
            crashDir = path.join(app.getPath('userData'), 'Crashpad', 'reports');
            if (!fs.existsSync(crashDir)) {
                return [2 /*return*/, { success: true, crashes: [] }];
            }
            try {
                files = fs.readdirSync(crashDir)
                    .filter(function (f) { return f.endsWith('.dmp'); })
                    .map(function (filename) {
                    var filePath = path.join(crashDir, filename);
                    var stats = fs.statSync(filePath);
                    return {
                        name: filename,
                        path: filePath,
                        size: stats.size,
                        date: stats.mtime.toISOString()
                    };
                })
                    .sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); });
                return [2 /*return*/, { success: true, crashes: files }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err), crashes: [] }];
            }
            return [2 /*return*/];
        });
    }); });
    // Read crash file
    ipcMain.handle('logs:read-crash', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        var stats;
        return __generator(this, function (_a) {
            try {
                stats = fs.statSync(filePath);
                return [2 /*return*/, {
                        success: true,
                        data: {
                            path: filePath,
                            size: stats.size,
                            date: stats.mtime.toISOString(),
                            content: "Binary crash dump (".concat(stats.size, " bytes)")
                        }
                    }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    // Open crashes directory
    ipcMain.handle('logs:open-crashes-dir', function () { return __awaiter(_this, void 0, void 0, function () {
        var crashDir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    crashDir = path.join(app.getPath('userData'), 'Crashpad', 'reports');
                    if (!fs.existsSync(crashDir)) {
                        fs.mkdirSync(crashDir, { recursive: true });
                    }
                    return [4 /*yield*/, shell.openPath(crashDir)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); });
    // List log files
    ipcMain.handle('logs:list-files', function () { return __awaiter(_this, void 0, void 0, function () {
        var logsDir, files;
        return __generator(this, function (_a) {
            logsDir = path.join(app.getPath('userData'), 'logs');
            try {
                files = fs.readdirSync(logsDir)
                    .filter(function (f) { return f.startsWith('blueplm-') && f.endsWith('.log'); })
                    .map(function (filename) {
                    var filePath = path.join(logsDir, filename);
                    var stats = fs.statSync(filePath);
                    return {
                        name: filename,
                        path: filePath,
                        size: stats.size,
                        date: stats.mtime.toISOString()
                    };
                })
                    .sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); });
                return [2 /*return*/, { success: true, files: files }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err), files: [] }];
            }
            return [2 /*return*/];
        });
    }); });
    // Read log file
    ipcMain.handle('logs:read-file', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        var content;
        return __generator(this, function (_a) {
            try {
                content = fs.readFileSync(filePath, 'utf8');
                return [2 /*return*/, { success: true, content: content }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    // Open logs directory
    ipcMain.handle('logs:open-dir', function () { return __awaiter(_this, void 0, void 0, function () {
        var logsDir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logsDir = path.join(app.getPath('userData'), 'logs');
                    return [4 /*yield*/, shell.openPath(logsDir)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); });
    // Delete log file
    ipcMain.handle('logs:delete-file', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            try {
                // Don't delete current log file
                if (filePath === logFilePath) {
                    return [2 /*return*/, { success: false, error: 'Cannot delete current log file' }];
                }
                fs.unlinkSync(filePath);
                return [2 /*return*/, { success: true }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    // Cleanup old logs
    ipcMain.handle('logs:cleanup-old', function () { return __awaiter(_this, void 0, void 0, function () {
        var logsDir;
        return __generator(this, function (_a) {
            logsDir = path.join(app.getPath('userData'), 'logs');
            cleanupOldLogFiles(logsDir);
            return [2 /*return*/, { success: true }];
        });
    }); });
    // Get retention settings
    ipcMain.handle('logs:get-retention-settings', function () {
        return {
            success: true,
            settings: logRetentionSettings,
            defaults: DEFAULT_LOG_RETENTION
        };
    });
    // Set retention settings
    ipcMain.handle('logs:set-retention-settings', function (_, settings) { return __awaiter(_this, void 0, void 0, function () {
        var newSettings, saved;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            newSettings = {
                maxFiles: (_a = settings.maxFiles) !== null && _a !== void 0 ? _a : logRetentionSettings.maxFiles,
                maxAgeDays: (_b = settings.maxAgeDays) !== null && _b !== void 0 ? _b : logRetentionSettings.maxAgeDays,
                maxSizeMb: (_c = settings.maxSizeMb) !== null && _c !== void 0 ? _c : logRetentionSettings.maxSizeMb,
                maxTotalSizeMb: (_d = settings.maxTotalSizeMb) !== null && _d !== void 0 ? _d : logRetentionSettings.maxTotalSizeMb
            };
            saved = saveLogRetentionSettings(newSettings);
            return [2 /*return*/, { success: saved, settings: newSettings }];
        });
    }); });
    // Get storage info
    ipcMain.handle('logs:get-storage-info', function () { return __awaiter(_this, void 0, void 0, function () {
        var logsDir, files, totalSize, _i, files_1, file, stats;
        return __generator(this, function (_a) {
            logsDir = path.join(app.getPath('userData'), 'logs');
            try {
                files = fs.readdirSync(logsDir)
                    .filter(function (f) { return f.startsWith('blueplm-') && f.endsWith('.log'); });
                totalSize = 0;
                for (_i = 0, files_1 = files; _i < files_1.length; _i++) {
                    file = files_1[_i];
                    stats = fs.statSync(path.join(logsDir, file));
                    totalSize += stats.size;
                }
                return [2 /*return*/, {
                        success: true,
                        data: {
                            fileCount: files.length,
                            totalSizeBytes: totalSize,
                            totalSizeMb: Math.round(totalSize / 1024 / 1024 * 100) / 100
                        }
                    }];
            }
            catch (err) {
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
    // Recording state
    ipcMain.handle('logs:get-recording-state', function () {
        return { enabled: logRecordingEnabled };
    });
    ipcMain.handle('logs:set-recording-state', function (_, enabled) {
        var success = saveLogRecordingState(enabled);
        return { success: success, enabled: logRecordingEnabled };
    });
    // Start new log file
    ipcMain.handle('logs:start-new-file', function () {
        rotateLogFile();
        return { success: true, path: logFilePath };
    });
    // Export filtered logs
    ipcMain.handle('logs:export-filtered', function (_, entries) { return __awaiter(_this, void 0, void 0, function () {
        var result, content;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dialog.showSaveDialog(mainWindow, {
                        title: 'Export Filtered Logs',
                        defaultPath: "blueplm-filtered-".concat(formatDateForFilename(new Date()), ".log"),
                        filters: [{ name: 'Log Files', extensions: ['log'] }]
                    })];
                case 1:
                    result = _a.sent();
                    if (!result.canceled && result.filePath) {
                        try {
                            content = entries.map(function (e) { return e.raw; }).join('\n');
                            fs.writeFileSync(result.filePath, content);
                            return [2 /*return*/, { success: true, path: result.filePath }];
                        }
                        catch (err) {
                            return [2 /*return*/, { success: false, error: String(err) }];
                        }
                    }
                    return [2 /*return*/, { success: false, canceled: true }];
            }
        });
    }); });
    // Write log from renderer
    ipcMain.on('logs:write', function (_, level, message, data) {
        writeLog(level, message, data);
    });
}
export function unregisterLoggingHandlers() {
    var handlers = [
        'logs:get-entries', 'logs:get-path', 'logs:export', 'logs:get-dir', 'logs:get-crashes-dir',
        'logs:list-crashes', 'logs:read-crash', 'logs:open-crashes-dir', 'logs:list-files',
        'logs:read-file', 'logs:open-dir', 'logs:delete-file', 'logs:cleanup-old',
        'logs:get-retention-settings', 'logs:set-retention-settings', 'logs:get-storage-info',
        'logs:get-recording-state', 'logs:set-recording-state', 'logs:start-new-file', 'logs:export-filtered'
    ];
    for (var _i = 0, handlers_1 = handlers; _i < handlers_1.length; _i++) {
        var handler = handlers_1[_i];
        ipcMain.removeHandler(handler);
    }
    ipcMain.removeAllListeners('logs:write');
}
