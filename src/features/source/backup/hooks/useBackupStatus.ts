import { useState, useEffect, useCallback } from 'react'
import { log } from '@/lib/logger'
import {
  getBackupConfig,
  listSnapshots,
  isThisDesignatedMachine,
  isDesignatedMachineOnline,
  getBackoffRemaining,
  getSnapshotCacheAge,
  hasCachedSnapshots,
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
  
  // Rate limiting status
  isBackoffActive: boolean
  backoffRemainingSeconds: number
  cacheAgeSeconds: number | null
  isUsingCachedData: boolean
  
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
  
  // Rate limiting state
  const [backoffRemainingSeconds, setBackoffRemainingSeconds] = useState(0)
  const [cacheAgeSeconds, setCacheAgeSeconds] = useState<number | null>(null)
  
  // Designated machine status
  const [isThisDesignated, setIsThisDesignated] = useState(false)
  const [isDesignatedOnline, setIsDesignatedOnline] = useState(false)
  
  // Refreshing state
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Derived state
  const isConfigured = !!(config?.bucket && config?.access_key_encrypted && config?.restic_password_encrypted)
  const lastSnapshot = snapshots[0] || null
  const totalSnapshots = snapshots.length
  const isBackoffActive = backoffRemainingSeconds > 0
  const isUsingCachedData = hasCachedSnapshots() && (isBackoffActive || (cacheAgeSeconds !== null && cacheAgeSeconds > 0))

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

  // Update backoff and cache age state
  const updateRateLimitState = useCallback(() => {
    setBackoffRemainingSeconds(getBackoffRemaining())
    setCacheAgeSeconds(getSnapshotCacheAge())
  }, [])

  // Load snapshots only (slow)
  const loadSnapshots = useCallback(async (backupConfig: BackupConfig, forceRefresh = false) => {
    if (!backupConfig?.bucket || !backupConfig?.access_key_encrypted || !backupConfig?.restic_password_encrypted) {
      return
    }
    
    // Check if we're in backoff and not forcing refresh
    const currentBackoff = getBackoffRemaining()
    if (!forceRefresh && currentBackoff > 0) {
      log.debug('[Backup]', `Skipping snapshot fetch - in backoff for ${currentBackoff}s`)
      updateRateLimitState()
      return
    }
    
    setIsLoadingSnapshots(true)
    setSnapshotError(null)
    
    try {
      const newSnapshots = await listSnapshots(backupConfig, { forceRefresh })
      // Sort by time descending
      newSnapshots.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      setSnapshots(newSnapshots)
      
      // Update rate limit state after fetch
      updateRateLimitState()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error('[Backup]', 'Failed to load snapshots', { error: errorMsg })
      setSnapshotError(errorMsg)
      updateRateLimitState()
    } finally {
      setIsLoadingSnapshots(false)
    }
  }, [updateRateLimitState])

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

  // Update backoff countdown every second when active
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getBackoffRemaining()
      if (remaining !== backoffRemainingSeconds) {
        setBackoffRemainingSeconds(remaining)
      }
      const cacheAge = getSnapshotCacheAge()
      if (cacheAge !== cacheAgeSeconds) {
        setCacheAgeSeconds(cacheAge)
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [backoffRemainingSeconds, cacheAgeSeconds])

  // Refresh snapshots periodically (every 60 seconds instead of 15 since it's slow)
  // Skip polling if we're in backoff period or had an error
  useEffect(() => {
    if (!orgId || !config || !isConfigured) return
    
    const interval = setInterval(() => {
      // Skip polling if in backoff or if there was an error
      if (getBackoffRemaining() > 0) {
        log.debug('[Backup]', 'Skipping periodic refresh - in backoff period')
        return
      }
      if (snapshotError) {
        log.debug('[Backup]', 'Skipping periodic refresh - previous error')
        return
      }
      loadSnapshots(config)
    }, 60000) // Every 60 seconds for slow operation
    
    return () => clearInterval(interval)
  }, [orgId, config, isConfigured, loadSnapshots, snapshotError])

  // Manual refresh - refreshes both config and snapshots
  const refresh = useCallback(async () => {
    if (!orgId) return
    
    // Check if we're in backoff period
    const backoffRemaining = getBackoffRemaining()
    if (backoffRemaining > 0) {
      addToast('info', `Rate limited. Try again in ${backoffRemaining} seconds.`, 3000)
      return
    }
    
    setIsRefreshing(true)
    
    try {
      const newConfig = await loadConfig()
      if (newConfig?.bucket && newConfig?.access_key_encrypted && newConfig?.restic_password_encrypted) {
        await loadSnapshots(newConfig, true) // Force refresh
      }
      addToast('success', 'Backup status refreshed')
    } catch (_err) {
      addToast('error', 'Failed to refresh backup status')
    } finally {
      setIsRefreshing(false)
      updateRateLimitState()
    }
  }, [orgId, loadConfig, loadSnapshots, addToast, updateRateLimitState])

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
    
    // Rate limiting status
    isBackoffActive,
    backoffRemainingSeconds,
    cacheAgeSeconds,
    isUsingCachedData,
    
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
