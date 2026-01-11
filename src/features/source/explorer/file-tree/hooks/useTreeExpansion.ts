import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePDMStore } from '@/stores/pdmStore'

/**
 * Hook for managing tree expansion state
 * Handles both folder expansion and vault expansion
 */
export function useTreeExpansion() {
  // Selective state selectors - each subscription only triggers on its own changes
  const expandedFolders = usePDMStore(s => s.expandedFolders)
  const connectedVaults = usePDMStore(s => s.connectedVaults)
  
  // Actions grouped with useShallow
  const { toggleFolder, toggleVaultExpanded } = usePDMStore(
    useShallow(s => ({ toggleFolder: s.toggleFolder, toggleVaultExpanded: s.toggleVaultExpanded }))
  )
  
  // Check if a folder is expanded
  const isExpanded = useCallback((path: string) => {
    return expandedFolders.has(path)
  }, [expandedFolders])
  
  // Check if a vault is expanded
  const isVaultExpanded = useCallback((vaultId: string) => {
    const vault = connectedVaults.find(v => v.id === vaultId)
    return vault?.isExpanded ?? false
  }, [connectedVaults])
  
  // Toggle expansion for a folder
  const toggleExpansion = useCallback((path: string) => {
    toggleFolder(path)
  }, [toggleFolder])
  
  // Toggle expansion for a vault
  const toggleVaultExpansion = useCallback((vaultId: string) => {
    toggleVaultExpanded(vaultId)
  }, [toggleVaultExpanded])
  
  return { 
    isExpanded, 
    isVaultExpanded,
    toggleExpansion, 
    toggleVaultExpansion,
    expandedFolders 
  }
}
