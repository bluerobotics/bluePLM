/**
 * useAppStartup - Orchestrates the app startup sequence
 * 
 * Manages two-stage startup:
 * Stage 1 (Core): Store hydration, Supabase config, auth session, organization, permissions
 * Stage 2 (Extensions): Discover and activate startup extensions
 * 
 * Returns startup state for the SplashScreen component.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { usePDMStore, getHasHydrated } from '@/stores/pdmStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { log } from '@/lib/logger'
import { recordMetric } from '@/lib/performanceMetrics'
import type { StartupError } from '@/components/core/SplashScreen'

type StartupStage = 1 | 2 | 3 | 4
type StageName = 'Initializing' | 'Connecting' | 'Loading Vault' | 'Extensions'

const STAGE_NAMES: Record<StartupStage, StageName> = {
  1: 'Initializing',
  2: 'Connecting',
  3: 'Loading Vault',
  4: 'Extensions'
}

interface StartupState {
  isReady: boolean
  stage: StartupStage
  stageName: StageName
  status: string
  errors: StartupError[]
  /** Called when user clicks "Continue anyway" after extension errors */
  continueWithErrors: () => void
}

// Extension activation timeout (10 seconds per extension)
const EXTENSION_TIMEOUT_MS = 10000

// Minimum time to show splash screen (prevents jarring flash)
const MIN_SPLASH_DISPLAY_MS = 1000

/**
 * Wait for store hydration to complete
 * Returns a promise that resolves when the store has loaded from localStorage
 */
function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (getHasHydrated()) {
      resolve()
      return
    }
    // Poll until hydrated (50ms intervals, matches store's poll interval)
    const interval = setInterval(() => {
      if (getHasHydrated()) {
        clearInterval(interval)
        resolve()
      }
    }, 50)
  })
}

