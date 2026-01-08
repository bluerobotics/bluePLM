/**
 * useExtensions - React hook for extension system state and IPC events
 * 
 * Provides:
 * - Access to extension slice state
 * - Automatic IPC event subscription
 * - Computed values for common queries
 */
import { useEffect, useCallback } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import type {
  InstalledExtension,
  StoreExtensionListing,
  ExtensionUpdateAvailable,
  ExtensionInstallProgress,
  ExtensionLifecycleState,
} from '@/stores/types'

interface UseExtensionsReturn {
  // State
  installedExtensions: Record<string, InstalledExtension>
  storeExtensions: StoreExtensionListing[]
  availableUpdates: ExtensionUpdateAvailable[]
  storeLoading: boolean
  checkingUpdates: boolean
  installProgress: ExtensionInstallProgress | null
  
  // Computed
  installedCount: number
  activeCount: number
  updatesCount: number
  
  // Helpers
  getExtension: (extensionId: string) => InstalledExtension | undefined
  isInstalled: (extensionId: string) => boolean
  hasUpdate: (extensionId: string) => boolean
  getState: (extensionId: string) => ExtensionLifecycleState | undefined
}

/**
 * Hook for accessing extension system state with automatic IPC event subscription.
 * 
 * @example
 * ```tsx
 * function ExtensionsBadge() {
 *   const { updatesCount, activeCount } = useExtensions()
 *   return <Badge>{updatesCount} updates, {activeCount} active</Badge>
 * }
 * ```
 */
export function useExtensions(): UseExtensionsReturn {
  // Get state from store
  const installedExtensions = usePDMStore(s => s.installedExtensions)
  const storeExtensions = usePDMStore(s => s.storeExtensions)
  const availableUpdates = usePDMStore(s => s.availableUpdates)
  const storeLoading = usePDMStore(s => s.storeLoading)
  const checkingUpdates = usePDMStore(s => s.checkingUpdates)
  const installProgress = usePDMStore(s => s.installProgress)
  const extensionStates = usePDMStore(s => s.extensionStates)
  
  // Get actions
  const handleExtensionStateChange = usePDMStore(s => s.handleExtensionStateChange)
  const setInstallProgress = usePDMStore(s => s.setInstallProgress)
  const setAvailableUpdates = usePDMStore(s => s.setAvailableUpdates)
  const loadInstalledExtensions = usePDMStore(s => s.loadInstalledExtensions)
  const addToast = usePDMStore(s => s.addToast)
  
  // Subscribe to IPC events
  useEffect(() => {
    const api = window.electronAPI?.extensions
    if (!api) return
    
    // State change events
    const unsubStateChange = api.onStateChange((event) => {
      handleExtensionStateChange(event.extensionId, event.state, event.error)
      
      // Show toast for significant state changes
      if (event.state === 'active' && event.previousState === 'loading') {
        const ext = installedExtensions[event.extensionId]
        addToast('info', `${ext?.manifest.name || event.extensionId} activated`)
      } else if (event.state === 'error') {
        addToast('error', `Extension error: ${event.error || 'Unknown error'}`)
      }
    })
    
    // Install progress events
    const unsubInstallProgress = api.onInstallProgress((event) => {
      setInstallProgress(event)
      
      if (event.phase === 'complete') {
        // Clear progress after a delay
        setTimeout(() => setInstallProgress(null), 1000)
        loadInstalledExtensions()
      } else if (event.phase === 'error') {
        setTimeout(() => setInstallProgress(null), 3000)
      }
    })
    
    // Update available events
    const unsubUpdateAvailable = api.onUpdateAvailable((updates) => {
      setAvailableUpdates(updates)
      if (updates.length > 0) {
        addToast('info', `${updates.length} extension update${updates.length > 1 ? 's' : ''} available`)
      }
    })
    
    // Violation events (watchdog)
    const unsubViolation = api.onViolation((event) => {
      const ext = installedExtensions[event.violation.extensionId]
      const name = ext?.manifest.name || event.violation.extensionId
      
      if (event.killed) {
        addToast('warning', `${name} was terminated: ${event.violation.type.replace('_', ' ')}`)
      }
    })
    
    return () => {
      unsubStateChange()
      unsubInstallProgress()
      unsubUpdateAvailable()
      unsubViolation()
    }
  }, [handleExtensionStateChange, setInstallProgress, setAvailableUpdates, loadInstalledExtensions, addToast, installedExtensions])
  
  // Computed values
  const installedCount = Object.keys(installedExtensions).length
  const activeCount = Object.values(installedExtensions).filter(e => e.state === 'active').length
  const updatesCount = availableUpdates.length
  
  // Helper functions
  const getExtension = useCallback(
    (extensionId: string) => installedExtensions[extensionId],
    [installedExtensions]
  )
  
  const isInstalled = useCallback(
    (extensionId: string) => extensionId in installedExtensions,
    [installedExtensions]
  )
  
  const hasUpdate = useCallback(
    (extensionId: string) => availableUpdates.some(u => u.extensionId === extensionId),
    [availableUpdates]
  )
  
  const getState = useCallback(
    (extensionId: string) => extensionStates[extensionId],
    [extensionStates]
  )
  
  return {
    // State
    installedExtensions,
    storeExtensions,
    availableUpdates,
    storeLoading,
    checkingUpdates,
    installProgress,
    
    // Computed
    installedCount,
    activeCount,
    updatesCount,
    
    // Helpers
    getExtension,
    isInstalled,
    hasUpdate,
    getState,
  }
}

/**
 * Hook for subscribing to a single extension's state.
 * 
 * @example
 * ```tsx
 * function ExtensionStatus({ id }: { id: string }) {
 *   const { extension, state, hasUpdate } = useExtension(id)
 *   return <span>{state} {hasUpdate && '(update available)'}</span>
 * }
 * ```
 */
export function useExtension(extensionId: string) {
  const extension = usePDMStore(s => s.installedExtensions[extensionId])
  const state = usePDMStore(s => s.extensionStates[extensionId])
  const storeExtension = usePDMStore(s => 
    s.storeExtensions.find(e => e.extensionId === extensionId)
  )
  const update = usePDMStore(s => 
    s.availableUpdates.find(u => u.extensionId === extensionId)
  )
  
  const isInstalled = !!extension
  const hasUpdate = !!update
  const isActive = state === 'active'
  const isDisabled = state === 'disabled'
  const hasError = state === 'error'
  
  return {
    extension,
    storeExtension,
    update,
    state,
    isInstalled,
    hasUpdate,
    isActive,
    isDisabled,
    hasError,
  }
}
