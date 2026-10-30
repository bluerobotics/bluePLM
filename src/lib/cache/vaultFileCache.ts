/**
 * Vault File Cache - IndexedDB-based caching for server files
 *
 * Provides instant loading for subsequent app boots by:
 * 1. Storing all server files locally in IndexedDB
 * 2. Recording a "watermark" timestamp of the last sync
 * 3. On next boot, loading from cache instantly, then fetching only deltas
 *
 * Performance: For 25,000 files:
 * - First load: ~1s (full fetch + cache write)
 * - Subsequent loads: ~100-200ms (cache read + small delta fetch)
 */

import {
  getFilesDelta,
  getVaultFilesCount,
  LightweightFile,
  DeltaFile,
} from '@/lib/supabase/files/queries'
import { describeError, isIndexedDbCorruptionError } from '@/lib/errorDetails'
import { log } from '@/lib/logger'
import {
  hashCheckoutIdentifier,
  isCheckoutProfileForOwner,
  type CheckoutUserProfile,
} from '@/types/pdm'

/**
 * Cached server file extends LightweightFile with user profile info.
 * This allows us to preserve checked_out_user data across cache loads,
 * preventing the "SO" (Someone) avatar fallback when files are refreshed.
 */
export interface CachedServerFile extends LightweightFile {
  checked_out_user?: CheckoutUserProfile | null
}

export interface CacheWriteContext {
  requestId?: string
  isCurrent?: () => boolean
}

interface VaultCacheEntry {
  vaultId: string
  orgId: string
  files: CachedServerFile[]
  watermark: string // ISO timestamp - MAX(updated_at) from files
  cachedAt: number // Date.now() when cached
}

const DB_NAME = 'blueplm-vault-cache'
// IMPORTANT: Bump this version to force cache clear on app update
// v1 -> v2: Fixed Supabase 1000 row limit bug
// v2 -> v3: Rows gained custom_properties; cached rows without it would leave files
//           looking permanently modified until their next delta update
// v3 -> v4: Profiles gained owner IDs; old unkeyed profiles are not safe to migrate
const DB_VERSION = 4
const STORE_NAME = 'vault-files'

// Cache expiry - if cache is older than this, do a full refresh
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Reconciliation guard: if the merged (cache + delta) row count disagrees with the
// server's true count (e.g. a mutation that forgot to bump updated_at, so a delta was
// missed), we force one full refetch to rebuild the cache. Silent refreshes fire on
// every file-watcher event, which can be several per second, so a systematic mismatch
// is throttled to at most one extra full fetch per vault per cooldown window rather
// than one per refresh.
const COUNT_RECONCILE_COOLDOWN_MS = 60_000
const countReconcileForcedAt = new Map<string, number>()

// Rewriting the entry means structured-cloning every cached row (about 27,000 of them), 350-500 ms
// and a large allocation, and a user's logs show it after every load with a one-row delta. The
// watermark is not advanced by a skipped write, so the next load fetches the same few rows again
// and merges them again: slightly more network, never a stale or wrong cache. A delta this small
// is therefore only persisted once the entry has gone this long without a write; a bigger delta,
// or an expired entry, is written at once.
const SMALL_DELTA_MAX_ROWS = 25
const SMALL_DELTA_REWRITE_MIN_INTERVAL_MS = 10 * 60 * 1000

/**
 * Whether a cache-hit load should write the merged rows back. An empty delta never does: nothing
 * changed, so there is nothing to persist.
 */
export function shouldRewriteCacheAfterDelta(
  deltaCount: number,
  cachedAt: number,
  now: number = Date.now(),
): boolean {
  if (deltaCount <= 0) return false
  if (deltaCount > SMALL_DELTA_MAX_ROWS) return true
  return now - cachedAt >= SMALL_DELTA_REWRITE_MIN_INTERVAL_MS
}

let dbPromise: Promise<IDBDatabase> | null = null
const vaultWriteQueues = new Map<string, Promise<void>>()

