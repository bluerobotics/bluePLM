/**
 * Extension Host Type Definitions
 * 
 * Types for the Extension Host process that runs isolated client-side extension code.
 */

// ============================================
// Extension State Machine
// ============================================

/**
 * Extension lifecycle states
 */
export type ExtensionState = 
  | 'not-installed'
  | 'installed' 
  | 'loading' 
  | 'active' 
  | 'error'
  | 'killed'

/**
 * Loaded extension instance
 */
export interface LoadedExtension {
  id: string
  manifest: ExtensionManifest
  state: ExtensionState
  error?: string
  loadedAt?: number
  activatedAt?: number
  memoryUsage?: number
  cpuTime?: number
}

// ============================================
// Manifest Types (subset needed by host)
// ============================================

/**
 * Extension category determines where it runs
 */
export type ExtensionCategory = 'sandboxed' | 'native'

/**
 * Extension manifest structure (minimal for host)
 */
export interface ExtensionManifest {
  id: string
  name: string
  version: string
  publisher: string
  category?: ExtensionCategory
  main?: string
  activationEvents?: string[]
  permissions?: {
    client?: string[]
    server?: string[]
  }
}

// ============================================
// Watchdog Types
// ============================================

/**
 * Watchdog configuration per extension
 */
export interface WatchdogConfig {
  /** Memory limit in MB (default: 50) */
  memoryLimitMB: number
  /** CPU timeout per operation in ms (default: 5000) */
  cpuTimeoutMs: number
  /** Check interval in ms (default: 1000) */
  checkIntervalMs: number
}

/**
 * Default watchdog configuration
 */
export const DEFAULT_WATCHDOG_CONFIG: WatchdogConfig = {
  memoryLimitMB: 50,
  cpuTimeoutMs: 5000,
  checkIntervalMs: 1000
}

/**
 * Watchdog violation types
 */
export type ViolationType = 
  | 'memory_exceeded'
  | 'cpu_timeout'
  | 'unresponsive'
  | 'error'

/**
 * Watchdog violation event
 */
export interface WatchdogViolation {
  type: ViolationType
  extensionId: string
  timestamp: number
  details: {
    limit?: number
    actual?: number
    message?: string
  }
}

/**
 * Extension runtime statistics
 */
export interface ExtensionStats {
  extensionId: string
  memoryUsageMB: number
  cpuTimeMs: number
  lastActivityMs: number
  activationCount: number
  errorCount: number
}

// ============================================
// IPC Message Types
// ============================================

/**
 * Messages from Main process to Extension Host
 */
export type HostInboundMessage =
  | { type: 'extension:load'; extensionId: string; bundlePath: string; manifest: ExtensionManifest }
  | { type: 'extension:activate'; extensionId: string }
  | { type: 'extension:deactivate'; extensionId: string }
  | { type: 'extension:kill'; extensionId: string; reason: string }
  | { type: 'api:call'; callId: string; extensionId: string; api: string; method: string; args: unknown[] }
  | { type: 'watchdog:config'; extensionId: string; config: Partial<WatchdogConfig> }
  | { type: 'host:shutdown' }

/**
 * Messages from Extension Host to Main process
 */
export type HostOutboundMessage =
  | { type: 'host:ready'; timestamp: number }
  | { type: 'extension:loaded'; extensionId: string }
  | { type: 'extension:activated'; extensionId: string }
  | { type: 'extension:deactivated'; extensionId: string }
  | { type: 'extension:error'; extensionId: string; error: string; stack?: string }
  | { type: 'extension:killed'; extensionId: string; reason: string }
  | { type: 'watchdog:violation'; violation: WatchdogViolation }
  | { type: 'api:result'; callId: string; result: unknown }
  | { type: 'api:error'; callId: string; error: string }
  | { type: 'host:stats'; extensions: ExtensionStats[] }
  | { type: 'host:crashed'; error: string }

// ============================================
// Extension Module Interface
// ============================================

/**
 * Extension context passed to activate()
 */
export interface ExtensionContext {
  extensionId: string
  extensionPath: string
  storagePath: string
  subscriptions: Disposable[]
  log: ExtensionLogger
}

/**
 * Extension logger interface
 */
export interface ExtensionLogger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

/**
 * Disposable pattern for cleanup
 */
export interface Disposable {
  dispose(): void
}

/**
 * Extension module exports
 */
export interface ExtensionModule {
  activate?(context: ExtensionContext, api: unknown): void | Promise<void>
  deactivate?(): void | Promise<void>
}

// ============================================
// Sandbox Types
// ============================================

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  /** Extension ID */
  extensionId: string
  /** Path to extension bundle */
  bundlePath: string
  /** Extension manifest */
  manifest: ExtensionManifest
  /** Watchdog config overrides */
  watchdogConfig?: Partial<WatchdogConfig>
}

/**
 * Sandbox instance
 */
export interface SandboxInstance {
  id: string
  extensionId: string
  state: 'idle' | 'running' | 'terminated'
  startedAt: number
  lastActivity: number
  
  /** Execute code in the sandbox */
  execute<T>(code: string, ...args: unknown[]): Promise<T>
  
  /** Terminate the sandbox */
  terminate(): void
  
  /** Get memory usage in bytes */
  getMemoryUsage(): number
}
