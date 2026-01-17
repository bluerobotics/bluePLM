/**
 * Command System Types
 * 
 * Centralized command system for all PDM operations.
 * This enables consistent behavior across:
 * - Right-click context menus (FileContextMenu, FileTree)
 * - Inline buttons (FilePane rows)
 * - Sidebar views (CheckoutView)
 * - Future: Terminal/CLI interface
 * - Future: External API for add-ins
 */

import type { LocalFile as StoreLocalFile, ToastType } from '../../stores/pdmStore'
import type { User, Organization } from '../../types/pdm'
import type { OperationType } from '../../stores/types'

// Re-export LocalFile for use by handlers
export type LocalFile = StoreLocalFile

// Re-export CommandCategory from registry for external use
export type { CommandCategory } from './registry'

// ============================================
// Command Context - Injected into commands
// ============================================

export interface CommandContext {
  // Auth & Organization
  user: User | null
  organization: Organization | null
  isOfflineMode: boolean
  getEffectiveRole: () => string
  
  // Vault info
  vaultPath: string | null
  activeVaultId: string | null
  
  // All files in the vault (for folder operations)
  files: LocalFile[]
  
  // Toast notifications
  addToast: (type: ToastType, message: string, duration?: number) => void
  addProgressToast: (id: string, message: string, total: number) => void
  updateProgressToast: (id: string, current: number, percent: number, speed?: string, label?: string) => void
  removeToast: (id: string) => void
  isProgressToastCancelled: (id: string) => boolean
  
  // Store updates
  updateFileInStore: (path: string, updates: Partial<LocalFile>) => void
  updateFilesInStore: (updates: Array<{ path: string; updates: Partial<LocalFile> }>) => void  // Batch update
  removeFilesFromStore: (paths: string[]) => void
  addFilesToStore: (files: LocalFile[]) => void
  renameFileInStore: (oldPath: string, newPath: string, newNameOrRelPath: string, isMove?: boolean) => void
  clearPersistedPendingMetadataForPaths: (paths: string[]) => void  // Clear persisted metadata during checkout
  addProcessingFolder: (path: string, operationType: OperationType) => void
  addProcessingFolders: (paths: string[], operationType: OperationType) => void  // Batch add (single state update)
  addProcessingFoldersSync: (paths: string[], operationType: OperationType) => void  // Synchronous state update (no batching delay)
  removeProcessingFolder: (path: string) => void
  removeProcessingFolders: (paths: string[]) => void  // Batch remove (single state update)
  
  /**
   * Atomic update: combines file updates + clearing processing state in ONE store update.
   * 
   * This prevents two sequential re-renders that occur with separate updateFilesInStore() +
   * removeProcessingFolders() calls. With 8000+ files, each re-render triggers expensive
   * O(N x depth) folderMetrics computation, causing ~5 second UI freezes.
   * 
   * Use this at the end of download/get-latest operations instead of separate calls.
   */
  updateFilesAndClearProcessing: (
    updates: Array<{ path: string; updates: Partial<LocalFile> }>,
    pathsToClearProcessing: string[]
  ) => void
  
  // Auto-download exclusion (for tracking intentionally removed local copies)
  addAutoDownloadExclusion: (relativePath: string) => void
  
  // File watcher suppression (for preventing redundant refreshes after operations)
  /**
   * Register file paths that we expect to change during this operation.
   * The file watcher will filter out these paths from triggering refreshes.
   */
  addExpectedFileChanges: (paths: string[]) => void
  
  /**
   * Clear expected file paths after operation completes.
   * Call with the same paths passed to addExpectedFileChanges.
   */
  clearExpectedFileChanges: (paths: string[]) => void
  
  /**
   * Set the timestamp when the operation completed.
   * This extends the file watcher suppression window to prevent
   * redundant refreshes from file change events that arrive after
   * the operation finishes but before the watcher's debounce completes.
   */
  setLastOperationCompletedAt: (timestamp: number) => void
  
