/**
 * Extension Context Implementation
 * 
 * Provides read-only context information about the current session.
 * Extensions receive this context when they are activated.
 * 
 * @module extensions/api/context
 */

import type {
  ExtensionContextInfo,
  UserContext,
  OrganizationContext,
  Disposable,
} from './types'

// ============================================
// IPC Channel Constants
// ============================================

/**
 * IPC channels used by the Context API.
 */
export const CONTEXT_IPC_CHANNELS = {
  GET_CONTEXT: 'extension:context:get',
  CONTEXT_CHANGED: 'extension:context:changed',
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

// ============================================
// Context Data
// ============================================

/**
 * Cached context data per extension.
 */
const contextCache = new Map<string, ExtensionContextInfo>()

/**
 * Context change listeners.
 */
const contextListeners = new Map<string, Set<(context: ExtensionContextInfo) => void>>()

/**
 * Handle context change from main process.
 */
export function handleContextChange(
  extensionId: string,
  context: Partial<ExtensionContextInfo>
): void {
  const cached = contextCache.get(extensionId)
  if (cached) {
    const updated = { ...cached, ...context }
    contextCache.set(extensionId, updated)
    
    // Notify listeners
    const listeners = contextListeners.get(extensionId)
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(updated)
        } catch (error) {
          console.error(`[Extension:${extensionId}] Error in context change callback:`, error)
        }
      }
    }
  }
}

// ============================================
// Context API Implementation
// ============================================

/**
 * Create the initial context for an extension.
 * 
 * @param extensionId - The ID of the extension
 * @param version - The extension version
 * @returns The initial context (to be updated via IPC)
 */
export function createInitialContext(
  extensionId: string,
  version: string
): ExtensionContextInfo {
  const context: ExtensionContextInfo = {
    extensionId,
    version,
    user: null,
    organization: null,
    isOnline: false,
    appVersion: '0.0.0',
    platform: 'unknown',
  }
  
  contextCache.set(extensionId, context)
  return context
}

/**
 * Fetch the current context from the main process.
 * 
 * @param extensionId - The ID of the extension
 * @returns The current context
 */
export async function fetchContext(
  extensionId: string
): Promise<ExtensionContextInfo> {
  try {
    const context = await sendIPC<ExtensionContextInfo>(
      CONTEXT_IPC_CHANNELS.GET_CONTEXT,
      { extensionId }
    )
    
    contextCache.set(extensionId, context)
    return context
  } catch (error) {
    console.error(`[Extension:${extensionId}] Failed to fetch context:`, error)
    
    // Return cached or initial context
    const cached = contextCache.get(extensionId)
    if (cached) return cached
    
    return createInitialContext(extensionId, 'unknown')
  }
}

/**
 * Get the cached context for an extension.
 * 
 * @param extensionId - The ID of the extension
 * @returns The cached context, or undefined if not initialized
 */
export function getCachedContext(
  extensionId: string
): ExtensionContextInfo | undefined {
  return contextCache.get(extensionId)
}

/**
 * Subscribe to context changes.
 * 
 * @param extensionId - The ID of the extension
 * @param callback - Function called when context changes
 * @returns Disposable to unsubscribe
 */
export function onContextChange(
  extensionId: string,
  callback: (context: ExtensionContextInfo) => void
): Disposable {
  let listeners = contextListeners.get(extensionId)
  if (!listeners) {
    listeners = new Set()
    contextListeners.set(extensionId, listeners)
  }
  
  listeners.add(callback)
  
  return {
    dispose() {
      listeners?.delete(callback)
    },
  }
}

/**
 * Create a proxy for the context that updates automatically.
 * 
 * @param extensionId - The ID of the extension
 * @param version - The extension version
 * @returns A proxy object that reflects current context
 */
