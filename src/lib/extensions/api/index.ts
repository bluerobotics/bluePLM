/**
 * Extension Client API
 * 
 * This module exports the complete sandboxed API available to extensions
 * running in the Extension Host. All operations are permission-gated and
 * forwarded via IPC to the main process.
 * 
 * @module extensions/api
 */

// ============================================
// Type Exports
// ============================================

export type {
  // Core types
  Disposable,
  
  // UI types
  UIAPI,
  ToastType,
  DialogOptions,
  DialogResult,
  ConnectionStatus,
  ProgressOptions,
  Progress,
  CancellationToken,
  QuickPickItem,
  QuickPickOptions,
  InputBoxOptions,
  
  // Storage types
  ExtensionStorage,
  
  // Network types
  NetworkAPI,
  FetchOptions,
  FetchResponse,
  HttpMethod,
  
  // Commands types
  CommandsAPI,
  CommandHandler,
  CommandOptions,
  
  // Workspace types
  WorkspaceAPI,
  FileChangeEvent,
  FileChangeType,
  OpenFile,
  VaultInfo,
  
  // Telemetry types
  TelemetryAPI,
  TelemetryProperties,
  
  // Events types
  EventsAPI,
  ExtensionEvent,
  
  // Context types
  ExtensionContextInfo,
  UserContext,
  OrganizationContext,
  
  // Main API type
  ExtensionClientAPI,
  
  // Permission types
  ClientPermission,
} from './types'

// ============================================
// Type Utilities
// ============================================

export { toDisposable, API_PERMISSIONS } from './types'

// ============================================
// API Factory Functions
// ============================================

export { createUIAPI, UI_IPC_CHANNELS } from './ui'
export { createStorageAPI, createLocalStorageAPI, STORAGE_IPC_CHANNELS } from './storage'
export { createNetworkAPI, isSuccessResponse, createResponseError, NETWORK_IPC_CHANNELS } from './network'
export { createCommandsAPI, createCommandExecutor, getLocalCommands, clearLocalCommands, handleCommandInvocation, COMMANDS_IPC_CHANNELS } from './commands'
export { createWorkspaceAPI, createFileChangeEvent, batchFileChanges, filterByChangeType, filterByVault, getActiveSubscriptionCount, clearFileChangeSubscriptions, handleFileChangeEvent, WORKSPACE_IPC_CHANNELS } from './workspace'
export { createTelemetryAPI, createTimer, withTiming, withErrorTracking, TELEMETRY_IPC_CHANNELS } from './telemetry'
export { createEventsAPI, createTypedEmitter, onTyped, once, waitForEvent, getExtensionSubscriptionCount, clearExtensionSubscriptions, clearAllSubscriptions, handleEvent, broadcastEvent, EVENTS_IPC_CHANNELS } from './events'
export { createInitialContext, fetchContext, getCachedContext, onContextChange, createContextProxy, createActivationContext, disposeActivationContext, clearContext, clearAllContexts, handleContextChange, isAuthenticated, hasOrganization, getUserEmail, getOrgName, CONTEXT_IPC_CHANNELS } from './context'
export type { ExtensionActivationContext } from './context'

// ============================================
// Permission System
// ============================================

export {
  checkPermission,
  hasPermission,
  hasPermissions,
  getRequiredPermissions,
  validatePermissions,
  normalizePermissions,
  grantPermissions,
  revokePermissions,
  getPermissionDescription,
  getPermissionCategory,
  PermissionDeniedError,
  VALID_CLIENT_PERMISSIONS,
  PERMISSION_CATEGORIES,
} from './permissions'

export type { PermissionCategory } from './permissions'

// ============================================
// Extension Client API Factory
// ============================================

import type { ExtensionClientAPI } from './types'
import { createUIAPI } from './ui'
import { createStorageAPI } from './storage'
import { createNetworkAPI } from './network'
import { createCommandsAPI } from './commands'
import { createWorkspaceAPI } from './workspace'
import { createTelemetryAPI } from './telemetry'
import { createEventsAPI } from './events'
import { createContextProxy } from './context'

/**
 * Options for creating the Extension Client API.
 */
export interface CreateExtensionClientAPIOptions {
  /** The extension ID */
  extensionId: string
  /** The extension version */
  version: string
  /** Permissions granted to the extension */
  permissions: string[]
  /** Allowed external domains for fetch (from manifest) */
  allowedDomains?: string[]
}

/**
 * Create the complete Extension Client API for an extension.
 * 
 * This is the main factory function that creates all API components
 * and assembles them into the unified ExtensionClientAPI interface.
 * 
 * @param options - Configuration options
 * @returns The complete Extension Client API
 * 
 * @example
 * ```typescript
 * const api = createExtensionClientAPI({
 *   extensionId: 'blueplm.google-drive',
 *   version: '1.0.0',
 *   permissions: ['ui:toast', 'storage:local', 'network:orgApi'],
 *   allowedDomains: ['googleapis.com'],
 * })
 * 
 * // Use the API
 * api.ui.showToast('Hello!', 'success')
 * ```
 */
export function createExtensionClientAPI(
  options: CreateExtensionClientAPIOptions
): ExtensionClientAPI {
  const { extensionId, version, permissions, allowedDomains = [] } = options
  
  // Create individual API components
  const ui = createUIAPI(extensionId, permissions)
  const storage = createStorageAPI(extensionId, permissions)
  const network = createNetworkAPI(extensionId, permissions, allowedDomains)
  const commands = createCommandsAPI(extensionId, permissions)
  const workspace = createWorkspaceAPI(extensionId, permissions)
  const telemetry = createTelemetryAPI(extensionId, permissions)
  const events = createEventsAPI(extensionId, permissions)
  const context = createContextProxy(extensionId, version)
  
  // Assemble the complete API
  return {
    ui,
    storage,
    callOrgApi: network.callOrgApi,
    callStoreApi: network.callStoreApi,
    fetch: network.fetch,
    commands,
    workspace,
    events,
    telemetry,
    context,
  }
}

// ============================================
// All IPC Channels (for main process handler)
// ============================================

import { UI_IPC_CHANNELS } from './ui'
import { STORAGE_IPC_CHANNELS } from './storage'
import { NETWORK_IPC_CHANNELS } from './network'
import { COMMANDS_IPC_CHANNELS } from './commands'
import { WORKSPACE_IPC_CHANNELS } from './workspace'
import { TELEMETRY_IPC_CHANNELS } from './telemetry'
import { EVENTS_IPC_CHANNELS } from './events'
import { CONTEXT_IPC_CHANNELS } from './context'

/**
 * All IPC channels used by the Extension Client API.
 * Useful for the main process to register all handlers.
 */
export const ALL_IPC_CHANNELS = {
  ...UI_IPC_CHANNELS,
  ...STORAGE_IPC_CHANNELS,
  ...NETWORK_IPC_CHANNELS,
  ...COMMANDS_IPC_CHANNELS,
  ...WORKSPACE_IPC_CHANNELS,
  ...TELEMETRY_IPC_CHANNELS,
  ...EVENTS_IPC_CHANNELS,
  ...CONTEXT_IPC_CHANNELS,
} as const

/**
 * List of all IPC channel names.
 */
export const IPC_CHANNEL_LIST = Object.values(ALL_IPC_CHANNELS)