  // Realtime update debouncing (prevents state drift from stale realtime events)
  /**
   * Mark a file as recently modified locally. Realtime updates will be
   * skipped for this file for 15 seconds to prevent state drift.
   */
  markFileAsRecentlyModified: (fileId: string) => void
  
  /**
   * Clear the recently modified flag for a file.
   */
  clearRecentlyModified: (fileId: string) => void
  
  // Refresh callback
  onRefresh?: (silent?: boolean) => void
  
  /**
   * Existing toast ID (when operation was queued, toast was already created).
   * ProgressTracker will reuse this toast instead of creating a new one.
   */
  existingToastId?: string
  
  /**
   * If true, the command should skip showing success toasts.
   * Used when the caller wants to show its own custom message (e.g., paste operations).
   */
  silent?: boolean
}

// ============================================
// Command Result
// ============================================

export interface CommandResult {
  success: boolean
  message: string
  
  // Counts
  total: number
  succeeded: number
  failed: number
  
  // Optional details
  details?: string[]
  errors?: string[]
  
  // Timing
  duration?: number  // milliseconds
  speed?: string     // e.g., "15.3 MB/s"
}

// ============================================
// Command Parameters
// ============================================

/**
 * Base parameters shared by all file commands.
 * Commands that operate on files extend this interface.
 */
export interface BaseCommandParams {
  /** Array of files to operate on. Can include directories for batch operations. */
  files: LocalFile[]
}

/**
 * Parameters for the checkout command.
 * Locks files for exclusive editing by the current user.
 */
export interface CheckoutParams extends BaseCommandParams {}

/**
 * Parameters for the check-in command.
 * Uploads modified files and releases the checkout lock.
 */
export interface CheckinParams extends BaseCommandParams {
  /**
   * Whether to upload new file content.
   * Set to true for modified files that need their content synced to the server.
   * @default true for modified files
   */
  uploadContent?: boolean
  
  /**
   * Optional comment describing the changes made.
   * Stored in the file's version history for audit purposes.
   */
  comment?: string
}

/**
 * Parameters for the sync (first check-in) command.
 * Uploads new local files to the server for the first time.
 */
export interface SyncParams extends BaseCommandParams {
  /**
   * Extract and store assembly references after sync completes.
   * When enabled, SolidWorks assemblies will have their component references
   * extracted and stored in the `file_references` table for Contains/Where-Used queries.
   * 
   * **Requires:** SolidWorks service to be running.
   * **Use case:** Importing existing vaults with assemblies that need BOM data populated.
   * 
   * @default false
   */
  extractReferences?: boolean
}

/**
 * Parameters for the download command.
 * Downloads cloud-only files to the local filesystem.
 */
export interface DownloadParams extends BaseCommandParams {}

/**
 * Parameters for the delete-local command.
 * Removes local file copies while keeping the server version intact.
 * Useful for freeing disk space on files you don't need locally.
 */
export interface DeleteLocalParams extends BaseCommandParams {}

/**
 * Parameters for the delete-server command.
 * Performs a soft delete - moves files to trash on the server.
 * Files can be restored from trash by an administrator.
 */
export interface DeleteServerParams extends BaseCommandParams {
  /**
   * Whether to also delete local copies of the files.
   * If false, local files are orphaned (exist locally but not on server).
   * @default false
   */
  deleteLocal?: boolean
}

/**
 * Parameters for the discard command.
 * Reverts checked-out files to their last server version, discarding local changes.
 * Also releases the checkout lock.
 */
export interface DiscardParams extends BaseCommandParams {}

/**
 * Parameters for the discard-orphaned command.
 * Deletes local files that no longer exist on the server (orphaned files).
 * These are files that were previously synced but deleted by another user.
 */
export interface DiscardOrphanedParams extends BaseCommandParams {}

/**
 * Parameters for the get-latest command.
 * Downloads the newest version of outdated files from the server.
 * Used when someone else has checked in a newer version.
 */