function enqueueVaultWrite(
  vaultId: string,
  operation: () => Promise<void>,
  context?: CacheWriteContext,
): Promise<void> {
  const previous = vaultWriteQueues.get(vaultId) ?? Promise.resolve()
  const queued = previous.catch(() => undefined).then(async () => {
    if (context?.isCurrent && !context.isCurrent()) {
      log.debug('[VaultCache]', 'Discarding stale cache write before transaction', {
        vaultId: hashCheckoutIdentifier(vaultId),
        requestId: context.requestId,
        stale: true,
      })
      return
    }

    await operation()
  })

  vaultWriteQueues.set(vaultId, queued)
  queued.then(
    () => {
      if (vaultWriteQueues.get(vaultId) === queued) vaultWriteQueues.delete(vaultId)
    },
    () => {
      if (vaultWriteQueues.get(vaultId) === queued) vaultWriteQueues.delete(vaultId)
    },
  )
  return queued
}

function sanitizeCachedFile(file: CachedServerFile): CachedServerFile {
  if (isCheckoutProfileForOwner(file.checked_out_user, file.checked_out_by)) {
    return file
  }

  const { checked_out_user: _checkedOutUser, ...withoutProfile } = file
  return withoutProfile
}

function isCacheContextCurrent(context?: CacheWriteContext): boolean {
  return !context?.isCurrent || context.isCurrent()
}

/**
 * Self-repair for a broken IndexedDB. One user session logged `Internal error opening backing
 * store for indexedDB.open` from 20:07 until the app was closed: every load afterwards was a
 * full fetch, because the rejected open promise was cached for the life of the page and the
 * failure was never retried or repaired.
 *
 * What happens now, at most once per `REPAIR_COOLDOWN_MS` (sessions last weeks, so "once per
 * session" would mean never again) and never on the load's critical path (the open that
 * failed rejects immediately, so that load falls back to a full fetch exactly as before):
 * 1. `indexedDB.deleteDatabase` for this cache, then reopen.
 * 2. If that fails too, ask the main process to clear the session's IndexedDB storage.
 * Every later call opens the database afresh, so a repaired database is picked up by itself.
 */
const REPAIR_COOLDOWN_MS = 60 * 60_000
let lastRepairAt = -Infinity
let repairPromise: Promise<void> | null = null

function openRaw(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB open failed'))
    }

    request.onblocked = () => {
      reject(new Error('IndexedDB open blocked by another connection'))
    }

    request.onsuccess = () => {
      const db = request.result
      // A connection the browser closes on its own, or one that must yield to an upgrade, is
      // no longer usable. Forget it so the next call opens a new one.
      db.onclose = () => {
        dbPromise = null
      }
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Delete old object store on version upgrade (clears corrupted cache)
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
        log.info('[VaultCache]', 'Cleared old cache on version upgrade')
      }

      // Create fresh object store
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'vaultId' })
      store.createIndex('orgId', 'orgId', { unique: false })
      store.createIndex('cachedAt', 'cachedAt', { unique: false })
    }
  })
}

function deleteDatabase(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('IndexedDB delete failed'))
    request.onblocked = () => reject(new Error('IndexedDB delete blocked by another connection'))
  })
}

async function repairDatabase(trigger: unknown): Promise<void> {
  log.warn('[VaultCache]', 'IndexedDB is unusable, trying to repair it', {
    trigger: describeError(trigger),
  })

  try {
    await deleteDatabase()
    const db = await openRaw()
    db.close()
    log.info('[VaultCache]', 'IndexedDB repaired by deleting the cache database')
    return
  } catch (error) {
    log.warn('[VaultCache]', 'Deleting the cache database did not repair IndexedDB', {
      error: describeError(error),
    })
  }

  try {
    const electronAPI = typeof window === 'undefined' ? undefined : window.electronAPI
    const result = await electronAPI?.clearIndexedDbStorage?.()
    if (!result?.success) {
      log.error('[VaultCache]', 'Main process could not clear IndexedDB storage', {
        error: result?.error ?? 'clearIndexedDbStorage unavailable',
      })
      return
    }
    const db = await openRaw()
    db.close()
    log.info('[VaultCache]', 'IndexedDB repaired by clearing storage in the main process')
  } catch (error) {
    log.error('[VaultCache]', 'IndexedDB is still unusable after clearing storage', {
      error: describeError(error),
    })
  }
}

