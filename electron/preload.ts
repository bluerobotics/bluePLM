import { contextBridge as electronContextBridge, ipcRenderer, webUtils } from 'electron'
import { PERF_BOOT_ARG } from './perfBootFlag'
import type { LocalFileInfo } from './types'

// Result types
interface OperationResult {
  success: boolean
  error?: string
  canceled?: boolean
}

interface FileOperationResult extends OperationResult {
  fileCount?: number // Number of files processed (for copy/move of directories)
}

interface PathResult extends OperationResult {
  path?: string
}

interface FileReadResult extends OperationResult {
  data?: string // Base64 encoded
  size?: number
  hash?: string // SHA-256 hash
  locked?: boolean // true if file is locked by another process
}

interface FileWriteResult extends OperationResult {
  hash?: string
  size?: number
}

interface FilesListResult extends OperationResult {
  files?: LocalFileInfo[]
}

interface FileStatResult extends OperationResult {
  size?: number
  modifiedTime?: string
  isDirectory?: boolean
}

/** A SolidWorks release as described by its COM registration. Mirrors the main-process type. */
interface SolidWorksComInstall {
  progId: string
  clsid: string
  exePath: string
  year: number
  isDefault: boolean
}

interface FileSelectResult extends OperationResult {
  files?: Array<{
    name: string
    path: string
    extension: string
    size: number
    modifiedTime: string
  }>
}

interface FolderSelectResult extends OperationResult {
  folderName?: string
  folderPath?: string
  files?: Array<{
    name: string
    path: string
    relativePath: string
    extension: string
    size: number
    modifiedTime: string
  }>
}

interface SaveDialogResult extends OperationResult {
  filePath?: string
}

interface DirectorySelectResult extends OperationResult {
  path?: string
  canceled?: boolean
}

interface TitleBarOverlayRect {
  x: number
  y: number
  width: number
  height: number
}

// A render-performance boot (electron/perfBoot.ts; main passes PERF_BOOT_ARG only when unpackaged)
// exposes the real API as `electronAPIReal`, leaving `electronAPI` to the renderer's fakes.
const contextBridge: Pick<typeof electronContextBridge, 'exposeInMainWorld'> = process.argv.includes(
  PERF_BOOT_ARG,
)
  ? {
      exposeInMainWorld: (key, api) =>
        electronContextBridge.exposeInMainWorld(key === 'electronAPI' ? 'electronAPIReal' : key, api),
    }
  : electronContextBridge