export interface GetLatestParams extends BaseCommandParams {}

/**
 * Parameters for the force-release command.
 * Releases another user's checkout lock. **Admin only.**
 * Use with caution - the other user will lose their exclusive access.
 */
export interface ForceReleaseParams extends BaseCommandParams {}

/**
 * Parameters for the rename command.
 * Renames a single file or folder.
 */
export interface RenameParams {
  /** The file or folder to rename. */
  file: LocalFile
  
  /** The new name (filename only, not a path). */
  newName: string
}

/**
 * Parameters for the move command.
 * Moves files to a different folder within the vault.
 */
export interface MoveParams extends BaseCommandParams {
  /** 
   * The target folder path (relative to vault root).
   * Must be an existing directory within the vault.
   */
  targetFolder: string
}

/**
 * Parameters for the copy command.
 * Creates copies of files in a different folder.
 */
export interface CopyParams extends BaseCommandParams {
  /** 
   * The target folder path (relative to vault root).
   * Must be an existing directory within the vault.
   */
  targetFolder: string
}

/**
 * Parameters for the new-folder command.
 * Creates a new directory in the vault.
 */
export interface NewFolderParams {
  /** Parent directory path (relative to vault root). Use '' for vault root. */
  parentPath: string
  
  /** Name for the new folder. */
  folderName: string
}

/**
 * Parameters for the pin command.
 * Pins a file to the sidebar for quick access.
 */
export interface PinParams {
  /** The file to pin. */
  file: LocalFile
  
  /** ID of the vault the file belongs to. */
  vaultId: string
  
  /** Display name of the vault (shown in pin UI). */
  vaultName: string
}

/**
 * Parameters for the unpin command.
 * Removes a file from the pinned files list.
 */
export interface UnpinParams {
  /** Full path to the pinned file. */
  path: string
}

/**
 * Parameters for the ignore command.
 * Adds a pattern to the vault's ignore list (.pdmignore).
 */
export interface IgnoreParams {
  /** ID of the vault to add the ignore pattern to. */
  vaultId: string
  
  /** 
   * Glob pattern to ignore (e.g., "*.tmp", "node_modules/").
   * Follows .gitignore pattern syntax.
   */
  pattern: string
}

/**
 * Parameters for the open command.
 * Opens a file with its default system application.
 */
export interface OpenParams {
  /** The file to open. */
  file: LocalFile
}

/**
 * Parameters for the show-in-explorer command.
 * Opens the containing folder in the system file manager.
 */
export interface ShowInExplorerParams {
  /** Full path to the file or folder to reveal. */
  path: string
}

/**
 * Parameters for the refresh-local-metadata command.
 * Extracts metadata from local SolidWorks files and updates pendingMetadata.
 */
export interface RefreshLocalMetadataParams extends BaseCommandParams {}

/**
 * Parameters for the sync-sw-metadata command.
 * Extracts and syncs SolidWorks custom properties to the database.
 */
export interface SyncSwMetadataParams extends BaseCommandParams {}

/**
 * Parameters for the extract-references command.
 * Extracts assembly references from SolidWorks files and stores them in the database.
 * This populates the file_references table for Contains/Where-Used queries.
 * 
 * **Requires:** SolidWorks service to be running.
 */
export interface ExtractReferencesParams extends BaseCommandParams {
  /**
   * Only process assembly files (.sldasm).
   * If false, all selected files are passed to the extractor (parts and drawings will be skipped anyway).
   * @default true
   */
  assembliesOnly?: boolean
}

// Extract assembly references (batch operation for existing vaults)
export interface ExtractReferencesParams extends BaseCommandParams {
  // Only process assemblies in selection (default true)
  assembliesOnly?: boolean
}

// ============================================
// Command Definition
// ============================================

