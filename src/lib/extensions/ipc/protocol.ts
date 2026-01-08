/**
 * Extension System IPC Protocol
 * 
 * Defines all message types for communication between:
 * - Main Process (Electron main)
 * - Extension Host (hidden renderer with extensions)
 * - App Renderer (main UI)
 * 
 * @module extensions/ipc/protocol
 */

import type {
  ExtensionManifest,
  ExtensionState,
  ExtensionUpdate,
  LoadedExtension,
  StoreExtension,
  WatchdogViolation,
  ExtensionStats,
  VerificationStatus
} from '../types'

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST/RESPONSE ENVELOPE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Unique identifier generator for IPC calls
 */
export function generateCallId(): string {
  return `ipc-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Generic IPC request envelope
 */
export interface IpcRequest<T = unknown> {
  /** Unique call identifier for correlation */
  callId: string
  /** Request timestamp */
  timestamp: number
  /** Request payload */
  payload: T
}

/**
 * Generic IPC response envelope
 */
export interface IpcResponse<T = unknown> {
  /** Matching call identifier */
  callId: string
  /** Whether operation succeeded */
  success: boolean
  /** Result data (if success) */
  result?: T
  /** Error message (if failed) */
  error?: string
  /** Error stack trace (development only) */
  stack?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN <-> EXTENSION HOST MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Messages from Main Process to Extension Host
 */
export type HostInboundMessage =
  // Extension lifecycle
  | {
      type: 'extension:load'
      extensionId: string
      bundlePath: string
      manifest: ExtensionManifest
      bundleCode?: string
    }
  | { type: 'extension:activate'; extensionId: string }
  | { type: 'extension:deactivate'; extensionId: string }
  | { type: 'extension:kill'; extensionId: string; reason: string }
  | { type: 'extension:unload'; extensionId: string }
  // API calls from Main (forwarded from renderer)
  | {
      type: 'api:call'
      callId: string
      extensionId: string
      api: string
      method: string
      args: unknown[]
    }
  // Watchdog configuration
  | {
      type: 'watchdog:config'
      extensionId: string
      config: {
        memoryLimitMB?: number
        cpuTimeoutMs?: number
        checkIntervalMs?: number
      }
    }
  // Host control
  | { type: 'host:shutdown' }
  | { type: 'host:get-stats' }

/**
 * Messages from Extension Host to Main Process
 */
export type HostOutboundMessage =
  // Host status
  | { type: 'host:ready'; timestamp: number }
  | { type: 'host:stats'; extensions: ExtensionStats[] }
  | { type: 'host:crashed'; error: string }
  // Extension lifecycle
  | { type: 'extension:loaded'; extensionId: string }
  | { type: 'extension:activated'; extensionId: string }
  | { type: 'extension:deactivated'; extensionId: string }
  | { type: 'extension:unloaded'; extensionId: string }
  | { type: 'extension:error'; extensionId: string; error: string; stack?: string }
  | { type: 'extension:killed'; extensionId: string; reason: string }
  // Watchdog
  | { type: 'watchdog:violation'; violation: WatchdogViolation }
  // API responses
  | { type: 'api:result'; callId: string; result: unknown }
  | { type: 'api:error'; callId: string; error: string; stack?: string }

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERER <-> MAIN PROCESS IPC CHANNELS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * IPC channel names for extension operations
 */
export const ExtensionChannels = {
  // Queries
  GET_ALL: 'extensions:get-all',
  GET_INSTALLED: 'extensions:get-installed',
  GET_EXTENSION: 'extensions:get-extension',
  GET_HOST_STATUS: 'extensions:get-host-status',
  GET_EXTENSION_STATS: 'extensions:get-extension-stats',
  
  // Store operations
  FETCH_STORE: 'extensions:fetch-store',
  SEARCH_STORE: 'extensions:search-store',
  GET_STORE_EXTENSION: 'extensions:get-store-extension',
  
  // Lifecycle
  INSTALL: 'extensions:install',
  INSTALL_FROM_FILE: 'extensions:install-from-file',
  UNINSTALL: 'extensions:uninstall',
  ENABLE: 'extensions:enable',
  DISABLE: 'extensions:disable',
  LOAD: 'extensions:load',
  ACTIVATE: 'extensions:activate',
  DEACTIVATE: 'extensions:deactivate',
  KILL: 'extensions:kill',
  
  // Updates
  CHECK_UPDATES: 'extensions:check-updates',
  UPDATE: 'extensions:update',
  ROLLBACK: 'extensions:rollback',
  PIN_VERSION: 'extensions:pin-version',
  UNPIN_VERSION: 'extensions:unpin-version',
  
  // Events (from main to renderer)
  STATE_CHANGE: 'extension:state-change',
  VIOLATION: 'extension:violation',
  UPDATE_AVAILABLE: 'extension:update-available',
  UI_CALL: 'extension:ui-call',
  HOST_STATS: 'extension-host:stats',
  INSTALL_PROGRESS: 'extension:install-progress'
} as const

export type ExtensionChannel = (typeof ExtensionChannels)[keyof typeof ExtensionChannels]

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERER -> MAIN REQUEST PAYLOADS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Install extension request
 */
export interface InstallExtensionRequest {
  /** Extension ID from store (e.g., "blueplm.google-drive") */
  extensionId: string
  /** Specific version to install (optional, defaults to latest) */
  version?: string
}

/**
 * Install from file request (sideloading)
 */
export interface InstallFromFileRequest {
  /** Path to .bpx file */
  bpxPath: string
  /** Skip signature verification warning acknowledgment */
  acknowledgeUnsigned?: boolean
}

/**
 * Search store request
 */
export interface SearchStoreRequest {
  /** Search query */
  query?: string
  /** Filter by category */
  category?: string
  /** Only verified extensions */
  verifiedOnly?: boolean
  /** Sort order */
  sort?: 'popular' | 'recent' | 'name'
  /** Pagination */
  page?: number
  pageSize?: number
}

/**
 * Update extension request
 */
export interface UpdateExtensionRequest {
  /** Extension ID */
  extensionId: string
  /** Target version (optional, defaults to latest) */
  version?: string
}

/**
 * Pin version request
 */
export interface PinVersionRequest {
  /** Extension ID */
  extensionId: string
  /** Version to pin */
  version: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN -> RENDERER RESPONSE PAYLOADS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Host status response
 */
export interface HostStatusResponse {
  /** Whether Extension Host is running */
  running: boolean
  /** Whether Extension Host is ready to accept extensions */
  ready: boolean
  /** Uptime in milliseconds */
  uptime: number
  /** Number of times host has restarted */
  restartCount: number
  /** Last error message (if any) */
  lastError?: string
}

/**
 * Get all extensions response
 */
export interface GetAllExtensionsResponse {
  /** Installed extensions */
  installed: LoadedExtension[]
  /** Extensions available in store */
  store?: StoreExtension[]
}

/**
 * Install result response
 */
export interface InstallResultResponse {
  /** Whether installation succeeded */
  success: boolean
  /** Installed extension (if success) */
  extension?: LoadedExtension
  /** Error message (if failed) */
  error?: string
  /** Verification status */
  verification?: VerificationStatus
}

/**
 * Search store response
 */
export interface SearchStoreResponse {
  /** Matching extensions */
  extensions: StoreExtension[]
  /** Total count (for pagination) */
  total: number
  /** Current page */
  page: number
  /** Has more results */
  hasMore: boolean
}

/**
 * Check updates response
 */
export interface CheckUpdatesResponse {
  /** Available updates */
  updates: ExtensionUpdate[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT PAYLOADS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension state change event
 */
export interface ExtensionStateChangeEvent {
  /** Extension ID */
  extensionId: string
  /** New state */
  state: ExtensionState
  /** Previous state */
  previousState?: ExtensionState
  /** Error message (if state is 'error') */
  error?: string
  /** Timestamp */
  timestamp: number
}

/**
 * Extension violation event
 */
export interface ExtensionViolationEvent {
  /** The violation details */
  violation: WatchdogViolation
  /** Whether extension was killed */
  killed: boolean
}

/**
 * Install progress event
 */
export interface InstallProgressEvent {
  /** Extension ID being installed */
  extensionId: string
  /** Current phase */
  phase: 'downloading' | 'verifying' | 'extracting' | 'loading' | 'deploying' | 'complete' | 'error'
  /** Progress percentage (0-100) */
  percent: number
  /** Human-readable message */
  message: string
  /** Error message (if phase is 'error') */
  error?: string
}

/**
 * UI call from extension (forwarded to renderer)
 */
export interface ExtensionUICall {
  /** Extension ID making the call */
  extensionId: string
  /** UI method name */
  method: string
  /** Method arguments */
  args: unknown[]
  /** Call ID for response correlation */
  callId?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMEOUT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default timeout values for IPC operations
 */
export const IpcTimeouts = {
  /** Default IPC call timeout */
  DEFAULT: 30_000,
  /** Extension load timeout */
  LOAD: 10_000,
  /** Extension activate timeout */
  ACTIVATE: 5_000,
  /** Extension install timeout (includes download) */
  INSTALL: 60_000,
  /** Store API timeout */
  STORE_API: 15_000,
  /** Update check timeout */
  UPDATE_CHECK: 30_000
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a request envelope
 */
export function createRequest<T>(payload: T): IpcRequest<T> {
  return {
    callId: generateCallId(),
    timestamp: Date.now(),
    payload
  }
}

/**
 * Create a success response
 */
export function createSuccessResponse<T>(callId: string, result: T): IpcResponse<T> {
  return {
    callId,
    success: true,
    result
  }
}

/**
 * Create an error response
 */
export function createErrorResponse(callId: string, error: string, stack?: string): IpcResponse<never> {
  return {
    callId,
    success: false,
    error,
    stack
  }
}

/**
 * Type guard for checking if a message is a specific type
 */
export function isHostMessage<T extends HostOutboundMessage['type']>(
  message: HostOutboundMessage,
  type: T
): message is Extract<HostOutboundMessage, { type: T }> {
  return message.type === type
}

/**
 * Type guard for checking if a message is a specific inbound type
 */
export function isHostInboundMessage<T extends HostInboundMessage['type']>(
  message: HostInboundMessage,
  type: T
): message is Extract<HostInboundMessage, { type: T }> {
  return message.type === type
}
