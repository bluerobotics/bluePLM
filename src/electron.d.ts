// Type declarations for Electron API exposed via preload

import type {
  AppliedInspectionBalloons,
  ExtractedDrawingCharacteristics,
  InspectionBalloonRequest,
} from './lib/inspection/types'

// ============================================
// Backup Log Types
// ============================================

type BackupLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success'
type BackupPhase =
  | 'idle'
  | 'repo_check'
  | 'repo_init'
  | 'unlock'
  | 'file_scan'
  | 'backup'
  | 'retention'
  | 'restore'
  | 'metadata_import'
  | 'complete'
  | 'error'

interface BackupLogEntry {
  level: BackupLogLevel
  phase: BackupPhase
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
}

interface PathResult {
  success: boolean
  path?: string
  error?: string
}

interface FileReadResult {
  success: boolean
  data?: string
  hash?: string
  size?: number
  error?: string
  locked?: boolean // true if file is locked by another process (EBUSY/EACCES/EPERM)
}

interface FileWriteResult {
  success: boolean
  error?: string
  size?: number
  hash?: string
}

interface HashResult {
  success: boolean
  hash?: string
  error?: string
}

interface LocalFileInfo {
  name: string
  path: string
  relativePath: string
  isDirectory: boolean
  extension: string
  size: number
  modifiedTime: string
  hash?: string
  ino?: number
}

interface FilesListResult {
  success: boolean
  files?: LocalFileInfo[]
  error?: string
}

interface FileStatResult {
  success: boolean
  size?: number
  modifiedTime?: string
  isDirectory?: boolean
  error?: string
}

interface OperationResult {
  success: boolean
  error?: string
}

interface FileOperationResult extends OperationResult {
  fileCount?: number // Number of files processed (for copy/move of directories)
}

interface FileSelectResult {
  success: boolean
  files?: { name: string; path: string; data: string }[]
  canceled?: boolean
  error?: string
}

/** `dialog:select-directory`: a chosen folder, without listing its contents. */
interface DirectorySelectResult {
  success: boolean
  path?: string
  canceled?: boolean
}

interface FolderSelectResult {
  success: boolean
  folderName?: string
  folderPath?: string
  files?: {
    name: string
    path: string
    relativePath: string
    extension: string
    size: number
    modifiedTime: string
  }[]
  canceled?: boolean
  error?: string
}

interface SaveDialogResult {
  success: boolean
  path?: string
  canceled?: boolean
  error?: string
}

// ============================================
// Archive Types
// ============================================

/** Input file specification for ZIP creation */
interface ZipFileInput {
  /** Absolute path to the source file on disk */
  path: string
  /** Relative path within the ZIP archive (preserves folder structure) */
  relativePath: string
}

/** Result of ZIP creation operation */
interface ZipResult {
  success: boolean
  /** Total bytes written to the ZIP file */
  totalSize?: number
  /** Number of files included in the ZIP */
  fileCount?: number
  /** Error message if operation failed */
  error?: string
}

/** Progress event sent during ZIP creation */
interface ZipProgressEvent {
  /** Current phase: 'reading' | 'compressing' | 'writing' */
  phase: 'reading' | 'compressing' | 'writing'
  /** Number of files processed so far */
  filesProcessed: number
  /** Total number of files to process */
  filesTotal: number
  /** Current file being processed */
  currentFile?: string
  /** Bytes written so far (only during 'writing' phase) */
  bytesWritten?: number
}

