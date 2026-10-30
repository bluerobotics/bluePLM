import { useCallback, useEffect, useRef } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { useShallow } from 'zustand/react/shallow'
import { log } from '@/lib/logger'
import { setLoadFilesSessionContext } from '@/hooks/loadFilesCoordination'
import { shouldDeferAutoConnectLoad } from '@/hooks/useAuth'
import { startFocusResponsivenessMonitor } from '@/lib/focusResponsivenessMonitor'
import { startLongTaskMonitor } from '@/lib/longTaskMonitor'
import { startAppHealthMonitor } from '@/lib/health/appHealthMonitor'
import { SetupScreen } from '@/components/shared/Screens'
import { OnboardingScreen } from '@/components/shared/Screens'
import { PerformanceWindow } from '@/features/dev-tools/performance'
import { TabWindow, isTabWindowMode, parseTabWindowParams } from '@/components/layout'
import { AppShell } from '@/components/layout'
import { DbUpgradeGate } from '@/features/dbUpgrade'
import { executeTerminalCommand } from '@/lib/commands/parser'
import { logUserAction } from '@/lib/userActionLogger'
import { checkSchemaCompatibility } from '@/lib/schemaVersion'
import { checkApiVersion } from '@/lib/apiVersion'
import { registerSettingsNavigationListener } from '@/lib/settingsNavigation'
import { getAccessibleVaults } from '@/lib/supabase'
import { JoinLinkGate } from '@/components/shared/Screens/JoinLinkGate'
import { useVaultWatchers } from '@/hooks/useVaultWatchers'
import { hashCheckoutIdentifier } from '@/types/pdm'
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
  useWebVaultAutoConnect,
  useVaultManagement,
  useIntegrationStatus,
  useAppStartup,
  useNativeExtensions,
} from '@/hooks'

// Check if we're in performance mode (pop-out window)
function isPerformanceMode(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('mode') === 'performance'
}

