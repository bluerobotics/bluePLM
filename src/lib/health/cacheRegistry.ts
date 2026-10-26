/**
 * Caches the app can drop and rebuild on demand. The health monitor drops them when the renderer
 * heap passes its high-water mark, before anything that cannot be rebuilt; the soak reads their
 * sizes to show each stays bounded.
 *
 * Registering is idempotent by name, so a module re-evaluated by HMR replaces its own entry.
 */

export interface RebuildableCache {
  /** Entries held now. */
  size(): number
  /** Empty the cache. Whatever needs an entry again recomputes or refetches it. */
  drop(): void
}

const caches = new Map<string, RebuildableCache>()

export function registerRebuildableCache(name: string, cache: RebuildableCache): void {
  caches.set(name, cache)
}

export function rebuildableCacheSizes(): Record<string, number> {
  const sizes: Record<string, number> = {}
  for (const [name, cache] of caches) {
    try {
      sizes[name] = cache.size()
    } catch {
      sizes[name] = -1
    }
  }
  return sizes
}

/** Drop every registered cache; returns the names dropped. A cache that throws is skipped. */
export function dropRebuildableCaches(): string[] {
  const dropped: string[] = []
  for (const [name, cache] of caches) {
    try {
      cache.drop()
      dropped.push(name)
    } catch {
      // One broken cache must not stop the others being freed.
    }
  }
  return dropped
}