/**
 * Start a repair if `error` looks like a corrupt backing store and none ran within the cooldown.
 * Fire-and-forget: the caller's failed open is not delayed by it.
 */
function maybeStartRepair(error: unknown): void {
  if (Date.now() - lastRepairAt < REPAIR_COOLDOWN_MS || !isIndexedDbCorruptionError(error)) return
  lastRepairAt = Date.now()
  repairPromise = repairDatabase(error).catch(() => undefined)
}

/**
 * Open or create the IndexedDB database.
 *
 * A failed open is not remembered: `dbPromise` is cleared so the next call tries again.
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  const attempt = openRaw().catch((error: unknown) => {
    if (dbPromise === attempt) dbPromise = null
    log.error('[VaultCache]', 'Failed to open IndexedDB', { error: describeError(error) })
    maybeStartRepair(error)
    throw error
  })
  dbPromise = attempt
  return attempt
}

/**
 * Can the cache database be opened? A failed open starts the repair above by itself, so the health
 * monitor's periodic probe is also how a cache that broke mid-session gets repaired.
 */
export async function probeVaultCache(): Promise<boolean> {
  try {
    await openDB()
    return true
  } catch {
    return false
  }
}

/** Resolves when the latest repair attempt (if one started) has finished. For tests. */
export function waitForVaultCacheRepair(): Promise<void> {
  return repairPromise ?? Promise.resolve()
}

/**
 * Get cached files for a vault
 * Returns null if no cache exists or cache is expired
 */
export async function getCachedVaultFiles(
  orgId: string,
  vaultId: string,
): Promise<{ files: CachedServerFile[]; watermark: string; cachedAt: number } | null> {
  try {
    const db = await openDB()

    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(vaultId)

      request.onsuccess = () => {
        const entry = request.result as VaultCacheEntry | undefined

        if (!entry) {
          resolve(null)
          return
        }

        // Check if cache belongs to same org
        if (entry.orgId !== orgId) {
          resolve(null)
          return
        }

        // Check if cache is expired
        if (Date.now() - entry.cachedAt > CACHE_MAX_AGE_MS) {
          log.info('[VaultCache]', 'Cache expired, will refresh')
          resolve(null)
          return
        }

        const files = entry.files.map(sanitizeCachedFile)
        const discardedProfiles = entry.files.filter(
          (file, index) => file.checked_out_user && !files[index].checked_out_user,
        ).length
        if (discardedProfiles > 0) {
          log.warn('[VaultCache]', 'Discarded cache profiles without matching owners', {
            orgId: hashCheckoutIdentifier(orgId),
            vaultId: hashCheckoutIdentifier(vaultId),
            discardedProfiles,
          })
        }

        resolve({
          files,
          watermark: entry.watermark,
          cachedAt: entry.cachedAt,
        })
      }

      request.onerror = () => {
        log.error('[VaultCache]', 'Failed to read cache', { error: describeError(request.error) })
        resolve(null)
      }
    })
  } catch (error) {
    log.error('[VaultCache]', 'Error reading cache', { error: describeError(error) })
    return null
  }
}

/**
 * Save files to cache with watermark
 */
