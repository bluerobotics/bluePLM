import { startTransition } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { executeCommand } from '@/lib/commands'
import { recordMetric } from '@/lib/performanceMetrics'
import { log } from '@/lib/logger'
import { describeError } from '@/lib/errorDetails'
import { hasDesktop } from '@/lib/platform'
import {
  isSameCheckoutProfile,
  updateCachedUserInfo,
  type CacheWriteContext,
} from '@/lib/cache/vaultFileCache'
import { updateInodesWhenIdle, type HashStamp } from '@/lib/cache/localSyncIndex'
import type { CheckoutHydrationStatus, LocalFile } from '@/stores/types'
import type { CheckoutOwnerRef, CheckoutProfileScope } from '@/lib/supabase/files/queries'
import {
  hashCheckoutIdentifier,
  isCheckoutProfileForOwner,
  type CheckoutLoadContext,
  type CheckoutUserProfile,
} from '@/types/pdm'
import { fetchCheckoutProfilesWithRetry } from './checkoutProfiles'
import { stampOf } from './cachedHashValidity'
import { classifyWithComputedHash, selectFilesNeedingHash } from './fileClassification'

/** What the post-load background work needs from the load pass that scheduled it. */
export interface BackgroundTaskContext {
  localFiles: LocalFile[]
  /** Paths whose cached hash was stale or unverified at merge time. */
  rehashPaths: ReadonlySet<string>
  silent: boolean
  forceHashComputation: boolean
  isOfflineMode: boolean
  organization: { id: string } | null
  userId: string | undefined
  loadingForVaultId: string | undefined
  loadContext: CheckoutLoadContext
  cacheContext: CacheWriteContext
  isLoadContextCurrent: () => boolean
  isVaultStale: () => boolean
  setFiles: (files: LocalFile[]) => void
  setStatusMessage: (message: string) => void
}

function getErrorMessage(error: unknown): string {
  // PostgREST errors are plain objects: String() on one is "[object Object]".
  return describeError(error).message ?? String(error)
}

/**
 * Work that runs after a load has rendered: checkout profile hydration, the background hash
 * pass, and auto-download of cloud files and updates. Auto-discard deliberately does not belong
 * here: it mutates the filesystem and so has to stay inside the exclusive load.
 */
