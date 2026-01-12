import { useState, useEffect, useCallback } from 'react'
import { log } from '@/lib/logger'
import {
  getBackupConfig,
  listSnapshots,
  isThisDesignatedMachine,
  isDesignatedMachineOnline,
  type BackupConfig,
  type BackupSnapshot
} from '@/lib/backup'

interface UseBackupStatusReturn {
  // Config (loads fast)
  config: BackupConfig | null
  isConfigured: boolean
  isLoadingConfig: boolean
  
  // Snapshots (loads slow, in background)
  snapshots: BackupSnapshot[]
  lastSnapshot: BackupSnapshot | null
  totalSnapshots: number
  isLoadingSnapshots: boolean
  snapshotError: string | null
  
  // Designated machine status
  isThisDesignated: boolean
  isDesignatedOnline: boolean
  
  // Legacy compatibility - overall loading state
  isLoading: boolean
  isRefreshing: boolean
  
  // Actions
  refresh: () => Promise<void>
  refreshSnapshots: () => Promise<void>
}

/**
 * Hook to manage backup status loading and polling
 * 
 * Loads in two phases for better UX:
 * 1. Config loads first (fast ~100ms) - page renders immediately
 * 2. Snapshots load in background (slow ~30s) - history section updates when ready
 */
export function useBackupStatus(
  orgId: string | undefined,
  addToast: (type: 'success' | 'error' | 'info', message: string, duration?: number) => void
): UseBackupStatusReturn {
  // Phase 1: Config state (fast)
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  
  // Phase 2: Snapshots state (slow)
  const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([])
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  
  // Designated machine status
  const [isThisDesignated, setIsThisDesignated] = useState(false)
  const [isDesignatedOnline, setIsDesignatedOnline] = useState(false)
  
  // Refreshing state
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Derived state
  const isConfigured = !!(config?.bucket && config?.access_key_encrypted && config?.restic_password_encrypted)
  const lastSnapshot = snapshots[0] || null
  const totalSnapshots = snapshots.length

  // Load config only (fast)
  const loadConfig = useCallback(async () => {
    if (!orgId) return null
    
    try {
      const newConfig = await getBackupConfig(orgId)
      setConfig(newConfig)
      return newConfig
    } catch (err) {
      log.error('[Backup]', 'Failed to load backup config', { error: err })
      return null
    }
  }, [orgId])

  // Load snapshots only (slow)
  const loadSnapshots = useCallback(async (backupConfig: BackupConfig) => {
    if (!backupConfig?.bucket || !backupConfig?.access_key_encrypted || !backupConfig?.restic_password_encrypted) {
      return
    }
    
    setIsLoadingSnapshots(true)
    setSnapshotError(null)
    
    try {
      const newSnapshots = await listSnapshots(backupConfig)
      // Sort by time descending
      newSnapshots.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      setSnapshots(newSnapshots)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error('[Backup]', 'Failed to load snapshots', { error: errorMsg })
      setSnapshotError(errorMsg)
    } finally {
      setIsLoadingSnapshots(false)
    }
  }, [])

  // Initial load - config first, then snapshots
  useEffect(() => {
    if (!orgId) {
      setIsLoadingConfig(false)
      return
    }
    
    setIsLoadingConfig(true)
    
    loadConfig().then((loadedConfig) => {
      setIsLoadingConfig(false)
      
      // Start loading snapshots in background if configured
      if (loadedConfig?.bucket && loadedConfig?.access_key_encrypted && loadedConfig?.restic_password_encrypted) {
        loadSnapshots(loadedConfig)
      }
    })
  }, [orgId, loadConfig, loadSnapshots])

  // Check designated machine status when config changes
  useEffect(() => {
    if (config) {
      isThisDesignatedMachine(config).then(setIsThisDesignated)
      setIsDesignatedOnline(isDesignatedMachineOnline(config))
    }
  }, [config])

  // Refresh snapshots periodically (every 60 seconds instead of 15 since it's slow)
  useEffect(() => {
    if (!orgId || !config || !isConfigured) return
    
    const interval = setInterval(() => {
      loadSnapshots(config)
    }, 60000) // Every 60 seconds for slow operation
    
    return () => clearInterval(interval)
  }, [orgId, config, isConfigured, loadSnapshots])

  // Manual refresh - refreshes both config and snapshots
  const refresh = useCallback(async () => {
    if (!orgId) return
    setIsRefreshing(true)
    
    try {
      const newConfig = await loadConfig()
      if (newConfig?.bucket && newConfig?.access_key_encrypted && newConfig?.restic_password_encrypted) {
        await loadSnapshots(newConfig)
      }
      addToast('success', 'Backup status refreshed')
    } catch (_err) {
      addToast('error', 'Failed to refresh backup status')
    } finally {
      setIsRefreshing(false)
    }
  }, [orgId, loadConfig, loadSnapshots, addToast])

  // Refresh snapshots only (faster for just updating history)
  const refreshSnapshots = useCallback(async () => {
    if (!config || !isConfigured) return
    await loadSnapshots(config)
  }, [config, isConfigured, loadSnapshots])

  return {
    // Config
    config,
    isConfigured,
    isLoadingConfig,
    
    // Snapshots
    snapshots,
    lastSnapshot,
    totalSnapshots,
    isLoadingSnapshots,
    snapshotError,
    
    // Designated machine
    isThisDesignated,
    isDesignatedOnline,
    
    // Legacy compatibility
    isLoading: isLoadingConfig, // Main loading is just config now
    isRefreshing,
    
    // Actions
    refresh,
    refreshSnapshots
  }
}