export async function setCachedVaultFiles(
  orgId: string,
  vaultId: string,
  files: CachedServerFile[],
  context?: CacheWriteContext,
): Promise<void> {
  return enqueueVaultWrite(
    vaultId,
    async () => {
      const writeStart = performance.now()
      try {
        const db = await openDB()
        const sanitizeStart = performance.now()
        const validatedFiles = files.map(sanitizeCachedFile)
        const sanitizeMs = Math.round(performance.now() - sanitizeStart)

        // Compute watermark as MAX(updated_at)
        let maxUpdatedAt = ''
        for (const file of validatedFiles) {
          if (file.updated_at && file.updated_at > maxUpdatedAt) {
            maxUpdatedAt = file.updated_at
          }
        }

        const watermark = maxUpdatedAt || new Date().toISOString()
        const entry: VaultCacheEntry = {
          vaultId,
          orgId,
          files: validatedFiles,
          watermark,
          cachedAt: Date.now(),
        }

        const putStart = performance.now()
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite')
          const store = transaction.objectStore(STORE_NAME)

          // Revalidate immediately before the write, while this transaction is still authoritative.
          if (!isCacheContextCurrent(context)) {
            log.debug('[VaultCache]', 'Discarding stale full cache write in transaction', {
              orgId: hashCheckoutIdentifier(orgId),
              vaultId: hashCheckoutIdentifier(vaultId),
              requestId: context?.requestId,
              stale: true,
            })
            transaction.abort()
            resolve()
            return
          }

          const request = store.put(entry)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })

        log.info('[VaultCache]', 'Cached server files', {
          orgId: hashCheckoutIdentifier(orgId),
          vaultId: hashCheckoutIdentifier(vaultId),
          requestId: context?.requestId,
          fileCount: validatedFiles.length,
          sanitizeMs,
          putMs: Math.round(performance.now() - putStart),
          latencyMs: Math.round(performance.now() - writeStart),
        })
      } catch (error) {
        log.error('[VaultCache]', 'Error writing cache', {
          orgId: hashCheckoutIdentifier(orgId),
          vaultId: hashCheckoutIdentifier(vaultId),
          requestId: context?.requestId,
          error: describeError(error),
        })
      }
    },
    context,
  )
}

/**
 * Apply delta changes to cached files
 * Handles: new files, updated files, deleted files
 * Preserves checked_out_user info from existing cache when checkout hasn't changed
 */
export function applyDeltaToCache(
  cachedFiles: CachedServerFile[],
  deltaFiles: DeltaFile[],
): CachedServerFile[] {
  // Create map for O(1) lookup by ID
  const fileMap = new Map(cachedFiles.map((file) => [file.id, sanitizeCachedFile(file)]))

  for (const delta of deltaFiles) {
    if (delta.is_deleted || delta.deleted_at) {
      // File was deleted - remove from cache
      fileMap.delete(delta.id)
    } else {
      // File was added or updated - upsert
      // Preserve checked_out_user if the checkout user hasn't changed
      const existing = fileMap.get(delta.id)
      const preserveUserInfo =
        existing?.checked_out_user &&
        isCheckoutProfileForOwner(existing.checked_out_user, delta.checked_out_by) &&
        existing.checked_out_by === delta.checked_out_by

      const nextFile: CachedServerFile = {
        id: delta.id,
        file_path: delta.file_path,
        file_name: delta.file_name,
        extension: delta.extension,
        file_type: delta.file_type,
        part_number: delta.part_number,
        description: delta.description,
        revision: delta.revision,
        version: delta.version,
        content_hash: delta.content_hash,
        file_size: delta.file_size,
        state: delta.state,
        checked_out_by: delta.checked_out_by,
        checked_out_at: delta.checked_out_at,
        updated_at: delta.updated_at,
        custom_properties: delta.custom_properties,
        checked_out_file_path: delta.checked_out_file_path,
        checked_out_file_name: delta.checked_out_file_name,
        // Preserve user info if checkout user hasn't changed
        checked_out_user: preserveUserInfo ? existing!.checked_out_user : undefined,
      }
      fileMap.set(delta.id, sanitizeCachedFile(nextFile))
    }
  }

  return Array.from(fileMap.values())
}

