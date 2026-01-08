/**
 * Extension System IPC
 * 
 * IPC bridge for communication between Main Process, Extension Host, and Renderer.
 * 
 * @module extensions/ipc
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PROTOCOL TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Message types
  type HostInboundMessage,
  type HostOutboundMessage,
  
  // Request/Response envelopes
  type IpcRequest,
  type IpcResponse,
  
  // Request payloads
  type InstallExtensionRequest,
  type InstallFromFileRequest,
  type SearchStoreRequest,
  type UpdateExtensionRequest,
  type PinVersionRequest,
  
  // Response payloads
  type HostStatusResponse,
  type InstallResultResponse,
  type SearchStoreResponse,
  type CheckUpdatesResponse,
  
  // Event payloads
  type ExtensionStateChangeEvent,
  type ExtensionViolationEvent,
  type InstallProgressEvent,
  type ExtensionUICall,
  
  // Channel constants
  ExtensionChannels,
  type ExtensionChannel,
  
  // Timeout constants
  IpcTimeouts,
  
  // Utility functions
  generateCallId,
  createRequest,
  createSuccessResponse,
  createErrorResponse,
  isHostMessage,
  isHostInboundMessage
} from './protocol'

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Client class
  ExtensionIpcClient,
  
  // Client types (IPC-specific)
  type IpcExtensionManifest,
  type IpcExtensionState,
  type IpcVerificationStatus,
  type IpcLoadedExtension,
  type IpcExtensionStats,
  type IpcStoreExtension,
  type IpcInstallResult,
  type IpcExtensionUpdate,
  type IpcStateChangeEvent,
  type IpcViolationEvent,
  type IpcSearchStoreResponse,
  type ExtensionClientEvents,
  
  // Singleton
  getExtensionClient,
  
  // Convenience functions
  isExtensionSystemAvailable,
  installExtension,
  uninstallExtension,
  fetchExtensionStore,
  checkExtensionUpdates
} from './client'
