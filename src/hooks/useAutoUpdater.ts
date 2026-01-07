import { useEffect } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { log } from '@/lib/logger'

/**
 * Auto-updater event listeners
 * Handles:
 * - Update available notifications
 * - Download progress
 * - Auto-install after download
 * - Error handling
 */
export function useAutoUpdater() {
  useEffect(() => {
    if (!window.electronAPI) return
    
    const { 
      setShowUpdateModal, 
      setUpdateAvailable, 
      setUpdateDownloading, 
      setUpdateDownloaded, 
      setUpdateProgress,
      addToast 
    } = usePDMStore.getState()
    
    const cleanups: (() => void)[] = []
    
    // Update available - show modal (always update to latest version)
    cleanups.push(
      window.electronAPI.onUpdateAvailable((info) => {
        log.info('[Update]', 'Update available', { version: info.version })
        // Reset download state when switching to a new update version
        setUpdateDownloading(false)
        setUpdateDownloaded(false)
        setUpdateProgress(null)
        setUpdateAvailable(info)
        setShowUpdateModal(true)
      })
    )
    
    // Update not available
    cleanups.push(
      window.electronAPI.onUpdateNotAvailable(() => {
        setUpdateAvailable(null)
      })
    )
    
    // Download progress
    cleanups.push(
      window.electronAPI.onUpdateDownloadProgress((progress) => {
        setUpdateProgress(progress)
      })
    )
    
    // Download completed - auto-install
    cleanups.push(
      window.electronAPI.onUpdateDownloaded(async (info) => {
        log.info('[Update]', 'Update downloaded', { version: info.version })
        setUpdateDownloading(false)
        setUpdateDownloaded(true)
        setUpdateProgress(null)
        // Auto-install after download completes
        try {
          await window.electronAPI.installUpdate()
        } catch (err) {
          log.error('[Update]', 'Auto-install error', { error: err })
        }
      })
    )
    
    // Error
    cleanups.push(
      window.electronAPI.onUpdateError((error) => {
        log.error('[Update]', 'Update error', { error: error.message })
        setUpdateDownloading(false)
        setUpdateProgress(null)
        setShowUpdateModal(false)
        addToast('error', `Update error: ${error.message}`)
        // Request focus restoration after modal closes (fixes macOS UI freeze issue)
        window.electronAPI?.requestFocus?.()
      })
    )
    
    // Check if an update was already detected before listeners were set up
    // This handles the race condition where the update check completes before
    // the React app mounts and registers its event listeners
    window.electronAPI.getUpdateStatus().then((status) => {
      if (status.updateAvailable) {
        setUpdateAvailable(status.updateAvailable)
        setShowUpdateModal(true)
      }
      if (status.updateDownloaded) {
        setUpdateDownloaded(true)
      }
    }).catch((err) => {
      log.error('[Update]', 'Failed to get initial status', { error: err })
    })
    
    return () => {
      cleanups.forEach(cleanup => cleanup())
    }
  }, [])
}
