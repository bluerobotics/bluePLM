/**
 * Extension Rate Limiting
 * 
 * Per-extension rate limiting to prevent abuse and ensure fair usage.
 * Uses a sliding window algorithm with Redis-like in-memory storage.
 * 
 * @module extensions/ratelimit
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Requests per minute. Default: 100 */
  requestsPerMinute: number
  /** Maximum request body size in bytes. Default: 1MB */
  requestSizeBytes: number
  /** Window size in milliseconds. Default: 60000 (1 minute) */
  windowMs: number
}

/**
 * Default rate limit configuration.
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requestsPerMinute: 100,
  requestSizeBytes: 1024 * 1024, // 1MB
  windowMs: 60000
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
  /** Whether request is allowed */
  allowed: boolean
  /** Remaining requests in current window */
  remaining: number
  /** Seconds until rate limit resets */
  resetIn: number
  /** Retry-After header value in seconds (if rate limited) */
  retryAfter?: number
  /** Current request count in window */
  current: number
  /** Maximum requests allowed */
  limit: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMIT ENTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rate limit tracking entry for an extension.
 */
interface RateLimitEntry {
  /** Timestamps of requests in the current window */
  requests: number[]
  /** Window start time */
  windowStart: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Per-extension rate limiter.
 * 
 * Uses a sliding window algorithm to track request rates.
 * In production, this could be backed by Redis for distributed rate limiting.
 * 
 * @example
 * ```typescript
 * const limiter = new ExtensionRateLimiter();
 * 
 * const result = await limiter.check('my-org', 'my-extension', 1024);
 * if (!result.allowed) {
 *   throw new Error(`Rate limited. Retry after ${result.retryAfter} seconds`);
 * }
 * ```
 */
export class ExtensionRateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map()
  private configs: Map<string, RateLimitConfig> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Periodically clean up stale entries
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

  /**
   * Create a unique key for org+extension combination.
   */
  private getKey(orgId: string, extensionId: string): string {
    return `${orgId}:${extensionId}`
  }

  /**
   * Get or create rate limit entry for an extension.
   */
  private getEntry(key: string): RateLimitEntry {
    let entry = this.entries.get(key)
    
    if (!entry) {
      entry = {
        requests: [],
        windowStart: Date.now()
      }
      this.entries.set(key, entry)
    }
    
    return entry
  }

  /**
   * Get rate limit configuration for an extension.
   */
  private getConfig(key: string): RateLimitConfig {
    return this.configs.get(key) ?? DEFAULT_RATE_LIMIT
  }

  /**
   * Set custom rate limit configuration for an extension.
   * 
   * @param orgId - Organization ID
   * @param extensionId - Extension ID
   * @param config - Custom rate limit configuration
   */
  setConfig(
    orgId: string,
    extensionId: string,
    config: Partial<RateLimitConfig>
  ): void {
    const key = this.getKey(orgId, extensionId)
    this.configs.set(key, { ...DEFAULT_RATE_LIMIT, ...config })
  }

  /**
   * Check if a request is allowed under rate limits.
   * 
   * @param orgId - Organization ID
   * @param extensionId - Extension ID
   * @param requestSize - Request body size in bytes
   * @returns Rate limit result
   */
  check(
    orgId: string,
    extensionId: string,
    requestSize: number
  ): RateLimitResult {
    const key = this.getKey(orgId, extensionId)
    const config = this.getConfig(key)
    const entry = this.getEntry(key)
    const now = Date.now()

    // Check request size limit
    if (requestSize > config.requestSizeBytes) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: 0,
        retryAfter: 0,
        current: entry.requests.length,
        limit: config.requestsPerMinute
      }
    }

    // Slide the window - remove requests outside the window
    const windowStart = now - config.windowMs
    entry.requests = entry.requests.filter(ts => ts > windowStart)

    // Calculate remaining capacity
    const current = entry.requests.length
    const remaining = Math.max(0, config.requestsPerMinute - current)
    const oldestRequest = entry.requests[0]
    const resetIn = oldestRequest 
      ? Math.ceil((oldestRequest + config.windowMs - now) / 1000)
      : Math.ceil(config.windowMs / 1000)

    // Check if rate limited
    if (current >= config.requestsPerMinute) {
      return {
        allowed: false,
        remaining: 0,
        resetIn,
        retryAfter: resetIn,
        current,
        limit: config.requestsPerMinute
      }
    }

    // Record this request
    entry.requests.push(now)

    return {
      allowed: true,
      remaining: remaining - 1,
      resetIn,
      current: current + 1,
      limit: config.requestsPerMinute
    }
  }

  /**
   * Get current rate limit status without consuming a request.
   * 
   * @param orgId - Organization ID
   * @param extensionId - Extension ID
   * @returns Current rate limit status
   */
  getStatus(orgId: string, extensionId: string): RateLimitResult {
    const key = this.getKey(orgId, extensionId)
    const config = this.getConfig(key)
    const entry = this.getEntry(key)
    const now = Date.now()

    // Slide the window
    const windowStart = now - config.windowMs
    const activeRequests = entry.requests.filter(ts => ts > windowStart)
    
    const current = activeRequests.length
    const remaining = Math.max(0, config.requestsPerMinute - current)
    const oldestRequest = activeRequests[0]
    const resetIn = oldestRequest 
      ? Math.ceil((oldestRequest + config.windowMs - now) / 1000)
      : Math.ceil(config.windowMs / 1000)

    return {
      allowed: current < config.requestsPerMinute,
      remaining,
      resetIn,
      current,
      limit: config.requestsPerMinute
    }
  }

  /**
   * Reset rate limit for an extension.
   * 
   * @param orgId - Organization ID
   * @param extensionId - Extension ID
   */
  reset(orgId: string, extensionId: string): void {
    const key = this.getKey(orgId, extensionId)
    this.entries.delete(key)
  }

  /**
   * Clean up stale entries (entries with no recent requests).
   */
  private cleanup(): void {
    const now = Date.now()
    const staleThreshold = 5 * 60 * 1000 // 5 minutes

    for (const [key, entry] of this.entries) {
      const config = this.getConfig(key)
      const latestRequest = entry.requests[entry.requests.length - 1]
      
      if (!latestRequest || now - latestRequest > staleThreshold + config.windowMs) {
        this.entries.delete(key)
      }
    }
  }

  /**
   * Stop the cleanup interval.
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.entries.clear()
    this.configs.clear()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let globalLimiter: ExtensionRateLimiter | null = null

/**
 * Get or create the global rate limiter.
 */
export function getRateLimiter(): ExtensionRateLimiter {
  if (!globalLimiter) {
    globalLimiter = new ExtensionRateLimiter()
  }
  return globalLimiter
}

/**
 * Dispose the global rate limiter.
 */
export function disposeRateLimiter(): void {
  if (globalLimiter) {
    globalLimiter.dispose()
    globalLimiter = null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check rate limit and throw if exceeded.
 * 
 * @param orgId - Organization ID
 * @param extensionId - Extension ID
 * @param requestSize - Request body size in bytes
 * @throws Error if rate limited
 */
export function checkRateLimit(
  orgId: string,
  extensionId: string,
  requestSize: number
): RateLimitResult {
  const limiter = getRateLimiter()
  return limiter.check(orgId, extensionId, requestSize)
}

/**
 * Get rate limit headers for response.
 * 
 * @param result - Rate limit check result
 * @returns Headers object
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + result.resetIn)
  }

  if (!result.allowed && result.retryAfter) {
    headers['Retry-After'] = String(result.retryAfter)
  }

  return headers
}
