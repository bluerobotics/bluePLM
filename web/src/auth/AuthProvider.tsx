// Session, profile, organization and admin status for BluePLM Web.
//
// The access token is mirrored into setCurrentAccessToken because the shared profile and
// organization loaders (src/lib/supabase/organizations.ts) call PostgREST with raw fetch and read
// the token from there. Admin follows the one definition in src/lib/isAdminUser.ts; the UI only
// hides what the database (is_org_admin, RLS) refuses anyway.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase/client'
import { setCurrentAccessToken } from '@/lib/supabase/auth'
import { getOrganization, getUserProfile } from '@/lib/supabase/organizations'
import { getUserTeams } from '@/lib/supabase/teams'
import { isAdminUser } from '@/lib/isAdminUser'
import type { Organization } from '@/types/pdm'

export interface WebProfile {
  id: string
  email: string
  role: string
  org_id: string | null
  full_name: string | null
  avatar_url: string | null
  custom_avatar_url: string | null
}

export interface WebTeam {
  id: string
  name: string
  color: string
  icon: string
}

export type AuthStatus = 'loading' | 'signedOut' | 'noOrganization' | 'error' | 'ready'

export interface AuthState {
  status: AuthStatus
  session: Session | null
  profile: WebProfile | null
  organization: Organization | null
  teams: WebTeam[]
  isAdmin: boolean
  error: string | null
  signOut: () => Promise<void>
  reload: () => void
}

/** The signed-in context every page below the auth gate can rely on. */
export interface ReadyAuth extends AuthState {
  status: 'ready'
  session: Session
  profile: WebProfile & { org_id: string }
  organization: Organization
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [profile, setProfile] = useState<WebProfile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [teams, setTeams] = useState<WebTeam[]>([])
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const client = getSupabaseClient()
    let active = true
    void client.auth.getSession().then(({ data }) => {
      if (!active) return
      setCurrentAccessToken(data.session?.access_token ?? null)
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setCurrentAccessToken(next?.access_token ?? null)
      setSession(next)
      setSessionLoaded(true)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!sessionLoaded) return
    if (!userId) {
      setProfile(null)
      setOrganization(null)
      setTeams([])
      setStatus('signedOut')
      return
    }
    let active = true
    setStatus('loading')
    void (async () => {
      const { profile: loaded, error: profileError } = await getUserProfile(userId, { maxRetries: 1 })
      if (!active) return
      if (!loaded) {
        setError(profileError?.message ?? null)
        setStatus(profileError ? 'error' : 'noOrganization')
        return
      }
      if (!loaded.org_id) {
        setProfile(loaded)
        setStatus('noOrganization')
        return
      }
      const [{ org }, { teams: loadedTeams }] = await Promise.all([
        getOrganization(loaded.org_id),
        getUserTeams(userId),
      ])
      if (!active) return
      if (!org) {
        setProfile(loaded)
        setStatus('noOrganization')
        return
      }
      setProfile(loaded)
      setOrganization(org as Organization)
      setTeams(loadedTeams ?? [])
      setError(null)
      setStatus('ready')
    })()
    return () => {
      active = false
    }
  }, [sessionLoaded, userId, reloadCount])

  const signOut = useCallback(async () => {
    // Local scope: signing out of the browser must not end the user's desktop sessions. The
    // shared signOut() ends them all (global scope) and also tears down desktop-only state.
    try {
      await getSupabaseClient().auth.signOut({ scope: 'local' })
    } finally {
      setCurrentAccessToken(null)
      setSession(null)
    }
  }, [])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  const value = useMemo<AuthState>(
    () => ({
      status,
      session,
      profile,
      organization,
      teams,
      isAdmin: isAdminUser(profile?.role, teams),
      error,
      signOut,
      reload,
    }),
    [status, session, profile, organization, teams, error, signOut, reload],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

/** For pages behind the auth gate: the session, profile and organization are present. */
export function useReadyAuth(): ReadyAuth {
  const value = useAuth()
  if (value.status !== 'ready' || !value.session || !value.profile?.org_id || !value.organization) {
    throw new Error('useReadyAuth used outside the signed-in app')
  }
  return value as ReadyAuth
}
