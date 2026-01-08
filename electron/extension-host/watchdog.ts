/**
 * Extension Watchdog
 * 
 * Monitors all extensions for resource usage violations:
 * - Memory budget per extension (configurable, default 50MB)
 * - CPU timeout per operation (configurable, default 5s)
 * - Kill mechanism for runaway extensions
 */

import type {
  WatchdogConfig,
  WatchdogViolation,
  ExtensionStats,
  ViolationType,
  DEFAULT_WATCHDOG_CONFIG
} from './types'

interface ExtensionWatchdogEntry {
  extensionId: string
  config: WatchdogConfig
  stats: ExtensionStats
  operationStartTime?: number
  isRunning: boolean
}

type ViolationCallback = (extensionId: string, violation: WatchdogViolation) => void

/**
 * Watchdog class that monitors CPU/memory per extension
 */
export class Watchdog {
  private extensions: Map<string, ExtensionWatchdogEntry> = new Map()
  private intervalId: NodeJS.Timeout | null = null
  private violationCallbacks: ViolationCallback[] = []
  private defaultConfig: WatchdogConfig
  private isRunning = false
  
  constructor(defaultConfig?: Partial<WatchdogConfig>) {
    this.defaultConfig = {
      memoryLimitMB: defaultConfig?.memoryLimitMB ?? 50,
      cpuTimeoutMs: defaultConfig?.cpuTimeoutMs ?? 5000,
      checkIntervalMs: defaultConfig?.checkIntervalMs ?? 1000
    }
  }
  
  /**
   * Start the watchdog monitoring loop
   */
  start(): void {
    if (this.isRunning) return
    
    this.isRunning = true
    this.intervalId = setInterval(() => {
      this.checkAllExtensions()
    }, this.defaultConfig.checkIntervalMs)
    
    console.log('[Watchdog] Started monitoring')
  }
  
  /**
   * Stop the watchdog monitoring loop
   */
  stop(): void {
    if (!this.isRunning) return
    
    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    
    console.log('[Watchdog] Stopped monitoring')
  }
  
  /**
   * Register an extension for monitoring
   */
  registerExtension(id: string, config?: Partial<WatchdogConfig>): void {
    const mergedConfig: WatchdogConfig = {
      ...this.defaultConfig,
      ...config
    }
    
    const entry: ExtensionWatchdogEntry = {
      extensionId: id,
      config: mergedConfig,
      stats: {
        extensionId: id,
        memoryUsageMB: 0,
        cpuTimeMs: 0,
        lastActivityMs: Date.now(),
        activationCount: 0,
        errorCount: 0
      },
      isRunning: false
    }
    
    this.extensions.set(id, entry)
    console.log(`[Watchdog] Registered extension: ${id}`)
  }
  
  /**
   * Unregister an extension from monitoring
   */
  unregisterExtension(id: string): void {
    this.extensions.delete(id)
    console.log(`[Watchdog] Unregistered extension: ${id}`)
  }
  
  /**
   * Update extension config
   */
  updateConfig(id: string, config: Partial<WatchdogConfig>): void {
    const entry = this.extensions.get(id)
    if (entry) {
      entry.config = { ...entry.config, ...config }
    }
  }
  
  /**
   * Mark operation start for CPU timeout tracking
   */
  operationStart(extensionId: string): void {
    const entry = this.extensions.get(extensionId)
    if (entry) {
      entry.operationStartTime = Date.now()
      entry.isRunning = true
      entry.stats.lastActivityMs = Date.now()
    }
  }
  
  /**
   * Mark operation end
   */
  operationEnd(extensionId: string): void {
    const entry = this.extensions.get(extensionId)
    if (entry) {
      if (entry.operationStartTime) {
        entry.stats.cpuTimeMs += Date.now() - entry.operationStartTime
      }
      entry.operationStartTime = undefined
      entry.isRunning = false
      entry.stats.lastActivityMs = Date.now()
    }
  }
  
