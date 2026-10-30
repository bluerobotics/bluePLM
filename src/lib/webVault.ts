/**
 * Vault connection on BluePLM Web.
 *
 * The web has no vault folder. A connected vault there is the server's vault under a virtual
 * `localPath` (`/<slug>`): `vaultPath` stays non-null, so every gate that waits for a connected
 * vault (the load effect, the explorer) works unchanged, and `buildFullPath` gives every row a
 * stable, unique `path` key. The load then reads the server rows only (`useLoadFiles`) and every
 * row stays `cloud`. Nothing here runs on the desktop.
 */

import type { ConnectedVault } from '@/stores/types'
import { usePDMStore } from '@/stores/pdmStore'

/** A vault as the server lists it, the fields a web connection needs. */
export interface WebVaultSource {
  id: string
  name: string
  slug: string
  is_default?: boolean | null
}

/** The virtual vault path on the web. Falls back to the id when a vault has no slug. */
export function webVaultPath(vault: Pick<WebVaultSource, 'id' | 'slug'>): string {
  const segment = (vault.slug || vault.id).replace(/[/\\]+/g, '-')
  return `/${segment}`
}

export function webConnectedVault(vault: WebVaultSource): ConnectedVault {
  return {
    id: vault.id,
    name: vault.name,
    localPath: webVaultPath(vault),
    isExpanded: true,
    hasCompletedSetup: true,
  }
}

export interface WebVaultSyncPlan {
  /** Vaults the user can reach that are not connected yet. */
  add: ConnectedVault[]
  /** Connected vault ids the user can no longer reach. */
  remove: string[]
  /** Connected vaults whose name or path no longer matches the server. */
  update: Array<{ id: string; updates: Partial<ConnectedVault> }>
  /** The vault to show: the current one while it stays, else the default, else the first. */
  activeVaultId: string | null
}

/**
 * Connect exactly the vaults the user can reach. On the web a connection holds nothing local, so
 * there is nothing to lose by following the server: every reachable vault is connected and one
 * that access was withdrawn from is dropped. `accessible` comes in server order (default first).
 */
export function planWebVaultSync(
  accessible: readonly WebVaultSource[],
  connected: readonly ConnectedVault[],
  activeVaultId: string | null,
): WebVaultSyncPlan {
  const accessibleIds = new Set(accessible.map((v) => v.id))
  const connectedById = new Map(connected.map((v) => [v.id, v]))

  const remove = connected.filter((v) => !accessibleIds.has(v.id)).map((v) => v.id)
  const add: ConnectedVault[] = []
  const update: WebVaultSyncPlan['update'] = []
  for (const vault of accessible) {
    const existing = connectedById.get(vault.id)
    if (!existing) {
      add.push(webConnectedVault(vault))
      continue
    }
    const localPath = webVaultPath(vault)
    if (existing.name !== vault.name || existing.localPath !== localPath) {
      update.push({ id: vault.id, updates: { name: vault.name, localPath } })
    }
  }

  let nextActive: string | null = null
  if (activeVaultId && accessibleIds.has(activeVaultId)) {
    nextActive = activeVaultId
  } else {
    nextActive = (accessible.find((v) => v.is_default) ?? accessible[0])?.id ?? null
  }

  return { add, remove, update, activeVaultId: nextActive }
}

/**
 * Where the web's working vault stands: the active vault's virtual path, connected once a user is
 * signed in. Mirrors what the desktop's `initWorkingDir` does after `setWorkingDir` succeeds.
 */
export function webWorkingVaultState(
  connected: readonly ConnectedVault[],
  activeVaultId: string | null,
  vaultPath: string | null,
  hasUser: boolean,
): { vaultPath: string | null; connected: boolean } {
  const active = connected.find((v) => v.id === activeVaultId) ?? connected[0]
  const path = active?.localPath ?? vaultPath
  if (!path) return { vaultPath: null, connected: false }
  return { vaultPath: path, connected: hasUser }
}

/** Show `vaultPath` as the working vault, clearing the previous vault's rows when it changes. */
function openWebVault(vaultPath: string | null): void {
  const state = usePDMStore.getState()
  if (vaultPath !== state.vaultPath) {
    state.setFiles([])
    state.setServerFiles([])
    state.setFilesLoaded(false)
    state.setVaultPath(vaultPath)
  }
  state.setVaultConnected(vaultPath !== null && state.user !== null)
}

/** Apply a sync plan to the store and open the active vault. */
export function applyWebVaultSync(plan: WebVaultSyncPlan): void {
  const state = usePDMStore.getState()
  for (const id of plan.remove) state.removeConnectedVault(id)
  for (const { id, updates } of plan.update) state.updateConnectedVault(id, updates)
  for (const vault of plan.add) state.addConnectedVault(vault)
  state.setActiveVault(plan.activeVaultId)
  const active = usePDMStore
    .getState()
    .connectedVaults.find((v) => v.id === plan.activeVaultId)
  openWebVault(active?.localPath ?? null)
}

/** Connect one vault on the web (Settings > Vaults > Connect) and make it the working vault. */
export function connectWebVault(vault: WebVaultSource): ConnectedVault {
  const connectedVault = webConnectedVault(vault)
  const state = usePDMStore.getState()
  state.addConnectedVault(connectedVault)
  state.setActiveVault(connectedVault.id)
  openWebVault(connectedVault.localPath)
  return connectedVault
}
