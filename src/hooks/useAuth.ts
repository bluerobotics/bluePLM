import { useEffect, useState, useCallback } from 'react'
import { usePDMStore } from '@/stores/pdmStore'
import { setAnalyticsUser, clearAnalyticsUser } from '@/lib/analytics'
import { 
  supabase, 
  isSupabaseConfigured, 
  linkUserToOrganization, 
  getUserProfile, 
  setCurrentAccessToken, 
  signOut, 
  syncUserSessionsOrgId,
  updateLastOnline
} from '@/lib/supabase'
import { logUserAction } from '@/lib/userActionLogger'
import { clearConfig } from '@/lib/supabaseConfig'
import { log } from '@/lib/logger'
import { recordMetric } from '@/lib/performanceMetrics'

/**
 * Truncate email for safe logging (e.g., "jo***@example.com")
 * Masks most of the local part while preserving domain for debugging
 */
function truncateEmail(email: string | null | undefined): string {
  if (!email) return '(no email)'
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const visibleChars = Math.min(2, local.length)
  return `${local.substring(0, visibleChars)}***@${domain}`
}

/**
 * Hook to manage authentication state and initialization
 * Handles:
 * - Supabase configuration check
 * - Session restoration on app start
 * - Auth state change listener (sign in/out)
 * - Organization loading and linking
 * - Analytics user setup
 */