  /**
   * Report memory usage for an extension
   */
  reportMemoryUsage(extensionId: string, memoryBytes: number): void {
    const entry = this.extensions.get(extensionId)
    if (entry) {
      entry.stats.memoryUsageMB = memoryBytes / (1024 * 1024)
      entry.stats.lastActivityMs = Date.now()
    }
  }
  
  /**
   * Report an error for an extension
   */
  reportError(extensionId: string): void {
    const entry = this.extensions.get(extensionId)
    if (entry) {
      entry.stats.errorCount++
    }
  }
  
  /**
   * Report activation for an extension
   */
  reportActivation(extensionId: string): void {
    const entry = this.extensions.get(extensionId)
    if (entry) {
      entry.stats.activationCount++
      entry.stats.lastActivityMs = Date.now()
    }
  }
  
  /**
   * Kill an extension manually
   */
  killExtension(id: string, reason: string): void {
    const entry = this.extensions.get(id)
    if (!entry) return
    
    console.log(`[Watchdog] Killing extension ${id}: ${reason}`)
    
    const violation: WatchdogViolation = {
      type: 'error',
      extensionId: id,
      timestamp: Date.now(),
      details: { message: reason }
    }
    
    this.emitViolation(id, violation)
  }
  
  /**
   * Get stats for a specific extension
   */
  getStats(id: string): ExtensionStats | undefined {
    return this.extensions.get(id)?.stats
  }
  
  /**
   * Get stats for all extensions
   */
  getAllStats(): ExtensionStats[] {
    return Array.from(this.extensions.values()).map(e => e.stats)
  }
  
  /**
   * Subscribe to violation events
   */
  onViolation(callback: ViolationCallback): () => void {
    this.violationCallbacks.push(callback)
    return () => {
      const index = this.violationCallbacks.indexOf(callback)
      if (index !== -1) {
        this.violationCallbacks.splice(index, 1)
      }
    }
  }
  
  /**
   * Check all extensions for violations
   */
  private checkAllExtensions(): void {
    const now = Date.now()
    
    this.extensions.forEach((entry, id) => {
      // Check memory limit
      if (entry.stats.memoryUsageMB > entry.config.memoryLimitMB) {
        const violation: WatchdogViolation = {
          type: 'memory_exceeded',
          extensionId: id,
          timestamp: now,
          details: {
            limit: entry.config.memoryLimitMB,
            actual: entry.stats.memoryUsageMB
          }
        }
        this.emitViolation(id, violation)
      }
      
      // Check CPU timeout
      if (entry.isRunning && entry.operationStartTime) {
        const elapsed = now - entry.operationStartTime
        if (elapsed > entry.config.cpuTimeoutMs) {
          const violation: WatchdogViolation = {
            type: 'cpu_timeout',
            extensionId: id,
            timestamp: now,
            details: {
              limit: entry.config.cpuTimeoutMs,
              actual: elapsed
            }
          }
          this.emitViolation(id, violation)
        }
      }
      
      // Check for unresponsive extensions (no activity for 30 seconds while marked as running)
      if (entry.isRunning) {
        const inactiveTime = now - entry.stats.lastActivityMs
        if (inactiveTime > 30000) {
          const violation: WatchdogViolation = {
            type: 'unresponsive',
            extensionId: id,
            timestamp: now,
            details: {
              actual: inactiveTime,
              message: 'Extension has been unresponsive for 30+ seconds'
            }
          }
          this.emitViolation(id, violation)
        }
      }
    })
  }
  
  /**
   * Emit a violation to all callbacks
   */
  private emitViolation(extensionId: string, violation: WatchdogViolation): void {
    console.warn(`[Watchdog] Violation for ${extensionId}:`, violation)
    
    for (const callback of this.violationCallbacks) {
      try {
        callback(extensionId, violation)
      } catch (err) {
        console.error('[Watchdog] Violation callback error:', err)
      }
    }
  }
}

/**
 * Create a new Watchdog instance
 */
export function createWatchdog(config?: Partial<WatchdogConfig>): Watchdog {
  return new Watchdog(config)
}
