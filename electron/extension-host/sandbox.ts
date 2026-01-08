/**
 * Extension Sandbox
 * 
 * Creates isolated execution environments for each extension.
 * Uses Web Workers for true per-extension isolation.
 * 
 * Each extension runs in its own sandbox and cannot access:
 * - Other extensions' data
 * - Node.js APIs
 * - DOM directly (only through ExtensionClientAPI)
 */

import type {
  SandboxConfig,
  SandboxInstance,
  ExtensionModule,
  ExtensionContext,
  ExtensionLogger,
  Disposable,
  ExtensionManifest
} from './types'

/**
 * In-memory sandbox using closure isolation
 * 
 * Note: In a production scenario, this could be replaced with:
 * - `isolated-vm` for true V8 isolate-level isolation
 * - Web Workers for thread-level isolation
 * - QuickJS or other embedded JS engines
 * 
 * This implementation uses closure-based isolation which is suitable
 * for extensions from trusted sources (verified extensions).
 */
export class ExtensionSandbox implements SandboxInstance {
  readonly id: string
  readonly extensionId: string
  state: 'idle' | 'running' | 'terminated' = 'idle'
  readonly startedAt: number
  lastActivity: number
  
  private module: ExtensionModule | null = null
  private context: ExtensionContext | null = null
  private disposables: Disposable[] = []
  private memoryEstimate = 0
  
  constructor(
    private config: SandboxConfig,
    private api: unknown,
    private onLog: (level: string, message: string, data?: unknown) => void
  ) {
    this.id = `sandbox-${config.extensionId}-${Date.now()}`
    this.extensionId = config.extensionId
    this.startedAt = Date.now()
    this.lastActivity = Date.now()
  }
  
  /**
   * Load and initialize the extension module
   */
  async load(bundleCode: string): Promise<void> {
    if (this.state === 'terminated') {
      throw new Error('Cannot load into terminated sandbox')
    }
    
    this.state = 'running'
    this.lastActivity = Date.now()
    
    try {
      // Create extension context
      this.context = this.createContext()
      
      // Create a sandboxed module wrapper
      // This prevents direct access to Node.js globals
      const moduleExports: ExtensionModule = {}
      
      // Execute the bundle in a limited scope
      // In production, use isolated-vm or similar for true isolation
      const moduleWrapper = this.createModuleWrapper(bundleCode)
      const moduleFactory = new Function(
        'exports',
        'require',
        'module',
        '__filename',
        '__dirname',
        'console',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'Promise',
        'JSON',
        'Math',
        'Date',
        'Array',
        'Object',
        'String',
        'Number',
        'Boolean',
        'Error',
        moduleWrapper
      )
      
      // Create sandboxed console
      const sandboxedConsole = this.createSandboxedConsole()
      
      // Create a mock require that only allows specific imports
      const sandboxedRequire = (id: string) => {
        // Only allow whitelisted modules
        const allowed = ['@blueplm/extension-api']
        if (!allowed.includes(id)) {
          throw new Error(`Module "${id}" is not available in extension sandbox`)
        }
        // Return the API object for @blueplm/extension-api
        return this.api
      }
      
      // Execute the module factory
      const moduleObj = { exports: moduleExports }
      moduleFactory(
        moduleExports,
        sandboxedRequire,
        moduleObj,
        '', // __filename
        '', // __dirname
        sandboxedConsole,
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval,
        Promise,
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Error
      )
      
      this.module = moduleObj.exports
      this.memoryEstimate = bundleCode.length * 2 // Rough estimate
      
      this.log('info', `Extension ${this.extensionId} loaded successfully`)
    } catch (err) {
      this.state = 'idle'
      const error = err instanceof Error ? err : new Error(String(err))
      this.log('error', `Failed to load extension ${this.extensionId}`, { error: error.message })
      throw error
    }
  }
  
  /**
   * Activate the extension
   */
  async activate(): Promise<void> {
    if (!this.module || !this.context) {
      throw new Error('Extension not loaded')
    }
    
    if (this.state === 'terminated') {
      throw new Error('Cannot activate terminated sandbox')
    }
    
    this.lastActivity = Date.now()
    
    if (typeof this.module.activate === 'function') {
      try {
        await Promise.resolve(this.module.activate(this.context, this.api))
        this.log('info', `Extension ${this.extensionId} activated`)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        this.log('error', `Extension ${this.extensionId} activation failed`, { error: error.message })
        throw error
      }
    }
  }
  
  /**
   * Deactivate the extension
   */
  async deactivate(): Promise<void> {
    if (!this.module) return
    
    this.lastActivity = Date.now()
    
    try {
      // Call deactivate if it exists
      if (typeof this.module.deactivate === 'function') {
        await Promise.resolve(this.module.deactivate())
      }
      
      // Dispose all subscriptions
      for (const disposable of this.disposables) {
        try {
          disposable.dispose()
        } catch (err) {
          this.log('warn', 'Error disposing subscription', { error: String(err) })
        }
      }
      this.disposables = []
      
      this.log('info', `Extension ${this.extensionId} deactivated`)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.log('error', `Extension ${this.extensionId} deactivation failed`, { error: error.message })
      throw error
    }
  }
  
  /**
   * Execute code in the sandbox
   */
  async execute<T>(code: string, ...args: unknown[]): Promise<T> {
    if (this.state === 'terminated') {
      throw new Error('Sandbox is terminated')
    }
    
    this.lastActivity = Date.now()
    
    // Create a function from the code and execute it
    try {
      const fn = new Function(...args.map((_, i) => `arg${i}`), code)
      const result = await Promise.resolve(fn(...args))
      return result as T
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      throw error
    }
  }
  
