/**
 * useVaultAccess - Hook for managing vault access
 * 
 * Provides state and operations for vault access including:
 * - Loading vaults and access mappings into Zustand store
 * - Saving user and team vault access
 * - Computing accessible vaults for users
 * 
 * State is managed in the organizationMetadataSlice of the PDM store.
 */
import { useCallback, useEffect, useRef } from 'react'
import { supabase, getOrgVaultAccess, setUserVaultAccess } from '@/lib/supabase'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
import type { OrgVault } from '@/stores/types'
import {
  type TeamVaultAccessJoin,
  castQueryResult,
  insertTeamVaultAccess
} from './supabaseHelpers'

export function useVaultAccess(orgId: string | null) {
  // Get actions from store
  const user = usePDMStore(s => s.user)
  const addToast = usePDMStore(s => s.addToast)
  
  // Vault access state from store
  const vaults = usePDMStore(s => s.orgVaults)
  const vaultAccessMap = usePDMStore(s => s.vaultAccessMap)
  const teamVaultAccessMap = usePDMStore(s => s.teamVaultAccessMap)
  const isLoading = usePDMStore(s => s.orgVaultsLoading)
  const orgVaultsLoaded = usePDMStore(s => s.orgVaultsLoaded)
  
  // Listen to vaultsRefreshKey to reload when vaults are created/deleted
  const vaultsRefreshKey = usePDMStore(s => s.vaultsRefreshKey)
  const prevRefreshKeyRef = useRef(vaultsRefreshKey)
  
  // Vault access actions from store
  const setOrgVaults = usePDMStore(s => s.setOrgVaults)
  const setOrgVaultsLoading = usePDMStore(s => s.setOrgVaultsLoading)
  const setVaultAccessMap = usePDMStore(s => s.setVaultAccessMap)
  const setTeamVaultAccessMap = usePDMStore(s => s.setTeamVaultAccessMap)

  const loadVaults = useCallback(async () => {
    if (!orgId) return
    
    setOrgVaultsLoading(true)
    try {
      const { data, error } = await supabase
        .from('vaults')
        .select('*')
        .eq('org_id', orgId)
        .order('is_default', { ascending: false })
        .order('name')
      
      if (error) throw error
      setOrgVaults(castQueryResult<OrgVault[]>(data || []))
    } catch (err) {
      log.error('[VaultAccess]', 'Failed to load org vaults', { error: err })
      setOrgVaultsLoading(false)
    }
  }, [orgId, setOrgVaults, setOrgVaultsLoading])

  const loadVaultAccess = useCallback(async () => {
    if (!orgId) return
    
    const { accessMap, error } = await getOrgVaultAccess(orgId)
    if (error) {
      log.error('[VaultAccess]', 'Failed to load vault access', { error })
    } else {
      setVaultAccessMap(accessMap)
    }
  }, [orgId, setVaultAccessMap])

  const loadTeamVaultAccess = useCallback(async () => {
    if (!orgId) return
    
    try {
      const { data, error } = await supabase
        .from('team_vault_access')
        .select('team_id, vault_id')
      
      if (error) throw error
      
      const typedData = castQueryResult<TeamVaultAccessJoin[]>(data || [])
      
      // Build team -> vault[] map
      const accessMap: Record<string, string[]> = {}
      for (const row of typedData) {
        if (!accessMap[row.team_id]) {
          accessMap[row.team_id] = []
        }
        accessMap[row.team_id].push(row.vault_id)
      }
      setTeamVaultAccessMap(accessMap)
    } catch (err) {
      log.error('[VaultAccess]', 'Failed to load team vault access', { error: err })
    }
  }, [orgId, setTeamVaultAccessMap])

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadVaults(),
      loadVaultAccess(),
      loadTeamVaultAccess()
    ])
  }, [loadVaults, loadVaultAccess, loadTeamVaultAccess])

  const saveUserVaultAccess = useCallback(async (
    userId: string,
    vaultIds: string[],
    userName?: string
  ): Promise<boolean> => {
    if (!user || !orgId) return false
    
    try {
      const result = await setUserVaultAccess(userId, vaultIds, user.id, orgId)
      
      if (result.success) {
        addToast('success', `Updated vault access for ${userName || 'user'}`)
        // Reload vault access to get updated map
        await loadVaultAccess()
        return true
      } else {
        addToast('error', result.error || 'Failed to update vault access')
        return false
      }
    } catch {
      addToast('error', 'Failed to update vault access')
      return false
    }
  }, [user, orgId, addToast, loadVaultAccess])

  const saveTeamVaultAccess = useCallback(async (
    teamId: string,
    vaultIds: string[],
    teamName?: string
  ): Promise<boolean> => {
    if (!user) return false
    
    try {
      // Delete existing access
      await supabase
        .from('team_vault_access')
        .delete()
        .eq('team_id', teamId)
      
      // Insert new access
      if (vaultIds.length > 0) {
        await insertTeamVaultAccess(
          vaultIds.map(vaultId => ({
            team_id: teamId,
            vault_id: vaultId,
            granted_by: user.id
          }))
        )
      }
      
      // Update store with new team vault access
      setTeamVaultAccessMap({
        ...teamVaultAccessMap,
        [teamId]: vaultIds
      })
      
      addToast('success', `Updated vault access for ${teamName || 'team'}`)
      return true
    } catch (err) {
      addToast('error', 'Failed to update vault access')
      return false
    }
  }, [user, addToast, teamVaultAccessMap, setTeamVaultAccessMap])

  // Get accessible vault IDs for a user
  const getUserAccessibleVaults = useCallback((userId: string): string[] => {
    const accessibleVaultIds: string[] = []
    for (const vaultId of Object.keys(vaultAccessMap)) {
      if (vaultAccessMap[vaultId].includes(userId)) {
        accessibleVaultIds.push(vaultId)
      }
    }
    return accessibleVaultIds
  }, [vaultAccessMap])

  // Get vault access count for a user
  const getUserVaultAccessCount = useCallback((userId: string): number => {
    let count = 0
    for (const vaultId of Object.keys(vaultAccessMap)) {
      if (vaultAccessMap[vaultId].includes(userId)) {
        count++
      }
    }
    return count
  }, [vaultAccessMap])

  // Load vault access on mount if not already loaded
  useEffect(() => {
    if (orgId && !orgVaultsLoaded && !isLoading) {
      loadAll()
    }
  }, [orgId, orgVaultsLoaded, isLoading, loadAll])

  // Reload when vaultsRefreshKey changes (vault created/deleted elsewhere)
  useEffect(() => {
    // Skip initial mount - only reload on actual changes
    if (vaultsRefreshKey !== prevRefreshKeyRef.current) {
      prevRefreshKeyRef.current = vaultsRefreshKey
      if (orgId) {
        log.debug('[VaultAccess]', 'Reloading vaults due to refresh trigger')
        loadAll()
      }
    }
  }, [orgId, vaultsRefreshKey, loadAll])

  return {
    vaults,
    vaultAccessMap,
    teamVaultAccessMap,
    isLoading,
    loadVaults,
    loadVaultAccess,
    loadTeamVaultAccess,
    loadAll,
    saveUserVaultAccess,
    saveTeamVaultAccess,
    getUserAccessibleVaults,
    getUserVaultAccessCount
  }
}