export async function runPostLoadBackgroundTasks(ctx: BackgroundTaskContext): Promise<void> {
  const {
    localFiles,
    rehashPaths,
    silent,
    forceHashComputation,
    isOfflineMode,
    organization,
    loadingForVaultId,
    loadContext,
    cacheContext,
    isLoadContextCurrent,
    isVaultStale,
    setFiles,
    setStatusMessage,
  } = ctx
  // Skip background tasks if vault changed
  if (isVaultStale()) {
    window.electronAPI?.log(
      'info',
      '[LoadFiles] Skipping background tasks - vault changed',
    )
    return
  }

  // NOTE: We no longer set read-only status on startup.
  // Read-only is managed at checkout/checkin time only:
  // - Checkout: sets writable
  // - Checkin/Download/GetLatest: sets read-only
  // The file system preserves these attributes between sessions.

  // 1. Lazy-load checked out user info for UI display (non-blocking)
  // This adds user names/emails to the UI without blocking initial render
  const userInfoStart = performance.now()
  const checkedOutFileIds = localFiles
    .filter((f) => !f.isDirectory && f.pdmData?.checked_out_by)
    .map((f) => f.pdmData?.id)
    .filter((fileId): fileId is string => Boolean(fileId))

  const hydrationOwners = new Map<string, string>()
  const cachedProfiles = new Map<string, CheckoutUserProfile | undefined>()
  for (const file of localFiles) {
    if (!file.isDirectory && file.pdmData?.id && file.pdmData.checked_out_by) {
      hydrationOwners.set(file.pdmData.id, file.pdmData.checked_out_by)
      cachedProfiles.set(file.pdmData.id, file.pdmData.checked_out_user ?? undefined)
    }
  }

  if (checkedOutFileIds.length > 0 && organization && loadingForVaultId) {
    const uniqueFileIds = [...new Set(checkedOutFileIds)]
    const hydrationAction = usePDMStore.getState()
    const pendingStatuses: Array<[string, CheckoutHydrationStatus]> = []
    for (const fileId of uniqueFileIds) {
      const ownerId = hydrationOwners.get(fileId)
      if (!ownerId) continue
      pendingStatuses.push([
        fileId,
        {
          ownerId,
          state: 'pending',
          attempt: 0,
          lastError: null,
          requestId: loadContext.requestId,
          updatedAt: Date.now(),
        },
      ])
    }
    // One store update, not one per checked-out file.
    hydrationAction.setCheckoutHydrationStatuses(pendingStatuses)

    const scope: CheckoutProfileScope = {
      orgId: organization.id,
      vaultId: loadingForVaultId,
    }
    const owners: CheckoutOwnerRef[] = pendingStatuses.map(([fileId, status]) => ({
      fileId,
      ownerId: status.ownerId,
    }))
    const profileResult = await fetchCheckoutProfilesWithRetry(
      owners,
      scope,
      loadContext.requestId,
      isLoadContextCurrent,
    )

    if (!isLoadContextCurrent()) {
      log.info('[CheckoutHydration]', 'Discarding stale profile response', {
        requestId: loadContext.requestId,
        orgId: hashCheckoutIdentifier(scope.orgId),
        vaultId: hashCheckoutIdentifier(scope.vaultId),
        responseCount: Object.keys(profileResult.users).length,
        stale: true,
      })
      return
    }

    const usersFound = Object.keys(profileResult.users).length
    const updateStart = performance.now()
    hydrationAction.applyCheckoutUserProfiles(profileResult.users)

    const resolvedFileIds: string[] = []
    const failedStatuses: Array<[string, CheckoutHydrationStatus]> = []
    for (const fileId of uniqueFileIds) {
      const ownerId = hydrationOwners.get(fileId)
      if (!ownerId) continue
      const profile = profileResult.users[fileId]
      if (profile && isCheckoutProfileForOwner(profile, ownerId)) {
        resolvedFileIds.push(fileId)
      } else {
        failedStatuses.push([
          fileId,
          {
            ownerId,
            state: 'error',
            attempt: profileResult.attempts,
            lastError: profileResult.error
              ? getErrorMessage(profileResult.error)
              : 'profile_not_found',
            requestId: loadContext.requestId,
            updatedAt: Date.now(),
          },
        ])
      }
    }
    hydrationAction.clearCheckoutHydrationStatuses(resolvedFileIds)
    hydrationAction.setCheckoutHydrationStatuses(failedStatuses)

    // Only the profiles the cached rows do not already hold: an unchanged map would otherwise
    // read the whole cache entry back on every load just to find nothing to write.
    const changedProfiles: typeof profileResult.users = {}
    for (const [fileId, profile] of Object.entries(profileResult.users)) {
      if (!isSameCheckoutProfile(cachedProfiles.get(fileId), profile)) changedProfiles[fileId] = profile
    }
    // This call is queued after the base cache write, and the context is
    // checked again inside the IndexedDB transaction.
    void updateCachedUserInfo(
      organization.id,
      loadingForVaultId,
      changedProfiles,
      cacheContext,
    )

    recordMetric('VaultLoad', 'User info update complete', {
      durationMs: Math.round(performance.now() - updateStart),
      fetchMs: Math.round(performance.now() - userInfoStart),
      usersFound,
    })
  }
  recordMetric('VaultLoad', 'User info task complete', {
    durationMs: Math.round(performance.now() - userInfoStart),
    checkedOutFiles: checkedOutFileIds.length,
  })

  // 2. Background hash computation - SKIPPED on startup for performance
  // We now use timestamp-based diff detection which is instant.
  // Hashes are computed on-demand at checkin time when accuracy is critical.
  // This saves ~27 seconds on vaults with 25k+ files.
  // When forceHashComputation=true (Full Refresh), compute ALL synced files for accurate sync status.
  //
  // EXCEPTION: even when skipHashComputation=true, we MUST hash "first-sight" files —
  // ones that have a server content_hash but neither a localHash nor a localVersion.
  // The merge has no disk evidence for these, so without a real hash we'd either
  // mis-classify them as synced or have to make up a localVersion (the latter is
  // exactly the bug that caused users to see "v2/v2" while disk content was older).
  // The set is bounded to files we've truly never observed, so cost stays small in
  // steady state.
  const skipHashComputation = !forceHashComputation

  const hashTaskStart = performance.now()
  // When forceHashComputation, compute hashes for ALL files with server content_hash (even if local hash exists)
  // Otherwise, only compute for files without local hash
  // Cloud-only rows and moved-away stubs have no file on disk to hash - their path is where
  // the file would go if it were downloaded. Including them sent ~15,000 paths per load to
  // the hashing IPC, in batches of 20, for the sole purpose of failing readFileSync on each.

  const filesNeedingHash = selectFilesNeedingHash(localFiles, rehashPaths, forceHashComputation)

  recordMetric('VaultLoad', 'Hash computation starting', {
    filesNeedingHash: filesNeedingHash.length,
    totalFiles: localFiles.filter((f) => !f.isDirectory).length,
    skipped: skipHashComputation,
  })

  const computeFileHashes = window.electronAPI?.computeFileHashes
  if (filesNeedingHash.length > 0 && computeFileHashes) {
    window.electronAPI?.log('info', '[LoadFiles] Computing hashes for', {
      count: filesNeedingHash.length,
      forceHashComputation,
    })
    setStatusMessage(
      forceHashComputation
        ? `Full refresh: Computing hashes (0/${filesNeedingHash.length})...`
        : `Checking ${filesNeedingHash.length} files for changes...`,
    )

    // Prepare file list for hash computation
    const hashRequests = filesNeedingHash.map((f) => ({
      path: f.path,
      relativePath: f.relativePath,
      size: f.size,
      mtime: new Date(f.modifiedTime).getTime(),
    }))

    try {
      // Compute hashes in background (with progress updates via IPC)
      const hashComputeStart = performance.now()
      const { results } = await computeFileHashes(hashRequests)
      const hashComputeDuration = performance.now() - hashComputeStart

      recordMetric('VaultLoad', 'Hash IPC complete', {
        durationMs: Math.round(hashComputeDuration),
        filesHashed: results?.length || 0,
      })

      if (results && results.length > 0 && !isVaultStale()) {
        // Create a map for quick lookup
        const hashMap = new Map(results.map((r) => [r.relativePath, r.hash]))

        // Update files with computed hashes and recompute diff status
        const updateStart = performance.now()
        const requestStamps = new Map(
          hashRequests.map((r) => [r.relativePath, { size: r.size, mtimeMs: r.mtime }]),
        )
        const freshlyHashed: Array<{
          path: string
          ino: number
          localVersion?: number
          localHash: string
          hashStamp: HashStamp
          localOnly?: boolean
        }> = []
        const currentFiles = usePDMStore.getState().files
        const updatedFiles = currentFiles.map((f) => {
          const computedHash = hashMap.get(f.relativePath)
          if (!computedHash) return f

          const updated = classifyWithComputedHash(
            f,
            computedHash,
            requestStamps.get(f.relativePath),
            ctx.userId,
          )
          if (!updated) return f

          if (f.pdmData?.content_hash && f.pdmData.content_hash !== computedHash) {
            // Debug: log hash mismatches to help identify stale data issues
            window.electronAPI?.log('warn', '[HashCompute] Hash mismatch detected', {
              file: f.name,
              localHash: computedHash.substring(0, 12),
              serverHash: f.pdmData.content_hash.substring(0, 12),
              localModTime: f.modifiedTime,
              serverUpdatedAt: f.pdmData.updated_at,
              result: updated.diffStatus,
              checkedOut: !!f.pdmData.checked_out_by,
            })
          }

          const current = stampOf(f)
          if (current && f.ino && f.ino > 0 && f.pdmData) {
            freshlyHashed.push({
              path: f.relativePath,
              ino: f.ino,
              localVersion: updated.localVersion,
              localHash: computedHash,
              hashStamp: current,
              localOnly: f.diffStatus === 'moved',
            })
          }
          return updated
        })
        const updateDuration = performance.now() - updateStart

        // Persist the fresh hashes with their stamps, so the next start can tell
        // whether the file changed while the app was closed.
        if (loadingForVaultId && freshlyHashed.length > 0) {
          updateInodesWhenIdle(loadingForVaultId, freshlyHashed).catch((error) => {
            window.electronAPI?.log('warn', '[LoadFiles] Failed to persist hashes', {
              error: String(error),
            })
          })
        }

        // Use startTransition for non-blocking UI updates during background hash computation
        // This prevents UI jank when updating many files' hash status
        startTransition(() => {
          setFiles(updatedFiles)
        })

        recordMetric('VaultLoad', 'Hash update complete', {
          durationMs: Math.round(updateDuration),
          filesUpdated: results.length,
        })
        window.electronAPI?.log('info', '[LoadFiles] Hash computation complete', {
          updated: results.length,
        })
      }
    } catch (error) {
      window.electronAPI?.log('error', '[LoadFiles] Hash computation failed', {
        error: String(error),
      })
    }

    // Clear the status message after hash computation
    setStatusMessage('')

    recordMetric('VaultLoad', 'Hash task complete', {
      durationMs: Math.round(performance.now() - hashTaskStart),
      filesProcessed: filesNeedingHash.length,
    })
  }

  // 3. Auto-download cloud files and updates (if enabled)
  // Run after hash computation so we have accurate diff statuses
  // IMPORTANT: Skip on silent refreshes to prevent infinite loops
  // (silent refreshes are triggered by download/update commands completing)
  if (silent) {
    window.electronAPI?.log('info', '[AutoDownload] Skipping - silent refresh')
  }

  const {
    autoDownloadCloudFiles,
    autoDownloadUpdates,
    addToast,
    autoDownloadExcludedFiles,
    activeVaultId,
  } = usePDMStore.getState()

  // Skip auto-download if vault changed during async operations
  if (isVaultStale()) {
    window.electronAPI?.log('info', '[AutoDownload] Skipping - vault changed during load')
    return
  }

  // Log auto-download settings state for debugging
  window.electronAPI?.log('info', '[AutoDownload] Settings check', {
    autoDownloadCloudFiles,
    autoDownloadUpdates,
    silent,
    hasOrg: !!organization,
    isOfflineMode,
  })

  // Auto-download fills the vault folder, which BluePLM Web does not have.
  if (
    hasDesktop() &&
    !silent &&
    (autoDownloadCloudFiles || autoDownloadUpdates) &&
    organization &&
    !isOfflineMode
  ) {
    const latestFiles = usePDMStore.getState().files

    // Get exclusion list for current vault
    const excludedPaths = activeVaultId
      ? autoDownloadExcludedFiles[activeVaultId] || []
      : []
    const excludedPathsSet = new Set(excludedPaths)

    // Auto-download cloud-only files and folders
    if (autoDownloadCloudFiles) {
      // Get cloud-only files (not in excluded paths)
      const cloudOnlyFiles = latestFiles.filter(
        (f) =>
          !f.isDirectory &&
          f.diffStatus === 'cloud' &&
          f.pdmData?.content_hash &&
          // Exclude files that were intentionally removed locally
          !excludedPathsSet.has(f.relativePath),
      )

      // Get cloud-only folders (will download all their contents)
      const cloudOnlyFolders = latestFiles.filter(
        (f) =>
          f.isDirectory &&
          f.diffStatus === 'cloud' &&
          // Exclude folders that were intentionally removed locally
          !excludedPathsSet.has(f.relativePath),
      )

      // Combine files and folders for download
      const itemsToDownload = [...cloudOnlyFiles, ...cloudOnlyFolders]

      if (itemsToDownload.length > 0) {
        const fileCount = cloudOnlyFiles.length
        const folderCount = cloudOnlyFolders.length
        window.electronAPI?.log('info', '[AutoDownload] Downloading cloud items', {
          files: fileCount,
          folders: folderCount,
        })
        try {
          // Don't pass onRefresh - we already skipped auto-download on silent refreshes,
          // and the download command will update the store. User can manually refresh if needed.
          const result = await executeCommand('download', { files: itemsToDownload })
          if (result.succeeded > 0) {
            const message =
              folderCount > 0
                ? `Auto-downloaded ${result.succeeded} cloud file${result.succeeded > 1 ? 's' : ''} (${folderCount} folder${folderCount > 1 ? 's' : ''})`
                : `Auto-downloaded ${result.succeeded} cloud file${result.succeeded > 1 ? 's' : ''}`
            addToast('success', message)
          }
          if (result.failed > 0) {
            window.electronAPI?.log('warn', '[AutoDownload] Some downloads failed', {
              failed: result.failed,
              errors: result.errors,
            })
          }
        } catch (error) {
          window.electronAPI?.log(
            'error',
            '[AutoDownload] Failed to download cloud files',
            { error: String(error) },
          )
        }
      }
    }

    // Auto-download updates for outdated files
    if (autoDownloadUpdates) {
      // Debug: Log all files with outdated status before filtering
      const allOutdatedStatus = latestFiles.filter((f) => f.diffStatus === 'outdated')
      window.electronAPI?.log('debug', '[AutoDownload] Files with outdated status', {
        count: allOutdatedStatus.length,
        files: allOutdatedStatus.map((f) => ({
          name: f.name,
          relativePath: f.relativePath,
          isDirectory: f.isDirectory,
          hasContentHash: !!f.pdmData?.content_hash,
          contentHash: f.pdmData?.content_hash?.substring(0, 12),
          localHash: f.localHash?.substring(0, 12),
          fileId: f.pdmData?.id,
          checkedOutBy: f.pdmData?.checked_out_by,
        })),
      })

      const outdatedFiles = latestFiles.filter(
        (f) => !f.isDirectory && f.diffStatus === 'outdated' && f.pdmData?.content_hash,
      )

      // Debug: Log files that were filtered out
      const filteredOut = allOutdatedStatus.filter(
        (f) => f.isDirectory || !f.pdmData?.content_hash,
      )
      if (filteredOut.length > 0) {
        window.electronAPI?.log(
          'warn',
          '[AutoDownload] Outdated files FILTERED OUT (no content_hash or is directory)',
          {
            count: filteredOut.length,
            files: filteredOut.map((f) => ({
              name: f.name,
              isDirectory: f.isDirectory,
              hasContentHash: !!f.pdmData?.content_hash,
            })),
          },
        )
      }

      if (outdatedFiles.length > 0) {
        window.electronAPI?.log('info', '[AutoDownload] Updating outdated files', {
          count: outdatedFiles.length,
          files: outdatedFiles.map((f) => ({
            name: f.name,
            relativePath: f.relativePath,
            localHash: f.localHash?.substring(0, 12),
            serverHash: f.pdmData?.content_hash?.substring(0, 12),
            fileId: f.pdmData?.id,
          })),
        })
        try {
          // Don't pass onRefresh - same reason as above
          const result = await executeCommand('get-latest', { files: outdatedFiles })
          window.electronAPI?.log('info', '[AutoDownload] Update result', {
            total: result.total,
            succeeded: result.succeeded,
            failed: result.failed,
            errors: result.errors,
          })
          if (result.succeeded > 0) {
            addToast(
              'success',
              `Auto-updated ${result.succeeded} file${result.succeeded > 1 ? 's' : ''}`,
            )
          }
          if (result.failed > 0) {
            window.electronAPI?.log('warn', '[AutoDownload] Some updates failed', {
              failed: result.failed,
              errors: result.errors,
            })
          }
        } catch (error) {
          window.electronAPI?.log(
            'error',
            '[AutoDownload] Failed to update outdated files',
            { error: String(error) },
          )
        }
      }
    }
  }
}