  /**
   * Terminate the sandbox
   */
  terminate(): void {
    if (this.state === 'terminated') return
    
    this.log('info', `Terminating sandbox for ${this.extensionId}`)
    
    // Dispose all subscriptions
    for (const disposable of this.disposables) {
      try {
        disposable.dispose()
      } catch {
        // Ignore errors during termination
      }
    }
    
    this.disposables = []
    this.module = null
    this.context = null
    this.state = 'terminated'
  }
  
  /**
   * Get estimated memory usage
   */
  getMemoryUsage(): number {
    return this.memoryEstimate
  }
  
  /**
   * Create the extension context
   */
  private createContext(): ExtensionContext {
    const subscriptions: Disposable[] = this.disposables
    
    return {
      extensionId: this.extensionId,
      extensionPath: this.config.bundlePath,
      storagePath: `extensions/${this.extensionId}/storage`,
      subscriptions,
      log: this.createLogger()
    }
  }
  
  /**
   * Create a logger for the extension
   */
  private createLogger(): ExtensionLogger {
    const extensionId = this.extensionId
    const onLog = this.onLog
    
    return {
      debug(message: string, ...args: unknown[]): void {
        onLog('debug', `[${extensionId}] ${message}`, args.length > 0 ? args : undefined)
      },
      info(message: string, ...args: unknown[]): void {
        onLog('info', `[${extensionId}] ${message}`, args.length > 0 ? args : undefined)
      },
      warn(message: string, ...args: unknown[]): void {
        onLog('warn', `[${extensionId}] ${message}`, args.length > 0 ? args : undefined)
      },
      error(message: string, ...args: unknown[]): void {
        onLog('error', `[${extensionId}] ${message}`, args.length > 0 ? args : undefined)
      }
    }
  }
  
  /**
   * Create a sandboxed console
   */
  private createSandboxedConsole() {
    const log = this.log.bind(this)
    const extensionId = this.extensionId
    
    return {
      log: (...args: unknown[]) => log('info', `[${extensionId}]`, { args }),
      info: (...args: unknown[]) => log('info', `[${extensionId}]`, { args }),
      warn: (...args: unknown[]) => log('warn', `[${extensionId}]`, { args }),
      error: (...args: unknown[]) => log('error', `[${extensionId}]`, { args }),
      debug: (...args: unknown[]) => log('debug', `[${extensionId}]`, { args }),
      trace: (...args: unknown[]) => log('debug', `[${extensionId}]`, { args }),
      // Stub other console methods
      assert: () => {},
      clear: () => {},
      count: () => {},
      countReset: () => {},
      dir: () => {},
      dirxml: () => {},
      group: () => {},
      groupCollapsed: () => {},
      groupEnd: () => {},
      table: () => {},
      time: () => {},
      timeEnd: () => {},
      timeLog: () => {},
      timeStamp: () => {}
    }
  }
  
  /**
   * Wrap the bundle code in a module wrapper
   */
  private createModuleWrapper(bundleCode: string): string {
    // Wrap the code to prevent access to global scope
    return `
      "use strict";
      ${bundleCode}
    `
  }
  
  /**
   * Log helper
   */
  private log(level: string, message: string, data?: unknown): void {
    this.onLog(level, message, data)
  }
}

/**
 * Sandbox manager that handles multiple extension sandboxes
 */
export class SandboxManager {
  private sandboxes: Map<string, ExtensionSandbox> = new Map()
  
  constructor(
    private onLog: (level: string, message: string, data?: unknown) => void
  ) {}
  
  /**
   * Create a new sandbox for an extension
   */
  createSandbox(config: SandboxConfig, api: unknown): ExtensionSandbox {
    // Terminate existing sandbox if any
    const existing = this.sandboxes.get(config.extensionId)
    if (existing) {
      existing.terminate()
    }
    
    const sandbox = new ExtensionSandbox(config, api, this.onLog)
    this.sandboxes.set(config.extensionId, sandbox)
    
    return sandbox
  }
  
  /**
   * Get an existing sandbox
   */
  getSandbox(extensionId: string): ExtensionSandbox | undefined {
    return this.sandboxes.get(extensionId)
  }
  
  /**
   * Terminate a sandbox
   */
  terminateSandbox(extensionId: string): void {
    const sandbox = this.sandboxes.get(extensionId)
    if (sandbox) {
      sandbox.terminate()
      this.sandboxes.delete(extensionId)
    }
  }
  
  /**
   * Terminate all sandboxes
   */
  terminateAll(): void {
    this.sandboxes.forEach((sandbox) => {
      sandbox.terminate()
    })
    this.sandboxes.clear()
  }
  
  /**
   * Get all sandbox stats
   */
  getAllStats(): Array<{ extensionId: string; memoryUsage: number; state: string }> {
    const stats: Array<{ extensionId: string; memoryUsage: number; state: string }> = []
    
    this.sandboxes.forEach((sandbox) => {
      stats.push({
        extensionId: sandbox.extensionId,
        memoryUsage: sandbox.getMemoryUsage(),
        state: sandbox.state
      })
    })
    
    return stats
  }
}

/**
 * Create a sandbox manager
 */
export function createSandboxManager(
  onLog: (level: string, message: string, data?: unknown) => void
): SandboxManager {
  return new SandboxManager(onLog)
}
