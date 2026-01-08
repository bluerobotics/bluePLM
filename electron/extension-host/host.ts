/**
 * Extension Host
 * 
 * Main entry point for the Extension Host process.
 * This runs in a hidden BrowserWindow and manages all client-side extensions.
 * 
 * Architecture:
 * ┌─────────────────────────────────────┐
 * │       Extension Host                │  <- Hidden BrowserWindow
 * │  ┌────────────────────────────────┐ │
 * │  │        Watchdog                │ │  <- Monitors all extensions
 * │  └────────────────────────────────┘ │
 * │  ┌──────────┐ ┌──────────┐ ┌─────┐ │
 * │  │ Sandbox  │ │ Sandbox  │ │ ... │ │  <- Per-extension isolation
 * │  │ Ext A    │ │ Ext B    │ │     │ │
 * │  └──────────┘ └──────────┘ └─────┘ │
 * └─────────────────────────────────────┘
 */

import type {
  HostInboundMessage,
  HostOutboundMessage,
  ExtensionManifest,
  LoadedExtension,
  ExtensionStats,
  WatchdogConfig,
  DEFAULT_WATCHDOG_CONFIG
} from './types'
import { createSandboxManager, SandboxManager } from './sandbox'
import { createWatchdog, Watchdog } from './watchdog'
import { createExtensionLoader, ExtensionLoader } from './loader'
import { createExtensionHostIPC, createIPCBridgedAPI, ExtensionHostIPC } from './ipc'

/**
 * Extension Host configuration
 */
export interface ExtensionHostConfig {
  /** Default watchdog config */
  watchdogConfig?: Partial<WatchdogConfig>
  /** Stats reporting interval in ms (default: 5000) */
  statsInterval?: number
}

/**
 * Extension Host class
 */
export class ExtensionHost {
  private sandboxManager: SandboxManager
  private watchdog: Watchdog
  private loader: ExtensionLoader
  private ipc: ExtensionHostIPC
  private config: ExtensionHostConfig
  private statsIntervalId: NodeJS.Timeout | null = null
  private isShuttingDown = false
  private startTime: number
  
  constructor(
    sendMessage: (message: HostOutboundMessage) => void,
    config: ExtensionHostConfig = {}
  ) {
    this.startTime = Date.now()
    this.config = config
    
    // Create sandbox manager
    this.sandboxManager = createSandboxManager((level, message, data) => {
      this.log(level, message, data)
    })
    
    // Create watchdog
    this.watchdog = createWatchdog(config.watchdogConfig)
    
    // Create IPC handler
    this.ipc = createExtensionHostIPC(sendMessage)
    
    // Create loader with a placeholder API (will be replaced per-extension)
    this.loader = createExtensionLoader(
      this.sandboxManager,
      this.watchdog,
      {},
      { defaultWatchdogConfig: config.watchdogConfig }
    )
    
    // Set up watchdog violation handler
    this.watchdog.onViolation((extensionId, violation) => {
      this.ipc.sendWatchdogViolation(violation)
      this.loader.killExtension(extensionId, `Watchdog: ${violation.type}`)
      this.ipc.sendExtensionKilled(extensionId, `Watchdog: ${violation.type}`)
    })
    
    // Register message handlers
    this.setupMessageHandlers()
    
    this.log('info', 'Extension Host initialized')
  }
  
  /**
   * Start the Extension Host
   */
  start(): void {
    this.log('info', 'Starting Extension Host')
    
    // Start watchdog monitoring
    this.watchdog.start()
    
    // Start stats reporting
    const statsInterval = this.config.statsInterval ?? 5000
    this.statsIntervalId = setInterval(() => {
      this.reportStats()
    }, statsInterval)
    
    // Send ready message
    this.ipc.sendReady()
    
    const startupTime = Date.now() - this.startTime
    this.log('info', `Extension Host ready (startup: ${startupTime}ms)`)
  }
  
