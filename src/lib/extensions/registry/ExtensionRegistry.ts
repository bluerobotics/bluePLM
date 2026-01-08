/**
 * Extension Registry
 * 
 * The central coordinator for all extensions. Handles:
 * - Discovery (local and store)
 * - Installation (one-click and sideload)
 * - Activation (lazy, event-based)
 * - Deactivation
 * - Updates (with rollback)
 * - Lifecycle management
 * 
 * @module extensions/registry/ExtensionRegistry
 */

import type {
  ExtensionManifest,
  LoadedExtension,
  ExtensionState,
  ExtensionUpdate,
  StoreExtension,
} from '../types'
import { getExtensionId, isNativeExtension, hasClientComponent } from '../types'
import { 
  LifecycleManager, 
  type StateChangeEvent,
  isActiveState,
  isInstalledState,
} from './lifecycle'
import { ActivationManager, type ParsedActivationEvent } from './activation'
import {
  discoverLocalExtensions,
  discoverStoreExtensions,
  getStoreExtension,
  type StoreDiscoveryOptions,
} from './discovery'
import {
  installFromStore,
  sideloadFromFile,
  uninstallExtension,
} from './installer'
import {
  checkForUpdates,
  updateExtension,
  rollbackExtension,
  pinVersion,
  unpinVersion,
  getVersionPins,
  canRollback,
  cleanupExpiredRollbacks,
} from './updater'

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension state change callback.
 */
export type ExtensionStateCallback = (extensionId: string, state: ExtensionState, error?: string) => void

/**
 * Update available callback.
 */
export type UpdateAvailableCallback = (updates: ExtensionUpdate[]) => void

/**
 * Registry configuration.
 */
export interface RegistryConfig {
  /** Path to extensions directory */
  extensionsPath: string
  /** Store API URL */
  storeApiUrl?: string
  /** Org API URL (for server handlers) */
  orgApiUrl?: string
  /** Auth token for API calls */
  authToken?: string
  /** App version (for compatibility checks) */
  appVersion?: string
  /** Auto-check for updates on startup */
  autoCheckUpdates?: boolean
  /** Update check interval in ms (default: 1 hour) */
  updateCheckInterval?: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION REGISTRY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extension Registry - Singleton coordinator for all extensions.
 * 
 * @example
 * ```typescript
 * // Get the singleton instance
 * const registry = ExtensionRegistry.getInstance()
 * 
 * // Initialize with configuration
 * await registry.initialize({
 *   extensionsPath: '/path/to/extensions',
 *   storeApiUrl: 'https://marketplace.blueplm.io/api',
 *   autoCheckUpdates: true,
 * })
 * 
 * // Install an extension
 * await registry.install('blueplm.google-drive')
 * 
 * // Activate all startup extensions
 * await registry.activateStartupExtensions()
 * 
 * // Listen for state changes
 * registry.onExtensionStateChange((id, state) => {
 *   console.log(`Extension ${id} is now ${state}`)
 * })
 * ```
 */
export class ExtensionRegistry {
  private static _instance: ExtensionRegistry | null = null
  
  private _config: RegistryConfig | null = null
  private _initialized = false
  
  // Managers
  private _lifecycleManager = new LifecycleManager()
  private _activationManager = new ActivationManager()
  
  // Extension data
  private _extensions: Map<string, LoadedExtension> = new Map()
  private _storeExtensions: Map<string, StoreExtension> = new Map()
  
  // Callbacks
  private _stateCallbacks: Set<ExtensionStateCallback> = new Set()
  private _updateCallbacks: Set<UpdateAvailableCallback> = new Set()
  
  // Update checking
  private _updateCheckTimer?: ReturnType<typeof setInterval>
  private _availableUpdates: ExtensionUpdate[] = []
  
  /**
   * Private constructor - use getInstance().
   */
  private constructor() {
    // Set up activation callback
    this._activationManager.setActivationCallback(async (extensionId, event) => {
      await this._activateExtension(extensionId, event)
    })
    
    // Forward lifecycle events
    this._lifecycleManager.onStateChange((event) => {
      this._handleStateChange(event)
    })
  }
  
