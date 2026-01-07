import { useEffect, useRef, useCallback } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { getBackupStatus } from '@/lib/backup'
import type { IntegrationId } from '@/stores/types'

// Polling interval for status checks (5 seconds)
const POLLING_INTERVAL_MS = 5000

// Initial delay before first check (wait for organization to settle)
const INITIAL_DELAY_MS = 500

/**
 * Orchestration hook for integration status checks
 * 
 * This hook handles the lifecycle of status checks:
 * - Waits for organization to load before checking
 * - Triggers initial status checks
 * - Sets up polling interval (5s) for ongoing checks
 * - Handles offline/online transitions
 * 
 * The actual status checking logic is delegated to the IntegrationsSlice
 * in the store. This hook only orchestrates WHEN checks happen.
 */
export function useIntegrationStatus() {
  // Track if we've done initial check
  const hasInitialCheckRef = useRef(false)
  const isOnlineRef = useRef(navigator.onLine)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Subscribe to relevant store values
  const organization = usePDMStore(state => state.organization)
  const solidworksIntegrationEnabled = usePDMStore(state => state.solidworksIntegrationEnabled)
  const solidworksPath = usePDMStore(state => state.solidworksPath)
  const isOfflineMode = usePDMStore(state => state.isOfflineMode)
  
  // Get store actions (static references)
  const setIntegrationStatus = usePDMStore.getState().setIntegrationStatus
  const setBackupStatus = usePDMStore.getState().setBackupStatus
  const resetIntegrationStatuses = usePDMStore.getState().resetIntegrationStatuses

  // Check backup status (backup is separate from integrations slice)
  const checkBackup = useCallback(async () => {
    const currentOrg = usePDMStore.getState().organization
    
    if (!currentOrg?.id) {
      setBackupStatus('not-configured')
      return
    }
    
    try {
      const status = await getBackupStatus(currentOrg.id)
      
      if (!status.isConfigured) {
        setBackupStatus('partial')
      } else if (status.error) {
        setBackupStatus('offline')
      } else if (status.snapshots.length > 0) {
        setBackupStatus('online')
      } else {
        setBackupStatus('partial')
      }
    } catch (err) {
      console.warn('[IntegrationStatus] Failed to check backup status:', err)
      setBackupStatus('not-configured')
    }
  }, [setBackupStatus])

  // Main check function - delegates to slice for integration checks
  const checkAllIntegrations = useCallback(async () => {
    const currentOrg = usePDMStore.getState().organization
    
    // Don't check if organization isn't loaded yet
    if (!currentOrg?.id) {
      console.log('[IntegrationStatus] Organization not loaded, skipping check')
      return
    }
    
    // Don't check in offline mode
    if (usePDMStore.getState().isOfflineMode) {
      console.log('[IntegrationStatus] Offline mode, skipping check')
      return
    }
    
    console.log('[IntegrationStatus] Starting integration status checks...')
    
    // Delegate to slice for all integration checks
    await usePDMStore.getState().checkAllIntegrations()
    
    // Check backup separately (not in integrations slice)
    checkBackup()
    
    console.log('[IntegrationStatus] All checks complete')
  }, [checkBackup])

  // Handle online/offline transitions
  useEffect(() => {
    const handleOnline = () => {
      console.log('[IntegrationStatus] Network came online, triggering check')
      isOnlineRef.current = true
      checkAllIntegrations()
    }
    
    const handleOffline = () => {
      console.log('[IntegrationStatus] Network went offline')
      isOnlineRef.current = false
      // Mark all network-dependent integrations as offline
      const offlineIntegrations: IntegrationId[] = ['supabase', 'google-drive', 'api', 'odoo']
      offlineIntegrations.forEach(id => {
        setIntegrationStatus(id, 'offline', 'No network connection')
      })
    }
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [checkAllIntegrations, setIntegrationStatus])

  // Initial check when organization loads
  useEffect(() => {
    // Wait for organization to be loaded
    if (!organization?.id) {
      console.log('[IntegrationStatus] Waiting for organization to load...')
      return
    }
    
    // Skip if in offline mode
    if (isOfflineMode) {
      console.log('[IntegrationStatus] App in offline mode, skipping checks')
      return
    }
    
    // Only run initial check once per organization
    if (hasInitialCheckRef.current) {
      // Organization changed - run check again
      console.log('[IntegrationStatus] Organization changed, re-checking...')
    }
    
    hasInitialCheckRef.current = true
    
    // Delay initial check slightly to let other initialization complete
    const initialTimeout = setTimeout(() => {
      console.log('[IntegrationStatus] Running initial check for org:', organization.id)
      checkAllIntegrations()
    }, INITIAL_DELAY_MS)
    
    return () => {
      clearTimeout(initialTimeout)
    }
  }, [organization?.id, isOfflineMode, checkAllIntegrations])

  // Set up polling interval
  useEffect(() => {
    // Only poll if organization is loaded and we're online
    if (!organization?.id || isOfflineMode) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }
    
    // Set up polling
    pollIntervalRef.current = setInterval(() => {
      // Only poll if browser is online
      if (navigator.onLine) {
        checkAllIntegrations()
      }
    }, POLLING_INTERVAL_MS)
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [organization?.id, isOfflineMode, checkAllIntegrations])

  // Re-check SolidWorks when relevant settings change
  useEffect(() => {
    // Only re-check if we've already done initial check
    if (!hasInitialCheckRef.current || !organization?.id) {
      return
    }
    
    console.log('[IntegrationStatus] Settings changed, re-checking SolidWorks status')
    // Delegate to slice's individual check
    usePDMStore.getState().checkIntegration('solidworks')
  }, [solidworksIntegrationEnabled, solidworksPath, organization?.id])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  // Return function to manually trigger a check
  return {
    checkAllIntegrations,
    resetIntegrationStatuses
  }
}
