/**
 * Extension System IPC Client
 * 
 * Renderer-side client for calling the extension system via IPC.
 * Provides a typed API for extension lifecycle, store operations, and updates.
 * 
 * @module extensions/ipc/client
 */

import type {
  HostStatusResponse,
  SearchStoreRequest,
  InstallProgressEvent,
  ExtensionUICall
} from './protocol'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - IPC-specific types (match what Electron API returns)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension manifest (simplified for IPC)
 */
export interface IpcExtensionManifest {
  id: string
  name: string
  version: string
  publisher: string
  description?: string
  icon?: string
  repository?: string
  license: string
  category?: 'sandboxed' | 'native'
  main?: string
  serverMain?: string
}

/**
 * Extension state
 */
export type IpcExtensionState = 'not-installed' | 'installed' | 'loading' | 'active' | 'error' | 'disabled'

/**
 * Verification status
 */
export type IpcVerificationStatus = 'verified' | 'community' | 'sideloaded'

/**
 * Loaded extension info (from IPC)
 */
export interface IpcLoadedExtension {
  manifest: IpcExtensionManifest
  state: IpcExtensionState
  verification: IpcVerificationStatus
  error?: string
  installedAt?: string
  activatedAt?: string
}

/**
 * Extension stats from IPC
 */
export interface IpcExtensionStats {
  extensionId: string
  memoryUsageMB: number
  cpuTimeMs: number
  lastActivityMs: number
  activationCount?: number
  errorCount?: number
}

/**
 * Store extension info (from IPC)
 */
export interface IpcStoreExtension {
  id: string
  extensionId: string
  publisher: {
    id: string
    name: string
    slug: string
    verified: boolean
  }
  name: string
  description?: string
  iconUrl?: string
  repositoryUrl: string
  license: string
  category: 'sandboxed' | 'native'
  categories: string[]
  tags: string[]
  verified: boolean
  featured: boolean
  downloadCount: number
  latestVersion: string
  createdAt: string
  updatedAt: string
  deprecation?: {
    deprecatedAt: string
    reason: string
    replacementId?: string
    sunsetDate?: string
  }
}

/**
 * Install result from IPC
 */
export interface IpcInstallResult {
  success: boolean
  extension?: IpcLoadedExtension
  error?: string
  verification?: IpcVerificationStatus
}

/**
 * Extension update info
 */
export interface IpcExtensionUpdate {
  extensionId: string
  currentVersion: string
  newVersion: string
  changelog?: string
  breaking: boolean
  minAppVersion?: string
}

/**
 * State change event
 */
export interface IpcStateChangeEvent {
  extensionId: string
  state: IpcExtensionState
  previousState?: IpcExtensionState
  error?: string
  timestamp: number
}

/**
 * Violation event
 */
export interface IpcViolationEvent {
  violation: {
    type: 'memory_exceeded' | 'cpu_timeout' | 'unresponsive' | 'crash'
    extensionId: string
    timestamp: number
    details: {
      memoryUsage?: number
      memoryLimit?: number
      executionTime?: number
      cpuLimit?: number
      errorMessage?: string
    }
  }
  killed: boolean
}

/**
 * Search store response
 */
export interface IpcSearchStoreResponse {
  extensions: IpcStoreExtension[]
  total: number
  page: number
  hasMore: boolean
}

/**
 * Operation result with success/error
 */
interface OperationResult<T = void> {
  success: boolean
  result?: T
  error?: string
}

/**
 * Extension client event handlers
 */
export interface ExtensionClientEvents {
  /** Called when extension state changes */
  onStateChange?: (event: IpcStateChangeEvent) => void
  /** Called when watchdog violation occurs */
  onViolation?: (event: IpcViolationEvent) => void
  /** Called when update is available */
  onUpdateAvailable?: (updates: IpcExtensionUpdate[]) => void
  /** Called during install progress */
  onInstallProgress?: (event: InstallProgressEvent) => void
  /** Called when extension host stats update */
  onHostStats?: (stats: IpcExtensionStats[]) => void
  /** Called when extension makes UI call */
  onUICall?: (call: ExtensionUICall) => void
}

/**
 * Cleanup function type
 */
type CleanupFn = () => void

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if Electron API is available
 */
function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window
}

/**
 * Check if extensions API is available on electronAPI
 */
