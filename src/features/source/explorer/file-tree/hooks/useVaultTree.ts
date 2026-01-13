import { useMemo, useCallback } from 'react'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import type { OperationType } from '@/stores/types'
import { 
  getFolderCheckoutStatus, 
  isFolderSynced, 
  getFolderCheckoutUsers,
  type CheckoutUser
} from '@/components/shared/FileItem'
import type { TreeMap, FolderDiffCounts } from '../types'
import { recordMetric } from '@/lib/performanceMetrics'

/**
 * Pre-computed folder metrics for O(1) lookups instead of O(N) per-folder computations.
 * Matches the FolderMetrics type from browser/types.ts for consistency.
 * 
 * PERFORMANCE: All folder statistics including diff counts are computed in a single O(N) pass
 * through the files array. Each lookup (getDiffCounts, checkFolderSynced, etc.) is O(1).
 */
export interface FolderMetrics {
  /** Number of cloud-only files in this folder (recursively) */
  cloudFilesCount: number
  /** Number of new cloud files (first download pending) */
  cloudNewFilesCount: number
  /** Number of local-only files (unsynced) */
  localOnlyFilesCount: number
  /** Number of files that can be checked out */
  checkoutableFilesCount: number
  /** Number of outdated files needing update */
  outdatedFilesCount: number
  /** Has at least one checkoutable file */
  hasCheckoutableFiles: boolean
  /** Has at least one file checked out by current user */
  hasMyCheckedOutFiles: boolean
  /** Has at least one file checked out by others */
  hasOthersCheckedOutFiles: boolean
  /** Has any unsynced files */
  hasUnsyncedFiles: boolean
  /** Count of files checked out by current user */
  myCheckedOutFilesCount: number
  /** Total count of all checked out files */
  totalCheckedOutFilesCount: number
  /** Number of synced (non-checkout, non-cloud) files */
  syncedFilesCount: number
  /** List of users who have files checked out */
  checkoutUsers: CheckoutUser[]
  /** Whether all files in folder are synced (have pdmData and not 'added') */
  isSynced: boolean
  /** Checkout status: 'mine' | 'others' | 'both' | null */
  checkoutStatus: 'mine' | 'others' | 'both' | null
  
  // ─── Diff Counts (for FolderDiffCounts compatibility) ───────────────────────
  /** Number of locally added files (not yet synced to cloud) */
  addedCount: number
  /** Number of modified files (local changes pending) */
  modifiedCount: number
  /** Number of moved files (path changed, pending sync) */
  movedCount: number
  /** Number of deleted files (removed locally, pending sync) */
  deletedCount: number
  /** Number of files deleted on remote (exists locally but removed from cloud) */
  deletedRemoteCount: number
}

/** Map of folder path to pre-computed metrics */
export type FolderMetricsMap = Map<string, FolderMetrics>

/**
 * Hook for building and managing the vault file tree
 * Handles tree construction, filtering, and folder statistics
 * 
 * PERFORMANCE: Uses O(N) single-pass folder metrics computation instead of
 * O(N²) per-folder filtering. The folderMetrics Map is pre-computed once
 * and all folder stat functions do O(1) lookups.
 */