export type CommandId = 
  | 'checkout'
  | 'checkin'
  | 'sync'
  | 'download'
  | 'get-latest'
  | 'delete-local'
  | 'delete-server'
  | 'discard'
  | 'discard-orphaned'
  | 'force-release'
  | 'rename'
  | 'move'
  | 'copy'
  | 'new-folder'
  | 'pin'
  | 'unpin'
  | 'ignore'
  | 'open'
  | 'show-in-explorer'
  | 'refresh-local-metadata'
  | 'sync-sw-metadata'
  | 'extract-references'

export interface Command<TParams = unknown> {
  // Identifier
  id: CommandId
  name: string
  description: string
  
  // CLI support
  aliases?: string[]
  usage?: string  // e.g., "checkout <path> [--recursive]"
  
  // Validation - returns error message or null if valid
  validate: (params: TParams, ctx: CommandContext) => string | null
  
  // Execution
  execute: (params: TParams, ctx: CommandContext) => Promise<CommandResult>
  
  // Undo support (optional)
  canUndo?: boolean
  undo?: (params: TParams, ctx: CommandContext) => Promise<CommandResult>
}

// Type-safe command map
export type CommandMap = {
  'checkout': Command<CheckoutParams>
  'checkin': Command<CheckinParams>
  'sync': Command<SyncParams>
  'download': Command<DownloadParams>
  'get-latest': Command<GetLatestParams>
  'delete-local': Command<DeleteLocalParams>
  'delete-server': Command<DeleteServerParams>
  'discard': Command<DiscardParams>
  'discard-orphaned': Command<DiscardOrphanedParams>
  'force-release': Command<ForceReleaseParams>
  'rename': Command<RenameParams>
  'move': Command<MoveParams>
  'copy': Command<CopyParams>
  'new-folder': Command<NewFolderParams>
  'pin': Command<PinParams>
  'unpin': Command<UnpinParams>
  'ignore': Command<IgnoreParams>
  'open': Command<OpenParams>
  'show-in-explorer': Command<ShowInExplorerParams>
  'refresh-local-metadata': Command<RefreshLocalMetadataParams>
  'sync-sw-metadata': Command<SyncSwMetadataParams>
  'extract-references': Command<ExtractReferencesParams>
}

// ============================================
// Utility Types
// ============================================

// Helper to get files in a folder (including nested)
export function getFilesInFolder(files: LocalFile[], folderPath: string): LocalFile[] {
  const normalizedFolder = folderPath.replace(/\\/g, '/')
  return files.filter(f => {
    if (f.isDirectory) return false
    const normalizedPath = f.relativePath.replace(/\\/g, '/')
    return normalizedPath.startsWith(normalizedFolder + '/')
  })
}

// Helper to get synced files from selection (handles folders)
// "Synced" means files that exist BOTH locally AND on server
// Excludes: cloud, deleted (these only exist on server, not locally)
export function getSyncedFilesFromSelection(files: LocalFile[], selection: LocalFile[]): LocalFile[] {
  const result: LocalFile[] = []
  
  // Statuses that indicate file doesn't exist locally (server-only)
  const serverOnlyStatuses = ['cloud', 'deleted']
  
  for (const item of selection) {
    if (item.isDirectory) {
      // Get all synced files inside the folder
      const filesInFolder = getFilesInFolder(files, item.relativePath)
      const syncedInFolder = filesInFolder.filter(f => 
        f.pdmData?.id && !serverOnlyStatuses.includes(f.diffStatus || '')
      )
      result.push(...syncedInFolder)
    } else if (item.pdmData?.id && !serverOnlyStatuses.includes(item.diffStatus || '')) {
      // Look up fresh file from files array to get current pendingMetadata
      // (selection may have stale reference without latest metadata edits)
      const freshFile = files.find(f => f.path === item.path)
      result.push(freshFile || item)
    }
  }
  
  // Deduplicate by path
  return [...new Map(result.map(f => [f.path, f])).values()]
}