// Expose APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  reloadApp: () => ipcRenderer.invoke('app:reload'),
  requestFocus: () => ipcRenderer.invoke('app:request-focus'),
  openPerformanceWindow: () => ipcRenderer.invoke('app:open-performance-window'),

  // OAuth
  openOAuthWindow: (url: string) => ipcRenderer.invoke('auth:open-oauth-window', url),
  openGoogleDriveAuth: (credentials?: { clientId?: string; clientSecret?: string }) =>
    ipcRenderer.invoke('auth:google-drive', credentials),
  // Listen for Google Drive iframe session authentication (when user signs in via popup)
  onGdriveSessionAuthenticated: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('gdrive:session-authenticated', handler)
    return () => ipcRenderer.removeListener('gdrive:session-authenticated', handler)
  },
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  getTitleBarOverlayRect: (): Promise<TitleBarOverlayRect> =>
    ipcRenderer.invoke('app:get-titlebar-overlay-rect'),
  setTitleBarOverlay: (options: { color: string; symbolColor: string }) =>
    ipcRenderer.invoke('app:set-titlebar-overlay', options),
  getZoomFactor: () => ipcRenderer.invoke('app:get-zoom-factor'),
  setZoomFactor: (factor: number) => ipcRenderer.invoke('app:set-zoom-factor', factor),
  onZoomChanged: (callback: (factor: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, factor: number) => callback(factor)
    ipcRenderer.on('zoom-changed', handler)
    return () => ipcRenderer.removeListener('zoom-changed', handler)
  },
  getWindowSize: () => ipcRenderer.invoke('app:get-window-size'),
  setWindowSize: (width: number, height: number) =>
    ipcRenderer.invoke('app:set-window-size', width, height),
  resetWindowSize: () => ipcRenderer.invoke('app:reset-window-size'),

  // Machine identification (for backup service)
  getMachineId: () => ipcRenderer.invoke('app:get-machine-id'),
  getMachineName: () => ipcRenderer.invoke('app:get-machine-name'),
  getAppVersion: () => ipcRenderer.invoke('app:get-app-version'),

  // Set when the main process reloaded this window to recover from a renderer
  // crash. Pulled rather than pushed because the reload finishes before React
  // can subscribe to anything.
  consumeCrashNotice: () => ipcRenderer.invoke('app:consume-crash-notice'),

  // Analytics settings
  setAnalyticsEnabled: (enabled: boolean) => ipcRenderer.invoke('analytics:set-enabled', enabled),

  // Clipboard operations (more reliable than navigator.clipboard in Electron)
  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  readFromClipboard: () => ipcRenderer.invoke('clipboard:read-text'),
  // Read file paths from clipboard (for Ctrl+V paste from Windows Explorer)
  readFilePathsFromClipboard: () => ipcRenderer.invoke('clipboard:read-file-paths'),

  // Backup execution
  isBackupRunning: () =>
    ipcRenderer.invoke('backup:is-running') as Promise<{
      running: boolean
      startedAt: number | null
    }>,
  runBackup: (config: {
    provider: string
    bucket: string
    region?: string
    endpoint?: string
    accessKey: string
    secretKey: string
    resticPassword: string
    retentionDaily: number
    retentionWeekly: number
    retentionMonthly: number
    retentionYearly: number
    localBackupEnabled?: boolean
    localBackupPath?: string
    metadataJson?: string // Database metadata export
    vaultName?: string // Vault name for tagging
    vaultPath?: string // Override vault path
  }) => ipcRenderer.invoke('backup:run', config),
  listBackupSnapshots: (config: {
    provider: string
    bucket: string
    region?: string
    endpoint?: string
    accessKey: string
    secretKey: string
    resticPassword: string
  }) => ipcRenderer.invoke('backup:list-snapshots', config),
  restoreFromBackup: (config: {
    provider: string
    bucket: string
    region?: string
    endpoint?: string
    accessKey: string
    secretKey: string
    resticPassword: string
    snapshotId: string
    targetPath: string
    specificPaths?: string[]
  }) => ipcRenderer.invoke('backup:restore', config),
  readBackupMetadata: (vaultPath: string) => ipcRenderer.invoke('backup:read-metadata', vaultPath),
  deleteBackupSnapshot: (config: {
    provider: string
    bucket: string
    region?: string
    endpoint?: string
    accessKey: string
    secretKey: string
    resticPassword: string
    snapshotId: string
  }) => ipcRenderer.invoke('backup:delete-snapshot', config),
  onBackupProgress: (
    callback: (progress: { phase: string; percent: number; message: string }) => void,
  ) => {
    const handler = (_: unknown, progress: { phase: string; percent: number; message: string }) =>
      callback(progress)
    ipcRenderer.on('backup:progress', handler)
    return () => ipcRenderer.removeListener('backup:progress', handler)
  },
  onBackupLog: (
    callback: (entry: {
      level: 'debug' | 'info' | 'warn' | 'error' | 'success'
      phase: string
      message: string
      timestamp: number
      metadata?: {
        operation?: string
        exitCode?: number
        filesProcessed?: number
        filesTotal?: number
        bytesProcessed?: number
        bytesTotal?: number
        currentFile?: string
        error?: string
        duration?: number
      }
    }) => void,
  ) => {
    const handler = (
      _: unknown,
      entry: {
        level: 'debug' | 'info' | 'warn' | 'error' | 'success'
        phase: string
        message: string
        timestamp: number
        metadata?: {
          operation?: string
          exitCode?: number
          filesProcessed?: number
          filesTotal?: number
          bytesProcessed?: number
          bytesTotal?: number
          currentFile?: string
          error?: string
          duration?: number
        }
      },
    ) => callback(entry)
    ipcRenderer.on('backup:log', handler)
    return () => ipcRenderer.removeListener('backup:log', handler)
  },

  // Logging
  getLogs: () => ipcRenderer.invoke('logs:get-entries'),
  exportLogs: () => ipcRenderer.invoke('logs:export'),
  log: (level: string, message: string, data?: unknown) =>
    ipcRenderer.send('logs:write', level, message, data),
  reportRendererStall: (payload: { durationMs: number; source: string }) =>
    ipcRenderer.send('diagnostics:renderer-stall', payload),
  clearIndexedDbStorage: () => ipcRenderer.invoke('diagnostics:clear-indexeddb'),
  getLogsDir: () => ipcRenderer.invoke('logs:get-dir'),
  writeDivergenceReport: (fileName: string, content: string) =>
    ipcRenderer.invoke('logs:write-divergence-report', fileName, content),
  listLogFiles: () => ipcRenderer.invoke('logs:list-files'),
  readLogFile: (filePath: string) => ipcRenderer.invoke('logs:read-file', filePath),
  openLogsDir: () => ipcRenderer.invoke('logs:open-dir'),
  deleteLogFile: (filePath: string) => ipcRenderer.invoke('logs:delete-file', filePath),
  deleteAllLogFiles: () => ipcRenderer.invoke('logs:delete-all-files'),
  cleanupOldLogs: () => ipcRenderer.invoke('logs:cleanup-old'),
  getLogRetentionSettings: () => ipcRenderer.invoke('logs:get-retention-settings'),
  setLogRetentionSettings: (settings: {
    maxFiles?: number
    maxAgeDays?: number
    maxSizeMb?: number
    maxTotalSizeMb?: number
  }) => ipcRenderer.invoke('logs:set-retention-settings', settings),
  getLogStorageInfo: () => ipcRenderer.invoke('logs:get-storage-info'),
  getLogRecordingState: () => ipcRenderer.invoke('logs:get-recording-state'),
  setLogRecordingState: (enabled: boolean) =>
    ipcRenderer.invoke('logs:set-recording-state', enabled),
  startNewLogFile: () => ipcRenderer.invoke('logs:start-new-file'),
  exportFilteredLogs: (entries: Array<{ raw: string }>) =>
    ipcRenderer.invoke('logs:export-filtered', entries),

  // Crash reports
  listCrashFiles: () => ipcRenderer.invoke('logs:list-crashes'),
  readCrashFile: (filePath: string) => ipcRenderer.invoke('logs:read-crash', filePath),
  openCrashesDir: () => ipcRenderer.invoke('logs:open-crashes-dir'),

  // Get file path from dropped File object (for drag & drop)
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // Window controls
  close: () => ipcRenderer.send('window:close'),

  // Working directory
  selectWorkingDir: () => ipcRenderer.invoke('working-dir:select'),
  setWorkingDir: (path: string) => ipcRenderer.invoke('working-dir:set', path),
  createWorkingDir: (path: string) => ipcRenderer.invoke('working-dir:create', path),
  clearWorkingDir: () => ipcRenderer.invoke('working-dir:clear'),

  // File system operations
  readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path),
  checkFileLock: (path: string, options?: { forRead?: boolean }) =>
    ipcRenderer.invoke('fs:check-file-lock', path, options),
  writeFile: (path: string, base64Data: string) =>
    ipcRenderer.invoke('fs:write-file', path, base64Data),
  downloadUrl: (url: string, destPath: string, expectedHash?: string) =>
    ipcRenderer.invoke('fs:download-url', url, destPath, expectedHash),
  fileExists: (path: string) => ipcRenderer.invoke('fs:file-exists', path),
  // Streaming hash - more efficient for large files, use this for checkin operations
  hashFile: (path: string) => ipcRenderer.invoke('fs:hash-file', path),
  statFile: (path: string) => ipcRenderer.invoke('fs:stat-file', path),
  listWorkingFiles: () => ipcRenderer.invoke('fs:list-working-files'),
  // Re-stats only the given paths and patches them into the last full scan.
  // Still returns the complete list, so callers see an unchanged view of the vault.
  listWorkingFilesDelta: (changedPaths: string[]) =>
    ipcRenderer.invoke('fs:list-working-files-delta', changedPaths),
  // Forces the next delta call to re-walk the vault instead of patching the cached scan.
  invalidateScanCache: (reason: string) =>
    ipcRenderer.invoke('fs:invalidate-scan-cache', reason),
  listDirFiles: (dirPath: string) => ipcRenderer.invoke('fs:list-dir-files', dirPath),
  // Fast folder listing - no hash computation (for folder-scoped refresh)
  listFolderFast: (folderRelativePath: string) =>
    ipcRenderer.invoke('fs:list-folder-fast', folderRelativePath),
  computeFileHashes: (
    files: Array<{ path: string; relativePath: string; size: number; mtime: number }>,
  ) => ipcRenderer.invoke('fs:compute-file-hashes', files),
  createFolder: (path: string) => ipcRenderer.invoke('fs:create-folder', path),
  // `isAutomatic` marks a delete nobody is watching (e.g. auto-discard of orphaned
  // files): the main process will never permanently delete on that path, even if
  // shell.trashItem cannot recycle the file - it leaves the file on disk and
  // reports it as `skipped` instead. Defaults to false (explicit user delete),
  // which keeps the existing trash-then-permanent-delete fallback behavior.
  deleteItem: (path: string, isAutomatic?: boolean) =>
    ipcRenderer.invoke('fs:delete', path, isAutomatic ?? false),
  // Batch delete operations - much faster than individual deleteItem calls
  // Stops file watcher ONCE, deletes all files, restarts watcher ONCE
  deleteBatch: (paths: string[], useTrash?: boolean, isAutomatic?: boolean) =>
    ipcRenderer.invoke('fs:delete-batch', paths, useTrash ?? true, isAutomatic ?? false),
  // No `isAutomatic` argument here, on purpose - see the doc comment on
  // `trashEmptyDirs` in src/electron.d.ts.
  trashEmptyDirs: (paths: string[]) => ipcRenderer.invoke('fs:trash-empty-dirs', paths),
  isDirEmpty: (path: string) => ipcRenderer.invoke('fs:is-dir-empty', path),
  isDirectory: (path: string) => ipcRenderer.invoke('fs:is-directory', path),
  renameItem: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),
  copyFile: (sourcePath: string, destPath: string) =>
    ipcRenderer.invoke('fs:copy-file', sourcePath, destPath),
  moveFile: (sourcePath: string, destPath: string) =>
    ipcRenderer.invoke('fs:move-file', sourcePath, destPath),
  openInExplorer: (path: string) => ipcRenderer.invoke('fs:open-in-explorer', path),
  showInExplorer: (path: string) => ipcRenderer.invoke('fs:open-in-explorer', path), // Alias
  openFile: (path: string) => ipcRenderer.invoke('fs:open-file', path),
  setReadonly: (path: string, readonly: boolean) =>
    ipcRenderer.invoke('fs:set-readonly', path, readonly),
  setReadonlyBatch: (files: Array<{ path: string; readonly: boolean }>) =>
    ipcRenderer.invoke('fs:set-readonly-batch', files),
  startDrag: (filePaths: string[]) => ipcRenderer.send('fs:start-drag', filePaths),
  isReadonly: (path: string) => ipcRenderer.invoke('fs:is-readonly', path),

  // Test framework support
  getFileHashEx: (filePath: string, algorithm?: string) =>
    ipcRenderer.invoke('fs:get-file-hash', filePath, algorithm),
  readTextFile: (filePath: string) => ipcRenderer.invoke('fs:read-text-file', filePath),

  // Download progress listener (for fs:download-url)

  // Dialogs
  selectFiles: () => ipcRenderer.invoke('dialog:select-files'),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  selectDirectory: (title?: string, defaultPath?: string) =>
    ipcRenderer.invoke('dialog:select-directory', title, defaultPath),
  showSaveDialog: (defaultName: string, filters?: Array<{ name: string; extensions: string[] }>) =>
    ipcRenderer.invoke('dialog:save-file', defaultName, filters),
  saveTextFileWithDialog: (
    defaultName: string,
    utf8Content: string,
    filters?: Array<{ name: string; extensions: string[] }>,
  ) => ipcRenderer.invoke('dialog:save-text-file', defaultName, utf8Content, filters),

  // PDF generation
  generatePdfFromHtml: (htmlContent: string, outputPath: string) =>
    ipcRenderer.invoke('pdf:generate-from-html', htmlContent, outputPath),

  // eDrawings preview
  checkEDrawingsInstalled: () => ipcRenderer.invoke('edrawings:check-installed'),
  openInEDrawings: (filePath: string) => ipcRenderer.invoke('edrawings:open-file', filePath),

  // SolidWorks thumbnail extraction (low-res, for file browser icons)

  // SolidWorks high-quality preview extraction (reads OLE stream directly)
  extractSolidWorksPreview: (filePath: string) =>
    ipcRenderer.invoke('solidworks:extract-preview', filePath),

  // Cancel queued thumbnail/preview extractions for files in a folder (used before folder moves)
  cancelPreviewsForFolder: (folderPath: string) =>
    ipcRenderer.invoke('sw:cancel-previews-for-folder', folderPath),

  // Drop queued previews outside keepFolderPath (used when navigating between folders)
  cancelPreviews: (keepFolderPath?: string) =>
    ipcRenderer.invoke('sw:cancel-previews', keepFolderPath),

  // Generate cache entries for a folder's uncached CAD files in the background
  prewarmThumbnails: (folderPath: string) =>
    ipcRenderer.invoke('thumbnails:prewarm-folder', folderPath),

  // Release SolidWorks Document Manager handles (used before folder moves to prevent EPERM)
  releaseHandles: () => ipcRenderer.invoke('sw:release-handles'),

  // Check if SLDWORKS.exe process is running (lightweight check, no service call)
  // This is useful for detecting if SolidWorks is open BEFORE attempting file operations

  // Test file locks in a folder (debugging tool for folder move failures)

  // Check ALL files in a folder for locks before folder move operations
  checkFolderLocks: (folderPath: string) => ipcRenderer.invoke('fs:check-folder-locks', folderPath),

  // Listen for folder lock check progress events

  // SolidWorks Service API (requires SolidWorks installed)
  solidworks: {
    // File lock detection (uses Windows Restart Manager API, does NOT require SolidWorks)

    // Service management
    isInstalled: () => ipcRenderer.invoke('solidworks:is-installed'),
    startService: (dmLicenseKey?: string, cleanupOrphans?: boolean, verboseLogging?: boolean) =>
      ipcRenderer.invoke('solidworks:start-service', dmLicenseKey, cleanupOrphans, verboseLogging),
    setAutoStartConfig: (config: {
      autoStartEnabled: boolean
      integrationEnabled: boolean
      dmLicenseKey?: string
      verboseLogging?: boolean
      swProgId?: string | null
    }) => ipcRenderer.invoke('solidworks:set-autostart-config', config),
    getComInstalls: () => ipcRenderer.invoke('solidworks:get-com-installs'),
    stopService: () => ipcRenderer.invoke('solidworks:stop-service'),
    forceRestart: (dmLicenseKey?: string) =>
      ipcRenderer.invoke('solidworks:force-restart', dmLicenseKey),
    resetComConnection: () => ipcRenderer.invoke('solidworks:reset-com-connection'),
    getServiceStatus: () => ipcRenderer.invoke('solidworks:service-status'),
    warmup: () => ipcRenderer.invoke('solidworks:warmup'),

    // Leaked SolidWorks instance management

    // Metadata operations
    getBom: (filePath: string, options?: { includeChildren?: boolean; configuration?: string }) =>
      ipcRenderer.invoke('solidworks:get-bom', filePath, options),
    getProperties: (filePath: string, configuration?: string) =>
      ipcRenderer.invoke('solidworks:get-properties', filePath, configuration),
    // Reads only through Document Manager, never through a running SolidWorks session.
    getPropertiesDocumentManager: (filePath: string, configuration?: string) =>
      ipcRenderer.invoke('solidworks:get-properties-document-manager', filePath, configuration),
    setProperties: (filePath: string, properties: Record<string, string>, configuration?: string) =>
      ipcRenderer.invoke('solidworks:set-properties', filePath, properties, configuration),
    setPropertiesBatch: (
      filePath: string,
      configProperties: Record<string, Record<string, string>>,
    ) => ipcRenderer.invoke('solidworks:set-properties-batch', filePath, configProperties),
    getConfigurations: (filePath: string) =>
      ipcRenderer.invoke('solidworks:get-configurations', filePath),
    getReferences: (filePath: string, origin?: 'foreground' | 'background') =>
      ipcRenderer.invoke('solidworks:get-references', filePath, origin),
    cancelBackgroundReferences: (reason?: string) =>
      ipcRenderer.invoke('solidworks:cancel-background-references', reason),
    extractDrawingCharacteristics: (filePath: string) =>
      ipcRenderer.invoke('solidworks:extract-drawing-characteristics', filePath),
    applyInspectionBalloons: (
      filePath: string,
      balloons: Array<{ sourceKey: string; label: string; persistRef?: string }>,
    ) => ipcRenderer.invoke('solidworks:apply-inspection-balloons', filePath, balloons),

    // Document creation
    createDocumentFromTemplate: (templatePath: string, outputPath: string) =>
      ipcRenderer.invoke('solidworks:create-document-from-template', templatePath, outputPath),

    // Export operations
    exportPdf: (
      filePath: string,
      options?: {
        outputPath?: string
        filenamePattern?: string
        pdmMetadata?: {
          partNumber?: string
          tabNumber?: string
          revision?: string
          description?: string
        }
      },
    ) => ipcRenderer.invoke('solidworks:export-pdf', filePath, options),
    exportStep: (
      filePath: string,
      options?: {
        outputPath?: string
        configuration?: string
        exportAllConfigs?: boolean
        configurations?: string[]
        filenamePattern?: string
        pdmMetadata?: {
          partNumber?: string
          tabNumber?: string
          revision?: string
          description?: string
        }
        pdmMetadataOverride?: boolean
      },
    ) => ipcRenderer.invoke('solidworks:export-step', filePath, options),
    exportDxf: (filePath: string, outputPath?: string) =>
      ipcRenderer.invoke('solidworks:export-dxf', filePath, outputPath),
    exportIges: (
      filePath: string,
      options?: { outputPath?: string; exportAllConfigs?: boolean; configurations?: string[] },
    ) => ipcRenderer.invoke('solidworks:export-iges', filePath, options),
    exportStl: (
      filePath: string,
      options?: {
        outputPath?: string
        exportAllConfigs?: boolean
        configurations?: string[]
        resolution?: 'coarse' | 'fine' | 'custom'
        binaryFormat?: boolean
        customDeviation?: number // mm, for custom resolution
        customAngle?: number // degrees, for custom resolution
        filenamePattern?: string
        pdmMetadata?: {
          partNumber?: string
          tabNumber?: string
          revision?: string
          description?: string
        }
      },
    ) => ipcRenderer.invoke('solidworks:export-stl', filePath, options),

    // Assembly operations
    packAndGo: (
      filePath: string,
      outputFolder: string,
      options?: { prefix?: string; suffix?: string },
    ) => ipcRenderer.invoke('solidworks:pack-and-go', filePath, outputFolder, options),
    duplicateWithReferences: (args: {
      sourceModelPath: string
      targetModelPath: string
      sourceDrawingPath?: string
      targetDrawingPath?: string
    }) => ipcRenderer.invoke('solidworks:duplicate-with-references', args),
    retargetReferences: (args: { packageRoot: string; files?: string[]; vaultRoots?: string[] }) =>
      ipcRenderer.invoke('solidworks:retarget-references', args),
    addComponent: (
      assemblyPath: string | null,
      componentPath: string,
      coordinates?: { x: number; y: number; z: number },
    ) => ipcRenderer.invoke('solidworks:add-component', assemblyPath, componentPath, coordinates),

    // Open Document Management (control files open in SolidWorks without closing them!)
    getOpenDocuments: (options?: { includeComponents?: boolean }) =>
      ipcRenderer.invoke('solidworks:get-open-documents', options),
    isDocumentOpen: (filePath: string) =>
      ipcRenderer.invoke('solidworks:is-document-open', filePath),
    setDocumentReadOnly: (filePath: string, readOnly: boolean) =>
      ipcRenderer.invoke('solidworks:set-document-readonly', filePath, readOnly),
    setDocumentProperties: (
      filePath: string,
      properties: Record<string, string>,
      configuration?: string,
    ) =>
      ipcRenderer.invoke('solidworks:set-document-properties', filePath, properties, configuration),

    // Selection tracking - get currently selected components in the active assembly
    getSelectedFiles: () => ipcRenderer.invoke('solidworks:get-selected-files'),

    // File Locations (Registry) - for template folder configuration
    getInstalledVersions: () => ipcRenderer.invoke('solidworks:get-installed-versions'),
    setFileLocations: (settings: {
      documentTemplates?: string
      sheetFormats?: string
      bomTemplates?: string
      customPropertyFolders?: string
      promptForTemplate?: boolean
    }) => ipcRenderer.invoke('solidworks:set-file-locations', settings),

    // License Registry Operations (HKLM - requires admin for write operations)
    getLicenseRegistry: () => ipcRenderer.invoke('solidworks:get-license-registry'),
    setLicenseRegistry: (serialNumber: string) =>
      ipcRenderer.invoke('solidworks:set-license-registry', serialNumber),
    removeLicenseRegistry: (serialNumber: string) =>
      ipcRenderer.invoke('solidworks:remove-license-registry', serialNumber),
    checkLicenseRegistry: (serialNumber: string) =>
      ipcRenderer.invoke('solidworks:check-license-registry', serialNumber),
  },

  // RFQ Release Files API
  rfq: {
    getOutputDir: (rfqId: string, rfqNumber?: string) =>
      ipcRenderer.invoke('rfq:get-output-dir', rfqId, rfqNumber),
    exportReleaseFile: (options: {
      rfqId: string
      rfqNumber?: string
      sourceFilePath: string
      exportType: 'step' | 'pdf' | 'dxf' | 'iges'
      partNumber?: string
      revision?: string
      configuration?: string
    }) => ipcRenderer.invoke('rfq:export-release-file', options),
    createZip: (options: {
      rfqId: string
      rfqNumber: string
      files: Array<{ path: string; name: string }>
      rfqPdfPath?: string
      outputPath?: string
    }) => ipcRenderer.invoke('rfq:create-zip', options),
    openFolder: (rfqId: string, rfqNumber?: string) =>
      ipcRenderer.invoke('rfq:open-folder', rfqId, rfqNumber),
  },

  // Review packages: staging folders for PDF renders and the bounded review PDF cache
  reviewPackage: {
    createStagingDir: () => ipcRenderer.invoke('review-package:create-staging-dir'),
    removeStagingDir: (dir: string) => ipcRenderer.invoke('review-package:remove-staging-dir', dir),
    getPdfCacheDir: () => ipcRenderer.invoke('review-package:get-pdf-cache-dir'),
    readStagedFile: (filePath: string) =>
      ipcRenderer.invoke('review-package:read-staged-file', filePath),
    readCachedPdf: (filePath: string) =>
      ipcRenderer.invoke('review-package:read-cached-pdf', filePath),
    writeManifest: (dir: string, files: Array<{ name: string; content: string }>) =>
      ipcRenderer.invoke('review-package:write-manifest', dir, files),
  },

  // Archive (ZIP) operations
  archive: {
    createZip: (files: Array<{ path: string; relativePath: string }>, outputPath: string) =>
      ipcRenderer.invoke('archive:create-zip', files, outputPath),
    onProgress: (
      callback: (progress: {
        phase: string
        filesProcessed: number
        filesTotal: number
        currentFile?: string
        bytesWritten?: number
      }) => void,
    ) => {
      const handler = (
        _: unknown,
        progress: {
          phase: string
          filesProcessed: number
          filesTotal: number
          currentFile?: string
          bytesWritten?: number
        },
      ) => callback(progress)
      ipcRenderer.on('archive:progress', handler)
      return () => ipcRenderer.removeListener('archive:progress', handler)
    },
  },

  // Embedded eDrawings preview
  isEDrawingsNativeAvailable: () => ipcRenderer.invoke('edrawings:native-available'),
  createEDrawingsPreview: () => ipcRenderer.invoke('edrawings:create-preview'),
  attachEDrawingsPreview: (sessionId: string) =>
    ipcRenderer.invoke('edrawings:attach-preview', sessionId),
  loadEDrawingsFile: (sessionId: string, filePath: string) =>
    ipcRenderer.invoke('edrawings:load-file', sessionId, filePath),
  getEDrawingsPreviewStatus: (sessionId: string) =>
    ipcRenderer.invoke('edrawings:preview-status', sessionId),
  setEDrawingsBounds: (sessionId: string, x: number, y: number, width: number, height: number) =>
    ipcRenderer.invoke('edrawings:set-bounds', sessionId, x, y, width, height),
  showEDrawingsPreview: (sessionId: string) =>
    ipcRenderer.invoke('edrawings:show-preview', sessionId),
  hideEDrawingsPreview: (sessionId: string) =>
    ipcRenderer.invoke('edrawings:hide-preview', sessionId),
  destroyEDrawingsPreview: (sessionId: string) =>
    ipcRenderer.invoke('edrawings:destroy-preview', sessionId),

  // Auto Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  downloadVersionInstaller: (version: string, downloadUrl: string) =>
    ipcRenderer.invoke('updater:download-version', version, downloadUrl),
  runInstaller: (filePath: string) => ipcRenderer.invoke('updater:run-installer', filePath),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getUpdateStatus: () => ipcRenderer.invoke('updater:get-status'),
  postponeUpdate: (version: string) => ipcRenderer.invoke('updater:postpone', version),
  clearUpdateReminder: () => ipcRenderer.invoke('updater:clear-reminder'),

  // Update event listeners
  onUpdateAvailable: (
    callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void,
  ) => {
    const handler = (
      _: unknown,
      info: { version: string; releaseDate?: string; releaseNotes?: string },
    ) => callback(info)
    ipcRenderer.on('updater:available', handler)
    return () => ipcRenderer.removeListener('updater:available', handler)
  },
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => {
    const handler = (_: unknown, info: { version: string }) => callback(info)
    ipcRenderer.on('updater:not-available', handler)
    return () => ipcRenderer.removeListener('updater:not-available', handler)
  },
  onUpdateDownloadProgress: (
    callback: (progress: {
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }) => void,
  ) => {
    const handler = (
      _: unknown,
      progress: { percent: number; bytesPerSecond: number; transferred: number; total: number },
    ) => callback(progress)
    ipcRenderer.on('updater:download-progress', handler)
    return () => ipcRenderer.removeListener('updater:download-progress', handler)
  },
  onUpdateDownloaded: (
    callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void,
  ) => {
    const handler = (
      _: unknown,
      info: { version: string; releaseDate?: string; releaseNotes?: string },
    ) => callback(info)
    ipcRenderer.on('updater:downloaded', handler)
    return () => ipcRenderer.removeListener('updater:downloaded', handler)
  },
  onUpdateError: (callback: (error: { message: string }) => void) => {
    const handler = (_: unknown, error: { message: string }) => callback(error)
    ipcRenderer.on('updater:error', handler)
    return () => ipcRenderer.removeListener('updater:error', handler)
  },

  // Mandatory update and in-app database upgrade (5.0). Types: src/types/electron/dbUpgrade.ts
  setMandatoryUpdate: (minVersion: string) =>
    ipcRenderer.invoke('updater:set-mandatory', minVersion),
  onMandatoryUpdateState: (callback: (state: unknown) => void) => {
    const handler = (_: unknown, state: unknown) => callback(state)
    ipcRenderer.on('updater:mandatory-state', handler)
    return () => ipcRenderer.removeListener('updater:mandatory-state', handler)
  },
  dbUpgrade: {
    getBundle: () => ipcRenderer.invoke('db-upgrade:bundle'),
    getCredentialStatus: (ctx: unknown) => ipcRenderer.invoke('db-upgrade:credential-status', ctx),
    setCredential: (input: unknown) => ipcRenderer.invoke('db-upgrade:set-credential', input),
    forgetCredential: () => ipcRenderer.invoke('db-upgrade:forget-credential'),
    plan: (ctx: unknown) => ipcRenderer.invoke('db-upgrade:plan', ctx),
    apply: (input: unknown) => ipcRenderer.invoke('db-upgrade:apply', input),
    onProgress: (callback: (progress: unknown) => void) => {
      const handler = (_: unknown, progress: unknown) => callback(progress)
      ipcRenderer.on('db-upgrade:progress', handler)
      return () => ipcRenderer.removeListener('db-upgrade:progress', handler)
    },
  },

  // Menu event listeners
  onMenuEvent: (callback: (event: string) => void) => {
    const events = [
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
      'menu:about',
    ]

    events.forEach((event) => {
      ipcRenderer.on(event, () => callback(event))
    })

    return () => {
      events.forEach((event) => {
        ipcRenderer.removeAllListeners(event)
      })
    }
  },

  // File change listener
  onFilesChanged: (callback: (files: string[]) => void) => {
    const handler = (_: unknown, files: string[]) => callback(files)
    ipcRenderer.on('files-changed', handler)

    return () => {
      ipcRenderer.removeListener('files-changed', handler)
    }
  },

  // Directory change listeners (for syncing external folder changes to server)
  onDirectoryAdded: (callback: (relativePath: string) => void) => {
    const handler = (_: unknown, relativePath: string) => callback(relativePath)
    ipcRenderer.on('directory-added', handler)

    return () => {
      ipcRenderer.removeListener('directory-added', handler)
    }
  },

  onDirectoryRemoved: (callback: (relativePath: string) => void) => {
    const handler = (_: unknown, relativePath: string) => callback(relativePath)
    ipcRenderer.on('directory-removed', handler)

    return () => {
      ipcRenderer.removeListener('directory-removed', handler)
    }
  },

  // Fired when the watcher lost events and can no longer describe what changed,
  // so only a full reload can bring the vault back in sync.
  onVaultResyncRequired: (callback: (reason: string) => void) => {
    const handler = (_: unknown, reason: string) => callback(reason)
    ipcRenderer.on('vault-resync-required', handler)

    return () => {
      ipcRenderer.removeListener('vault-resync-required', handler)
    }
  },

  // Auth session listener (for OAuth callback in production)
  onSetSession: (
    callback: (tokens: {
      access_token: string
      refresh_token: string
      expires_in?: number
      expires_at?: number
    }) => void,
  ) => {
    const handler = (
      _: unknown,
      tokens: {
        access_token: string
        refresh_token: string
        expires_in?: number
        expires_at?: number
      },
    ) => callback(tokens)
    ipcRenderer.on('auth:set-session', handler)

    return () => {
      ipcRenderer.removeListener('auth:set-session', handler)
    }
  },

  // External CLI command listener
  onCliCommand: (callback: (data: { requestId: string; command: string }) => void) => {
    const handler = (_: unknown, data: { requestId: string; command: string }) => callback(data)
    ipcRenderer.on('cli-command', handler)

    return () => {
      ipcRenderer.removeListener('cli-command', handler)
    }
  },

  // Send CLI command response back to main process
  sendCliResponse: (requestId: string, result: unknown) => {
    ipcRenderer.send('cli-response', { requestId, result })
  },

  // CLI token management
  generateCliToken: (userEmail: string) => ipcRenderer.invoke('cli:generate-token', userEmail),
  revokeCliToken: () => ipcRenderer.invoke('cli:revoke-token'),

  // Deep Link handling

  // ═══════════════════════════════════════════════════════════════════════════════
  // EXTENSION SYSTEM API
  // ═══════════════════════════════════════════════════════════════════════════════

  // Per-machine extension packages (store browsing, install, uninstall; never run),
  // and org-installed native extensions (prepare/prune/inspect; see native.ts).
  extensions: {
    // ----- Native extensions (org-installed, SHA-256 pinned) -----
    nativePrepare: (request: {
      extensionId: string
      version: string
      sha256: string
      downloadUrl: string
    }) => ipcRenderer.invoke('extensions:native-prepare', request),
    nativePrune: (keepShas: string[]) => ipcRenderer.invoke('extensions:native-prune', keepShas),
    nativeInspect: () => ipcRenderer.invoke('extensions:native-inspect'),
  },
})