/**
 * Fetch files with caching - main entry point
 *
 * Strategy:
 * 1. Try to load from cache
 * 2. If cache hit, fetch delta and merge
 * 3. If cache miss, do full fetch and cache result
 *
 * @returns files and timing info for metrics
 */
export async function getFilesWithCache(
  orgId: string,
  vaultId: string,
  fetchFullFn: () => Promise<{ files: CachedServerFile[] | null; error: unknown }>,
  context?: CacheWriteContext,
): Promise<{
  files: CachedServerFile[] | null
  error: unknown
  cacheHit: boolean
  deltaCount: number
  timing: {
    cacheReadMs: number
    fetchMs: number
    mergeMs: number
  }
}> {
  const timing = {
    cacheReadMs: 0,
    fetchMs: 0,
    mergeMs: 0,
  }

  // Shared full-fetch path, used both for a cache miss and as the reconciliation
  // fallback below. Called at most once per getFilesWithCache invocation - never
  // recursive - so a systematic count mismatch still costs exactly one extra fetch.
  async function fullFetchAndCache(): Promise<{
    files: CachedServerFile[] | null
    error: unknown
    cacheHit: boolean
    deltaCount: number
    timing: typeof timing
  }> {
    const fetchStart = performance.now()
    const { files, error } = await fetchFullFn()
    timing.fetchMs = Math.round(performance.now() - fetchStart)

    if (error || !files) {
      return { files, error, cacheHit: false, deltaCount: 0, timing }
    }

    // Cache the result for next time
    void setCachedVaultFiles(orgId, vaultId, files, context)

    return { files, error: null, cacheHit: false, deltaCount: 0, timing }
  }

  // Try cache first
  const cacheStart = performance.now()
  const cached = await getCachedVaultFiles(orgId, vaultId)
  timing.cacheReadMs = Math.round(performance.now() - cacheStart)

  if (cached) {
    // Cache hit - fetch the delta and the reconciliation count in parallel so the
    // count check adds no latency to the critical path.
    log.info('[VaultCache]', 'Cache hit', {
      orgId: hashCheckoutIdentifier(orgId),
      vaultId: hashCheckoutIdentifier(vaultId),
      requestId: context?.requestId,
      fileCount: cached.files.length,
      watermark: cached.watermark,
    })

    const fetchStart = performance.now()
    const [{ files: deltaFiles, error }, { count: serverCount, error: countError }] =
      await Promise.all([
        getFilesDelta(orgId, vaultId, cached.watermark),
        getVaultFilesCount(orgId, vaultId),
      ])
    timing.fetchMs = Math.round(performance.now() - fetchStart)

    if (error) {
      log.error('[VaultCache]', 'Delta fetch failed, using cache only', { error: describeError(error) })
      return {
        files: cached.files,
        error: null, // Don't fail - we have cache
        cacheHit: true,
        deltaCount: 0,
        timing,
      }
    }

    const deltaCount = deltaFiles?.length || 0
    log.info('[VaultCache]', `Delta: ${deltaCount} changes since ${cached.watermark}`)

    let mergedFiles: CachedServerFile[]
    if (deltaCount > 0) {
      // Merge delta into cache
      const mergeStart = performance.now()
      mergedFiles = applyDeltaToCache(cached.files, deltaFiles!)
      timing.mergeMs = Math.round(performance.now() - mergeStart)
    } else {
      mergedFiles = cached.files
    }

    // Reconciliation guard: a missed delta (a truncated RPC result, a mutation that
    // forgot to bump updated_at, the strict `>` watermark boundary) would otherwise
    // silently persist until CACHE_MAX_AGE_MS. A count failure must never degrade or
    // fail the load, so skip the check entirely when the count is unavailable. A
    // concurrent write between the two parallel queries can produce a spurious
    // mismatch - that costs one extra full fetch, never correctness, and is not worth
    // retrying.
    if (!countError && serverCount !== null && serverCount !== undefined) {
      if (mergedFiles.length !== serverCount) {
        const now = Date.now()
        const lastForcedAt = countReconcileForcedAt.get(vaultId) ?? 0

        if (now - lastForcedAt >= COUNT_RECONCILE_COOLDOWN_MS) {
          countReconcileForcedAt.set(vaultId, now)
          log.warn('[VaultCache]', 'Cache/server count mismatch, forcing full refetch', {
            vaultId: hashCheckoutIdentifier(vaultId),
            cachedCount: mergedFiles.length,
            serverCount,
            deltaCount,
          })

          return fullFetchAndCache()
        }
      }
    }

    if (shouldRewriteCacheAfterDelta(deltaCount, cached.cachedAt)) {
      // Update cache with merged data
      void setCachedVaultFiles(orgId, vaultId, mergedFiles, context)
    } else if (deltaCount > 0) {
      log.info('[VaultCache]', 'Skipping cache rewrite for a small delta', {
        vaultId: hashCheckoutIdentifier(vaultId),
        requestId: context?.requestId,
        deltaCount,
        fileCount: mergedFiles.length,
        cacheAgeMs: Date.now() - cached.cachedAt,
      })
    }

    return {
      files: mergedFiles,
      error: null,
      cacheHit: true,
      deltaCount,
      timing,
    }
  }

  // Cache miss - full fetch
  log.info('[VaultCache]', 'Cache miss, doing full fetch', {
    orgId: hashCheckoutIdentifier(orgId),
    vaultId: hashCheckoutIdentifier(vaultId),
    requestId: context?.requestId,
  })

  return fullFetchAndCache()
}

