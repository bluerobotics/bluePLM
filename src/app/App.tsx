import { useEffect, useRef } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { log } from '@/lib/logger'
import { recordMetric } from '@/lib/performanceMetrics'
import { SetupScreen } from '@/components/shared/Screens'
import { OnboardingScreen } from '@/components/shared/Screens'
import { SplashScreen } from '@/components/core'
import { PerformanceWindow } from '@/features/dev-tools/performance'
import { TabWindow, isTabWindowMode, parseTabWindowParams } from '@/components/layout'
import { AppShell } from '@/components/layout'
import { executeTerminalCommand } from '@/lib/commands/parser'
import { logUserAction } from '@/lib/userActionLogger'
import { checkSchemaCompatibility } from '@/lib/schemaVersion'
import { getAccessibleVaults, syncFolder, deleteFolderByPath } from '@/lib/supabase'
import {
  useTheme,
  useLanguage,
  useRealtimeSubscriptions,
  useSessionHeartbeat,
  useBackupHeartbeat,
  useSolidWorksAutoStart,
  useAutoUpdater,
  useKeyboardShortcuts,
  useLoadFiles,
  useAuth,
  useAutoDownload,
  useVaultManagement,
  useIntegrationStatus,
  useAppStartup,
  useDeepLinkInstall,
} from '@/hooks'

// Check if we're in performance mode (pop-out window)
function isPerformanceMode(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('mode') === 'performance'
}

