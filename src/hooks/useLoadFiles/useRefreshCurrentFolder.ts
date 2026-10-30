import { useCallback, useRef, startTransition } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePDMStore } from '@/stores/pdmStore'
import { logExplorer } from '@/lib/userActionLogger'
import { isLoadFilesInFlight } from '../loadFilesCoordination'
import { mergeFolderRefresh, type FolderScanEntry } from './folderRefreshMerge'

/**
 * Refresh only a specific folder (faster than full vault refresh).
 * Uses the store's server data and only scans the local folder.
 */
export function useRefreshCurrentFolder(currentVaultId: string | undefined) {
  const { vaultPath, user, setFiles, setIsLoading, setStatusMessage } = usePDMStore(
    useShallow((s) => ({
      vaultPath: s.vaultPath,
      user: s.user,
      setFiles: s.setFiles,
      setIsLoading: s.setIsLoading,
      setStatusMessage: s.setStatusMessage,
    })),
  )

  // Folders whose refresh already dropped the main-process scan cache, so a refresh that
  // keeps growing for some other reason cannot invalidate on every press.
  const scanCacheSelfHealedFolders = useRef(new Set<string>())

  return useCallback(
    async (folderPath: string) => {
      logExplorer('refreshCurrentFolder ENTRY', { folderPath, vaultPath })
      window.electronAPI?.log('info', '[RefreshFolder] Called with', { folderPath, vaultPath })
      if (!vaultPath) return
      // BluePLM Web has no folder to scan: a refresh reloads the server rows.
      if (!window.electronAPI) {
        usePDMStore.getState().requestFilesReload()
        return
      }

      // Guard against concurrent refreshes. isLoading misses silent watcher-driven
      // loadFiles passes, so check the in-flight tracker too.
      if (usePDMStore.getState().isLoading || isLoadFilesInFlight()) {
        window.electronAPI?.log('info', '[RefreshFolder] Skipping - already refreshing')
        return
      }

      // Set loading state and yield to UI thread so spinner renders before heavy work
      // (replaces flushSync which can crash React if called during an existing render cycle)
      setIsLoading(true)
      setStatusMessage(`Refreshing folder...`)
      await new Promise((resolve) => setTimeout(resolve, 0))

      try {
        const { files: existingFiles, serverFiles } = usePDMStore.getState()

        // Scan only the target folder locally (fast - no hash computation)
        const localResult = await window.electronAPI.listFolderFast(folderPath)

        if (!localResult.success || !localResult.files) {
          window.electronAPI?.log('error', '[RefreshFolder] Failed to scan folder', {
            error: localResult.error,
          })
          setStatusMessage('Failed to refresh folder')
          return
        }

        window.electronAPI?.log('info', '[RefreshFolder] Scanned folder', {
          folderPath,
          localCount: localResult.files.length,
        })

        const merged = mergeFolderRefresh({
          existingFiles,
          serverFiles,
          scanned: localResult.files as FolderScanEntry[],
          folderPath,
          vaultPath,
          userId: user?.id,
          isIgnoredPath: currentVaultId
            ? (path) => usePDMStore.getState().isPathIgnored(currentVaultId, path)
            : () => false,
        })
        const { combinedFiles } = merged

        window.electronAPI?.log('info', '[RefreshFolder] Complete', {
          folderPath,
          outsideFolder: combinedFiles.length - merged.refreshedCount,
          inFolder: merged.refreshedCount,
          total: combinedFiles.length,
          suppressedClaimedServerPaths: merged.suppressedClaimedServerPaths,
          skippedHashDuplicates: merged.skippedHashDuplicates,
          skippedHashless: merged.skippedHashless,
        })

        // A refresh reconciles; it does not discover. Growing the store while the
        // disk scan found no more than the store already held means entries were
        // duplicated or resurrected, which is how one vault climbed from 27,183 to
        // 27,993 rows on a single press of Refresh.
        //
        // It also means the main-process scan cache is behind the disk, because the
        // store is built from that cache and this folder scan just found more. Drop it
        // so the next delta load re-walks, instead of leaving the user on Full Refresh.
        // Once per folder until that folder refreshes cleanly: growth has other causes,
        // and those must not buy a full vault walk on every press.
        const healKey = folderPath.toLowerCase()
        if (combinedFiles.length > existingFiles.length) {
          const alreadyHealed = scanCacheSelfHealedFolders.current.has(healKey)
          window.electronAPI?.log('warn', '[RefreshFolder] Store grew during refresh', {
            folderPath,
            before: existingFiles.length,
            after: combinedFiles.length,
            grewBy: combinedFiles.length - existingFiles.length,
            localCount: localResult.files.length,
            invalidatedScanCache: !alreadyHealed,
          })
          if (!alreadyHealed) {
            scanCacheSelfHealedFolders.current.add(healKey)
            await window.electronAPI?.invalidateScanCache('refresh-folder-store-grew')
          }
        } else {
          scanCacheSelfHealedFolders.current.delete(healKey)
        }

        // Use startTransition to mark this as a non-urgent update
        // This allows React to render the loading spinner before processing the heavy file list
        // IMPORTANT: setIsLoading(false) is inside the transition so the concurrency guard
        // stays up until setFiles actually applies — prevents race with realtime batch updates
        const stStart = performance.now()
        logExplorer('startTransition CALLING', { combinedFilesCount: combinedFiles.length })
        startTransition(() => {
          logExplorer('startTransition EXECUTING setFiles', {
            delayMs: Math.round(performance.now() - stStart),
          })
          setFiles(combinedFiles)
          setIsLoading(false)
          setStatusMessage(`Refreshed ${merged.refreshedCount} items`)
          setTimeout(() => setStatusMessage(''), 3000)
        })
      } catch (error) {
        window.electronAPI?.log('error', '[RefreshFolder] Error', { error: String(error) })
        setStatusMessage('Error refreshing folder')
        setIsLoading(false)
        setTimeout(() => setStatusMessage(''), 3000)
      }
    },
    [vaultPath, user, currentVaultId, setFiles, setIsLoading, setStatusMessage],
  )
}
