/**
 * Local Sync Index - IndexedDB-based tracking of previously synced files
 * 
 * This module tracks which files have been synced to each vault. When a file
 * exists locally but is not on the server AND is in the sync index, it means
 * another user deleted it from the vault - these are "orphaned" files.
 * 
 * This allows distinguishing between:
 * - Files the user created locally (genuinely new) - NOT in sync index
 * - Files that were previously synced but deleted by another user (orphaned) - IN sync index
 * 
 * The sync index is updated when:
 * - Files are synced (first check-in)
 * - Files are downloaded
 * - Files are checked out
 * - Server file list is loaded (all server files are marked as "known synced")
 * - Files are deleted from server (removed from index)
 * - Orphaned files are discarded (removed from index)
 */

const DB_NAME = 'blueplm-sync-index'
const DB_VERSION = 1
const STORE_NAME = 'sync-index'

interface SyncIndexEntry {
  key: string          // vaultId:relativePath (compound key)
  vaultId: string
  relativePath: string // lowercase for case-insensitive matching
  lastSyncedAt: number // timestamp
}

let dbPromise: Promise<IDBDatabase> | null = null

/**
 * Open or create the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => {
      console.error('[SyncIndex] Failed to open IndexedDB:', request.error)
      reject(request.error)
    }
    
    request.onsuccess = () => {
      resolve(request.result)
    }
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      // Delete old object store on version upgrade
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
        console.log('[SyncIndex] Cleared old sync index on version upgrade')
      }
      
      // Create object store with compound key
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      store.createIndex('vaultId', 'vaultId', { unique: false })
      store.createIndex('relativePath', 'relativePath', { unique: false })
    }
  })
  
  return dbPromise
}

/**
 * Generate compound key for sync index entry
 */
function makeKey(vaultId: string, relativePath: string): string {
  return `${vaultId}:${relativePath.toLowerCase()}`
}

/**
 * Get the sync index for a vault - returns Set of previously synced paths (lowercase)
 * This is the main function used during file loading to detect orphaned files.
 */
export async function getSyncIndex(vaultId: string): Promise<Set<string>> {
  try {
    const db = await openDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('vaultId')
      const request = index.getAll(IDBKeyRange.only(vaultId))
      
      request.onsuccess = () => {
        const entries = request.result as SyncIndexEntry[]
        const pathSet = new Set(entries.map(e => e.relativePath))
        console.log(`[SyncIndex] Loaded ${pathSet.size} synced paths for vault ${vaultId}`)
        resolve(pathSet)
      }
      
      request.onerror = () => {
        console.error('[SyncIndex] Failed to read sync index:', request.error)
        resolve(new Set())
      }
    })
  } catch (error) {
    console.error('[SyncIndex] Error reading sync index:', error)
    return new Set()
  }
}

/**
 * Add paths to the sync index for a vault.
 * Called after successful sync, download, checkout, or when loading server files.
 * 
 * @param vaultId - The vault ID
 * @param paths - Array of relative paths (will be lowercased for storage)
 */
export async function addToSyncIndex(vaultId: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  
  try {
    const db = await openDB()
    const now = Date.now()
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      let completed = 0
      let errors = 0
      
      for (const path of paths) {
        const normalizedPath = path.toLowerCase()
        const entry: SyncIndexEntry = {
          key: makeKey(vaultId, path),
          vaultId,
          relativePath: normalizedPath,
          lastSyncedAt: now
        }
        
        const request = store.put(entry)
        request.onsuccess = () => {
          completed++
          if (completed + errors === paths.length) {
            console.log(`[SyncIndex] Added ${completed} paths to sync index for vault ${vaultId}`)
            resolve()
          }
        }
        request.onerror = () => {
          errors++
          if (completed + errors === paths.length) {
            if (errors > 0) {
              console.warn(`[SyncIndex] Added ${completed} paths with ${errors} errors`)
            }
            resolve()
          }
        }
      }
    })
  } catch (error) {
    console.error('[SyncIndex] Error adding to sync index:', error)
  }
}

/**
 * Remove paths from the sync index for a vault.
 * Called when files are deleted from server or when orphaned files are discarded.
 * 
 * @param vaultId - The vault ID
 * @param paths - Array of relative paths to remove
 */
export async function removeFromSyncIndex(vaultId: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  
  try {
    const db = await openDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      let completed = 0
      let errors = 0
      
      for (const path of paths) {
        const key = makeKey(vaultId, path)
        const request = store.delete(key)
        
        request.onsuccess = () => {
          completed++
          if (completed + errors === paths.length) {
            console.log(`[SyncIndex] Removed ${completed} paths from sync index for vault ${vaultId}`)
            resolve()
          }
        }
        request.onerror = () => {
          errors++
          if (completed + errors === paths.length) {
            resolve()
          }
        }
      }
    })
  } catch (error) {
    console.error('[SyncIndex] Error removing from sync index:', error)
  }
}