function App() {
  // Check for performance mode (pop-out window) early
  // Render standalone performance window if in that mode
  if (isPerformanceMode()) {
    return <PerformanceWindow />
  }
  
  // Check for tab window mode (popped out tab)
  if (isTabWindowMode()) {
    const tabParams = parseTabWindowParams()
    if (tabParams) {
      return <TabWindow view={tabParams.view} title={tabParams.title} customData={tabParams.customData} />
    }
  }
  
  // Apply theme and language
  useTheme()
  useLanguage()
  
  // App startup orchestration - manages splash screen and initialization
  const startup = useAppStartup()
  
  // Log app startup
  useEffect(() => {
    logUserAction('navigation', 'App started', {
      platform: navigator.platform,
      userAgent: navigator.userAgent.split(' ').slice(-1)[0] // Last part is Chrome version
    })
  }, [])
  
  // Get onboarding state
  const onboardingComplete = usePDMStore(s => s.onboardingComplete)
  
  // Auth hook - handles authentication state and Supabase initialization
  const { supabaseReady, handleSupabaseConfigured, handleChangeOrg } = useAuth()
  
  // Vault management hook - now gets setSettingsTab from store internally
  const {
    handleOpenVault,
    lastLoadKey,
  } = useVaultManagement()
  
  // Load files hook
  const { loadFiles } = useLoadFiles()
  
  // Auto-download trigger hook
  useAutoDownload()
  
  // Get store values needed for effects and computed values
  const {
    user,
    organization,
    isOfflineMode,
    vaultPath,
    isVaultConnected,
    connectedVaults,
    activeVaultId,
    statusMessage,
    toggleSidebar,
    toggleDetailsPanel,
    setApiServerUrl,
    apiServerUrl,
    addToast,
    setIsLoading,
    setStatusMessage,
    setVaultPath,
    setVaultConnected,
    getEffectiveRole,
  } = usePDMStore()
  
  // Get current vault ID (from activeVaultId or first connected vault)
  const currentVaultId = activeVaultId || connectedVaults[0]?.id
  
  
  // Existing extracted hooks
  useRealtimeSubscriptions(organization, isOfflineMode)
  useSessionHeartbeat(user, organization)
  useBackupHeartbeat(organization?.id)
  useSolidWorksAutoStart(organization)
  useAutoUpdater()
  useKeyboardShortcuts({ onOpenVault: handleOpenVault, onRefresh: loadFiles })
  
  // Deep link handling - listens for blueplm:// protocol links
  useDeepLinkInstall()
  
  // Integration status orchestration hook - handles status checks lifecycle
  useIntegrationStatus()

  // Sync API URL from organization settings to store (which handles localStorage persistence)
  useEffect(() => {
    const orgApiUrl = organization?.settings?.api_url || null
    const currentApiUrl = apiServerUrl || null
    
    if (orgApiUrl !== currentApiUrl) {
      log.debug('[App]', 'Syncing API URL from org settings to store', { url: orgApiUrl || '(cleared)' })
      setApiServerUrl(orgApiUrl)
    }
  }, [organization?.settings?.api_url, apiServerUrl, setApiServerUrl])

  // Load color swatches when user and organization are available
  useEffect(() => {
    if (user && organization) {
      const { syncColorSwatches } = usePDMStore.getState()
      syncColorSwatches().catch(err => {
        log.warn('[ColorSwatches]', 'Failed to sync', { error: err })
      })
    }
  }, [user?.id, organization?.id])

  // Check if admin has force-pushed module config since last sync
  useEffect(() => {
    if (!organization?.module_defaults_forced_at) return
    
    const { moduleConfigLastSyncedAt, loadOrgModuleDefaults, addToast: storeAddToast } = usePDMStore.getState()
    const forcedAt = new Date(organization.module_defaults_forced_at).getTime()
    const lastSynced = moduleConfigLastSyncedAt || 0
    
    if (forcedAt > lastSynced) {
      // Admin pushed new config since last sync - apply it
      log.info('[App]', 'Force-applying org module config', { forcedAt, lastSynced })
      loadOrgModuleDefaults().then(() => {
        storeAddToast('info', 'Sidebar configuration updated by admin')
      })
    }
  }, [organization?.module_defaults_forced_at])

  // Validate connected vault IDs after organization loads
  useEffect(() => {
    const validateVaults = async () => {
      if (!organization || !user || connectedVaults.length === 0) return
      
      log.debug('[VaultValidation]', 'Checking connected vaults', { count: connectedVaults.length })
      
      try {
        const { vaults: serverVaults, error } = await getAccessibleVaults(
          user.id,
          organization.id,
          getEffectiveRole()
        )
        
        if (error) {
          log.error('[VaultValidation]', 'Failed to fetch accessible vaults', { error })
          return
        }
        
        const serverVaultIds = new Set((serverVaults || []).map((v) => v.id))
        log.debug('[VaultValidation]', 'User has access to vaults', { count: serverVaultIds.size })
        
        const staleVaults = connectedVaults.filter(cv => !serverVaultIds.has(cv.id))
        
        if (staleVaults.length > 0) {
          log.warn('[VaultValidation]', 'Found stale vault(s)', { count: staleVaults.length, vaults: staleVaults.map(v => v.name) })
          
          const store = usePDMStore.getState()
          staleVaults.forEach(v => {
            log.debug('[VaultValidation]', 'Removing stale vault', { name: v.name, id: v.id })
            store.removeConnectedVault(v.id)
          })
          
          if (staleVaults.some(v => v.id === currentVaultId) && serverVaults && serverVaults.length > 0) {
            const defaultVault = (serverVaults as any[]).find((v: any) => v.is_default) || serverVaults[0]
            log.info('[VaultValidation]', 'Active vault was stale, reconnecting', { vault: (defaultVault as any).name })
            setVaultConnected(false)
            setVaultPath(null)
          }
        } else {
          log.debug('[VaultValidation]', 'All connected vaults are valid')
        }
      } catch (err) {
        log.error('[VaultValidation]', 'Error validating vaults', { error: err })
      }
    }
    
    validateVaults()
  }, [organization, user?.id, connectedVaults, currentVaultId, setVaultConnected, setVaultPath, getEffectiveRole])

  // Track if we've already shown the schema warning this session
  const schemaCheckDoneRef = useRef(false)
  
  // Check schema compatibility after organization loads
  useEffect(() => {
    const checkSchema = async () => {
      if (!organization?.id || isOfflineMode || schemaCheckDoneRef.current) return
      
      schemaCheckDoneRef.current = true
      
      try {
        const result = await checkSchemaCompatibility()
        log.debug('[SchemaVersion]', 'Check result', { status: result.status })
        
        if (result.status === 'missing') {
          addToast('warning', `${result.message}: ${result.details}`, 15000)
        } else if (result.status === 'incompatible') {
          addToast('error', `${result.message}: ${result.details}`, 0)
        } else if (result.status === 'outdated') {
          if (result.dbVersion && result.dbVersion > result.expectedVersion) {
            addToast('info', `${result.message}. ${result.details}`, 10000)
          } else {
            addToast('warning', `${result.message}. ${result.details}`, 10000)
          }
        }
      } catch (err) {
        log.error('[SchemaVersion]', 'Error checking schema', { error: err })
      }
    }
    
    checkSchema()
  // Effect intentionally only depends on org/offline changes, not on every schema check
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, isOfflineMode])

  // CLI command listener - always active so CLI works even when terminal is hidden
  useEffect(() => {
    if (!window.electronAPI?.onCliCommand) return
    
    const unsubscribe = window.electronAPI.onCliCommand(async ({ requestId, command }) => {
      log.debug('[App]', 'Received CLI command', { command })
      
      try {
        const results = await executeTerminalCommand(command, loadFiles)
        
        if (results.length === 1 && results[0].content === '__CLEAR__') {
          window.electronAPI?.sendCliResponse(requestId, { 
            outputs: [{ type: 'info', content: 'Cleared' }] 
          })
        } else {
          window.electronAPI?.sendCliResponse(requestId, { 
            outputs: results.map(r => ({ type: r.type, content: r.content }))
          })
        }
      } catch (err) {
        window.electronAPI?.sendCliResponse(requestId, { 
          outputs: [{ type: 'error', content: `Error: ${err instanceof Error ? err.message : String(err)}` }] 
        })
      }
    })
    
    return () => unsubscribe()
  }, [loadFiles])

  // Menu event handlers
  useEffect(() => {
    if (!window.electronAPI) return

    const cleanup = window.electronAPI.onMenuEvent((event) => {
      switch (event) {
        case 'menu:set-working-dir':
          handleOpenVault()
          break
        case 'menu:toggle-sidebar':
          toggleSidebar()
          break
        case 'menu:toggle-details':
          toggleDetailsPanel()
          break
        case 'menu:refresh':
          loadFiles()
          break
      }
    })

    return cleanup
  }, [handleOpenVault, toggleSidebar, toggleDetailsPanel, loadFiles])

  // File change watcher - auto-refresh when files change externally
  // Enhanced suppression prevents redundant refreshes after downloads/get-latest operations
  useEffect(() => {
    if (!window.electronAPI || !vaultPath) return
    
    // Suppression window: ignore file watcher events for 3 seconds after an operation completes.
    // This handles the case where the watcher's debounce timer fires AFTER the operation clears
    // its processingOperations. The watcher would otherwise trigger a full filesystem rescan
    // even though the operation already applied incremental store updates.
    const SUPPRESSION_WINDOW_MS = 3000
    
    let refreshTimeout: NodeJS.Timeout | null = null
    
    const cleanup = window.electronAPI.onFilesChanged((changedFiles) => {
      const { 
        syncProgress, 
        processingOperations, 
        lastOperationCompletedAt, 
        expectedFileChanges 
      } = usePDMStore.getState()
      
      const now = Date.now()
      const msSinceLastOp = now - lastOperationCompletedAt
      const withinSuppressionWindow = msSinceLastOp < SUPPRESSION_WINDOW_MS
      
      // Enhanced state logging for diagnostics
      window.electronAPI?.log('info', '[FileWatcher] Event received', {
        changedCount: changedFiles.length,
        timestamp: now
      })
      recordMetric('FileWatcher', 'Event received', { changedCount: changedFiles.length })
      
      window.electronAPI?.log('info', '[FileWatcher] State check', {
        processingOpsCount: processingOperations.size,
        expectedChangesCount: expectedFileChanges.size,
        msSinceLastOp,
        withinSuppressionWindow,
        timestamp: now
      })
      recordMetric('FileWatcher', 'State check', { 
        processingOpsCount: processingOperations.size,
        expectedChangesCount: expectedFileChanges.size,
        msSinceLastOp,
        withinSuppressionWindow 
      })
      
      // Suppress if a sync operation is actively running
      if (syncProgress.isActive || processingOperations.size > 0) {
        window.electronAPI?.log('info', '[FileWatcher] Decision', {
          willTriggerRefresh: false,
          reason: 'operation_in_progress',
          timestamp: now
        })
        recordMetric('FileWatcher', 'Decision: suppressed', { 
          willTriggerRefresh: false, 
          reason: 'operation_in_progress' 
        })
        return
      }
      
      // Filter out expected file changes (files we downloaded/updated ourselves)
      const unexpectedChanges = changedFiles.filter(filePath => {
        // Normalize paths for comparison (handle Windows backslashes)
        const normalizedPath = filePath.replace(/\\/g, '/')
        return !expectedFileChanges.has(normalizedPath) && 
               !expectedFileChanges.has(filePath)
      })
      
      const unexpectedCount = unexpectedChanges.length
      
      log.debug('[FileWatcher]', 'Files changed', { 
        count: changedFiles.length,
        unexpectedCount,
        withinSuppressionWindow,
        expectedCount: expectedFileChanges.size
      })
      
      // If all changes were expected and we're within the suppression window, skip refresh
      if (unexpectedCount === 0 && withinSuppressionWindow) {
        window.electronAPI?.log('info', '[FileWatcher] Decision', {
          unexpectedCount,
          willTriggerRefresh: false,
          reason: 'all_expected_within_window',
          timestamp: now
        })
        recordMetric('FileWatcher', 'Decision: suppressed', { 
          willTriggerRefresh: false, 
          reason: 'all_expected_within_window' 
        })
        log.debug('[FileWatcher]', 'Suppressing refresh - all changes were expected')
        return
      }
      
      // If no unexpected changes, skip refresh (even outside suppression window)
      if (unexpectedCount === 0) {
        window.electronAPI?.log('info', '[FileWatcher] Decision', {
          unexpectedCount,
          willTriggerRefresh: false,
          reason: 'no_unexpected_changes',
          timestamp: now
        })
        recordMetric('FileWatcher', 'Decision: suppressed', { 
          willTriggerRefresh: false, 
          reason: 'no_unexpected_changes' 
        })
        log.debug('[FileWatcher]', 'Skipping refresh - no unexpected changes')
        return
      }
      
      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }
      
      refreshTimeout = setTimeout(() => {
        const currentState = usePDMStore.getState()
        if (currentState.syncProgress.isActive || currentState.processingOperations.size > 0) {
          window.electronAPI?.log('info', '[FileWatcher] Decision (after debounce)', {
            willTriggerRefresh: false,
            reason: 'operation_started_during_debounce',
            timestamp: Date.now()
          })
          recordMetric('FileWatcher', 'Decision (debounced): suppressed', { 
            willTriggerRefresh: false, 
            reason: 'operation_started_during_debounce' 
          })
          return
        }
        
        // Re-check suppression conditions after debounce
        const nowWithinWindow = Date.now() - currentState.lastOperationCompletedAt < SUPPRESSION_WINDOW_MS
        const stillExpected = unexpectedChanges.every(f => 
          currentState.expectedFileChanges.has(f.replace(/\\/g, '/')) ||
          currentState.expectedFileChanges.has(f)
        )
        
        if (stillExpected && nowWithinWindow) {
          window.electronAPI?.log('info', '[FileWatcher] Decision (after debounce)', {
            willTriggerRefresh: false,
            reason: 'now_expected_within_window',
            timestamp: Date.now()
          })
          recordMetric('FileWatcher', 'Decision (debounced): suppressed', { 
            willTriggerRefresh: false, 
            reason: 'now_expected_within_window' 
          })
          log.debug('[FileWatcher]', 'Suppressing refresh after debounce - changes now expected')
          refreshTimeout = null
          return
        }
        
        window.electronAPI?.log('info', '[FileWatcher] Decision (after debounce)', {
          unexpectedCount: unexpectedChanges.length,
          willTriggerRefresh: true,
          reason: 'unexpected_external_changes',
          timestamp: Date.now()
        })
        recordMetric('FileWatcher', 'Decision: triggered refresh', { 
          willTriggerRefresh: true, 
          unexpectedCount: unexpectedChanges.length,
          reason: 'unexpected_external_changes' 
        })
        log.debug('[FileWatcher]', 'Triggering loadFiles for unexpected external changes', {
          unexpectedCount: unexpectedChanges.length
        })
        loadFiles(true)
        
        // Auto-refresh metadata for SolidWorks files if setting is enabled
        const { autoRefreshMetadataOnSave, files } = usePDMStore.getState()
        if (autoRefreshMetadataOnSave) {
          const swExtensions = ['.sldprt', '.sldasm', '.slddrw']
          const changedSwFiles = unexpectedChanges.filter(filePath => {
            const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
            return swExtensions.includes(ext)
          })
          
          if (changedSwFiles.length > 0) {
            // Find LocalFile objects for the changed paths
            const swFilesToRefresh = files.filter(f => 
              changedSwFiles.some(changed => 
                f.relativePath === changed || f.relativePath.replace(/\\/g, '/') === changed
              )
            )
            
            if (swFilesToRefresh.length > 0) {
              window.electronAPI?.log('info', '[FileWatcher] Auto-refreshing metadata for SW files', {
                count: swFilesToRefresh.length
              })
              // Import and execute command - use dynamic import to avoid circular deps
              import('@/lib/commands').then(({ executeCommand }) => {
                executeCommand('refresh-local-metadata', { files: swFilesToRefresh })
              })
            }
          }
        }
        
        refreshTimeout = null
      }, 1000)
    })
    
    return cleanup
  }, [vaultPath, loadFiles])

  // Directory change watcher - sync folder changes from Windows Explorer to server
  useEffect(() => {
    if (!window.electronAPI || !vaultPath) return
    
    const { organization, activeVaultId, user, isOfflineMode } = usePDMStore.getState()
    
    // Skip if offline or missing required data
    if (isOfflineMode || !organization?.id || !activeVaultId || !user?.id) return
    
    const orgId = organization.id
    const vaultId = activeVaultId
    const userId = user.id
    
    // Handle directory added - sync to server
    const cleanupAdded = window.electronAPI.onDirectoryAdded(async (relativePath) => {
      // Check suppression window - don't sync folders we just created ourselves
      const { lastOperationCompletedAt, expectedFileChanges } = usePDMStore.getState()
      const msSinceLastOp = Date.now() - lastOperationCompletedAt
      const SUPPRESSION_WINDOW_MS = 3000
      
      // Check if this is an expected change (we created it ourselves)
      if (expectedFileChanges.has(relativePath) && msSinceLastOp < SUPPRESSION_WINDOW_MS) {
        window.electronAPI?.log('debug', '[DirectoryWatcher] Skipping sync for expected folder', { relativePath })
        return
      }
      
      window.electronAPI?.log('info', '[DirectoryWatcher] Syncing new folder to server', { relativePath })
      
      try {
        const result = await syncFolder(orgId, vaultId, userId, relativePath)
        if (result.error) {
          window.electronAPI?.log('warn', '[DirectoryWatcher] Failed to sync folder', { 
            relativePath, 
            error: result.error 
          })
        } else {
          window.electronAPI?.log('info', '[DirectoryWatcher] Folder synced to server', { 
            relativePath,
            folderId: result.folder?.id
          })
        }
      } catch (err) {
        window.electronAPI?.log('warn', '[DirectoryWatcher] Exception syncing folder', { 
          relativePath, 
          error: err instanceof Error ? err.message : String(err) 
        })
      }
    })
    
    // Handle directory removed - delete from server
    const cleanupRemoved = window.electronAPI.onDirectoryRemoved(async (relativePath) => {
      // Check suppression window - don't delete folders we just deleted ourselves
      const { lastOperationCompletedAt, expectedFileChanges } = usePDMStore.getState()
      const msSinceLastOp = Date.now() - lastOperationCompletedAt
      const SUPPRESSION_WINDOW_MS = 3000
      
      // Check if this is an expected change (we deleted it ourselves)
      if (expectedFileChanges.has(relativePath) && msSinceLastOp < SUPPRESSION_WINDOW_MS) {
        window.electronAPI?.log('debug', '[DirectoryWatcher] Skipping delete for expected folder', { relativePath })
        return
      }
      
      window.electronAPI?.log('info', '[DirectoryWatcher] Deleting folder from server', { relativePath })
      
      try {
        const result = await deleteFolderByPath(vaultId, relativePath, userId)
        if (result.error) {
          window.electronAPI?.log('warn', '[DirectoryWatcher] Failed to delete folder from server', { 
            relativePath, 
            error: result.error 
          })
        } else {
          window.electronAPI?.log('info', '[DirectoryWatcher] Folder deleted from server', { relativePath })
        }
      } catch (err) {
        window.electronAPI?.log('warn', '[DirectoryWatcher] Exception deleting folder', { 
          relativePath, 
          error: err instanceof Error ? err.message : String(err) 
        })
      }
    })
    
    return () => {
      cleanupAdded()
      cleanupRemoved()
    }
  }, [vaultPath])

  // Load files when ready - wait for organization to be loaded when online
  useEffect(() => {
    if (!isVaultConnected || !vaultPath) return
    
    if (!isOfflineMode && user && !organization) {
      setIsLoading(true)
      setStatusMessage('Loading organization...')
      return
    }
    
    const loadKey = `${vaultPath}:${currentVaultId || 'none'}:${organization?.id || 'none'}:${isOfflineMode ? 'offline' : 'online'}`
    
    log.debug('[LoadEffect]', 'Checking loadKey', { loadKey, lastLoadKey: lastLoadKey.current })
    
    if (lastLoadKey.current === loadKey) {
      log.debug('[LoadEffect]', 'Skipping - same loadKey')
      setIsLoading(false)
      if (statusMessage === 'Loading organization...' || statusMessage === 'Loading files...') {
        setStatusMessage('')
      }
      return
    }
    
    log.debug('[LoadEffect]', 'Triggering loadFiles for new loadKey')
    lastLoadKey.current = loadKey
    loadFiles()
  }, [isVaultConnected, vaultPath, isOfflineMode, user, organization, currentVaultId, loadFiles, setIsLoading, setStatusMessage, statusMessage, lastLoadKey])

  // Determine if we should show the welcome screen
  // Only show welcome when not authenticated - allow full app access even without a vault connected
  const showWelcome = !user && !isOfflineMode
  
  // Only show minimal menu bar on the sign-in screen (not authenticated)
  const isSignInScreen = !user && !isOfflineMode
  
  // Show splash screen during startup (before everything else)
  // This blocks until core systems and extensions are initialized
  if (!startup.isReady) {
    return (
      <SplashScreen
        stage={startup.stage}
        stageName={startup.stageName}
        status={startup.status}
        errors={startup.errors}
        onContinue={startup.continueWithErrors}
      />
    )
  }
  
  // Show onboarding screen on first app boot (before Supabase setup)
  if (!onboardingComplete) {
    return <OnboardingScreen />
  }
  
  // Show setup screen if Supabase is not configured
  if (!supabaseReady) {
    return (
      <div className="h-screen flex flex-col bg-plm-bg overflow-hidden">
        <SetupScreen onConfigured={handleSupabaseConfigured} />
      </div>
    )
  }

  return (
    <AppShell
      showWelcome={showWelcome}
      isSignInScreen={isSignInScreen}
      handleChangeOrg={handleChangeOrg}
    />
  )
}

export default App
