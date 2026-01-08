/**
 * V8 Isolate Pool for Extension Sandbox Execution
 * 
 * Provides secure, isolated execution environment for extension server handlers.
 * Uses isolated-vm for V8 isolation with configurable resource limits.
 * 
 * @module extensions/sandbox
 */

import ivm from 'isolated-vm'
import type { ExtensionServerAPI } from './runtime.js'
import type { ExtensionManifest } from './types.js'

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Isolate pool configuration.
 */
export interface IsolatePoolConfig {
  /** Maximum number of isolates in pool. Default: 10 */
  poolSize: number
  /** Memory limit per isolate in MB. Default: 128 */
  memoryLimitMB: number
  /** Execution timeout in milliseconds. Default: 30000 */
  timeoutMs: number
  /** Enable warm isolate reuse. Default: true */
  warmPool: boolean
  /** Maximum concurrent executions per isolate. Default: 5 */
  maxConcurrentPerIsolate: number
}

/**
 * Default pool configuration.
 */
export const DEFAULT_POOL_CONFIG: IsolatePoolConfig = {
  poolSize: 10,
  memoryLimitMB: 128,
  timeoutMs: 30000,
  warmPool: true,
  maxConcurrentPerIsolate: 5
}

// ═══════════════════════════════════════════════════════════════════════════════
// POOL STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Statistics for the isolate pool.
 */
export interface PoolStats {
  /** Number of isolates currently in pool */
  pooledCount: number
  /** Number of isolates currently executing */
  activeCount: number
  /** Total executions since pool creation */
  totalExecutions: number
  /** Number of cold starts (new isolate created) */
  coldStarts: number
  /** Number of warm starts (reused isolate) */
  warmStarts: number
  /** Average execution time in ms */
  avgExecutionTimeMs: number
  /** Number of executions that timed out */
  timeouts: number
  /** Number of executions that hit memory limits */
  memoryExceeded: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGED ISOLATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Wrapper around isolated-vm Isolate with lifecycle management.
 */
interface ManagedIsolate {
  isolate: ivm.Isolate
  context: ivm.Context
  currentExecutions: number
  createdAt: Date
  lastUsedAt: Date
  executionCount: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION RESULT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of sandbox execution.
 */
export interface SandboxResult {
  /** Whether execution succeeded */
  success: boolean
  /** Response data (if successful) */
  response?: {
    status: number
    headers: Record<string, string>
    body: unknown
  }
  /** Error message (if failed) */
  error?: string
  /** Error code for categorization */
  errorCode?: 'TIMEOUT' | 'MEMORY_EXCEEDED' | 'EXECUTION_ERROR' | 'INVALID_HANDLER'
  /** Execution time in milliseconds */
  executionTimeMs: number
  /** Memory used in bytes */
  memoryUsedBytes?: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// ISOLATE POOL CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * V8 Isolate Pool for extension handler execution.
 * 
 * Manages a pool of warm V8 isolates for efficient handler execution.
 * Each isolate is memory-limited and time-limited for security.
 * 
 * @example
 * ```typescript
 * const pool = new IsolatePool({ poolSize: 5 });
 * 
 * const result = await pool.execute(
 *   'my-extension',
 *   handlerCode,
 *   api,
 *   manifest
 * );
 * ```
 */
export class IsolatePool {
  private config: IsolatePoolConfig
  private pool: ManagedIsolate[] = []
  private activeIsolates: Set<ManagedIsolate> = new Set()
  private stats: PoolStats = {
    pooledCount: 0,
    activeCount: 0,
    totalExecutions: 0,
    coldStarts: 0,
    warmStarts: 0,
    avgExecutionTimeMs: 0,
    timeouts: 0,
    memoryExceeded: 0
  }
  private executionTimes: number[] = []
  private disposed = false

  constructor(config?: Partial<IsolatePoolConfig>) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config }
  }

