/**
 * Extension Storage API Implementation
 * 
 * Provides extension-scoped persistent storage.
 * Each extension has its own isolated storage namespace.
 * 
 * @module extensions/api/storage
 */

import type { ExtensionStorage } from './types'
import { checkPermission } from './permissions'

// ============================================
// IPC Channel Constants
// ============================================

/**
 * IPC channels used by the Storage API.
 */
export const STORAGE_IPC_CHANNELS = {
  GET: 'extension:storage:get',
  SET: 'extension:storage:set',
  DELETE: 'extension:storage:delete',
  KEYS: 'extension:storage:keys',
  HAS: 'extension:storage:has',
  CLEAR: 'extension:storage:clear',
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
 * Get the storage key prefix for an extension.
 * Ensures isolation between extensions.
 */
function getStoragePrefix(extensionId: string): string {
  return `ext:${extensionId}:`
}

// ============================================
// Storage API Implementation
// ============================================

/**
 * Create the Storage API implementation for an extension.
 * 
 * @param extensionId - The ID of the extension using this API
 * @param grantedPermissions - Permissions granted to the extension
 * @returns The Storage API implementation
 * 
 * @example
 * ```typescript
 * const storage = createStorageAPI('my-extension', ['storage:local'])
 * await storage.set('config', { key: 'value' })
 * const config = await storage.get<{ key: string }>('config')
 * ```
 */
export function createStorageAPI(
  extensionId: string,
  grantedPermissions: string[]
): ExtensionStorage {
  const prefix = getStoragePrefix(extensionId)
  
  return {
    /**
     * Get a value from storage.
     */
    async get<T>(key: string): Promise<T | undefined> {
      checkPermission(extensionId, 'storage.get', grantedPermissions)
      
      const prefixedKey = prefix + key
      
      try {
        const result = await sendIPC<{ value?: T; found: boolean }>(
          STORAGE_IPC_CHANNELS.GET,
          { extensionId, key: prefixedKey }
        )
        
        return result.found ? result.value : undefined
      } catch (error) {
        console.error(`[Extension:${extensionId}] Storage get failed:`, error)
        return undefined
      }
    },

    /**
     * Set a value in storage.
     */
    async set<T>(key: string, value: T): Promise<void> {
      checkPermission(extensionId, 'storage.set', grantedPermissions)
      
      const prefixedKey = prefix + key
      
      // Validate that value is JSON-serializable
      try {
        JSON.stringify(value)
      } catch (error) {
        throw new Error(`Storage value must be JSON-serializable: ${error}`)
      }
      
      await sendIPC(STORAGE_IPC_CHANNELS.SET, {
        extensionId,
        key: prefixedKey,
        value,
      })
    },

    /**
     * Delete a value from storage.
     */
    async delete(key: string): Promise<void> {
      checkPermission(extensionId, 'storage.delete', grantedPermissions)
      
      const prefixedKey = prefix + key
      
      await sendIPC(STORAGE_IPC_CHANNELS.DELETE, {
        extensionId,
        key: prefixedKey,
      })
    },

    /**
     * List all keys in storage.
     */
    async keys(): Promise<string[]> {
      checkPermission(extensionId, 'storage.keys', grantedPermissions)
      
      const result = await sendIPC<{ keys: string[] }>(
        STORAGE_IPC_CHANNELS.KEYS,
        { extensionId, prefix }
      )
      
      // Remove prefix from returned keys
      return result.keys.map((k) => k.slice(prefix.length))
    },

    /**
     * Check if a key exists in storage.
     */
    async has(key: string): Promise<boolean> {
      checkPermission(extensionId, 'storage.has', grantedPermissions)
      
      const prefixedKey = prefix + key
      
      const result = await sendIPC<{ exists: boolean }>(
        STORAGE_IPC_CHANNELS.HAS,
        { extensionId, key: prefixedKey }
      )
      
      return result.exists
    },

    /**
     * Clear all data from storage.
     */
    async clear(): Promise<void> {
      checkPermission(extensionId, 'storage.clear', grantedPermissions)
      
      await sendIPC(STORAGE_IPC_CHANNELS.CLEAR, {
        extensionId,
        prefix,
      })
    },
  }
}

// ============================================
// Local Storage Fallback Implementation
// ============================================

/**
 * Create a Storage API implementation using localStorage.
 * Used for development/testing or when IPC is not available.
 * 
 * @param extensionId - The ID of the extension
 * @returns The Storage API implementation backed by localStorage
 */
export function createLocalStorageAPI(extensionId: string): ExtensionStorage {
  const prefix = getStoragePrefix(extensionId)
  
  return {
    async get<T>(key: string): Promise<T | undefined> {
      try {
        const value = localStorage.getItem(prefix + key)
        if (value === null) return undefined
        return JSON.parse(value) as T
      } catch {
        return undefined
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      localStorage.setItem(prefix + key, JSON.stringify(value))
    },

    async delete(key: string): Promise<void> {
      localStorage.removeItem(prefix + key)
    },

    async keys(): Promise<string[]> {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(prefix)) {
          keys.push(key.slice(prefix.length))
        }
      }
      return keys
    },

    async has(key: string): Promise<boolean> {
      return localStorage.getItem(prefix + key) !== null
    },

    async clear(): Promise<void> {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(prefix)) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key))
    },
  }
}

// ============================================
// Export Types
// ============================================

export type { ExtensionStorage }