/**
 * Clear the entire sync index for a vault.
 * Called when a vault is disconnected.
 * 
 * @param vaultId - The vault ID to clear
 */
export async function clearSyncIndex(vaultId: string): Promise<void> {
  try {
    const db = await openDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('vaultId')
      
      // First get all keys for this vault
      const keysRequest = index.getAllKeys(IDBKeyRange.only(vaultId))
      
      keysRequest.onsuccess = () => {
        const keys = keysRequest.result
        
        if (keys.length === 0) {
          console.log(`[SyncIndex] No entries to clear for vault ${vaultId}`)
          resolve()
          return
        }
        
        let deleted = 0
        for (const key of keys) {
          const deleteRequest = store.delete(key)
          deleteRequest.onsuccess = () => {
            deleted++
            if (deleted === keys.length) {
              console.log(`[SyncIndex] Cleared ${deleted} entries for vault ${vaultId}`)
              resolve()
            }
          }
          deleteRequest.onerror = () => {
            deleted++
            if (deleted === keys.length) {
              resolve()
            }
          }
        }
      }
      
      keysRequest.onerror = () => {
        console.error('[SyncIndex] Failed to get keys for clearing:', keysRequest.error)
        resolve()
      }
    })
  } catch (error) {
    console.error('[SyncIndex] Error clearing sync index:', error)
  }
}

/**
 * Bulk update the sync index with all server files.
 * This is an optimized version that replaces the entire index for a vault.
 * Called during file loading to ensure all server files are tracked.
 * 
 * @param vaultId - The vault ID
 * @param serverPaths - Array of all server file paths
 */
export async function updateSyncIndexFromServer(vaultId: string, serverPaths: string[]): Promise<void> {
  if (serverPaths.length === 0) return
  
  try {
    const db = await openDB()
    const now = Date.now()
    
    // For efficiency, we use a single transaction to:
    // 1. Get existing entries (to preserve lastSyncedAt for unchanged files)
    // 2. Add/update all server paths
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      // Create entries for all server paths
      let completed = 0
      
      for (const path of serverPaths) {
        const normalizedPath = path.toLowerCase()
        const entry: SyncIndexEntry = {
          key: makeKey(vaultId, path),
          vaultId,
          relativePath: normalizedPath,
          lastSyncedAt: now
        }
        
        const request = store.put(entry)
        request.onsuccess = () => {
          completed++
          if (completed === serverPaths.length) {
            console.log(`[SyncIndex] Updated sync index with ${serverPaths.length} server paths`)
            resolve()
          }
        }
        request.onerror = () => {
          completed++
          if (completed === serverPaths.length) {
            resolve()
          }
        }
      }
    })
  } catch (error) {
    console.error('[SyncIndex] Error updating sync index from server:', error)
  }
}

/**
 * Check if a specific path is in the sync index for a vault.
 * 
 * @param vaultId - The vault ID
 * @param relativePath - The relative path to check
 * @returns True if the path was previously synced
 */
export async function isInSyncIndex(vaultId: string, relativePath: string): Promise<boolean> {
  try {
    const db = await openDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const key = makeKey(vaultId, relativePath)
      const request = store.get(key)
      
      request.onsuccess = () => {
        resolve(!!request.result)
      }
      
      request.onerror = () => {
        console.error('[SyncIndex] Failed to check sync index:', request.error)
        resolve(false)
      }
    })
  } catch (error) {
    console.error('[SyncIndex] Error checking sync index:', error)
    return false
  }
}

/**
 * Get statistics about the sync index for a vault.
 * Useful for debugging and UI display.
 */
export async function getSyncIndexStats(vaultId: string): Promise<{ count: number; oldestSync: number | null; newestSync: number | null }> {
  try {
    const db = await openDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('vaultId')
      const request = index.getAll(IDBKeyRange.only(vaultId))
      
      request.onsuccess = () => {
        const entries = request.result as SyncIndexEntry[]
        if (entries.length === 0) {
          resolve({ count: 0, oldestSync: null, newestSync: null })
          return
        }
        
        let oldest = entries[0].lastSyncedAt
        let newest = entries[0].lastSyncedAt
        
        for (const entry of entries) {
          if (entry.lastSyncedAt < oldest) oldest = entry.lastSyncedAt
          if (entry.lastSyncedAt > newest) newest = entry.lastSyncedAt
        }
        
        resolve({
          count: entries.length,
          oldestSync: oldest,
          newestSync: newest
        })
      }
      
      request.onerror = () => {
        resolve({ count: 0, oldestSync: null, newestSync: null })
      }
    })
  } catch (error) {
    console.error('[SyncIndex] Error getting stats:', error)
    return { count: 0, oldestSync: null, newestSync: null }
  }
}