/** Whether two checkout profiles would display the same. */
export function isSameCheckoutProfile(
  a: CheckoutUserProfile | null | undefined,
  b: CheckoutUserProfile | null | undefined,
): boolean {
  if (!a || !b) return a === b
  return (
    a.id === b.id && a.email === b.email && a.full_name === b.full_name && a.avatar_url === b.avatar_url
  )
}

/**
 * Update cached files with user info.
 * Called after background task fetches checked_out_user data.
 * This persists user info to IndexedDB so subsequent loads have it immediately.
 */
export function updateCachedUserInfo(
  vaultId: string,
  userInfoMap: Record<string, CheckoutUserProfile>,
): Promise<void>
export function updateCachedUserInfo(
  orgId: string,
  vaultId: string,
  userInfoMap: Record<string, CheckoutUserProfile>,
  context?: CacheWriteContext,
): Promise<void>
export function updateCachedUserInfo(
  first: string,
  second: string | Record<string, CheckoutUserProfile>,
  third?: Record<string, CheckoutUserProfile>,
  context?: CacheWriteContext,
): Promise<void> {
  const orgId: string | null = typeof second === 'string' ? first : null
  const vaultId: string = typeof second === 'string' ? second : first
  const userInfoMap: Record<string, CheckoutUserProfile> | undefined =
    typeof second === 'string' ? third : second

  if (!userInfoMap) return Promise.resolve()

  // Nothing to merge. Every load used to land here with an empty map, and the call still read the
  // whole entry back out of IndexedDB (7-20 s in a user's log, `profileCount: 0`) only to
  // find that no row changed.
  if (Object.keys(userInfoMap).length === 0) return Promise.resolve()

  return enqueueVaultWrite(
    vaultId,
    async () => {
      const updateStart = performance.now()
      try {
        const db = await openDB()

        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite')
          const store = transaction.objectStore(STORE_NAME)

          if (!isCacheContextCurrent(context)) {
            log.debug('[VaultCache]', 'Discarding stale profile cache write in transaction', {
              orgId: hashCheckoutIdentifier(orgId),
              vaultId: hashCheckoutIdentifier(vaultId),
              requestId: context?.requestId,
              stale: true,
            })
            transaction.abort()
            resolve()
            return
          }

          const getRequest = store.get(vaultId)
          getRequest.onsuccess = () => {
            const entry = getRequest.result as VaultCacheEntry | undefined
            if (!entry || (orgId !== null && entry.orgId !== orgId)) {
              resolve()
              return
            }

            if (!isCacheContextCurrent(context)) {
              log.debug('[VaultCache]', 'Discarding stale profile cache write after read', {
                orgId: hashCheckoutIdentifier(orgId),
                vaultId: hashCheckoutIdentifier(vaultId),
                requestId: context?.requestId,
                stale: true,
              })
              transaction.abort()
              resolve()
              return
            }

            const matchesProfile = (file: CachedServerFile): boolean => {
              const profile = userInfoMap[file.id]
              return Boolean(
                profile &&
                  file.checked_out_by === profile.id &&
                  isCheckoutProfileForOwner(profile, file.checked_out_by),
              )
            }

            // Look before building anything: with no row whose cached profile is missing or
            // different there is nothing to write, and the replacement array would be 27k
            // references of garbage. The profiles are re-fetched on every load, so without the
            // comparison this rewrote the whole entry each time, watcher refreshes included,
            // undoing the small-delta skip in getFilesWithCache.
            const needsProfile = (file: CachedServerFile): boolean =>
              matchesProfile(file) && !isSameCheckoutProfile(file.checked_out_user, userInfoMap[file.id])
            if (!entry.files.some(needsProfile)) {
              resolve()
              return
            }

            entry.files = entry.files.map((file) =>
              matchesProfile(file)
                ? { ...file, checked_out_user: userInfoMap[file.id] }
                : sanitizeCachedFile(file),
            )
            const putRequest = store.put(entry)
            putRequest.onsuccess = () => resolve()
            putRequest.onerror = () => reject(putRequest.error)
          }

          getRequest.onerror = () => reject(getRequest.error)
        })

        log.info('[VaultCache]', 'Updated cached checkout profiles', {
          orgId: hashCheckoutIdentifier(orgId),
          vaultId: hashCheckoutIdentifier(vaultId),
          requestId: context?.requestId,
          profileCount: Object.keys(userInfoMap).length,
          latencyMs: Math.round(performance.now() - updateStart),
        })
      } catch (error) {
        log.error('[VaultCache]', 'Error updating cached user info', {
          orgId: hashCheckoutIdentifier(orgId),
          vaultId: hashCheckoutIdentifier(vaultId),
          requestId: context?.requestId,
          error: describeError(error),
        })
      }
    },
    context,
  )
}

