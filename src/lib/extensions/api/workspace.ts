/**
 * Extension Workspace API Implementation
 * 
 * Provides access to workspace state including open files, vaults, and file change events.
 * 
 * @module extensions/api/workspace
 */

import type {
  WorkspaceAPI,
  FileChangeEvent,
  FileChangeType,
  OpenFile,
  VaultInfo,
  Disposable,
} from './types'
import { checkPermission } from './permissions'
import { toDisposable } from './types'

// ============================================
// IPC Channel Constants
// ============================================

/**
 * IPC channels used by the Workspace API.
 */
export const WORKSPACE_IPC_CHANNELS = {
  GET_OPEN_FILES: 'extension:workspace:getOpenFiles',
  GET_CURRENT_VAULT: 'extension:workspace:getCurrentVault',
  GET_VAULTS: 'extension:workspace:getVaults',
  SUBSCRIBE_FILE_CHANGES: 'extension:workspace:subscribeFileChanges',
  UNSUBSCRIBE_FILE_CHANGES: 'extension:workspace:unsubscribeFileChanges',
  FILE_CHANGED: 'extension:workspace:fileChanged',
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
  return `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// ============================================
// File Change Event Handling
// ============================================

/**
 * Map of active file change subscriptions.
 */
const fileChangeSubscriptions = new Map<string, (events: FileChangeEvent[]) => void>()

/**
 * Handle incoming file change events from main process.
 */
export function handleFileChangeEvent(events: FileChangeEvent[]): void {
  for (const callback of fileChangeSubscriptions.values()) {
    try {
      callback(events)
    } catch (error) {
      console.error('[Extension:Workspace] Error in file change callback:', error)
    }
  }
}

// ============================================
// Workspace API Implementation
// ============================================

/**
 * Create the Workspace API implementation for an extension.
 * 
 * @param extensionId - The ID of the extension using this API
 * @param grantedPermissions - Permissions granted to the extension
 * @returns The Workspace API implementation
 * 
 * @example
 * ```typescript
 * const workspace = createWorkspaceAPI('my-extension', ['workspace:files'])
 * 
 * // Subscribe to file changes
 * const disposable = workspace.onFileChanged((events) => {
 *   for (const event of events) {
 *     console.log(`File ${event.type}: ${event.path}`)
 *   }
 * })
 * 
 * // Get current vault
 * const vault = await workspace.getCurrentVault()
 * ```
 */
export function createWorkspaceAPI(
  extensionId: string,
  grantedPermissions: string[]
): WorkspaceAPI {
  return {
    /**
     * Subscribe to file change events.
     */
    onFileChanged(callback: (events: FileChangeEvent[]) => void): Disposable {
      checkPermission(extensionId, 'workspace.onFileChanged', grantedPermissions)
      
      const subscriptionId = generateSubscriptionId()
      
      // Store callback locally
      fileChangeSubscriptions.set(subscriptionId, callback)
      
      // Register with main process
      sendIPC(WORKSPACE_IPC_CHANNELS.SUBSCRIBE_FILE_CHANGES, {
        extensionId,
        subscriptionId,
      }).catch((error) => {
        console.error(`[Extension:${extensionId}] Failed to subscribe to file changes:`, error)
        fileChangeSubscriptions.delete(subscriptionId)
      })
      
      // Return disposable for cleanup
      return toDisposable(() => {
        fileChangeSubscriptions.delete(subscriptionId)
        sendIPC(WORKSPACE_IPC_CHANNELS.UNSUBSCRIBE_FILE_CHANGES, {
          extensionId,
          subscriptionId,
        }).catch((error) => {
          console.error(`[Extension:${extensionId}] Failed to unsubscribe from file changes:`, error)
        })
      })
    },

    /**
     * Get list of currently open files.
     */
    async getOpenFiles(): Promise<OpenFile[]> {
      checkPermission(extensionId, 'workspace.getOpenFiles', grantedPermissions)
      
      const result = await sendIPC<{ files: OpenFile[] }>(
        WORKSPACE_IPC_CHANNELS.GET_OPEN_FILES,
        { extensionId }
      )
      
      return result.files
    },

    /**
     * Get the currently active vault.
     */
    async getCurrentVault(): Promise<VaultInfo | undefined> {
      // No permission check needed for getting current vault
      
      const result = await sendIPC<{ vault?: VaultInfo }>(
        WORKSPACE_IPC_CHANNELS.GET_CURRENT_VAULT,
        { extensionId }
      )
      
      return result.vault
    },

    /**
     * Get all configured vaults.
     */
    async getVaults(): Promise<VaultInfo[]> {
      // No permission check needed for listing vaults
      
      const result = await sendIPC<{ vaults: VaultInfo[] }>(
        WORKSPACE_IPC_CHANNELS.GET_VAULTS,
        { extensionId }
      )
      
      return result.vaults
    },
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create a FileChangeEvent object.
 * Utility for main process handlers.
 */
export function createFileChangeEvent(
  type: FileChangeType,
  path: string,
  vaultId: string
): FileChangeEvent {
  return { type, path, vaultId }
}

/**
 * Batch multiple file changes into a single event array.
 * Helps reduce IPC overhead for bulk operations.
 */
export function batchFileChanges(
  changes: Array<{ type: FileChangeType; path: string; vaultId: string }>
): FileChangeEvent[] {
  return changes.map(({ type, path, vaultId }) => 
    createFileChangeEvent(type, path, vaultId)
  )
}

/**
 * Filter file changes by type.
 */
export function filterByChangeType(
  events: FileChangeEvent[],
  type: FileChangeType
): FileChangeEvent[] {
  return events.filter((event) => event.type === type)
}

/**
 * Filter file changes by vault.
 */
export function filterByVault(
  events: FileChangeEvent[],
  vaultId: string
): FileChangeEvent[] {
  return events.filter((event) => event.vaultId === vaultId)
}

/**
 * Get the number of active file change subscriptions.
 * Primarily for debugging/testing.
 */
export function getActiveSubscriptionCount(): number {
  return fileChangeSubscriptions.size
}

/**
 * Clear all file change subscriptions.
 * Used during extension deactivation.
 */
export function clearFileChangeSubscriptions(): void {
  fileChangeSubscriptions.clear()
}

// ============================================
// Export Types
// ============================================

export type { WorkspaceAPI, FileChangeEvent, FileChangeType, OpenFile, VaultInfo }