  /**
   * Shutdown the Extension Host
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return
    this.isShuttingDown = true
    
    this.log('info', 'Shutting down Extension Host')
    
    // Stop stats reporting
    if (this.statsIntervalId) {
      clearInterval(this.statsIntervalId)
      this.statsIntervalId = null
    }
    
    // Deactivate all extensions
    const extensions = this.loader.getAllExtensions()
    for (const ext of extensions) {
      try {
        await this.loader.deactivateExtension(ext.id)
      } catch (err) {
        this.log('warn', `Error deactivating ${ext.id}`, { error: String(err) })
      }
    }
    
    // Stop watchdog
    this.watchdog.stop()
    
    // Terminate all sandboxes
    this.sandboxManager.terminateAll()
    
    // Cleanup IPC
    this.ipc.cleanup()
    
    this.log('info', 'Extension Host shutdown complete')
  }
  
  /**
   * Set up message handlers for incoming IPC messages
   */
  private setupMessageHandlers(): void {
    // Load extension
    this.ipc.on('extension:load', async (msg) => {
      if (msg.type !== 'extension:load') return
      
      const { extensionId, bundlePath, manifest } = msg
      this.log('info', `Loading extension: ${extensionId}`)
      
      try {
        // In a real implementation, we would read the bundle from bundlePath
        // For now, we expect the bundle code to be passed separately
        // This is a placeholder that would be replaced with actual file reading
        const bundleCode = await this.readBundleCode(bundlePath)
        
        // Create per-extension API
        const api = createIPCBridgedAPI(this.ipc, extensionId)
        
        // Load the extension with its own API
        const result = await this.loadExtensionWithAPI(bundlePath, manifest, bundleCode, api)
        
        if (result.success) {
          this.ipc.sendExtensionLoaded(extensionId)
        } else {
          this.ipc.sendExtensionError(extensionId, result.error || 'Unknown error')
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        this.ipc.sendExtensionError(extensionId, error)
      }
    })
    
    // Activate extension
    this.ipc.on('extension:activate', async (msg) => {
      if (msg.type !== 'extension:activate') return
      
      const { extensionId } = msg
      this.log('info', `Activating extension: ${extensionId}`)
      
      try {
        const result = await this.loader.activateExtension(extensionId)
        
        if (result.success) {
          this.ipc.sendExtensionActivated(extensionId)
        } else {
          this.ipc.sendExtensionError(extensionId, result.error || 'Activation failed')
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        this.ipc.sendExtensionError(extensionId, error)
      }
    })
    
    // Deactivate extension
    this.ipc.on('extension:deactivate', async (msg) => {
      if (msg.type !== 'extension:deactivate') return
      
      const { extensionId } = msg
      this.log('info', `Deactivating extension: ${extensionId}`)
      
      try {
        await this.loader.deactivateExtension(extensionId)
        this.ipc.sendExtensionDeactivated(extensionId)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        this.ipc.sendExtensionError(extensionId, error)
      }
    })
    
    // Kill extension
    this.ipc.on('extension:kill', (msg) => {
      if (msg.type !== 'extension:kill') return
      
      const { extensionId, reason } = msg
      this.log('info', `Killing extension: ${extensionId} - ${reason}`)
      
      this.loader.killExtension(extensionId, reason)
      this.ipc.sendExtensionKilled(extensionId, reason)
    })
    
    // Handle API calls from extensions
    this.ipc.on('api:call', async (msg) => {
      if (msg.type !== 'api:call') return
      
      const { callId, extensionId, api, method, args } = msg
      
      try {
        // Forward the API call to main process
        // The result will come back through a different channel
        this.log('debug', `API call from ${extensionId}: ${api}.${method}`)
        
        // This is handled by the IPC bridge
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        this.ipc.sendApiError(callId, error)
      }
    })
    
    // Update watchdog config
    this.ipc.on('watchdog:config', (msg) => {
      if (msg.type !== 'watchdog:config') return
      
      const { extensionId, config } = msg
      this.watchdog.updateConfig(extensionId, config)
    })
    
    // Shutdown
    this.ipc.on('host:shutdown', async () => {
      await this.shutdown()
    })
  }
  
  /**
   * Load extension with its own API instance
   */
  private async loadExtensionWithAPI(
    bundlePath: string,
    manifest: ExtensionManifest,
    bundleCode: string,
    api: unknown
  ): Promise<{ success: boolean; error?: string }> {
    // Create a new loader for this extension with its specific API
    // Note: In the actual implementation, we'd update the sandbox's API
    const sandbox = this.sandboxManager.createSandbox(
      {
        extensionId: manifest.id,
        bundlePath,
        manifest,
        watchdogConfig: this.config.watchdogConfig
      },
      api
    )
    
    // Register with watchdog
    this.watchdog.registerExtension(manifest.id, this.config.watchdogConfig)
    
    try {
      await sandbox.load(bundleCode)
      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      this.watchdog.unregisterExtension(manifest.id)
      return { success: false, error }
    }
  }
  
  /**
   * Read bundle code from path
   * In the actual implementation, this would read from the file system
   */
  private async readBundleCode(bundlePath: string): Promise<string> {
    // This is a placeholder - in reality, we'd read from bundlePath
    // The main process should send the bundle code directly
    return ''
  }
  
  /**
   * Report stats to main process
   */
  private reportStats(): void {
    const stats = this.watchdog.getAllStats()
    this.ipc.sendHostStats(stats)
  }
  
  /**
   * Get all loaded extensions
   */
  getExtensions(): LoadedExtension[] {
    return this.loader.getAllExtensions()
  }
  
  /**
   * Get extension by ID
   */
  getExtension(id: string): LoadedExtension | undefined {
    return this.loader.getExtension(id)
  }
  
  /**
   * Log helper
   */
  private log(level: string, message: string, data?: unknown): void {
    const prefix = '[ExtensionHost]'
    const logMessage = `${prefix} ${message}`
    
    switch (level) {
      case 'debug':
        console.debug(logMessage, data ?? '')
        break
      case 'info':
        console.log(logMessage, data ?? '')
        break
      case 'warn':
        console.warn(logMessage, data ?? '')
        break
      case 'error':
        console.error(logMessage, data ?? '')
        break
      default:
        console.log(logMessage, data ?? '')
    }
  }
}

/**
 * Create an Extension Host instance
 */
export function createExtensionHost(
  sendMessage: (message: HostOutboundMessage) => void,
  config?: ExtensionHostConfig
): ExtensionHost {
  return new ExtensionHost(sendMessage, config)
}

/**
 * Initialize and start the Extension Host
 * This is the main entry point for the host.html
 */
export function initializeExtensionHost(): ExtensionHost | null {
  // Check if we're in the Extension Host window
  if (typeof window === 'undefined') {
    console.error('Extension Host must run in a browser window context')
    return null
  }
  
  // Get the IPC bridge from preload
  const hostBridge = (window as unknown as { extensionHostBridge?: ExtensionHostBridge }).extensionHostBridge
  if (!hostBridge) {
    console.error('Extension Host bridge not available')
    return null
  }
  
  // Create the host
  const host = createExtensionHost(
    (message) => hostBridge.send(message),
    {
      watchdogConfig: {
        memoryLimitMB: 50,
        cpuTimeoutMs: 5000,
        checkIntervalMs: 1000
      },
      statsInterval: 5000
    }
  )
  
  // Listen for incoming messages
  hostBridge.onMessage((message: HostInboundMessage) => {
    host['ipc'].handleMessage(message)
  })
  
  // Handle uncaught errors
  window.onerror = (message, source, lineno, colno, error) => {
    console.error('[ExtensionHost] Uncaught error:', message, error)
    hostBridge.send({
      type: 'host:crashed',
      error: String(message)
    })
    return true
  }
  
  window.onunhandledrejection = (event) => {
    console.error('[ExtensionHost] Unhandled rejection:', event.reason)
    hostBridge.send({
      type: 'host:crashed',
      error: String(event.reason)
    })
  }
  
  // Start the host
  host.start()
  
  return host
}

/**
 * Extension Host Bridge interface (provided by preload)
 */
interface ExtensionHostBridge {
  send(message: HostOutboundMessage): void
  onMessage(callback: (message: HostInboundMessage) => void): void
}
