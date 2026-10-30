import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePDMStore } from '@/stores/pdmStore'
import { getAccessibleVaults } from '@/lib/supabase'
import { hasDesktop } from '@/lib/platform'
import { log } from '@/lib/logger'
import { applyWebVaultSync, planWebVaultSync } from '@/lib/webVault'

/**
 * BluePLM Web: connect the vaults the signed-in user can reach, so the explorer opens on a vault
 * without a visit to Settings > Vaults. Runs once per user, organization and effective role (an
 * Administrators team member becomes `admin` once teams load and may reach more vaults). Does
 * nothing on the desktop, where a vault is a folder the user chooses.
 */
export function useWebVaultAutoConnect(): void {
  const { userId, orgId, isOfflineMode, role } = usePDMStore(
    useShallow((s) => ({
      userId: s.user?.id ?? null,
      orgId: s.organization?.id ?? null,
      isOfflineMode: s.isOfflineMode,
      role: s.user ? s.getEffectiveRole() : null,
    })),
  )

  useEffect(() => {
    if (hasDesktop() || !userId || !orgId || !role || isOfflineMode) return
    let cancelled = false

    void (async () => {
      const { vaults, error } = await getAccessibleVaults(userId, orgId, role)
      if (cancelled) return
      if (error) {
        log.warn('[WebVaults]', 'Could not list accessible vaults', { error })
        return
      }
      const state = usePDMStore.getState()
      if (state.user?.id !== userId || state.organization?.id !== orgId) return
      const plan = planWebVaultSync(vaults, state.connectedVaults, state.activeVaultId)
      log.info('[WebVaults]', 'Connecting accessible vaults', {
        accessible: vaults.length,
        added: plan.add.length,
        removed: plan.remove.length,
      })
      applyWebVaultSync(plan)
    })()

    return () => {
      cancelled = true
    }
  }, [userId, orgId, role, isOfflineMode])
}
