/**
 * Extension Events API Implementation
 * 
 * Provides event subscription and emission for extensions.
 * Extensions can subscribe to application events and emit their own events.
 * 
 * @module extensions/api/events
 */

import type {
  EventsAPI,
  ExtensionEvent,
  Disposable,
} from './types'
import { toDisposable } from './types'

// ============================================
// IPC Channel Constants
// ============================================

/**
 * IPC channels used by the Events API.
 */
export const EVENTS_IPC_CHANNELS = {
  SUBSCRIBE: 'extension:events:subscribe',
  UNSUBSCRIBE: 'extension:events:unsubscribe',
  EMIT: 'extension:events:emit',
  EVENT: 'extension:events:event',
} as const

// ============================================
// Helper Functions
// ============================================

/**
 * Send an IPC message to the main process.
 */
async function sendIPC<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (typeof window !== 'undefined' && (window as any).__extensionIPC) {
    return (window as any).__extensionIPC.invoke(channel, ...args)
  }
  throw new Error(`IPC not available: ${channel}`)
}

/**
 * Generate a unique subscription ID.
 */
function generateSubscriptionId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// ============================================
// Event Subscription Management
// ============================================

/**
 * Map of event subscriptions per extension.
 * Structure: Map<extensionId, Map<event, Map<subscriptionId, callback>>>
 */
const subscriptions = new Map<string, Map<string, Map<string, (...args: unknown[]) => void>>>()

/**
 * Get or create the subscription map for an extension.
 */
function getExtensionSubscriptions(
  extensionId: string
): Map<string, Map<string, (...args: unknown[]) => void>> {
  let extSubs = subscriptions.get(extensionId)
  if (!extSubs) {
    extSubs = new Map()
    subscriptions.set(extensionId, extSubs)
  }
  return extSubs
}

/**
 * Get or create the subscription map for an event.
 */
function getEventSubscriptions(
  extensionId: string,
  event: string
): Map<string, (...args: unknown[]) => void> {
  const extSubs = getExtensionSubscriptions(extensionId)
  let eventSubs = extSubs.get(event)
  if (!eventSubs) {
    eventSubs = new Map()
    extSubs.set(event, eventSubs)
  }
  return eventSubs
}

/**
 * Handle an incoming event from the main process.
 */
export function handleEvent(
  extensionId: string,
  event: string,
  args: unknown[]
): void {
  const eventSubs = getEventSubscriptions(extensionId, event)
  for (const callback of eventSubs.values()) {
    try {
      callback(...args)
    } catch (error) {
      console.error(`[Extension:${extensionId}] Error in event callback for '${event}':`, error)
    }
  }
}

/**
 * Broadcast an event to all subscribed extensions.
 */
export function broadcastEvent(event: string, args: unknown[]): void {
  for (const [extensionId, extSubs] of subscriptions.entries()) {
    const eventSubs = extSubs.get(event)
    if (eventSubs) {
      for (const callback of eventSubs.values()) {
        try {
          callback(...args)
        } catch (error) {
          console.error(`[Extension:${extensionId}] Error in broadcast callback for '${event}':`, error)
        }
      }
    }
  }
}

// ============================================
// Events API Implementation
// ============================================

/**
 * Create the Events API implementation for an extension.
 * 
 * @param extensionId - The ID of the extension using this API
 * @param grantedPermissions - Permissions granted to the extension
 * @returns The Events API implementation
 * 
 * @example
 * ```typescript
 * const events = createEventsAPI('my-extension', [])
 * 
 * // Subscribe to vault changes
 * context.subscriptions.push(
 *   events.on('vault:changed', (vaultId) => {
 *     console.log('Vault changed to:', vaultId)
 *   })
 * )
 * 
 * // Emit custom event (must be prefixed with extension ID)
 * events.emit('my-extension.customEvent', { data: 'value' })
 * ```
 */