  /**
   * Get the singleton instance.
   */
  static getInstance(): ExtensionRegistry {
    if (!ExtensionRegistry._instance) {
      ExtensionRegistry._instance = new ExtensionRegistry()
    }
    return ExtensionRegistry._instance
  }
  
  /**
   * Reset the singleton (for testing).
   */
  static resetInstance(): void {
    if (ExtensionRegistry._instance) {
      ExtensionRegistry._instance.dispose()
      ExtensionRegistry._instance = null
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Initialize the registry.
   * 
   * @param config - Registry configuration
   */
  async initialize(config: RegistryConfig): Promise<void> {
    if (this._initialized) {
      console.warn('[Registry] Already initialized')
      return
    }
    
    this._config = config
    
    // Discover local extensions
    await this._discoverLocalExtensions()
    
    // Set up update checking
    if (config.autoCheckUpdates) {
      const interval = config.updateCheckInterval || 60 * 60 * 1000 // 1 hour
      this._updateCheckTimer = setInterval(() => {
        this.checkForUpdates().catch(console.error)
      }, interval)
      
      // Initial check after 5 seconds
      setTimeout(() => {
        this.checkForUpdates().catch(console.error)
      }, 5000)
    }
    
    // Clean up expired rollbacks
    await cleanupExpiredRollbacks()
    
    this._initialized = true
    console.log('[Registry] Initialized with', this._extensions.size, 'extensions')
  }
  
  /**
   * Check if the registry is initialized.
   */
  get isInitialized(): boolean {
    return this._initialized
  }
  
  /**
   * Dispose of the registry.
   */
  dispose(): void {
    if (this._updateCheckTimer) {
      clearInterval(this._updateCheckTimer)
      this._updateCheckTimer = undefined
    }
    
    this._lifecycleManager.clear()
    this._activationManager.clear()
    this._extensions.clear()
    this._storeExtensions.clear()
    this._stateCallbacks.clear()
    this._updateCallbacks.clear()
    this._initialized = false
    this._config = null
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // DISCOVERY
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Discover and load local extensions.
   */
  private async _discoverLocalExtensions(): Promise<void> {
    if (!this._config) return
    
    const result = await discoverLocalExtensions(this._config.extensionsPath, {
      includeSideloaded: true,
    })
    
    for (const ext of result.extensions) {
      const id = getExtensionId(ext.manifest)
      this._extensions.set(id, ext)
      
      // Initialize lifecycle (side effect - creates lifecycle if not exists)
      this._lifecycleManager.getLifecycle(id, 'installed')
      
      // Register activation events
      this._activationManager.register(ext.manifest)
    }
    
    if (result.errors.length > 0) {
      console.warn('[Registry] Errors discovering extensions:', result.errors)
    }
  }
  
  /**
   * Refresh local extension discovery.
   */
  async refreshLocalExtensions(): Promise<void> {
    await this._discoverLocalExtensions()
  }
  
  /**
   * Fetch extensions from the store.
   */
  async fetchStoreExtensions(options?: StoreDiscoveryOptions): Promise<StoreExtension[]> {
    const result = await discoverStoreExtensions({
      ...options,
      storeApiUrl: this._config?.storeApiUrl,
    })
    
    // Cache results
    for (const ext of result.extensions) {
      this._storeExtensions.set(ext.extensionId, ext)
    }
    
    return result.extensions
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // INSTALLATION
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Install an extension from the store.
   * 
   * @param extensionId - Extension ID to install
   * @param version - Specific version (optional, defaults to latest)
   * @returns Installation result
   */
  async install(
    extensionId: string,
    version?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this._config) {
      return { success: false, error: 'Registry not initialized' }
    }
    
    const lifecycle = this._lifecycleManager.getLifecycle(extensionId)
    
    // Check if already installed
    if (isInstalledState(lifecycle.state)) {
      return { success: false, error: 'Extension already installed' }
    }
    
    const result = await installFromStore(extensionId, this._config.extensionsPath, {
      version,
      storeApiUrl: this._config.storeApiUrl,
      orgApiUrl: this._config.orgApiUrl,
      authToken: this._config.authToken,
    })
    
    if (result.success) {
      // Update lifecycle
      lifecycle.dispatch('install')
      
      // Get store extension for metadata
      const storeExt = await getStoreExtension(extensionId, this._config.storeApiUrl)
      
      // Create loaded extension entry
      // Note: We use storeExt to populate manifest details if available
      const loadedExt: LoadedExtension = {
        manifest: storeExt ? {
          id: extensionId,
          name: storeExt.name,
          version: result.version,
          publisher: storeExt.publisher.slug,
          description: storeExt.description,
          license: storeExt.license,
          category: storeExt.category,
          engines: { blueplm: '*' },
          activationEvents: [],
          contributes: {},
          permissions: {},
        } : {
          id: extensionId,
          name: extensionId,
          version: result.version,
          publisher: extensionId.split('.')[0],
          license: 'Unknown',
          engines: { blueplm: '*' },
          activationEvents: [],
          contributes: {},
          permissions: {},
        },
        state: 'installed',
        verification: result.verification,
        installedAt: new Date(),
      }
      
      this._extensions.set(extensionId, loadedExt)
      
      // Register activation events
      this._activationManager.register(loadedExt.manifest)
    }
    
    return {
      success: result.success,
      error: result.error,
    }
  }
  
  /**
   * Install an extension from a local .bpx file (sideload).
   */
  async installFromFile(
    bpxPath: string,
    options: { acceptWarning: boolean }
  ): Promise<{ success: boolean; extensionId?: string; error?: string }> {
    if (!this._config) {
      return { success: false, error: 'Registry not initialized' }
    }
    
    const result = await sideloadFromFile(bpxPath, this._config.extensionsPath, options)
    
    if (result.success) {
      const lifecycle = this._lifecycleManager.getLifecycle(result.extensionId)
      lifecycle.dispatch('install')
      
      // Refresh to get the installed extension
      await this._discoverLocalExtensions()
    }
    
    return {
      success: result.success,
      extensionId: result.extensionId,
      error: result.error,
    }
  }
  
  /**
   * Uninstall an extension.
   */
  async uninstall(extensionId: string): Promise<{ success: boolean; error?: string }> {
    if (!this._config) {
      return { success: false, error: 'Registry not initialized' }
    }
    
    const lifecycle = this._lifecycleManager.getLifecycle(extensionId)
    
    // Deactivate first if active
    if (isActiveState(lifecycle.state)) {
      await this.deactivate(extensionId)
    }
    
    const result = await uninstallExtension(extensionId, this._config.extensionsPath, {
      orgApiUrl: this._config.orgApiUrl,
      authToken: this._config.authToken,
    })
    
    if (result.success) {
      lifecycle.dispatch('uninstall')
      this._extensions.delete(extensionId)
      this._activationManager.unregister(extensionId)
      this._lifecycleManager.removeLifecycle(extensionId)
    }
    
    return result
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Activate an extension.
   */
  async activate(extensionId: string): Promise<{ success: boolean; error?: string }> {
    return this._activateExtension(extensionId)
  }
  
  /**
   * Internal activation handler.
   */
  private async _activateExtension(
    extensionId: string,
    _event?: ParsedActivationEvent
  ): Promise<{ success: boolean; error?: string }> {
    const lifecycle = this._lifecycleManager.getLifecycle(extensionId)
    const extension = this._extensions.get(extensionId)
    
    if (!extension) {
      return { success: false, error: 'Extension not found' }
    }
    
    if (isActiveState(lifecycle.state)) {
      return { success: true } // Already active
    }
    
    if (!lifecycle.canDispatch('activate')) {
      return { success: false, error: `Cannot activate from state: ${lifecycle.state}` }
    }
    
    // Start activation
    lifecycle.dispatch('activate')
    
    try {
      // For client extensions, notify Extension Host to load
      if (hasClientComponent(extension.manifest)) {
        // This will be handled by IPC to Extension Host (Agent 5)
        // For now, simulate loading
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // For native extensions, load in main process
      if (isNativeExtension(extension.manifest)) {
        // This will be handled by main process (Agent 2)
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      lifecycle.dispatch('loaded')
      
      // Update extension record
      extension.state = 'active'
      extension.activatedAt = new Date()
      
      // Mark as activated in activation manager
      this._activationManager.markActivated(extensionId)
      
      return { success: true }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lifecycle.dispatch('error', message)
      extension.state = 'error'
      extension.error = message
      
      return { success: false, error: message }
    }
  }
  
  /**
   * Deactivate an extension.
   */
  async deactivate(extensionId: string): Promise<{ success: boolean; error?: string }> {
    const lifecycle = this._lifecycleManager.getLifecycle(extensionId)
    const extension = this._extensions.get(extensionId)
    
    if (!extension) {
      return { success: false, error: 'Extension not found' }
    }
    
    if (!isActiveState(lifecycle.state)) {
      return { success: true } // Already inactive
    }
    
    if (!lifecycle.canDispatch('deactivate')) {
      return { success: false, error: `Cannot deactivate from state: ${lifecycle.state}` }
    }
    
    try {
      // Notify Extension Host to unload (handled by Agent 5)
      await new Promise(resolve => setTimeout(resolve, 50))
      
      lifecycle.dispatch('deactivate')
      extension.state = 'installed'
      
      // Reset activation state
      this._activationManager.resetActivationState(extensionId)
      
      return { success: true }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }
  
  /**
   * Activate all extensions that should start on app startup.
   */
  async activateStartupExtensions(): Promise<string[]> {
    return this._activationManager.triggerStartup()
  }
  
  /**
   * Trigger an activation event.
   */
  async triggerActivationEvent(event: ParsedActivationEvent): Promise<string[]> {
    return this._activationManager.trigger(event)
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // UPDATES
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Check for available updates.
   */
  async checkForUpdates(): Promise<ExtensionUpdate[]> {
    if (!this._config) return []
    
    const manifests = new Map<string, ExtensionManifest>()
    for (const [id, ext] of this._extensions) {
      manifests.set(id, ext.manifest)
    }
    
    const pins = await getVersionPins()
    
    const result = await checkForUpdates(manifests, {
      storeApiUrl: this._config.storeApiUrl,
      versionPins: pins,
      appVersion: this._config.appVersion,
    })
    
    this._availableUpdates = result.updates
    
    if (result.updates.length > 0) {
      // Notify listeners
      for (const callback of this._updateCallbacks) {
        try {
          callback(result.updates)
        } catch (err) {
          console.error('[Registry] Error in update callback:', err)
        }
      }
    }
    
    return result.updates
  }
  
  /**
   * Get available updates (from last check).
   */
  getAvailableUpdates(): ExtensionUpdate[] {
    return this._availableUpdates
  }
  
  /**
   * Update an extension.
   */
  async updateExtension(
    extensionId: string,
    version?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this._config) {
      return { success: false, error: 'Registry not initialized' }
    }
    
    // Deactivate first if active
    const lifecycle = this._lifecycleManager.getLifecycle(extensionId)
    if (isActiveState(lifecycle.state)) {
      await this.deactivate(extensionId)
    }
    
    const result = await updateExtension(extensionId, this._config.extensionsPath, {
      version,
      storeApiUrl: this._config.storeApiUrl,
      orgApiUrl: this._config.orgApiUrl,
      authToken: this._config.authToken,
    })
    
    if (result.success) {
      // Refresh extension data
      await this._discoverLocalExtensions()
      
      // Remove from available updates
      this._availableUpdates = this._availableUpdates.filter(u => u.extensionId !== extensionId)
    }
    
    return {
      success: result.success,
      error: result.error,
    }
  }
  
  /**
   * Rollback an extension to previous version.
   */
  async rollbackExtension(extensionId: string): Promise<{ success: boolean; error?: string }> {
    if (!this._config) {
      return { success: false, error: 'Registry not initialized' }
    }
    
    // Deactivate first if active
    const lifecycle = this._lifecycleManager.getLifecycle(extensionId)
    if (isActiveState(lifecycle.state)) {
      await this.deactivate(extensionId)
    }
    
    const result = await rollbackExtension(extensionId, this._config.extensionsPath, {
      storeApiUrl: this._config.storeApiUrl,
      orgApiUrl: this._config.orgApiUrl,
      authToken: this._config.authToken,
    })
    
    if (result.success) {
      // Refresh extension data
      await this._discoverLocalExtensions()
    }
    
    return {
      success: result.success,
      error: result.error,
    }
  }
  
  /**
   * Pin an extension to current version.
   */
  async pinVersion(extensionId: string, version: string): Promise<void> {
    await pinVersion(extensionId, version)
  }
  
  /**
   * Unpin an extension (allow updates).
   */
  async unpinVersion(extensionId: string): Promise<void> {
    await unpinVersion(extensionId)
  }
  
  /**
   * Check if extension can be rolled back.
   */
  async canRollback(extensionId: string): Promise<boolean> {
    const result = await canRollback(extensionId)
    return result.canRollback
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Get an extension by ID.
   */
  getExtension(extensionId: string): LoadedExtension | undefined {
    return this._extensions.get(extensionId)
  }
  
  /**
   * Get all loaded extensions.
   */
  getAllExtensions(): LoadedExtension[] {
    return Array.from(this._extensions.values())
  }
  
  /**
   * Get installed extensions.
   */
  getInstalledExtensions(): LoadedExtension[] {
    return Array.from(this._extensions.values()).filter(ext => 
      isInstalledState(this._lifecycleManager.getState(ext.manifest.id))
    )
  }
  
  /**
   * Get active extensions.
   */
  getActiveExtensions(): LoadedExtension[] {
    return Array.from(this._extensions.values()).filter(ext => 
      isActiveState(this._lifecycleManager.getState(ext.manifest.id))
    )
  }
  
  /**
   * Get extensions by state.
   */
  getExtensionsByState(state: ExtensionState): LoadedExtension[] {
    const ids = this._lifecycleManager.getExtensionsByState(state)
    return ids.map(id => this._extensions.get(id)).filter(Boolean) as LoadedExtension[]
  }
  
  /**
   * Check if an extension is installed.
   */
  isInstalled(extensionId: string): boolean {
    return this._extensions.has(extensionId)
  }
  
  /**
   * Get extension state.
   */
  getState(extensionId: string): ExtensionState {
    return this._lifecycleManager.getState(extensionId)
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Handle state change from lifecycle manager.
   */
  private _handleStateChange(event: StateChangeEvent): void {
    const extension = this._extensions.get(event.extensionId)
    if (extension) {
      extension.state = event.newState
      if (event.error) {
        extension.error = event.error
      }
    }
    
    // Notify callbacks
    for (const callback of this._stateCallbacks) {
      try {
        callback(event.extensionId, event.newState, event.error)
      } catch (err) {
        console.error('[Registry] Error in state callback:', err)
      }
    }
  }
  
  /**
   * Subscribe to extension state changes.
   */
  onExtensionStateChange(callback: ExtensionStateCallback): () => void {
    this._stateCallbacks.add(callback)
    return () => this._stateCallbacks.delete(callback)
  }
  
  /**
   * Subscribe to update available notifications.
   */
  onUpdateAvailable(callback: UpdateAvailableCallback): () => void {
    this._updateCallbacks.add(callback)
    return () => this._updateCallbacks.delete(callback)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the ExtensionRegistry singleton.
 */
export function getExtensionRegistry(): ExtensionRegistry {
  return ExtensionRegistry.getInstance()
}