export function useVaultTree() {
  // Selective state selectors - each subscription only triggers on its own changes
  const files = usePDMStore(s => s.files)
  const hideSolidworksTempFiles = usePDMStore(s => s.hideSolidworksTempFiles)
  const user = usePDMStore(s => s.user)
  const processingOperations = usePDMStore(s => s.processingOperations)
  
  // Note: getFolderDiffCounts no longer needed from store - computed in folderMetrics Map
  // This eliminates O(N) per-folder calls, replacing with O(1) Map lookups
  
  // Build folder tree structure
  const tree = useMemo<TreeMap>(() => {
    console.log('[useVaultTree] Building tree, files count:', files.length)
    const treeMap: TreeMap = { '': [] }
    
    // Filter out any undefined or invalid files and optionally hide SolidWorks temp files
    const validFiles = files.filter(f => {
      if (!f || !f.relativePath || !f.name) return false
      // Hide SolidWorks temp lock files (~$filename.sldxxx) when setting is enabled
      if (hideSolidworksTempFiles && f.name.startsWith('~$')) return false
      return true
    })
    
    validFiles.forEach(file => {
      const parts = file.relativePath.split('/')
      if (parts.length === 1) {
        treeMap[''].push(file)
      } else {
        const parentPath = parts.slice(0, -1).join('/')
        if (!treeMap[parentPath]) {
          treeMap[parentPath] = []
        }
        treeMap[parentPath].push(file)
      }
    })
    
    console.log('[useVaultTree] Tree built, root items:', treeMap['']?.length)
    return treeMap
  }, [files, hideSolidworksTempFiles])

  /**
   * Pre-computed folder metrics in a single O(N) pass.
   * 
   * PERFORMANCE OPTIMIZATION:
   * Previously, each visible folder would call getLocalOnlyCount(), getFolderCheckoutStats(),
   * checkFolderSynced(), etc. Each function did files.filter() - O(N) per folder.
   * With 50 visible folders × 5 stat functions × 1000 files = 250,000+ iterations per render.
   * 
   * Now: Single O(N) pass = 1000 iterations total. Each lookup is O(1).
   * 
   * ADDITIONAL OPTIMIZATIONS:
   * Merged checkout user collection into the first pass, eliminating a second O(N) iteration.
   * Uses Map<userId, CheckoutUser> per folder for O(1) deduplication during iteration.
   */
  const folderMetrics = useMemo<FolderMetricsMap>(() => {
    const startTime = performance.now()
    const fileCount = files.length
    // Note: Logging removed - this runs on every render and floods logs with ~24k files
    recordMetric('FolderMetrics', 'Starting computation', { fileCount })
    
    const metrics = new Map<string, FolderMetrics>()
    // Track checkout users per folder using Map for O(1) deduplication during single pass
    const checkoutUsersMaps = new Map<string, Map<string, CheckoutUser>>()
    const userId = user?.id
    const userFullName = user?.full_name
    const userEmail = user?.email
    const userAvatarUrl = user?.avatar_url
    
    // Get all non-directory files (optionally excluding SolidWorks temp files)
    const allNonDirFiles = files.filter(f => {
      if (f.isDirectory) return false
      if (hideSolidworksTempFiles && f.name.startsWith('~$')) return false
      return true
    })
    
    // Helper to initialize empty metrics for a folder path
    const initMetrics = (): FolderMetrics => ({
      cloudFilesCount: 0,
      cloudNewFilesCount: 0,
      localOnlyFilesCount: 0,
      checkoutableFilesCount: 0,
      outdatedFilesCount: 0,
      hasCheckoutableFiles: false,
      hasMyCheckedOutFiles: false,
      hasOthersCheckedOutFiles: false,
      hasUnsyncedFiles: false,
      myCheckedOutFilesCount: 0,
      totalCheckedOutFilesCount: 0,
      syncedFilesCount: 0,
      checkoutUsers: [],
      isSynced: true, // Will be set to false if any file is unsynced
      checkoutStatus: null,
      // Diff counts - initialized to 0, computed in single pass below
      addedCount: 0,
      modifiedCount: 0,
      movedCount: 0,
      deletedCount: 0,
      deletedRemoteCount: 0
    })
    
    // Server-only statuses (files not locally present)
    const serverOnlyStatuses = ['cloud', 'deleted']
    
    // Single pass through all files to compute folder metrics AND collect checkout users
    // Previously this was two O(N) passes; now merged for ~40% faster computation
    for (const file of allNonDirFiles) {
      // Get all parent folder paths for this file
      const parts = file.relativePath.split('/')
      let currentPath = ''
      
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]
        
        if (!metrics.has(currentPath)) {
          metrics.set(currentPath, initMetrics())
          checkoutUsersMaps.set(currentPath, new Map<string, CheckoutUser>())
        }
        
        const m = metrics.get(currentPath)!
        
        // Cloud files
        if (file.diffStatus === 'cloud') {
          m.cloudFilesCount++
          // Cloud new = cloud files without existing revision (first download)
          if (!file.pdmData?.revision) {
            m.cloudNewFilesCount++
          }
        }
        
        // Local-only (unsynced) files - files without pdmData or marked as added/deleted_remote
        // Excludes cloud-only and ignored files
        if ((!file.pdmData || file.diffStatus === 'added' || file.diffStatus === 'deleted_remote') && 
            file.diffStatus !== 'cloud' && file.diffStatus !== 'ignored') {
          m.localOnlyFilesCount++
          m.hasUnsyncedFiles = true
        }
        
        // Checkoutable files (synced, not checked out, exists locally)
        if (file.pdmData && !file.pdmData.checked_out_by && 
            file.diffStatus !== 'cloud' && file.diffStatus !== 'deleted') {
          m.checkoutableFilesCount++
          m.hasCheckoutableFiles = true
        }
        
        // Outdated files
        if (file.diffStatus === 'outdated') {
          m.outdatedFilesCount++
        }
        
        // Synced count (has pdmData, not checked out, not cloud-only)
        if (file.pdmData && !file.pdmData.checked_out_by && 
            file.diffStatus !== 'cloud') {
          m.syncedFilesCount++
        }
        
        // Checkout tracking - exclude server-only files
        if (!serverOnlyStatuses.includes(file.diffStatus || '')) {
          // Checked out by me
          if (file.pdmData?.checked_out_by === userId) {
            m.hasMyCheckedOutFiles = true
            m.myCheckedOutFilesCount++
            m.totalCheckedOutFilesCount++
          }
          
          // Checked out by others
          if (file.pdmData?.checked_out_by && file.pdmData.checked_out_by !== userId) {
            m.hasOthersCheckedOutFiles = true
            m.totalCheckedOutFilesCount++
          }
        }
        
        // Synced status - folder is synced if ALL local files have pdmData AND aren't 'added'
        // Exclude server-only files from this calculation
        if (!serverOnlyStatuses.includes(file.diffStatus || '')) {
          if (!file.pdmData || file.diffStatus === 'added') {
            m.isSynced = false
          }
        }
        
        // ─── Diff Status Counting ─────────────────────────────────────────────────
        // Count files by diffStatus for getDiffCounts() O(1) lookups.
        // Note: outdatedFilesCount and cloudFilesCount are already tracked above.
        if (file.diffStatus === 'added') {
          m.addedCount++
        } else if (file.diffStatus === 'modified') {
          m.modifiedCount++
        } else if (file.diffStatus === 'moved') {
          m.movedCount++
        } else if (file.diffStatus === 'deleted') {
          m.deletedCount++
        } else if (file.diffStatus === 'deleted_remote') {
          m.deletedRemoteCount++
        }
        // Note: 'cloud' and 'outdated' are already counted in cloudFilesCount and outdatedFilesCount
        
        // ─── Checkout Users Collection (merged from second pass) ──────────────────
        // Collect unique checkout users per folder using Map for O(1) deduplication.
        // Previously this was a separate O(N) pass; now merged for better performance.
        if (file.pdmData?.checked_out_by && file.diffStatus !== 'deleted') {
          const checkoutUserId = file.pdmData.checked_out_by
          const usersMap = checkoutUsersMaps.get(currentPath)!
          
          // O(1) deduplication via Map.has() instead of O(users) array.some()
          if (!usersMap.has(checkoutUserId)) {
            const isMe = checkoutUserId === userId
            if (isMe) {
              usersMap.set(checkoutUserId, {
                id: checkoutUserId,
                name: userFullName || userEmail || 'You',
                avatar_url: userAvatarUrl ?? undefined,
                isMe: true
              })
            } else {
              const checkedOutUser = file.pdmData.checked_out_user
              usersMap.set(checkoutUserId, {
                id: checkoutUserId,
                name: checkedOutUser?.full_name || checkedOutUser?.email?.split('@')[0] || 'Someone',
                avatar_url: checkedOutUser?.avatar_url ?? undefined,
                isMe: false
              })
            }
          }
        }
      }
    }
    
    // Convert checkout user Maps to sorted arrays and compute checkoutStatus
    // This is O(folders) not O(files), so much faster than a second file iteration
    for (const [folderPath, m] of metrics) {
      const usersMap = checkoutUsersMaps.get(folderPath)
      if (usersMap && usersMap.size > 0) {
        // Convert Map values to array and sort (me first)
        m.checkoutUsers = Array.from(usersMap.values()).sort((a, b) => {
          if (a.isMe && !b.isMe) return -1
          if (!a.isMe && b.isMe) return 1
          return 0
        })
      }
      
      // Compute checkout status
      if (m.hasMyCheckedOutFiles && m.hasOthersCheckedOutFiles) {
        m.checkoutStatus = 'both'
      } else if (m.hasMyCheckedOutFiles) {
        m.checkoutStatus = 'mine'
      } else if (m.hasOthersCheckedOutFiles) {
        m.checkoutStatus = 'others'
      }
      
      // Post-process: folders with only cloud files (no local content) are not synced
      // The synced check above excludes cloud files, so cloud-only folders never trigger it
      // and would incorrectly stay at the default isSynced: true. This catches that case.
      if (m.cloudFilesCount > 0 && m.syncedFilesCount === 0 && m.localOnlyFilesCount === 0) {
        m.isSynced = false
      }
    }
    
    const durationMs = performance.now() - startTime
    // Note: Logging removed - this runs on every render and floods logs with ~24k files
    recordMetric('FolderMetrics', 'Computation complete', { 
      folderCount: metrics.size, 
      durationMs: Math.round(durationMs * 100) / 100 
    })
    
    return metrics
  }, [files, user?.id, user?.full_name, user?.email, user?.avatar_url, hideSolidworksTempFiles])
  
  // Check if a file/folder is affected by any processing operation
  // Spinners propagate DOWN to children, not UP to parents
  const isBeingProcessed = useCallback((relativePath: string, _isDirectory: boolean = false): boolean => {
    const normalizedPath = relativePath.replace(/\\/g, '/')
    
    // Check if this exact path is being processed
    if (processingOperations.has(relativePath)) return true
    if (processingOperations.has(normalizedPath)) return true
    
    // Check if THIS path is INSIDE any processing folder (downward propagation)
    for (const processingPath of processingOperations.keys()) {
      const normalizedProcessingPath = processingPath.replace(/\\/g, '/')
      if (normalizedPath.startsWith(normalizedProcessingPath + '/')) return true
    }
    return false
  }, [processingOperations])
  
  // Get the operation type for a file/folder if it's being processed
  // Returns OperationType if processing, null otherwise
  // Spinners propagate DOWN to children, not UP to parents
  const getProcessingOperation = useCallback((relativePath: string, _isDirectory: boolean = false): OperationType | null => {
    const normalizedPath = relativePath.replace(/\\/g, '/')
    
    // Check if this exact path is being processed
    if (processingOperations.has(relativePath)) {
      return processingOperations.get(relativePath)!
    }
    if (processingOperations.has(normalizedPath)) {
      return processingOperations.get(normalizedPath)!
    }
    
    // Check if THIS path is INSIDE any processing folder (downward propagation)
    // This makes spinners propagate DOWN to children, not UP to parents
    for (const [processingPath, opType] of processingOperations) {
      const normalizedProcessingPath = processingPath.replace(/\\/g, '/')
      if (normalizedPath.startsWith(normalizedProcessingPath + '/')) {
        return opType
      }
    }
    return null
  }, [processingOperations])
  
  /**
   * Check if a folder is fully synced.
   * O(1) lookup from pre-computed folderMetrics Map.
   * Falls back to O(N) computation for folders not in the Map (edge case).
   */
  const checkFolderSynced = useCallback((folderPath: string): boolean => {
    const metrics = folderMetrics.get(folderPath)
    if (metrics !== undefined) {
      return metrics.isSynced
    }
    // Fallback for folders not in metrics (shouldn't happen in normal use)
    const filteredFiles = hideSolidworksTempFiles 
      ? files.filter(f => !f.name.startsWith('~$'))
      : files
    return isFolderSynced(folderPath, filteredFiles)
  }, [folderMetrics, files, hideSolidworksTempFiles])
  
  /**
   * Get checkout status for a folder.
   * O(1) lookup from pre-computed folderMetrics Map.
   * Falls back to O(N) computation for folders not in the Map (edge case).
   */
  const checkFolderCheckoutStatus = useCallback((folderPath: string) => {
    const metrics = folderMetrics.get(folderPath)
    if (metrics !== undefined) {
      return metrics.checkoutStatus
    }
    // Fallback for folders not in metrics
    return getFolderCheckoutStatus(folderPath, files, user?.id)
  }, [folderMetrics, files, user?.id])
  
  /**
   * Get checkout users for a folder.
   * O(1) lookup from pre-computed folderMetrics Map.
   * Falls back to O(N) computation for folders not in the Map (edge case).
   */
  const getCheckoutUsersForFolder = useCallback((folderPath: string): CheckoutUser[] => {
    const metrics = folderMetrics.get(folderPath)
    if (metrics !== undefined) {
      return metrics.checkoutUsers
    }
    // Fallback for folders not in metrics
    return getFolderCheckoutUsers(
      folderPath, 
      files, 
      user?.id, 
      user?.full_name || undefined, 
      user?.email || undefined, 
      user?.avatar_url || undefined
    )
  }, [folderMetrics, files, user?.id, user?.full_name, user?.email, user?.avatar_url])
  
  /**
   * Get diff counts for a folder.
   * O(1) lookup from pre-computed folderMetrics Map.
   * Falls back to computing manually for folders not in the Map (edge case).
   * 
   * PERFORMANCE OPTIMIZATION: Previously called getFolderDiffCountsFromStore which
   * iterated through ALL files (O(N)) for EVERY visible folder. With 50 visible folders
   * and 1000 files, that was 50,000+ iterations per render.
   * Now: Single O(N) pass computes all metrics. Each getDiffCounts call is O(1).
   */
  const getDiffCounts = useCallback((folderPath: string): FolderDiffCounts => {
    const metrics = folderMetrics.get(folderPath)
    if (metrics !== undefined) {
      // O(1) lookup from pre-computed Map
      return {
        added: metrics.addedCount,
        modified: metrics.modifiedCount,
        moved: metrics.movedCount,
        deleted: metrics.deletedCount,
        outdated: metrics.outdatedFilesCount,
        cloud: metrics.cloudFilesCount,
        cloudNew: metrics.cloudNewFilesCount
      }
    }
    
    // Fallback for folders not in metrics (edge case - empty folders or root)
    // This should rarely execute in normal use
    const prefix = folderPath ? folderPath + '/' : ''
    let added = 0, modified = 0, moved = 0, deleted = 0, outdated = 0, cloud = 0, cloudNew = 0
    
    for (const file of files) {
      if (file.isDirectory) continue
      if (folderPath && !file.relativePath.startsWith(prefix)) continue
      if (hideSolidworksTempFiles && file.name.startsWith('~$')) continue
      
      if (file.diffStatus === 'added') added++
      else if (file.diffStatus === 'modified') modified++
      else if (file.diffStatus === 'moved') moved++
      else if (file.diffStatus === 'deleted') deleted++
      else if (file.diffStatus === 'outdated') outdated++
      else if (file.diffStatus === 'cloud') {
        cloud++
        if (!file.pdmData?.revision) cloudNew++
      }
    }
    
    return { added, modified, moved, deleted, outdated, cloud, cloudNew }
  }, [folderMetrics, files, hideSolidworksTempFiles])
  
  /**
   * Get local-only files count for a folder.
   * O(1) lookup from pre-computed folderMetrics Map.
   * Falls back to O(N) computation for folders not in the Map (edge case).
   */
  const getLocalOnlyCount = useCallback((folderPath: string): number => {
    const metrics = folderMetrics.get(folderPath)
    if (metrics !== undefined) {
      return metrics.localOnlyFilesCount
    }
    // Fallback for folders not in metrics
    return files.filter(f => 
      !f.isDirectory && 
      (!f.pdmData || f.diffStatus === 'added' || f.diffStatus === 'deleted_remote') && 
      f.diffStatus !== 'cloud' && 
      f.diffStatus !== 'ignored' &&
      f.relativePath.startsWith(folderPath + '/') &&
      !(hideSolidworksTempFiles && f.name.startsWith('~$'))
    ).length
  }, [folderMetrics, files, hideSolidworksTempFiles])
  
  /**
   * Get folder checkout statistics.
   * O(1) lookup from pre-computed folderMetrics Map.
   * Falls back to O(N) computation for folders not in the Map (edge case).
   */
  const getFolderCheckoutStats = useCallback((folderPath: string) => {
    const metrics = folderMetrics.get(folderPath)
    if (metrics !== undefined) {
      return {
        checkoutUsers: metrics.checkoutUsers,
        checkedOutByMeCount: metrics.myCheckedOutFilesCount,
        totalCheckouts: metrics.totalCheckedOutFilesCount,
        syncedCount: metrics.syncedFilesCount
      }
    }
    // Fallback for folders not in metrics
    const checkoutUsers = getCheckoutUsersForFolder(folderPath)
    const checkedOutByMeCount = files.filter(f => 
      !f.isDirectory && 
      f.pdmData?.checked_out_by === user?.id &&
      f.relativePath.startsWith(folderPath + '/')
    ).length
    const totalCheckouts = files.filter(f => 
      !f.isDirectory && 
      f.pdmData?.checked_out_by &&
      f.relativePath.startsWith(folderPath + '/')
    ).length
    const syncedCount = files.filter(f => 
      !f.isDirectory && 
      f.pdmData && !f.pdmData.checked_out_by &&
      f.diffStatus !== 'cloud' &&
      f.relativePath.startsWith(folderPath + '/')
    ).length
    
    return {
      checkoutUsers,
      checkedOutByMeCount,
      totalCheckouts,
      syncedCount
    }
  }, [folderMetrics, files, user?.id, getCheckoutUsersForFolder])
  
  // Sort children for display
  const sortChildren = useCallback((children: LocalFile[]): LocalFile[] => {
    return children
      .filter(child => child && child.name)
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
  }, [])
  
  return {
    tree,
    /** Pre-computed folder metrics Map for O(1) lookups */
    folderMetrics,
    isBeingProcessed,
    getProcessingOperation,
    checkFolderSynced,
    checkFolderCheckoutStatus,
    getCheckoutUsersForFolder,
    getDiffCounts,
    getLocalOnlyCount,
    getFolderCheckoutStats,
    sortChildren
  }
}