/**
 * Clear cache for a specific vault
 */
export async function clearVaultCache(vaultId: string): Promise<void> {
  try {
    const db = await openDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(vaultId)

      request.onsuccess = () => {
        log.info('[VaultCache]', `Cleared cache for vault ${vaultId}`)
        resolve()
      }

      request.onerror = () => {
        log.error('[VaultCache]', 'Failed to clear cache', { error: describeError(request.error) })
        reject(request.error)
      }
    })
  } catch (error) {
    log.error('[VaultCache]', 'Error clearing cache', { error: describeError(error) })
  }
}

/**
 * Clear all vault caches
 */
export async function clearAllVaultCaches(): Promise<void> {
  try {
    const db = await openDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => {
        log.info('[VaultCache]', 'Cleared all caches')
        resolve()
      }

      request.onerror = () => {
        log.error('[VaultCache]', 'Failed to clear all caches', { error: describeError(request.error) })
        reject(request.error)
      }
    })
  } catch (error) {
    log.error('[VaultCache]', 'Error clearing all caches', { error: describeError(error) })
  }
}

// Expose cache utilities on window for DevTools console access
if (typeof window !== 'undefined') {
  ;(window as any).__clearVaultCache = clearVaultCache // TODO: type this
  ;(window as any).__clearAllVaultCaches = clearAllVaultCaches // TODO: type this
}