  /**
   * Acquire an isolate from the pool or create a new one.
   */
  private async acquire(): Promise<ManagedIsolate> {
    if (this.disposed) {
      throw new Error('IsolatePool has been disposed')
    }

    // Try to get a warm isolate from pool
    if (this.config.warmPool && this.pool.length > 0) {
      const managed = this.pool.find(
        m => m.currentExecutions < this.config.maxConcurrentPerIsolate
      )
      
      if (managed) {
        managed.currentExecutions++
        managed.lastUsedAt = new Date()
        this.activeIsolates.add(managed)
        this.stats.warmStarts++
        return managed
      }
    }

    // Create new isolate
    const isolate = new ivm.Isolate({
      memoryLimit: this.config.memoryLimitMB
    })

    const context = await isolate.createContext()

    // Set up global references
    const jail = context.global
    await jail.set('global', jail.derefInto())

    // Create minimal console for logging
    await jail.set('_log', new ivm.Callback((level: string, ...args: unknown[]) => {
      const message = args.map(a => 
        typeof a === 'object' ? JSON.stringify(a) : String(a)
      ).join(' ')
      console.log(`[Extension:${level}]`, message)
    }))

    // Set up console object
    await context.eval(`
      const console = {
        log: (...args) => _log('info', ...args),
        info: (...args) => _log('info', ...args),
        warn: (...args) => _log('warn', ...args),
        error: (...args) => _log('error', ...args),
        debug: (...args) => _log('debug', ...args)
      };
    `)

    const managed: ManagedIsolate = {
      isolate,
      context,
      currentExecutions: 1,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      executionCount: 0
    }

    this.activeIsolates.add(managed)
    this.stats.coldStarts++
    this.updateStats()

    return managed
  }

  /**
   * Release an isolate back to the pool or dispose it.
   */
  private release(managed: ManagedIsolate): void {
    managed.currentExecutions--
    managed.executionCount++
    this.activeIsolates.delete(managed)

    // Add to pool if under limit and warm pooling enabled
    if (
      this.config.warmPool &&
      this.pool.length < this.config.poolSize &&
      !this.disposed
    ) {
      if (!this.pool.includes(managed)) {
        this.pool.push(managed)
      }
    } else if (managed.currentExecutions === 0) {
      // Dispose if not pooled and no active executions
      try {
        managed.isolate.dispose()
      } catch {
        // Ignore disposal errors
      }
    }

    this.updateStats()
  }

  /**
   * Execute extension handler code in sandbox.
   * 
   * @param extensionId - Extension identifier for logging
   * @param handlerCode - JavaScript handler code
   * @param api - ExtensionServerAPI instance
   * @param manifest - Extension manifest
   * @returns Execution result
   */
  async execute(
    extensionId: string,
    handlerCode: string,
    api: ExtensionServerAPI,
    _manifest: ExtensionManifest
  ): Promise<SandboxResult> {
    const startTime = Date.now()
    let managed: ManagedIsolate | null = null

    try {
      managed = await this.acquire()
      const { context, isolate } = managed

      // Check memory before execution
      const heapStats = isolate.getHeapStatistics()
      if (heapStats.used_heap_size > this.config.memoryLimitMB * 1024 * 1024 * 0.9) {
        this.stats.memoryExceeded++
        throw new Error('Isolate approaching memory limit')
      }

      // Inject API into context
      const apiRef = new ivm.Reference(api)
      await context.global.set('_api', apiRef)

      // Inject request/response helpers
      await context.eval(`
        const api = {
          storage: {
            get: async (key) => _api.apply(undefined, ['storage.get', [key]], { result: { promise: true } }),
            set: async (key, value) => _api.apply(undefined, ['storage.set', [key, value]], { result: { promise: true } }),
            delete: async (key) => _api.apply(undefined, ['storage.delete', [key]], { result: { promise: true } }),
            list: async (prefix) => _api.apply(undefined, ['storage.list', [prefix]], { result: { promise: true } })
          },
          secrets: {
            get: async (name) => _api.apply(undefined, ['secrets.get', [name]], { result: { promise: true } }),
            set: async (name, value) => _api.apply(undefined, ['secrets.set', [name, value]], { result: { promise: true } }),
            delete: async (name) => _api.apply(undefined, ['secrets.delete', [name]], { result: { promise: true } })
          },
          http: {
            fetch: async (url, options) => _api.apply(undefined, ['http.fetch', [url, options]], { result: { promise: true } })
          },
          request: _api.apply(undefined, ['getRequest', []], { result: { copy: true } }),
          user: _api.apply(undefined, ['getUser', []], { result: { copy: true } }),
          response: {
            json: (data, status = 200) => ({ type: 'json', data, status }),
            error: (message, status = 500) => ({ type: 'error', message, status }),
            redirect: (url, status = 302) => ({ type: 'redirect', url, status })
          }
        };
      `)

      // Wrap handler code in async function
      const wrappedCode = `
        (async function() {
          ${handlerCode}
          
          if (typeof handler === 'function') {
            return await handler(api);
          } else if (typeof exports !== 'undefined' && typeof exports.default === 'function') {
            return await exports.default(api);
          } else {
            throw new Error('Handler function not found. Export a default function or define handler().');
          }
        })();
      `

      // Execute with timeout
      const script = await isolate.compileScript(wrappedCode)
      const result = await script.run(context, {
        timeout: this.config.timeoutMs,
        promise: true
      })

      const executionTimeMs = Date.now() - startTime
      this.recordExecutionTime(executionTimeMs)

      // Parse result
      const response = this.parseHandlerResult(result)

      return {
        success: true,
        response,
        executionTimeMs,
        memoryUsedBytes: isolate.getHeapStatistics().used_heap_size
      }
    } catch (error) {
      const executionTimeMs = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Categorize error
      let errorCode: SandboxResult['errorCode'] = 'EXECUTION_ERROR'
      if (errorMessage.includes('Script execution timed out')) {
        errorCode = 'TIMEOUT'
        this.stats.timeouts++
      } else if (errorMessage.includes('memory')) {
        errorCode = 'MEMORY_EXCEEDED'
        this.stats.memoryExceeded++
      } else if (errorMessage.includes('Handler function not found')) {
        errorCode = 'INVALID_HANDLER'
      }

      console.error(`[Sandbox] Extension ${extensionId} execution error:`, errorMessage)

      return {
        success: false,
        error: errorMessage,
        errorCode,
        executionTimeMs
      }
    } finally {
      if (managed) {
        this.release(managed)
      }
    }
  }

