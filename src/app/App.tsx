import { useEffect, useRef } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { log } from '@/lib/logger'
import { SetupScreen } from '@/components/shared/Screens'
import { OnboardingScreen } from '@/components/shared/Screens'
import { PerformanceWindow } from '@/features/dev-tools/performance'
import { TabWindow, isTabWindowMode, parseTabWindowParams } from '@/components/layout'
import { AppShell } from '@/components/layout'
import { executeTerminalCommand } from '@/lib/commands/parser'
import { logUserAction } from '@/lib/userActionLogger'
import { checkSchemaCompatibility } from '@/lib/schemaVersion'
import { getAccessibleVaults } from '@/lib/supabase'
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
  const { supabaseReady, handleSupabaseConfigured } = useAuth()
  
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
  useEffect(() => {
    if (!window.electronAPI || !vaultPath) return
    
    let refreshTimeout: NodeJS.Timeout | null = null
    
    const cleanup = window.electronAPI.onFilesChanged((changedFiles) => {
      const { syncProgress, processingOperations } = usePDMStore.getState()
      if (syncProgress.isActive || processingOperations.size > 0) {
        return
      }
      
      log.debug('[FileWatcher]', 'Files changed', { count: changedFiles.length })
      
      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }
      
      refreshTimeout = setTimeout(() => {
        const currentState = usePDMStore.getState()
        if (currentState.syncProgress.isActive || currentState.processingOperations.size > 0) {
          return
        }
        loadFiles(true)
        refreshTimeout = null
      }, 1000)
    })
    
    return cleanup
  }, [vaultPath, loadFiles])

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
    />
  )
}

export default App