export function useAuth() {
  const {
    setUser,
    setOrganization,
    setStatusMessage,
    setVaultConnected,
    setIsConnecting,
    setOfflineMode,
    addToast,
  } = usePDMStore()

  // Track if Supabase is configured (can change at runtime)
  const [supabaseReady, setSupabaseReady] = useState(() => isSupabaseConfigured())

  // Handle Supabase being configured (from SetupScreen)
  const handleSupabaseConfigured = useCallback(() => {
    setSupabaseReady(true)
  }, [])

  // Handle user wanting to change organization (go back to setup)
  const handleChangeOrg = useCallback(async () => {
    // Sign out first if user is signed in
    await signOut()
    // Clear the stored Supabase config
    clearConfig()
    // Reset state to show setup screen
    setSupabaseReady(false)
  }, [])

  // Initialize auth state via onAuthStateChange listener
  // NOTE: We removed the duplicate getCurrentSession() flow that was causing a race condition
  // Supabase fires INITIAL_SESSION or SIGNED_IN when restoring a persisted session on startup
  useEffect(() => {
    if (!supabaseReady) {
      return
    }

    // Listen for auth state changes (also handles session restoration on startup)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Handle session events: INITIAL_SESSION (startup restore), SIGNED_IN (new login), TOKEN_REFRESHED
        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          // Show connecting state while loading organization
          // Add timeout to prevent infinite hanging if network/db is slow
          let connectingTimeout: ReturnType<typeof setTimeout> | null = null
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            setIsConnecting(true)
            // Safety timeout: clear isConnecting after 90s to prevent infinite hang
            // Increased from 30s to handle slow networks and avoid false "timeout" warnings
            connectingTimeout = setTimeout(() => {
              log.warn('[Auth]', 'Organization loading timeout - clearing connecting state')
              setIsConnecting(false)
              addToast('warning', 'Loading your organization is taking longer than expected. Please check your internet connection.')
            }, 90000)
          }
          
          // Store access token for raw fetch calls (Supabase client methods hang)
          setCurrentAccessToken(session.access_token)
          
          try {
            // NOTE: ensureUserOrgId() removed - it used client.rpc() which hangs
            // linkUserToOrganization() handles org_id setup correctly as fallback
            
            // Fetch user profile from database to get role
            const profileStart = performance.now()
            const { profile, error: profileError } = await getUserProfile(session.user.id)
            const profileDuration = performance.now() - profileStart
            recordMetric('Startup', 'getUserProfile complete', { 
              durationMs: Math.round(profileDuration),
              hasProfile: !!profile,
              hasOrgId: !!(profile as any)?.org_id
            })
            if (profileError) {
              log.warn('[Auth]', 'Profile fetch error', { error: profileError.message })
            }
            
            const userProfile = profile as { full_name?: string; avatar_url?: string; custom_avatar_url?: string; job_title?: string; org_id?: string; role?: string; last_sign_in?: string } | null
            
            // Set user from profile (includes role) or fallback to session data
            // Note: Google OAuth stores avatar as 'picture' in user_metadata, not 'avatar_url'
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              full_name: userProfile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || null,
              avatar_url: userProfile?.avatar_url || session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null,
              custom_avatar_url: userProfile?.custom_avatar_url || null,
              job_title: userProfile?.job_title || null,
              org_id: userProfile?.org_id || null,
              role: (userProfile?.role || 'engineer') as 'admin' | 'engineer' | 'viewer',
              created_at: session.user.created_at,
              last_sign_in: userProfile?.last_sign_in || null
            })
            log.info('[Auth]', 'User signed in', { email: truncateEmail(session.user.email), role: userProfile?.role || 'engineer' })
            
            // Update last_online timestamp
            updateLastOnline().catch(err => log.warn('[Auth]', 'Failed to update last_online', { error: err }))
            
            // Set user for Sentry analytics (uses hashed IDs for privacy)
            setAnalyticsUser(session.user.id, userProfile?.org_id || undefined)
            
            if (event === 'SIGNED_IN') {
              // Only show welcome message for new sign-ins, not session restoration
              setStatusMessage(`Welcome, ${session.user.user_metadata?.full_name || session.user.email}!`)
              setTimeout(() => setStatusMessage(''), 3000)
              
              // Disable offline mode when user signs in (they're now authenticated)
              // Use getState() to get current value, not stale closure value
              const currentOfflineMode = usePDMStore.getState().isOfflineMode
              if (currentOfflineMode && navigator.onLine) {
                setOfflineMode(false)
                addToast('success', 'Back online')
              }
            } else if (event === 'INITIAL_SESSION') {
              // Session restored from storage - user is already signed in
              log.info('[Auth]', 'Session restored from storage', { email: truncateEmail(session.user.email) })
            }
            
            // Load organization (setOrganization will clear isConnecting)
            // Pass cached org_id to avoid duplicate profile fetch in linkUserToOrganization
            const orgStart = performance.now()
            const { org, error: orgError } = await linkUserToOrganization(session.user.id, session.user.email || '', userProfile?.org_id)
            const orgDuration = performance.now() - orgStart
            recordMetric('Startup', 'linkUserToOrganization complete', { 
              durationMs: Math.round(orgDuration),
              hasOrg: !!org,
              usedCachedOrgId: !!userProfile?.org_id
            })
            if (org) {
              log.info('[Auth]', 'Organization loaded', { name: (org as any).name })
              if (connectingTimeout) clearTimeout(connectingTimeout)
              setOrganization(org as any)
              
              // Update user's org_id in store if it wasn't set (triggers session re-registration with correct org_id)
              // This fixes the "no other users showing online" bug where sessions were registered with org_id=null
              const currentUser = usePDMStore.getState().user
              if (currentUser && !currentUser.org_id) {
                setUser({ ...currentUser, org_id: (org as any).id })
                // Update analytics user with org_id
                setAnalyticsUser(currentUser.id, (org as any).id)
              }
              
              // Sync all user sessions to have the correct org_id (fixes sessions created before org was linked)
              syncUserSessionsOrgId(session.user.id, (org as any).id)
              
              // Load user's team permissions
              usePDMStore.getState().loadUserPermissions()
              
              // Load user's workflow roles for real-time sync
              usePDMStore.getState().loadUserWorkflowRoles()
            } else {
              log.warn('[Auth]', 'No organization found', { error: orgError })
              if (connectingTimeout) clearTimeout(connectingTimeout)
              setIsConnecting(false)
              // Show a toast with helpful message
              addToast('warning', orgError?.message || 'No organization found. Please enter an organization code or contact your administrator.')
            }
          } catch (err) {
            log.error('[Auth]', 'Error in auth state handler', { error: err })
            if (connectingTimeout) clearTimeout(connectingTimeout)
            setIsConnecting(false)
          }
        } else if (event === 'SIGNED_OUT') {
          logUserAction('auth', 'User signed out')
          log.info('[Auth]', 'User signed out')
          clearAnalyticsUser()
          setUser(null)
          setOrganization(null)
          setVaultConnected(false)
          setIsConnecting(false)
          setStatusMessage('Signed out')
          setTimeout(() => setStatusMessage(''), 3000)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabaseReady, setUser, setOrganization, setStatusMessage, setVaultConnected, setIsConnecting, setOfflineMode, addToast])

  return {
    supabaseReady,
    handleSupabaseConfigured,
    handleChangeOrg,
  }
}