function hasExtensionsAPI(): boolean {
  return hasElectronAPI() && 'extensions' in window.electronAPI
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION IPC CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension System IPC Client
 * 
 * Provides a typed interface for extension operations from the renderer process.
 * 
 * @example
 * ```ts
 * const client = new ExtensionIpcClient();
 * 
 * // Subscribe to events
 * const cleanup = client.subscribe({
 *   onStateChange: (event) => console.log('State changed:', event),
 *   onInstallProgress: (event) => console.log('Progress:', event.percent)
 * });
 * 
 * // Install an extension
 * const result = await client.install('blueplm.google-drive');
 * 
 * // Cleanup when done
 * cleanup();
 * ```
 */
export class ExtensionIpcClient {
  private eventCleanups: CleanupFn[] = []
  
  /**
   * Check if the extension system IPC is available
   */
  isAvailable(): boolean {
    return hasExtensionsAPI()
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Get all installed extensions
   */
  async getAll(): Promise<IpcLoadedExtension[]> {
    if (!hasExtensionsAPI()) {
      return []
    }
    return window.electronAPI.extensions.getAll() as Promise<IpcLoadedExtension[]>
  }
  
  /**
   * Get a specific extension by ID
   */
  async getExtension(extensionId: string): Promise<IpcLoadedExtension | undefined> {
    if (!hasExtensionsAPI()) {
      return undefined
    }
    return window.electronAPI.extensions.getExtension(extensionId) as Promise<IpcLoadedExtension | undefined>
  }
  
  /**
   * Get Extension Host status
   */
  async getHostStatus(): Promise<HostStatusResponse> {
    if (!hasExtensionsAPI()) {
      return {
        running: false,
        ready: false,
        uptime: 0,
        restartCount: 0
      }
    }
    return window.electronAPI.extensions.getHostStatus()
  }
  
  /**
   * Get extension statistics (memory, CPU usage)
   */
  async getExtensionStats(extensionId: string): Promise<IpcExtensionStats | undefined> {
    if (!hasExtensionsAPI()) {
      return undefined
    }
    return window.electronAPI.extensions.getExtensionStats(extensionId) as Promise<IpcExtensionStats | undefined>
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STORE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Fetch featured extensions from store
   */
  async fetchStore(): Promise<IpcStoreExtension[]> {
    if (!hasExtensionsAPI()) {
      return []
    }
    return window.electronAPI.extensions.fetchStore() as Promise<IpcStoreExtension[]>
  }
  
  /**
   * Search the extension store
   */
  async searchStore(request: SearchStoreRequest): Promise<IpcSearchStoreResponse> {
    if (!hasExtensionsAPI()) {
      return { extensions: [], total: 0, page: 0, hasMore: false }
    }
    return window.electronAPI.extensions.searchStore(request) as Promise<IpcSearchStoreResponse>
  }
  
  /**
   * Get store extension details
   */
  async getStoreExtension(extensionId: string): Promise<IpcStoreExtension | undefined> {
    if (!hasExtensionsAPI()) {
      return undefined
    }
    return window.electronAPI.extensions.getStoreExtension(extensionId) as Promise<IpcStoreExtension | undefined>
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INSTALLATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Install an extension from the store
   * 
   * @param extensionId - Extension ID (e.g., "blueplm.google-drive")
   * @param version - Specific version (optional, defaults to latest)
   * @returns Installation result
   */
  async install(extensionId: string, version?: string): Promise<IpcInstallResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.install(extensionId, version) as Promise<IpcInstallResult>
  }
  
  /**
   * Install an extension from a local .bpx file (sideloading)
   * 
   * @param bpxPath - Path to the .bpx file
   * @param acknowledgeUnsigned - Acknowledge unsigned extension warning
   * @returns Installation result
   */
  async installFromFile(bpxPath: string, acknowledgeUnsigned?: boolean): Promise<IpcInstallResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.installFromFile(bpxPath, acknowledgeUnsigned) as Promise<IpcInstallResult>
  }
  
  /**
   * Uninstall an extension
   * 
   * @param extensionId - Extension ID to uninstall
   */
  async uninstall(extensionId: string): Promise<OperationResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.uninstall(extensionId)
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Enable an installed extension
   */
  async enable(extensionId: string): Promise<OperationResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.enable(extensionId)
  }
  
  /**
   * Disable an extension (keeps installed but deactivated)
   */
  async disable(extensionId: string): Promise<OperationResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.disable(extensionId)
  }
  
  /**
   * Activate an installed extension
   */
  async activate(extensionId: string): Promise<OperationResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.activate(extensionId)
  }
  
  /**
   * Deactivate an active extension
   */
  async deactivate(extensionId: string): Promise<OperationResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.deactivate(extensionId)
  }
  
  /**
   * Kill an extension forcefully (for runaway extensions)
   * 
   * @param extensionId - Extension ID
   * @param reason - Reason for killing (for logging)
   */
  async kill(extensionId: string, reason: string): Promise<OperationResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.kill(extensionId, reason)
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATES
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Check for available updates
   */
  async checkUpdates(): Promise<IpcExtensionUpdate[]> {
    if (!hasExtensionsAPI()) {
      return []
    }
    return window.electronAPI.extensions.checkUpdates() as Promise<IpcExtensionUpdate[]>
  }
  
  /**
   * Update an extension to a specific or latest version
   * 
   * @param extensionId - Extension ID to update
   * @param version - Target version (optional, defaults to latest)
   */
  async update(extensionId: string, version?: string): Promise<IpcInstallResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.update(extensionId, version) as Promise<IpcInstallResult>
  }
  
  /**
   * Rollback an extension to the previous version
   * 
   * @param extensionId - Extension ID to rollback
   */
  async rollback(extensionId: string): Promise<IpcInstallResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.rollback(extensionId) as Promise<IpcInstallResult>
  }
  
  /**
   * Pin an extension to a specific version (disable auto-update)
   * 
   * @param extensionId - Extension ID
   * @param version - Version to pin to
   */
  async pinVersion(extensionId: string, version: string): Promise<OperationResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.pinVersion(extensionId, version)
  }
  
  /**
   * Unpin version (re-enable auto-update)
   * 
   * @param extensionId - Extension ID
   */
  async unpinVersion(extensionId: string): Promise<OperationResult> {
    if (!hasExtensionsAPI()) {
      return { success: false, error: 'Extensions API not available' }
    }
    return window.electronAPI.extensions.unpinVersion(extensionId)
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT SUBSCRIPTION
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Subscribe to extension events
   * 
   * @param handlers - Event handler functions
   * @returns Cleanup function to unsubscribe
   * 
   * @example
   * ```ts
   * const cleanup = client.subscribe({
   *   onStateChange: (event) => {
   *     console.log(`${event.extensionId} is now ${event.state}`);
   *   },
   *   onInstallProgress: (event) => {
   *     console.log(`Installing: ${event.percent}%`);
   *   }
   * });
   * 
   * // Later, to unsubscribe:
   * cleanup();
   * ```
   */
  subscribe(handlers: ExtensionClientEvents): CleanupFn {
    if (!hasExtensionsAPI()) {
      return () => {}
    }
    
    const cleanups: CleanupFn[] = []
    const api = window.electronAPI.extensions
    
    if (handlers.onStateChange && api.onStateChange) {
      cleanups.push(api.onStateChange(handlers.onStateChange as Parameters<typeof api.onStateChange>[0]))
    }
    
    if (handlers.onViolation && api.onViolation) {
      cleanups.push(api.onViolation(handlers.onViolation as Parameters<typeof api.onViolation>[0]))
    }
    
    if (handlers.onUpdateAvailable && api.onUpdateAvailable) {
      cleanups.push(api.onUpdateAvailable(handlers.onUpdateAvailable as Parameters<typeof api.onUpdateAvailable>[0]))
    }
    
    if (handlers.onInstallProgress && api.onInstallProgress) {
      cleanups.push(api.onInstallProgress(handlers.onInstallProgress as Parameters<typeof api.onInstallProgress>[0]))
    }
    
    if (handlers.onHostStats && api.onHostStats) {
      cleanups.push(api.onHostStats(handlers.onHostStats as Parameters<typeof api.onHostStats>[0]))
    }
    
    if (handlers.onUICall && api.onUICall) {
      cleanups.push(api.onUICall(handlers.onUICall as Parameters<typeof api.onUICall>[0]))
    }
    
    // Store cleanups for dispose()
    this.eventCleanups.push(...cleanups)
    
    return () => {
      cleanups.forEach(cleanup => cleanup())
      // Remove from tracked cleanups
      cleanups.forEach(cleanup => {
        const idx = this.eventCleanups.indexOf(cleanup)
        if (idx !== -1) this.eventCleanups.splice(idx, 1)
      })
    }
  }
  
  /**
   * Dispose all event subscriptions
   */
  dispose(): void {
    this.eventCleanups.forEach(cleanup => cleanup())
    this.eventCleanups = []
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Shared extension IPC client instance
 */
let sharedClient: ExtensionIpcClient | null = null

/**
 * Get the shared extension IPC client
 * 
 * @example
 * ```ts
 * const client = getExtensionClient();
 * const extensions = await client.getAll();
 * ```
 */
export function getExtensionClient(): ExtensionIpcClient {
  if (!sharedClient) {
    sharedClient = new ExtensionIpcClient()
  }
  return sharedClient
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if extension system is available
 */
export function isExtensionSystemAvailable(): boolean {
  return hasExtensionsAPI()
}

/**
 * Quick install function
 */
export async function installExtension(extensionId: string, version?: string): Promise<IpcInstallResult> {
  return getExtensionClient().install(extensionId, version)
}

/**
 * Quick uninstall function
 */
export async function uninstallExtension(extensionId: string): Promise<OperationResult> {
  return getExtensionClient().uninstall(extensionId)
}

/**
 * Quick fetch store function
 */
export async function fetchExtensionStore(): Promise<IpcStoreExtension[]> {
  return getExtensionClient().fetchStore()
}

/**
 * Quick check updates function
 */
export async function checkExtensionUpdates(): Promise<IpcExtensionUpdate[]> {
  return getExtensionClient().checkUpdates()
}
