/**
 * Download Command
 *
 * Download cloud-only files to the local vault.
 * Creates necessary parent directories and makes files read-only.
 */

import type { Command, DownloadParams, CommandResult } from '../types'
import { getCloudOnlyFilesFromSelection, buildFullPath, getParentDir } from '../types'
import { ProgressTracker } from '../executor'
import { getDownloadUrl } from '../../storage'
import type { LocalFile } from '../../../stores/pdmStore'
import { isRetryableError, getNetworkErrorMessage, getBackoffDelay, sleep } from '../../network'
import { processWithConcurrency, CONCURRENT_OPERATIONS } from '../../concurrency'
import { log } from '@/lib/logger'
import { FileOperationTracker } from '../../fileOperationTracker'
import { addToSyncIndex } from '../../cache/localSyncIndex'
import { getCommunityVault, isBackendConfigured, type CommunityVault } from '@/lib/community'
import { t } from '@/lib/i18n'

// Number of retry attempts for failed downloads
const MAX_RETRY_ATTEMPTS = 3

// Delay between retries (exponential backoff: 1s, 2s, 4s)
const RETRY_BASE_DELAY_MS = 1000

/**
 * Community file rows loaded from older local caches used the database field
 * name while freshly loaded rows carry the explicit Community alias.
 */
export function resolveCommunityStorageRelativePath(pdmData: unknown): string | null {
  const metadata = pdmData as Record<string, unknown> | null | undefined
  if (
    typeof metadata?._communityStorageRelativePath === 'string' &&
    metadata._communityStorageRelativePath.trim() !== ''
  ) {
    return metadata._communityStorageRelativePath
  }
  if (
    typeof metadata?.storage_relative_path === 'string' &&
    metadata.storage_relative_path.trim() !== ''
  ) {
    return metadata.storage_relative_path
  }

  // CB1.0 installations cached a few Community rows before the storage path
  // field was persisted. Immutable objects are content-addressed, so a valid
  // SHA-256 hash is sufficient to recover the exact vault location.
  const contentHash =
    typeof metadata?.content_hash === 'string'
      ? metadata.content_hash
      : typeof metadata?.contentHash === 'string'
        ? metadata.contentHash
        : ''
  const normalizedHash = contentHash.trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(normalizedHash)
    ? `.blueplm/objects/${normalizedHash.slice(0, 2)}/${normalizedHash}`
    : null
}

/** A folder that now exists locally is no longer server-only. Matches a full load. */
const FOLDER_NOW_LOCAL: Partial<LocalFile> = {
  diffStatus: undefined,
  isSynced: true,
}

/**
 * Cloud directories a download has just given local content, so they are no
 * longer server-only. A folder is `cloud` only when it has cloud content and
 * no local content (`useLoadFiles`); the moment a file lands inside it, that
 * no longer holds.
 *
 * Includes the selected cloud folders plus every cloud directory that is an
 * ancestor of a successfully downloaded file (nested dirs like `STEP Files`).
 * One pass over `allFiles` against a Set of ancestor paths.
 */
export function cloudFoldersResolvedByDownload(
  allFiles: LocalFile[],
  selectedCloudFolders: LocalFile[],
  downloadedRelativePaths: string[],
): LocalFile[] {
  const ancestorPaths = new Set<string>()

  for (const folder of selectedCloudFolders) {
    ancestorPaths.add(normalizeRelativePath(folder.relativePath))
  }

  for (const relativePath of downloadedRelativePaths) {
    const parts = normalizeRelativePath(relativePath).split('/')
    for (let i = 1; i < parts.length; i++) {
      ancestorPaths.add(parts.slice(0, i).join('/'))
    }
  }

  if (ancestorPaths.size === 0) return []

  const seen = new Set<string>()
  const resolved: LocalFile[] = []
  for (const file of allFiles) {
    if (!file.isDirectory || file.diffStatus !== 'cloud') continue
    const key = normalizeRelativePath(file.relativePath)
    if (!ancestorPaths.has(key) || seen.has(key)) continue
    seen.add(key)
    resolved.push(file)
  }
  return resolved
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').toLowerCase()
}

function logDownload(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context: Record<string, unknown>,
) {
  log[level]('[Download]', message, context)
}

