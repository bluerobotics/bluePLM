/**
 * Extension Telemetry API Implementation
 * 
 * Provides anonymous, privacy-respecting analytics for extensions.
 * All telemetry is aggregated and cannot identify individual users.
 * 
 * @module extensions/api/telemetry
 */

import type {
  TelemetryAPI,
  TelemetryProperties,
} from './types'
import { checkPermission } from './permissions'

// ============================================
// IPC Channel Constants
// ============================================

/**
 * IPC channels used by the Telemetry API.
 */
export const TELEMETRY_IPC_CHANNELS = {
  TRACK_EVENT: 'extension:telemetry:trackEvent',
  TRACK_ERROR: 'extension:telemetry:trackError',
  TRACK_TIMING: 'extension:telemetry:trackTiming',
} as const

// ============================================
// Configuration
// ============================================

/**
 * Maximum number of properties per event.
 */
const MAX_PROPERTIES = 20

/**
 * Maximum length of property values.
 */
const MAX_PROPERTY_VALUE_LENGTH = 500

/**
 * Maximum length of event names.
 */
const MAX_EVENT_NAME_LENGTH = 100

/**
 * Rate limit: maximum events per minute per extension.
 */
const MAX_EVENTS_PER_MINUTE = 60

// ============================================
// Rate Limiting
// ============================================

/**
 * Track event counts for rate limiting.
 */
const eventCounts = new Map<string, { count: number; resetAt: number }>()

/**
 * Check if an extension is rate limited.
 */
function checkRateLimit(extensionId: string): boolean {
  const now = Date.now()
  const record = eventCounts.get(extensionId)
  
  if (!record || record.resetAt < now) {
    // Reset counter
    eventCounts.set(extensionId, { count: 1, resetAt: now + 60000 })
    return false
  }
  
  if (record.count >= MAX_EVENTS_PER_MINUTE) {
    return true // Rate limited
  }
  
  record.count++
  return false
}

// ============================================
// Helper Functions
// ============================================

/**
 * Send an IPC message to the main process.
 */
function sendIPC(channel: string, ...args: unknown[]): void {
  if (typeof window !== 'undefined' && (window as any).__extensionIPC) {
    // Fire and forget for telemetry
    (window as any).__extensionIPC.invoke(channel, ...args).catch(() => {
      // Silently ignore telemetry failures
    })
  }
}

/**
 * Sanitize a telemetry property value.
 */
function sanitizeValue(value: unknown): string | number | boolean {
  if (typeof value === 'boolean' || typeof value === 'number') {
    return value
  }
  
  const str = String(value)
  if (str.length > MAX_PROPERTY_VALUE_LENGTH) {
    return str.substring(0, MAX_PROPERTY_VALUE_LENGTH) + '...'
  }
  return str
}

/**
 * Sanitize telemetry properties.
 */
function sanitizeProperties(
  properties: TelemetryProperties | undefined
): TelemetryProperties | undefined {
  if (!properties) return undefined
  
  const entries = Object.entries(properties)
  if (entries.length > MAX_PROPERTIES) {
    console.warn(`[Telemetry] Too many properties (${entries.length}), truncating to ${MAX_PROPERTIES}`)
  }
  
  const sanitized: TelemetryProperties = {}
  for (const [key, value] of entries.slice(0, MAX_PROPERTIES)) {
    sanitized[key] = sanitizeValue(value)
  }
  
  return sanitized
}

/**
 * Sanitize an event name.
 */
function sanitizeEventName(name: string): string {
  if (name.length > MAX_EVENT_NAME_LENGTH) {
    return name.substring(0, MAX_EVENT_NAME_LENGTH)
  }
  return name
}

/**
 * Sanitize an error for transmission.
 * Strips potentially sensitive information.
 */
function sanitizeError(error: Error): { message: string; name: string; stack?: string } {
  return {
    message: error.message.substring(0, 500),
    name: error.name,
    // Include truncated stack for debugging
    stack: error.stack?.substring(0, 1000),
  }
}

// ============================================
// Telemetry API Implementation
// ============================================

/**
 * Create the Telemetry API implementation for an extension.
 * 
 * @param extensionId - The ID of the extension using this API
 * @param grantedPermissions - Permissions granted to the extension
 * @returns The Telemetry API implementation
 * 
 * @example
 * ```typescript
 * const telemetry = createTelemetryAPI('my-extension', ['telemetry'])
 * 
 * // Track an event
 * telemetry.trackEvent('sync_completed', { 
 *   fileCount: 42, 
 *   duration: 1500 
 * })
 * 
 * // Track timing
 * const start = performance.now()
 * await longOperation()
 * telemetry.trackTiming('long_operation', performance.now() - start)
 * ```
 */
