/**
 * Extension Host IPC Handler
 * 
 * Handles all IPC communication between the Extension Host process
 * and the Main process. Uses the preload-exposed API for secure
 * context-isolated communication.
 */

import type {
  HostInboundMessage,
  HostOutboundMessage,
  ExtensionManifest,
  WatchdogViolation,
  ExtensionStats,
  WatchdogConfig
} from './types'

/**
 * Pending API call tracker
 */
interface PendingCall {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

/**
 * IPC Handler configuration
 */
export interface IPCHandlerConfig {
  /** Timeout for API calls in ms (default: 30000) */
  apiCallTimeout?: number
}

/**
 * IPC Handler for Extension Host
 */
export class ExtensionHostIPC {
  private pendingCalls: Map<string, PendingCall> = new Map()
  private messageHandlers: Map<string, (message: HostInboundMessage) => void | Promise<void>> = new Map()
  private sendMessage: (message: HostOutboundMessage) => void
  private callIdCounter = 0
  private config: Required<IPCHandlerConfig>
  
  constructor(
    sendMessageFn: (message: HostOutboundMessage) => void,
    config: IPCHandlerConfig = {}
  ) {
    this.sendMessage = sendMessageFn
    this.config = {
      apiCallTimeout: config.apiCallTimeout ?? 30000
    }
  }
  
  /**
   * Handle incoming message from Main process
   */
  async handleMessage(message: HostInboundMessage): Promise<void> {
    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      try {
        await handler(message)
      } catch (err) {
        console.error(`[IPC] Error handling message ${message.type}:`, err)
      }
    } else if (message.type === 'api:call') {
      // Handle API call result forwarding - this shouldn't happen in host
      console.warn('[IPC] Received unexpected api:call in host')
    } else {
      console.warn(`[IPC] No handler for message type: ${message.type}`)
    }
  }
  
  /**
   * Handle API result from Main process
   */
  handleApiResult(callId: string, result: unknown): void {
    const pending = this.pendingCalls.get(callId)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingCalls.delete(callId)
      pending.resolve(result)
    }
  }
  
  /**
   * Handle API error from Main process
   */
  handleApiError(callId: string, error: string): void {
    const pending = this.pendingCalls.get(callId)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingCalls.delete(callId)
      pending.reject(new Error(error))
    }
  }
  
  /**
   * Register a message handler
   */
  on(type: HostInboundMessage['type'], handler: (message: HostInboundMessage) => void | Promise<void>): void {
    this.messageHandlers.set(type, handler)
  }
  
  /**
   * Remove a message handler
   */
  off(type: HostInboundMessage['type']): void {
    this.messageHandlers.delete(type)
  }
  
  /**
   * Make an API call to Main process
   */
  async callApi<T>(extensionId: string, api: string, method: string, args: unknown[] = []): Promise<T> {
    const callId = this.generateCallId()
    
    return new Promise<T>((resolve, reject) => {
      // Set timeout for the call
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(callId)
        reject(new Error(`API call timed out after ${this.config.apiCallTimeout}ms`))
      }, this.config.apiCallTimeout)
      
      // Store pending call
      this.pendingCalls.set(callId, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout
      })
      
      // Send the API call request
      this.sendMessage({
        type: 'api:result',
        callId,
        result: { extensionId, api, method, args }
      })
    })
  }
  
  // ============================================
  // Outbound Messages
  // ============================================
  
  /**
   * Send host ready notification
   */
  sendReady(): void {
    this.sendMessage({
      type: 'host:ready',
      timestamp: Date.now()
    })
  }
  
  /**
   * Send extension loaded notification
   */
  sendExtensionLoaded(extensionId: string): void {
    this.sendMessage({
      type: 'extension:loaded',
      extensionId
    })
  }
  
  /**
   * Send extension activated notification
   */
  sendExtensionActivated(extensionId: string): void {
    this.sendMessage({
      type: 'extension:activated',
      extensionId
    })
  }
  
  /**
   * Send extension deactivated notification
   */
  sendExtensionDeactivated(extensionId: string): void {
    this.sendMessage({
      type: 'extension:deactivated',
      extensionId
    })
  }
  
  /**
   * Send extension error notification
   */
  sendExtensionError(extensionId: string, error: string, stack?: string): void {
    this.sendMessage({
      type: 'extension:error',
      extensionId,
      error,
      stack
    })
  }
  
  /**
   * Send extension killed notification
   */
  sendExtensionKilled(extensionId: string, reason: string): void {
    this.sendMessage({
      type: 'extension:killed',
      extensionId,
      reason
    })
  }
  
  /**
   * Send watchdog violation notification
   */
  sendWatchdogViolation(violation: WatchdogViolation): void {
    this.sendMessage({
      type: 'watchdog:violation',
      violation
    })
  }
  
  /**
   * Send API call result
   */
  sendApiResult(callId: string, result: unknown): void {
    this.sendMessage({
      type: 'api:result',
      callId,
      result
    })
  }
  
  /**
   * Send API call error
   */
  sendApiError(callId: string, error: string): void {
    this.sendMessage({
      type: 'api:error',
      callId,
      error
    })
  }
  
  /**
   * Send host stats
   */
  sendHostStats(extensions: ExtensionStats[]): void {
    this.sendMessage({
      type: 'host:stats',
      extensions
    })
  }
  
  /**
   * Send host crash notification
   */
  sendHostCrash(error: string): void {
    this.sendMessage({
      type: 'host:crashed',
      error
    })
  }
  
  /**
   * Generate unique call ID
   */
  private generateCallId(): string {
    return `call-${++this.callIdCounter}-${Date.now()}`
  }
  
  /**
   * Cleanup all pending calls
   */
  cleanup(): void {
    this.pendingCalls.forEach((pending, callId) => {
      clearTimeout(pending.timeout)
      pending.reject(new Error('IPC handler shutting down'))
    })
    this.pendingCalls.clear()
    this.messageHandlers.clear()
  }
}

/**
 * Create IPC handler for Extension Host
 */
export function createExtensionHostIPC(
  sendMessageFn: (message: HostOutboundMessage) => void,
  config?: IPCHandlerConfig
): ExtensionHostIPC {
  return new ExtensionHostIPC(sendMessageFn, config)
}

/**
 * Create a mock client API that forwards calls via IPC
 */
export function createIPCBridgedAPI(
  ipc: ExtensionHostIPC,
  extensionId: string
): unknown {
  // Create a proxy-based API that forwards all calls via IPC
  const createApiProxy = (namespace: string): unknown => {
    return new Proxy({}, {
      get(_, method: string) {
        return async (...args: unknown[]) => {
          return ipc.callApi(extensionId, namespace, method, args)
        }
      }
    })
  }
  
  return {
    ui: createApiProxy('ui'),
    storage: createApiProxy('storage'),
    commands: createApiProxy('commands'),
    workspace: createApiProxy('workspace'),
    events: createApiProxy('events'),
    telemetry: createApiProxy('telemetry'),
    
    // Direct methods
    callOrgApi: async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
      return ipc.callApi<T>(extensionId, 'network', 'callOrgApi', [endpoint, options])
    },
    callStoreApi: async <T>(endpoint: string): Promise<T> => {
      return ipc.callApi<T>(extensionId, 'network', 'callStoreApi', [endpoint])
    },
    fetch: async (url: string, options?: RequestInit): Promise<Response> => {
      return ipc.callApi<Response>(extensionId, 'network', 'fetch', [url, options])
    },
    
    // Context (read-only, provided at activation)
    context: {
      extensionId,
      version: '0.0.0', // Will be filled by actual extension manifest
      user: null,
      organization: null
    }
  }
}