export function App() {
  // Check for performance mode (pop-out window) early
  // Render standalone performance window if in that mode
  if (isPerformanceMode()) {
    return <PerformanceWindow />
  }

  // Check for tab window mode (popped out tab)
  if (isTabWindowMode()) {
    const tabParams = parseTabWindowParams()
    if (tabParams) {
      return (
        <TabWindow
          view={tabParams.view}
          title={tabParams.title}
          customData={tabParams.customData}
        />
      )
    }
  }

  // Apply theme and language
  useTheme()
  useLanguage()

  // Context menus dispatch this event from below the application shell.
  useEffect(() => {
    return registerSettingsNavigationListener(window, {
      setActiveView: (view) => usePDMStore.getState().setActiveView(view),
      setSettingsTab: (tab) => usePDMStore.getState().setSettingsTab(tab),
    })
  }, [])

  // App startup orchestration - manages splash screen and initialization
  const startup = useAppStartup()

  // Log app startup
  useEffect(() => {
    logUserAction('navigation', 'App started', {
      platform: navigator.platform,
      userAgent: navigator.userAgent.split(' ').slice(-1)[0], // Last part is Chrome version
    })
  }, [])

  // Notices a session's slow failures (dead realtime, broken IndexedDB, a heap past its
  // high-water mark) and recovers without a restart: src/lib/health/healthMonitor.ts.
  useEffect(() => startAppHealthMonitor(), [])

  // Records what is actually holding the main thread. Interaction feedback -
  // hover, cursor shape, scroll - stalls whenever anything blocks it, so
  // without this the view that is open gets blamed for a background subsystem.
  //
  // No memory reading here. performance.memory is quantised and reported the
  // same 23 MB on every line of an entire session, which made a renderer that
  // died of memory exhaustion look idle; the main process samples the real
  // working set into the same log instead.
  useEffect(
    () =>
      startLongTaskMonitor(() => {
        const {
          activeView,
          currentOperation,
          operationQueue,
          processingOperations,
          files,
          serverFiles,
          selectedFiles,
          expandedFolders,
          activeVaultId,
        } = usePDMStore.getState()
        return {
          view: activeView,
          operationId: currentOperation?.id ?? null,
          commandId: currentOperation?.commandId ?? null,
          operationQueueLength: operationQueue.length,
          processingOperationsCount: processingOperations.size,
          filesCount: files.length,
          serverFilesCount: serverFiles.length,
          selectedCount: selectedFiles.length,
          expandedFoldersCount: expandedFolders.size,
          vaultId: hashCheckoutIdentifier(activeVaultId),
        }
      }),
    [],
  )

  // Reports how the window behaves in the seconds after it regains focus. Hover and cursor
  // lag "right after switching back from another app" is the one slow moment the long task
  // monitor above cannot single out on its own.
  useEffect(
    () =>
      startFocusResponsivenessMonitor(() => {
        const { activeView, files, selectedFiles } = usePDMStore.getState()
        return {
          view: activeView,
          filesCount: files.length,
          selectedCount: selectedFiles.length,
        }
      }),
    [],
  )

  // Get onboarding state
  const onboardingComplete = usePDMStore((s) => s.onboardingComplete)

  // Auth hook - handles authentication state and Supabase initialization
  const {
    supabaseReady,
    handleSupabaseConfigured,
    handleChangeOrg,
    sessionGeneration,
  } = useAuth()

  // Vault management hook - now gets setSettingsTab from store internally
  const { handleOpenVault, lastLoadKey } = useVaultManagement()

  const authUser = usePDMStore((s) => s.user)

  // Load files hook
  const { loadFiles } = useLoadFiles({
    authenticatedUserId: authUser?.id ?? null,
    sessionGeneration,
  })

  // Auto-download trigger hook
  useAutoDownload()

  // BluePLM Web: connect the user's vaults (no folder to choose there)
  useWebVaultAutoConnect()

  // Get store values needed for effects and computed values
  const {
    user,
    organization,
    authInitialized,
    isOfflineMode,
    vaultPath,
    isVaultConnected,
    connectedVaults,
    activeVaultId,
    statusMessage: _statusMessage,
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
  } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      organization: s.organization,
      authInitialized: s.authInitialized,
      isOfflineMode: s.isOfflineMode,
      vaultPath: s.vaultPath,
      isVaultConnected: s.isVaultConnected,
      connectedVaults: s.connectedVaults,
      activeVaultId: s.activeVaultId,
      statusMessage: s.statusMessage,
      toggleSidebar: s.toggleSidebar,
      toggleDetailsPanel: s.toggleDetailsPanel,
      setApiServerUrl: s.setApiServerUrl,
      apiServerUrl: s.apiServerUrl,
      addToast: s.addToast,
      setIsLoading: s.setIsLoading,
      setStatusMessage: s.setStatusMessage,
      setVaultPath: s.setVaultPath,
      setVaultConnected: s.setVaultConnected,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )

  // Get current vault ID (from activeVaultId or first connected vault)
  const currentVaultId = activeVaultId || connectedVaults[0]?.id

  useEffect(() => {
    setLoadFilesSessionContext({
      authenticatedUserId: user?.id ?? null,
      sessionGeneration,
    })
  }, [sessionGeneration, user?.id])

  const realtimeSessionKey = `${user?.id ?? ''}:${sessionGeneration}`

  // A file just marked 'deleted_remote' by realtime has no orphan tombstone yet - that
  // is only stamped by a full merge pass against the server. This silent pass is what
  // lets auto-discard actually remove the file within seconds instead of waiting for
  // the next loud load (see ORPHAN_DISCARD_REFRESH_DEBOUNCE_MS in useRealtimeSubscriptions).
  const requestSilentRefreshAfterDeletion = useCallback(() => {
    void loadFiles(true)
  }, [loadFiles])

  // Existing extracted hooks
  useRealtimeSubscriptions(
    organization,
    isOfflineMode,
    realtimeSessionKey,
    requestSilentRefreshAfterDeletion,
  )

  const previousSessionBoundaryRef = useRef<{
    authenticatedUserId: string | null
    sessionGeneration: number
  } | null>(null)

  useEffect(() => {
    const previous = previousSessionBoundaryRef.current
    const changed =
      previous !== null &&
      (previous.authenticatedUserId !== user?.id ||
        previous.sessionGeneration !== sessionGeneration)

    if (changed) {
      // The realtime hook flushes its queued location batch during cleanup.
      // Clear it again after cleanup so that batch cannot repopulate the new session.
      usePDMStore.getState().resetFileSessionState()
    }

    previousSessionBoundaryRef.current = {
      authenticatedUserId: user?.id ?? null,
      sessionGeneration,
    }
  }, [sessionGeneration, user?.id])

  useSessionHeartbeat(user, organization)
  useBackupHeartbeat(organization?.id)
  useSolidWorksAutoStart(organization)
  useAutoUpdater()
  useKeyboardShortcuts({ onOpenVault: handleOpenVault, onRefresh: loadFiles })

  // Org-installed native extensions: activate on sign-in/org switch, deactivate on sign-out
  useNativeExtensions()

  // Integration status orchestration hook - handles status checks lifecycle
  useIntegrationStatus()

  // Sync API URL from organization settings to store (which handles localStorage persistence)
  useEffect(() => {
    const orgApiUrl = organization?.settings?.api_url || null
    const currentApiUrl = apiServerUrl || null

    if (orgApiUrl !== currentApiUrl) {
      log.debug('[App]', 'Syncing API URL from org settings to store', {
        url: orgApiUrl || '(cleared)',
      })
      setApiServerUrl(orgApiUrl)
    }
  }, [organization?.settings?.api_url, apiServerUrl, setApiServerUrl])

  // Load color swatches when user and organization are available
  useEffect(() => {
    if (user && organization) {
      const { syncColorSwatches } = usePDMStore.getState()
      syncColorSwatches().catch((error) => {
        log.warn('[ColorSwatches]', 'Failed to sync', { error: error })
      })
    }
  }, [user?.id, organization?.id])

  // Check if admin has force-pushed module config since last sync
  useEffect(() => {
    if (!organization?.module_defaults_forced_at) return

    const {
      moduleConfigLastSyncedAt,
      loadOrgModuleDefaults,
      addToast: storeAddToast,
    } = usePDMStore.getState()
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

  // Check if admin has force-pushed column config since last sync
  useEffect(() => {
    if (!(organization as any)?.column_defaults_forced_at) return // TODO: type this

    const {
      columnConfigLastSyncedAt,
      loadOrgColumnDefaults,
      addToast: storeAddToast,
    } = usePDMStore.getState()
    const forcedAt = new Date((organization as any).column_defaults_forced_at).getTime() // TODO: type this
    const lastSynced = columnConfigLastSyncedAt || 0

    if (forcedAt > lastSynced) {
      log.info('[App]', 'Force-applying org column config', { forcedAt, lastSynced })
      loadOrgColumnDefaults().then(() => {
        storeAddToast('info', 'Column layout updated by admin')
      })
    }
  }, [(organization as any)?.column_defaults_forced_at]) // TODO: type this

  // Validate connected vault IDs after organization loads
  useEffect(() => {
    const validateVaults = async () => {
      if (!organization || !user || connectedVaults.length === 0) return

      log.debug('[VaultValidation]', 'Checking connected vaults', { count: connectedVaults.length })

      try {
        const { vaults: serverVaults, error } = await getAccessibleVaults(
          user.id,
          organization.id,
          getEffectiveRole(),
        )

        if (error) {
          log.error('[VaultValidation]', 'Failed to fetch accessible vaults', { error })
          return
        }

        const serverVaultIds = new Set((serverVaults || []).map((v) => v.id))
        log.debug('[VaultValidation]', 'User has access to vaults', { count: serverVaultIds.size })

        const staleVaults = connectedVaults.filter((cv) => !serverVaultIds.has(cv.id))

        if (staleVaults.length > 0) {
          log.warn('[VaultValidation]', 'Found stale vault(s)', {
            count: staleVaults.length,
            vaults: staleVaults.map((v) => v.name),
          })

          const store = usePDMStore.getState()
          staleVaults.forEach((v) => {
            log.debug('[VaultValidation]', 'Removing stale vault', { name: v.name, id: v.id })
            store.removeConnectedVault(v.id)
          })

          if (
            staleVaults.some((v) => v.id === currentVaultId) &&
            serverVaults &&
            serverVaults.length > 0
          ) {
            const defaultVault =
              (serverVaults as any[]).find((v: any) => v.is_default) || serverVaults[0] // TODO: type this
            log.info('[VaultValidation]', 'Active vault was stale, reconnecting', {
              vault: (defaultVault as any).name, // TODO: type this
            })
            setVaultConnected(false)
            setVaultPath(null)
          }
        } else {
          log.debug('[VaultValidation]', 'All connected vaults are valid')
        }
      } catch (error) {
        log.error('[VaultValidation]', 'Error validating vaults', { error: error })
      }
    }

    validateVaults()
  }, [
    organization,
    user?.id,
    connectedVaults,
    currentVaultId,
    setVaultConnected,
    setVaultPath,
    getEffectiveRole,
  ])

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
      } catch (error) {
        log.error('[SchemaVersion]', 'Error checking schema', { error: error })
      }
    }

    checkSchema()
    // Effect intentionally only depends on org/offline changes, not on every schema check
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, isOfflineMode])

  // Which organization's API has been checked. Keyed on the id rather than a
  // boolean because api_url arrives from org settings a moment after the
  // organization does, and the check has to wait for it.
  const apiVersionCheckedForRef = useRef<string | null>(null)

  // Warn when the deployed API is older than this app expects. A stale API
  // answers 404 for routes the app has already shipped, which otherwise shows
  // up as a feature quietly doing nothing rather than as a version problem.
  useEffect(() => {
    if (!organization?.id || isOfflineMode || !apiServerUrl) return
    if (apiVersionCheckedForRef.current === organization.id) return

    apiVersionCheckedForRef.current = organization.id

    void (async () => {
      try {
        const result = await checkApiVersion()
        if (!result) return

        log.debug('[ApiVersion]', 'Check result', {
          status: result.status,
          apiVersion: result.apiVersion,
        })

        if (result.status === 'incompatible') {
          addToast('error', `${result.message}: ${result.details}`, 0)
        } else if (result.status === 'outdated' || result.status === 'unknown') {
          addToast('warning', `${result.message}. ${result.details}`, 10000)
        }
      } catch (error) {
        log.error('[ApiVersion]', 'Error checking API version', { error: error })
      }
    })()
  }, [organization?.id, isOfflineMode, apiServerUrl, addToast])

  // CLI command listener - always active so CLI works even when terminal is hidden
  useEffect(() => {
    if (!window.electronAPI?.onCliCommand) return

    const unsubscribe = window.electronAPI.onCliCommand(async ({ requestId, command }) => {
      log.debug('[App]', 'Received CLI command', { command })

      try {
        const results = await executeTerminalCommand(command, loadFiles)

        if (results.length === 1 && results[0].content === '__CLEAR__') {
          window.electronAPI?.sendCliResponse(requestId, {
            outputs: [{ type: 'info', content: 'Cleared' }],
          })
        } else {
          window.electronAPI?.sendCliResponse(requestId, {
            outputs: results.map((r) => ({ type: r.type, content: r.content })),
          })
        }
      } catch (error) {
        window.electronAPI?.sendCliResponse(requestId, {
          outputs: [
            {
              type: 'error',
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
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

  // File, resync and directory watchers (see useVaultWatchers).
  useVaultWatchers(vaultPath, loadFiles)

  // Load files when ready - wait for organization to be loaded when online
  useEffect(() => {
    if (!isVaultConnected || !vaultPath) return

    if (
      shouldDeferAutoConnectLoad({
        isOfflineMode,
        authenticatedUserId: user?.id ?? null,
        sessionGeneration,
        authInitialized,
      })
    ) {
      setIsLoading(false)
      return
    }

    if (!isOfflineMode && user && !organization) {
      setIsLoading(true)
      setStatusMessage('Loading organization...')
      return
    }

    const loadKey = `${vaultPath}:${currentVaultId || 'none'}:${organization?.id || 'none'}:${user?.id || 'none'}:${sessionGeneration}:${isOfflineMode ? 'offline' : 'online'}`

    log.debug('[LoadEffect]', 'Checking loadKey', { loadKey, lastLoadKey: lastLoadKey.current })

    if (lastLoadKey.current === loadKey) {
      log.debug('[LoadEffect]', 'Skipping - same loadKey')
      // Note: Don't call setIsLoading(false) here - it interferes with folder refresh spinner
      // The loading state is managed by the operation that set it (loadFiles, refreshCurrentFolder, etc.)
      const currentStatus = usePDMStore.getState().statusMessage
      if (currentStatus === 'Loading organization...' || currentStatus === 'Loading files...') {
        setStatusMessage('')
      }
      return
    }

    log.debug('[LoadEffect]', 'Triggering loadFiles for new loadKey')
    lastLoadKey.current = loadKey
    loadFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- statusMessage intentionally excluded to prevent interfering with refresh operations
  }, [
    isVaultConnected,
    vaultPath,
    isOfflineMode,
    authInitialized,
    user,
    organization,
    currentVaultId,
    sessionGeneration,
    loadFiles,
    setIsLoading,
    setStatusMessage,
    lastLoadKey,
  ])

  // Determine if we should show the welcome screen
  // Only show welcome when not authenticated - allow full app access even without a vault connected
  const showWelcome = !user && !isOfflineMode

  // Only show minimal menu bar on the sign-in screen (not authenticated)
  const isSignInScreen = !user && !isOfflineMode

  // Block rendering until core systems and extensions are initialized
  if (!startup.isReady) {
    return <div className="h-screen w-screen bg-plm-bg" />
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

  // A BluePLM Web join link (blueplm.io/join#<org code>) is confirmed before the app shows, and the
  // backend it names is then checked for a schema this app can use.
  return (
    <JoinLinkGate onConfigured={handleSupabaseConfigured}>
      <DbUpgradeGate>
        <AppShell
          showWelcome={showWelcome}
          isSignInScreen={isSignInScreen}
          handleChangeOrg={handleChangeOrg}
        />
      </DbUpgradeGate>
    </JoinLinkGate>
  )
}

