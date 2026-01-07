import { contextBridge, ipcRenderer, webUtils } from 'electron';
// Expose APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // App info
    getVersion: function () { return ipcRenderer.invoke('app:get-version'); },
    reloadApp: function () { return ipcRenderer.invoke('app:reload'); },
    requestFocus: function () { return ipcRenderer.invoke('app:request-focus'); },
    openPerformanceWindow: function () { return ipcRenderer.invoke('app:open-performance-window'); },
    createTabWindow: function (view, title, customData) {
        return ipcRenderer.invoke('app:create-tab-window', view, title, customData);
    },
    // System stats
    getSystemStats: function () { return ipcRenderer.invoke('system:get-stats'); },
    // OAuth
    openOAuthWindow: function (url) { return ipcRenderer.invoke('auth:open-oauth-window', url); },
    openGoogleDriveAuth: function (credentials) {
        return ipcRenderer.invoke('auth:google-drive', credentials);
    },
    // Listen for Google Drive iframe session authentication (when user signs in via popup)
    onGdriveSessionAuthenticated: function (callback) {
        var handler = function () { return callback(); };
        ipcRenderer.on('gdrive:session-authenticated', handler);
        return function () { return ipcRenderer.removeListener('gdrive:session-authenticated', handler); };
    },
    getPlatform: function () { return ipcRenderer.invoke('app:get-platform'); },
    getTitleBarOverlayRect: function () { return ipcRenderer.invoke('app:get-titlebar-overlay-rect'); },
    setTitleBarOverlay: function (options) { return ipcRenderer.invoke('app:set-titlebar-overlay', options); },
    getZoomFactor: function () { return ipcRenderer.invoke('app:get-zoom-factor'); },
    setZoomFactor: function (factor) { return ipcRenderer.invoke('app:set-zoom-factor', factor); },
    onZoomChanged: function (callback) {
        var handler = function (_event, factor) { return callback(factor); };
        ipcRenderer.on('zoom-changed', handler);
        return function () { return ipcRenderer.removeListener('zoom-changed', handler); };
    },
    getWindowSize: function () { return ipcRenderer.invoke('app:get-window-size'); },
    setWindowSize: function (width, height) { return ipcRenderer.invoke('app:set-window-size', width, height); },
    resetWindowSize: function () { return ipcRenderer.invoke('app:reset-window-size'); },
    // Machine identification (for backup service)
    getMachineId: function () { return ipcRenderer.invoke('app:get-machine-id'); },
    getMachineName: function () { return ipcRenderer.invoke('app:get-machine-name'); },
    getAppVersion: function () { return ipcRenderer.invoke('app:get-app-version'); },
    // Analytics settings
    setAnalyticsEnabled: function (enabled) { return ipcRenderer.invoke('analytics:set-enabled', enabled); },
    getAnalyticsEnabled: function () { return ipcRenderer.invoke('analytics:get-enabled'); },
    // Clipboard operations (more reliable than navigator.clipboard in Electron)
    copyToClipboard: function (text) { return ipcRenderer.invoke('clipboard:write-text', text); },
    readFromClipboard: function () { return ipcRenderer.invoke('clipboard:read-text'); },
    // Backup execution
    checkResticInstalled: function () { return ipcRenderer.invoke('backup:check-restic'); },
    runBackup: function (config) { return ipcRenderer.invoke('backup:run', config); },
    listBackupSnapshots: function (config) { return ipcRenderer.invoke('backup:list-snapshots', config); },
    restoreFromBackup: function (config) { return ipcRenderer.invoke('backup:restore', config); },
    readBackupMetadata: function (vaultPath) { return ipcRenderer.invoke('backup:read-metadata', vaultPath); },
    deleteBackupSnapshot: function (config) { return ipcRenderer.invoke('backup:delete-snapshot', config); },
    onBackupProgress: function (callback) {
        var handler = function (_, progress) { return callback(progress); };
        ipcRenderer.on('backup:progress', handler);
        return function () { return ipcRenderer.removeListener('backup:progress', handler); };
    },
    onBackupLog: function (callback) {
        var handler = function (_, entry) { return callback(entry); };
        ipcRenderer.on('backup:log', handler);
        return function () { return ipcRenderer.removeListener('backup:log', handler); };
    },
    // Logging
    getLogs: function () { return ipcRenderer.invoke('logs:get-entries'); },
    getLogPath: function () { return ipcRenderer.invoke('logs:get-path'); },
    exportLogs: function () { return ipcRenderer.invoke('logs:export'); },
    log: function (level, message, data) { return ipcRenderer.send('logs:write', level, message, data); },
    getLogsDir: function () { return ipcRenderer.invoke('logs:get-dir'); },
    listLogFiles: function () { return ipcRenderer.invoke('logs:list-files'); },
    readLogFile: function (filePath) { return ipcRenderer.invoke('logs:read-file', filePath); },
    openLogsDir: function () { return ipcRenderer.invoke('logs:open-dir'); },
    deleteLogFile: function (filePath) { return ipcRenderer.invoke('logs:delete-file', filePath); },
    cleanupOldLogs: function () { return ipcRenderer.invoke('logs:cleanup-old'); },
    getLogRetentionSettings: function () { return ipcRenderer.invoke('logs:get-retention-settings'); },
    setLogRetentionSettings: function (settings) {
        return ipcRenderer.invoke('logs:set-retention-settings', settings);
    },
    getLogStorageInfo: function () { return ipcRenderer.invoke('logs:get-storage-info'); },
    getLogRecordingState: function () { return ipcRenderer.invoke('logs:get-recording-state'); },
    setLogRecordingState: function (enabled) { return ipcRenderer.invoke('logs:set-recording-state', enabled); },
    startNewLogFile: function () { return ipcRenderer.invoke('logs:start-new-file'); },
    exportFilteredLogs: function (entries) { return ipcRenderer.invoke('logs:export-filtered', entries); },
    // Crash reports
    listCrashFiles: function () { return ipcRenderer.invoke('logs:list-crashes'); },
    readCrashFile: function (filePath) { return ipcRenderer.invoke('logs:read-crash', filePath); },
    openCrashesDir: function () { return ipcRenderer.invoke('logs:open-crashes-dir'); },
    getCrashesDir: function () { return ipcRenderer.invoke('logs:get-crashes-dir'); },
    // Get file path from dropped File object (for drag & drop)
    getPathForFile: function (file) { return webUtils.getPathForFile(file); },
    // Window controls
    minimize: function () { return ipcRenderer.send('window:minimize'); },
    maximize: function () { return ipcRenderer.send('window:maximize'); },
    close: function () { return ipcRenderer.send('window:close'); },
    isMaximized: function () { return ipcRenderer.invoke('window:is-maximized'); },
    // Working directory
    selectWorkingDir: function () { return ipcRenderer.invoke('working-dir:select'); },
    getWorkingDir: function () { return ipcRenderer.invoke('working-dir:get'); },
    setWorkingDir: function (path) { return ipcRenderer.invoke('working-dir:set', path); },
    createWorkingDir: function (path) { return ipcRenderer.invoke('working-dir:create', path); },
    clearWorkingDir: function () { return ipcRenderer.invoke('working-dir:clear'); },
    // File system operations
    readFile: function (path) { return ipcRenderer.invoke('fs:read-file', path); },
    writeFile: function (path, base64Data) { return ipcRenderer.invoke('fs:write-file', path, base64Data); },
    downloadUrl: function (url, destPath) { return ipcRenderer.invoke('fs:download-url', url, destPath); },
    fileExists: function (path) { return ipcRenderer.invoke('fs:file-exists', path); },
    getFileHash: function (path) { return ipcRenderer.invoke('fs:get-hash', path); },
    listWorkingFiles: function () { return ipcRenderer.invoke('fs:list-working-files'); },
    listDirFiles: function (dirPath) { return ipcRenderer.invoke('fs:list-dir-files', dirPath); },
    computeFileHashes: function (files) {
        return ipcRenderer.invoke('fs:compute-file-hashes', files);
    },
    onHashProgress: function (callback) {
        var handler = function (_, progress) { return callback(progress); };
        ipcRenderer.on('hash-progress', handler);
        return function () { return ipcRenderer.removeListener('hash-progress', handler); };
    },
    createFolder: function (path) { return ipcRenderer.invoke('fs:create-folder', path); },
    deleteItem: function (path) { return ipcRenderer.invoke('fs:delete', path); },
    isDirEmpty: function (path) { return ipcRenderer.invoke('fs:is-dir-empty', path); },
    renameItem: function (oldPath, newPath) { return ipcRenderer.invoke('fs:rename', oldPath, newPath); },
    copyFile: function (sourcePath, destPath) { return ipcRenderer.invoke('fs:copy-file', sourcePath, destPath); },
    moveFile: function (sourcePath, destPath) { return ipcRenderer.invoke('fs:move-file', sourcePath, destPath); },
    openInExplorer: function (path) { return ipcRenderer.invoke('fs:open-in-explorer', path); },
    showInExplorer: function (path) { return ipcRenderer.invoke('fs:open-in-explorer', path); }, // Alias
    openFile: function (path) { return ipcRenderer.invoke('fs:open-file', path); },
    setReadonly: function (path, readonly) { return ipcRenderer.invoke('fs:set-readonly', path, readonly); },
    startDrag: function (filePaths) { return ipcRenderer.send('fs:start-drag', filePaths); },
    isReadonly: function (path) { return ipcRenderer.invoke('fs:is-readonly', path); },
    // Download progress listener (for fs:download-url)
    onDownloadProgress: function (callback) {
        var handler = function (_, progress) { return callback(progress); };
        ipcRenderer.on('download-progress', handler);
        return function () { return ipcRenderer.removeListener('download-progress', handler); };
    },
    // Dialogs
    selectFiles: function () { return ipcRenderer.invoke('dialog:select-files'); },
    selectFolder: function () { return ipcRenderer.invoke('dialog:select-folder'); },
    showSaveDialog: function (defaultName, filters) {
        return ipcRenderer.invoke('dialog:save-file', defaultName, filters);
    },
    // PDF generation
    generatePdfFromHtml: function (htmlContent, outputPath) {
        return ipcRenderer.invoke('pdf:generate-from-html', htmlContent, outputPath);
    },
    // eDrawings preview
    checkEDrawingsInstalled: function () { return ipcRenderer.invoke('edrawings:check-installed'); },
    openInEDrawings: function (filePath) { return ipcRenderer.invoke('edrawings:open-file', filePath); },
    getWindowHandle: function () { return ipcRenderer.invoke('edrawings:get-window-handle'); },
    // SolidWorks thumbnail extraction (low-res, for file browser icons)
    extractSolidWorksThumbnail: function (filePath) { return ipcRenderer.invoke('solidworks:extract-thumbnail', filePath); },
    // SolidWorks high-quality preview extraction (reads OLE stream directly)
    extractSolidWorksPreview: function (filePath) { return ipcRenderer.invoke('solidworks:extract-preview', filePath); },
    // SolidWorks Service API (requires SolidWorks installed)
    solidworks: {
        // Service management
        isInstalled: function () { return ipcRenderer.invoke('solidworks:is-installed'); },
        startService: function (dmLicenseKey) { return ipcRenderer.invoke('solidworks:start-service', dmLicenseKey); },
        stopService: function () { return ipcRenderer.invoke('solidworks:stop-service'); },
        getServiceStatus: function () { return ipcRenderer.invoke('solidworks:service-status'); },
        // Metadata operations
        getBom: function (filePath, options) {
            return ipcRenderer.invoke('solidworks:get-bom', filePath, options);
        },
        getProperties: function (filePath, configuration) {
            return ipcRenderer.invoke('solidworks:get-properties', filePath, configuration);
        },
        setProperties: function (filePath, properties, configuration) {
            return ipcRenderer.invoke('solidworks:set-properties', filePath, properties, configuration);
        },
        setPropertiesBatch: function (filePath, configProperties) {
            return ipcRenderer.invoke('solidworks:set-properties-batch', filePath, configProperties);
        },
        getConfigurations: function (filePath) {
            return ipcRenderer.invoke('solidworks:get-configurations', filePath);
        },
        getReferences: function (filePath) {
            return ipcRenderer.invoke('solidworks:get-references', filePath);
        },
        getPreview: function (filePath, configuration) {
            return ipcRenderer.invoke('solidworks:get-preview', filePath, configuration);
        },
        getMassProperties: function (filePath, configuration) {
            return ipcRenderer.invoke('solidworks:get-mass-properties', filePath, configuration);
        },
        // Export operations
        exportPdf: function (filePath, outputPath) {
            return ipcRenderer.invoke('solidworks:export-pdf', filePath, outputPath);
        },
        exportStep: function (filePath, options) {
            return ipcRenderer.invoke('solidworks:export-step', filePath, options);
        },
        exportDxf: function (filePath, outputPath) {
            return ipcRenderer.invoke('solidworks:export-dxf', filePath, outputPath);
        },
        exportIges: function (filePath, outputPath) {
            return ipcRenderer.invoke('solidworks:export-iges', filePath, outputPath);
        },
        exportImage: function (filePath, options) {
            return ipcRenderer.invoke('solidworks:export-image', filePath, options);
        },
        // Assembly operations
        replaceComponent: function (assemblyPath, oldComponent, newComponent) {
            return ipcRenderer.invoke('solidworks:replace-component', assemblyPath, oldComponent, newComponent);
        },
        packAndGo: function (filePath, outputFolder, options) {
            return ipcRenderer.invoke('solidworks:pack-and-go', filePath, outputFolder, options);
        },
        // Open Document Management (control files open in SolidWorks without closing them!)
        getOpenDocuments: function () { return ipcRenderer.invoke('solidworks:get-open-documents'); },
        isDocumentOpen: function (filePath) { return ipcRenderer.invoke('solidworks:is-document-open', filePath); },
        getDocumentInfo: function (filePath) { return ipcRenderer.invoke('solidworks:get-document-info', filePath); },
        setDocumentReadOnly: function (filePath, readOnly) {
            return ipcRenderer.invoke('solidworks:set-document-readonly', filePath, readOnly);
        },
        saveDocument: function (filePath) { return ipcRenderer.invoke('solidworks:save-document', filePath); },
    },
    // RFQ Release Files API
    rfq: {
        getOutputDir: function (rfqId, rfqNumber) {
            return ipcRenderer.invoke('rfq:get-output-dir', rfqId, rfqNumber);
        },
        exportReleaseFile: function (options) { return ipcRenderer.invoke('rfq:export-release-file', options); },
        createZip: function (options) { return ipcRenderer.invoke('rfq:create-zip', options); },
        openFolder: function (rfqId, rfqNumber) {
            return ipcRenderer.invoke('rfq:open-folder', rfqId, rfqNumber);
        },
    },
    // Embedded eDrawings preview
    isEDrawingsNativeAvailable: function () { return ipcRenderer.invoke('edrawings:native-available'); },
    createEDrawingsPreview: function () { return ipcRenderer.invoke('edrawings:create-preview'); },
    attachEDrawingsPreview: function () { return ipcRenderer.invoke('edrawings:attach-preview'); },
    loadEDrawingsFile: function (filePath) { return ipcRenderer.invoke('edrawings:load-file', filePath); },
    setEDrawingsBounds: function (x, y, w, h) { return ipcRenderer.invoke('edrawings:set-bounds', x, y, w, h); },
    showEDrawingsPreview: function () { return ipcRenderer.invoke('edrawings:show-preview'); },
    hideEDrawingsPreview: function () { return ipcRenderer.invoke('edrawings:hide-preview'); },
    destroyEDrawingsPreview: function () { return ipcRenderer.invoke('edrawings:destroy-preview'); },
    // Auto Updater
    checkForUpdates: function () { return ipcRenderer.invoke('updater:check'); },
    downloadUpdate: function () { return ipcRenderer.invoke('updater:download'); },
    downloadVersionInstaller: function (version, downloadUrl) { return ipcRenderer.invoke('updater:download-version', version, downloadUrl); },
    runInstaller: function (filePath) { return ipcRenderer.invoke('updater:run-installer', filePath); },
    installUpdate: function () { return ipcRenderer.invoke('updater:install'); },
    getUpdateStatus: function () { return ipcRenderer.invoke('updater:get-status'); },
    postponeUpdate: function (version) { return ipcRenderer.invoke('updater:postpone', version); },
    clearUpdateReminder: function () { return ipcRenderer.invoke('updater:clear-reminder'); },
    getUpdateReminder: function () { return ipcRenderer.invoke('updater:get-reminder'); },
    // Update event listeners
    onUpdateChecking: function (callback) {
        ipcRenderer.on('updater:checking', callback);
        return function () { return ipcRenderer.removeListener('updater:checking', callback); };
    },
    onUpdateAvailable: function (callback) {
        var handler = function (_, info) { return callback(info); };
        ipcRenderer.on('updater:available', handler);
        return function () { return ipcRenderer.removeListener('updater:available', handler); };
    },
    onUpdateNotAvailable: function (callback) {
        var handler = function (_, info) { return callback(info); };
        ipcRenderer.on('updater:not-available', handler);
        return function () { return ipcRenderer.removeListener('updater:not-available', handler); };
    },
    onUpdateDownloadProgress: function (callback) {
        var handler = function (_, progress) { return callback(progress); };
        ipcRenderer.on('updater:download-progress', handler);
        return function () { return ipcRenderer.removeListener('updater:download-progress', handler); };
    },
    onUpdateDownloaded: function (callback) {
        var handler = function (_, info) { return callback(info); };
        ipcRenderer.on('updater:downloaded', handler);
        return function () { return ipcRenderer.removeListener('updater:downloaded', handler); };
    },
    onUpdateError: function (callback) {
        var handler = function (_, error) { return callback(error); };
        ipcRenderer.on('updater:error', handler);
        return function () { return ipcRenderer.removeListener('updater:error', handler); };
    },
    // Menu event listeners
    onMenuEvent: function (callback) {
        var events = [
            'menu:set-working-dir',
            'menu:add-files',
            'menu:add-folder',
            'menu:checkout',
            'menu:checkin',
            'menu:refresh',
            'menu:select-all',
            'menu:find',
            'menu:toggle-sidebar',
            'menu:toggle-details',
            'menu:about'
        ];
        events.forEach(function (event) {
            ipcRenderer.on(event, function () { return callback(event); });
        });
        return function () {
            events.forEach(function (event) {
                ipcRenderer.removeAllListeners(event);
            });
        };
    },
    // File change listener
    onFilesChanged: function (callback) {
        var handler = function (_, files) { return callback(files); };
        ipcRenderer.on('files-changed', handler);
        return function () {
            ipcRenderer.removeListener('files-changed', handler);
        };
    },
    // Auth session listener (for OAuth callback in production)
    onSetSession: function (callback) {
        var handler = function (_, tokens) { return callback(tokens); };
        ipcRenderer.on('auth:set-session', handler);
        return function () {
            ipcRenderer.removeListener('auth:set-session', handler);
        };
    },
    // External CLI command listener
    onCliCommand: function (callback) {
        var handler = function (_, data) { return callback(data); };
        ipcRenderer.on('cli-command', handler);
        return function () {
            ipcRenderer.removeListener('cli-command', handler);
        };
    },
    // Send CLI command response back to main process
    sendCliResponse: function (requestId, result) {
        ipcRenderer.send('cli-response', { requestId: requestId, result: result });
    }
});