  /**
   * Parse handler result into response format.
   */
  private parseHandlerResult(result: unknown): SandboxResult['response'] {
    if (!result || typeof result !== 'object') {
      return { status: 200, headers: {}, body: result }
    }

    const res = result as Record<string, unknown>

    if (res.type === 'json') {
      return {
        status: (res.status as number) || 200,
        headers: { 'content-type': 'application/json' },
        body: res.data
      }
    }

    if (res.type === 'error') {
      return {
        status: (res.status as number) || 500,
        headers: { 'content-type': 'application/json' },
        body: { error: res.message }
      }
    }

    if (res.type === 'redirect') {
      return {
        status: (res.status as number) || 302,
        headers: { location: res.url as string },
        body: null
      }
    }

    return { status: 200, headers: {}, body: result }
  }

  /**
   * Record execution time for statistics.
   */
  private recordExecutionTime(timeMs: number): void {
    this.executionTimes.push(timeMs)
    
    // Keep last 1000 execution times
    if (this.executionTimes.length > 1000) {
      this.executionTimes.shift()
    }

    this.stats.totalExecutions++
    this.stats.avgExecutionTimeMs = 
      this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length
  }

  /**
   * Update pool statistics.
   */
  private updateStats(): void {
    this.stats.pooledCount = this.pool.length
    this.stats.activeCount = this.activeIsolates.size
  }

  /**
   * Get current pool statistics.
   */
  getStats(): PoolStats {
    this.updateStats()
    return { ...this.stats }
  }

  /**
   * Warm up the pool by pre-creating isolates.
   */
  async warmUp(count?: number): Promise<void> {
    const targetCount = Math.min(count ?? this.config.poolSize, this.config.poolSize)
    
    for (let i = this.pool.length; i < targetCount; i++) {
      const managed = await this.acquire()
      this.release(managed)
    }
  }

  /**
   * Gracefully dispose all isolates and clean up.
   */
  async dispose(): Promise<void> {
    this.disposed = true

    // Wait for active executions to complete (max 5 seconds)
    const deadline = Date.now() + 5000
    while (this.activeIsolates.size > 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Dispose all pooled isolates
    for (const managed of this.pool) {
      try {
        managed.isolate.dispose()
      } catch {
        // Ignore disposal errors
      }
    }

    // Force dispose any remaining active isolates
    for (const managed of this.activeIsolates) {
      try {
        managed.isolate.dispose()
      } catch {
        // Ignore disposal errors
      }
    }

    this.pool = []
    this.activeIsolates.clear()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON POOL
// ═══════════════════════════════════════════════════════════════════════════════

let globalPool: IsolatePool | null = null

/**
 * Get or create the global isolate pool.
 */
export function getIsolatePool(config?: Partial<IsolatePoolConfig>): IsolatePool {
  if (!globalPool) {
    globalPool = new IsolatePool(config)
  }
  return globalPool
}

/**
 * Dispose the global isolate pool.
 */
export async function disposeIsolatePool(): Promise<void> {
  if (globalPool) {
    await globalPool.dispose()
    globalPool = null
  }
}
