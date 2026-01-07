/**
 * useSolidWorksStatus - Consolidated SolidWorks Service Status Hook
 * 
 * This hook provides a single source of truth for SolidWorks service status
 * polling across the application. It consolidates the duplicate polling that
 * previously existed in both useIntegrationStatus and SolidWorksSettings.
 * 
 * Features:
 * - 15-second polling interval (reduced from 5s to reduce service load)
 * - Pause/resume API for batch operations to prevent status check interference
 * - Handles 'busy' flag from main process - doesn't mark service as offline when busy
 * - Automatic polling pause when batch SW operations are running
 * 
 * @example
 * ```tsx
 * const { status, pausePolling, resumePolling, refreshStatus } = useSolidWorksStatus()
 * 
 * // For batch operations:
 * pausePolling()
 * await performBatchOperation()
 * resumePolling()
 * ```
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { usePDMStore } from '@/stores/pdmStore'

/**
 * Polling interval for SolidWorks status checks (15 seconds)
 * Increased from 5s to reduce service load during normal operations
 */
const POLLING_INTERVAL_MS = 15000

/**
 * Extended status response from main process
 */
export interface SolidWorksServiceStatus {
  running: boolean
  busy?: boolean
  version?: string
  swInstalled?: boolean
  dmApiAvailable?: boolean
  dmApiError?: string | null
  queueDepth?: number
  error?: string
}

/**
 * Return type for useSolidWorksStatus hook
 */
export interface UseSolidWorksStatusReturn {
  /** Current service status */
  status: SolidWorksServiceStatus
  /** Whether status polling is currently active */
  isPolling: boolean
  /** Whether the hook is currently checking status */
  isChecking: boolean
  /** Pause status polling (call before batch operations) */
  pausePolling: () => void
  /** Resume status polling (call after batch operations) */
  resumePolling: () => void
  /** Manually trigger a status refresh */
  refreshStatus: () => Promise<void>
}

/**
 * Consolidated SolidWorks service status hook
 * 
 * Provides a single source of truth for SW service status with:
 * - 15s polling interval
 * - Pause/resume API for batch operations
 * - Busy state handling
 */
