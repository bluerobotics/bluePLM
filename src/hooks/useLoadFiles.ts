// The per-file classification, rename detection, background hash pass and folder refresh
// live in ./useLoadFiles/ as functions that take their inputs, so they can be tested without
// React. The rules that decide a file's status are in ./useLoadFiles/fileClassification.ts.

import { useCallback, useRef } from 'react'
// flushSync removed - causes React crashes when called during existing render cycles
import { usePDMStore } from '@/stores/pdmStore'
import { useShallow } from 'zustand/react/shallow'
import { getFilesLightweight, getVaultFolders } from '@/lib/supabase'
import { executeCommand } from '@/lib/commands'
import { buildFullPath } from '@/lib/commands/types'
import { isAutomaticDiscardCoolingDown } from '@/lib/commands/handlers/discardOrphaned'
import { recordMetric } from '@/lib/performanceMetrics'
import { log } from '@/lib/logger'
import {
  getFilesWithCache,
  type CacheWriteContext,
  type CachedServerFile,
} from '@/lib/cache/vaultFileCache'
import {
  getSyncIndex,
  updateSyncIndexFromServer,
  getInodeMap,
  getVersionMap,
  updateInodes,
  type SavedVersionData,
  type SyncIndexPathInfo,
} from '@/lib/cache/localSyncIndex'
import { t } from '@/lib/i18n'
import { describeError } from '@/lib/errorDetails'
import {
  hashCheckoutIdentifier,
  type CheckoutLoadContext,
  type LoadFilesSessionContext,
  type PDMFile,
} from '@/types/pdm'
import {
  computeLocalScanFingerprint,
  computeServerFolderFingerprint,
  consumeSupersededLoad,
  getLastMergedState,
  markLoadSuperseded,
  runExclusiveLoad,
  setLastMergedState,
  shouldSkipMerge,
} from './loadFilesCoordination'
import { getFileMutationEpoch } from '@/lib/fileMutationEpoch'
import { reconcileCloudFiles, serverIdsByLocalPath } from './useLoadFiles/cloudFileReconciliation'
import { findExclusionsForFilesPresentLocally } from './useLoadFiles/autoDownloadExclusionPruning'
import {
  buildAutoDiscardToastMessage,
  commonOrphanFolderName,
  runAutoDiscardForOrphans,
  selectDiscardableOrphans,
  shouldSkipAutoDiscardForOrphans,
} from './useLoadFiles/autoDiscard'
import { runPostLoadBackgroundTasks } from './useLoadFiles/backgroundTasks'
import { runGhostDirectoryCleanup } from './useLoadFiles/ghostDirectoryCleanup'
import type { DeletedFolderRecord } from '@/lib/ghostDirectories'
import { createYieldGate, mapYielding, YIELD_CHECK_STRIDE } from './useLoadFiles/mergeYield'
import {
  buildMergeLookups,
  buildSyncIndexEntries,
  mergeLocalFileWithServer,
} from './useLoadFiles/mergeLocalFile'
import { detectInodeRenames, hashRenameCandidates } from './useLoadFiles/renameDetection'
import { rowsSettledAtServerPath, takeOwnInodeMoves } from './useLoadFiles/autoReconcileOwnMoves'
import { useRefreshCurrentFolder } from './useLoadFiles/useRefreshCurrentFolder'
import { hasDesktop } from '@/lib/platform'

export {
  buildAutoDiscardToastMessage,
  commonOrphanFolderName,
  runAutoDiscardForOrphans,
  selectDiscardableOrphans,
  shouldSkipAutoDiscardForOrphans,
}
export type { AutoDiscardSanityCheckInput } from './useLoadFiles/autoDiscard'

/** What a local scan returns. On the web, with no bridge, it is always empty. */
type LocalScanResult = Awaited<
  ReturnType<NonNullable<Window['electronAPI']>['listWorkingFilesDelta']>
>

/** Enough orphan paths to see what a batch is without logging thousands. */
const ORPHAN_LOG_SAMPLE_LIMIT = 10

let loadRequestSequence = 0
const latestLoadRequestByVault = new Map<string, string>()

function createLoadRequestId(): string {
  loadRequestSequence += 1
  return `load-${Date.now()}-${loadRequestSequence}`
}

function getErrorMessage(error: unknown): string {
  // PostgREST errors are plain objects: String() on one is "[object Object]".
  return describeError(error).message ?? String(error)
}

/**
 * Hook to load files from working directory and merge with PDM data
 * Handles:
 * - Local file scanning
 * - Server file fetching and merging
 * - Diff status computation (added, modified, outdated, moved, cloud, deleted)
 * - Background hash computation
 * - Auto-download of cloud files and updates
 *
 * @param sessionContext Optional auth boundary supplied by useAuth:
 * `{ authenticatedUserId: string | null; sessionGeneration: number }`.
 */