// Helper to get unsynced files from selection
// Includes both 'added' (truly new) and 'deleted_remote' (orphaned local files)
export function getUnsyncedFilesFromSelection(files: LocalFile[], selection: LocalFile[]): LocalFile[] {
  const result: LocalFile[] = []
  
  for (const item of selection) {
    if (item.isDirectory) {
      const filesInFolder = getFilesInFolder(files, item.relativePath)
      const unsyncedInFolder = filesInFolder.filter(f => 
        !f.pdmData || f.diffStatus === 'added' || f.diffStatus === 'deleted_remote'
      )
      result.push(...unsyncedInFolder)
    } else if (!item.pdmData || item.diffStatus === 'added' || item.diffStatus === 'deleted_remote') {
      // Look up fresh file from files array (selection may have stale reference)
      const freshFile = files.find(f => f.path === item.path)
      result.push(freshFile || item)
    }
  }
  
  return [...new Map(result.map(f => [f.path, f])).values()]
}

// Helper to get cloud-only files from selection
export function getCloudOnlyFilesFromSelection(files: LocalFile[], selection: LocalFile[]): LocalFile[] {
  const result: LocalFile[] = []
  
  for (const item of selection) {
    if (item.isDirectory) {
      const filesInFolder = getFilesInFolder(files, item.relativePath)
      const cloudOnly = filesInFolder.filter(f => f.diffStatus === 'cloud')
      result.push(...cloudOnly)
    } else if (item.diffStatus === 'cloud' && item.pdmData) {
      // Look up fresh file from files array (selection may have stale reference)
      const freshFile = files.find(f => f.path === item.path)
      result.push(freshFile || item)
    }
  }
  
  return [...new Map(result.map(f => [f.path, f])).values()]
}

// Helper to get orphaned files from selection
// Orphaned files are local files that were previously synced but no longer exist on server
// (deleted by another user). They have diffStatus === 'deleted_remote'.
export function getOrphanedFilesFromSelection(files: LocalFile[], selection: LocalFile[]): LocalFile[] {
  const result: LocalFile[] = []
  
  for (const item of selection) {
    if (item.isDirectory) {
      const filesInFolder = getFilesInFolder(files, item.relativePath)
      const orphaned = filesInFolder.filter(f => f.diffStatus === 'deleted_remote')
      result.push(...orphaned)
    } else if (item.diffStatus === 'deleted_remote') {
      // Look up fresh file from files array (selection may have stale reference)
      const freshFile = files.find(f => f.path === item.path)
      result.push(freshFile || item)
    }
  }
  
  return [...new Map(result.map(f => [f.path, f])).values()]
}

// Helper to get files that can have their checkout discarded/released
// Includes BOTH:
// 1. Synced files (exist locally) checked out by user - will download server version
// 2. Deleted files (don't exist locally) checked out by user - will just release checkout
export function getDiscardableFilesFromSelection(files: LocalFile[], selection: LocalFile[], userId?: string): LocalFile[] {
  const result: LocalFile[] = []
  
  for (const item of selection) {
    if (item.isDirectory) {
      const filesInFolder = getFilesInFolder(files, item.relativePath)
      // Include synced files and 'deleted' files checked out by user
      const discardable = filesInFolder.filter(f => 
        f.pdmData?.id && 
        f.pdmData.checked_out_by === userId &&
        f.diffStatus !== 'cloud'
      )
      result.push(...discardable)
    } else if (item.pdmData?.id) {
      // Look up fresh file from files array FIRST (selection may have stale reference)
      // Then check on fresh data, not stale selection
      const freshFile = files.find(f => f.path === item.path)
      if (freshFile && 
          freshFile.pdmData?.checked_out_by === userId && 
          freshFile.diffStatus !== 'cloud') {
        result.push(freshFile)
      }
    }
  }
  
  return [...new Map(result.map(f => [f.path, f])).values()]
}

// Format bytes to human readable
// Re-export shared utility functions for backwards compatibility
export { formatBytes, formatSpeed, buildFullPath, getParentDir } from '../utils'

