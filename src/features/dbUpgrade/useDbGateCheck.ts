import { useEffect } from 'react'

import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import { INITIAL_DB_GATE } from '@/stores/slices/dbUpgradeSlice'

import { runDbGateCheck } from './dbUpgradeActions'

/**
 * How often a running app asks again whether the database or client_min_version() moved under it.
 * One indexed row and one RPC; bounded for apps left open for weeks.
 */
const RECHECK_INTERVAL_MS = 30 * 60 * 1000

/**
 * Runs the gate check whenever a user signs in, and again every half hour. Listens to the auth
 * session directly rather than the store's user, because against a 4.x database the 5.0 client
 * cannot load its user row (the tables were renamed) and the store's user would never arrive.
 */
export function useDbGateCheck(): void {
  const isOfflineMode = usePDMStore((s) => s.isOfflineMode)

  useEffect(() => {
    if (isOfflineMode) return
    let currentUserId: string | null = null
    let currentEmail: string | null = null

    // Test fakes of the Supabase client (App and perf boot tests) have no auth listener; with
    // none there is no session to gate, so the app renders as usual.
    if (typeof supabase.auth?.onAuthStateChange !== 'function') return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null
      if (userId === currentUserId) return
      currentUserId = userId
      currentEmail = session?.user?.email ?? null
      if (!userId) {
        const store = usePDMStore.getState()
        store.setDbGate(INITIAL_DB_GATE)
        store.resetDbUpgradeRun()
        return
      }
      // Out of the auth callback: supabase-js deadlocks on calls made inside it.
      setTimeout(() => void runDbGateCheck(userId, currentEmail), 0)
    })

    const timer = setInterval(() => {
      if (!currentUserId) return
      if (usePDMStore.getState().dbUpgradeRun.phase === 'applying') return
      void runDbGateCheck(currentUserId, currentEmail)
    }, RECHECK_INTERVAL_MS)

    return () => {
      subscription.unsubscribe()
      clearInterval(timer)
    }
  }, [isOfflineMode])
}