export function useLoadFiles(sessionContext?: LoadFilesSessionContext) {
  const {
    vaultPath,
    organization,
    isOfflineMode,
    activeVaultId,
    connectedVaults,
    user,
    setFiles,
    setServerFiles,
    setServerFolderPaths,
    setIsLoading,
    setStatusMessage,
    setFilesLoaded,
  } = usePDMStore(
    useShallow((s) => ({
      vaultPath: s.vaultPath,
      organization: s.organization,
      isOfflineMode: s.isOfflineMode,
      activeVaultId: s.activeVaultId,
      connectedVaults: s.connectedVaults,
      user: s.user,
      setFiles: s.setFiles,
      setServerFiles: s.setServerFiles,
      setServerFolderPaths: s.setServerFolderPaths,
      setIsLoading: s.setIsLoading,
      setStatusMessage: s.setStatusMessage,
      setFilesLoaded: s.setFilesLoaded,
    })),
  )

  const latestSessionContext = useRef<LoadFilesSessionContext | undefined>(sessionContext)
  latestSessionContext.current = sessionContext


  const authenticatedUserId =
    sessionContext?.authenticatedUserId !== undefined
      ? sessionContext.authenticatedUserId
      : (user?.id ?? null)
  const sessionGeneration = sessionContext?.sessionGeneration ?? 0

  // Get current vault ID (from activeVaultId or first connected vault)
  const currentVaultId = activeVaultId || connectedVaults[0]?.id

  // Load files from working directory and merge with PDM data
  // silent = true means no loading spinner (for background refreshes after downloads/uploads)
  // forceHashComputation = true forces full hash computation on ALL synced files (for Full Refresh)
  // changedRelativePaths, when supplied by the file watcher, lets the main process
  // re-stat only those paths instead of walking the whole vault.
  // Callers should use loadFiles below, which serializes passes; this is the raw implementation.
  const runLoadFiles = useCallback(
    async (
      silent: boolean = false,
      forceHashComputation: boolean = false,
      changedRelativePaths?: string[],
    ) => {
      // Capture vault context at start - used to detect if vault changed during async operations
      const loadingForVaultId = currentVaultId
      const loadingForVaultPath = vaultPath
      const loadContext: CheckoutLoadContext = {
        orgId: organization?.id ?? null,
        vaultId: loadingForVaultId ?? null,
        vaultPath: loadingForVaultPath,
        authenticatedUserId,
        sessionGeneration,
        requestId: createLoadRequestId(),
      }
      if (loadContext.vaultId) {
        latestLoadRequestByVault.set(loadContext.vaultId, loadContext.requestId)
      }

      window.electronAPI?.log('info', '[LoadFiles] Called with', {
        vaultPath: loadingForVaultPath,
        currentVaultId: loadingForVaultId,
        silent,
        forceHashComputation,
        changedPathCount: changedRelativePaths?.length ?? 0,
        changedPaths: changedRelativePaths?.slice(0, 10),
      })
      log.info('[CheckoutHydration]', 'Load context captured', {
        requestId: loadContext.requestId,
        orgId: hashCheckoutIdentifier(loadContext.orgId),
        vaultId: hashCheckoutIdentifier(loadContext.vaultId),
        vaultPath: hashCheckoutIdentifier(loadContext.vaultPath),
        authenticatedUserId: hashCheckoutIdentifier(loadContext.authenticatedUserId),
        sessionGeneration: loadContext.sessionGeneration,
      })
      // BluePLM Web has no bridge and no vault folder: it loads the server rows only, against the
      // vault's virtual path, and the local scan below is empty.
      if (!loadingForVaultPath) return

      // A watcher delta refresh can be caused by BluePLM's own SolidWorks metadata write. Clearing
      // every configuration cache here would collapse the tree while the user is editing, even
      // when the file watcher delivers the event after watcher suppression expires. The edit path
      // already updates its cached configuration row, so keep the cache for targeted refreshes.
      // Full/manual refreshes still clear everything so they always reload SolidWorks data.
      const isWatcherDeltaRefresh = silent && (changedRelativePaths?.length ?? 0) > 0
      if (!isWatcherDeltaRefresh) {
        usePDMStore.getState().clearAllConfigCaches()
      }

      if (!silent) {
        setIsLoading(true)
        setStatusMessage(
          forceHashComputation ? 'Full refresh: Loading files...' : 'Loading files...',
        )
        // Yield to UI thread so loading state renders before heavy work
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      // Every asynchronous stage uses the same org/vault/path/session boundary.
      const isLoadContextCurrent = () => {
        const currentState = usePDMStore.getState()
        const currentActive = currentState.activeVaultId || currentState.connectedVaults[0]?.id
        const currentSession = latestSessionContext.current
        const currentUserId = currentState.user?.id ?? null
        const sessionMatches =
          currentSession === undefined ||
          (currentSession.authenticatedUserId === loadContext.authenticatedUserId &&
            currentSession.sessionGeneration === loadContext.sessionGeneration)
        const requestMatches =
          !loadContext.vaultId ||
          latestLoadRequestByVault.get(loadContext.vaultId) === loadContext.requestId

        return (
          currentState.organization?.id === loadContext.orgId &&
          (currentActive ?? null) === loadContext.vaultId &&
          currentState.vaultPath === loadContext.vaultPath &&
          currentUserId === loadContext.authenticatedUserId &&
          sessionMatches &&
          requestMatches
        )
      }
      const isVaultStale = () => !isLoadContextCurrent()
      const cacheContext: CacheWriteContext = {
        requestId: loadContext.requestId,
        isCurrent: isLoadContextCurrent,
      }

      // Gates the auto-discard below. The catch swallows errors rather than
      // rethrowing, so a failed pass also reaches that code; only a pass that
      // actually committed has an orphan list worth acting on.
      let committedMerge = false

      // Orphans whose file on disk was written after the server row disappeared, so
      // the local copy holds work that exists nowhere else. Collected during the merge,
      // where the tombstone timestamps are in scope, and read by the auto-discard.
      const orphansEditedSinceServerRowLost = new Set<string>()

      // Populated only inside the merge branch that actually built `pdmMap` (server
      // fetch attempted, no error). Declared here, rather than where they're set, so
      // the auto-discard sanity check below can read them after the try block that
      // computed them has closed its scope.
      let serverRowCountAtMerge: number | undefined
      let previouslySyncedCountAtMerge = 0
      let serverFoldersErroredAtMerge = false
      let deletedFoldersAtMerge: DeletedFolderRecord[] = []

      // `files.id`s this pass found at a new path by NTFS file index, for autoReconcileOwnMoves.
      let inodeMatchedFileIds = new Set<string>()
      let settledBeforeLoad = new Set<string>()

      try {
        // Run local file scan and server fetch in PARALLEL for faster boot
        // Note: listWorkingFiles now returns FAST (no blocking hash computation)
        // Hashes are computed in background after initial display
        const shouldFetchServer = organization && !isOfflineMode && currentVaultId

        if (!silent) {
          setStatusMessage(
            shouldFetchServer ? 'Loading local & cloud files...' : 'Scanning local files...',
          )
        }

        // Start timing for vault load operations
        const vaultLoadStart = performance.now()
        recordMetric('VaultLoad', 'Starting vault load', { silent })

        // Start both operations at once, tracking each separately
        const localScanStart = performance.now()
        let localScanEnd = 0

        // Snapshot taken before the scan reads the disk, so any file operation that
        // lands while this pass runs makes the merge stale. See fileMutationEpoch.
        const epochAtScanStart = getFileMutationEpoch()

        // The server list, the server folder set and the sync index are written only once
        // the merge is known to commit. A discarded merge used to leave them behind: a load
        // that fetched the server mid-move kept 10 already-deleted rows in `serverFiles`,
        // and a folder delete then counted and "deleted" them again.
        const commitsAfterMerge: Array<() => void> = []

        // A delta scan is only safe when it can build on a prior full scan; the
        // main process falls back to a full walk on its own if it cannot.
        const canDeltaScan =
          !forceHashComputation &&
          changedRelativePaths !== undefined &&
          changedRelativePaths.length > 0

        const bridge = window.electronAPI
        const localScan: Promise<LocalScanResult> = !bridge
          ? Promise.resolve({ success: true, files: [] })
          : canDeltaScan
            ? bridge.listWorkingFilesDelta(changedRelativePaths!)
            : bridge.listWorkingFiles()
        const localPromise = localScan.then((result) => {
          localScanEnd = performance.now()
          return result
        })

        // Server fetch with caching - tries IndexedDB cache first, then delta sync
        // First load: Full fetch via RPC + cache in IndexedDB
        // Subsequent loads: Load from cache instantly + fetch only changes (delta sync)
        const serverPromise = shouldFetchServer
          ? getFilesWithCache(
              organization.id,
              currentVaultId,
              () => getFilesLightweight(organization.id, currentVaultId),
              cacheContext,
            )
          : Promise.resolve({
              files: null,
              error: null,
              cacheHit: false,
              deltaCount: 0,
              timing: { cacheReadMs: 0, fetchMs: 0, mergeMs: 0 },
            })

        // Also load the local sync index for detecting orphaned files
        // The sync index tracks files that were previously synced - if they're not on server anymore,
        // they were deleted by another user (orphaned)
        const syncIndexPromise = currentVaultId
          ? getSyncIndex(currentVaultId)
          : Promise.resolve(new Map<string, SyncIndexPathInfo>())

        // Load inode map for rename detection (ino -> old relativePath)
        const inodeMapPromise = currentVaultId
          ? getInodeMap(currentVaultId)
          : Promise.resolve(new Map<number, string[]>())

        // Load persisted version/hash data for accurate outdated detection on app restart
        const versionMapPromise = currentVaultId
          ? getVersionMap(currentVaultId)
          : Promise.resolve(new Map<string, SavedVersionData>())

        // Fetch server folders (for empty folder sync feature)
        // These are explicit folder records, separate from implicit folders derived from file paths
        const serverFoldersPromise =
          shouldFetchServer && currentVaultId
            ? getVaultFolders(currentVaultId, { includeDeleted: true })
            : Promise.resolve({ folders: [], deletedFolders: [], error: undefined })

        // Wait for all to complete
        const [
          localResult,
          serverResultWithCache,
          localSyncIndex,
          savedInodeMap,
          savedVersionMap,
          serverFoldersResult,
        ] = await Promise.all([
          localPromise,
          serverPromise,
          syncIndexPromise,
          inodeMapPromise,
          versionMapPromise,
          serverFoldersPromise,
        ])

        // Extract files from cache result
        const serverResult = {
          files: serverResultWithCache.files as CachedServerFile[] | null,
          error: serverResultWithCache.error,
        }

        // Record timing for local scan
        const localScanDuration = localScanEnd - localScanStart
        recordMetric('VaultLoad', 'Local scan complete', {
          durationMs: Math.round(localScanDuration),
          fileCount: localResult.files?.length || 0,
        })

        // Record timing for server fetch (only if we actually fetched)
        if (shouldFetchServer) {
          recordMetric('VaultLoad', 'Server fetch complete', {
            durationMs: serverResultWithCache.timing.fetchMs,
            fileCount: serverResult.files?.length || 0,
            cacheHit: serverResultWithCache.cacheHit,
            deltaCount: serverResultWithCache.deltaCount,
            cacheReadMs: serverResultWithCache.timing.cacheReadMs,
            networkFetchMs: serverResultWithCache.timing.fetchMs,
            deltaMergeMs: serverResultWithCache.timing.mergeMs,
          })
        }

        // Process local files
        if (!localResult.success || !localResult.files) {
          const errorMsg = localResult.error || 'Failed to load files'
          window.electronAPI?.log('error', '[LoadFiles] Local file scan failed', {
            errorMsg,
            vaultPath,
            hasWorkingDir: !!localResult,
          })
          setStatusMessage(errorMsg)
          return
        }

        if (!isLoadContextCurrent()) {
          log.info('[CheckoutHydration]', 'Discarding load before merge', {
            requestId: loadContext.requestId,
            orgId: hashCheckoutIdentifier(loadContext.orgId),
            vaultId: hashCheckoutIdentifier(loadContext.vaultId),
            stale: true,
          })
          return
        }

        window.electronAPI?.log('info', '[LoadFiles] Scanned local items', {
          count: localResult.files.length,
          wasFullScan: 'wasFullScan' in localResult ? localResult.wasFullScan : !canDeltaScan,
          deltaScan: canDeltaScan,
        })

        // Skip the merge when none of its four inputs moved - see `shouldSkipMerge`
        // for what each signal covers. The folder fingerprint is what makes an
        // empty-folder deletion (which moves no file) still force the merge that the
        // `folders` realtime subscription schedules; the other three signals alone
        // would recompute the same result over ~25k rows and rewrite the entire sync
        // index for nothing on a pass where nothing actually needs it.
        //
        // Restricted to silent refreshes (the watcher path this exists for) and to
        // vaults already merged once, so explicit user refreshes and the first load of
        // a vault always take the full path.
        const localScanFingerprint = computeLocalScanFingerprint(localResult.files)
        const serverFolderFingerprint = computeServerFolderFingerprint(
          (serverFoldersResult.folders || []).map((folder) => folder.folder_path),
        )
        const lastMerged = getLastMergedState(loadingForVaultId)
        const storeState = usePDMStore.getState()
        const canSkipMerge = shouldSkipMerge({
          silent,
          forceHashComputation,
          serverCacheHit: serverResultWithCache.cacheHit,
          serverDeltaCount: serverResultWithCache.deltaCount,
          serverFoldersErrored: Boolean(serverFoldersResult.error),
          lastMerged,
          localScanFingerprint,
          storeFileCount: storeState.files.length,
          serverFolderFingerprint,
          filesLoaded: storeState.filesLoaded,
          vaultStale: isVaultStale(),
        })

        if (canSkipMerge) {
          window.electronAPI?.log(
            'info',
            '[LoadFiles] Skipping merge - no local, server or store changes',
            {
              localFileCount: localResult.files.length,
              localScanMs: Math.round(localScanDuration),
            },
          )
          recordMetric('VaultLoad', 'Skipped merge (no changes)', {
            localFileCount: localResult.files.length,
            localScanMs: Math.round(localScanDuration),
          })
          return
        }

        window.electronAPI?.log('info', '[LoadFiles] Server query params', {
          orgId: organization?.id,
          vaultId: currentVaultId,
          shouldFetchServer,
          serverFileCount: serverResult.files?.length || 0,
          serverError: serverResult.error ? getErrorMessage(serverResult.error) : undefined,
        })

        // Debug: Log first few paths for comparison (helps debug path matching issues)
        if (serverResult.files && serverResult.files.length > 0) {
          const sampleServer = serverResult.files.slice(0, 5).map((f: any) => f.file_path)
          const sampleLocal = localResult.files
            .filter((f: any) => !f.isDirectory)
            .slice(0, 5)
            .map((f: any) => f.relativePath)
          window.electronAPI?.log('info', '[LoadFiles] Sample SERVER paths', sampleServer)
          window.electronAPI?.log('info', '[LoadFiles] Sample LOCAL paths', sampleLocal)

          // Try to find a matching file by name and compare full paths
          const firstServerFile = serverResult.files[0] as any // TODO: type this
          if (firstServerFile) {
            const serverFileName =
              firstServerFile.file_name || firstServerFile.file_path.split('/').pop()
            const matchingLocal = localResult.files.find((f: any) => f.name === serverFileName)
            if (matchingLocal) {
              window.electronAPI?.log('info', '[LoadFiles] PATH COMPARISON', {
                fileName: serverFileName,
                serverPath: firstServerFile.file_path,
                localPath: matchingLocal.relativePath,
                serverLower: firstServerFile.file_path.toLowerCase(),
                localLower: matchingLocal.relativePath.toLowerCase(),
                pathsEqual:
                  firstServerFile.file_path.toLowerCase() ===
                  matchingLocal.relativePath.toLowerCase(),
              })
            } else {
              window.electronAPI?.log('warn', '[LoadFiles] Could not find local file with name', {
                serverFileName,
              })
            }
          }
        }

        // Map hash to localHash for comparison
        let localFiles = localResult.files.map((f: any) => ({
          ...f,
          localHash: f.hash,
        }))

        // Paths whose cached hash is stale (the file changed on disk since it was hashed) or
        // unverified (no stamp to check it against). The background hash pass re-hashes them
        // even when it otherwise skips files with a tracked localVersion, and their cached
        // hash is never persisted with a stamp.
        const rehashPaths = new Set<string>()

        // Get ignored paths checker for later use (don't filter, just mark as ignored)
        const isIgnoredPath = currentVaultId
          ? (path: string) => usePDMStore.getState().isPathIgnored(currentVaultId, path)
          : () => false

        // 2. If connected to Supabase, merge PDM data
        const mergeStart = performance.now()
        const yieldIfSlow = createYieldGate()
        if (shouldFetchServer) {
          const pdmFiles = serverResult.files
          const pdmError = serverResult.error

          if (pdmError) {
            window.electronAPI?.log('warn', '[LoadFiles] Failed to fetch PDM data', {
              error: pdmError,
            })
          } else if (pdmFiles && Array.isArray(pdmFiles)) {
            serverRowCountAtMerge = pdmFiles.length
            previouslySyncedCountAtMerge = localSyncIndex.size
            serverFoldersErroredAtMerge = Boolean(serverFoldersResult.error)
            deletedFoldersAtMerge = (serverFoldersResult.deletedFolders ?? []).flatMap((f) =>
              f.deleted_at ? [{ folder_path: f.folder_path, deleted_at: f.deleted_at }] : [],
            )

            if (!silent) {
              setStatusMessage(`Merging ${pdmFiles.length} files...`)
            }

            // Create a map of pdm data by file path (case-insensitive for Windows compatibility)
            // Windows filesystems are case-insensitive, so we normalize to lowercase for matching
            // The fast RPC intentionally returns a lightweight row, while LocalFile.pdmData
            // remains the established full-domain shape. The existing consumers only read the
            // lightweight fields here; keep the boundary explicit instead of leaking `any`.
            const pdmMap = new Map<string, PDMFile>(
              pdmFiles.map((file) => [file.file_path.toLowerCase(), file as unknown as PDMFile]),
            )

            // Create a map of server folders by path (case-insensitive for Windows compatibility)
            // These are explicit folder records from the folders table (for empty folder sync)
            const serverFoldersMap = new Map(
              (serverFoldersResult.folders || []).map((f) => [f.folder_path.toLowerCase(), f]),
            )

            // Debug: verify pdmMap keys
            const pdmMapKeys = Array.from(pdmMap.keys()).slice(0, 3)
            window.electronAPI?.log(
              'info',
              '[LoadFiles] pdmMap sample keys (lowercase)',
              pdmMapKeys,
            )
            window.electronAPI?.log('info', '[LoadFiles] Server folders count', {
              count: serverFoldersMap.size,
            })

            // Store server files for tracking deletions
            const serverFilesList = pdmFiles.map((file) => ({
              id: file.id,
              file_path: file.file_path,
              name: file.file_name,
              extension: file.extension ?? '',
              content_hash: file.content_hash || '',
            }))
            commitsAfterMerge.push(() => setServerFiles(serverFilesList))

            // Clean up auto-download exclusions for files that no longer exist on the server
            if (currentVaultId) {
              const serverFilePaths = new Set(pdmFiles.map((file) => file.file_path))
              usePDMStore.getState().cleanupStaleExclusions(currentVaultId, serverFilePaths)
            }

            // Compute all folder paths that exist on the server (from file paths + explicit folder records)
            const serverFolderPathsSet = new Set<string>()
            // Add folders implied by file paths
            for (const file of pdmFiles) {
              const pathParts = file.file_path.split('/')
              let currentPath = ''
              for (let i = 0; i < pathParts.length - 1; i++) {
                currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i]
                serverFolderPathsSet.add(currentPath)
              }
            }
            // Add explicit folder records (for empty folders)
            for (const folder of serverFoldersResult.folders || []) {
              serverFolderPathsSet.add(folder.folder_path)
            }
            commitsAfterMerge.push(() => setServerFolderPaths(serverFolderPathsSet))

            // Create set of local file paths for deletion detection (case-insensitive)
            const localPathSet = new Set(localFiles.map((f) => f.relativePath.toLowerCase()))

            const currentFiles = usePDMStore.getState().files
            const { persistedPendingMetadata, isFileRecentlyModified } = usePDMStore.getState()
            const lookups = buildMergeLookups(currentFiles, savedVersionMap, isFileRecentlyModified)

            // Create a map of files checked out by me, keyed by content hash for move detection
            // This allows us to detect moved files (same content, different path) and preserve their pdmData
            // IMPORTANT: Only track checked-out-by-me files - if a file isn't checked out by me,
            // I couldn't have moved it, so matching hashes should be treated as new files, not moves.
            const checkedOutByMeByHash = new Map<string, PDMFile>()
            for (const pdmFile of pdmFiles) {
              if (pdmFile.content_hash && pdmFile.checked_out_by === user?.id) {
                checkedOutByMeByHash.set(pdmFile.content_hash, pdmFile as unknown as PDMFile)
              }
            }

            // A file renamed externally has no cached hash at its new path; hash the likely
            // candidates so the content-hash move detection in the merge can match them.
            if (checkedOutByMeByHash.size > 0 && window.electronAPI?.computeFileHashes) {
              localFiles = await hashRenameCandidates(
                localFiles,
                pdmMap,
                localPathSet,
                checkedOutByMeByHash,
                window.electronAPI.computeFileHashes,
              )
            }
            const { inodeRenameMap, inodeMatchedServerPaths, inodeMatchedServerPathToLocalPath } =
              detectInodeRenames(localFiles, pdmMap, localPathSet, savedInodeMap)
            inodeMatchedFileIds = new Set(
              Array.from(inodeRenameMap.values(), (serverFile) => serverFile.id),
            )
            if (inodeMatchedFileIds.size > 0) {
              settledBeforeLoad = rowsSettledAtServerPath(currentFiles)
            }

            // Merge PDM data into local files and compute diff status
            const stats = { matched: 0, unmatched: 0, unmatchedSamples: [] as string[] }
            const mergeContext = {
              lookups,
              pdmMap,
              serverFoldersMap,
              inodeRenameMap,
              checkedOutByMeByHash,
              localPathSet,
              localSyncIndex,
              isIgnoredPath,
              persistedPendingMetadata,
              userId: user?.id,
              vaultPath: loadingForVaultPath,
              rehashPaths,
              orphansEditedSinceServerRowLost,
              stats,
            }
            localFiles = await mapYielding(
              localFiles,
              (localFile) => mergeLocalFileWithServer(localFile, mergeContext),
              yieldIfSlow,
            )

            // Debug: Log match statistics
            window.electronAPI?.log('info', '[LoadFiles] MATCH STATS', {
              matched: stats.matched,
              unmatched: stats.unmatched,
              serverTotal: pdmFiles.length,
              unmatchedSamples: stats.unmatchedSamples,
            })


            // Add cloud-only files (exist on server but not locally) as "cloud" or "deleted"
            // entries, emit a 'moved_away' stub for an inode-matched rename (see
            // .cursor/plans/pending-move-visibility-agent1-report.md), and cross-reference
            // any remaining ghost/orphan pair the inode/hash passes missed.
            const { localFiles: reconciledLocalFiles, cloudFolders } = await reconcileCloudFiles({
              pdmFiles,
              localFiles,
              localPathSet,
              inodeMatchedServerPaths,
              inodeMatchedServerPathToLocalPath,
              existingCheckedOutUsers: lookups.checkedOutUsers,
              previousServerIdByLocalPath: serverIdsByLocalPath(currentFiles),
              userId: user?.id,
              vaultPath: loadingForVaultPath,
              yieldIfSlow,
              yieldCheckStride: YIELD_CHECK_STRIDE,
            })
            localFiles = reconciledLocalFiles

            // Auto-create server folders locally (folders that exist on server but not locally)
            // Since folders sync immediately, we should also auto-create them on the receiving end
            // This is instant (just mkdir operations) - no content to download
            const addedCloudFolderPaths = new Set<string>()
            const foldersToCreate: Array<{
              path: string
              fullPath: string
              folderPath: string
              serverFolder?: any
            }> = []

            // Collect implicit cloud folders (from file paths)
            for (const folderPath of cloudFolders) {
              const fullPath = buildFullPath(loadingForVaultPath, folderPath)
              const serverFolder = serverFoldersMap.get(folderPath.toLowerCase())
              addedCloudFolderPaths.add(folderPath.toLowerCase())
              foldersToCreate.push({ path: folderPath, fullPath, folderPath, serverFolder })
            }

            // Collect explicit server folders that aren't already added
            for (const serverFolder of serverFoldersResult.folders || []) {
              const folderPathLower = serverFolder.folder_path.toLowerCase()
              if (addedCloudFolderPaths.has(folderPathLower) || localPathSet.has(folderPathLower)) {
                continue
              }
              const fullPath = buildFullPath(loadingForVaultPath, serverFolder.folder_path)
              foldersToCreate.push({
                path: serverFolder.folder_path,
                fullPath,
                folderPath: serverFolder.folder_path,
                serverFolder,
              })
            }

            // Create all folders locally in parallel (fast - just mkdir operations)
            if (foldersToCreate.length > 0 && window.electronAPI) {
              window.electronAPI.log('info', '[LoadFiles] Auto-creating server folders locally', {
                count: foldersToCreate.length,
              })

              // Create folders in parallel - this is very fast (sub-ms per folder)
              await Promise.all(
                foldersToCreate.map(async ({ fullPath }) => {
                  try {
                    await window.electronAPI?.createFolder(fullPath)
                  } catch (error) {
                    // Folder might already exist or creation failed - that's okay
                    window.electronAPI?.log('debug', '[LoadFiles] Folder creation skipped/failed', {
                      fullPath,
                      error: error instanceof Error ? error.message : String(error),
                    })
                  }
                }),
              )
            }

            // Add all server folders to localFiles as synced (they now exist locally)
            for (const { path: folderPath, fullPath, serverFolder } of foldersToCreate) {
              const folderName = folderPath.split('/').pop() || folderPath
              localFiles.push({
                name: folderName,
                path: fullPath,
                relativePath: folderPath,
                isDirectory: true,
                extension: '',
                size: 0,
                modifiedTime: serverFolder?.created_at || '',
                diffStatus: undefined, // Not cloud anymore - they exist locally now
                isSynced: true,
                pdmData: serverFolder
                  ? ({ id: serverFolder.id, folder_path: serverFolder.folder_path } as any) // TODO: type this
                  : undefined,
              })
            }

            // Debug: Log merge summary
            const syncedCount = localFiles.filter((f) => !f.isDirectory && f.isSynced).length
            const addedCount = localFiles.filter(
              (f) => !f.isDirectory && f.diffStatus === 'added',
            ).length
            const cloudCount = localFiles.filter(
              (f) => !f.isDirectory && f.diffStatus === 'cloud',
            ).length
            const orphanedCount = localFiles.filter(
              (f) => !f.isDirectory && f.diffStatus === 'deleted_remote',
            ).length
            const deletedCount = localFiles.filter(
              (f) => !f.isDirectory && f.diffStatus === 'deleted',
            ).length
            const movedCount = localFiles.filter(
              (f) => !f.isDirectory && f.diffStatus === 'moved',
            ).length
            // The stub side of the same moves: never double-counted with movedCount,
            // since a file contributes exactly one of 'moved' (new location) or
            // 'moved_away' (old location's stub), never both.
            const movedAwayCount = localFiles.filter(
              (f) => !f.isDirectory && f.diffStatus === 'moved_away',
            ).length
            window.electronAPI?.log('info', '[LoadFiles] Merge summary', {
              serverFiles: pdmFiles.length,
              localFilesAfterMerge: localFiles.filter((f) => !f.isDirectory).length,
              synced: syncedCount,
              added: addedCount,
              cloudOnly: cloudCount,
              orphaned: orphanedCount,
              // Samples rather than the full list: orphans persist across loads now, so
              // a large batch would otherwise log every path on every load.
              orphanedSamples: localFiles
                .filter((f) => !f.isDirectory && f.diffStatus === 'deleted_remote')
                .slice(0, ORPHAN_LOG_SAMPLE_LIMIT)
                .map((f) => f.relativePath),
              orphansEditedSinceServerRowLost: orphansEditedSinceServerRowLost.size,
              ghostFiles: deletedCount,
              // A count that stays high across loads means moves are being re-detected
              // rather than reconciled, which is what made cold loads expensive.
              moved: movedCount,
              movedAway: movedAwayCount,
            })

            // Update the local sync index with all server file paths
            // This ensures we track which files have been synced for orphan detection
            // Not on the web: nothing is ever synced there, so there is nothing to track.
            if (currentVaultId && hasDesktop()) {
              const serverPaths = pdmFiles.map((file) => file.file_path)

              const inodeEntries = buildSyncIndexEntries(localFiles, rehashPaths)

              // Chain: reconcile against the server list first, THEN stamp inodes/versions.
              // The order does not stop updateInodes from recreating a path the first call
              // dropped - it upserts, so it did that on every load. The localOnly flags
              // above are what keeps the two from fighting over the moved-file paths.
              // localPathSet is what lets the first call tell a file that is still on disk
              // from one that is gone, which decides tombstone versus delete.
              commitsAfterMerge.push(() => {
                updateSyncIndexFromServer(currentVaultId, serverPaths, localPathSet)
                  .then((): Promise<void> | void => {
                    if (inodeEntries.length > 0) {
                      return updateInodes(currentVaultId, inodeEntries)
                    }
                  })
                  .catch((error) => {
                    window.electronAPI?.log(
                      'warn',
                      '[LoadFiles] Failed to update sync index or inodes',
                      { error: String(error) },
                    )
                  })
              })
            }
          }
        } else {
          // Offline mode or no org - local files are "added" unless ignored
          localFiles = localFiles.map((f) => ({
            ...f,
            diffStatus: f.isDirectory
              ? undefined
              : isIgnoredPath(f.relativePath)
                ? ('ignored' as const)
                : ('added' as const),
          }))
        }

        // Update folder diffStatus based on contents
        // A folder should be 'cloud' if all its contents are cloud-only AND it has some cloud content
        // Empty folders that exist locally should NOT be marked as cloud
        // Process folders bottom-up (deepest first) so parent folders see updated child statuses

        const postMergeFolderStart = performance.now()

        // OPTIMIZATION: Build parent->children index in O(n) instead of O(n²) filtering
        // This reduces 25,000 files × 2,500 folders = 62.5M ops down to ~27,500 ops
        const childrenByParent = new Map<string, typeof localFiles>()
        for (const file of localFiles) {
          const normalizedPath = file.relativePath.replace(/\\/g, '/')
          const lastSlash = normalizedPath.lastIndexOf('/')
          const parentPath = lastSlash > 0 ? normalizedPath.substring(0, lastSlash) : ''

          const existing = childrenByParent.get(parentPath)
          if (existing) {
            existing.push(file)
          } else {
            childrenByParent.set(parentPath, [file])
          }
        }

        const folders = localFiles.filter((f) => f.isDirectory)

        // Sort folders by depth (deepest first)
        folders.sort((a, b) => {
          const depthA = a.relativePath.split(/[/\\]/).length
          const depthB = b.relativePath.split(/[/\\]/).length
          return depthB - depthA
        })

        // Check each folder from deepest to shallowest - now O(1) lookup per folder
        for (const folder of folders) {
          const normalizedFolder = folder.relativePath.replace(/\\/g, '/')

          // O(1) lookup instead of O(n) filter
          const directChildren = childrenByParent.get(normalizedFolder) || []

          const hasLocalContent = directChildren.some((f) => f.diffStatus !== 'cloud')
          const hasCloudContent = directChildren.some((f) => f.diffStatus === 'cloud')

          // Only mark as cloud if folder has cloud content AND no local content
          // Empty local folders should stay as normal folders
          if (!hasLocalContent && hasCloudContent) {
            folder.diffStatus = 'cloud'
          }
        }

        const postMergeFolderMs = Math.round(performance.now() - postMergeFolderStart)
        window.electronAPI?.log('info', '[LoadFiles] Post-merge folder status', {
          durationMs: postMergeFolderMs,
          folderCount: folders.length,
          childrenByParentSize: childrenByParent.size,
        })

        // Record merge timing
        const mergeDuration = performance.now() - mergeStart
        recordMetric('VaultLoad', 'Merge complete', { durationMs: Math.round(mergeDuration) })

        // Check if vault changed during async operations - if so, skip setting files
        // This prevents race conditions when auto-connect switches vaults during initial load
        if (isVaultStale()) {
          window.electronAPI?.log(
            'info',
            '[LoadFiles] Skipping setFiles - vault changed during load',
            {
              loadedFor: loadingForVaultId,
              currentVault: usePDMStore.getState().activeVaultId,
            },
          )
          return
        }

        // Record total vault load time
        const vaultLoadDuration = performance.now() - vaultLoadStart
        recordMetric('VaultLoad', 'Total vault load complete', {
          durationMs: Math.round(vaultLoadDuration),
          fileCount: localFiles.filter((f: { isDirectory: boolean }) => !f.isDirectory).length,
          folderCount: localFiles.filter((f: { isDirectory: boolean }) => f.isDirectory).length,
        })

        // Detect externally deleted synced files and add auto-download exclusions
        // This prevents auto-download from re-downloading files the user deleted via Windows Explorer
        // Detection: files that had local copies but now show as cloud-only
        const postMergeExclusionStart = performance.now()
        if (currentVaultId) {
          const previousFiles = usePDMStore.getState().files

          // Only run detection if we have previous state (skip on first load)
          if (previousFiles.length > 0) {
            // Build set of paths that previously had local copies (synced files with local presence)
            const previousLocalSyncedPaths = new Set(
              previousFiles
                .filter((f) => !f.isDirectory && f.pdmData?.id && f.diffStatus !== 'cloud')
                .map((f) => f.relativePath),
            )

            // Build set of folder paths that previously had local presence
            const previousLocalFolderPaths = new Set(
              previousFiles
                .filter((f) => f.isDirectory && f.diffStatus !== 'cloud')
                .map((f) => f.relativePath.toLowerCase()),
            )

            // Find files that transitioned from local to cloud-only (externally deleted)
            const externallyDeletedFiles = localFiles.filter(
              (f) =>
                !f.isDirectory &&
                f.diffStatus === 'cloud' &&
                f.pdmData?.id &&
                previousLocalSyncedPaths.has(f.relativePath),
            )

            // Find folders that transitioned from local to cloud-only (externally deleted)
            const externallyDeletedFolders = localFiles.filter(
              (f) =>
                f.isDirectory &&
                f.diffStatus === 'cloud' &&
                previousLocalFolderPaths.has(f.relativePath.toLowerCase()),
            )

            // Collect all files to exclude (directly deleted + files in deleted folders)
            const filesToExclude = new Set<string>()

            // Add directly deleted files
            for (const file of externallyDeletedFiles) {
              filesToExclude.add(file.relativePath)
            }

            // Add files within deleted folders
            for (const folder of externallyDeletedFolders) {
              const folderPrefix = folder.relativePath.toLowerCase() + '/'
              for (const file of localFiles) {
                if (
                  !file.isDirectory &&
                  file.diffStatus === 'cloud' &&
                  file.relativePath.toLowerCase().startsWith(folderPrefix)
                ) {
                  filesToExclude.add(file.relativePath)
                }
              }
            }

            // Add exclusions for all externally deleted files
            if (filesToExclude.size > 0) {
              // One store update for the whole batch (see addAutoDownloadExclusions).
              usePDMStore
                .getState()
                .addAutoDownloadExclusions(currentVaultId, Array.from(filesToExclude))

              window.electronAPI?.log(
                'info',
                '[LoadFiles] Added auto-download exclusions for externally deleted files',
                {
                  fileCount: externallyDeletedFiles.length,
                  folderCount: externallyDeletedFolders.length,
                  totalExcluded: filesToExclude.size,
                  paths: Array.from(filesToExclude).slice(0, 10), // Log first 10 paths
                  truncated: filesToExclude.size > 10,
                },
              )
            }
          }

          // Drop exclusions for files that are on disk again. Runs after the additions above,
          // whose files are cloud-only in `localFiles` and so are never dropped here.
          const currentExclusions =
            usePDMStore.getState().autoDownloadExcludedFiles[currentVaultId] ?? []
          const staleExclusions = findExclusionsForFilesPresentLocally(
            currentExclusions,
            localFiles,
          )
          if (staleExclusions.size > 0) {
            usePDMStore.getState().removeAutoDownloadExclusions(currentVaultId, staleExclusions)
            window.electronAPI?.log('info', '[LoadFiles] Pruned auto-download exclusions', {
              pruned: staleExclusions.size,
              remaining: currentExclusions.length - staleExclusions.size,
            })
          }
        }
        const postMergeExclusionMs = Math.round(performance.now() - postMergeExclusionStart)
        window.electronAPI?.log('info', '[LoadFiles] Post-merge exclusion pass', {
          durationMs: postMergeExclusionMs,
          previousFileCount: usePDMStore.getState().files.length,
          incomingCount: localFiles.length,
        })

        // A file operation landed after the scan read the disk, so the local half of
        // this merge describes the vault before the operation while the server half
        // describes it after. Committing would revert the operation in the UI and
        // strand its files, so drop the merge and rerun over a fresh full scan.
        if (getFileMutationEpoch() !== epochAtScanStart) {
          window.electronAPI?.log(
            'info',
            '[LoadFiles] Discarding merge - file ops landed mid-scan',
            {
              epochAtScanStart,
              epochNow: getFileMutationEpoch(),
              silent,
            },
          )
          recordMetric('VaultLoad', 'Discarded merge superseded by file ops', { silent })
          markLoadSuperseded(loadingForVaultId)
          return
        }

        for (const commit of commitsAfterMerge) commit()

        const setFilesStart = performance.now()
        const previousStoreCount = usePDMStore.getState().files.length
        window.electronAPI?.log('info', '[LoadFiles] Calling setFiles', {
          incomingCount: localFiles.length,
          previousStoreCount,
        })
        setFiles(localFiles)
        window.electronAPI?.log('info', '[LoadFiles] setFiles returned', {
          durationMs: Math.round(performance.now() - setFilesStart),
          incomingCount: localFiles.length,
          previousStoreCount,
          storeCount: usePDMStore.getState().files.length,
        })
        // One line per load that adds up where the time went, so a stalled session can be
        // read without reassembling a dozen separate lines.
        window.electronAPI?.log('info', '[LoadFiles] Load stage timings', {
          requestId: loadContext.requestId,
          silent,
          cacheHit: serverResultWithCache.cacheHit,
          deltaCount: serverResultWithCache.deltaCount,
          serverRows: serverResult.files?.length ?? 0,
          localRows: localResult.files.length,
          mergedRows: localFiles.length,
          localScanMs: Math.round(localScanDuration),
          cacheReadMs: serverResultWithCache.timing.cacheReadMs,
          serverFetchMs: serverResultWithCache.timing.fetchMs,
          deltaMergeMs: serverResultWithCache.timing.mergeMs,
          mergeMs: Math.round(mergeDuration),
          postMergeFolderMs,
          postMergeExclusionMs,
          setFilesMs: Math.round(performance.now() - setFilesStart),
          totalMs: Math.round(performance.now() - vaultLoadStart),
        })
        setFilesLoaded(true) // Mark that initial load is complete
        committedMerge = true

        // Only recorded once the merge actually committed, so a failed or aborted
        // pass can never make the next one skip.
        setLastMergedState(loadingForVaultId, {
          scanFingerprint: localScanFingerprint,
          storeFileCount: localFiles.length,
          folderFingerprint: serverFolderFingerprint,
        })
        const totalFiles = localFiles.filter((f) => !f.isDirectory).length
        const syncedCount = localFiles.filter((f) => !f.isDirectory && f.pdmData).length
        const folderCount = localFiles.filter((f) => f.isDirectory).length
        setStatusMessage(
          `Loaded ${totalFiles} files, ${folderCount} folders${syncedCount > 0 ? ` (${syncedCount} synced)` : ''}`,
        )

        // Background tasks (non-blocking) - run after UI renders. They run on the web too, for
        // checkout profile hydration; their hash pass and auto-download need the desktop.
        if (user) {
          const backgroundFiles = localFiles
          setTimeout(() => {
            void runPostLoadBackgroundTasks({
              localFiles: backgroundFiles,
              rehashPaths,
              silent,
              forceHashComputation,
              isOfflineMode,
              organization,
              userId: user.id,
              loadingForVaultId,
              loadContext,
              cacheContext,
              isLoadContextCurrent,
              isVaultStale,
              setFiles,
              setStatusMessage,
            })
          }, 50) // Small delay to let React render first
        }

      } catch (error) {
        if (!silent) {
          setStatusMessage('Error loading files')
        }
        window.electronAPI?.log?.('error', '[LoadFiles] Error loading files', {
          error: String(error),
        })
      } finally {
        if (!silent) {
          setIsLoading(false)
          setTimeout(() => setStatusMessage(''), 3000)
        }
      }

      // A move this user made of files they hold checked out goes to the server now rather than
      // waiting as a pending move (autoReconcileOwnMoves.ts says why that is safe). Inside the
      // load lock for the same reason as the auto-discard below; the command's refresh queues
      // behind this pass.
      if (committedMerge && user && !isOfflineMode && !isVaultStale()) {
        const ownMoveIds = takeOwnInodeMoves(
          usePDMStore.getState().files,
          inodeMatchedFileIds,
          settledBeforeLoad,
          user.id,
        )
        if (ownMoveIds.length > 0) {
          window.electronAPI?.log('info', '[LoadFiles] Writing own checked-out moves to the server', {
            count: ownMoveIds.length,
          })
          try {
            await executeCommand(
              'reconcile-moved-paths',
              { apply: true, automatic: true, fileIds: ownMoveIds },
              { onRefresh: () => usePDMStore.getState().requestFilesReload() },
            )
          } catch (error) {
            window.electronAPI?.log('error', '[LoadFiles] Writing own moves failed', {
              error: String(error),
            })
          }
        }
      }

      // Auto-discard orphaned files: local files that were previously synced but
      // are no longer on the server, because another user deleted them. They carry
      // diffStatus 'deleted_remote'.
      //
      // Awaited here rather than in the fire-and-forget block above so that it runs
      // inside runExclusiveLoad. Discarding deletes from disk and bumps the file
      // mutation epoch; run without the lock held it landed mid-scan of whichever
      // pass started next, and that pass then correctly refused to commit its merge
      // and reran a full scan. Holding the lock means a queued pass does not begin
      // scanning until the deletion is done.
      //
      // Every abort path above returns out of the try, so only a committed merge
      // reaches this. Unlike the rest of this pass, this step also runs on silent,
      // watcher-driven refreshes: propagating a deletion the moment it is knowable -
      // not only on the next loud load - is the whole point of this release. What
      // used to stop a silent refresh from discarding at all (and so from chaining
      // into another one) was a blanket `!silent` check; that is now
      // `runAutoDiscardForOrphans`'s re-entrancy guard, which blocks only a second
      // concurrent discard for this vault rather than every silent pass. See its doc
      // comment for why a debounce was not used instead.
      //
      // There is no confirmation and no batch-size threshold: the app never asks, per
      // the 4.3.1 decision that a dialog contradicts a setting named "automatically
      // discard orphaned files" when the outcome already goes to the Recycle Bin.
      if (committedMerge && user && window.electronAPI && !isVaultStale()) {
        // Empty directories left behind by a folder deleted on the server. The file
        // discard below only recycles directories it emptied itself, so a folder that
        // never held a file was never removed. Needs a complete server view: a failed
        // folders fetch would make every live empty folder look unasserted.
        if (
          usePDMStore.getState().autoDiscardOrphanedFiles &&
          currentVaultId &&
          serverRowCountAtMerge !== undefined &&
          !serverFoldersErroredAtMerge
        ) {
          await runGhostDirectoryCleanup(currentVaultId, loadingForVaultPath, deletedFoldersAtMerge)
        }

        const { autoDiscardOrphanedFiles, addToast, files: latestFiles } = usePDMStore.getState()

        const orphanedFiles = autoDiscardOrphanedFiles
          ? latestFiles.filter((f) => !f.isDirectory && f.diffStatus === 'deleted_remote')
          : []

        // A silent refresh must not act on a server response that only looks like a
        // mass deletion. See AUTO_DISCARD_MAX_ORPHAN_FRACTION for the reasoning; the
        // files stay on disk with diffStatus 'deleted_remote' either way, so the file
        // browser still shows them and manual discard still works.
        if (
          shouldSkipAutoDiscardForOrphans({
            serverRowCount: serverRowCountAtMerge,
            previouslySyncedCount: previouslySyncedCountAtMerge,
            orphanCount: orphanedFiles.length,
          })
        ) {
          window.electronAPI.log(
            'warn',
            '[AutoDiscard] Skipped - server view looks lost rather than the vault having emptied',
            {
              orphanCount: orphanedFiles.length,
              serverRowCount: serverRowCountAtMerge,
              previouslySyncedCount: previouslySyncedCountAtMerge,
            },
          )
          return
        }

        // An orphan that holds work of the user's own is never discarded automatically.
        // Keeping it costs them a stray row in the browser and the manual discard is
        // still there; discarding it costs them the work.
        const discardableOrphans = selectDiscardableOrphans(
          orphanedFiles,
          orphansEditedSinceServerRowLost,
        )

        if (orphanedFiles.length > discardableOrphans.length) {
          window.electronAPI.log('info', '[AutoDiscard] Keeping orphans that hold local work', {
            count: orphanedFiles.length - discardableOrphans.length,
          })
        }

        if (discardableOrphans.length > 0 && currentVaultId) {
          if (isAutomaticDiscardCoolingDown(currentVaultId)) {
            window.electronAPI.log(
              'info',
              '[AutoDiscard] Skipped - cooling down after an all-skipped batch for this vault',
              { count: discardableOrphans.length },
            )
            return
          }

          window.electronAPI.log('info', '[AutoDiscard] Discarding orphaned files', {
            count: discardableOrphans.length,
            files: discardableOrphans
              .slice(0, ORPHAN_LOG_SAMPLE_LIMIT)
              .map((f) => ({ name: f.name, relativePath: f.relativePath })),
          })

          try {
            const runResult = await runAutoDiscardForOrphans(
              currentVaultId,
              discardableOrphans,
              async (files) => {
                const result = await executeCommand('discard-orphaned', {
                  files,
                  isAutomatic: true,
                })
                if (result.succeeded > 0) {
                  // Directories emptied by this same batch are recycled inside
                  // discard-orphaned itself (see src/lib/orphanedDirectories.ts), so
                  // folding their count into this one toast rather than raising a
                  // second is a display choice, not a second discovery.
                  let message = buildAutoDiscardToastMessage(
                    result.succeeded,
                    commonOrphanFolderName(files),
                  )
                  if (result.directoriesRemoved) {
                    const suffix = result.directoriesRemoved === 1 ? '_one' : '_other'
                    message += ` ${t(`autoDiscard.directoriesRemoved.generic${suffix}`, {
                      count: result.directoriesRemoved,
                    })}`
                  }
                  addToast('info', message)
                }
                if (
                  result.directoriesRemoved ||
                  result.directoriesKept ||
                  result.directoriesTrackedByServer
                ) {
                  window.electronAPI?.log('info', '[AutoDiscard] Orphaned directory cleanup', {
                    directoriesRemoved: result.directoriesRemoved,
                    directoriesKept: result.directoriesKept,
                    directoriesTrackedByServer: result.directoriesTrackedByServer,
                  })
                }
                if (result.skipped) {
                  window.electronAPI?.log(
                    'warn',
                    '[AutoDiscard] Kept files that could not recycle',
                    {
                      skipped: result.skipped,
                      paths: result.skippedPaths?.slice(0, ORPHAN_LOG_SAMPLE_LIMIT),
                    },
                  )
                }
                if (result.failed > 0) {
                  window.electronAPI?.log('warn', '[AutoDiscard] Some files failed to discard', {
                    failed: result.failed,
                    errors: result.errors,
                  })
                }
              },
            )

            if (runResult === 'skipped-in-flight') {
              window.electronAPI.log(
                'info',
                '[AutoDiscard] Skipped - a discard for this vault is already running',
                { count: discardableOrphans.length },
              )
            }
          } catch (error) {
            // Swallowed: a failed discard must not reject the load promise, which
            // would surface as a failed refresh to every caller.
            window.electronAPI?.log('error', '[AutoDiscard] Failed to discard orphaned files', {
              error: String(error),
            })
          }
        }
      }
    },
    [
      vaultPath,
      organization,
      isOfflineMode,
      currentVaultId,
      user,
      authenticatedUserId,
      sessionGeneration,
      setFiles,
      setServerFiles,
      setServerFolderPaths,
      setIsLoading,
      setStatusMessage,
      setFilesLoaded,
    ],
  )

  /** Serialized entry point for loadFiles. See runExclusiveLoad for the rationale. */
  const loadFiles = useCallback(
    async (
      silent: boolean = false,
      forceHashComputation: boolean = false,
      changedRelativePaths?: string[],
    ) => {
      await runExclusiveLoad(
        currentVaultId,
        {
          silent,
          forceHashComputation,
          hasChangedPaths: (changedRelativePaths?.length ?? 0) > 0,
        },
        () => runLoadFiles(silent, forceHashComputation, changedRelativePaths),
      )

      // The pass refused to commit because a file operation raced it. Rerun now that
      // the operation has landed, over a full scan: the delta scan's cached entries
      // still hold the pre-operation paths. Only one retry, so a burst of operations
      // cannot spin here.
      if (!consumeSupersededLoad(currentVaultId)) return

      await runExclusiveLoad(
        currentVaultId,
        { silent, forceHashComputation, hasChangedPaths: false },
        () => runLoadFiles(silent, forceHashComputation),
      )
      consumeSupersededLoad(currentVaultId)
    },
    [runLoadFiles, currentVaultId],
  )

  const refreshCurrentFolder = useRefreshCurrentFolder(currentVaultId)


  return { loadFiles, refreshCurrentFolder }
}
