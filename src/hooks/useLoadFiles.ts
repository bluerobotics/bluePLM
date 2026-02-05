import { useCallback, startTransition } from 'react'
import { flushSync } from 'react-dom'
import { usePDMStore } from '@/stores/pdmStore'
import { getFilesLightweight, getCheckedOutUsers, getVaultFolders } from '@/lib/supabase'
import { executeCommand } from '@/lib/commands'
import { buildFullPath } from '@/lib/commands/types'
import { recordMetric } from '@/lib/performanceMetrics'
import { getFilesWithCache, updateCachedUserInfo } from '@/lib/cache/vaultFileCache'
import { getSyncIndex, updateSyncIndexFromServer } from '@/lib/cache/localSyncIndex'
import { logExplorer } from '@/lib/userActionLogger'
import type { LightweightFile } from '@/lib/supabase/files/queries'

/**
 * Hook to load files from working directory and merge with PDM data
 * Handles:
 * - Local file scanning
 * - Server file fetching and merging
 * - Diff status computation (added, modified, outdated, moved, cloud, deleted)
 * - Background hash computation
 * - Auto-download of cloud files and updates
 */
export function useLoadFiles() {
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
  } = usePDMStore()

  // Get current vault ID (from activeVaultId or first connected vault)
  const currentVaultId = activeVaultId || connectedVaults[0]?.id

  // Load files from working directory and merge with PDM data
  // silent = true means no loading spinner (for background refreshes after downloads/uploads)
  // forceHashComputation = true forces full hash computation on ALL synced files (for Full Refresh)
  const loadFiles = useCallback(async (silent: boolean = false, forceHashComputation: boolean = false) => {
    // Capture vault context at start - used to detect if vault changed during async operations
    const loadingForVaultId = currentVaultId
    const loadingForVaultPath = vaultPath
    
    window.electronAPI?.log('info', '[LoadFiles] Called with', { vaultPath: loadingForVaultPath, currentVaultId: loadingForVaultId, silent, forceHashComputation })
    if (!window.electronAPI || !loadingForVaultPath) return
    
    // Clear configuration caches on refresh to ensure fresh data from SolidWorks
    usePDMStore.getState().clearAllConfigCaches()
    
    if (!silent) {
      setIsLoading(true)
      setStatusMessage(forceHashComputation ? 'Full refresh: Loading files...' : 'Loading files...')
      // Yield to UI thread so loading state renders before heavy work
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    
    // Helper to check if vault changed during async operation
    const isVaultStale = () => {
      const currentState = usePDMStore.getState()
      const currentActive = currentState.activeVaultId || currentState.connectedVaults[0]?.id
      return currentActive !== loadingForVaultId
    }
    
    try {
      // Run local file scan and server fetch in PARALLEL for faster boot
      // Note: listWorkingFiles now returns FAST (no blocking hash computation)
      // Hashes are computed in background after initial display
      const shouldFetchServer = organization && !isOfflineMode && currentVaultId
      
      if (!silent) {
        setStatusMessage(shouldFetchServer ? 'Loading local & cloud files...' : 'Scanning local files...')
      }
      
      // Start timing for vault load operations
      const vaultLoadStart = performance.now()
      recordMetric('VaultLoad', 'Starting vault load', { silent })
      
      // Start both operations at once, tracking each separately
      const localScanStart = performance.now()
      let localScanEnd = 0
      
      const localPromise = window.electronAPI.listWorkingFiles().then(result => {
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
            () => getFilesLightweight(organization.id, currentVaultId)
          )
        : Promise.resolve({ files: null, error: null, cacheHit: false, deltaCount: 0, timing: { cacheReadMs: 0, fetchMs: 0, mergeMs: 0 } })
      
      // Also load the local sync index for detecting orphaned files
      // The sync index tracks files that were previously synced - if they're not on server anymore,
      // they were deleted by another user (orphaned)
      const syncIndexPromise = currentVaultId 
        ? getSyncIndex(currentVaultId)
        : Promise.resolve(new Set<string>())
      
      // Fetch server folders (for empty folder sync feature)
      // These are explicit folder records, separate from implicit folders derived from file paths
      const serverFoldersPromise = shouldFetchServer && currentVaultId
        ? getVaultFolders(currentVaultId)
        : Promise.resolve({ folders: [], error: undefined })
      
      // Wait for all to complete
      const [localResult, serverResultWithCache, localSyncIndex, serverFoldersResult] = await Promise.all([localPromise, serverPromise, syncIndexPromise, serverFoldersPromise])
      
      // Extract files from cache result
      const serverResult = {
        files: serverResultWithCache.files as LightweightFile[] | null,
        error: serverResultWithCache.error
      }
      
      // Record timing for local scan
      const localScanDuration = localScanEnd - localScanStart
      recordMetric('VaultLoad', 'Local scan complete', { 
        durationMs: Math.round(localScanDuration),
        fileCount: localResult.files?.length || 0
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
          deltaMergeMs: serverResultWithCache.timing.mergeMs
        })
      }
      
      // Process local files
      if (!localResult.success || !localResult.files) {
        const errorMsg = localResult.error || 'Failed to load files'
        window.electronAPI?.log('error', '[LoadFiles] Local file scan failed', { errorMsg, vaultPath, hasWorkingDir: !!localResult })
        setStatusMessage(errorMsg)
        return
      }
      
      window.electronAPI?.log('info', '[LoadFiles] Scanned local items', { count: localResult.files.length })
      window.electronAPI?.log('info', '[LoadFiles] Server query params', { 
        orgId: organization?.id, 
        vaultId: currentVaultId,
        shouldFetchServer,
        serverFileCount: serverResult.files?.length || 0,
        serverError: serverResult.error?.message 
      })
      
      // Debug: Log first few paths for comparison (helps debug path matching issues)
      if (serverResult.files && serverResult.files.length > 0) {
        const sampleServer = serverResult.files.slice(0, 5).map((f: any) => f.file_path)
        const sampleLocal = localResult.files.filter((f: any) => !f.isDirectory).slice(0, 5).map((f: any) => f.relativePath)
        window.electronAPI?.log('info', '[LoadFiles] Sample SERVER paths', sampleServer)
        window.electronAPI?.log('info', '[LoadFiles] Sample LOCAL paths', sampleLocal)
        
        // Try to find a matching file by name and compare full paths
        const firstServerFile = serverResult.files[0] as any
        if (firstServerFile) {
          const serverFileName = firstServerFile.file_name || firstServerFile.file_path.split('/').pop()
          const matchingLocal = localResult.files.find((f: any) => f.name === serverFileName)
          if (matchingLocal) {
            window.electronAPI?.log('info', '[LoadFiles] PATH COMPARISON', {
              fileName: serverFileName,
              serverPath: firstServerFile.file_path,
              localPath: matchingLocal.relativePath,
              serverLower: firstServerFile.file_path.toLowerCase(),
              localLower: matchingLocal.relativePath.toLowerCase(),
              pathsEqual: firstServerFile.file_path.toLowerCase() === matchingLocal.relativePath.toLowerCase()
            })
          } else {
            window.electronAPI?.log('warn', '[LoadFiles] Could not find local file with name', { serverFileName })
          }
        }
      }
      
      // Map hash to localHash for comparison
      let localFiles = localResult.files.map((f: any) => ({
        ...f,
        localHash: f.hash
      }))
      
      // Get ignored paths checker for later use (don't filter, just mark as ignored)
      const isIgnoredPath = currentVaultId 
        ? (path: string) => usePDMStore.getState().isPathIgnored(currentVaultId, path)
        : () => false
      
      // 2. If connected to Supabase, merge PDM data
      const mergeStart = performance.now()
      if (shouldFetchServer) {
        const pdmFiles = serverResult.files
        const pdmError = serverResult.error
        
        if (pdmError) {
          window.electronAPI?.log('warn', '[LoadFiles] Failed to fetch PDM data', { error: pdmError })
        } else if (pdmFiles && Array.isArray(pdmFiles)) {
          if (!silent) {
            setStatusMessage(`Merging ${pdmFiles.length} files...`)
          }
          
          // Create a map of pdm data by file path (case-insensitive for Windows compatibility)
          // Windows filesystems are case-insensitive, so we normalize to lowercase for matching
          const pdmMap = new Map(pdmFiles.map((f: any) => [f.file_path.toLowerCase(), f]))
          
          // Create a map of server folders by path (case-insensitive for Windows compatibility)
          // These are explicit folder records from the folders table (for empty folder sync)
          const serverFoldersMap = new Map(
            (serverFoldersResult.folders || []).map(f => [f.folder_path.toLowerCase(), f])
          )
          
          // Debug: verify pdmMap keys
          const pdmMapKeys = Array.from(pdmMap.keys()).slice(0, 3)
          window.electronAPI?.log('info', '[LoadFiles] pdmMap sample keys (lowercase)', pdmMapKeys)
          window.electronAPI?.log('info', '[LoadFiles] Server folders count', { count: serverFoldersMap.size })
          
          // Store server files for tracking deletions
          const serverFilesList = pdmFiles.map((f: any) => ({
            id: f.id,
            file_path: f.file_path,
            name: f.name,
            extension: f.extension,
            content_hash: f.content_hash || ''
          }))
          setServerFiles(serverFilesList)
          
          // Clean up auto-download exclusions for files that no longer exist on the server
          if (currentVaultId) {
            const serverFilePaths = new Set(pdmFiles.map((f: any) => f.file_path))
            usePDMStore.getState().cleanupStaleExclusions(currentVaultId, serverFilePaths)
          }
          
          // Compute all folder paths that exist on the server (from file paths + explicit folder records)
          const serverFolderPathsSet = new Set<string>()
          // Add folders implied by file paths
          for (const file of pdmFiles as any[]) {
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
          setServerFolderPaths(serverFolderPathsSet)
          
          // Create set of local file paths for deletion detection (case-insensitive)
          const localPathSet = new Set(localFiles.map(f => f.relativePath.toLowerCase()))
          
          // Create a map of existing files' localActiveVersion to preserve rollback state
          // Use getState() to get current files at execution time (not stale closure value)
          // Key by BOTH absolute path and relative path for robust lookup during refresh
          const currentFiles = usePDMStore.getState().files
          const existingLocalActiveVersions = new Map<string, number>()
          for (const f of currentFiles) {
            if (f.localActiveVersion !== undefined) {
              existingLocalActiveVersions.set(f.path, f.localActiveVersion)
              existingLocalActiveVersions.set(f.relativePath, f.localActiveVersion)
            }
          }
          
          // Create a map of existing files' localVersion to preserve tracked version numbers
          // localVersion tracks which version's content is actually on disk (set during download/checkin)
          const existingLocalVersions = new Map<string, number>()
          for (const f of currentFiles) {
            if (f.localVersion !== undefined) {
              existingLocalVersions.set(f.path, f.localVersion)
              existingLocalVersions.set(f.relativePath, f.localVersion)
            }
          }
          
          // Create a map of existing files' localHash to preserve computed hashes
          // This prevents re-computing hashes or falling back to timestamp-based diff detection
          // when the file watcher triggers a refresh after operations like checkin
          const existingLocalHashes = new Map<string, string>()
          for (const f of currentFiles) {
            if (f.localHash) {
              existingLocalHashes.set(f.path, f.localHash)
            }
          }
          
          // Create a map of existing files' pendingMetadata to preserve unsaved changes
          // This prevents losing user's edits (like generated part numbers) when FileWatcher triggers refresh
          const existingPendingMetadata = new Map<string, typeof currentFiles[0]['pendingMetadata']>()
          for (const f of currentFiles) {
            if (f.pendingMetadata && Object.keys(f.pendingMetadata).length > 0) {
              existingPendingMetadata.set(f.path, f.pendingMetadata)
            }
          }
          
          // Create a map of existing checked_out_user info to preserve avatar data
          // This prevents avatars from showing "SO" (Someone) during file refreshes
          // The user info is fetched in a background task and should not be lost
          type CheckedOutUserInfo = { email: string; full_name: string | null; avatar_url?: string }
          const existingCheckedOutUsers = new Map<string, CheckedOutUserInfo>()
          for (const f of currentFiles) {
            if (f.pdmData?.id && (f.pdmData as any).checked_out_user) {
              existingCheckedOutUsers.set(f.pdmData.id, (f.pdmData as any).checked_out_user)
            }
          }
          
          // Also get persistedPendingMetadata for app restart survival
          const { persistedPendingMetadata, isFileRecentlyModified } = usePDMStore.getState()
          
          // Create a map of existing files' pdmData for recently modified files
          // This prevents server data from overwriting local changes that were just saved
          // (e.g., when FileWatcher triggers LoadFiles right after Save to File before DB update propagates)
          const recentlyModifiedPdmData = new Map<string, typeof currentFiles[0]['pdmData']>()
          for (const f of currentFiles) {
            if (f.pdmData?.id && isFileRecentlyModified(f.pdmData.id)) {
              recentlyModifiedPdmData.set(f.path, f.pdmData)
              window.electronAPI?.log('debug', '[LoadFiles] Preserving pdmData for recently modified file', {
                path: f.path,
                fileId: f.pdmData.id,
                partNumber: f.pdmData.part_number
              })
            }
          }
          
          // Create a map of files checked out by me, keyed by content hash for move detection
          // This allows us to detect moved files (same content, different path) and preserve their pdmData
          // IMPORTANT: Only track checked-out-by-me files - if a file isn't checked out by me,
          // I couldn't have moved it, so matching hashes should be treated as new files, not moves.
          const checkedOutByMeByHash = new Map<string, any>()
          for (const pdmFile of pdmFiles as any[]) {
            if (pdmFile.content_hash && pdmFile.checked_out_by === user?.id) {
              checkedOutByMeByHash.set(pdmFile.content_hash, pdmFile)
            }
          }
          
          // Merge PDM data into local files and compute diff status
          let matchedCount = 0
          let unmatchedCount = 0
          const unmatchedSamples: string[] = []
          
          localFiles = localFiles.map(localFile => {
            if (localFile.isDirectory) {
              // Check if this folder exists on server (from explicit folder records)
              const folderKey = localFile.relativePath.toLowerCase()
              const serverFolder = serverFoldersMap.get(folderKey)
              if (serverFolder) {
                // Attach folder pdmData for synced folders
                return {
                  ...localFile,
                  isSynced: true,
                  pdmData: { id: serverFolder.id, folder_path: serverFolder.folder_path } as any
                }
              }
              return localFile
            }
            
            // Use lowercase for case-insensitive matching (Windows compatibility)
            const lookupKey = localFile.relativePath.toLowerCase()
            let pdmData = pdmMap.get(lookupKey)
            let isMovedFile = false
            
            // Debug: track match/unmatch counts
            if (pdmData) {
              matchedCount++
            } else {
              unmatchedCount++
              if (unmatchedSamples.length < 5) {
                unmatchedSamples.push(lookupKey)
              }
            }
            
            // Preserve localActiveVersion from existing file (for rollback state)
            // Try both absolute path and relative path for robust lookup
            const existingLocalActiveVersion = existingLocalActiveVersions.get(localFile.path) 
              || existingLocalActiveVersions.get(localFile.relativePath)
            
            // Preserve localVersion from existing file (tracks actual version on disk)
            const existingLocalVersion = existingLocalVersions.get(localFile.path) 
              || existingLocalVersions.get(localFile.relativePath)
            
            // Debug: log when localActiveVersion is being preserved (helps diagnose rollback issues)
            if (existingLocalActiveVersion !== undefined) {
              window.electronAPI?.log('debug', '[LoadFiles] Preserving localActiveVersion', {
                path: localFile.relativePath,
                version: existingLocalActiveVersion
              })
            }
            
            // Preserve localHash from existing file if not computed fresh
            // This prevents falling back to timestamp-based diff detection after file watcher refreshes
            const existingLocalHash = existingLocalHashes.get(localFile.path)
            const effectiveLocalHash = localFile.localHash || existingLocalHash
            
            // If no path match but file has same hash as a file CHECKED OUT BY ME,
            // this MIGHT be a moved file - but only if the original path no longer exists locally.
            // If the original path still has a file, then this is a COPY, not a move.
            // IMPORTANT: Only detect moves for files checked out by me - otherwise a new file
            // with the same content as some random server file would be incorrectly detected as moved.
            if (!pdmData && effectiveLocalHash) {
              const movedFromFile = checkedOutByMeByHash.get(effectiveLocalHash)
              if (movedFromFile) {
                // Check if the original file path still exists locally (case-insensitive)
                // If it does, this is a copy/duplicate, not a move
                const originalPathStillExists = localPathSet.has(movedFromFile.file_path.toLowerCase())
                
                if (!originalPathStillExists) {
                  // Original location is empty - this IS a move
                  pdmData = movedFromFile
                  isMovedFile = true
                }
                // If originalPathStillExists, leave pdmData as undefined - this is a new file (copy)
              }
            }
            
            // Determine diff status
            let diffStatus: 'added' | 'modified' | 'outdated' | 'moved' | 'ignored' | 'deleted_remote' | undefined
            if (!pdmData) {
              // File exists locally but not on server
              // Check if it's in the ignore list (keep local only)
              if (isIgnoredPath(localFile.relativePath)) {
                diffStatus = 'ignored'
              } else {
                // Check if this file was previously synced (in sync index)
                // If it was synced before but is no longer on server, it was deleted by another user
                const wasPrevinouslySynced = localSyncIndex.has(localFile.relativePath.toLowerCase())
                if (wasPrevinouslySynced) {
                  // File was synced before but no longer on server = orphaned (deleted_remote)
                  diffStatus = 'deleted_remote'
                  window.electronAPI?.log('debug', '[LoadFiles] Detected orphaned file', {
                    path: localFile.relativePath,
                    reason: 'in_sync_index_but_not_on_server'
                  })
                } else {
                  // File was never synced = genuinely new (added)
                  diffStatus = 'added'
                }
              }
            } else if (isMovedFile) {
              // File was moved - needs check-in to update server path (but no version increment)
              diffStatus = 'moved'
            } else if (pdmData.content_hash && effectiveLocalHash) {
              // Both hashes available - use hash comparison (most accurate)
              if (pdmData.content_hash === effectiveLocalHash) {
                // Hashes match - file is synced, leave diffStatus undefined
              } else {
                // Hashes differ - determine if local is newer or cloud is newer
                const localModTime = new Date(localFile.modifiedTime).getTime()
                const cloudUpdateTime = pdmData.updated_at ? new Date(pdmData.updated_at).getTime() : 0
                
                if (localModTime > cloudUpdateTime) {
                  diffStatus = 'modified'
                } else {
                  diffStatus = 'outdated'
                }
              }
            } else if (pdmData.content_hash) {
              // No local hash available - use VERSION-BASED detection first, then TIMESTAMP fallback
              const localModTime = new Date(localFile.modifiedTime).getTime()
              const cloudUpdateTime = pdmData.updated_at ? new Date(pdmData.updated_at).getTime() : 0
              const isCheckedOutByMe = pdmData.checked_out_by === user?.id
              
              // PRIORITY 1: Use tracked localVersion for accurate outdated detection
              // This is set when files are downloaded, checked in, or rolled back
              if (existingLocalVersion !== undefined && pdmData.version !== undefined) {
                if (existingLocalVersion < pdmData.version) {
                  // Server has a newer version - file is definitely outdated
                  diffStatus = 'outdated'
                } else if (existingLocalVersion === pdmData.version) {
                  // Versions match - file should be synced
                  // But if checked out by me and local is newer, might be modified
                  if (isCheckedOutByMe && localModTime > cloudUpdateTime + 5000) {
                    diffStatus = 'modified'
                  }
                  // Otherwise: leave as synced (diffStatus undefined)
                }
                // If existingLocalVersion > pdmData.version: local has uncommitted changes (modified)
                // This shouldn't normally happen, but leave status as-is
              } else {
                // PRIORITY 2: Timestamp-based fallback when no localVersion available
                // Be VERY conservative - false "outdated" is worse than missing it
                // Background hash computation will eventually determine accurate status
                
                // Tolerance for "modified" detection (my file, local newer)
                const MODIFIED_TOLERANCE_MS = 5000
                
                // VERY CONSERVATIVE tolerance for "outdated" detection
                // Only mark as outdated if absolutely certain to avoid false positives
                const OUTDATED_TOLERANCE_MS = 1800000 // 30 minutes (increased from 10)
                
                if (isCheckedOutByMe && localModTime > cloudUpdateTime + MODIFIED_TOLERANCE_MS) {
                  // I have it checked out and local file is newer → I modified it
                  diffStatus = 'modified'
                } else if (!isCheckedOutByMe && cloudUpdateTime > localModTime + OUTDATED_TOLERANCE_MS) {
                  // Someone else updated it and server is MUCH newer → likely outdated
                  // Note: Without localVersion, we can't be certain, so use large tolerance
                  // Background hash computation will confirm/correct this
                  diffStatus = 'outdated'
                }
                // Otherwise: timestamps are close enough → assume synced until hash computation confirms
              }
            }
            // The background hash computation will set the proper status once hashes are computed
            
            // Preserve pendingMetadata from existing file OR from persistedPendingMetadata (for app restart)
            const preservedPending = existingPendingMetadata.get(localFile.path) || persistedPendingMetadata[localFile.path]
            
            // Check if this file was recently modified locally (e.g., just saved to SW file + DB)
            // If so, preserve the existing pdmData to prevent server data from overwriting local changes
            // This handles the race condition between Save to File and FileWatcher triggering LoadFiles
            const recentlyModifiedData = recentlyModifiedPdmData.get(localFile.path)
            
            // Determine final pdmData:
            // 1. If file was recently modified locally, use preserved pdmData (highest priority)
            // 2. If pendingMetadata exists, merge pending values into pdmData 
            // 3. Otherwise use server pdmData as-is
            let finalPdmData = pdmData
            
            if (recentlyModifiedData) {
              // Recently modified - keep the local pdmData to prevent reversion
              finalPdmData = recentlyModifiedData
              window.electronAPI?.log('debug', '[LoadFiles] SKIP merge for recently modified file', {
                path: localFile.path,
                serverPartNumber: pdmData?.part_number,
                preservedPartNumber: recentlyModifiedData.part_number,
                reason: 'recently_modified'
              })
            } else if (preservedPending && pdmData) {
              // Pending metadata exists - merge pending values into pdmData for immediate UI display
              // This ensures the UI shows the user's edits even after a file refresh
              finalPdmData = {
                ...pdmData,
                part_number: preservedPending.part_number !== undefined ? preservedPending.part_number : pdmData.part_number,
                description: preservedPending.description !== undefined ? preservedPending.description : pdmData.description,
                revision: preservedPending.revision !== undefined ? preservedPending.revision : pdmData.revision,
              }
            }
            
            // Preserve checked_out_user info if the checkout user hasn't changed
            // This prevents "SO" (Someone) avatars during file refreshes
            if (finalPdmData?.id) {
              const preservedUserInfo = existingCheckedOutUsers.get(finalPdmData.id)
              if (preservedUserInfo && finalPdmData.checked_out_by) {
                // If checkout user is the same, preserve the user info
                // The server data doesn't include the joined user info
                finalPdmData = {
                  ...finalPdmData,
                  checked_out_user: preservedUserInfo
                } as any
              }
            }
            
            // CRITICAL: Preserve 'modified' status for files with pending metadata changes
            // The hash comparison above may incorrectly set diffStatus to undefined because
            // the file content hasn't changed yet (user only edited UI fields).
            // But we know there ARE pending changes, so force 'modified' status.
            const finalDiffStatus = (preservedPending && Object.keys(preservedPending).length > 0 && pdmData)
              ? 'modified' as const
              : diffStatus
            
            // Determine localVersion:
            // - If file is synced (hashes match or no diff), use server version
            // - If preserved from previous state, use that
            // - Otherwise undefined (will be set when downloaded or checked in)
            const isSyncedWithServer = pdmData && !finalDiffStatus && pdmData.content_hash && effectiveLocalHash && pdmData.content_hash === effectiveLocalHash
            const computedLocalVersion = isSyncedWithServer ? pdmData.version : existingLocalVersion
            
            return {
              ...localFile,
              pdmData: finalPdmData || undefined,
              isSynced: !!pdmData,
              diffStatus: finalDiffStatus,
              // Preserve rollback state if it exists
              localActiveVersion: existingLocalActiveVersion,
              // Track actual version on disk
              localVersion: computedLocalVersion,
              // Preserve localHash from existing file if not computed fresh
              localHash: effectiveLocalHash,
              // Preserve pendingMetadata so user's unsaved edits survive file refresh
              pendingMetadata: preservedPending
            }
          })
          
          // Debug: Log match statistics
          window.electronAPI?.log('info', '[LoadFiles] MATCH STATS', {
            matched: matchedCount,
            unmatched: unmatchedCount,
            serverTotal: pdmFiles.length,
            unmatchedSamples
          })
          
          // Add cloud-only files (exist on server but not locally) as "cloud" or "deleted" entries
          // "cloud" = available for download (muted)
          // "deleted" = was checked out by me but removed locally (red) - indicates moved/deleted file
          // Note: if a file was MOVED (same content hash exists locally), don't show the deleted ghost
          const cloudFolders = new Set<string>()
          
          // Create a set of local content hashes to detect moved files
          const localContentHashes = new Set(
            localFiles.filter(f => !f.isDirectory && f.localHash).map(f => f.localHash)
          )
          
          for (const pdmFile of pdmFiles as any[]) {
            if (!localPathSet.has(pdmFile.file_path.toLowerCase())) {
              // Check if this file was MOVED (same content exists at a different location locally)
              const isCheckedOutByMe = pdmFile.checked_out_by === user?.id
              const wasMoved = pdmFile.content_hash && localContentHashes.has(pdmFile.content_hash)
              
              // If moved, don't show the ghost at the old location - the file is handled at the new location
              if (wasMoved) {
                continue
              }
              
              // If checked out by me but not moved, it was truly deleted locally
              const isDeletedByMe = isCheckedOutByMe
              
              // Add cloud parent folders for this file
              const pathParts = pdmFile.file_path.split('/')
              let currentPath = ''
              for (let i = 0; i < pathParts.length - 1; i++) {
                currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i]
                if (!localPathSet.has(currentPath.toLowerCase()) && !cloudFolders.has(currentPath)) {
                  cloudFolders.add(currentPath)
                }
              }
              
              // Add the cloud-only file (not synced locally)
              // Preserve checked_out_user info if we have it cached
              const preservedCloudUserInfo = existingCheckedOutUsers.get(pdmFile.id)
              const cloudFilePdmData = preservedCloudUserInfo && pdmFile.checked_out_by
                ? { ...pdmFile, checked_out_user: preservedCloudUserInfo }
                : pdmFile
              
              localFiles.push({
                name: pdmFile.file_name,
                path: buildFullPath(loadingForVaultPath, pdmFile.file_path),
                relativePath: pdmFile.file_path,
                isDirectory: false,
                extension: pdmFile.extension,
                size: pdmFile.file_size || 0,
                modifiedTime: pdmFile.updated_at || '',
                pdmData: cloudFilePdmData,
                isSynced: false, // Not synced locally
                diffStatus: isDeletedByMe ? 'deleted' : 'cloud' // Deleted if I moved/removed it, otherwise cloud
              })
            }
          }
          
          // Auto-create server folders locally (folders that exist on server but not locally)
          // Since folders sync immediately, we should also auto-create them on the receiving end
          // This is instant (just mkdir operations) - no content to download
          const addedCloudFolderPaths = new Set<string>()
          const foldersToCreate: Array<{ path: string; fullPath: string; folderPath: string; serverFolder?: any }> = []
          
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
              serverFolder 
            })
          }
          
          // Create all folders locally in parallel (fast - just mkdir operations)
          if (foldersToCreate.length > 0 && window.electronAPI) {
            window.electronAPI.log('info', '[LoadFiles] Auto-creating server folders locally', { 
              count: foldersToCreate.length 
            })
            
            // Create folders in parallel - this is very fast (sub-ms per folder)
            await Promise.all(
              foldersToCreate.map(async ({ fullPath }) => {
                try {
                  await window.electronAPI?.createFolder(fullPath)
                } catch (err) {
                  // Folder might already exist or creation failed - that's okay
                  window.electronAPI?.log('debug', '[LoadFiles] Folder creation skipped/failed', { 
                    fullPath, 
                    error: err instanceof Error ? err.message : String(err)
                  })
                }
              })
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
              pdmData: serverFolder ? { id: serverFolder.id, folder_path: serverFolder.folder_path } as any : undefined
            })
          }
          
          // Debug: Log merge summary
          const syncedCount = localFiles.filter(f => !f.isDirectory && f.isSynced).length
          const addedCount = localFiles.filter(f => !f.isDirectory && f.diffStatus === 'added').length
          const cloudCount = localFiles.filter(f => !f.isDirectory && f.diffStatus === 'cloud').length
          const orphanedCount = localFiles.filter(f => !f.isDirectory && f.diffStatus === 'deleted_remote').length
          window.electronAPI?.log('info', '[LoadFiles] Merge summary', {
            serverFiles: pdmFiles.length,
            localFilesAfterMerge: localFiles.filter(f => !f.isDirectory).length,
            synced: syncedCount,
            added: addedCount,
            cloudOnly: cloudCount,
            orphaned: orphanedCount,
          })
          
          // Update the local sync index with all server file paths
          // This ensures we track which files have been synced for orphan detection
          if (currentVaultId) {
            const serverPaths = pdmFiles.map((f: any) => f.file_path as string)
            updateSyncIndexFromServer(currentVaultId, serverPaths).catch(err => {
              window.electronAPI?.log('warn', '[LoadFiles] Failed to update sync index', { error: String(err) })
            })
          }
        }
      } else {
        // Offline mode or no org - local files are "added" unless ignored
        localFiles = localFiles.map(f => ({
          ...f,
          diffStatus: f.isDirectory ? undefined : (isIgnoredPath(f.relativePath) ? 'ignored' as const : 'added' as const)
        }))
      }
      
      // Update folder diffStatus based on contents
      // A folder should be 'cloud' if all its contents are cloud-only AND it has some cloud content
      // Empty folders that exist locally should NOT be marked as cloud
      // Process folders bottom-up (deepest first) so parent folders see updated child statuses
      
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
      
      const folders = localFiles.filter(f => f.isDirectory)
      
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
        
        const hasLocalContent = directChildren.some(f => f.diffStatus !== 'cloud')
        const hasCloudContent = directChildren.some(f => f.diffStatus === 'cloud')
        
        // Only mark as cloud if folder has cloud content AND no local content
        // Empty local folders should stay as normal folders
        if (!hasLocalContent && hasCloudContent) {
          folder.diffStatus = 'cloud'
        }
      }
      
      // Record merge timing
      const mergeDuration = performance.now() - mergeStart
      recordMetric('VaultLoad', 'Merge complete', { durationMs: Math.round(mergeDuration) })
      
      // Check if vault changed during async operations - if so, skip setting files
      // This prevents race conditions when auto-connect switches vaults during initial load
      if (isVaultStale()) {
        window.electronAPI?.log('info', '[LoadFiles] Skipping setFiles - vault changed during load', { 
          loadedFor: loadingForVaultId, 
          currentVault: usePDMStore.getState().activeVaultId 
        })
        return
      }
      
      // Record total vault load time
      const vaultLoadDuration = performance.now() - vaultLoadStart
      recordMetric('VaultLoad', 'Total vault load complete', { 
        durationMs: Math.round(vaultLoadDuration),
        fileCount: localFiles.filter((f: { isDirectory: boolean }) => !f.isDirectory).length,
        folderCount: localFiles.filter((f: { isDirectory: boolean }) => f.isDirectory).length
      })
      
      // Detect externally deleted synced files and add auto-download exclusions
      // This prevents auto-download from re-downloading files the user deleted via Windows Explorer
      // Detection: files that had local copies but now show as cloud-only
      if (currentVaultId) {
        const previousFiles = usePDMStore.getState().files
        
        // Only run detection if we have previous state (skip on first load)
        if (previousFiles.length > 0) {
          const { addAutoDownloadExclusion } = usePDMStore.getState()
          
          // Build set of paths that previously had local copies (synced files with local presence)
          const previousLocalSyncedPaths = new Set(
            previousFiles
              .filter(f => !f.isDirectory && f.pdmData?.id && f.diffStatus !== 'cloud')
              .map(f => f.relativePath)
          )
          
          // Build set of folder paths that previously had local presence
          const previousLocalFolderPaths = new Set(
            previousFiles
              .filter(f => f.isDirectory && f.diffStatus !== 'cloud')
              .map(f => f.relativePath.toLowerCase())
          )
          
          // Find files that transitioned from local to cloud-only (externally deleted)
          const externallyDeletedFiles = localFiles.filter(f => 
            !f.isDirectory && 
            f.diffStatus === 'cloud' && 
            f.pdmData?.id &&
            previousLocalSyncedPaths.has(f.relativePath)
          )
          
          // Find folders that transitioned from local to cloud-only (externally deleted)
          const externallyDeletedFolders = localFiles.filter(f => 
            f.isDirectory && 
            f.diffStatus === 'cloud' &&
            previousLocalFolderPaths.has(f.relativePath.toLowerCase())
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
              if (!file.isDirectory && 
                  file.diffStatus === 'cloud' &&
                  file.relativePath.toLowerCase().startsWith(folderPrefix)) {
                filesToExclude.add(file.relativePath)
              }
            }
          }
          
          // Add exclusions for all externally deleted files
          if (filesToExclude.size > 0) {
            for (const relativePath of filesToExclude) {
              addAutoDownloadExclusion(currentVaultId, relativePath)
            }
            
            window.electronAPI?.log('info', '[LoadFiles] Added auto-download exclusions for externally deleted files', {
              fileCount: externallyDeletedFiles.length,
              folderCount: externallyDeletedFolders.length,
              totalExcluded: filesToExclude.size,
              paths: Array.from(filesToExclude).slice(0, 10), // Log first 10 paths
              truncated: filesToExclude.size > 10
            })
          }
        }
      }
      
      setFiles(localFiles)
      setFilesLoaded(true)  // Mark that initial load is complete
      const totalFiles = localFiles.filter(f => !f.isDirectory).length
      const syncedCount = localFiles.filter(f => !f.isDirectory && f.pdmData).length
      const folderCount = localFiles.filter(f => f.isDirectory).length
      setStatusMessage(`Loaded ${totalFiles} files, ${folderCount} folders${syncedCount > 0 ? ` (${syncedCount} synced)` : ''}`)
      
      // Background tasks (non-blocking) - run after UI renders
      if (user && window.electronAPI) {
        setTimeout(async () => {
          // Skip background tasks if vault changed
          if (isVaultStale()) {
            window.electronAPI?.log('info', '[LoadFiles] Skipping background tasks - vault changed')
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
            .filter(f => !f.isDirectory && f.pdmData?.checked_out_by)
            .map(f => f.pdmData!.id)
          
          if (checkedOutFileIds.length > 0 && organization) {
            const fetchStart = performance.now()
            const { users: userInfo } = await getCheckedOutUsers(checkedOutFileIds)
            const fetchDuration = performance.now() - fetchStart
            
            const userInfoMap = userInfo as Record<string, { email: string; full_name: string; avatar_url?: string }>
            if (Object.keys(userInfoMap).length > 0 && !isVaultStale()) {
              // Update files in store with user info
              const updateStart = performance.now()
              const currentFiles = usePDMStore.getState().files
              const updatedFiles = currentFiles.map(f => {
                const fileId = f.pdmData?.id
                if (fileId && fileId in userInfoMap && f.pdmData) {
                  return {
                    ...f,
                    pdmData: {
                      ...f.pdmData,
                      checked_out_user: userInfoMap[fileId]
                    }
                  } as typeof f
                }
                return f
              })
              setFiles(updatedFiles)
              const updateDuration = performance.now() - updateStart
              
              // Also persist user info to IndexedDB cache for next app boot
              // This prevents "SO" avatars on subsequent loads
              if (loadingForVaultId) {
                updateCachedUserInfo(loadingForVaultId, userInfoMap).catch(err => {
                  window.electronAPI?.log('warn', '[LoadFiles] Failed to update cache with user info', { error: String(err) })
                })
              }
              
              recordMetric('VaultLoad', 'User info update complete', {
                durationMs: Math.round(updateDuration),
                fetchMs: Math.round(fetchDuration),
                usersFound: Object.keys(userInfoMap).length
              })
            }
          }
          recordMetric('VaultLoad', 'User info task complete', {
            durationMs: Math.round(performance.now() - userInfoStart),
            checkedOutFiles: checkedOutFileIds.length
          })
          
          // 2. Background hash computation - SKIPPED on startup for performance
          // We now use timestamp-based diff detection which is instant.
          // Hashes are computed on-demand at checkin time when accuracy is critical.
          // This saves ~27 seconds on vaults with 25k+ files.
          // When forceHashComputation=true (Full Refresh), compute ALL synced files for accurate sync status.
          const skipHashComputation = !forceHashComputation
          
          const hashTaskStart = performance.now()
          // When forceHashComputation, compute hashes for ALL files with server content_hash (even if local hash exists)
          // Otherwise, only compute for files without local hash
          const filesNeedingHash = skipHashComputation ? [] : localFiles.filter(f => 
            !f.isDirectory && f.pdmData?.content_hash && (forceHashComputation || !f.localHash)
          )
          
          recordMetric('VaultLoad', 'Hash computation starting', {
            filesNeedingHash: filesNeedingHash.length,
            totalFiles: localFiles.filter(f => !f.isDirectory).length,
            skipped: skipHashComputation
          })
          
          if (filesNeedingHash.length > 0 && window.electronAPI.computeFileHashes) {
            window.electronAPI?.log('info', '[LoadFiles] Computing hashes for', { count: filesNeedingHash.length, forceHashComputation })
            setStatusMessage(forceHashComputation 
              ? `Full refresh: Computing hashes (0/${filesNeedingHash.length})...`
              : `Checking ${filesNeedingHash.length} files for changes...`)
            
            // Prepare file list for hash computation
            const hashRequests = filesNeedingHash.map(f => ({
              path: f.path,
              relativePath: f.relativePath,
              size: f.size,
              mtime: new Date(f.modifiedTime).getTime()
            }))
            
            try {
              // Compute hashes in background (with progress updates via IPC)
              const hashComputeStart = performance.now()
              const { results } = await window.electronAPI.computeFileHashes(hashRequests)
              const hashComputeDuration = performance.now() - hashComputeStart
              
              recordMetric('VaultLoad', 'Hash IPC complete', {
                durationMs: Math.round(hashComputeDuration),
                filesHashed: results?.length || 0
              })
              
              if (results && results.length > 0 && !isVaultStale()) {
                // Create a map for quick lookup
                const hashMap = new Map(results.map(r => [r.relativePath, r.hash]))
                
                // Update files with computed hashes and recompute diff status
                const updateStart = performance.now()
                const currentFiles = usePDMStore.getState().files
                const updatedFiles = currentFiles.map(f => {
                  if (f.isDirectory) return f
                  
                  const computedHash = hashMap.get(f.relativePath)
                  if (!computedHash) return f
                  
                  // Recompute diff status with the new hash
                  let newDiffStatus = f.diffStatus
                  let newLocalVersion = f.localVersion
                  if (f.pdmData?.content_hash && computedHash) {
                    if (f.pdmData.content_hash !== computedHash) {
                      // Hashes differ - check which is newer
                      const localModTime = new Date(f.modifiedTime).getTime()
                      const cloudUpdateTime = f.pdmData.updated_at ? new Date(f.pdmData.updated_at).getTime() : 0
                      newDiffStatus = localModTime > cloudUpdateTime ? 'modified' : 'outdated'
                      // Debug: log hash mismatches to help identify stale data issues
                      window.electronAPI?.log('warn', '[HashCompute] Hash mismatch detected', {
                        file: f.name,
                        localHash: computedHash.substring(0, 12),
                        serverHash: f.pdmData.content_hash.substring(0, 12),
                        localModTime: new Date(localModTime).toISOString(),
                        serverUpdatedAt: f.pdmData.updated_at,
                        result: newDiffStatus,
                        checkedOut: !!f.pdmData.checked_out_by
                      })
                    } else {
                      // Hashes match - file is synced with server version
                      newDiffStatus = undefined
                      newLocalVersion = f.pdmData.version
                    }
                  }
                  
                  return {
                    ...f,
                    localHash: computedHash,
                    diffStatus: newDiffStatus,
                    localVersion: newLocalVersion
                  }
                })
                const updateDuration = performance.now() - updateStart
                
                // Use startTransition for non-blocking UI updates during background hash computation
                // This prevents UI jank when updating many files' hash status
                startTransition(() => {
                  setFiles(updatedFiles)
                })
                
                recordMetric('VaultLoad', 'Hash update complete', {
                  durationMs: Math.round(updateDuration),
                  filesUpdated: results.length
                })
                window.electronAPI?.log('info', '[LoadFiles] Hash computation complete', { updated: results.length })
              }
            } catch (err) {
              window.electronAPI?.log('error', '[LoadFiles] Hash computation failed', { error: String(err) })
            }
            
            // Clear the status message after hash computation
            setStatusMessage('')
            
            recordMetric('VaultLoad', 'Hash task complete', {
              durationMs: Math.round(performance.now() - hashTaskStart),
              filesProcessed: filesNeedingHash.length
            })
          }
          
          // 3. Auto-download cloud files and updates (if enabled)
          // Run after hash computation so we have accurate diff statuses
          // IMPORTANT: Skip on silent refreshes to prevent infinite loops
          // (silent refreshes are triggered by download/update commands completing)
          if (silent) {
            window.electronAPI?.log('info', '[AutoDownload] Skipping - silent refresh')
          }
          
          const { autoDownloadCloudFiles, autoDownloadUpdates, addToast, autoDownloadExcludedFiles, activeVaultId } = usePDMStore.getState()
          
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
            isOfflineMode
          })
          
          if (!silent && (autoDownloadCloudFiles || autoDownloadUpdates) && organization && !isOfflineMode) {
            const latestFiles = usePDMStore.getState().files
            
            // Get exclusion list for current vault
            const excludedPaths = activeVaultId ? (autoDownloadExcludedFiles[activeVaultId] || []) : []
            const excludedPathsSet = new Set(excludedPaths)
            
            // Auto-download cloud-only files and folders
            if (autoDownloadCloudFiles) {
              // Get cloud-only files (not in excluded paths)
              const cloudOnlyFiles = latestFiles.filter(f => 
                !f.isDirectory && 
                f.diffStatus === 'cloud' && 
                f.pdmData?.content_hash &&
                // Exclude files that were intentionally removed locally
                !excludedPathsSet.has(f.relativePath)
              )
              
              // Get cloud-only folders (will download all their contents)
              const cloudOnlyFolders = latestFiles.filter(f => 
                f.isDirectory && 
                f.diffStatus === 'cloud' &&
                // Exclude folders that were intentionally removed locally
                !excludedPathsSet.has(f.relativePath)
              )
              
              // Combine files and folders for download
              const itemsToDownload = [...cloudOnlyFiles, ...cloudOnlyFolders]
              
              if (itemsToDownload.length > 0) {
                const fileCount = cloudOnlyFiles.length
                const folderCount = cloudOnlyFolders.length
                window.electronAPI?.log('info', '[AutoDownload] Downloading cloud items', { 
                  files: fileCount, 
                  folders: folderCount 
                })
                try {
                  // Don't pass onRefresh - we already skipped auto-download on silent refreshes,
                  // and the download command will update the store. User can manually refresh if needed.
                  const result = await executeCommand('download', { files: itemsToDownload })
                  if (result.succeeded > 0) {
                    const message = folderCount > 0 
                      ? `Auto-downloaded ${result.succeeded} cloud file${result.succeeded > 1 ? 's' : ''} (${folderCount} folder${folderCount > 1 ? 's' : ''})`
                      : `Auto-downloaded ${result.succeeded} cloud file${result.succeeded > 1 ? 's' : ''}`
                    addToast('success', message)
                  }
                  if (result.failed > 0) {
                    window.electronAPI?.log('warn', '[AutoDownload] Some downloads failed', { failed: result.failed, errors: result.errors })
                  }
                } catch (err) {
                  window.electronAPI?.log('error', '[AutoDownload] Failed to download cloud files', { error: String(err) })
                }
              }
            }
            
            // Auto-download updates for outdated files
            if (autoDownloadUpdates) {
              // Debug: Log all files with outdated status before filtering
              const allOutdatedStatus = latestFiles.filter(f => f.diffStatus === 'outdated')
              window.electronAPI?.log('debug', '[AutoDownload] Files with outdated status', {
                count: allOutdatedStatus.length,
                files: allOutdatedStatus.map(f => ({
                  name: f.name,
                  relativePath: f.relativePath,
                  isDirectory: f.isDirectory,
                  hasContentHash: !!f.pdmData?.content_hash,
                  contentHash: f.pdmData?.content_hash?.substring(0, 12),
                  localHash: f.localHash?.substring(0, 12),
                  fileId: f.pdmData?.id,
                  checkedOutBy: f.pdmData?.checked_out_by
                }))
              })
              
              const outdatedFiles = latestFiles.filter(f => 
                !f.isDirectory && f.diffStatus === 'outdated' && f.pdmData?.content_hash
              )
              
              // Debug: Log files that were filtered out
              const filteredOut = allOutdatedStatus.filter(f => 
                f.isDirectory || !f.pdmData?.content_hash
              )
              if (filteredOut.length > 0) {
                window.electronAPI?.log('warn', '[AutoDownload] Outdated files FILTERED OUT (no content_hash or is directory)', {
                  count: filteredOut.length,
                  files: filteredOut.map(f => ({
                    name: f.name,
                    isDirectory: f.isDirectory,
                    hasContentHash: !!f.pdmData?.content_hash
                  }))
                })
              }
              
              if (outdatedFiles.length > 0) {
                window.electronAPI?.log('info', '[AutoDownload] Updating outdated files', { 
                  count: outdatedFiles.length,
                  files: outdatedFiles.map(f => ({
                    name: f.name,
                    relativePath: f.relativePath,
                    localHash: f.localHash?.substring(0, 12),
                    serverHash: f.pdmData?.content_hash?.substring(0, 12),
                    fileId: f.pdmData?.id
                  }))
                })
                try {
                  // Don't pass onRefresh - same reason as above
                  const result = await executeCommand('get-latest', { files: outdatedFiles })
                  window.electronAPI?.log('info', '[AutoDownload] Update result', {
                    total: result.total,
                    succeeded: result.succeeded,
                    failed: result.failed,
                    errors: result.errors
                  })
                  if (result.succeeded > 0) {
                    addToast('success', `Auto-updated ${result.succeeded} file${result.succeeded > 1 ? 's' : ''}`)
                  }
                  if (result.failed > 0) {
                    window.electronAPI?.log('warn', '[AutoDownload] Some updates failed', { failed: result.failed, errors: result.errors })
                  }
                } catch (err) {
                  window.electronAPI?.log('error', '[AutoDownload] Failed to update outdated files', { error: String(err) })
                }
              }
            }
          }
          
          // 4. Auto-discard orphaned files (if enabled)
          // Orphaned files are local files that were previously synced but no longer exist on the server
          // (deleted by another user). They have diffStatus === 'deleted_remote'.
          // IMPORTANT: Skip on silent refreshes to prevent infinite loops
          const { autoDiscardOrphanedFiles } = usePDMStore.getState()
          
          if (!silent && autoDiscardOrphanedFiles && !isVaultStale()) {
            const latestFiles = usePDMStore.getState().files
            
            // Get orphaned files (local files that were synced but no longer on server)
            const orphanedFiles = latestFiles.filter(f => 
              !f.isDirectory && f.diffStatus === 'deleted_remote'
            )
            
            if (orphanedFiles.length > 0) {
              window.electronAPI?.log('info', '[AutoDiscard] Discarding orphaned files', { 
                count: orphanedFiles.length,
                files: orphanedFiles.map(f => ({
                  name: f.name,
                  relativePath: f.relativePath
                }))
              })
              
              try {
                const result = await executeCommand('discard-orphaned', { files: orphanedFiles })
                if (result.succeeded > 0) {
                  addToast('info', `Auto-discarded ${result.succeeded} orphaned file${result.succeeded > 1 ? 's' : ''}`)
                }
                if (result.failed > 0) {
                  window.electronAPI?.log('warn', '[AutoDiscard] Some files failed to discard', { failed: result.failed, errors: result.errors })
                }
              } catch (err) {
                window.electronAPI?.log('error', '[AutoDiscard] Failed to discard orphaned files', { error: String(err) })
              }
            }
          }
        }, 50) // Small delay to let React render first
      }
    } catch (err) {
      if (!silent) {
        setStatusMessage('Error loading files')
      }
      window.electronAPI?.log?.('error', '[LoadFiles] Error loading files', { error: String(err) })
    } finally {
      if (!silent) {
        setIsLoading(false)
        setTimeout(() => setStatusMessage(''), 3000)
      }
    }
  }, [vaultPath, organization, isOfflineMode, currentVaultId, user, setFiles, setServerFiles, setServerFolderPaths, setIsLoading, setStatusMessage, setFilesLoaded])

  /**
   * Refresh only a specific folder (faster than full vault refresh)
   * Uses cached server data and only scans the local folder
   */
  const refreshCurrentFolder = useCallback(async (folderPath: string) => {
    logExplorer('refreshCurrentFolder ENTRY', { folderPath, vaultPath })
    window.electronAPI?.log('info', '[RefreshFolder] Called with', { folderPath, vaultPath })
    if (!window.electronAPI || !vaultPath) return
    
    // Force React to render loading state immediately before heavy work
    // flushSync ensures the spinner is visible before the IPC call is made
    logExplorer('refreshCurrentFolder BEFORE flushSync')
    flushSync(() => {
      setIsLoading(true)
      setStatusMessage(`Refreshing folder...`)
    })
    logExplorer('refreshCurrentFolder AFTER flushSync')
    
    try {
      // 1. Get existing files from store
      const existingFiles = usePDMStore.getState().files
      const serverFiles = usePDMStore.getState().serverFiles
      
      // 2. Scan only the target folder locally (fast - no hash computation)
      const localResult = await window.electronAPI.listFolderFast(folderPath)
      
      if (!localResult.success || !localResult.files) {
        window.electronAPI?.log('error', '[RefreshFolder] Failed to scan folder', { error: localResult.error })
        setStatusMessage('Failed to refresh folder')
        return
      }
      
      window.electronAPI?.log('info', '[RefreshFolder] Scanned folder', { 
        folderPath, 
        localCount: localResult.files.length 
      })
      
      // 2b. Preserve the current folder's own entry (will be excluded by filter but needs to stay)
      // listFolderFast returns CONTENTS of the folder, not the folder entry itself
      const currentFolderEntry = folderPath 
        ? existingFiles.find(f => f.relativePath.toLowerCase() === folderPath.toLowerCase() && f.isDirectory)
        : undefined
      
      // 3. Separate existing files: those in the folder vs those outside
      const folderPrefix = folderPath ? folderPath.toLowerCase() + '/' : ''
      const filesOutsideFolder = existingFiles.filter(f => {
        const relPath = f.relativePath.toLowerCase()
        // Keep files that are NOT in or under the refreshed folder
        if (folderPath === '') {
          // Refreshing root - replace everything
          return false
        }
        return !relPath.startsWith(folderPrefix) && relPath !== folderPath.toLowerCase()
      })
      
      // 4. Build COMPLETE pdmData map from existing files (not stripped serverFiles)
      // This preserves version, part_number, checkout info, workflow_state, etc.
      const existingPdmMap = new Map<string, NonNullable<typeof existingFiles[0]['pdmData']>>()
      for (const f of existingFiles) {
        if (f.pdmData) {
          existingPdmMap.set(f.relativePath.toLowerCase(), f.pdmData)
        }
      }
      
      // Also build a set of server file paths for cloud-only detection
      const serverPathSet = new Set<string>()
      for (const sf of serverFiles) {
        serverPathSet.add(sf.file_path.toLowerCase())
      }
      
      // 5. Merge local folder files with COMPLETE server data from existing files
      const userId = user?.id
      const refreshedFolderFiles = localResult.files.map((localFile: any) => {
        if (localFile.isDirectory) {
          return {
            ...localFile,
            localHash: localFile.hash
          }
        }
        
        const lookupKey = localFile.relativePath.toLowerCase()
        // Use complete pdmData from existing files (has version, part_number, etc.)
        const pdmData = existingPdmMap.get(lookupKey)
        
        // Determine diff status
        let diffStatus: 'added' | 'modified' | 'outdated' | 'cloud' | undefined
        if (!pdmData) {
          // Check if file exists on server but we don't have pdmData yet
          // (shouldn't happen normally, but handle gracefully)
          diffStatus = serverPathSet.has(lookupKey) ? undefined : 'added'
        } else if (pdmData.content_hash && localFile.hash) {
          if (pdmData.content_hash !== localFile.hash) {
            const localModTime = new Date(localFile.modifiedTime).getTime()
            const cloudUpdateTime = pdmData.updated_at ? new Date(pdmData.updated_at).getTime() : 0
            diffStatus = localModTime > cloudUpdateTime ? 'modified' : 'outdated'
          }
        } else if (pdmData.content_hash) {
          // No local hash - use timestamp fallback
          const localModTime = new Date(localFile.modifiedTime).getTime()
          const cloudUpdateTime = pdmData.updated_at ? new Date(pdmData.updated_at).getTime() : 0
          const isCheckedOutByMe = pdmData.checked_out_by === userId
          
          if (isCheckedOutByMe && localModTime > cloudUpdateTime + 5000) {
            diffStatus = 'modified'
          } else if (!isCheckedOutByMe && cloudUpdateTime > localModTime + 1800000) {
            diffStatus = 'outdated'
          }
        }
        
        return {
          ...localFile,
          localHash: localFile.hash,
          pdmData: pdmData || undefined,
          isSynced: !!pdmData,
          diffStatus
        }
      })
      
      // 6. Add cloud-only files in this folder (exist on server but not locally)
      const localPathSet = new Set(localResult.files.map((f: any) => f.relativePath.toLowerCase()))
      for (const sf of serverFiles) {
        const sfPath = sf.file_path.toLowerCase()
        const isInFolder = folderPath === '' || sfPath.startsWith(folderPrefix)
        
        if (isInFolder && !localPathSet.has(sfPath)) {
          // Use complete pdmData from existing files if available
          const completePdmData = existingPdmMap.get(sfPath)
          
          refreshedFolderFiles.push({
            name: sf.name,
            path: buildFullPath(vaultPath, sf.file_path),
            relativePath: sf.file_path,
            isDirectory: false,
            extension: sf.extension || '',
            size: completePdmData?.file_size || 0,
            modifiedTime: completePdmData?.updated_at || '',
            pdmData: completePdmData || undefined,
            isSynced: false,
            diffStatus: 'cloud' as const
          })
        }
      }
      
      // 7. Combine: files outside folder + refreshed folder files + current folder entry
      // The current folder entry must be preserved so navigation back works correctly
      const combinedFiles = [
        ...filesOutsideFolder, 
        ...refreshedFolderFiles,
        ...(currentFolderEntry ? [currentFolderEntry] : [])
      ]
      
      // Sort for consistent display
      combinedFiles.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.relativePath.localeCompare(b.relativePath)
      })
      
      window.electronAPI?.log('info', '[RefreshFolder] Complete', { 
        folderPath,
        outsideFolder: filesOutsideFolder.length,
        inFolder: refreshedFolderFiles.length,
        total: combinedFiles.length
      })
      
      // Use startTransition to mark this as a non-urgent update
      // This allows React to render the loading spinner before processing the heavy file list
      const stStart = performance.now()
      logExplorer('startTransition CALLING', { combinedFilesCount: combinedFiles.length })
      startTransition(() => {
        logExplorer('startTransition EXECUTING setFiles', { delayMs: Math.round(performance.now() - stStart) })
        setFiles(combinedFiles)
      })
      setStatusMessage(`Refreshed ${refreshedFolderFiles.length} items`)
      
    } catch (err) {
      window.electronAPI?.log('error', '[RefreshFolder] Error', { error: String(err) })
      setStatusMessage('Error refreshing folder')
    } finally {
      logExplorer('refreshCurrentFolder FINALLY - setting isLoading=false')
      setIsLoading(false)
      setTimeout(() => setStatusMessage(''), 3000)
    }
  }, [vaultPath, user, setFiles, setIsLoading, setStatusMessage])

  return { loadFiles, refreshCurrentFolder }
}
