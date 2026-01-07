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
// Backup handlers for Electron main process (restic-based backup)
import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
// ============================================
// Module State
// ============================================
var mainWindow = null;
// External log function reference
var log = console.log;
var logError = console.error;
// External working directory getter
var getWorkingDirectory = function () { return null; };
// Operation tracking
var currentStats = null;
// Get path to bundled restic binary
function getResticPath() {
    var binaryName = process.platform === 'win32' ? 'restic.exe' : 'restic';
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'bin', binaryName);
    }
    else {
        // In dev mode, __dirname is dist-electron/ which is at the project root
        // So we only need to go up one level to reach the project root
        return path.join(__dirname, '..', 'resources', 'bin', process.platform, binaryName);
    }
}
// Get restic command (bundled or system fallback)
function getResticCommand() {
    var bundledPath = getResticPath();
    if (fs.existsSync(bundledPath)) {
        return bundledPath;
    }
    return 'restic';
}
// ============================================
// Backup Log Helpers
// ============================================
function emitBackupLog(sender, entry) {
    console.log('[BACKUP-DEBUG] Emitting log:', entry.phase, entry.message);
    sender.send('backup:log', entry);
    // Also log to file for debugging
    var levelMap = {
        debug: 'DEBUG',
        info: 'INFO',
        warn: 'WARN',
        error: 'ERROR',
        success: 'SUCCESS'
    };
    log("[Backup:".concat(entry.phase, "] [").concat(levelMap[entry.level], "] ").concat(entry.message), entry.metadata);
}
function startPhaseStats(phase) {
    currentStats = {
        phase: phase,
        startTime: Date.now(),
        filesProcessed: 0,
        filesTotal: 0,
        bytesProcessed: 0,
        bytesTotal: 0,
        errorsEncountered: 0
    };
}
function endPhaseStats() {
    if (currentStats) {
        currentStats.endTime = Date.now();
        var stats = __assign({}, currentStats);
        currentStats = null;
        return stats;
    }
    return null;
}
function emitPhaseStart(sender, phase, message) {
    startPhaseStats(phase);
    emitBackupLog(sender, {
        level: 'info',
        phase: phase,
        message: message,
        timestamp: Date.now()
    });
}
function emitPhaseComplete(sender, phase, message) {
    var stats = endPhaseStats();
    emitBackupLog(sender, {
        level: 'success',
        phase: phase,
        message: message,
        timestamp: Date.now(),
        metadata: stats ? {
            duration: stats.endTime ? stats.endTime - stats.startTime : undefined,
            filesProcessed: stats.filesProcessed,
            bytesProcessed: stats.bytesProcessed
        } : undefined
    });
}
function emitPhaseError(sender, phase, message, error, exitCode) {
    if (currentStats) {
        currentStats.errorsEncountered++;
    }
    emitBackupLog(sender, {
        level: 'error',
        phase: phase,
        message: message,
        timestamp: Date.now(),
        metadata: { error: error, exitCode: exitCode }
    });
}
// Parse restic JSON output for progress tracking
function parseResticProgress(line) {
    var _a;
    try {
        var json = JSON.parse(line);
        if (json.message_type === 'status') {
            return {
                type: 'status',
                percentDone: json.percent_done,
                filesDone: json.files_done,
                filesTotal: json.total_files,
                bytesDone: json.bytes_done,
                bytesTotal: json.total_bytes,
                currentFile: (_a = json.current_files) === null || _a === void 0 ? void 0 : _a[0]
            };
        }
        else if (json.message_type === 'summary') {
            return {
                type: 'summary',
                snapshotId: json.snapshot_id
            };
        }
    }
    catch (_b) {
        // Not JSON
    }
    return null;
}
// Parse restic restore output (not JSON, text-based)
function parseResticRestoreOutput(line) {
    var restoringMatch = line.match(/restoring\s+(.+)/);
    if (restoringMatch) {
        return { type: 'restoring', path: restoringMatch[1].trim() };
    }
    var verifyingMatch = line.match(/verifying\s+(.+)/);
    if (verifyingMatch) {
        return { type: 'verifying', path: verifyingMatch[1].trim() };
    }
    return null;
}
// ============================================
// Restic Configuration
// ============================================
// Build restic repository URL based on provider
function buildResticRepo(config) {
    if (config.provider === 'backblaze_b2') {
        var endpoint_1 = config.endpoint || 's3.us-west-004.backblazeb2.com';
        return "s3:".concat(endpoint_1, "/").concat(config.bucket, "/blueplm-backup");
    }
    else if (config.provider === 'aws_s3') {
        var region = config.region || 'us-east-1';
        return "s3:s3.".concat(region, ".amazonaws.com/").concat(config.bucket, "/blueplm-backup");
    }
    else if (config.provider === 'google_cloud') {
        return "gs:".concat(config.bucket, ":/blueplm-backup");
    }
    var endpoint = config.endpoint || 's3.amazonaws.com';
    return "s3:".concat(endpoint, "/").concat(config.bucket, "/blueplm-backup");
}
export function registerBackupHandlers(window, deps) {
    var _this = this;
    mainWindow = window;
    log = deps.log;
    logError = deps.logError;
    getWorkingDirectory = deps.getWorkingDirectory;
    // Check if restic is available
    ipcMain.handle('backup:check-restic', function () { return __awaiter(_this, void 0, void 0, function () {
        var bundledPath, version, match, version, match;
        return __generator(this, function (_a) {
            bundledPath = getResticPath();
            if (fs.existsSync(bundledPath)) {
                try {
                    version = execSync("\"".concat(bundledPath, "\" version"), { encoding: 'utf8' });
                    match = version.match(/restic\s+([\d.]+)/);
                    return [2 /*return*/, { installed: true, version: match ? match[1] : 'unknown', path: bundledPath }];
                }
                catch (err) {
                    log('Bundled restic failed: ' + String(err));
                }
            }
            try {
                version = execSync('restic version', { encoding: 'utf8' });
                match = version.match(/restic\s+([\d.]+)/);
                return [2 /*return*/, { installed: true, version: match ? match[1] : 'unknown', path: 'restic' }];
            }
            catch (_b) {
                return [2 /*return*/, {
                        installed: false,
                        error: 'restic not found. Run "npm run download-restic" to bundle it with the app.'
                    }];
            }
            return [2 /*return*/];
        });
    }); });
    // Run backup
    ipcMain.handle('backup:run', function (event, config) { return __awaiter(_this, void 0, void 0, function () {
        var operationStartTime, env, repo, resticCmd_1, repoExists_1, _a, err_1, workingDirectory, backupPath, blueplmDir, metadataPath, vaultDisplayName, backupArgs_1, backupResult, _b, localBackupSuccess, localPath, totalDuration, err_2, totalDuration;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    operationStartTime = Date.now();
                    log('Starting backup...', { provider: config.provider, bucket: config.bucket });
                    emitBackupLog(event.sender, {
                        level: 'info',
                        phase: 'idle',
                        message: "Starting backup to ".concat(config.provider, " (").concat(config.bucket, ")"),
                        timestamp: Date.now(),
                        metadata: { operation: 'backup' }
                    });
                    env = __assign(__assign({}, process.env), { RESTIC_PASSWORD: config.resticPassword, AWS_ACCESS_KEY_ID: config.accessKey, AWS_SECRET_ACCESS_KEY: config.secretKey });
                    if (config.provider === 'backblaze_b2') {
                        env.B2_ACCOUNT_ID = config.accessKey;
                        env.B2_ACCOUNT_KEY = config.secretKey;
                    }
                    repo = buildResticRepo(config);
                    emitBackupLog(event.sender, {
                        level: 'debug',
                        phase: 'idle',
                        message: "Repository URL configured: ".concat(repo.replace(/\/\/[^@]+@/, '//***@')),
                        timestamp: Date.now()
                    });
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 17, , 18]);
                    // Phase: Repository Check
                    emitPhaseStart(event.sender, 'repo_check', 'Checking repository status...');
                    event.sender.send('backup:progress', { phase: 'Initializing', percent: 5, message: 'Checking repository...' });
                    resticCmd_1 = getResticCommand();
                    emitBackupLog(event.sender, {
                        level: 'debug',
                        phase: 'repo_check',
                        message: "Using restic: ".concat(resticCmd_1),
                        timestamp: Date.now()
                    });
                    repoExists_1 = false;
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 6]);
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var check = spawn(resticCmd_1, ['-r', repo, 'snapshots', '--json'], { env: env });
                            var stderr = '';
                            check.stderr.on('data', function (data) {
                                stderr += data.toString();
                            });
                            check.on('close', function (code) {
                                if (code === 0) {
                                    emitBackupLog(event.sender, {
                                        level: 'info',
                                        phase: 'repo_check',
                                        message: 'Repository exists and is accessible',
                                        timestamp: Date.now()
                                    });
                                    repoExists_1 = true;
                                    resolve();
                                }
                                else {
                                    emitBackupLog(event.sender, {
                                        level: 'info',
                                        phase: 'repo_check',
                                        message: 'Repository does not exist or is not initialized',
                                        timestamp: Date.now(),
                                        metadata: { exitCode: code, error: stderr.trim() }
                                    });
                                    reject(new Error('Repo not initialized'));
                                }
                            });
                            check.on('error', reject);
                        })];
                case 3:
                    _c.sent();
                    return [3 /*break*/, 6];
                case 4:
                    _a = _c.sent();
                    // Phase: Repository Init
                    emitPhaseStart(event.sender, 'repo_init', 'Initializing new repository...');
                    event.sender.send('backup:progress', { phase: 'Initializing', percent: 10, message: 'Creating repository...' });
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var init = spawn(resticCmd_1, ['-r', repo, 'init'], { env: env });
                            var stderr = '';
                            var stdout = '';
                            init.stdout.on('data', function (data) {
                                stdout += data.toString();
                                emitBackupLog(event.sender, {
                                    level: 'debug',
                                    phase: 'repo_init',
                                    message: data.toString().trim(),
                                    timestamp: Date.now()
                                });
                            });
                            init.stderr.on('data', function (data) {
                                stderr += data.toString();
                                emitBackupLog(event.sender, {
                                    level: 'warn',
                                    phase: 'repo_init',
                                    message: data.toString().trim(),
                                    timestamp: Date.now()
                                });
                            });
                            init.on('close', function (code) {
                                if (code === 0) {
                                    emitPhaseComplete(event.sender, 'repo_init', 'Repository initialized successfully');
                                    resolve();
                                }
                                else {
                                    var errorMsg = stderr || stdout || "Exit code ".concat(code);
                                    emitPhaseError(event.sender, 'repo_init', 'Failed to initialize repository', errorMsg, code);
                                    reject(new Error("Failed to initialize repository: ".concat(errorMsg)));
                                }
                            });
                            init.on('error', function (err) {
                                emitPhaseError(event.sender, 'repo_init', 'Repository init process error', err.message);
                                reject(err);
                            });
                        })];
                case 5:
                    _c.sent();
                    return [3 /*break*/, 6];
                case 6:
                    if (repoExists_1) {
                        emitPhaseComplete(event.sender, 'repo_check', 'Repository check complete');
                    }
                    // Phase: Unlock
                    emitPhaseStart(event.sender, 'unlock', 'Removing stale locks...');
                    event.sender.send('backup:progress', { phase: 'Initializing', percent: 12, message: 'Checking for stale locks...' });
                    _c.label = 7;
                case 7:
                    _c.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, new Promise(function (resolve) {
                            var unlock = spawn(resticCmd_1, ['-r', repo, 'unlock'], { env: env });
                            var unlockOutput = '';
                            unlock.stderr.on('data', function (data) {
                                unlockOutput += data.toString();
                            });
                            unlock.on('close', function (code) {
                                if (code === 0) {
                                    emitPhaseComplete(event.sender, 'unlock', 'Stale locks cleared');
                                }
                                else {
                                    emitBackupLog(event.sender, {
                                        level: 'debug',
                                        phase: 'unlock',
                                        message: "Unlock returned code ".concat(code, " (likely no locks to remove)"),
                                        timestamp: Date.now()
                                    });
                                }
                                resolve();
                            });
                            unlock.on('error', function () { return resolve(); });
                        })];
                case 8:
                    _c.sent();
                    return [3 /*break*/, 10];
                case 9:
                    err_1 = _c.sent();
                    emitBackupLog(event.sender, {
                        level: 'warn',
                        phase: 'unlock',
                        message: "Unlock step error (non-fatal): ".concat(String(err_1)),
                        timestamp: Date.now()
                    });
                    return [3 /*break*/, 10];
                case 10:
                    workingDirectory = getWorkingDirectory();
                    backupPath = config.vaultPath || workingDirectory;
                    if (!backupPath) {
                        emitPhaseError(event.sender, 'backup', 'No vault connected - nothing to backup');
                        throw new Error('No vault connected - nothing to backup');
                    }
                    // Save database metadata
                    if (config.metadataJson) {
                        emitBackupLog(event.sender, {
                            level: 'info',
                            phase: 'backup',
                            message: 'Saving database metadata to backup...',
                            timestamp: Date.now()
                        });
                        event.sender.send('backup:progress', { phase: 'Metadata', percent: 15, message: 'Saving database metadata...' });
                        blueplmDir = path.join(backupPath, '.blueplm');
                        if (!fs.existsSync(blueplmDir)) {
                            fs.mkdirSync(blueplmDir, { recursive: true });
                        }
                        metadataPath = path.join(blueplmDir, 'database-export.json');
                        fs.writeFileSync(metadataPath, config.metadataJson, 'utf-8');
                        emitBackupLog(event.sender, {
                            level: 'success',
                            phase: 'backup',
                            message: "Database metadata saved to ".concat(metadataPath),
                            timestamp: Date.now()
                        });
                    }
                    vaultDisplayName = config.vaultName || path.basename(backupPath);
                    emitPhaseStart(event.sender, 'backup', "Starting backup of ".concat(vaultDisplayName, "..."));
                    event.sender.send('backup:progress', { phase: 'Backing up', percent: 20, message: "Backing up ".concat(vaultDisplayName, "...") });
                    backupArgs_1 = [
                        '-r', repo,
                        'backup',
                        backupPath,
                        '--json',
                        '--tag', 'blueplm',
                        '--tag', 'files'
                    ];
                    if (config.vaultName) {
                        backupArgs_1.push('--tag', "vault:".concat(config.vaultName));
                    }
                    if (config.metadataJson) {
                        backupArgs_1.push('--tag', 'has-metadata');
                    }
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var output = '';
                            var snapshotId = '';
                            var lastProgressLog = 0;
                            var backup = spawn(resticCmd_1, backupArgs_1, { env: env });
                            backup.stdout.on('data', function (data) {
                                var lines = data.toString().split('\n');
                                for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                                    var line = lines_1[_i];
                                    if (!line.trim())
                                        continue;
                                    var progress = parseResticProgress(line);
                                    if (progress) {
                                        if (progress.type === 'status') {
                                            // Update internal stats
                                            if (currentStats) {
                                                currentStats.filesProcessed = progress.filesDone || 0;
                                                currentStats.filesTotal = progress.filesTotal || 0;
                                                currentStats.bytesProcessed = progress.bytesDone || 0;
                                                currentStats.bytesTotal = progress.bytesTotal || 0;
                                            }
                                            var percent = 20 + Math.round((progress.percentDone || 0) * 60);
                                            event.sender.send('backup:progress', {
                                                phase: 'Backing up',
                                                percent: percent,
                                                message: "".concat(progress.filesDone || 0, " files processed...")
                                            });
                                            // Emit detailed log every 5 seconds
                                            var now = Date.now();
                                            if (now - lastProgressLog > 5000) {
                                                lastProgressLog = now;
                                                emitBackupLog(event.sender, {
                                                    level: 'info',
                                                    phase: 'backup',
                                                    message: "Progress: ".concat(progress.filesDone || 0, "/").concat(progress.filesTotal || '?', " files, ").concat(Math.round((progress.percentDone || 0) * 100), "%"),
                                                    timestamp: now,
                                                    metadata: {
                                                        filesProcessed: progress.filesDone,
                                                        filesTotal: progress.filesTotal,
                                                        bytesProcessed: progress.bytesDone,
                                                        bytesTotal: progress.bytesTotal,
                                                        currentFile: progress.currentFile
                                                    }
                                                });
                                            }
                                        }
                                        else if (progress.type === 'summary') {
                                            snapshotId = progress.snapshotId || '';
                                            output = line;
                                        }
                                    }
                                }
                            });
                            backup.stderr.on('data', function (data) {
                                var msg = data.toString().trim();
                                if (msg) {
                                    emitBackupLog(event.sender, {
                                        level: 'warn',
                                        phase: 'backup',
                                        message: msg,
                                        timestamp: Date.now()
                                    });
                                }
                            });
                            backup.on('close', function (code) {
                                if (code === 0) {
                                    try {
                                        var summary = output ? JSON.parse(output) : {};
                                        var stats = {
                                            filesNew: summary.files_new || 0,
                                            filesChanged: summary.files_changed || 0,
                                            filesUnmodified: summary.files_unmodified || 0,
                                            bytesAdded: summary.data_added || 0,
                                            bytesTotal: summary.total_bytes_processed || 0
                                        };
                                        emitPhaseComplete(event.sender, 'backup', "Backup complete: ".concat(stats.filesNew, " new, ").concat(stats.filesChanged, " changed, ").concat(stats.filesUnmodified, " unmodified files"));
                                        resolve({ snapshotId: snapshotId, stats: stats });
                                    }
                                    catch (_a) {
                                        emitPhaseComplete(event.sender, 'backup', 'Backup complete');
                                        resolve({ snapshotId: snapshotId, stats: {} });
                                    }
                                }
                                else {
                                    emitPhaseError(event.sender, 'backup', 'Backup failed', "Exit code ".concat(code), code);
                                    reject(new Error("Backup failed with exit code ".concat(code)));
                                }
                            });
                            backup.on('error', function (err) {
                                emitPhaseError(event.sender, 'backup', 'Backup process error', err.message);
                                reject(err);
                            });
                        })
                        // Phase: Retention
                    ];
                case 11:
                    backupResult = _c.sent();
                    // Phase: Retention
                    emitPhaseStart(event.sender, 'retention', 'Applying retention policy...');
                    event.sender.send('backup:progress', { phase: 'Cleanup', percent: 85, message: 'Applying retention policy...' });
                    _c.label = 12;
                case 12:
                    _c.trys.push([12, 14, , 15]);
                    return [4 /*yield*/, new Promise(function (resolve) {
                            var unlock = spawn(resticCmd_1, ['-r', repo, 'unlock'], { env: env });
                            unlock.on('close', function () { return resolve(); });
                            unlock.on('error', function () { return resolve(); });
                        })];
                case 13:
                    _c.sent();
                    return [3 /*break*/, 15];
                case 14:
                    _b = _c.sent();
                    return [3 /*break*/, 15];
                case 15: 
                // Apply retention policy
                return [4 /*yield*/, new Promise(function (resolve, reject) {
                        var stderrOutput = '';
                        var forget = spawn(resticCmd_1, [
                            '-r', repo,
                            'forget',
                            '--keep-daily', String(config.retentionDaily),
                            '--keep-weekly', String(config.retentionWeekly),
                            '--keep-monthly', String(config.retentionMonthly),
                            '--keep-yearly', String(config.retentionYearly),
                            '--prune'
                        ], { env: env });
                        forget.stdout.on('data', function (data) {
                            var msg = data.toString().trim();
                            if (msg) {
                                emitBackupLog(event.sender, {
                                    level: 'debug',
                                    phase: 'retention',
                                    message: msg,
                                    timestamp: Date.now()
                                });
                            }
                        });
                        forget.stderr.on('data', function (data) {
                            stderrOutput += data.toString();
                            var msg = data.toString().trim();
                            if (msg) {
                                emitBackupLog(event.sender, {
                                    level: 'warn',
                                    phase: 'retention',
                                    message: msg,
                                    timestamp: Date.now()
                                });
                            }
                        });
                        forget.on('close', function (code) {
                            if (code === 0) {
                                emitPhaseComplete(event.sender, 'retention', 'Retention policy applied successfully');
                                resolve();
                            }
                            else {
                                emitPhaseError(event.sender, 'retention', 'Retention policy failed', stderrOutput.trim(), code);
                                reject(new Error("Failed to apply retention policy (exit code ".concat(code, "): ").concat(stderrOutput.trim() || 'unknown error')));
                            }
                        });
                        forget.on('error', function (err) {
                            emitPhaseError(event.sender, 'retention', 'Retention process error', err.message);
                            reject(err);
                        });
                    })
                    // Optional local backup
                ];
                case 16:
                    // Apply retention policy
                    _c.sent();
                    localBackupSuccess = false;
                    if (config.localBackupEnabled && config.localBackupPath) {
                        emitBackupLog(event.sender, {
                            level: 'info',
                            phase: 'backup',
                            message: "Creating local backup to ".concat(config.localBackupPath, "..."),
                            timestamp: Date.now()
                        });
                        event.sender.send('backup:progress', { phase: 'Local Backup', percent: 92, message: 'Creating local backup...' });
                        try {
                            localPath = config.localBackupPath;
                            if (!fs.existsSync(localPath)) {
                                fs.mkdirSync(localPath, { recursive: true });
                            }
                            if (process.platform === 'win32') {
                                execSync("robocopy \"".concat(workingDirectory, "\" \"").concat(localPath, "\" /MIR /NFL /NDL /NJH /NJS /NC /NS /NP"), { stdio: 'ignore' });
                            }
                            else {
                                execSync("rsync -a --delete \"".concat(workingDirectory, "/\" \"").concat(localPath, "/\""), { stdio: 'ignore' });
                            }
                            localBackupSuccess = true;
                            emitBackupLog(event.sender, {
                                level: 'success',
                                phase: 'backup',
                                message: 'Local backup created successfully',
                                timestamp: Date.now()
                            });
                        }
                        catch (err) {
                            emitBackupLog(event.sender, {
                                level: 'error',
                                phase: 'backup',
                                message: "Local backup failed: ".concat(String(err)),
                                timestamp: Date.now()
                            });
                        }
                    }
                    totalDuration = Date.now() - operationStartTime;
                    emitBackupLog(event.sender, {
                        level: 'success',
                        phase: 'complete',
                        message: "Backup completed successfully in ".concat(Math.round(totalDuration / 1000), "s"),
                        timestamp: Date.now(),
                        metadata: {
                            operation: 'backup',
                            duration: totalDuration,
                            filesProcessed: backupResult.stats.filesNew +
                                backupResult.stats.filesChanged +
                                backupResult.stats.filesUnmodified
                        }
                    });
                    event.sender.send('backup:progress', { phase: 'Complete', percent: 100, message: 'Backup complete!' });
                    return [2 /*return*/, {
                            success: true,
                            snapshotId: backupResult.snapshotId,
                            localBackupSuccess: localBackupSuccess,
                            stats: backupResult.stats
                        }];
                case 17:
                    err_2 = _c.sent();
                    totalDuration = Date.now() - operationStartTime;
                    emitBackupLog(event.sender, {
                        level: 'error',
                        phase: 'error',
                        message: "Backup failed after ".concat(Math.round(totalDuration / 1000), "s: ").concat(String(err_2)),
                        timestamp: Date.now(),
                        metadata: { operation: 'backup', error: String(err_2), duration: totalDuration }
                    });
                    return [2 /*return*/, { success: false, error: String(err_2) }];
                case 18: return [2 /*return*/];
            }
        });
    }); });
    // List backup snapshots
    ipcMain.handle('backup:list-snapshots', function (_, config) { return __awaiter(_this, void 0, void 0, function () {
        var env, repo, resticCmd, snapshots, err_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    env = __assign(__assign({}, process.env), { RESTIC_PASSWORD: config.resticPassword, AWS_ACCESS_KEY_ID: config.accessKey, AWS_SECRET_ACCESS_KEY: config.secretKey });
                    if (config.provider === 'backblaze_b2') {
                        env.B2_ACCOUNT_ID = config.accessKey;
                        env.B2_ACCOUNT_KEY = config.secretKey;
                    }
                    repo = buildResticRepo(config);
                    resticCmd = getResticCommand();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var output = '';
                            var stderr = '';
                            var list = spawn(resticCmd, ['-r', repo, 'snapshots', '--json'], { env: env });
                            list.stdout.on('data', function (data) {
                                output += data.toString();
                            });
                            list.stderr.on('data', function (data) {
                                stderr += data.toString();
                            });
                            list.on('close', function (code) {
                                if (code === 0) {
                                    try {
                                        var parsed = JSON.parse(output);
                                        resolve(parsed);
                                    }
                                    catch (_a) {
                                        resolve([]);
                                    }
                                }
                                else {
                                    var errorMsg = stderr.trim() || "Restic exited with code ".concat(code);
                                    logError('Failed to list snapshots', { code: code, stderr: errorMsg, repo: repo });
                                    reject(new Error(errorMsg));
                                }
                            });
                            list.on('error', reject);
                        })];
                case 2:
                    snapshots = _a.sent();
                    return [2 /*return*/, {
                            success: true,
                            snapshots: snapshots.map(function (s) { return ({
                                id: s.short_id || s.id,
                                time: s.time,
                                hostname: s.hostname,
                                paths: s.paths || [],
                                tags: s.tags || []
                            }); })
                        }];
                case 3:
                    err_3 = _a.sent();
                    logError('Failed to list snapshots', { error: String(err_3) });
                    return [2 /*return*/, { success: false, error: String(err_3), snapshots: [] }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    // Delete a snapshot
    ipcMain.handle('backup:delete-snapshot', function (_, config) { return __awaiter(_this, void 0, void 0, function () {
        var env, repo, resticCmd, _a, _b, err_4;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    log('Deleting snapshot...', { snapshotId: config.snapshotId });
                    env = __assign(__assign({}, process.env), { RESTIC_PASSWORD: config.resticPassword, AWS_ACCESS_KEY_ID: config.accessKey, AWS_SECRET_ACCESS_KEY: config.secretKey });
                    if (config.provider === 'backblaze_b2') {
                        env.B2_ACCOUNT_ID = config.accessKey;
                        env.B2_ACCOUNT_KEY = config.secretKey;
                    }
                    repo = buildResticRepo(config);
                    resticCmd = getResticCommand();
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 12, , 13]);
                    // Remove any stale locks before operations
                    log('Unlocking repository before delete...');
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, new Promise(function (resolve) {
                            var unlock = spawn(resticCmd, ['-r', repo, 'unlock'], { env: env });
                            unlock.on('close', function () { return resolve(); });
                            unlock.on('error', function () { return resolve(); });
                        })];
                case 3:
                    _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _a = _c.sent();
                    return [3 /*break*/, 5];
                case 5: 
                // Forget the snapshot
                return [4 /*yield*/, new Promise(function (resolve, reject) {
                        var forget = spawn(resticCmd, ['-r', repo, 'forget', config.snapshotId], { env: env });
                        var stderr = '';
                        forget.stderr.on('data', function (data) {
                            stderr += data.toString();
                        });
                        forget.on('close', function (code) {
                            if (code === 0)
                                resolve();
                            else
                                reject(new Error(stderr || "Forget failed with exit code ".concat(code)));
                        });
                        forget.on('error', reject);
                    })
                    // Unlock again before prune (in case forget created a lock)
                ];
                case 6:
                    // Forget the snapshot
                    _c.sent();
                    _c.label = 7;
                case 7:
                    _c.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, new Promise(function (resolve) {
                            var unlock = spawn(resticCmd, ['-r', repo, 'unlock'], { env: env });
                            unlock.on('close', function () { return resolve(); });
                            unlock.on('error', function () { return resolve(); });
                        })];
                case 8:
                    _c.sent();
                    return [3 /*break*/, 10];
                case 9:
                    _b = _c.sent();
                    return [3 /*break*/, 10];
                case 10: 
                // Prune to reclaim space
                return [4 /*yield*/, new Promise(function (resolve, reject) {
                        var prune = spawn(resticCmd, ['-r', repo, 'prune'], { env: env });
                        var stderr = '';
                        prune.stderr.on('data', function (data) {
                            stderr += data.toString();
                        });
                        prune.on('close', function (code) {
                            if (code === 0) {
                                resolve();
                            }
                            else {
                                // Exit code 11 typically means lock contention
                                var errorMsg = stderr.trim() || "Exit code ".concat(code);
                                if (code === 11) {
                                    errorMsg = "Repository is locked by another process. ".concat(errorMsg, ". Try again in a moment or check if another backup is running.");
                                }
                                reject(new Error("Prune failed: ".concat(errorMsg)));
                            }
                        });
                        prune.on('error', reject);
                    })];
                case 11:
                    // Prune to reclaim space
                    _c.sent();
                    log('Snapshot deleted successfully');
                    return [2 /*return*/, { success: true }];
                case 12:
                    err_4 = _c.sent();
                    logError('Failed to delete snapshot', { error: String(err_4) });
                    return [2 /*return*/, { success: false, error: String(err_4) }];
                case 13: return [2 /*return*/];
            }
        });
    }); });
    // Restore from backup
    ipcMain.handle('backup:restore', function (event, config) { return __awaiter(_this, void 0, void 0, function () {
        var operationStartTime, env, repo, resticCmd, _a, args_1, _i, _b, p, filesRestored_1, lastProgressLog_1, metadataPath, hasMetadata, totalDuration, err_5, totalDuration;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    operationStartTime = Date.now();
                    log('Starting restore...', { snapshotId: config.snapshotId, targetPath: config.targetPath });
                    emitBackupLog(event.sender, {
                        level: 'info',
                        phase: 'idle',
                        message: "Starting restore of snapshot ".concat(config.snapshotId, " to ").concat(config.targetPath),
                        timestamp: Date.now(),
                        metadata: { operation: 'restore' }
                    });
                    env = __assign(__assign({}, process.env), { RESTIC_PASSWORD: config.resticPassword, AWS_ACCESS_KEY_ID: config.accessKey, AWS_SECRET_ACCESS_KEY: config.secretKey });
                    if (config.provider === 'backblaze_b2') {
                        env.B2_ACCOUNT_ID = config.accessKey;
                        env.B2_ACCOUNT_KEY = config.secretKey;
                    }
                    repo = buildResticRepo(config);
                    resticCmd = getResticCommand();
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 7, , 8]);
                    // Phase: Repository Check
                    emitPhaseStart(event.sender, 'repo_check', 'Connecting to repository...');
                    event.sender.send('backup:progress', { phase: 'Connecting', percent: 5, message: 'Connecting to repository...' });
                    emitBackupLog(event.sender, {
                        level: 'debug',
                        phase: 'repo_check',
                        message: "Using restic: ".concat(resticCmd),
                        timestamp: Date.now()
                    });
                    // Unlock any stale locks first
                    emitPhaseStart(event.sender, 'unlock', 'Checking for stale locks...');
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, new Promise(function (resolve) {
                            var unlock = spawn(resticCmd, ['-r', repo, 'unlock'], { env: env });
                            unlock.on('close', function (code) {
                                if (code === 0) {
                                    emitBackupLog(event.sender, {
                                        level: 'debug',
                                        phase: 'unlock',
                                        message: 'Repository unlocked',
                                        timestamp: Date.now()
                                    });
                                }
                                resolve();
                            });
                            unlock.on('error', function () { return resolve(); });
                        })];
                case 3:
                    _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _a = _c.sent();
                    return [3 /*break*/, 5];
                case 5:
                    emitPhaseComplete(event.sender, 'unlock', 'Lock check complete');
                    // Phase: Restore
                    emitPhaseStart(event.sender, 'restore', "Restoring snapshot ".concat(config.snapshotId, "..."));
                    event.sender.send('backup:progress', { phase: 'Restoring', percent: 10, message: 'Starting file restore...' });
                    args_1 = [
                        '-r', repo,
                        'restore', config.snapshotId,
                        '--target', config.targetPath,
                        '--verbose' // Add verbose for better progress tracking
                    ];
                    if (config.specificPaths && config.specificPaths.length > 0) {
                        emitBackupLog(event.sender, {
                            level: 'info',
                            phase: 'restore',
                            message: "Restoring specific paths: ".concat(config.specificPaths.join(', ')),
                            timestamp: Date.now()
                        });
                        for (_i = 0, _b = config.specificPaths; _i < _b.length; _i++) {
                            p = _b[_i];
                            args_1.push('--include', p);
                        }
                    }
                    filesRestored_1 = 0;
                    lastProgressLog_1 = 0;
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var restore = spawn(resticCmd, args_1, { env: env });
                            restore.stdout.on('data', function (data) {
                                var lines = data.toString().split('\n');
                                for (var _i = 0, lines_2 = lines; _i < lines_2.length; _i++) {
                                    var line = lines_2[_i];
                                    if (!line.trim())
                                        continue;
                                    var parsed = parseResticRestoreOutput(line);
                                    if (parsed) {
                                        filesRestored_1++;
                                        if (currentStats) {
                                            currentStats.filesProcessed = filesRestored_1;
                                        }
                                        // Update progress (estimate based on files, not perfect)
                                        var percent = Math.min(10 + Math.round(filesRestored_1 * 0.1), 80);
                                        event.sender.send('backup:progress', {
                                            phase: 'Restoring',
                                            percent: percent,
                                            message: "".concat(filesRestored_1, " files restored...")
                                        });
                                        // Emit detailed log every 3 seconds or every 100 files
                                        var now = Date.now();
                                        if (now - lastProgressLog_1 > 3000 || filesRestored_1 % 100 === 0) {
                                            lastProgressLog_1 = now;
                                            emitBackupLog(event.sender, {
                                                level: 'info',
                                                phase: 'restore',
                                                message: "".concat(parsed.type === 'restoring' ? 'Restoring' : 'Verifying', ": ").concat(parsed.path),
                                                timestamp: now,
                                                metadata: {
                                                    filesProcessed: filesRestored_1,
                                                    currentFile: parsed.path
                                                }
                                            });
                                        }
                                    }
                                    else if (line.trim()) {
                                        // Log other output
                                        emitBackupLog(event.sender, {
                                            level: 'debug',
                                            phase: 'restore',
                                            message: line.trim(),
                                            timestamp: Date.now()
                                        });
                                    }
                                }
                            });
                            restore.stderr.on('data', function (data) {
                                var msg = data.toString().trim();
                                if (msg) {
                                    // Check if it's an error or just info
                                    var isError = msg.toLowerCase().includes('error') ||
                                        msg.toLowerCase().includes('failed') ||
                                        msg.toLowerCase().includes('permission denied');
                                    emitBackupLog(event.sender, {
                                        level: isError ? 'error' : 'warn',
                                        phase: 'restore',
                                        message: msg,
                                        timestamp: Date.now()
                                    });
                                    if (isError && currentStats) {
                                        currentStats.errorsEncountered++;
                                    }
                                }
                            });
                            restore.on('close', function (code) {
                                if (code === 0) {
                                    emitPhaseComplete(event.sender, 'restore', "File restore complete: ".concat(filesRestored_1, " files restored"));
                                    resolve();
                                }
                                else {
                                    emitPhaseError(event.sender, 'restore', 'File restore failed', "Exit code ".concat(code), code);
                                    reject(new Error("Restore failed with exit code ".concat(code)));
                                }
                            });
                            restore.on('error', function (err) {
                                emitPhaseError(event.sender, 'restore', 'Restore process error', err.message);
                                reject(err);
                            });
                        })
                        // Phase: Check for metadata
                    ];
                case 6:
                    _c.sent();
                    // Phase: Check for metadata
                    event.sender.send('backup:progress', { phase: 'Checking', percent: 85, message: 'Checking for database metadata...' });
                    metadataPath = path.join(config.targetPath, '.blueplm', 'database-export.json');
                    hasMetadata = false;
                    if (fs.existsSync(metadataPath)) {
                        hasMetadata = true;
                        emitBackupLog(event.sender, {
                            level: 'success',
                            phase: 'restore',
                            message: 'Found database metadata in restored backup',
                            timestamp: Date.now()
                        });
                    }
                    else {
                        emitBackupLog(event.sender, {
                            level: 'info',
                            phase: 'restore',
                            message: 'No database metadata found in backup',
                            timestamp: Date.now()
                        });
                    }
                    totalDuration = Date.now() - operationStartTime;
                    emitBackupLog(event.sender, {
                        level: 'success',
                        phase: 'complete',
                        message: "Restore completed successfully in ".concat(Math.round(totalDuration / 1000), "s (").concat(filesRestored_1, " files)"),
                        timestamp: Date.now(),
                        metadata: {
                            operation: 'restore',
                            duration: totalDuration,
                            filesProcessed: filesRestored_1
                        }
                    });
                    event.sender.send('backup:progress', { phase: 'Complete', percent: 100, message: 'Restore complete!' });
                    return [2 /*return*/, { success: true, hasMetadata: hasMetadata, filesRestored: filesRestored_1 }];
                case 7:
                    err_5 = _c.sent();
                    totalDuration = Date.now() - operationStartTime;
                    emitBackupLog(event.sender, {
                        level: 'error',
                        phase: 'error',
                        message: "Restore failed after ".concat(Math.round(totalDuration / 1000), "s: ").concat(String(err_5)),
                        timestamp: Date.now(),
                        metadata: { operation: 'restore', error: String(err_5), duration: totalDuration }
                    });
                    return [2 /*return*/, { success: false, error: String(err_5) }];
                case 8: return [2 /*return*/];
            }
        });
    }); });
    // Read database metadata from vault directory
    ipcMain.handle('backup:read-metadata', function (_, vaultPath) { return __awaiter(_this, void 0, void 0, function () {
        var metadataPath, blueplmDir, contents, contents, content, data;
        return __generator(this, function (_a) {
            metadataPath = path.join(vaultPath, '.blueplm', 'database-export.json');
            log('[DEBUG] Looking for metadata at: ' + metadataPath);
            if (!fs.existsSync(metadataPath)) {
                log('[DEBUG] Metadata file NOT found at: ' + metadataPath);
                blueplmDir = path.join(vaultPath, '.blueplm');
                if (fs.existsSync(blueplmDir)) {
                    contents = fs.readdirSync(blueplmDir);
                    log('[DEBUG] .blueplm folder exists, contents: ' + JSON.stringify(contents));
                }
                else {
                    log('[DEBUG] .blueplm folder does not exist');
                    // List top-level contents of vault path
                    if (fs.existsSync(vaultPath)) {
                        contents = fs.readdirSync(vaultPath).slice(0, 20);
                        log('[DEBUG] Vault path contents (first 20): ' + JSON.stringify(contents));
                    }
                }
                return [2 /*return*/, { success: false, error: 'No metadata file found' }];
            }
            try {
                content = fs.readFileSync(metadataPath, 'utf-8');
                log('[DEBUG] Metadata file size: ' + content.length + ' bytes');
                data = JSON.parse(content);
                if (data._type !== 'blueplm_database_export') {
                    log('[DEBUG] Invalid metadata type: ' + data._type);
                    return [2 /*return*/, { success: false, error: 'Invalid metadata file format' }];
                }
                // Debug: log the structure
                log('[DEBUG] Metadata structure:', {
                    _type: data._type,
                    _version: data._version,
                    _exportedAt: data._exportedAt,
                    _orgName: data._orgName,
                    _vaultName: data._vaultName,
                    filesCount: Array.isArray(data.files) ? data.files.length : 'NOT AN ARRAY: ' + typeof data.files,
                    fileVersionsCount: Array.isArray(data.fileVersions) ? data.fileVersions.length : 'NOT AN ARRAY: ' + typeof data.fileVersions
                });
                log('Read database metadata from: ' + metadataPath);
                return [2 /*return*/, { success: true, data: data }];
            }
            catch (err) {
                logError('Failed to read metadata', { error: String(err) });
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    }); });
}
export function unregisterBackupHandlers() {
    var handlers = [
        'backup:check-restic',
        'backup:run',
        'backup:list-snapshots',
        'backup:delete-snapshot',
        'backup:restore',
        'backup:read-metadata'
    ];
    for (var _i = 0, handlers_1 = handlers; _i < handlers_1.length; _i++) {
        var handler = handlers_1[_i];
        ipcMain.removeHandler(handler);
    }
}
