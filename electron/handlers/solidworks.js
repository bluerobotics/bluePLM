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
// SolidWorks handlers for Electron main process
import { app, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import * as CFB from 'cfb';
// Module state
var mainWindow = null;
// External log function reference
var log = console.log;
// SolidWorks service state
var swServiceProcess = null;
var swServiceBuffer = '';
var swPendingRequests = new Map();
var swRequestId = 0;
var solidWorksInstalled = null;
// Thumbnail extraction tracking
var thumbnailsInProgress = new Set();
// Detect if SolidWorks is installed
function isSolidWorksInstalled() {
    if (solidWorksInstalled !== null) {
        return solidWorksInstalled;
    }
    if (process.platform !== 'win32') {
        solidWorksInstalled = false;
        return false;
    }
    try {
        var result = execSync('reg query "HKEY_CLASSES_ROOT\\SldWorks.Application" /ve', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        solidWorksInstalled = result.includes('SldWorks.Application');
        log('[SolidWorks] Installation detected: ' + solidWorksInstalled);
        return solidWorksInstalled;
    }
    catch (_a) {
        var commonPaths = [
            'C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\SLDWORKS.exe',
            'C:\\Program Files\\SolidWorks Corp\\SolidWorks\\SLDWORKS.exe',
            'C:\\Program Files (x86)\\SOLIDWORKS Corp\\SOLIDWORKS\\SLDWORKS.exe',
        ];
        for (var _i = 0, commonPaths_1 = commonPaths; _i < commonPaths_1.length; _i++) {
            var swPath = commonPaths_1[_i];
            if (fs.existsSync(swPath)) {
                solidWorksInstalled = true;
                log('[SolidWorks] Installation detected at: ' + swPath);
                return true;
            }
        }
        solidWorksInstalled = false;
        log('[SolidWorks] Not installed on this machine');
        return false;
    }
}
// Get the path to the SolidWorks service executable
function getSWServicePath() {
    var isPackaged = app.isPackaged;
    var possiblePaths = [
        { path: path.join(process.resourcesPath || '', 'bin', 'BluePLM.SolidWorksService.exe'), isProduction: true },
        { path: path.join(app.getAppPath(), 'solidworks-service', 'BluePLM.SolidWorksService', 'bin', 'Release', 'BluePLM.SolidWorksService.exe'), isProduction: false },
        { path: path.join(app.getAppPath(), 'solidworks-service', 'BluePLM.SolidWorksService', 'bin', 'Debug', 'BluePLM.SolidWorksService.exe'), isProduction: false },
    ];
    for (var _i = 0, possiblePaths_1 = possiblePaths; _i < possiblePaths_1.length; _i++) {
        var p = possiblePaths_1[_i];
        if (fs.existsSync(p.path)) {
            return p;
        }
    }
    return isPackaged ? possiblePaths[0] : possiblePaths[1];
}
// Handle output from the service
function handleSWServiceOutput(data) {
    swServiceBuffer += data;
    var lines = swServiceBuffer.split('\n');
    swServiceBuffer = lines.pop() || '';
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var line = lines_1[_i];
        if (!line.trim())
            continue;
        try {
            var result = JSON.parse(line);
            // Match response to request by requestId (if present) or fall back to FIFO
            var requestId = result.requestId;
            if (requestId !== undefined && swPendingRequests.has(requestId)) {
                var handlers = swPendingRequests.get(requestId);
                swPendingRequests.delete(requestId);
                handlers.resolve(result);
            }
            else {
                // Fallback to FIFO for backwards compatibility
                var entry = swPendingRequests.entries().next().value;
                if (entry) {
                    var id = entry[0], handlers = entry[1];
                    swPendingRequests.delete(id);
                    handlers.resolve(result);
                }
            }
        }
        catch (_a) {
            log('[SolidWorks Service] Failed to parse output: ' + line);
        }
    }
}
// Send a command to the SolidWorks service
function sendSWCommand(command) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (!(swServiceProcess === null || swServiceProcess === void 0 ? void 0 : swServiceProcess.stdin)) {
                return [2 /*return*/, { success: false, error: 'SolidWorks service not running. Start it first.' }];
            }
            return [2 /*return*/, new Promise(function (resolve) {
                    var id = ++swRequestId;
                    var timeout = setTimeout(function () {
                        swPendingRequests.delete(id);
                        resolve({ success: false, error: 'Command timed out' });
                    }, 300000);
                    swPendingRequests.set(id, {
                        resolve: function (result) {
                            clearTimeout(timeout);
                            resolve(result);
                        },
                        reject: function () {
                            clearTimeout(timeout);
                            resolve({ success: false, error: 'Request rejected' });
                        }
                    });
                    // Include requestId in command for response correlation
                    var commandWithId = __assign(__assign({}, command), { requestId: id });
                    var json = JSON.stringify(commandWithId) + '\n';
                    swServiceProcess.stdin.write(json);
                })];
        });
    });
}
// Start the SolidWorks service process
function startSWService(dmLicenseKey) {
    return __awaiter(this, void 0, void 0, function () {
        var result, serviceInfo, servicePath, args;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    log('[SolidWorks] startSWService called');
                    if (!isSolidWorksInstalled()) {
                        log('[SolidWorks] SolidWorks not installed');
                        return [2 /*return*/, {
                                success: false,
                                error: 'SolidWorks not installed',
                                errorDetails: 'SolidWorks is not installed on this machine.'
                            }];
                    }
                    if (!swServiceProcess) return [3 /*break*/, 3];
                    log('[SolidWorks] Service already running');
                    if (!dmLicenseKey) return [3 /*break*/, 2];
                    return [4 /*yield*/, sendSWCommand({ action: 'setDmLicense', licenseKey: dmLicenseKey })];
                case 1:
                    result = _a.sent();
                    if (result.success) {
                        return [2 /*return*/, { success: true, data: { message: 'Service running, license key updated' } }];
                    }
                    _a.label = 2;
                case 2: return [2 /*return*/, { success: true, data: { message: 'Service already running' } }];
                case 3:
                    serviceInfo = getSWServicePath();
                    servicePath = serviceInfo.path;
                    log('[SolidWorks] Service path: ' + servicePath);
                    if (!fs.existsSync(servicePath)) {
                        if (serviceInfo.isProduction) {
                            return [2 /*return*/, {
                                    success: false,
                                    error: 'SolidWorks service not bundled',
                                    errorDetails: 'The SolidWorks service executable was not included in this build.'
                                }];
                        }
                        else {
                            return [2 /*return*/, {
                                    success: false,
                                    error: 'SolidWorks service not built',
                                    errorDetails: "Expected at: ".concat(servicePath, "\n\nBuild it with: dotnet build solidworks-addin/BluePLM.SolidWorksService -c Release")
                                }];
                        }
                    }
                    args = [];
                    if (dmLicenseKey) {
                        args.push('--dm-license', dmLicenseKey);
                    }
                    return [2 /*return*/, new Promise(function (resolve) {
                            var _a, _b;
                            try {
                                swServiceProcess = spawn(servicePath, args, {
                                    stdio: ['pipe', 'pipe', 'pipe'],
                                    windowsHide: true,
                                });
                                (_a = swServiceProcess.stdout) === null || _a === void 0 ? void 0 : _a.on('data', function (data) {
                                    handleSWServiceOutput(data.toString());
                                });
                                (_b = swServiceProcess.stderr) === null || _b === void 0 ? void 0 : _b.on('data', function (data) {
                                    log('[SolidWorks Service] ' + data.toString());
                                });
                                swServiceProcess.on('error', function (err) {
                                    log('[SolidWorks Service] Process error: ' + String(err));
                                    swServiceProcess = null;
                                });
                                swServiceProcess.on('close', function (code, signal) {
                                    log('[SolidWorks Service] Process exited with code: ' + code + ' signal: ' + signal);
                                    swServiceProcess = null;
                                });
                                setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
                                    var pingResult, err_1;
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                _a.trys.push([0, 2, , 3]);
                                                return [4 /*yield*/, sendSWCommand({ action: 'ping' })];
                                            case 1:
                                                pingResult = _a.sent();
                                                log('[SolidWorks] Service started successfully');
                                                resolve(pingResult);
                                                return [3 /*break*/, 3];
                                            case 2:
                                                err_1 = _a.sent();
                                                log('[SolidWorks] Ping failed: ' + String(err_1));
                                                resolve({ success: false, error: String(err_1) });
                                                return [3 /*break*/, 3];
                                            case 3: return [2 /*return*/];
                                        }
                                    });
                                }); }, 1000);
                            }
                            catch (err) {
                                resolve({ success: false, error: String(err) });
                            }
                        })];
            }
        });
    });
}
// Stop the SolidWorks service
function stopSWService() {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!swServiceProcess)
                        return [2 /*return*/];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, sendSWCommand({ action: 'quit' })];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 4:
                    swServiceProcess.kill();
                    swServiceProcess = null;
                    return [2 /*return*/];
            }
        });
    });
}
// Extract SolidWorks thumbnail from file
function extractSolidWorksThumbnail(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var fileName, fileBuffer, cfb, _i, _a, entry, pngSignature, contentBuffer, base64, base64, base64;
        return __generator(this, function (_b) {
            fileName = path.basename(filePath);
            thumbnailsInProgress.add(filePath);
            try {
                fileBuffer = fs.readFileSync(filePath);
                cfb = CFB.read(fileBuffer, { type: 'buffer' });
                // Look for preview streams
                for (_i = 0, _a = cfb.FileIndex; _i < _a.length; _i++) {
                    entry = _a[_i];
                    if (!entry || !entry.content || entry.content.length < 100)
                        continue;
                    pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                    contentBuffer = Buffer.from(entry.content);
                    if (contentBuffer.slice(0, 8).equals(pngSignature)) {
                        log("[SWThumbnail] Found PNG in entry \"".concat(entry.name, "\""));
                        base64 = Buffer.from(entry.content).toString('base64');
                        return [2 /*return*/, { success: true, data: "data:image/png;base64,".concat(base64) }];
                    }
                    // Check for JPEG signature
                    if (entry.content[0] === 0xFF && entry.content[1] === 0xD8 && entry.content[2] === 0xFF) {
                        log("[SWThumbnail] Found JPEG in entry \"".concat(entry.name, "\""));
                        base64 = Buffer.from(entry.content).toString('base64');
                        return [2 /*return*/, { success: true, data: "data:image/jpeg;base64,".concat(base64) }];
                    }
                    // Check for BMP
                    if (entry.content[0] === 0x42 && entry.content[1] === 0x4D) {
                        log("[SWThumbnail] Found BMP in entry \"".concat(entry.name, "\""));
                        base64 = Buffer.from(entry.content).toString('base64');
                        return [2 /*return*/, { success: true, data: "data:image/bmp;base64,".concat(base64) }];
                    }
                }
                log("[SWThumbnail] No thumbnail found in ".concat(fileName));
                return [2 /*return*/, { success: false, error: 'No thumbnail found' }];
            }
            catch (err) {
                log("[SWThumbnail] Failed to extract thumbnail from ".concat(fileName, ": ").concat(err));
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            finally {
                thumbnailsInProgress.delete(filePath);
            }
            return [2 /*return*/];
        });
    });
}
// Extract high-quality preview from SolidWorks file
function extractSolidWorksPreview(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var fileName, fileBuffer, cfb, previewStreamNames, _i, previewStreamNames_1, streamName, entry, pngSignature, contentBuf, base64, base64, dibData, headerSize, pixelOffset, fileSize, bmpHeader, bmpData, base64, _a, _b, entry, pngSignature, base64, base64;
        return __generator(this, function (_c) {
            fileName = path.basename(filePath);
            log("[SWPreview] Extracting preview from: ".concat(fileName));
            try {
                fileBuffer = fs.readFileSync(filePath);
                cfb = CFB.read(fileBuffer, { type: 'buffer' });
                previewStreamNames = [
                    'PreviewPNG',
                    'Preview',
                    'PreviewBitmap',
                    '\\x05PreviewMetaFile',
                    'Thumbnails/thumbnail.png',
                    'PackageContents',
                ];
                // Try named streams first
                for (_i = 0, previewStreamNames_1 = previewStreamNames; _i < previewStreamNames_1.length; _i++) {
                    streamName = previewStreamNames_1[_i];
                    try {
                        entry = CFB.find(cfb, streamName);
                        if (entry && entry.content && entry.content.length > 100) {
                            log("[SWPreview] Found stream \"".concat(streamName, "\" with ").concat(entry.content.length, " bytes"));
                            pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                            contentBuf = Buffer.from(entry.content);
                            if (contentBuf.slice(0, 8).equals(pngSignature)) {
                                log("[SWPreview] Found PNG preview in \"".concat(streamName, "\"!"));
                                base64 = contentBuf.toString('base64');
                                return [2 /*return*/, { success: true, data: "data:image/png;base64,".concat(base64) }];
                            }
                            // Check BMP
                            if (contentBuf[0] === 0x42 && contentBuf[1] === 0x4D) {
                                log("[SWPreview] Found BMP preview in \"".concat(streamName, "\"!"));
                                base64 = contentBuf.toString('base64');
                                return [2 /*return*/, { success: true, data: "data:image/bmp;base64,".concat(base64) }];
                            }
                            // Check DIB (convert to BMP)
                            if (contentBuf[0] === 0x28 && contentBuf[1] === 0x00 && contentBuf[2] === 0x00 && contentBuf[3] === 0x00) {
                                log("[SWPreview] Found DIB preview in \"".concat(streamName, "\", converting to BMP..."));
                                dibData = contentBuf;
                                headerSize = dibData.readInt32LE(0);
                                pixelOffset = 14 + headerSize;
                                fileSize = 14 + dibData.length;
                                bmpHeader = Buffer.alloc(14);
                                bmpHeader.write('BM', 0);
                                bmpHeader.writeInt32LE(fileSize, 2);
                                bmpHeader.writeInt32LE(0, 6);
                                bmpHeader.writeInt32LE(pixelOffset, 10);
                                bmpData = Buffer.concat([bmpHeader, Buffer.from(dibData)]);
                                base64 = bmpData.toString('base64');
                                return [2 /*return*/, { success: true, data: "data:image/bmp;base64,".concat(base64) }];
                            }
                        }
                    }
                    catch (_d) {
                        // Stream doesn't exist
                    }
                }
                // Try all entries
                for (_a = 0, _b = cfb.FileIndex; _a < _b.length; _a++) {
                    entry = _b[_a];
                    if (!entry || !entry.content || entry.content.length < 100)
                        continue;
                    pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                    if (Buffer.from(entry.content.slice(0, 8)).equals(pngSignature)) {
                        log("[SWPreview] Found PNG in entry \"".concat(entry.name, "\"!"));
                        base64 = Buffer.from(entry.content).toString('base64');
                        return [2 /*return*/, { success: true, data: "data:image/png;base64,".concat(base64) }];
                    }
                    if (entry.content[0] === 0xFF && entry.content[1] === 0xD8 && entry.content[2] === 0xFF) {
                        log("[SWPreview] Found JPEG in entry \"".concat(entry.name, "\"!"));
                        base64 = Buffer.from(entry.content).toString('base64');
                        return [2 /*return*/, { success: true, data: "data:image/jpeg;base64,".concat(base64) }];
                    }
                }
                log("[SWPreview] No preview stream found in ".concat(fileName));
                return [2 /*return*/, { success: false, error: 'No preview stream found in file' }];
            }
            catch (err) {
                log("[SWPreview] Failed to extract preview from ".concat(fileName, ": ").concat(err));
                return [2 /*return*/, { success: false, error: String(err) }];
            }
            return [2 /*return*/];
        });
    });
}
// Export functions for use by fs handlers
export function isFileBeingThumbnailed(filePath) {
    return thumbnailsInProgress.has(filePath);
}
export function getThumbnailsInProgress() {
    return thumbnailsInProgress;
}
export function registerSolidWorksHandlers(window, deps) {
    var _this = this;
    mainWindow = window;
    log = deps.log;
    // Thumbnail extraction
    ipcMain.handle('solidworks:extract-thumbnail', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, extractSolidWorksThumbnail(filePath)];
        });
    }); });
    // Preview extraction
    ipcMain.handle('solidworks:extract-preview', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, extractSolidWorksPreview(filePath)];
        });
    }); });
    // Service management
    ipcMain.handle('solidworks:start-service', function (_, dmLicenseKey) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            log('[SolidWorks] IPC: start-service received');
            return [2 /*return*/, startSWService(dmLicenseKey)];
        });
    }); });
    ipcMain.handle('solidworks:stop-service', function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, stopSWService()];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    }); });
    ipcMain.handle('solidworks:service-status', function () { return __awaiter(_this, void 0, void 0, function () {
        var swInstalled, result, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    swInstalled = isSolidWorksInstalled();
                    if (!swInstalled) {
                        return [2 /*return*/, { success: true, data: { running: false, installed: false } }];
                    }
                    if (!swServiceProcess) {
                        return [2 /*return*/, { success: true, data: { running: false, installed: true } }];
                    }
                    return [4 /*yield*/, sendSWCommand({ action: 'ping' })];
                case 1:
                    result = _a.sent();
                    data = result.data;
                    return [2 /*return*/, {
                            success: true,
                            data: {
                                running: result.success,
                                installed: true,
                                version: data === null || data === void 0 ? void 0 : data.version,
                                swInstalled: data === null || data === void 0 ? void 0 : data.swInstalled,
                                documentManagerAvailable: data === null || data === void 0 ? void 0 : data.documentManagerAvailable,
                                documentManagerError: data === null || data === void 0 ? void 0 : data.documentManagerError,
                                fastModeEnabled: data === null || data === void 0 ? void 0 : data.fastModeEnabled
                            }
                        }];
            }
        });
    }); });
    ipcMain.handle('solidworks:is-installed', function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, { success: true, data: { installed: isSolidWorksInstalled() } }];
        });
    }); });
    // Document operations
    ipcMain.handle('solidworks:get-bom', function (_, filePath, options) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand(__assign({ action: 'getBom', filePath: filePath }, options))];
        });
    }); });
    ipcMain.handle('solidworks:get-properties', function (_, filePath, configuration) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'getProperties', filePath: filePath, configuration: configuration })];
        });
    }); });
    ipcMain.handle('solidworks:set-properties', function (_, filePath, properties, configuration) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'setProperties', filePath: filePath, properties: properties, configuration: configuration })];
        });
    }); });
    ipcMain.handle('solidworks:set-properties-batch', function (_, filePath, configProperties) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'setPropertiesBatch', filePath: filePath, configProperties: configProperties })];
        });
    }); });
    ipcMain.handle('solidworks:get-configurations', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'getConfigurations', filePath: filePath })];
        });
    }); });
    ipcMain.handle('solidworks:get-references', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'getReferences', filePath: filePath })];
        });
    }); });
    ipcMain.handle('solidworks:get-preview', function (_, filePath, configuration) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'getPreview', filePath: filePath, configuration: configuration })];
        });
    }); });
    ipcMain.handle('solidworks:get-mass-properties', function (_, filePath, configuration) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'getMassProperties', filePath: filePath, configuration: configuration })];
        });
    }); });
    // Export operations
    ipcMain.handle('solidworks:export-pdf', function (_, filePath, outputPath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'exportPdf', filePath: filePath, outputPath: outputPath })];
        });
    }); });
    ipcMain.handle('solidworks:export-step', function (_, filePath, options) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand(__assign({ action: 'exportStep', filePath: filePath }, options))];
        });
    }); });
    ipcMain.handle('solidworks:export-dxf', function (_, filePath, outputPath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'exportDxf', filePath: filePath, outputPath: outputPath })];
        });
    }); });
    ipcMain.handle('solidworks:export-iges', function (_, filePath, outputPath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'exportIges', filePath: filePath, outputPath: outputPath })];
        });
    }); });
    ipcMain.handle('solidworks:export-image', function (_, filePath, options) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand(__assign({ action: 'exportImage', filePath: filePath }, options))];
        });
    }); });
    ipcMain.handle('solidworks:replace-component', function (_, assemblyPath, oldComponent, newComponent) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'replaceComponent', filePath: assemblyPath, oldComponent: oldComponent, newComponent: newComponent })];
        });
    }); });
    ipcMain.handle('solidworks:pack-and-go', function (_, filePath, outputFolder, options) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand(__assign({ action: 'packAndGo', filePath: filePath, outputFolder: outputFolder }, options))];
        });
    }); });
    // Open document management
    ipcMain.handle('solidworks:get-open-documents', function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'getOpenDocuments' })];
        });
    }); });
    ipcMain.handle('solidworks:is-document-open', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'isDocumentOpen', filePath: filePath })];
        });
    }); });
    ipcMain.handle('solidworks:get-document-info', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'getDocumentInfo', filePath: filePath })];
        });
    }); });
    ipcMain.handle('solidworks:set-document-readonly', function (_, filePath, readOnly) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'setDocumentReadOnly', filePath: filePath, readOnly: readOnly })];
        });
    }); });
    ipcMain.handle('solidworks:save-document', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, sendSWCommand({ action: 'saveDocument', filePath: filePath })];
        });
    }); });
    // eDrawings handlers
    ipcMain.handle('edrawings:check-installed', function () { return __awaiter(_this, void 0, void 0, function () {
        var paths, _i, paths_1, ePath;
        return __generator(this, function (_a) {
            paths = [
                'C:\\Program Files\\SOLIDWORKS Corp\\eDrawings\\eDrawings.exe',
                'C:\\Program Files\\eDrawings\\eDrawings.exe',
                'C:\\Program Files (x86)\\eDrawings\\eDrawings.exe',
                'C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\eDrawings\\eDrawings.exe'
            ];
            for (_i = 0, paths_1 = paths; _i < paths_1.length; _i++) {
                ePath = paths_1[_i];
                if (fs.existsSync(ePath)) {
                    return [2 /*return*/, { installed: true, path: ePath }];
                }
            }
            return [2 /*return*/, { installed: false, path: null }];
        });
    }); });
    ipcMain.handle('edrawings:native-available', function () {
        return false; // Native module not available in refactored version
    });
    ipcMain.handle('edrawings:open-file', function (_, filePath) { return __awaiter(_this, void 0, void 0, function () {
        var eDrawingsPaths, eDrawingsPath, _i, eDrawingsPaths_1, ePath, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    eDrawingsPaths = [
                        'C:\\Program Files\\SOLIDWORKS Corp\\eDrawings\\eDrawings.exe',
                        'C:\\Program Files\\eDrawings\\eDrawings.exe',
                        'C:\\Program Files (x86)\\eDrawings\\eDrawings.exe',
                        'C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\eDrawings\\eDrawings.exe'
                    ];
                    eDrawingsPath = null;
                    for (_i = 0, eDrawingsPaths_1 = eDrawingsPaths; _i < eDrawingsPaths_1.length; _i++) {
                        ePath = eDrawingsPaths_1[_i];
                        if (fs.existsSync(ePath)) {
                            eDrawingsPath = ePath;
                            break;
                        }
                    }
                    if (!!eDrawingsPath) return [3 /*break*/, 4];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, shell.openPath(filePath)];
                case 2:
                    _b.sent();
                    return [2 /*return*/, { success: true, fallback: true }];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, { success: false, error: 'eDrawings not found' }];
                case 4:
                    try {
                        spawn(eDrawingsPath, [filePath], {
                            detached: true,
                            stdio: 'ignore'
                        }).unref();
                        return [2 /*return*/, { success: true }];
                    }
                    catch (err) {
                        return [2 /*return*/, { success: false, error: String(err) }];
                    }
                    return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('edrawings:get-window-handle', function () {
        if (!mainWindow)
            return null;
        var handle = mainWindow.getNativeWindowHandle();
        return Array.from(handle);
    });
    // Placeholder handlers for eDrawings preview (native module not loaded)
    ipcMain.handle('edrawings:create-preview', function () {
        return { success: false, error: 'Native module not available' };
    });
    ipcMain.handle('edrawings:attach-preview', function () {
        return { success: false, error: 'Preview not created' };
    });
    ipcMain.handle('edrawings:load-file', function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, { success: false, error: 'Preview not attached' }];
        });
    }); });
    ipcMain.handle('edrawings:set-bounds', function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, { success: false }];
        });
    }); });
    ipcMain.handle('edrawings:show-preview', function () {
        return { success: false };
    });
    ipcMain.handle('edrawings:hide-preview', function () {
        return { success: false };
    });
    ipcMain.handle('edrawings:destroy-preview', function () {
        return { success: true };
    });
}
export function unregisterSolidWorksHandlers() {
    var handlers = [
        'solidworks:extract-thumbnail', 'solidworks:extract-preview',
        'solidworks:start-service', 'solidworks:stop-service', 'solidworks:service-status', 'solidworks:is-installed',
        'solidworks:get-bom', 'solidworks:get-properties', 'solidworks:set-properties', 'solidworks:set-properties-batch',
        'solidworks:get-configurations', 'solidworks:get-references', 'solidworks:get-preview', 'solidworks:get-mass-properties',
        'solidworks:export-pdf', 'solidworks:export-step', 'solidworks:export-dxf', 'solidworks:export-iges', 'solidworks:export-image',
        'solidworks:replace-component', 'solidworks:pack-and-go',
        'solidworks:get-open-documents', 'solidworks:is-document-open', 'solidworks:get-document-info',
        'solidworks:set-document-readonly', 'solidworks:save-document',
        'edrawings:check-installed', 'edrawings:native-available', 'edrawings:open-file', 'edrawings:get-window-handle',
        'edrawings:create-preview', 'edrawings:attach-preview', 'edrawings:load-file', 'edrawings:set-bounds',
        'edrawings:show-preview', 'edrawings:hide-preview', 'edrawings:destroy-preview'
    ];
    for (var _i = 0, handlers_1 = handlers; _i < handlers_1.length; _i++) {
        var handler = handlers_1[_i];
        ipcMain.removeHandler(handler);
    }
}
