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
import type { StartupError } from '@/components/core/SplashScreen'

type StartupStage = 1 | 2
type StageName = 'Core' | 'Extensions'

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
        if (elapsed < MIN_SPLASH_DISPLAY_MS) {
          await new Promise(resolve => setTimeout(resolve, MIN_SPLASH_DISPLAY_MS - elapsed))
        }
        setIsReady(true)
      }
      
      try {
        // ═══════════════════════════════════════════════════════════════════════
        // Stage 1: Core Loading
        // ═══════════════════════════════════════════════════════════════════════
        log.info('[Startup]', 'Stage 1: Core loading started')
        setStage(1)
        
        // Step 1.1: Wait for store hydration
        setStatus('Loading preferences...')
        await waitForHydration()
        log.debug('[Startup]', 'Store hydrated')
        
        // Step 1.2: Check Supabase configuration
        setStatus('Checking configuration...')
        await new Promise(resolve => setTimeout(resolve, 100)) // Brief delay for UI
        
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
        
        // Step 1.4: Wait for auth session (if user is already in store, we're good)
        setStatus('Restoring session...')
        // Auth is handled by useAuth hook in App.tsx via onAuthStateChange
        // We just wait briefly for the listener to fire
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // Step 1.5: Check if organization is loading
        // The useAuth hook handles organization loading, we monitor it
        setStatus('Loading organization...')
        
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
          // Wait a bit and check again
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        // Step 1.6: Permissions are loaded by useAuth after organization
        setStatus('Loading permissions...')
        await new Promise(resolve => setTimeout(resolve, 100))
        
        log.info('[Startup]', 'Stage 1: Core loading complete')
        
        // ═══════════════════════════════════════════════════════════════════════
        // Stage 2: Extensions
        // ═══════════════════════════════════════════════════════════════════════
        log.info('[Startup]', 'Stage 2: Extensions loading started')
        setStage(2)
        
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
        
        if (failedExtensions.length > 0) {
          setStatus(`${failedExtensions.length} extension(s) failed to load`)
          setErrors(failedExtensions)
          log.warn('[Startup]', 'Some extensions failed to load', { count: failedExtensions.length })
          // Don't set isReady - wait for user to continue or auto-continue timer
        } else {
          setStatus('Extensions ready')
          log.info('[Startup]', 'Stage 2: Extensions loading complete')
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
    stageName: stage === 1 ? 'Core' : 'Extensions',
    status,
    errors,
    continueWithErrors,
  }
}