export function useAppStartup(): StartupState {
  const [isReady, setIsReady] = useState(false)
  const [stage, setStage] = useState<StartupStage>(1)
  const [status, setStatus] = useState('Loading preferences...')
  const [errors, setErrors] = useState<StartupError[]>([])
  const [errorsContinued, setErrorsContinued] = useState(false)
  
  // Track if startup has already run to prevent re-running on re-renders
  const startupRunRef = useRef(false)
  
  const {
    loadInstalledExtensions,
    handleExtensionStateChange,
  } = usePDMStore()

  const continueWithErrors = useCallback(() => {
    setErrorsContinued(true)
    setIsReady(true)
  }, [])

  useEffect(() => {
    // Only run startup once
    if (startupRunRef.current) return
    startupRunRef.current = true

    const runStartup = async () => {
      const startTime = Date.now()
      
      // Helper to ensure minimum display time before completing
      const completeStartup = async () => {
        const elapsed = Date.now() - startTime
        // Record total startup time
        recordMetric('Startup', 'Total startup complete', { durationMs: elapsed })
        if (elapsed < MIN_SPLASH_DISPLAY_MS) {
          await new Promise(resolve => setTimeout(resolve, MIN_SPLASH_DISPLAY_MS - elapsed))
        }
        setIsReady(true)
      }
      
      try {
        // ═══════════════════════════════════════════════════════════════════════
        // Stage 1: Initializing
        // ═══════════════════════════════════════════════════════════════════════
        log.info('[Startup]', 'Stage 1: Initializing started')
        recordMetric('Startup', 'Stage 1 started', {})
        setStage(1)
        
        // Step 1.1: Wait for store hydration
        setStatus('Loading preferences...')
        const hydrationStart = performance.now()
        await waitForHydration()
        const hydrationDuration = performance.now() - hydrationStart
        recordMetric('Startup', 'Store hydration complete', { durationMs: Math.round(hydrationDuration) })
        log.debug('[Startup]', 'Store hydrated')
        
        // Step 1.2: Check Supabase configuration
        setStatus('Checking configuration...')
        
        const supabaseConfigured = isSupabaseConfigured()
        if (!supabaseConfigured) {
          // Supabase not configured - app will show setup screen
          // Mark as ready so App.tsx can handle the setup flow
          log.info('[Startup]', 'Supabase not configured, deferring to setup screen')
          await completeStartup()
          return
        }
        
        // Step 1.3: Check onboarding
        const state = usePDMStore.getState()
        if (!state.onboardingComplete) {
          // Onboarding not complete - app will show onboarding screen
          log.info('[Startup]', 'Onboarding not complete, deferring to onboarding screen')
          await completeStartup()
          return
        }
        
        const stage1Duration = performance.now() - startTime
        recordMetric('Startup', 'Stage 1 complete', { durationMs: Math.round(stage1Duration) })
        log.info('[Startup]', 'Stage 1: Initializing complete')
        
        // ═══════════════════════════════════════════════════════════════════════
        // Stage 2: Connecting
        // ═══════════════════════════════════════════════════════════════════════
        log.info('[Startup]', 'Stage 2: Connecting started')
        const stage2Start = performance.now()
        recordMetric('Startup', 'Stage 2 started', {})
        setStage(2)
        
        // Step 2.1: Wait for auth session (if user is already in store, we're good)
        setStatus('Restoring session...')
        const authStart = performance.now()
        // Auth is handled by useAuth hook in App.tsx via onAuthStateChange
        // Check if user is already in store from previous session, otherwise wait briefly
        const existingUser = usePDMStore.getState().user
        if (!existingUser) {
          // Wait briefly for the auth listener to fire on cold start
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        const authDuration = performance.now() - authStart
        recordMetric('Startup', 'Auth session restore', { durationMs: Math.round(authDuration) })
        
        // Step 2.2: Check if organization is loading
        // The useAuth hook handles organization loading, we monitor it
        setStatus('Connecting to organization...')
        
        // Wait for organization to be loaded (with timeout)
        const orgWaitStart = Date.now()
        const ORG_TIMEOUT_MS = 10000 // 10 second timeout for org loading
        
        while (Date.now() - orgWaitStart < ORG_TIMEOUT_MS) {
          const currentState = usePDMStore.getState()
          // If user is not logged in, proceed (welcome screen will show)
          if (!currentState.user) {
            log.debug('[Startup]', 'No user session, proceeding without org')
            break
          }
          // If organization is loaded, proceed
          if (currentState.organization) {
            log.debug('[Startup]', 'Organization loaded', { name: currentState.organization.name })
            break
          }
          // Wait a bit and check again (50ms poll interval)
          await new Promise(resolve => setTimeout(resolve, 50))
        }
        const orgDuration = Date.now() - orgWaitStart
        recordMetric('Startup', 'Organization load complete', { durationMs: orgDuration })
        
        // Step 2.3: Permissions are loaded by useAuth after organization
        setStatus('Loading permissions...')
        
        const stage2Duration = performance.now() - stage2Start
        recordMetric('Startup', 'Stage 2 complete', { durationMs: Math.round(stage2Duration) })
        log.info('[Startup]', 'Stage 2: Connecting complete')
        
        // ═══════════════════════════════════════════════════════════════════════
        // Stage 3: Loading Vault
        // ═══════════════════════════════════════════════════════════════════════
        log.info('[Startup]', 'Stage 3: Loading Vault started')
        const stage3Start = performance.now()
        recordMetric('Startup', 'Stage 3 started', {})
        setStage(3)
        
        // Step 3.1: Check for connected vaults
        // Note: The actual vault file loading happens in useLoadFiles after the splash screen
        // This stage just indicates we're preparing to load a vault
        const currentState2 = usePDMStore.getState()
        if (currentState2.connectedVaults.length > 0 || currentState2.activeVaultId) {
          setStatus('Preparing vault...')
        } else {
          setStatus('No vault connected')
        }
        
        const stage3Duration = performance.now() - stage3Start
        recordMetric('Startup', 'Stage 3 complete', { durationMs: Math.round(stage3Duration) })
        log.info('[Startup]', 'Stage 3: Loading Vault complete')
        
        // ═══════════════════════════════════════════════════════════════════════
        // Stage 4: Extensions
        // ═══════════════════════════════════════════════════════════════════════
        log.info('[Startup]', 'Stage 4: Extensions loading started')
        const stage4Start = performance.now()
        recordMetric('Startup', 'Stage 4 started', {})
        setStage(4)
        
        // Step 2.1: Discover extensions
        setStatus('Discovering extensions...')
        await loadInstalledExtensions()
        
        // Step 2.2: Activate startup extensions
        const currentExtensions = usePDMStore.getState().installedExtensions
        const extensionIds = Object.keys(currentExtensions)
        
        if (extensionIds.length === 0) {
          log.debug('[Startup]', 'No extensions to activate')
          setStatus('Extensions ready')
          await completeStartup()
          return
        }
        
        const failedExtensions: StartupError[] = []
        
        for (const extId of extensionIds) {
          const ext = currentExtensions[extId]
          if (!ext || ext.state === 'disabled') {
            continue // Skip disabled extensions
          }
          
          const extName = ext.manifest?.name || extId
          setStatus(`Activating ${extName}...`)
          
          try {
            // Activate with timeout
            const activationPromise = window.electronAPI?.extensions?.activate?.(extId)
            
            if (activationPromise) {
              const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => {
                setTimeout(() => resolve({ success: false, error: 'Activation timeout' }), EXTENSION_TIMEOUT_MS)
              })
              
              const result = await Promise.race([activationPromise, timeoutPromise])
              
              if (!result.success) {
                log.warn('[Startup]', 'Extension activation failed', { extId, error: result.error })
                failedExtensions.push({
                  extensionId: extId,
                  extensionName: extName,
                  error: result.error || 'Unknown error',
                })
                handleExtensionStateChange(extId, 'error', result.error)
              } else {
                handleExtensionStateChange(extId, 'active')
                log.debug('[Startup]', 'Extension activated', { extId })
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            log.error('[Startup]', 'Extension activation error', { extId, error: errorMsg })
            failedExtensions.push({
              extensionId: extId,
              extensionName: extName,
              error: errorMsg,
            })
            handleExtensionStateChange(extId, 'error', errorMsg)
          }
        }
        
        const stage4Duration = performance.now() - stage4Start
        recordMetric('Startup', 'Stage 4 complete', { durationMs: Math.round(stage4Duration) })
        
        if (failedExtensions.length > 0) {
          setStatus(`${failedExtensions.length} extension(s) failed to load`)
          setErrors(failedExtensions)
          log.warn('[Startup]', 'Some extensions failed to load', { count: failedExtensions.length })
          // Don't set isReady - wait for user to continue or auto-continue timer
        } else {
          setStatus('Extensions ready')
          log.info('[Startup]', 'Stage 4: Extensions loading complete')
          await completeStartup()
        }
        
      } catch (err) {
        log.error('[Startup]', 'Startup error', { error: err })
        // On error, just proceed to the app
        await completeStartup()
      }
    }
    
    runStartup()
  }, [loadInstalledExtensions, handleExtensionStateChange])

  // Handle error continuation
  useEffect(() => {
    if (errorsContinued && errors.length > 0) {
      setIsReady(true)
    }
  }, [errorsContinued, errors.length])

  return {
    isReady,
    stage,
    stageName: STAGE_NAMES[stage],
    status,
    errors,
    continueWithErrors,
  }
}
