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
// Dialog handlers for Electron main process
import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
// Module state
var mainWindow = null;
var restoreMainWindowFocus = function () { };
var log = console.log;
// Helper to get all files in a directory with relative paths
function getAllFilesInDir(dirPath) {
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
export function registerDialogHandlers(window, deps) {
    var _this = this;
    mainWindow = window;
    log = deps.log;
    restoreMainWindowFocus = deps.restoreMainWindowFocus;
    // Select files to add
    ipcMain.handle('dialog:select-files', function () { return __awaiter(_this, void 0, void 0, function () {
        var result, allFiles, _i, _a, filePath, stats;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, dialog.showOpenDialog(mainWindow, {
                        title: 'Select Files to Add',
                        properties: ['openFile', 'multiSelections'],
                        filters: [
                            { name: 'All Files', extensions: ['*'] },
                            { name: 'CAD Files', extensions: ['sldprt', 'sldasm', 'slddrw', 'step', 'stp', 'iges', 'igs', 'stl', 'pdf'] },
                            { name: 'SolidWorks Parts', extensions: ['sldprt'] },
                            { name: 'SolidWorks Assemblies', extensions: ['sldasm'] },
                            { name: 'SolidWorks Drawings', extensions: ['slddrw'] }
                        ]
                    })];
                case 1:
                    result = _b.sent();
                    restoreMainWindowFocus();
                    if (!result.canceled && result.filePaths.length > 0) {
                        allFiles = [];
                        for (_i = 0, _a = result.filePaths; _i < _a.length; _i++) {
                            filePath = _a[_i];
                            try {
                                stats = fs.statSync(filePath);
                                allFiles.push({
                                    name: path.basename(filePath),
                                    path: filePath,
                                    extension: path.extname(filePath).toLowerCase(),
                                    size: stats.size,
                                    modifiedTime: stats.mtime.toISOString()
                                });
                            }
                            catch (err) {
                                log('Error reading file stats: ' + filePath + ' ' + String(err));
                            }
                        }
                        return [2 /*return*/, { success: true, files: allFiles }];
                    }
                    return [2 /*return*/, { success: false, canceled: true }];
            }
        });
    }); });
    // Select folder to add
    ipcMain.handle('dialog:select-folder', function () { return __awaiter(_this, void 0, void 0, function () {
        var result, folderPath, folderName, allFiles;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dialog.showOpenDialog(mainWindow, {
                        title: 'Select Folder to Add',
                        properties: ['openDirectory']
                    })];
                case 1:
                    result = _a.sent();
                    restoreMainWindowFocus();
                    if (!result.canceled && result.filePaths.length > 0) {
                        folderPath = result.filePaths[0];
                        folderName = path.basename(folderPath);
                        allFiles = getAllFilesInDir(folderPath);
                        return [2 /*return*/, {
                                success: true,
                                folderName: folderName,
                                folderPath: folderPath,
                                files: allFiles
                            }];
                    }
                    return [2 /*return*/, { success: false, canceled: true }];
            }
        });
    }); });
    // Save file dialog
    ipcMain.handle('dialog:save-file', function (_, defaultName, filters) { return __awaiter(_this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dialog.showSaveDialog(mainWindow, {
                        title: 'Save File',
                        defaultPath: defaultName,
                        filters: filters || [{ name: 'All Files', extensions: ['*'] }]
                    })];
                case 1:
                    result = _a.sent();
                    restoreMainWindowFocus();
                    if (!result.canceled && result.filePath) {
                        return [2 /*return*/, { success: true, path: result.filePath }];
                    }
                    return [2 /*return*/, { success: false, canceled: true }];
            }
        });
    }); });
}
export function unregisterDialogHandlers() {
    var handlers = [
        'dialog:select-files',
        'dialog:select-folder',
        'dialog:save-file'
    ];
    for (var _i = 0, handlers_1 = handlers; _i < handlers_1.length; _i++) {
        var handler = handlers_1[_i];
        ipcMain.removeHandler(handler);
    }
}
