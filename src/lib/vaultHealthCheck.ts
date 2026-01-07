/**
 * Vault Health Check Module
 * 
 * Validates file integrity after major version upgrades.
 * Compares local files with server state and identifies:
 * - Files that are synced correctly (hash match)
 * - Files that need to be re-uploaded (missing blobs in storage)
 * - Files that are genuinely outdated (newer version on server)
 */

import { getFilesLightweight } from './supabase'
import { fileExists } from './storage'
import { log } from './logger'

// ============================================
// Types
// ============================================

export interface FileHealthInfo {
  fileId: string
  fileName: string
  filePath: string
  localHash: string | null
  serverHash: string | null
  version: number
  status: 'synced' | 'needs_reupload' | 'outdated' | 'local_only' | 'cloud_only'
  checkedOutBy?: string | null
}

export interface HealthCheckResult {
  /** Overall vault health status */
  healthy: boolean
  /** Number of files that match between local and server */
  syncedCount: number
  /** Files that need to be re-uploaded (local exists, server blob missing) */
  filesNeedingReupload: FileHealthInfo[]
  /** Files that are genuinely outdated (server has different content) */
  outdatedFiles: FileHealthInfo[]
  /** Files that only exist locally */
  localOnlyCount: number
  /** Files that only exist on server */
  cloudOnlyCount: number
  /** Total files checked */
  totalChecked: number
  /** Errors encountered during check */
  errors: string[]
}

export interface HealthCheckProgress {
  phase: 'scanning_local' | 'fetching_server' | 'comparing' | 'verifying_storage' | 'complete'
  current: number
  total: number
  message: string
}

export type HealthCheckProgressCallback = (progress: HealthCheckProgress) => void

// ============================================
// Helper Functions
// ============================================

/**
 * Batch check if storage blobs exist for given hashes
 */
async function batchCheckStorageExists(
  orgId: string,
  hashes: string[],
  onProgress?: (checked: number, total: number) => void
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>()
  
  // Check in batches of 10 for reasonable parallelism
  const BATCH_SIZE = 10
  let checked = 0
  
  for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
    const batch = hashes.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (hash) => {
        try {
          const exists = await fileExists(orgId, hash)
          return { hash, exists }
        } catch {
          // If we can't check, assume it exists (don't cause false positives)
          return { hash, exists: true }
        }
      })
    )
    
    for (const { hash, exists } of batchResults) {
      results.set(hash, exists)
    }
    
    checked += batch.length
    onProgress?.(checked, hashes.length)
  }
  
  return results
}

// ============================================
// Main Health Check Function
// ============================================

/**
 * Run a full vault health check.
 * 
 * Compares local files with server state and identifies any issues.
 * Call this after a major version migration before normal file loading.
 * 
 * @param vaultPath - Local vault directory path
 * @param vaultId - Server vault ID
 * @param orgId - Organization ID
 * @param onProgress - Optional callback for progress updates
 * @returns Health check results
 */