export function useSolidWorksStatus(): UseSolidWorksStatusReturn {
  // Local state for status
  const [status, setStatus] = useState<SolidWorksServiceStatus>({ running: false })
  const [isPolling, setIsPolling] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  
  // Refs for interval management
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPausedRef = useRef(false)
  
  // Get store state
  const isBatchSWOperationRunning = usePDMStore(state => state.isBatchSWOperationRunning)
  const solidworksIntegrationEnabled = usePDMStore(state => state.solidworksIntegrationEnabled)
  const organization = usePDMStore(state => state.organization)
  const solidworksAutoStartInProgress = usePDMStore(state => state.solidworksAutoStartInProgress)
  
  // Store actions
  const setIntegrationStatus = usePDMStore.getState().setIntegrationStatus

  /**
   * Check the SolidWorks service status
   */
  const checkStatus = useCallback(async () => {
    // Skip if paused, batch operation running, or auto-start in progress
    if (isPausedRef.current || isBatchSWOperationRunning || solidworksAutoStartInProgress) {
      console.log('[SWStatus] Skipping check - paused:', isPausedRef.current, 
        'batch:', isBatchSWOperationRunning, 'autoStart:', solidworksAutoStartInProgress)
      return
    }
    
    // Skip if integration is disabled
    if (!solidworksIntegrationEnabled) {
      setStatus({ running: false })
      setIntegrationStatus('solidworks', 'not-configured')
      return
    }
    
    setIsChecking(true)
    
    try {
      const result = await window.electronAPI?.solidworks?.getServiceStatus()
      
      if (result?.success && result.data) {
        // The API response uses different field names, handle both old and new formats
        const apiData = result.data as {
          running?: boolean
          busy?: boolean
          version?: string
          installed?: boolean
          swInstalled?: boolean
          documentManagerAvailable?: boolean
          fastModeEnabled?: boolean
          dmApiAvailable?: boolean
          documentManagerError?: string | null
          dmApiError?: string | null
          queueDepth?: number
          referenceRecoveryNeeded?: boolean
          message?: string
        }
        
        // Handle reference recovery needed - process alive but IPC connection lost
        if (apiData.referenceRecoveryNeeded) {
          console.log('[SWStatus] Service reference lost but process alive - recommending restart')
          setStatus(prev => ({
            ...prev,
            running: true,
            busy: true,
            queueDepth: apiData.queueDepth,
            error: apiData.message || 'Service connection lost - restart recommended'
          }))
          // Mark as partial since we can't communicate reliably
          setIntegrationStatus('solidworks', 'partial', 'Service restart recommended')
          return
        }
        
        // Handle busy state - service is alive but processing
        if (apiData.busy) {
          console.log('[SWStatus] Service is busy, queue depth:', apiData.queueDepth)
          setStatus(prev => ({
            ...prev,
            running: true,
            busy: true,
            queueDepth: apiData.queueDepth,
            error: undefined
          }))
          // Don't update integration status when busy - keep current state
          return
        }
        
        // Normalize field names from API response
        const swInstalled = apiData.installed ?? apiData.swInstalled
        const dmApiAvailable = apiData.documentManagerAvailable ?? apiData.fastModeEnabled ?? apiData.dmApiAvailable
        const dmApiError = apiData.documentManagerError ?? apiData.dmApiError
        
        const newStatus: SolidWorksServiceStatus = {
          running: apiData.running ?? false,
          version: apiData.version,
          swInstalled,
          dmApiAvailable,
          dmApiError,
          queueDepth: apiData.queueDepth,
          busy: false,
          error: undefined
        }
        setStatus(newStatus)
        
        // Update integration slice status
        if (apiData.running) {
          if (dmApiAvailable) {
            setIntegrationStatus('solidworks', swInstalled ? 'online' : 'partial')
          } else {
            setIntegrationStatus('solidworks', 'offline')
          }
        } else {
          const isConfigured = organization?.settings?.solidworks_dm_license_key
          setIntegrationStatus('solidworks', isConfigured ? 'offline' : 'not-configured')
        }
      } else if (result?.error) {
        setStatus(prev => ({ ...prev, running: false, busy: false, error: result.error }))
        setIntegrationStatus('solidworks', 'offline', result.error)
      }
    } catch (err) {
      console.warn('[SWStatus] Error checking status:', err)
      setStatus(prev => ({ ...prev, running: false, busy: false, error: String(err) }))
      setIntegrationStatus('solidworks', 'offline', String(err))
    } finally {
      setIsChecking(false)
    }
  }, [isBatchSWOperationRunning, solidworksIntegrationEnabled, solidworksAutoStartInProgress, organization, setIntegrationStatus])

  /**
   * Pause status polling - call before batch operations
   */
  const pausePolling = useCallback(() => {
    console.log('[SWStatus] Polling paused')
    isPausedRef.current = true
    setIsPolling(false)
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  /**
   * Resume status polling - call after batch operations
   */
  const resumePolling = useCallback(() => {
    console.log('[SWStatus] Polling resumed')
    isPausedRef.current = false
    setIsPolling(true)
    // Immediately check status then start polling
    checkStatus()
  }, [checkStatus])

  /**
   * Manually refresh status (exposed for UI refresh buttons)
   */
  const refreshStatus = useCallback(async () => {
    // Allow manual refresh even when paused
    const wasPaused = isPausedRef.current
    isPausedRef.current = false
    await checkStatus()
    isPausedRef.current = wasPaused
  }, [checkStatus])

  // Set up polling interval
  useEffect(() => {
    // Skip if paused or batch operation running
    if (isPausedRef.current || isBatchSWOperationRunning) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }
    
    // Skip if integration disabled
    if (!solidworksIntegrationEnabled) {
      return
    }
    
    // Initial check
    checkStatus()
    
    // Set up polling
    pollIntervalRef.current = setInterval(() => {
      if (!isPausedRef.current && !isBatchSWOperationRunning) {
        checkStatus()
      }
    }, POLLING_INTERVAL_MS)
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [checkStatus, solidworksIntegrationEnabled, isBatchSWOperationRunning])

  // Auto-pause when batch operation starts
  useEffect(() => {
    if (isBatchSWOperationRunning && !isPausedRef.current) {
      console.log('[SWStatus] Auto-pausing due to batch operation')
      pausePolling()
    } else if (!isBatchSWOperationRunning && !isPolling && !isPausedRef.current) {
      console.log('[SWStatus] Auto-resuming after batch operation')
      resumePolling()
    }
  }, [isBatchSWOperationRunning, isPolling, pausePolling, resumePolling])

  return {
    status,
    isPolling,
    isChecking,
    pausePolling,
    resumePolling,
    refreshStatus
  }
}
