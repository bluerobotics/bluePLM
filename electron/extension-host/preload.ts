/**
 * Extension Host Preload Script
 * 
 * This script runs in the Extension Host's isolated renderer context.
 * It provides a minimal, secure bridge between the Extension Host
 * and the Main process.
 * 
 * Security Considerations:
 * - Context isolation is enabled
 * - Only specific IPC channels are exposed
 * - No direct Node.js access
 * - Minimal surface area
 */

import { contextBridge, ipcRenderer } from 'electron'

import type { HostInboundMessage, HostOutboundMessage } from './types'

/**
 * Extension Host Bridge
 * 
 * Exposed to the Extension Host window via contextBridge.
 * Provides secure, typed IPC communication.
 */
const extensionHostBridge = {
  /**
   * Send a message to the Main process
   */
  send(message: HostOutboundMessage): void {
    ipcRenderer.send('extension-host:message', message)
  },
  
  /**
   * Register a callback for incoming messages from Main process
   */
  onMessage(callback: (message: HostInboundMessage) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, message: HostInboundMessage) => {
      callback(message)
    }
    
    ipcRenderer.on('extension-host:message', handler)
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('extension-host:message', handler)
    }
  },
  
  /**
   * Request API call to be forwarded to Main process
   * Returns a promise that resolves when the API call completes
   */
  callApi(callId: string, extensionId: string, api: string, method: string, args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const responseChannel = `extension-host:api-response:${callId}`
      
      // Set up one-time listener for the response
      const timeout = setTimeout(() => {
        ipcRenderer.removeAllListeners(responseChannel)
        reject(new Error('API call timed out'))
      }, 30000)
      
      ipcRenderer.once(responseChannel, (_event, response: { success: boolean; result?: unknown; error?: string }) => {
        clearTimeout(timeout)
        if (response.success) {
          resolve(response.result)
        } else {
          reject(new Error(response.error || 'API call failed'))
        }
      })
      
      // Send the API call request
      ipcRenderer.send('extension-host:api-call', {
        callId,
        extensionId,
        api,
        method,
        args
      })
    })
  },
  
  /**
   * Get host window info
   */
  getInfo(): { platform: string; version: string } {
    return {
      platform: process.platform,
      version: process.versions.electron
    }
  },
  
  /**
   * Log to main process
   */
  log(level: string, message: string, data?: unknown): void {
    ipcRenderer.send('extension-host:log', { level, message, data })
  }
}

// Expose the bridge to the Extension Host window
contextBridge.exposeInMainWorld('extensionHostBridge', extensionHostBridge)

// Type declaration for the Extension Host window
declare global {
  interface Window {
    extensionHostBridge: typeof extensionHostBridge
  }
}

console.log('[ExtensionHost Preload] Bridge exposed')
