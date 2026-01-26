/**
 * Global LRU thumbnail cache to prevent repeated IPC calls and memory leaks.
 * 
 * Features:
 * - LRU eviction when cache exceeds MAX_CACHE_SIZE
 * - Request deduplication via pending promises
 * - TTL expiration to handle file updates
 * - Invalidation API for file operations (move, rename, delete)
 */

import { log } from './logger'

interface CacheEntry {
  data: string       // base64 data URL
  timestamp: number  // for TTL expiration
  accessTime: number // for LRU eviction
}

// Cache configuration
const MAX_CACHE_SIZE = 200        // ~6MB max (200 x 30KB avg)
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Global cache state (module singleton)
const cache = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<string | null>>()

// Normalize path for cache key (lowercase, forward slashes)
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

/**
 * Evict oldest entries when cache exceeds max size
 */
function evictOldest(): void {
  if (cache.size <= MAX_CACHE_SIZE) return
  
  // Sort entries by access time (oldest first)
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].accessTime - b[1].accessTime)
  
  // Remove oldest 20% to avoid frequent evictions
  const toRemove = Math.ceil(cache.size * 0.2)
  for (let i = 0; i < toRemove && i < entries.length; i++) {
    cache.delete(entries[i][0])
  }
  
  log.debug('[ThumbnailCache]', `Evicted ${toRemove} oldest entries`, { 
    newSize: cache.size 
  })
}

/**
 * Check if entry is expired
 */
function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS
}

/**
 * Get thumbnail from cache or fetch via IPC.
 * Deduplicates concurrent requests for the same file.
 * 
 * @param filePath - Full file path
 * @returns Base64 data URL or null if not available
 */
export async function getThumbnail(filePath: string): Promise<string | null> {
  const key = normalizePath(filePath)
  
  // Check cache first
  const cached = cache.get(key)
  if (cached && !isExpired(cached)) {
    // Update access time for LRU
    cached.accessTime = Date.now()
    return cached.data
  }
  
  // Remove expired entry if exists
  if (cached) {
    cache.delete(key)
  }
  
  // Check if request is already pending
  const pendingRequest = pending.get(key)
  if (pendingRequest) {
    return pendingRequest
  }
  
  // Create new request
  const request = fetchThumbnail(filePath, key)
  pending.set(key, request)
  
  try {
    const result = await request
    return result
  } finally {
    pending.delete(key)
  }
}

/**
 * Fetch thumbnail from electron IPC
 */
async function fetchThumbnail(filePath: string, key: string): Promise<string | null> {
  try {
    const result = await window.electronAPI?.extractSolidWorksThumbnail(filePath)
    
    if (result?.success && result.data && result.data.startsWith('data:image/')) {
      // Validate data size (skip if too small or too large)
      if (result.data.length > 100 && result.data.length < 10000000) {
        const now = Date.now()
        cache.set(key, {
          data: result.data,
          timestamp: now,
          accessTime: now
        })
        
        // Evict if needed
        evictOldest()
        
        return result.data
      }
    }
    
    return null
  } catch (err) {
    log.error('[ThumbnailCache]', 'Failed to fetch thumbnail', { 
      path: filePath, 
      error: err 
    })
    return null
  }
}

/**
 * Invalidate cache entry for a specific path.
 * Call this when files are moved, renamed, or deleted.
 * 
 * @param filePath - File path to invalidate
 */
export function invalidate(filePath: string): void {
  const key = normalizePath(filePath)
  if (cache.delete(key)) {
    log.debug('[ThumbnailCache]', 'Invalidated', { path: filePath })
  }
}

/**
 * Invalidate all cache entries under a folder path.
 * Call this when folders are moved, renamed, or deleted.
 * 
 * @param folderPath - Folder path prefix to invalidate
 */
export function invalidateFolder(folderPath: string): void {
  const prefix = normalizePath(folderPath)
  let count = 0
  
  for (const key of cache.keys()) {
    if (key.startsWith(prefix + '/') || key === prefix) {
      cache.delete(key)
      count++
    }
  }
  
  if (count > 0) {
    log.debug('[ThumbnailCache]', `Invalidated folder`, { 
      path: folderPath, 
      count 
    })
  }
}

/**
 * Clear the entire cache.
 * Call this on sign-out or vault change.
 */
export function clearCache(): void {
  const size = cache.size
  cache.clear()
  pending.clear()
  if (size > 0) {
    log.debug('[ThumbnailCache]', `Cleared cache`, { entriesCleared: size })
  }
}

/**
 * Get current cache statistics (for debugging)
 */
export function getCacheStats(): { size: number; pendingCount: number } {
  return {
    size: cache.size,
    pendingCount: pending.size
  }
}

// Export as namespace for cleaner imports
export const thumbnailCache = {
  get: getThumbnail,
  invalidate,
  invalidateFolder,
  clear: clearCache,
  getStats: getCacheStats
}