export function createEventsAPI(
  extensionId: string,
  _grantedPermissions: string[]
): EventsAPI {
  return {
    /**
     * Subscribe to an application event.
     */
    on(event: ExtensionEvent, callback: (...args: unknown[]) => void): Disposable {
      // No permission check - event subscription is always allowed
      
      const subscriptionId = generateSubscriptionId()
      const eventSubs = getEventSubscriptions(extensionId, event)
      
      // Store callback locally
      eventSubs.set(subscriptionId, callback)
      
      // Register with main process
      sendIPC(EVENTS_IPC_CHANNELS.SUBSCRIBE, {
        extensionId,
        event,
        subscriptionId,
      }).catch((error) => {
        console.error(`[Extension:${extensionId}] Failed to subscribe to event '${event}':`, error)
        eventSubs.delete(subscriptionId)
      })
      
      // Return disposable for cleanup
      return toDisposable(() => {
        eventSubs.delete(subscriptionId)
        sendIPC(EVENTS_IPC_CHANNELS.UNSUBSCRIBE, {
          extensionId,
          event,
          subscriptionId,
        }).catch((error) => {
          console.error(`[Extension:${extensionId}] Failed to unsubscribe from event '${event}':`, error)
        })
      })
    },

    /**
     * Emit an event.
     * Extensions can only emit events prefixed with their extension ID.
     */
    emit(event: string, ...args: unknown[]): void {
      // Validate event prefix
      if (!event.startsWith(`${extensionId}.`)) {
        throw new Error(
          `Extensions can only emit events prefixed with their ID. ` +
          `Expected '${extensionId}.*', got '${event}'`
        )
      }
      
      // Broadcast locally first
      broadcastEvent(event, args)
      
      // Send to main process for cross-extension communication
      sendIPC(EVENTS_IPC_CHANNELS.EMIT, {
        extensionId,
        event,
        args,
      }).catch((error) => {
        console.error(`[Extension:${extensionId}] Failed to emit event '${event}':`, error)
      })
    },
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create a typed event emitter for a specific event.
 * 
 * @param events - The Events API instance
 * @param eventName - The event name to emit
 * @returns A typed emit function
 * 
 * @example
 * ```typescript
 * const emitSyncComplete = createTypedEmitter<[number]>(
 *   api.events,
 *   'my-extension.syncComplete'
 * )
 * 
 * emitSyncComplete(42) // Emit with file count
 * ```
 */
export function createTypedEmitter<TArgs extends unknown[]>(
  events: EventsAPI,
  eventName: string
): (...args: TArgs) => void {
  return (...args: TArgs) => events.emit(eventName, ...args)
}

/**
 * Create a typed event subscriber for a specific event.
 * 
 * @param events - The Events API instance
 * @param event - The event to subscribe to
 * @param callback - The typed callback function
 * @returns Disposable for cleanup
 */
export function onTyped<TArgs extends unknown[]>(
  events: EventsAPI,
  event: ExtensionEvent,
  callback: (...args: TArgs) => void
): Disposable {
  return events.on(event, callback as (...args: unknown[]) => void)
}

/**
 * Subscribe to an event once (auto-unsubscribe after first trigger).
 * 
 * @param events - The Events API instance
 * @param event - The event to subscribe to
 * @param callback - The callback function
 * @returns Disposable for manual cleanup
 */
export function once(
  events: EventsAPI,
  event: ExtensionEvent,
  callback: (...args: unknown[]) => void
): Disposable {
  const disposable = events.on(event, (...args) => {
    disposable.dispose()
    callback(...args)
  })
  return disposable
}

/**
 * Wait for an event to fire (promise-based).
 * 
 * @param events - The Events API instance
 * @param event - The event to wait for
 * @param timeout - Optional timeout in milliseconds
 * @returns Promise that resolves with event args
 * 
 * @example
 * ```typescript
 * const [vaultId] = await waitForEvent(api.events, 'vault:changed', 5000)
 * ```
 */
export function waitForEvent<T extends unknown[] = unknown[]>(
  events: EventsAPI,
  event: ExtensionEvent,
  timeout?: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    
    const disposable = events.on(event, (...args) => {
      if (timeoutId) clearTimeout(timeoutId)
      disposable.dispose()
      resolve(args as T)
    })
    
    if (timeout) {
      timeoutId = setTimeout(() => {
        disposable.dispose()
        reject(new Error(`Timeout waiting for event '${event}'`))
      }, timeout)
    }
  })
}

/**
 * Get all subscriptions for an extension.
 * Primarily for debugging/testing.
 */
export function getExtensionSubscriptionCount(extensionId: string): number {
  const extSubs = subscriptions.get(extensionId)
  if (!extSubs) return 0
  
  let count = 0
  for (const eventSubs of extSubs.values()) {
    count += eventSubs.size
  }
  return count
}

/**
 * Clear all subscriptions for an extension.
 * Used during extension deactivation.
 */
export function clearExtensionSubscriptions(extensionId: string): void {
  subscriptions.delete(extensionId)
}

/**
 * Clear all subscriptions for all extensions.
 * Used during host shutdown.
 */
export function clearAllSubscriptions(): void {
  subscriptions.clear()
}

// ============================================
// Export Types
// ============================================

export type { EventsAPI, ExtensionEvent }