declare global {
  /** Stable renderer-facing failures for the embedded eDrawings IPC contract. */
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

  /**
   * A SOLIDWORKS release as described by its COM registration.
   *
   * Each release registers a versioned ProgID (`SldWorks.Application.32` for 2024,
   * `.34` for 2026) plus the version-independent `SldWorks.Application`, which points
   * at whichever release registered last. A running SOLIDWORKS only publishes itself
   * under its own versioned class, so with several releases installed BluePLM has to
   * know which one to attach to.
   */
  interface SolidWorksComInstall {
    /** Versioned ProgID, e.g. `SldWorks.Application.32`. */
    progId: string
    clsid: string
    exePath: string
    /** Release year, e.g. 2024. */
    year: number
    /** True when `SldWorks.Application` resolves to this release. */
    isDefault: boolean
  }

  interface Window {
    electronAPI?: {
      // OAuth
      openOAuthWindow: (
        url: string,
      ) => Promise<{ success: boolean; canceled?: boolean; error?: string }>

      // Google Drive OAuth
      openGoogleDriveAuth: (credentials?: { clientId?: string; clientSecret?: string }) => Promise<{
        success: boolean
        accessToken?: string
        refreshToken?: string
        expiry?: number
        error?: string
      }>
      // Listen for Google Drive iframe session authentication (when user signs in via popup)
      onGdriveSessionAuthenticated: (callback: () => void) => () => void

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

      // Working directory
      selectWorkingDir: () => Promise<PathResult>
      setWorkingDir: (path: string) => Promise<PathResult>
      createWorkingDir: (path: string) => Promise<PathResult>
      clearWorkingDir: () => Promise<{ success: boolean }>

      // File system operations
      readFile: (path: string) => Promise<FileReadResult>
      checkFileLock: (
        path: string,
        options?: { forRead?: boolean },
      ) => Promise<{ success: boolean; locked?: boolean; processName?: string; error?: string }>
      writeFile: (path: string, base64Data: string) => Promise<FileWriteResult>
      downloadUrl: (
        url: string,
        destPath: string,
        expectedHash?: string,
      ) => Promise<FileWriteResult>
      fileExists: (path: string) => Promise<boolean>
      // Streaming hash - more efficient for large files, use for checkin operations
      hashFile: (
        path: string,
      ) => Promise<{ success: boolean; hash?: string; size?: number; error?: string }>
      // Size + mtime for a single path, for refreshing one file without a full rescan
      statFile: (path: string) => Promise<FileStatResult>
      listWorkingFiles: () => Promise<FilesListResult>
      // Re-stats only the given paths and patches them into the last full scan.
      // Still returns the complete list, so the merge sees an unchanged view.
      listWorkingFilesDelta: (
        changedPaths: string[],
      ) => Promise<FilesListResult & { wasFullScan?: boolean }>
      // Forces the next delta call to re-walk the vault instead of patching the cached scan.
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
      /**
       * Delete a single file or directory.
       *
       * `isAutomatic` marks a delete nobody is watching (e.g. auto-discard of
       * orphaned files). On that path, if the file cannot be moved to the Recycle
       * Bin, it is left on disk and the result comes back with `skipped: true`
       * instead of being permanently deleted - see
       * `.cursor/plans/recycle-bin-reliability-report.md` for why `shell.trashItem`
       * throwing is a reliable signal that recycling genuinely failed. Defaults to
       * false (explicit user delete), which keeps the existing
       * trash-then-permanent-delete fallback.
       */
      deleteItem: (
        path: string,
        isAutomatic?: boolean,
      ) => Promise<OperationResult & { skipped?: boolean }>
      // Batch delete operations - much faster than individual deleteItem calls
      // Stops file watcher ONCE, deletes all files, restarts watcher ONCE
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
          /** Count of `results` entries with `skipped: true` - left on disk, not deleted. */
          skipped: number
          duration: number
        }
      }>
      /**
       * Trash directories that are genuinely empty on disk - re-checked in the main
       * process, immediately before each one's own trash call, with no filtering of
       * any kind (see `electron/handlers/emptyDirs.ts`). A directory that is not
       * empty, is outside the working directory, or that `shell.trashItem` rejects
       * comes back with `skipped: true` and is left exactly where it is. There is no
       * `isAutomatic` parameter - unlike `deleteBatch`/`trashBatch`, this handler has
       * no permanent-delete fallback to switch, so it always behaves like the
       * automatic path.
       */
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
      isDirEmpty: (path: string) => Promise<{ success: boolean; empty?: boolean; error?: string }>
      isDirectory: (
        path: string,
      ) => Promise<{ success: boolean; isDirectory?: boolean; error?: string }>
      renameItem: (oldPath: string, newPath: string) => Promise<FileOperationResult>
      copyFile: (sourcePath: string, destPath: string) => Promise<FileOperationResult>
      moveFile: (sourcePath: string, destPath: string) => Promise<FileOperationResult>
      openInExplorer: (path: string) => Promise<OperationResult>
      showInExplorer: (path: string) => Promise<OperationResult>
      openFile: (path: string) => Promise<OperationResult>
      setReadonly: (path: string, readonly: boolean) => Promise<OperationResult>
      setReadonlyBatch: (files: Array<{ path: string; readonly: boolean }>) => Promise<{
        success: boolean
        results?: Array<{ path: string; success: boolean; error?: string }>
      }>
      isReadonly: (
        path: string,
      ) => Promise<{ success: boolean; readonly?: boolean; error?: string }>

      // Test framework support
      /** Compute a cryptographic hash of a file (default: SHA-256) */
      getFileHashEx: (
        filePath: string,
        algorithm?: string,
      ) => Promise<{ success: boolean; hash: string; algorithm: string; error?: string }>
      /** Read a file as UTF-8 text (no base64 encoding) */
      readTextFile: (
        filePath: string,
      ) => Promise<{ success: boolean; content: string; error?: string }>

      // Check ALL files in a folder for locks before move operations
      // Test file locks in a folder (debugging tool for folder move failures)

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

      startDrag: (filePaths: string[]) => void

      // Dialogs
      selectFiles: () => Promise<FileSelectResult>
      selectFolder: () => Promise<FolderSelectResult>
      /** Pick a destination folder; unlike selectFolder it does not walk the folder. */
      selectDirectory: (title?: string, defaultPath?: string) => Promise<DirectorySelectResult>
      showSaveDialog: (
        defaultName: string,
        filters?: Array<{ name: string; extensions: string[] }>,
      ) => Promise<SaveDialogResult>
      /** Show Save dialog and write UTF-8 content to the chosen path (any writable location). */
      saveTextFileWithDialog: (
        defaultName: string,
        utf8Content: string,
        filters?: Array<{ name: string; extensions: string[] }>,
      ) => Promise<SaveDialogResult>

      // PDF generation
      generatePdfFromHtml: (
        htmlContent: string,
        outputPath: string,
      ) => Promise<{ success: boolean; path?: string; size?: number; error?: string }>

      // Archive (ZIP) operations
      archive: {
        /**
         * Create a ZIP archive from a list of files
         * @param files - Array of {path, relativePath} objects to include in the ZIP
         * @param outputPath - Absolute path where the ZIP file will be written
         * @returns Result with success status, file count, total size, or error
         */
        createZip: (files: ZipFileInput[], outputPath: string) => Promise<ZipResult>

        /**
         * Listen for ZIP creation progress events
         * @param callback - Called with progress updates during ZIP creation
         * @returns Unsubscribe function
         */
        onProgress: (callback: (progress: ZipProgressEvent) => void) => () => void
      }

      // eDrawings preview
      checkEDrawingsInstalled: () => Promise<{ installed: boolean; path: string | null }>
      openInEDrawings: (filePath: string) => Promise<EDrawingsExternalOpenResult>

      // SolidWorks thumbnail extraction (low-res, for file browser icons)

      // SolidWorks high-quality preview extraction (reads OLE stream directly)
      extractSolidWorksPreview: (
        filePath: string,
      ) => Promise<{ success: boolean; data?: string; error?: string }>

      // Cancel queued preview/thumbnail extractions for files in a folder (before folder moves).
      // Only affects queued work; already-dispatched commands run to their timeout.
      cancelPreviewsForFolder: (folderPath: string) => Promise<{
        cancelledCount: number
        activeCount: number
        activePaths: string[]
      }>

      // Drop queued previews outside keepFolderPath (when navigating between folders)
      cancelPreviews: (keepFolderPath?: string) => Promise<{ cancelledCount: number }>

      // Generate cache entries for a folder's uncached CAD files in the background.
      // Files already in the thumbnail cache are skipped, so this is a one-time
      // cost per file version rather than per session.
      prewarmThumbnails: (folderPath: string) => Promise<{
        generated: number
        skipped: number
      }>

      // Release SolidWorks Document Manager handles (before folder moves, to prevent EPERM)
      releaseHandles: () => Promise<{ success: boolean; error?: string }>

      // Check if SLDWORKS.exe process is running (lightweight check, no service call)

      // SolidWorks Service API (requires SolidWorks installed)
      solidworks: {
        // File lock detection (uses Windows Restart Manager API, does NOT require SolidWorks)

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
        /**
         * Persist the renderer's auto-start policy so the main process can launch
         * the SolidWorks service at app-ready, in parallel with the renderer boot.
         */
        setAutoStartConfig: (config: {
          autoStartEnabled: boolean
          integrationEnabled: boolean
          dmLicenseKey?: string
          verboseLogging?: boolean
          /** Versioned ProgID to target; null clears the choice back to the machine default. */
          swProgId?: string | null
        }) => Promise<{ success: boolean }>
        /**
         * Every SolidWorks release registered for COM on this machine. More than one
         * means the user has to say which release BluePLM should talk to, because a
         * running SolidWorks is only reachable under its own versioned ProgID.
         */
        getComInstalls: () => Promise<{
          success: boolean
          installs?: SolidWorksComInstall[]
          selectedProgId?: string | null
        }>
        stopService: () => Promise<{ success: boolean }>
        forceRestart: (dmLicenseKey?: string) => Promise<{
          success: boolean
          data?: { message: string; version?: string }
          error?: string
        }>
        resetComConnection: () => Promise<{
          success: boolean
          data?: { reset: boolean; swProcessRunning: boolean }
          error?: string
        }>
        getServiceStatus: () => Promise<{
          success: boolean
          data?: {
            running: boolean
            /** Process is alive but couldn't answer a ping - a command is in flight */
            busy?: boolean
            installed?: boolean
            swInstalled?: boolean
            version?: string
            documentManagerAvailable?: boolean
            documentManagerError?: string | null
            fastModeEnabled?: boolean
            queueDepth?: number
            referenceRecoveryNeeded?: boolean
            message?: string
            /** How many SolidWorks releases are registered for COM on this machine. */
            comInstallCount?: number
            /** Versioned ProgID the user picked, or null for the machine default. */
            selectedProgId?: string | null
            /** Versioned ProgID the service actually attached to, when it has attached. */
            activeProgId?: string | null
            documentManagerDllPath?: string | null
          }
          error?: string
        }>
        /**
         * Pre-warm a hidden SolidWorks instance so the first property write is instant
         * instead of paying a ~40s cold-start. No-op if SolidWorks is already running.
         */
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
        /**
         * The same read, routed through Document Manager and nothing else.
         *
         * `getProperties` asks the service whether SolidWorks has the file open and reads through
         * the live session when it does. That is right for the one document on screen and wrong
         * for a bulk walk, which would drive thousands of COM calls through the session somebody
         * is working in. Document Manager opens read-only.
         *
         * Added in service v1.21.0. An older service answers with
         * `errorCode === 'UNKNOWN_ACTION'`, which callers must not record as a file they could
         * not read.
         */
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
        setPropertiesBatch: (
          filePath: string,
          configProperties: Record<string, Record<string, string>>,
        ) => Promise<{
          success: boolean
          /**
           * Partial failure is reported inside a successful response, and the two service paths
           * report it differently: Document Manager counts properties, the SolidWorks COM
           * fallback counts configurations. Both are optional because either path can answer.
           */
          data?: {
            filePath: string
            configurationsProcessed: number
            configurationsFailed?: number
            failedConfigurations?: Record<string, string> | null
            propertiesSet?: number
            propertiesFailed?: number
            failedProperties?: string[] | null
            errors?: string[] | null
          }
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
        /**
         * Read a file's references. `origin` decides the queue priority and whether the service
         * may open the document to answer; it defaults to `background`, which is headless-only.
         *
         * `error === 'REFERENCES_UNRESOLVED'` means no tier could answer. That is not the same as
         * a successful read of a file with no references, and callers must not record it as one.
         */
        getReferences: (
          filePath: string,
          origin?: 'foreground' | 'background',
        ) => Promise<{
          success: boolean
          data?: {
            filePath: string
            references: Array<{
              path: string
              fileName: string
              exists: boolean
              fileType: string
              configuration?: string
              configurations?: string[]
              broken?: boolean
            }>
            count: number
            resolved?: boolean
            source?: string
            message?: string
          }
          error?: string
          errorCode?: string
        }>
        /** Drop queued background reference reads a newer watcher batch has made stale. */
        cancelBackgroundReferences: (reason?: string) => Promise<{ cancelledCount: number }>
        extractDrawingCharacteristics: (filePath: string) => Promise<{
          success: boolean
          data?: ExtractedDrawingCharacteristics
          error?: string
          errorCode?: string
        }>
        applyInspectionBalloons: (
          filePath: string,
          balloons: InspectionBalloonRequest[],
        ) => Promise<{
          success: boolean
          data?: AppliedInspectionBalloons
          error?: string
          errorCode?: string
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
          /** Service error code, e.g. SW_NOT_INSTALLED when only Document Manager is present. */
          errorCode?: string
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
            pdmMetadataOverride?: boolean
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
        ) => Promise<{
          success: boolean
          data?: { inputFile: string; exportedFiles: string[]; count: number }
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
        /**
         * Copy a model (and optionally its drawing) under new names, rewriting the copied
         * drawing's stored reference to point at the copied model rather than the original.
         */
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
        /** Service 1.26.0+. Document Manager only; never touches files outside packageRoot. */
        retargetReferences: (args: {
          /** Absolute package folder (not a drive root). */
          packageRoot: string
          /** Absolute or package-relative files; default every .sldasm/.slddrw in the package. */
          files?: string[]
          /** Local vault roots, for exact vault-relative matching. */
          vaultRoots?: string[]
        }) => Promise<{
          success: boolean
          data?: {
            packageRoot: string
            files: Array<{
              filePath: string
              status: 'retargeted' | 'unchanged' | 'failed'
              references: Array<{
                oldPath: string
                newPath?: string
                status: 'retargeted' | 'unchanged' | 'missing' | 'ambiguous'
                matchedBy?: 'package' | 'vaultPath' | 'pathSuffix' | 'fileName'
                candidates?: string[]
              }>
              errorCode?: string
              error?: string
            }>
            summary: {
              total: number
              retargeted: number
              unchanged: number
              failed: number
              missingReferences: number
            }
          }
          error?: string
          errorCode?: string
        }>
        addComponent: (
          assemblyPath: string | null,
          componentPath: string,
          coordinates?: { x: number; y: number; z: number },
        ) => Promise<{
          success: boolean
          data?: {
            componentName: string
            componentPath: string
            assemblyPath: string
            position: { x: number; y: number; z: number }
          }
          error?: string
        }>

        // Open Document Management (control files open in SolidWorks without closing them!)
        getOpenDocuments: (options?: { includeComponents?: boolean }) => Promise<{
          success: boolean
          data?: {
            solidWorksRunning: boolean
            processDetected?: boolean
            documents: Array<{
              filePath: string
              fileName: string
              fileType: string
              isReadOnly: boolean
              isDirty: boolean
              activeConfiguration: string
              isComponent?: boolean // true if loaded as component without its own window
            }>
            count: number
          }
          error?: string
        }>
        isDocumentOpen: (filePath: string) => Promise<{
          success: boolean
          data?: {
            filePath: string
            isOpen: boolean
            solidWorksRunning: boolean
            isReadOnly?: boolean
            isDirty?: boolean
          }
          error?: string
        }>
        setDocumentReadOnly: (
          filePath: string,
          readOnly: boolean,
        ) => Promise<{
          success: boolean
          data?: {
            filePath: string
            fileName: string
            wasReadOnly: boolean
            isNowReadOnly: boolean
            readOnly: boolean
            changed: boolean
          }
          error?: string
        }>
        setDocumentProperties: (
          filePath: string,
          properties: Record<string, string>,
          configuration?: string,
        ) => Promise<{
          success: boolean
          data?: {
            filePath: string
            fileName: string
            propertiesSet: number
            configuration: string
          }
          error?: string
        }>

        // Selection tracking - get currently selected components in the active assembly
        getSelectedFiles: () => Promise<{
          success: boolean
          data?: {
            activeDocument: string | null
            files: Array<{
              filePath: string
              fileName: string
              componentName: string
              fileType: string
              isVirtual: boolean
            }>
          }
          error?: string
        }>

        // File Locations (Registry) - for template folder configuration
        getInstalledVersions: () => Promise<{
          success: boolean
          versions?: Array<{ version: string; year: number; registryPath: string }>
          error?: string
        }>
        setFileLocations: (settings: {
          documentTemplates?: string
          sheetFormats?: string
          bomTemplates?: string
          customPropertyFolders?: string
          promptForTemplate?: boolean
        }) => Promise<{ success: boolean; updatedVersions?: string[]; error?: string }>

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

        // Template operations
        createDocumentFromTemplate: (
          templatePath: string,
          destinationPath: string,
        ) => Promise<{
          success: boolean
          data?: { templatePath: string; outputPath: string }
          error?: string
        }>
      }

      // Review packages (src/lib/reviewPackage): PDF render staging and the review PDF cache
      reviewPackage: {
        /** A new empty folder under the OS temp folder, for staging one PDF render. */
        createStagingDir: () => Promise<{ success: boolean; path?: string; error?: string }>
        /** Removes a folder made by createStagingDir; refuses any other path. */
        removeStagingDir: (dir: string) => Promise<{ success: boolean; error?: string }>
        /** userData/review-pdf-cache, created if missing and pruned to its size limit. */
        getPdfCacheDir: () => Promise<{ success: boolean; path?: string; error?: string }>
        /** Base64 content of a file inside a staging folder (fs.readFile is vault-only). */
        readStagedFile: (
          filePath: string,
        ) => Promise<{ success: boolean; data?: string; size?: number; error?: string }>
        /** Base64 content of a PDF in the review PDF cache (the review viewer's source). */
        readCachedPdf: (
          filePath: string,
        ) => Promise<{ success: boolean; data?: string; size?: number; error?: string }>
        /** Write manifest.json / manifest.csv (UTF-8) into an existing package folder. */
        writeManifest: (
          dir: string,
          files: Array<{ name: 'manifest.json' | 'manifest.csv'; content: string }>,
        ) => Promise<{ success: boolean; error?: string }>
      }

      // RFQ Release Files API
      rfq: {
        getOutputDir: (
          rfqId: string,
          rfqNumber?: string,
        ) => Promise<{ success: boolean; path?: string; error?: string }>
        exportReleaseFile: (options: {
          rfqId: string
          rfqNumber?: string
          sourceFilePath: string
          exportType: 'step' | 'pdf' | 'dxf' | 'iges'
          partNumber?: string
          revision?: string
          configuration?: string
        }) => Promise<{
          success: boolean
          outputPath?: string
          fileName?: string
          fileSize?: number
          error?: string
        }>
        createZip: (options: {
          rfqId: string
          rfqNumber: string
          files: Array<{ path: string; name: string }>
          rfqPdfPath?: string
          outputPath?: string
        }) => Promise<{ success: boolean; zipPath?: string; fileSize?: number; error?: string }>
        openFolder: (
          rfqId: string,
          rfqNumber?: string,
        ) => Promise<{ success: boolean; error?: string }>
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

      // Machine identification (for backup service)
      getMachineId: () => Promise<string | null>
      getMachineName: () => Promise<string | null>
      getAppVersion: () => Promise<string>

      /** Non-null when the main process reloaded this window after a renderer crash */
      consumeCrashNotice: () => Promise<{ reason: string; attempt: number } | null>

      // Analytics settings
      setAnalyticsEnabled: (enabled: boolean) => Promise<{ success: boolean }>

      // Clipboard operations (more reliable than navigator.clipboard in Electron)
      copyToClipboard: (text: string) => Promise<{ success: boolean; error?: string }>
      readFromClipboard: () => Promise<{ success: boolean; text?: string; error?: string }>
      // Read file paths from clipboard (for Ctrl+V paste from Windows Explorer)
      readFilePathsFromClipboard: () => Promise<{
        success: boolean
        filePaths: string[]
        error?: string
      }>

      // Backup execution
      isBackupRunning: () => Promise<{ running: boolean; startedAt: number | null }>
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
        metadataJson?: string // Database metadata export as JSON string
        vaultName?: string // Vault name for tagging
        vaultPath?: string // Override vault path
      }) => Promise<{
        success: boolean
        snapshotId?: string
        error?: string
        localBackupSuccess?: boolean
        stats?: {
          filesNew: number
          filesChanged: number
          filesUnmodified: number
          bytesAdded: number
          bytesTotal: number
        }
      }>
      listBackupSnapshots: (config: {
        provider: string
        bucket: string
        region?: string
        endpoint?: string
        accessKey: string
        secretKey: string
        resticPassword: string
      }) => Promise<{
        success: boolean
        snapshots?: Array<{
          id: string
          time: string
          hostname: string
          paths: string[]
          tags: string[]
        }>
        error?: string
      }>
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
      }) => Promise<{ success: boolean; hasMetadata?: boolean; error?: string }>
      readBackupMetadata: (vaultPath: string) => Promise<{
        success: boolean
        data?: {
          _type: string
          _version: number
          _exportedAt: string
          _orgId: string
          _orgName: string
          _vaultId: string
          _vaultName: string
          files: Array<unknown>
          fileVersions: Array<unknown>
          fileComments: Array<unknown>
          users: Array<unknown>
        }
        error?: string
      }>
      deleteBackupSnapshot: (config: {
        provider: string
        bucket: string
        region?: string
        endpoint?: string
        accessKey: string
        secretKey: string
        resticPassword: string
        snapshotId: string
      }) => Promise<{ success: boolean; error?: string }>
      onBackupProgress: (
        callback: (progress: { phase: string; percent: number; message: string }) => void,
      ) => () => void
      onBackupLog: (callback: (entry: BackupLogEntry) => void) => () => void

      // Auto Updater
      checkForUpdates: () => Promise<{ success: boolean; updateInfo?: unknown; error?: string }>
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>
      downloadVersionInstaller: (
        version: string,
        downloadUrl: string,
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>
      runInstaller: (filePath: string) => Promise<{ success: boolean; error?: string }>
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

      // External CLI command listener
      onCliCommand: (callback: (data: { requestId: string; command: string }) => void) => () => void

      // Send CLI command response back to main process
      sendCliResponse: (requestId: string, result: unknown) => void

      // CLI token management
      generateCliToken: (userEmail: string) => Promise<{ success: boolean; token?: string }>
      revokeCliToken: () => Promise<{ success: boolean }>

      // Deep Link handling
    } & import('./types/electron/desktopLifecycle').DesktopLifecycleAPI &
      import('./types/electron/extensions').ExtensionAPI &
      import('./types/electron/dbUpgrade').DbUpgradeAPI
  }
}

export {}
