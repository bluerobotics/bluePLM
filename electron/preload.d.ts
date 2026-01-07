interface OperationResult {
    success: boolean;
    error?: string;
    canceled?: boolean;
}
interface PathResult extends OperationResult {
    path?: string;
}
interface FileReadResult extends OperationResult {
    data?: string;
    size?: number;
    hash?: string;
}
interface FileWriteResult extends OperationResult {
    hash?: string;
    size?: number;
}
interface HashResult extends OperationResult {
    hash?: string;
}
interface LocalFileInfo {
    name: string;
    path: string;
    relativePath: string;
    isDirectory: boolean;
    extension: string;
    size: number;
    modifiedTime: string;
    hash?: string;
}
interface FilesListResult extends OperationResult {
    files?: LocalFileInfo[];
}
interface FileSelectResult extends OperationResult {
    files?: Array<{
        name: string;
        path: string;
        extension: string;
        size: number;
        modifiedTime: string;
    }>;
}
interface FolderSelectResult extends OperationResult {
    folderName?: string;
    folderPath?: string;
    files?: Array<{
        name: string;
        path: string;
        relativePath: string;
        extension: string;
        size: number;
        modifiedTime: string;
    }>;
}
interface SaveDialogResult extends OperationResult {
    filePath?: string;
}
interface SystemStats {
    cpu: {
        usage: number;
        cores: number[];
    };
    memory: {
        used: number;
        total: number;
        percent: number;
    };
    network: {
        rxSpeed: number;
        txSpeed: number;
    };
    disk: {
        used: number;
        total: number;
        percent: number;
    };
}
declare global {
    interface Window {
        electronAPI: {
            getVersion: () => Promise<string>;
            getPlatform: () => Promise<string>;
            getTitleBarOverlayRect: () => Promise<{
                x: number;
                y: number;
                width: number;
                height: number;
            }>;
            setTitleBarOverlay: (options: {
                color: string;
                symbolColor: string;
            }) => Promise<{
                success: boolean;
                error?: string;
            }>;
            getPathForFile: (file: File) => string;
            reloadApp: () => Promise<{
                success: boolean;
                error?: string;
            }>;
            requestFocus: () => Promise<{
                success: boolean;
                error?: string;
            }>;
            openPerformanceWindow: () => Promise<{
                success: boolean;
                error?: string;
            }>;
            getSystemStats: () => Promise<SystemStats | null>;
            openOAuthWindow: (url: string) => Promise<{
                success: boolean;
                canceled?: boolean;
                error?: string;
            }>;
            getLogs: () => Promise<Array<{
                timestamp: string;
                level: string;
                message: string;
                data?: unknown;
            }>>;
            getLogPath: () => Promise<string | null>;
            exportLogs: () => Promise<{
                success: boolean;
                path?: string;
                error?: string;
                canceled?: boolean;
            }>;
            log: (level: string, message: string, data?: unknown) => void;
            getLogsDir: () => Promise<string>;
            listLogFiles: () => Promise<{
                success: boolean;
                files?: Array<{
                    name: string;
                    path: string;
                    size: number;
                    modifiedTime: string;
                    isCurrentSession: boolean;
                }>;
                error?: string;
            }>;
            readLogFile: (filePath: string) => Promise<{
                success: boolean;
                content?: string;
                error?: string;
            }>;
            openLogsDir: () => Promise<{
                success: boolean;
                error?: string;
            }>;
            deleteLogFile: (filePath: string) => Promise<{
                success: boolean;
                error?: string;
            }>;
            cleanupOldLogs: () => Promise<{
                success: boolean;
                deleted: number;
                error?: string;
            }>;
            getLogRetentionSettings: () => Promise<{
                success: boolean;
                settings?: {
                    maxFiles: number;
                    maxAgeDays: number;
                    maxSizeMb: number;
                    maxTotalSizeMb: number;
                };
                defaults?: {
                    maxFiles: number;
                    maxAgeDays: number;
                    maxSizeMb: number;
                    maxTotalSizeMb: number;
                };
                error?: string;
            }>;
            setLogRetentionSettings: (settings: {
                maxFiles?: number;
                maxAgeDays?: number;
                maxSizeMb?: number;
                maxTotalSizeMb?: number;
            }) => Promise<{
                success: boolean;
                settings?: {
                    maxFiles: number;
                    maxAgeDays: number;
                    maxSizeMb: number;
                    maxTotalSizeMb: number;
                };
                error?: string;
            }>;
            getLogStorageInfo: () => Promise<{
                success: boolean;
                totalSize?: number;
                fileCount?: number;
                logsDir?: string;
                error?: string;
            }>;
            getLogRecordingState: () => Promise<{
                enabled: boolean;
            }>;
            setLogRecordingState: (enabled: boolean) => Promise<{
                success: boolean;
                enabled: boolean;
            }>;
            startNewLogFile: () => Promise<{
                success: boolean;
                path?: string;
                error?: string;
            }>;
            exportFilteredLogs: (entries: Array<{
                raw: string;
            }>) => Promise<{
                success: boolean;
                path?: string;
                error?: string;
                canceled?: boolean;
            }>;
            listCrashFiles: () => Promise<{
                success: boolean;
                files?: Array<{
                    name: string;
                    path: string;
                    size: number;
                    modifiedTime: string;
                }>;
                error?: string;
            }>;
            readCrashFile: (filePath: string) => Promise<{
                success: boolean;
                content?: string;
                error?: string;
            }>;
            openCrashesDir: () => Promise<{
                success: boolean;
                error?: string;
            }>;
            getCrashesDir: () => Promise<string | null>;
            minimize: () => void;
            maximize: () => void;
            close: () => void;
            isMaximized: () => Promise<boolean>;
            selectWorkingDir: () => Promise<PathResult>;
            getWorkingDir: () => Promise<string | null>;
            setWorkingDir: (path: string) => Promise<PathResult>;
            createWorkingDir: (path: string) => Promise<PathResult>;
            clearWorkingDir: () => Promise<OperationResult>;
            readFile: (path: string) => Promise<FileReadResult>;
            writeFile: (path: string, base64Data: string) => Promise<FileWriteResult>;
            downloadUrl: (url: string, destPath: string) => Promise<FileWriteResult>;
            fileExists: (path: string) => Promise<boolean>;
            getFileHash: (path: string) => Promise<HashResult>;
            listWorkingFiles: () => Promise<FilesListResult>;
            listDirFiles: (dirPath: string) => Promise<FilesListResult>;
            computeFileHashes: (files: Array<{
                path: string;
                relativePath: string;
                size: number;
                mtime: number;
            }>) => Promise<{
                success: boolean;
                results?: Array<{
                    relativePath: string;
                    hash: string;
                }>;
                error?: string;
            }>;
            onHashProgress: (callback: (progress: {
                processed: number;
                total: number;
                percent: number;
            }) => void) => () => void;
            createFolder: (path: string) => Promise<OperationResult>;
            deleteItem: (path: string) => Promise<OperationResult>;
            renameItem: (oldPath: string, newPath: string) => Promise<OperationResult>;
            copyFile: (sourcePath: string, destPath: string) => Promise<OperationResult>;
            openInExplorer: (path: string) => Promise<OperationResult>;
            openFile: (path: string) => Promise<OperationResult>;
            setReadonly: (path: string, readonly: boolean) => Promise<OperationResult>;
            isReadonly: (path: string) => Promise<{
                success: boolean;
                readonly?: boolean;
                error?: string;
            }>;
            onDownloadProgress: (callback: (progress: {
                loaded: number;
                total: number;
                speed: number;
            }) => void) => () => void;
            selectFiles: () => Promise<FileSelectResult>;
            selectFolder: () => Promise<FolderSelectResult>;
            showSaveDialog: (defaultName: string) => Promise<SaveDialogResult>;
            checkEDrawingsInstalled: () => Promise<{
                installed: boolean;
                path: string | null;
            }>;
            openInEDrawings: (filePath: string) => Promise<{
                success: boolean;
                error?: string;
            }>;
            getWindowHandle: () => Promise<number[] | null>;
            extractSolidWorksThumbnail: (filePath: string) => Promise<{
                success: boolean;
                data?: string;
                error?: string;
            }>;
            solidworks: {
                isInstalled: () => Promise<{
                    success: boolean;
                    data?: {
                        installed: boolean;
                    };
                }>;
                startService: (dmLicenseKey?: string) => Promise<{
                    success: boolean;
                    data?: {
                        message: string;
                        version?: string;
                        swInstalled?: boolean;
                        fastModeEnabled?: boolean;
                    };
                    error?: string;
                }>;
                stopService: () => Promise<{
                    success: boolean;
                }>;
                getServiceStatus: () => Promise<{
                    success: boolean;
                    data?: {
                        running: boolean;
                        installed?: boolean;
                        version?: string;
                    };
                }>;
                getBom: (filePath: string, options?: {
                    includeChildren?: boolean;
                    configuration?: string;
                }) => Promise<{
                    success: boolean;
                    data?: {
                        assemblyPath: string;
                        configuration: string;
                        items: Array<{
                            fileName: string;
                            filePath: string;
                            fileType: string;
                            quantity: number;
                            configuration: string;
                            partNumber: string;
                            description: string;
                            material: string;
                            revision: string;
                            properties: Record<string, string>;
                        }>;
                        totalParts: number;
                        totalQuantity: number;
                    };
                    error?: string;
                }>;
                getProperties: (filePath: string, configuration?: string) => Promise<{
                    success: boolean;
                    data?: {
                        filePath: string;
                        fileProperties: Record<string, string>;
                        configurationProperties: Record<string, Record<string, string>>;
                        configurations: string[];
                    };
                    error?: string;
                }>;
                setProperties: (filePath: string, properties: Record<string, string>, configuration?: string) => Promise<{
                    success: boolean;
                    data?: {
                        filePath: string;
                        propertiesSet: number;
                        configuration: string;
                    };
                    error?: string;
                }>;
                getConfigurations: (filePath: string) => Promise<{
                    success: boolean;
                    data?: {
                        filePath: string;
                        activeConfiguration: string;
                        configurations: Array<{
                            name: string;
                            isActive: boolean;
                            description: string;
                            properties: Record<string, string>;
                        }>;
                        count: number;
                    };
                    error?: string;
                }>;
                getReferences: (filePath: string) => Promise<{
                    success: boolean;
                    data?: {
                        filePath: string;
                        references: Array<{
                            path: string;
                            fileName: string;
                            exists: boolean;
                            fileType: string;
                        }>;
                        count: number;
                    };
                    error?: string;
                }>;
                getPreview: (filePath: string, configuration?: string) => Promise<{
                    success: boolean;
                    data?: {
                        filePath: string;
                        configuration: string;
                        imageData: string;
                        mimeType: string;
                        width: number;
                        height: number;
                        sizeBytes: number;
                    };
                    error?: string;
                }>;
                getMassProperties: (filePath: string, configuration?: string) => Promise<{
                    success: boolean;
                    data?: {
                        filePath: string;
                        configuration: string;
                        mass: number;
                        volume: number;
                        surfaceArea: number;
                        centerOfMass: {
                            x: number;
                            y: number;
                            z: number;
                        };
                        momentsOfInertia: {
                            Ixx: number;
                            Iyy: number;
                            Izz: number;
                            Ixy: number;
                            Izx: number;
                            Iyz: number;
                        };
                    };
                    error?: string;
                }>;
                exportPdf: (filePath: string, outputPath?: string) => Promise<{
                    success: boolean;
                    data?: {
                        inputFile: string;
                        outputFile: string;
                        fileSize: number;
                    };
                    error?: string;
                }>;
                exportStep: (filePath: string, options?: {
                    outputPath?: string;
                    configuration?: string;
                    exportAllConfigs?: boolean;
                }) => Promise<{
                    success: boolean;
                    data?: {
                        inputFile: string;
                        exportedFiles: string[];
                        count: number;
                    };
                    error?: string;
                }>;
                exportDxf: (filePath: string, outputPath?: string) => Promise<{
                    success: boolean;
                    data?: {
                        inputFile: string;
                        outputFile: string;
                        fileSize: number;
                    };
                    error?: string;
                }>;
                exportIges: (filePath: string, outputPath?: string) => Promise<{
                    success: boolean;
                    data?: {
                        inputFile: string;
                        outputFile: string;
                        fileSize: number;
                    };
                    error?: string;
                }>;
                exportImage: (filePath: string, options?: {
                    outputPath?: string;
                    width?: number;
                    height?: number;
                }) => Promise<{
                    success: boolean;
                    data?: {
                        inputFile: string;
                        outputFile: string;
                        width: number;
                        height: number;
                        fileSize: number;
                    };
                    error?: string;
                }>;
                replaceComponent: (assemblyPath: string, oldComponent: string, newComponent: string) => Promise<{
                    success: boolean;
                    data?: {
                        assemblyPath: string;
                        oldComponent: string;
                        newComponent: string;
                        replacedCount: number;
                    };
                    error?: string;
                }>;
                packAndGo: (filePath: string, outputFolder: string, options?: {
                    prefix?: string;
                    suffix?: string;
                }) => Promise<{
                    success: boolean;
                    data?: {
                        sourceFile: string;
                        outputFolder: string;
                        totalFiles: number;
                        copiedFiles: number;
                        files: string[];
                    };
                    error?: string;
                }>;
            };
            isEDrawingsNativeAvailable: () => Promise<boolean>;
            createEDrawingsPreview: () => Promise<{
                success: boolean;
                error?: string;
            }>;
            attachEDrawingsPreview: () => Promise<{
                success: boolean;
                error?: string;
            }>;
            loadEDrawingsFile: (filePath: string) => Promise<{
                success: boolean;
                error?: string;
            }>;
            setEDrawingsBounds: (x: number, y: number, w: number, h: number) => Promise<{
                success: boolean;
            }>;
            showEDrawingsPreview: () => Promise<{
                success: boolean;
            }>;
            hideEDrawingsPreview: () => Promise<{
                success: boolean;
            }>;
            destroyEDrawingsPreview: () => Promise<{
                success: boolean;
            }>;
            checkForUpdates: () => Promise<{
                success: boolean;
                updateInfo?: unknown;
                error?: string;
            }>;
            downloadUpdate: () => Promise<{
                success: boolean;
                error?: string;
            }>;
            installUpdate: () => Promise<{
                success: boolean;
                error?: string;
            }>;
            getUpdateStatus: () => Promise<{
                updateAvailable: {
                    version: string;
                    releaseDate?: string;
                    releaseNotes?: string;
                } | null;
                updateDownloaded: boolean;
                downloadProgress: {
                    percent: number;
                    bytesPerSecond: number;
                    transferred: number;
                    total: number;
                } | null;
            }>;
            postponeUpdate: (version: string) => Promise<{
                success: boolean;
            }>;
            clearUpdateReminder: () => Promise<{
                success: boolean;
            }>;
            getUpdateReminder: () => Promise<{
                version: string;
                postponedAt: number;
            } | null>;
            onUpdateChecking: (callback: () => void) => () => void;
            onUpdateAvailable: (callback: (info: {
                version: string;
                releaseDate?: string;
                releaseNotes?: string;
            }) => void) => () => void;
            onUpdateNotAvailable: (callback: (info: {
                version: string;
            }) => void) => () => void;
            onUpdateDownloadProgress: (callback: (progress: {
                percent: number;
                bytesPerSecond: number;
                transferred: number;
                total: number;
            }) => void) => () => void;
            onUpdateDownloaded: (callback: (info: {
                version: string;
                releaseDate?: string;
                releaseNotes?: string;
            }) => void) => () => void;
            onUpdateError: (callback: (error: {
                message: string;
            }) => void) => () => void;
            onMenuEvent: (callback: (event: string) => void) => () => void;
            onFilesChanged: (callback: (files: string[]) => void) => () => void;
            onSetSession: (callback: (tokens: {
                access_token: string;
                refresh_token: string;
                expires_in?: number;
                expires_at?: number;
            }) => void) => () => void;
            onCliCommand: (callback: (data: {
                requestId: string;
                command: string;
            }) => void) => () => void;
            sendCliResponse: (requestId: string, result: unknown) => void;
        };
    }
}
export {};