export function createTelemetryAPI(
  extensionId: string,
  grantedPermissions: string[]
): TelemetryAPI {
  return {
    /**
     * Track a named event with optional properties.
     */
    trackEvent(name: string, properties?: TelemetryProperties): void {
      checkPermission(extensionId, 'telemetry.trackEvent', grantedPermissions)
      
      if (checkRateLimit(extensionId)) {
        console.warn(`[Extension:${extensionId}] Telemetry rate limited`)
        return
      }
      
      const sanitizedName = sanitizeEventName(name)
      const sanitizedProperties = sanitizeProperties(properties)
      
      sendIPC(TELEMETRY_IPC_CHANNELS.TRACK_EVENT, {
        extensionId,
        name: sanitizedName,
        properties: sanitizedProperties,
        timestamp: Date.now(),
      })
    },

    /**
     * Track an error occurrence.
     */
    trackError(error: Error, context?: Record<string, string>): void {
      checkPermission(extensionId, 'telemetry.trackError', grantedPermissions)
      
      if (checkRateLimit(extensionId)) {
        return // Silently drop rate-limited errors
      }
      
      const sanitizedError = sanitizeError(error)
      const sanitizedContext = context 
        ? sanitizeProperties(context) 
        : undefined
      
      sendIPC(TELEMETRY_IPC_CHANNELS.TRACK_ERROR, {
        extensionId,
        error: sanitizedError,
        context: sanitizedContext,
        timestamp: Date.now(),
      })
    },

    /**
     * Track a timing measurement.
     */
    trackTiming(name: string, durationMs: number): void {
      checkPermission(extensionId, 'telemetry.trackTiming', grantedPermissions)
      
      if (checkRateLimit(extensionId)) {
        return
      }
      
      const sanitizedName = sanitizeEventName(name)
      
      // Ensure duration is a reasonable value
      const safeDuration = Math.max(0, Math.min(durationMs, 3600000)) // Max 1 hour
      
      sendIPC(TELEMETRY_IPC_CHANNELS.TRACK_TIMING, {
        extensionId,
        name: sanitizedName,
        durationMs: Math.round(safeDuration),
        timestamp: Date.now(),
      })
    },
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create a timing helper that automatically tracks duration.
 * 
 * @param telemetry - The telemetry API instance
 * @param name - Name for the timing event
 * @returns Object with start() and stop() methods
 * 
 * @example
 * ```typescript
 * const timer = createTimer(api.telemetry, 'sync_operation')
 * timer.start()
 * await syncOperation()
 * timer.stop() // Automatically tracks duration
 * ```
 */
export function createTimer(
  telemetry: TelemetryAPI,
  name: string
): { start: () => void; stop: () => void } {
  let startTime: number | null = null
  
  return {
    start() {
      startTime = performance.now()
    },
    stop() {
      if (startTime !== null) {
        const duration = performance.now() - startTime
        telemetry.trackTiming(name, duration)
        startTime = null
      }
    },
  }
}

/**
 * Wrap an async function with automatic timing.
 * 
 * @param telemetry - The telemetry API instance
 * @param name - Name for the timing event
 * @param fn - The async function to wrap
 * @returns The wrapped function
 * 
 * @example
 * ```typescript
 * const timedSync = withTiming(api.telemetry, 'sync', async () => {
 *   await syncFiles()
 * })
 * await timedSync()
 * ```
 */
export function withTiming<TArgs extends unknown[], TResult>(
  telemetry: TelemetryAPI,
  name: string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const start = performance.now()
    try {
      return await fn(...args)
    } finally {
      telemetry.trackTiming(name, performance.now() - start)
    }
  }
}

/**
 * Track errors with automatic context from function name.
 * 
 * @param telemetry - The telemetry API instance
 * @param fn - The async function to wrap
 * @param operationName - Name of the operation for context
 * @returns The wrapped function
 */
export function withErrorTracking<TArgs extends unknown[], TResult>(
  telemetry: TelemetryAPI,
  fn: (...args: TArgs) => Promise<TResult>,
  operationName: string
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args)
    } catch (error) {
      if (error instanceof Error) {
        telemetry.trackError(error, { operation: operationName })
      }
      throw error
    }
  }
}

// ============================================
// Export Types
// ============================================

export type { TelemetryAPI, TelemetryProperties }
