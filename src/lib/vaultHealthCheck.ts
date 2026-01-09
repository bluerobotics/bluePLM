/**
 * Vault Sync Stats Module
 * 
 * Calculates sync statistics for the Vault Setup Dialog.
 * Compares local files with server state to show sync breakdown.
 */

import { getFilesLightweight } from './supabase'
import { log } from './logger'
import type { VaultSyncStats } from '@/components/shared/Dialogs'

/**
 * Quickly calculate sync stats comparing local files with server.
 * Used by VaultSetupDialog to show sync status breakdown.
 * 
 * @param vaultPath - Local vault directory path
 * @param vaultId - Server vault ID
 * @param orgId - Organization ID  
 * @returns Sync stats for display
 */
export async function calculateVaultSyncStats(
  vaultPath: string,
  vaultId: string,
  orgId: string
): Promise<VaultSyncStats> {
  log.info('[VaultHealth]', 'Calculating sync stats', { vaultPath, vaultId })
  
  const stats: VaultSyncStats = {
    serverFileCount: 0,
    serverTotalSize: 0,
    localFileCount: 0,
    syncedCount: 0,
    cloudOnlyCount: 0,
    localOnlyCount: 0,
    outdatedCount: 0
  }
  
  try {
    // Scan local files
    if (!window.electronAPI) {
      throw new Error('Electron API not available')
    }
    
    const localResult = await window.electronAPI.listWorkingFiles()
    if (!localResult.success || !localResult.files) {
      log.warn('[VaultHealth]', 'Could not scan local files', { error: localResult.error })
      // Continue without local files - just show server stats
    } else {
      const localFiles = localResult.files.filter(f => !f.isDirectory)
      stats.localFileCount = localFiles.length
      
      // Create lookup by path (case-insensitive)
      const localByPath = new Map<string, typeof localFiles[0]>()
      for (const lf of localFiles) {
        localByPath.set(lf.relativePath.toLowerCase(), lf)
      }
      
      // Fetch server files
      const { files: serverFiles, error: serverError } = await getFilesLightweight(orgId, vaultId)
      if (serverError || !serverFiles) {
        log.warn('[VaultHealth]', 'Could not fetch server files', { error: serverError?.message })
        return stats
      }
      
      stats.serverFileCount = serverFiles.length
      stats.serverTotalSize = serverFiles.reduce((sum, f) => sum + (f.file_size || 0), 0)
      
      // Track matched local files
      const matchedLocalPaths = new Set<string>()
      
      // Compare each server file with local
      for (const serverFile of serverFiles) {
        const lookupKey = serverFile.file_path.toLowerCase()
        const localFile = localByPath.get(lookupKey)
        
        if (!localFile) {
          // Server file not present locally
          stats.cloudOnlyCount++
        } else {
          matchedLocalPaths.add(lookupKey)
          
          // Compare hashes if available
          const localHash = localFile.hash || null
          const serverHash = serverFile.content_hash || null
          
          if (localHash && serverHash) {
            if (localHash === serverHash) {
              stats.syncedCount++
            } else {
              stats.outdatedCount++
            }
          } else {
            // No hash to compare - assume synced if local file exists
            stats.syncedCount++
          }
        }
      }
      
      // Count local-only files (exist locally but not on server)
      for (const lf of localFiles) {
        if (!matchedLocalPaths.has(lf.relativePath.toLowerCase())) {
          stats.localOnlyCount++
        }
      }
      
      log.info('[VaultHealth]', 'Sync stats calculated', { ...stats })
      return stats
    }
    
    // If we couldn't scan local, just fetch server stats
    const { files: serverFiles, error: serverError } = await getFilesLightweight(orgId, vaultId)
    if (serverError || !serverFiles) {
      log.warn('[VaultHealth]', 'Could not fetch server files', { error: serverError?.message })
      return stats
    }
    
    stats.serverFileCount = serverFiles.length
    stats.serverTotalSize = serverFiles.reduce((sum, f) => sum + (f.file_size || 0), 0)
    stats.cloudOnlyCount = serverFiles.length // All are cloud-only if no local files
    
    return stats
  } catch (err) {
    log.error('[VaultHealth]', 'Error calculating sync stats', { error: String(err) })
    return stats
  }
}