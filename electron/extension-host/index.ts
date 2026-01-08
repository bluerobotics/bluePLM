/**
 * Extension Host Module
 * 
 * Barrel exports for the Extension Host system.
 * This module provides the infrastructure for running isolated
 * client-side extension code in a hidden BrowserWindow.
 */

// ============================================
// Type Exports
// ============================================

export type {
  // Extension State
  ExtensionState,
  LoadedExtension,
  
  // Manifest Types
  ExtensionCategory,
  ExtensionManifest,
  
  // Watchdog Types
  WatchdogConfig,
  WatchdogViolation,
  ViolationType,
  ExtensionStats,
  
  // IPC Types
  HostInboundMessage,
  HostOutboundMessage,
  
  // Extension Module Types
  ExtensionContext,
  ExtensionLogger,
  Disposable,
  ExtensionModule,
  
  // Sandbox Types
  SandboxConfig,
  SandboxInstance
} from './types'

export { DEFAULT_WATCHDOG_CONFIG } from './types'

// ============================================
// Class Exports
// ============================================

// Host
export {
  ExtensionHost,
  createExtensionHost,
  initializeExtensionHost
} from './host'

export type { ExtensionHostConfig } from './host'

// Loader
export {
  ExtensionLoader,
  createExtensionLoader
} from './loader'

export type { ExtensionLoaderConfig, LoadResult } from './loader'

// Sandbox
export {
  ExtensionSandbox,
  SandboxManager,
  createSandboxManager
} from './sandbox'

// Watchdog
export {
  Watchdog,
  createWatchdog
} from './watchdog'

// IPC
export {
  ExtensionHostIPC,
  createExtensionHostIPC,
  createIPCBridgedAPI
} from './ipc'

export type { IPCHandlerConfig } from './ipc'
