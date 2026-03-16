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
const DB_VERSION = 3
const STORE_NAME = 'sync-index'

interface SyncIndexEntry {
  key: string          // vaultId:relativePath (compound key)
  vaultId: string
  relativePath: string // lowercase for case-insensitive matching
  lastSyncedAt: number // timestamp
  ino?: number         // NTFS file index number (survives renames)
  localVersion?: number  // last known synced version (survives app restart)
  localHash?: string     // last known content hash (survives app restart)
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
      
      // Non-destructive: only create the store if it doesn't exist.
      // New optional fields (localVersion, localHash) don't need schema changes
      // because IndexedDB records are schemaless.
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        store.createIndex('vaultId', 'vaultId', { unique: false })
        store.createIndex('relativePath', 'relativePath', { unique: false })
      }
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
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const vaultIndex = store.index('vaultId')
      
      // Pre-read existing entries to preserve ino, localVersion, and localHash values.
      // store.put() replaces the entire record, so without this those fields
      // would be wiped on every load.
      const existingRequest = vaultIndex.getAll(IDBKeyRange.only(vaultId))
      existingRequest.onsuccess = () => {
        const existingEntries = existingRequest.result as SyncIndexEntry[]
        const existingDataMap = new Map<string, { ino?: number; localVersion?: number; localHash?: string }>()
        for (const e of existingEntries) {
          if (e.ino || e.localVersion !== undefined || e.localHash) {
            existingDataMap.set(e.key, { ino: e.ino, localVersion: e.localVersion, localHash: e.localHash })
          }
        }
        
        // Prune stale entries whose paths are no longer on the server.
        // These accumulate from renames and prevent correct inode detection.
        const serverKeySet = new Set(serverPaths.map(p => makeKey(vaultId, p)))
        for (const existing of existingEntries) {
          if (!serverKeySet.has(existing.key)) {
            store.delete(existing.key)
          }
        }
        
        let completed = 0
        
        for (const path of serverPaths) {
          const key = makeKey(vaultId, path)
          const existingData = existingDataMap.get(key)
          const entry: SyncIndexEntry = {
            key,
            vaultId,
            relativePath: path.toLowerCase(),
            lastSyncedAt: now,
            ino: existingData?.ino,
            localVersion: existingData?.localVersion,
            localHash: existingData?.localHash
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
      }
      
      existingRequest.onerror = () => {
        console.error('[SyncIndex] Failed to pre-read existing entries, falling back to no-ino update')
        let completed = 0
        for (const path of serverPaths) {
          const entry: SyncIndexEntry = {
            key: makeKey(vaultId, path),
            vaultId,
            relativePath: path.toLowerCase(),
            lastSyncedAt: now
          }
          const request = store.put(entry)
          request.onsuccess = () => { completed++; if (completed === serverPaths.length) resolve() }
          request.onerror = () => { completed++; if (completed === serverPaths.length) resolve() }
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
 * Get a map of inode -> relativePath for all entries that have an inode recorded.
 * Used during file loading for rename detection: if a local file's inode matches
 * a previously-synced path's inode, it was renamed (not a new file).
 */
export async function getInodeMap(vaultId: string): Promise<Map<number, string[]>> {
  try {
    const db = await openDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('vaultId')
      const request = index.getAll(IDBKeyRange.only(vaultId))
      
      request.onsuccess = () => {
        const entries = request.result as SyncIndexEntry[]
        const map = new Map<number, string[]>()
        for (const entry of entries) {
          if (entry.ino && entry.ino > 0) {
            const existing = map.get(entry.ino)
            if (existing) {
              existing.push(entry.relativePath)
            } else {
              map.set(entry.ino, [entry.relativePath])
            }
          }
        }
        console.log(`[SyncIndex] Loaded inode map: ${map.size} entries with inodes for vault ${vaultId}`)
        resolve(map)
      }
      
      request.onerror = () => {
        console.error('[SyncIndex] Failed to read inode map:', request.error)
        resolve(new Map())
      }
    })
  } catch (error) {
    console.error('[SyncIndex] Error reading inode map:', error)
    return new Map()
  }
}

/**
 * Batch-update inodes (and optionally localVersion/localHash) for sync index entries.
 * Called after file loading to persist the current inode for each matched file,
 * so the next load can use inodes for rename detection and version/hash for
 * accurate outdated status on app restart.
 *
 * Creates new entries if none exist (upsert) so files from any entry path
 * (SolidWorks DM API extension, manual copy, etc.) get inode tracking.
 */
export async function updateInodes(vaultId: string, entries: Array<{ path: string; ino: number; localVersion?: number; localHash?: string }>): Promise<void> {
  if (entries.length === 0) return
  
  try {
    const db = await openDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      let completed = 0
      
      for (const { path, ino, localVersion, localHash } of entries) {
        const key = makeKey(vaultId, path)
        const getRequest = store.get(key)
        
        getRequest.onsuccess = () => {
          completed++
          const existing = getRequest.result as SyncIndexEntry | undefined
          if (existing) {
            existing.ino = ino
            if (localVersion !== undefined) existing.localVersion = localVersion
            if (localHash !== undefined) existing.localHash = localHash
            store.put(existing)
          } else {
            const newEntry: SyncIndexEntry = {
              key,
              vaultId,
              relativePath: path.toLowerCase(),
              lastSyncedAt: Date.now(),
              ino,
              localVersion,
              localHash
            }
            store.put(newEntry)
          }
          if (completed === entries.length) {
            resolve()
          }
        }
        
        getRequest.onerror = () => {
          completed++
          if (completed === entries.length) {
            resolve()
          }
        }
      }
    })
  } catch (error) {
    console.error('[SyncIndex] Error updating inodes:', error)
  }
}

/**
 * Get a map of relativePath -> { localVersion, localHash } for all entries that have
 * version or hash data. Used during file loading to restore version/hash state after
 * app restart, preventing false-positive "outdated" (purple) highlights.
 */
export async function getVersionMap(vaultId: string): Promise<Map<string, { localVersion?: number; localHash?: string }>> {
  try {
    const db = await openDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('vaultId')
      const request = index.getAll(IDBKeyRange.only(vaultId))
      
      request.onsuccess = () => {
        const entries = request.result as SyncIndexEntry[]
        const map = new Map<string, { localVersion?: number; localHash?: string }>()
        for (const entry of entries) {
          if (entry.localVersion !== undefined || entry.localHash) {
            map.set(entry.relativePath, {
              localVersion: entry.localVersion,
              localHash: entry.localHash
            })
          }
        }
        console.log(`[SyncIndex] Loaded version map: ${map.size} entries with version/hash data for vault ${vaultId}`)
        resolve(map)
      }
      
      request.onerror = () => {
        console.error('[SyncIndex] Failed to read version map:', request.error)
        resolve(new Map())
      }
    })
  } catch (error) {
    console.error('[SyncIndex] Error reading version map:', error)
    return new Map()
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