// Type declarations for the renderer process
declare global {
  type EDrawingsPreviewErrorCode =
    | 'preview-service-unavailable'
    | 'preview-session-not-active'
    | 'preview-request-not-from-window'
    | 'preview-module-unavailable'
    | 'preview-host-unavailable'
    | 'preview-host-handshake-failed'
    | 'preview-host-timeout'
    | 'preview-host-exited'
    | 'preview-document-load-failed'
    | 'preview-file-invalid'
    | 'preview-vault-unavailable'
    | 'preview-vault-not-local'
    | 'preview-file-not-allowed'
    | 'preview-file-type-unsupported'
    | 'preview-file-not-available'
    | 'preview-file-outside-vault'
    | 'preview-bounds-invalid'
    | 'preview-operation-failed'

  interface EDrawingsPreviewFailure {
    success: false
    errorCode: EDrawingsPreviewErrorCode
  }

  type EDrawingsPreviewOperationResult = { success: true } | EDrawingsPreviewFailure
  type EDrawingsExternalOpenResult =
    | { success: true; fallback?: true }
    | { success: false; errorCode: 'external-open-failed' }
  type EDrawingsPreviewCreateResult = { success: true; sessionId: string } | EDrawingsPreviewFailure
  type EDrawingsPreviewLoadResult =
    | { success: true; accepted: true; ready: true }
    | EDrawingsPreviewFailure

  interface Window {
    electronAPI: {
      // App info
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>
      getTitleBarOverlayRect: () => Promise<{ x: number; y: number; width: number; height: number }>
      setTitleBarOverlay: (options: {
        color: string
        symbolColor: string
      }) => Promise<{ success: boolean; error?: string }>
      getPathForFile: (file: File) => string
      reloadApp: () => Promise<{ success: boolean; error?: string }>
      requestFocus: () => Promise<{ success: boolean; error?: string }>
      openPerformanceWindow: () => Promise<{ success: boolean; error?: string }>

      // OAuth
      openOAuthWindow: (
        url: string,
      ) => Promise<{ success: boolean; canceled?: boolean; error?: string }>

      // Logging
      getLogs: () => Promise<
        Array<{ timestamp: string; level: string; message: string; data?: unknown }>
      >
      exportLogs: () => Promise<{
        success: boolean
        path?: string
        error?: string
        canceled?: boolean
      }>
      log: (level: string, message: string, data?: unknown) => void
      reportRendererStall: (payload: { durationMs: number; source: string }) => void
      clearIndexedDbStorage: () => Promise<{ success: boolean; error?: string }>
      getLogsDir: () => Promise<string>
      writeDivergenceReport: (
        fileName: string,
        content: string,
      ) => Promise<{ success: boolean; path?: string; error?: string }>
      listLogFiles: () => Promise<{
        success: boolean
        files?: Array<{
          name: string
          path: string
          size: number
          modifiedTime: string
          isCurrentSession: boolean
        }>
        error?: string
        logsDir?: string
      }>
      readLogFile: (
        filePath: string,
      ) => Promise<{ success: boolean; content?: string; error?: string }>
      openLogsDir: () => Promise<{ success: boolean; error?: string }>
      deleteLogFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
      deleteAllLogFiles: () => Promise<{
        success: boolean
        deleted: number
        errors?: string[]
        error?: string
      }>
      cleanupOldLogs: () => Promise<{ success: boolean; deleted: number; error?: string }>
      getLogRetentionSettings: () => Promise<{
        success: boolean
        settings?: {
          maxFiles: number
          maxAgeDays: number
          maxSizeMb: number
          maxTotalSizeMb: number
        }
        defaults?: {
          maxFiles: number
          maxAgeDays: number
          maxSizeMb: number
          maxTotalSizeMb: number
        }
        error?: string
      }>
      setLogRetentionSettings: (settings: {
        maxFiles?: number
        maxAgeDays?: number
        maxSizeMb?: number
        maxTotalSizeMb?: number
      }) => Promise<{
        success: boolean
        settings?: {
          maxFiles: number
          maxAgeDays: number
          maxSizeMb: number
          maxTotalSizeMb: number
        }
        error?: string
      }>
      getLogStorageInfo: () => Promise<{
        success: boolean
        totalSize?: number
        fileCount?: number
        logsDir?: string
        error?: string
      }>
      getLogRecordingState: () => Promise<{ enabled: boolean }>
      setLogRecordingState: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>
      startNewLogFile: () => Promise<{ success: boolean; path?: string; error?: string }>
      exportFilteredLogs: (
        entries: Array<{ raw: string }>,
      ) => Promise<{ success: boolean; path?: string; error?: string; canceled?: boolean }>

      // Crash reports
      listCrashFiles: () => Promise<{
        success: boolean
        files?: Array<{ name: string; path: string; size: number; modifiedTime: string }>
        error?: string
      }>
      readCrashFile: (
        filePath: string,
      ) => Promise<{ success: boolean; content?: string; error?: string }>
      openCrashesDir: () => Promise<{ success: boolean; error?: string }>

      // Window controls
      close: () => void

      // Working directory
      selectWorkingDir: () => Promise<PathResult>
      setWorkingDir: (path: string) => Promise<PathResult>
      createWorkingDir: (path: string) => Promise<PathResult>
      clearWorkingDir: () => Promise<OperationResult>

      // File system operations
      readFile: (path: string) => Promise<FileReadResult>
      writeFile: (path: string, base64Data: string) => Promise<FileWriteResult>
      downloadUrl: (
        url: string,
        destPath: string,
        expectedHash?: string,
      ) => Promise<FileWriteResult>
      fileExists: (path: string) => Promise<boolean>
      // Streaming hash - more efficient for large files
      hashFile: (
        path: string,
      ) => Promise<{ success: boolean; hash?: string; size?: number; error?: string }>
      statFile: (path: string) => Promise<FileStatResult>
      listWorkingFiles: () => Promise<FilesListResult>
      listWorkingFilesDelta: (
        changedPaths: string[],
      ) => Promise<FilesListResult & { wasFullScan?: boolean }>
      invalidateScanCache: (reason: string) => Promise<OperationResult>
      listDirFiles: (dirPath: string) => Promise<FilesListResult>
      // Fast folder listing - no hash computation (for folder-scoped refresh)
      listFolderFast: (
        folderRelativePath: string,
      ) => Promise<FilesListResult & { folderPath?: string }>
      computeFileHashes: (
        files: Array<{ path: string; relativePath: string; size: number; mtime: number }>,
      ) => Promise<{
        success: boolean
        results?: Array<{ relativePath: string; hash: string }>
        error?: string
      }>
      createFolder: (path: string) => Promise<OperationResult>
      deleteItem: (
        path: string,
        isAutomatic?: boolean,
      ) => Promise<OperationResult & { skipped?: boolean }>
      // Batch delete operations - much faster than individual deleteItem calls
      deleteBatch: (
        paths: string[],
        useTrash?: boolean,
        isAutomatic?: boolean,
      ) => Promise<{
        success: boolean
        results: Array<{ path: string; success: boolean; error?: string; skipped?: boolean }>
        summary: {
          total: number
          succeeded: number
          failed: number
          skipped: number
          duration: number
        }
      }>
      trashEmptyDirs: (paths: string[]) => Promise<{
        success: boolean
        results: Array<{ path: string; success: boolean; error?: string; skipped?: boolean }>
        summary: {
          total: number
          succeeded: number
          failed: number
          skipped: number
          duration: number
        }
      }>
      renameItem: (oldPath: string, newPath: string) => Promise<FileOperationResult>
      copyFile: (sourcePath: string, destPath: string) => Promise<FileOperationResult>
      moveFile: (sourcePath: string, destPath: string) => Promise<FileOperationResult>
      openInExplorer: (path: string) => Promise<OperationResult>
      openFile: (path: string) => Promise<OperationResult>
      setReadonly: (path: string, readonly: boolean) => Promise<OperationResult>
      setReadonlyBatch: (files: Array<{ path: string; readonly: boolean }>) => Promise<{
        success: boolean
        results: Array<{ path: string; success: boolean; error?: string }>
      }>
      isReadonly: (
        path: string,
      ) => Promise<{ success: boolean; readonly?: boolean; error?: string }>

      // Dialogs
      selectFiles: () => Promise<FileSelectResult>
      selectFolder: () => Promise<FolderSelectResult>
      selectDirectory: (title?: string, defaultPath?: string) => Promise<DirectorySelectResult>
      showSaveDialog: (defaultName: string) => Promise<SaveDialogResult>
      saveTextFileWithDialog: (
        defaultName: string,
        utf8Content: string,
        filters?: Array<{ name: string; extensions: string[] }>,
      ) => Promise<SaveDialogResult>

      // eDrawings preview
      checkEDrawingsInstalled: () => Promise<{ installed: boolean; path: string | null }>
      openInEDrawings: (filePath: string) => Promise<EDrawingsExternalOpenResult>

      // SolidWorks thumbnail extraction

      // Cancel queued thumbnail/preview extractions for files in a folder (used before folder moves)
      cancelPreviewsForFolder: (
        folderPath: string,
      ) => Promise<{ cancelledCount: number; activeCount: number; activePaths: string[] }>

      // Generate cache entries for a folder's uncached CAD files in the background
      prewarmThumbnails: (folderPath: string) => Promise<{ generated: number; skipped: number }>

      // Release SolidWorks Document Manager handles (used before folder moves to prevent EPERM)
      releaseHandles: () => Promise<{
        success: boolean
        data?: { released: boolean; dmAvailable?: boolean; reason?: string }
        error?: string
      }>

      // Check if SLDWORKS.exe process is running (lightweight check, no service call)

      // Test file locks in a folder (debugging tool for folder move failures)

      // Check ALL files in a folder for locks before folder move operations
      checkFolderLocks: (folderPath: string) => Promise<{
        lockedFiles: Array<{
          filename: string
          relativePath: string
          fullPath: string
          process: string
        }>
        totalFiles: number
        duration?: number
        error?: string
      }>

      // Listen for folder lock check progress events

      // SolidWorks Service API (requires SolidWorks installed)
      solidworks: {
        // Service management
        isInstalled: () => Promise<{ success: boolean; data?: { installed: boolean } }>
        startService: (
          dmLicenseKey?: string,
          cleanupOrphans?: boolean,
          verboseLogging?: boolean,
        ) => Promise<{
          success: boolean
          data?: {
            message: string
            version?: string
            swInstalled?: boolean
            fastModeEnabled?: boolean
          }
          error?: string
        }>
        setAutoStartConfig: (config: {
          autoStartEnabled: boolean
          integrationEnabled: boolean
          dmLicenseKey?: string
          verboseLogging?: boolean
          swProgId?: string | null
        }) => Promise<{ success: boolean }>
        getComInstalls: () => Promise<{
          success: boolean
          installs?: SolidWorksComInstall[]
          selectedProgId?: string | null
        }>
        stopService: () => Promise<{ success: boolean }>
        getServiceStatus: () => Promise<{
          success: boolean
          data?: { running: boolean; installed?: boolean; version?: string }
        }>
        warmup: () => Promise<{ success: boolean; error?: string; data?: unknown }>

        // Leaked SolidWorks instance management

        // Metadata operations
        getBom: (
          filePath: string,
          options?: { includeChildren?: boolean; configuration?: string },
        ) => Promise<{
          success: boolean
          data?: {
            assemblyPath: string
            configuration: string
            items: Array<{
              fileName: string
              filePath: string
              fileType: string
              quantity: number
              configuration: string
              partNumber: string
              description: string
              material: string
              revision: string
              properties: Record<string, string>
            }>
            totalParts: number
            totalQuantity: number
          }
          error?: string
        }>
        getProperties: (
          filePath: string,
          configuration?: string,
        ) => Promise<{
          success: boolean
          data?: {
            filePath: string
            fileProperties: Record<string, string>
            configurationProperties: Record<string, Record<string, string>>
            configurations: string[]
          }
          error?: string
        }>
        getPropertiesDocumentManager: (
          filePath: string,
          configuration?: string,
        ) => Promise<{
          success: boolean
          data?: {
            filePath: string
            fileProperties: Record<string, string>
            configurationProperties: Record<string, Record<string, string>>
            configurations: string[]
          }
          error?: string
          errorCode?: string
        }>
        setProperties: (
          filePath: string,
          properties: Record<string, string>,
          configuration?: string,
        ) => Promise<{
          success: boolean
          data?: { filePath: string; propertiesSet: number; configuration: string }
          error?: string
        }>
        getConfigurations: (filePath: string) => Promise<{
          success: boolean
          data?: {
            filePath: string
            activeConfiguration: string
            configurations: Array<{
              name: string
              isActive: boolean
              description: string
              properties: Record<string, string>
            }>
            count: number
          }
          error?: string
        }>
        getReferences: (filePath: string) => Promise<{
          success: boolean
          data?: {
            filePath: string
            references: Array<{ path: string; fileName: string; exists: boolean; fileType: string }>
            count: number
          }
          error?: string
        }>
        // Mirrors src/lib/inspection/types.ts (the electron program cannot import from src/).
        extractDrawingCharacteristics: (filePath: string) => Promise<{
          success: boolean
          data?: {
            units: 'mm' | 'in' | 'other'
            sheets: Array<{ name: string; widthM: number; heightM: number }>
            characteristics: Array<{
              sourceKey: string
              baseKey: string
              persistRef: string
              annotationName: string
              sheet: string
              view: string | null
              kind: 'dimension' | 'holeCallout' | 'gtol' | 'surfaceFinish'
              subType: string | null
              nominal: string
              unit: string | null
              plusTolerance: string | null
              minusTolerance: string | null
              upperLimit: string | null
              lowerLimit: string | null
              toleranceType: string | null
              isReference: boolean
              zone: string | null
              x: number
              y: number
            }>
            skipped: Array<{ sourceKey: string; baseKey: string | null; sheet: string; reason: string }>
            incompleteSheets: string[]
          }
          error?: string
          errorCode?: string
        }>
        applyInspectionBalloons: (
          filePath: string,
          balloons: Array<{ sourceKey: string; label: string; persistRef?: string }>,
        ) => Promise<{
          success: boolean
          data?: {
            placed: number
            missing: string[]
            removedPrevious: number
            keptPositions: number
            saved: boolean
          }
          error?: string
          errorCode?: string
        }>

        // Document creation
        createDocumentFromTemplate: (
          templatePath: string,
          outputPath: string,
        ) => Promise<{
          success: boolean
          data?: { templatePath: string; outputPath: string; message: string }
          error?: string
        }>

        // Export operations
        exportPdf: (
          filePath: string,
          options?: {
            outputPath?: string
            filenamePattern?: string
            pdmMetadata?: {
              partNumber?: string
              tabNumber?: string
              revision?: string
              description?: string
            }
          },
        ) => Promise<{
          success: boolean
          data?: {
            inputFile: string
            outputFile: string
            exportedFiles?: string[]
            fileSize: number
            /** What the service actually substituted into the filename pattern. File properties
             * take priority over pdmMetadata, so this can differ from what was requested. */
            resolvedMetadata?: {
              partNumber?: string
              tabNumber?: string
              revision?: string
              description?: string
            }
          }
          error?: string
        }>
        exportStep: (
          filePath: string,
          options?: {
            outputPath?: string
            configuration?: string
            exportAllConfigs?: boolean
            configurations?: string[]
            filenamePattern?: string
            pdmMetadata?: {
              partNumber?: string
              tabNumber?: string
              revision?: string
              description?: string
            }
          },
        ) => Promise<{
          success: boolean
          data?: { inputFile: string; exportedFiles: string[]; count: number }
          error?: string
        }>
        exportDxf: (
          filePath: string,
          outputPath?: string,
        ) => Promise<{
          success: boolean
          data?: { inputFile: string; outputFile: string; fileSize: number }
          error?: string
        }>
        exportIges: (
          filePath: string,
          options?: { outputPath?: string; exportAllConfigs?: boolean; configurations?: string[] },
        ) => Promise<{
          success: boolean
          data?: { inputFile: string; outputFile: string; fileSize: number }
          error?: string
        }>

        // Assembly operations
        packAndGo: (
          filePath: string,
          outputFolder: string,
          options?: { prefix?: string; suffix?: string },
        ) => Promise<{
          success: boolean
          data?: {
            sourceFile: string
            outputFolder: string
            totalFiles: number
            copiedFiles: number
            files: string[]
          }
          error?: string
        }>
        duplicateWithReferences: (args: {
          sourceModelPath: string
          targetModelPath: string
          sourceDrawingPath?: string
          targetDrawingPath?: string
        }) => Promise<{
          success: boolean
          data?: {
            modelPath: string
            drawingPath: string | null
            replacedReference?: string
            referenceUpdated: boolean
            engine: 'documentManager' | 'packAndGo'
          }
          error?: string
          errorCode?: string
        }>

        // License Registry Operations (HKLM - requires admin for write operations)
        getLicenseRegistry: () => Promise<{
          success: boolean
          serialNumbers?: string[]
          /** product = registry value name, serial = value data */
          entries?: { product: string; serial: string }[]
          error?: string
        }>
        setLicenseRegistry: (
          serialNumber: string,
        ) => Promise<{ success: boolean; error?: string; requiresAdmin?: boolean }>
        removeLicenseRegistry: (
          serialNumber: string,
        ) => Promise<{ success: boolean; error?: string; requiresAdmin?: boolean }>
        checkLicenseRegistry: (
          serialNumber: string,
        ) => Promise<{ success: boolean; found: boolean; error?: string }>
      }

      // Embedded eDrawings preview
      isEDrawingsNativeAvailable: () => Promise<boolean>
      createEDrawingsPreview: () => Promise<EDrawingsPreviewCreateResult>
      attachEDrawingsPreview: (sessionId: string) => Promise<EDrawingsPreviewOperationResult>
      loadEDrawingsFile: (
        sessionId: string,
        filePath: string,
      ) => Promise<EDrawingsPreviewLoadResult>
      getEDrawingsPreviewStatus: (sessionId: string) => Promise<EDrawingsPreviewOperationResult>
      setEDrawingsBounds: (
        sessionId: string,
        x: number,
        y: number,
        width: number,
        height: number,
      ) => Promise<EDrawingsPreviewOperationResult>
      showEDrawingsPreview: (sessionId: string) => Promise<EDrawingsPreviewOperationResult>
      hideEDrawingsPreview: (sessionId: string) => Promise<EDrawingsPreviewOperationResult>
      destroyEDrawingsPreview: (sessionId: string) => Promise<EDrawingsPreviewOperationResult>

      // Auto Updater
      checkForUpdates: () => Promise<{ success: boolean; updateInfo?: unknown; error?: string }>
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>
      installUpdate: () => Promise<{ success: boolean; error?: string }>
      getUpdateStatus: () => Promise<{
        updateAvailable: { version: string; releaseDate?: string; releaseNotes?: string } | null
        updateDownloaded: boolean
        downloadProgress: {
          percent: number
          bytesPerSecond: number
          transferred: number
          total: number
        } | null
      }>
      postponeUpdate: (version: string) => Promise<{ success: boolean }>
      clearUpdateReminder: () => Promise<{ success: boolean }>

      // Update event listeners
      onUpdateAvailable: (
        callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void,
      ) => () => void
      onUpdateNotAvailable: (callback: (info: { version: string }) => void) => () => void
      onUpdateDownloadProgress: (
        callback: (progress: {
          percent: number
          bytesPerSecond: number
          transferred: number
          total: number
        }) => void,
      ) => () => void
      onUpdateDownloaded: (
        callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void,
      ) => () => void
      onUpdateError: (callback: (error: { message: string }) => void) => () => void

      // Menu events
      onMenuEvent: (callback: (event: string) => void) => () => void

      // File change events
      onFilesChanged: (callback: (files: string[]) => void) => () => void

      // Directory change events (for syncing external folder changes to server)
      onDirectoryAdded: (callback: (relativePath: string) => void) => () => void
      onDirectoryRemoved: (callback: (relativePath: string) => void) => () => void

      // Watcher lost events - the renderer must do a full reload
      onVaultResyncRequired: (callback: (reason: string) => void) => () => void

      // Auth session events (for OAuth callback in production)
      onSetSession: (
        callback: (tokens: {
          access_token: string
          refresh_token: string
          expires_in?: number
          expires_at?: number
        }) => void,
      ) => () => void

      // External CLI
      onCliCommand: (callback: (data: { requestId: string; command: string }) => void) => () => void
      sendCliResponse: (requestId: string, result: unknown) => void

      // CLI token management
      generateCliToken: (userEmail: string) => Promise<{ success: boolean; token?: string }>
      revokeCliToken: () => Promise<{ success: boolean }>

      // Deep Link handling
    }
  }
}