export function createContextProxy(
  extensionId: string,
  version: string
): ExtensionContextInfo {
  const context = createInitialContext(extensionId, version)
  
  // Initialize from main process
  fetchContext(extensionId).catch(() => {
    // Ignore initialization errors - we have default values
  })
  
  // Return proxy that always reads from cache
  return new Proxy(context, {
    get(target, prop) {
      const cached = contextCache.get(extensionId)
      if (cached && prop in cached) {
        return (cached as any)[prop]
      }
      return (target as any)[prop]
    },
  })
}

// ============================================
// Context Helpers
// ============================================

/**
 * Check if a user is currently authenticated.
 * 
 * @param context - The context to check
 */
export function isAuthenticated(context: ExtensionContextInfo): boolean {
  return context.user !== null
}

/**
 * Check if an organization is selected.
 * 
 * @param context - The context to check
 */
export function hasOrganization(context: ExtensionContextInfo): boolean {
  return context.organization !== null
}

/**
 * Get the current user's email or a fallback.
 * 
 * @param context - The context
 * @param fallback - Fallback value if no user
 */
export function getUserEmail(
  context: ExtensionContextInfo,
  fallback: string = 'anonymous'
): string {
  return context.user?.email ?? fallback
}

/**
 * Get the current organization name or a fallback.
 * 
 * @param context - The context
 * @param fallback - Fallback value if no org
 */
export function getOrgName(
  context: ExtensionContextInfo,
  fallback: string = 'Unknown'
): string {
  return context.organization?.name ?? fallback
}

// ============================================
// Extension Activation Context
// ============================================

/**
 * The context object passed to extension activate() function.
 * This is different from ExtensionContextInfo - it's the activation context.
 */
export interface ExtensionActivationContext {
  /** Extension ID */
  extensionId: string
  
  /** Path to extension files */
  extensionPath: string
  
  /** Path for extension data storage */
  storagePath: string
  
  /** Auto-disposed subscriptions */
  subscriptions: Disposable[]
  
  /** Extension logger */
  log: {
    debug(message: string, ...args: unknown[]): void
    info(message: string, ...args: unknown[]): void
    warn(message: string, ...args: unknown[]): void
    error(message: string, ...args: unknown[]): void
  }
}

/**
 * Create the activation context for an extension.
 * 
 * @param extensionId - The ID of the extension
 * @param extensionPath - Path to extension files
 * @param storagePath - Path for extension data
 * @returns The activation context
 */
export function createActivationContext(
  extensionId: string,
  extensionPath: string,
  storagePath: string
): ExtensionActivationContext {
  const subscriptions: Disposable[] = []
  
  const log = {
    debug(message: string, ...args: unknown[]): void {
      console.debug(`[Extension:${extensionId}]`, message, ...args)
    },
    info(message: string, ...args: unknown[]): void {
      console.info(`[Extension:${extensionId}]`, message, ...args)
    },
    warn(message: string, ...args: unknown[]): void {
      console.warn(`[Extension:${extensionId}]`, message, ...args)
    },
    error(message: string, ...args: unknown[]): void {
      console.error(`[Extension:${extensionId}]`, message, ...args)
    },
  }
  
  return {
    extensionId,
    extensionPath,
    storagePath,
    subscriptions,
    log,
  }
}

/**
 * Dispose all subscriptions in an activation context.
 * 
 * @param context - The activation context
 */
export function disposeActivationContext(context: ExtensionActivationContext): void {
  for (const subscription of context.subscriptions) {
    try {
      subscription.dispose()
    } catch (error) {
      console.error(`[Extension:${context.extensionId}] Error disposing subscription:`, error)
    }
  }
  context.subscriptions.length = 0
}

// ============================================
// Clear Context (for testing/shutdown)
// ============================================

/**
 * Clear cached context for an extension.
 */
export function clearContext(extensionId: string): void {
  contextCache.delete(extensionId)
  contextListeners.delete(extensionId)
}

/**
 * Clear all cached contexts.
 */
export function clearAllContexts(): void {
  contextCache.clear()
  contextListeners.clear()
}

// ============================================
// Export Types
// ============================================

export type { ExtensionContextInfo, UserContext, OrganizationContext }
// ExtensionActivationContext is exported inline with its definition