// Build file context for logging
function getFileContext(file: LocalFile): Record<string, unknown> {
  return {
    fileName: file.name,
    relativePath: file.relativePath,
    fullPath: file.path,
    isDirectory: file.isDirectory,
    diffStatus: file.diffStatus,
    fileSize: file.pdmData?.file_size,
    contentHash: file.pdmData?.content_hash
      ? `${file.pdmData.content_hash.substring(0, 12)}...`
      : null,
    fileId: file.pdmData?.id,
    version: file.pdmData?.version,
    state: file.pdmData?.workflow_state?.name,
  }
}

export const downloadCommand: Command<DownloadParams> = {
  id: 'download',
  name: 'Download',
  description: 'Download cloud files to local vault',
  aliases: ['dl', 'get'],
  usage: 'download <path> [--recursive]',

  validate({ files }, ctx) {
    if (ctx.isOfflineMode) {
      return 'Cannot download files while offline'
    }

    if (!ctx.organization) {
      return 'No organization connected'
    }

    if (!ctx.vaultPath) {
      return 'No vault path configured'
    }

    if (!files || files.length === 0) {
      return 'No files selected'
    }

    // Get cloud-only files
    const cloudFiles = getCloudOnlyFilesFromSelection(ctx.files, files)

    // Also allow empty cloud-only folders (to create them locally)
    const hasCloudOnlyFolders = files.some((f) => f.isDirectory && f.diffStatus === 'cloud')

    if (cloudFiles.length === 0 && !hasCloudOnlyFolders) {
      return 'No cloud files to download'
    }

    return null
  },

  async execute({ files }, ctx): Promise<CommandResult> {
    const organization = ctx.organization!
    const vaultPath = ctx.vaultPath!
    const operationId = `download-${Date.now()}`
    const communityMode = isBackendConfigured('community')
    let communityVault: CommunityVault | null = null
    if (communityMode) {
      try {
        if (!ctx.activeVaultId)
          return {
            success: false,
            message: t('mdbSetup.noVaultSelected'),
            total: 0,
            succeeded: 0,
            failed: 0,
          }
        communityVault = await getCommunityVault(ctx.activeVaultId)
      } catch (error) {
        log.error('[Download]', 'Failed to load MDB vault', { error })
        return {
          success: false,
          message: t('mdbSetup.vaultLoadFailed'),
          total: 0,
          succeeded: 0,
          failed: 0,
        }
      }
    }

    // Get cloud-only files from selection (for tracker initialization)
    const cloudFilesForTracker = getCloudOnlyFilesFromSelection(ctx.files, files)

    // Initialize file operation tracker for DevTools monitoring
    const tracker = FileOperationTracker.start(
      'download',
      cloudFilesForTracker.length,
      cloudFilesForTracker.map((f) => f.relativePath),
    )

    logDownload('info', 'Starting download operation', {
      operationId,
      orgId: organization.id,
      vaultPath,
      selectedFileCount: files.length,
      selectedPaths: files.map((f) => f.relativePath),
    })

    // Get cloud-only files from selection
    const cloudFiles = getCloudOnlyFilesFromSelection(ctx.files, files)
    const cloudOnlyFolders = files.filter((f) => f.isDirectory && f.diffStatus === 'cloud')

    logDownload('debug', 'Filtered cloud files', {
      operationId,
      cloudFileCount: cloudFiles.length,
      cloudFolderCount: cloudOnlyFolders.length,
      cloudFiles: cloudFiles.map((f) => ({
        name: f.name,
        path: f.relativePath,
        hash: f.pdmData?.content_hash?.substring(0, 12),
      })),
    })

    // Handle empty cloud-only folders - just create them locally
    if (cloudFiles.length === 0 && cloudOnlyFolders.length > 0) {
      let created = 0
      const createdPaths: string[] = []
      const folderErrors: string[] = []

      for (const folder of cloudOnlyFolders) {
        try {
          const fullPath = buildFullPath(vaultPath, folder.relativePath)
          logDownload('debug', 'Creating folder', {
            operationId,
            folder: folder.relativePath,
            fullPath,
          })

          const result = await window.electronAPI?.createFolder(fullPath)
          if (result?.success === false) {
            throw new Error(result.error || 'Unknown error creating folder')
          }
          created++
          createdPaths.push(folder.path)
          logDownload('debug', 'Folder created successfully', {
            operationId,
            folder: folder.relativePath,
          })
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          logDownload('error', 'Failed to create folder', {
            operationId,
            folder: folder.relativePath,
            error: errorMsg,
          })
          folderErrors.push(`${folder.name}: ${errorMsg}`)
        }
      }

      // The folder exists on disk now. Do not removeFilesFromStore — that prefix-prunes
      // descendants and their serverFiles rows. Clear cloud status in place; the
      // existing full refresh below still runs so the tree rebuilds from disk.
      if (createdPaths.length > 0) {
        const createdSet = new Set(createdPaths.map((p) => p.toLowerCase()))
        ctx.updateFilesInStore(
          cloudOnlyFolders
            .filter((folder) => createdSet.has(folder.path.toLowerCase()))
            .map((folder) => ({ path: folder.path, updates: FOLDER_NOW_LOCAL })),
        )
      }

      // Refresh to pick up the newly created local folders
      ctx.onRefresh?.(false) // Non-silent refresh to fully reload

      if (created > 0) {
        ctx.addToast('success', `Created ${created} folder${created > 1 ? 's' : ''} locally`)
      }

      logDownload('info', 'Folder creation complete', {
        operationId,
        created,
        failed: cloudOnlyFolders.length - created,
        errors: folderErrors,
      })

      tracker.endOperation('completed')
      return {
        success: true,
        message: `Created ${created} folder${created > 1 ? 's' : ''} locally`,
        total: cloudOnlyFolders.length,
        succeeded: created,
        failed: cloudOnlyFolders.length - created,
        errors: folderErrors.length > 0 ? folderErrors : undefined,
      }
    }

    if (cloudFiles.length === 0) {
      logDownload('info', 'No cloud files to download', { operationId })
      tracker.endOperation('completed')
      return {
        success: true,
        message: 'No files to download',
        total: 0,
        succeeded: 0,
        failed: 0,
      }
    }

    // Only track actual files being processed - folders show spinners via computed state
    const cloudFilePaths = cloudFiles.map((f) => f.relativePath)
    const selectedFolderPaths = files.filter((f) => f.isDirectory).map((f) => f.relativePath)
    const allPathsToTrack = [...new Set([...cloudFilePaths, ...selectedFolderPaths])]
    ctx.addProcessingFoldersSync(allPathsToTrack, 'download')

    // Register expected file changes to suppress file watcher during operation
    ctx.addExpectedFileChanges(cloudFilePaths)

    // Yield to event loop so React can render spinners before starting download
    // Use 16ms (roughly one frame) to ensure React has time to process state update and re-render
    await new Promise((resolve) => setTimeout(resolve, 16))

    const total = cloudFiles.length

    // Progress tracking
    const toastId = `download-${Date.now()}`
    const progressLabel =
      total === 1
        ? `Downloading ${cloudFiles[0].name}...`
        : `Downloading ${total} cloud file${total > 1 ? 's' : ''}...`

    const progress = new ProgressTracker(ctx, 'download', toastId, progressLabel, total)

    let succeeded = 0
    let failed = 0
    const errors: string[] = []

    // Collect updates for batch store update (incremental pattern from getLatest.ts)
    // This avoids a full filesystem rescan by updating the store directly
    const pendingUpdates: Array<{ path: string; updates: Partial<LocalFile> }> = []

    // Collect paths for batch setReadonly call (performance: 1 IPC call instead of N)
    const pathsToMakeReadonly: string[] = []

    logDownload('info', 'Starting parallel downloads with concurrency limit', {
      operationId,
      totalFiles: cloudFiles.length,
      maxConcurrent: CONCURRENT_OPERATIONS,
    })

    // Start tracking the download phase
    const downloadStepId = tracker.startStep('Download files', {
      fileCount: cloudFiles.length,
      concurrency: CONCURRENT_OPERATIONS,
    })
    const downloadPhaseStart = Date.now()

    // Helper function to download a single file with retry logic
    const downloadWithRetry = async (
      file: LocalFile,
      attempt: number = 1,
    ): Promise<{ success: boolean; error?: string }> => {
      const fileCtx = getFileContext(file)

      if (!file.pdmData?.content_hash) {
        logDownload('error', 'File has no content hash', {
          operationId,
          ...fileCtx,
          pdmData: file.pdmData
            ? {
                id: file.pdmData.id,
                version: file.pdmData.version,
                state: file.pdmData.workflow_state?.name,
                hasHash: !!file.pdmData.content_hash,
              }
            : null,
        })
        return {
          success: false,
          error: `${file.name}: No content hash - file metadata may be corrupted or incomplete`,
        }
      }

      const fullPath = buildFullPath(vaultPath, file.relativePath)
      const parentDir = getParentDir(fullPath)

      try {
        logDownload('debug', 'Downloading file', {
          operationId,
          ...fileCtx,
          fullPath,
          parentDir,
          attempt,
        })

        // Create parent directory
        const mkdirResult = await window.electronAPI?.createFolder(parentDir)
        if (mkdirResult?.success === false) {
          logDownload('error', 'Failed to create parent directory', {
            operationId,
            ...fileCtx,
            parentDir,
            error: mkdirResult.error,
          })
          return {
            success: false,
            error: `${file.name}: Failed to create directory - ${mkdirResult.error}`,
          }
        }

        let downloadResult:
          | { success: boolean; error?: string; size?: number; hash?: string }
          | undefined
        if (communityMode) {
          const storagePath = resolveCommunityStorageRelativePath(file.pdmData)
          if (typeof storagePath !== 'string' || !communityVault) {
            return {
              success: false,
              error: t('mdbSetup.fileStoragePathMissing', { name: file.name }),
            }
          }
          if (communityVault.storageProvider === 'network') {
            if (!communityVault.networkRoot) {
              return {
                success: false,
                error: t('mdbSetup.fileNetworkRootMissing', { name: file.name }),
              }
            }
            const sourcePath = buildFullPath(communityVault.networkRoot, storagePath)
            logDownload('debug', 'Copying current Community revision from network vault', {
              operationId,
              ...fileCtx,
              sourcePath,
              destPath: fullPath,
              attempt,
            })
            const copied = await window.electronAPI?.copyFile(sourcePath, fullPath)
            if (!copied?.success) {
              logDownload('error', 'Failed to copy MDB revision', {
                operationId,
                ...fileCtx,
                error: copied?.error,
              })
              downloadResult = {
                success: false,
                error: t('mdbSetup.fileRevisionCopyFailed', { name: file.name }),
              }
            } else {
              const hashResult = await window.electronAPI?.hashFile(fullPath)
              downloadResult = hashResult?.success
                ? {
                    success: hashResult.hash === file.pdmData.content_hash,
                    hash: hashResult.hash,
                    size: hashResult.size,
                    error:
                      hashResult.hash === file.pdmData.content_hash
                        ? undefined
                        : t('mdbSetup.fileRevisionHashMismatch', { name: file.name }),
                  }
                : {
                    success: false,
                    error: t('mdbSetup.fileRevisionVerifyFailed', { name: file.name }),
                  }
            }
          } else {
            downloadResult = {
              success: false,
              error: t('mdbSetup.fileNetworkVaultOnly', { name: file.name }),
            }
          }
        } else {
          logDownload('debug', 'Getting signed URL', {
            operationId,
            fileName: file.name,
            orgId: organization.id,
            hash: file.pdmData.content_hash?.substring(0, 12),
            attempt,
          })
          const { url, error: urlError } = await getDownloadUrl(
            organization.id,
            file.pdmData.content_hash,
          )
          if (urlError || !url) {
            return {
              success: false,
              error: `${file.name}: ${urlError || 'Failed to get download URL - file may not exist in cloud storage'}`,
            }
          }
          downloadResult = await window.electronAPI?.downloadUrl(
            url,
            fullPath,
            file.pdmData.content_hash,
          )
        }
        if (!downloadResult?.success) {
          const errorMsg = downloadResult?.error || 'Unknown error writing to disk'

          // Retry on network/connectivity errors
          if (isRetryableError(errorMsg) && attempt < MAX_RETRY_ATTEMPTS) {
            const delayMs = getBackoffDelay(attempt, RETRY_BASE_DELAY_MS)
            logDownload('warn', 'Download failed (network issue), retrying...', {
              operationId,
              fileName: file.name,
              attempt,
              maxAttempts: MAX_RETRY_ATTEMPTS,
              error: errorMsg,
              retryDelayMs: Math.round(delayMs),
            })
            await sleep(delayMs)
            return downloadWithRetry(file, attempt + 1)
          }

          // Use user-friendly message for network errors
          const userMessage = getNetworkErrorMessage(errorMsg)

          logDownload('error', 'File download failed', {
            operationId,
            ...fileCtx,
            fullPath,
            downloadError: errorMsg,
            downloadResult,
            attempt,
            willRetry: false,
          })
          return { success: false, error: `${file.name}: ${userMessage}` }
        }

        // Collect for batch setReadonly call (done after all downloads complete)
        // This reduces N IPC calls to 1, improving performance
        pathsToMakeReadonly.push(fullPath)

        logDownload('debug', 'File download complete', {
          operationId,
          fileName: file.name,
          fullPath,
          downloadedSize: downloadResult.size,
          hash: downloadResult.hash?.substring(0, 12),
          attempt,
        })

        // Queue incremental store update - file now exists locally with matching hash
        // This eliminates the need for a full filesystem rescan after download
        pendingUpdates.push({
          path: file.path,
          updates: {
            localHash: downloadResult.hash || file.pdmData.content_hash,
            localVersion: file.pdmData.version,
            diffStatus: undefined,
            isSynced: true,
          },
        })

        return { success: true }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)

        // Retry on network/connectivity errors
        if (isRetryableError(error) && attempt < MAX_RETRY_ATTEMPTS) {
          const delayMs = getBackoffDelay(attempt, RETRY_BASE_DELAY_MS)
          logDownload('warn', 'Download exception (network issue), retrying...', {
            operationId,
            fileName: file.name,
            attempt,
            maxAttempts: MAX_RETRY_ATTEMPTS,
            error: errorMsg,
            retryDelayMs: Math.round(delayMs),
          })
          await sleep(delayMs)
          return downloadWithRetry(file, attempt + 1)
        }

        // Use user-friendly message for network errors
        const userMessage = getNetworkErrorMessage(error)

        logDownload('error', 'Download exception', {
          operationId,
          ...fileCtx,
          fullPath,
          error: errorMsg,
          userMessage,
          stack: error instanceof Error ? error.stack : undefined,
          attempt,
        })
        return { success: false, error: `${file.name}: ${userMessage}` }
      }
    }

    // Process all files with concurrency limit
    const results = await processWithConcurrency(
      cloudFiles,
      CONCURRENT_OPERATIONS,
      async (file) => {
        const result = await downloadWithRetry(file)
        progress.update()
        return result
      },
    )

    // Count results
    for (const result of results) {
      if (result.success) succeeded++
      else {
        failed++
        if (result.error) errors.push(result.error)
      }
    }

    // End download step
    tracker.endStep(downloadStepId, 'completed', {
      succeeded,
      failed,
      durationMs: Date.now() - downloadPhaseStart,
    })

    // Batch set readonly on all downloaded files (optimization: 1 IPC call instead of N)
    if (pathsToMakeReadonly.length > 0) {
      const batchResult = await window.electronAPI?.setReadonlyBatch(
        pathsToMakeReadonly.map((path) => ({ path, readonly: true })),
      )
      if (batchResult?.success === false || batchResult?.results?.some((r) => !r.success)) {
        const failedCount = batchResult?.results?.filter((r) => !r.success).length ?? 0
        logDownload('warn', 'Some files failed to set read-only flag', {
          operationId,
          totalFiles: pathsToMakeReadonly.length,
          failedCount,
        })
      } else {
        logDownload('debug', 'Batch setReadonly complete', {
          operationId,
          fileCount: pathsToMakeReadonly.length,
        })
      }
    }

    // Ensure selected cloud folders exist on disk. File downloads already mkdir
    // their parents, but an empty selected folder (or one whose files all failed)
    // still needs the directory itself.
    if (cloudOnlyFolders.length > 0) {
      for (const folder of cloudOnlyFolders) {
        try {
          const fullPath = buildFullPath(vaultPath, folder.relativePath)
          await window.electronAPI?.createFolder(fullPath)
        } catch {
          // Folder likely already exists from parent dir creation during file downloads
        }
      }
    }

    // Paths of files that actually landed, shared by folder-status resolution
    // and the sync-index update below. Computed before folder rows are appended
    // to pendingUpdates so the list stays file-only.
    const downloadedRelativePaths = pendingUpdates
      .map((u) => cloudFiles.find((f) => f.path === u.path)?.relativePath)
      .filter((p): p is string => !!p)

    // A folder is cloud only while it has cloud content and no local content.
    // Do not removeFilesFromStore — that prefix-prunes the files we just
    // downloaded (and their serverFiles rows), which is the race that made
    // Burn Wire Release vanish and then come back as local-only.
    const resolvedFolders = cloudFoldersResolvedByDownload(
      ctx.files,
      cloudOnlyFolders,
      downloadedRelativePaths,
    )
    for (const folder of resolvedFolders) {
      pendingUpdates.push({ path: folder.path, updates: FOLDER_NOW_LOCAL })
    }
    if (resolvedFolders.length > 0) {
      logDownload('debug', 'Cleared cloud status on resolved folders', {
        operationId,
        folders: resolvedFolders.map((f) => f.relativePath),
      })
    }

    // Apply incremental store updates AND clear processing state atomically
    // Using updateFilesAndClearProcessing() combines both updates into ONE set() call,
    // preventing two expensive re-render cycles with O(N x depth) folderMetrics computation.
    // This eliminates the ~5 second UI freeze that occurred with separate calls.
    const storeUpdateStepId = tracker.startStep('Atomic store update', {
      updateCount: pendingUpdates.length,
    })
    const storeUpdateStart = performance.now()
    // Debug: Log full paths for first few updates to help diagnose path matching issues
    const sampleFullPaths = pendingUpdates.slice(0, 5).map((u) => u.path)
    logDownload('info', 'Downloads finished, starting store update', {
      operationId,
      updateCount: pendingUpdates.length,
      paths: pendingUpdates.map((u) => u.path.split(/[/\\]/).pop()), // Just filenames for brevity
      sampleFullPaths, // Full paths for debugging
      pathsToTrackCount: allPathsToTrack.length,
      timestamp: Date.now(),
    })
    ctx.updateFilesAndClearProcessing(pendingUpdates, allPathsToTrack)
    ctx.setLastOperationCompletedAt(Date.now())
    const storeUpdateDuration = Math.round(performance.now() - storeUpdateStart)
    tracker.endStep(storeUpdateStepId, 'completed', { durationMs: storeUpdateDuration })
    logDownload('debug', 'Store update complete', {
      operationId,
      durationMs: storeUpdateDuration,
      timestamp: Date.now(),
    })

    // Delay clearing expected file changes to allow file watcher suppression to work
    // The 5 second window ensures late file system events are still suppressed
    const pathsToClear = [...cloudFilePaths]
    setTimeout(() => {
      ctx.clearExpectedFileChanges(pathsToClear)
      logDownload('debug', 'Expected file changes cleared (delayed)', {
        operationId,
        count: pathsToClear.length,
        timestamp: Date.now(),
      })
    }, 5000)
    const { duration } = progress.finish()
    // Note: onRefresh() removed - incremental store updates are sufficient for file downloads
    // The folder creation path (line 140) still uses onRefresh() since folders change structure

    // Log final result
    logDownload(failed > 0 ? 'warn' : 'info', 'Download operation complete', {
      operationId,
      total,
      succeeded,
      failed,
      duration,
      errors: errors.length > 0 ? errors : undefined,
    })

    // Show result
    if (failed > 0) {
      // Log errors more prominently
      logDownload('error', 'Some files failed to download', {
        operationId,
        failedCount: failed,
        errors,
      })
      // Show first error in toast for visibility
      const firstError = errors[0] || 'Unknown error'
      const moreText = errors.length > 1 ? ` (+${errors.length - 1} more)` : ''
      ctx.addToast('error', `Download failed: ${firstError}${moreText}`)
    } else {
      ctx.addToast('success', `Downloaded ${succeeded} file${succeeded > 1 ? 's' : ''}`)
    }

    // Update the local sync index with successfully downloaded file paths
    // This tracks which files have been synced for orphan detection
    if (succeeded > 0 && ctx.activeVaultId && downloadedRelativePaths.length > 0) {
      addToSyncIndex(ctx.activeVaultId, downloadedRelativePaths).catch((error) => {
        logDownload('warn', 'Failed to update sync index after download', { error: String(error) })
      })
    }

    // Complete operation tracking
    tracker.endOperation(failed === 0 ? 'completed' : 'failed', failed > 0 ? errors[0] : undefined)

    return {
      success: failed === 0,
      message:
        failed > 0
          ? `Downloaded ${succeeded}/${total} files`
          : `Downloaded ${succeeded} file${succeeded > 1 ? 's' : ''}`,
      total,
      succeeded,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      duration,
    }
  },
}