export async function checkVaultHealth(
  vaultPath: string,
  vaultId: string,
  orgId: string,
  onProgress?: HealthCheckProgressCallback
): Promise<HealthCheckResult> {
  const errors: string[] = []
  
  log.info('[VaultHealth]', 'Starting vault health check', { vaultPath, vaultId })
  
  const result: HealthCheckResult = {
    healthy: true,
    syncedCount: 0,
    filesNeedingReupload: [],
    outdatedFiles: [],
    localOnlyCount: 0,
    cloudOnlyCount: 0,
    totalChecked: 0,
    errors: []
  }
  
  try {
    // Phase 1: Scan local files
    onProgress?.({
      phase: 'scanning_local',
      current: 0,
      total: 0,
      message: 'Scanning local files...'
    })
    
    if (!window.electronAPI) {
      throw new Error('Electron API not available')
    }
    
    const localResult = await window.electronAPI.listWorkingFiles()
    if (!localResult.success || !localResult.files) {
      throw new Error(localResult.error || 'Failed to scan local files')
    }
    
    const localFiles = localResult.files.filter(f => !f.isDirectory)
    log.info('[VaultHealth]', 'Local files scanned', { count: localFiles.length })
    
    // Phase 2: Fetch server files
    onProgress?.({
      phase: 'fetching_server',
      current: 0,
      total: localFiles.length,
      message: 'Fetching server file list...'
    })
    
    const { files: serverFiles, error: serverError } = await getFilesLightweight(orgId, vaultId)
    if (serverError) {
      throw new Error(`Failed to fetch server files: ${serverError.message}`)
    }
    
    const serverFileList = serverFiles || []
    log.info('[VaultHealth]', 'Server files fetched', { count: serverFileList.length })
    
    // Create maps for quick lookup
    const serverByPath = new Map<string, typeof serverFileList[0]>()
    const serverByHash = new Map<string, typeof serverFileList[0]>()
    
    for (const sf of serverFileList) {
      serverByPath.set(sf.file_path.toLowerCase(), sf)
      if (sf.content_hash) {
        serverByHash.set(sf.content_hash, sf)
      }
    }
    
    const localByPath = new Map<string, typeof localFiles[0]>()
    for (const lf of localFiles) {
      localByPath.set(lf.relativePath.toLowerCase(), lf)
    }
    
    // Phase 3: Compare files
    onProgress?.({
      phase: 'comparing',
      current: 0,
      total: localFiles.length + serverFileList.length,
      message: 'Comparing local and server files...'
    })
    
    // Track which server files are matched
    const matchedServerIds = new Set<string>()
    
    // Files that need storage verification
    const hashesToVerify: Array<{ hash: string; file: FileHealthInfo }> = []
    
    // Process local files
    for (const localFile of localFiles) {
      const lookupKey = localFile.relativePath.toLowerCase()
      const serverFile = serverByPath.get(lookupKey)
      
      result.totalChecked++
      
      if (!serverFile) {
        // Local only
        result.localOnlyCount++
        continue
      }
      
      matchedServerIds.add(serverFile.id)
      
      // Compare hashes
      const localHash = localFile.hash || null
      const serverHash = serverFile.content_hash || null
      
      if (localHash && serverHash && localHash === serverHash) {
        // Perfect match - synced
        result.syncedCount++
      } else if (localHash && serverHash && localHash !== serverHash) {
        // Hash mismatch - could be outdated OR storage issue
        // We need to verify if the server blob actually exists
        const fileInfo: FileHealthInfo = {
          fileId: serverFile.id,
          fileName: serverFile.file_name,
          filePath: serverFile.file_path,
          localHash,
          serverHash,
          version: serverFile.version,
          status: 'outdated', // Will be updated after storage check
          checkedOutBy: serverFile.checked_out_by
        }
        
        hashesToVerify.push({ hash: serverHash, file: fileInfo })
      } else if (!localHash && serverHash) {
        // Local hash not computed yet - treat as synced for now
        // The normal file loading will compute hashes
        result.syncedCount++
      } else {
        // No hashes to compare - treat as synced
        result.syncedCount++
      }
    }
    
    // Count cloud-only files
    for (const serverFile of serverFileList) {
      if (!matchedServerIds.has(serverFile.id)) {
        const localPath = serverFile.file_path.toLowerCase()
        if (!localByPath.has(localPath)) {
          result.cloudOnlyCount++
        }
      }
    }
    
    // Phase 4: Verify storage for mismatched files
    if (hashesToVerify.length > 0) {
      onProgress?.({
        phase: 'verifying_storage',
        current: 0,
        total: hashesToVerify.length,
        message: `Verifying ${hashesToVerify.length} file(s) in cloud storage...`
      })
      
      const uniqueHashes = [...new Set(hashesToVerify.map(h => h.hash))]
      const existsMap = await batchCheckStorageExists(
        orgId,
        uniqueHashes,
        (checked, total) => {
          onProgress?.({
            phase: 'verifying_storage',
            current: checked,
            total,
            message: `Verifying cloud storage (${checked}/${total})...`
          })
        }
      )
      
      // Categorize files based on storage existence
      for (const { hash, file } of hashesToVerify) {
        const blobExists = existsMap.get(hash) ?? true
        
        if (!blobExists) {
          // Storage blob is missing - needs re-upload
          file.status = 'needs_reupload'
          result.filesNeedingReupload.push(file)
        } else {
          // Blob exists, this is a genuine outdated file
          file.status = 'outdated'
          result.outdatedFiles.push(file)
        }
      }
    }
    
    // Determine overall health
    result.healthy = result.filesNeedingReupload.length === 0
    
    log.info('[VaultHealth]', 'Health check complete', {
      synced: result.syncedCount,
      needingReupload: result.filesNeedingReupload.length,
      outdated: result.outdatedFiles.length,
      localOnly: result.localOnlyCount,
      cloudOnly: result.cloudOnlyCount
    })
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    errors.push(errorMsg)
    result.errors = errors
    result.healthy = false
    log.error('[VaultHealth]', 'Health check failed', { error: errorMsg })
  }
  
  onProgress?.({
    phase: 'complete',
    current: result.totalChecked,
    total: result.totalChecked,
    message: 'Health check complete'
  })
  
  result.errors = errors
  return result
}

/**
 * Re-sync files that have missing storage blobs.
 * Checks out each file and immediately checks it back in to re-upload content.
 * 
 * @param files - Files to re-sync
 * @param onProgress - Progress callback
 * @returns Summary of operations
 */
export async function resyncFiles(
  files: FileHealthInfo[],
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const { executeCommand } = await import('./commands/executor')
  const { usePDMStore } = await import('@/stores/pdmStore')
  
  let succeeded = 0
  let failed = 0
  const errors: string[] = []
  
  const allFiles = usePDMStore.getState().files
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onProgress?.(i + 1, files.length, file.fileName)
    
    // Find the local file object
    const localFile = allFiles.find(f => f.pdmData?.id === file.fileId)
    if (!localFile) {
      errors.push(`${file.fileName}: Could not find local file`)
      failed++
      continue
    }
    
    // Skip if checked out by someone else
    if (file.checkedOutBy && file.checkedOutBy !== usePDMStore.getState().user?.id) {
      errors.push(`${file.fileName}: Checked out by another user`)
      failed++
      continue
    }
    
    try {
      // Checkout the file
      const checkoutResult = await executeCommand('checkout', { files: [localFile] })
      if (checkoutResult.failed > 0) {
        errors.push(`${file.fileName}: Checkout failed`)
        failed++
        continue
      }
      
      // Immediately check it back in (re-uploads content)
      const checkinResult = await executeCommand('checkin', { 
        files: [localFile],
        comment: 'Re-synced after vault migration'
      })
      
      if (checkinResult.failed > 0) {
        errors.push(`${file.fileName}: Check-in failed`)
        failed++
      } else {
        succeeded++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${file.fileName}: ${msg}`)
      failed++
    }
  }
  
  log.info('[VaultHealth]', 'Resync complete', { succeeded, failed })
  
  return { succeeded, failed, errors }
}
