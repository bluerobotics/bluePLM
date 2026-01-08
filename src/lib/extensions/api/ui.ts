/**
 * Extension UI API Implementation
 * 
 * Provides sandboxed UI operations for extensions.
 * All operations are forwarded via IPC to the main process.
 * 
 * @module extensions/api/ui
 */

import type {
  UIAPI,
  ToastType,
  DialogOptions,
  DialogResult,
  ConnectionStatus,
  ProgressOptions,
  Progress,
  CancellationToken,
  QuickPickItem,
  QuickPickOptions,
  InputBoxOptions,
  Disposable,
} from './types'
import { checkPermission } from './permissions'

// ============================================
// IPC Channel Constants
// ============================================

/**
 * IPC channels used by the UI API.
 */
export const UI_IPC_CHANNELS = {
  SHOW_TOAST: 'extension:ui:showToast',
  SHOW_DIALOG: 'extension:ui:showDialog',
  SET_STATUS: 'extension:ui:setStatus',
  SHOW_PROGRESS: 'extension:ui:showProgress',
  REPORT_PROGRESS: 'extension:ui:reportProgress',
  CANCEL_PROGRESS: 'extension:ui:cancelProgress',
  SHOW_QUICK_PICK: 'extension:ui:showQuickPick',
  SHOW_INPUT_BOX: 'extension:ui:showInputBox',
} as const

// ============================================
// Helper Functions
// ============================================

/**
 * Send an IPC message to the main process.
 * This is a stub that will be connected to the actual IPC bridge.
 */
async function sendIPC<T>(channel: string, ...args: unknown[]): Promise<T> {
  // In the actual implementation, this connects to the IPC bridge
  // For now, we throw to indicate this needs to be wired up
  if (typeof window !== 'undefined' && (window as any).__extensionIPC) {
    return (window as any).__extensionIPC.invoke(channel, ...args)
  }
  throw new Error(`IPC not available: ${channel}`)
}

/**
 * Generate a unique ID for correlating progress operations.
 */
function generateProgressId(): string {
  return `progress_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// ============================================
// UI API Implementation
// ============================================

/**
 * Create the UI API implementation for an extension.
 * 
 * @param extensionId - The ID of the extension using this API
 * @param grantedPermissions - Permissions granted to the extension
 * @returns The UI API implementation
 */
export function createUIAPI(
  extensionId: string,
  grantedPermissions: string[]
): UIAPI {
  return {
    /**
     * Show a toast notification.
     */
    showToast(message: string, type: ToastType = 'info', duration: number = 3000): void {
      checkPermission(extensionId, 'ui.showToast', grantedPermissions)
      
      // Fire and forget - toasts don't need a response
      sendIPC(UI_IPC_CHANNELS.SHOW_TOAST, {
        extensionId,
        message,
        type,
        duration,
      }).catch((error) => {
        console.error(`[Extension:${extensionId}] Failed to show toast:`, error)
      })
    },

    /**
     * Show a dialog and wait for user response.
     */
    async showDialog(options: DialogOptions): Promise<DialogResult> {
      checkPermission(extensionId, 'ui.showDialog', grantedPermissions)
      
      const result = await sendIPC<DialogResult>(UI_IPC_CHANNELS.SHOW_DIALOG, {
        extensionId,
        ...options,
      })
      
      return result
    },

    /**
     * Set the extension's connection status indicator.
     */
    setStatus(status: ConnectionStatus): void {
      checkPermission(extensionId, 'ui.setStatus', grantedPermissions)
      
      sendIPC(UI_IPC_CHANNELS.SET_STATUS, {
        extensionId,
        status,
      }).catch((error) => {
        console.error(`[Extension:${extensionId}] Failed to set status:`, error)
      })
    },

    /**
     * Show a progress indicator while performing an operation.
     */
    async showProgress<T>(
      options: ProgressOptions,
      task: (progress: Progress, token: CancellationToken) => Promise<T>
    ): Promise<T> {
      checkPermission(extensionId, 'ui.showProgress', grantedPermissions)
      
      const progressId = generateProgressId()
      let isCancelled = false
      const cancellationCallbacks: (() => void)[] = []
      
      // Create the progress reporter
      const progress: Progress = {
        report(value: { message?: string; increment?: number }): void {
          sendIPC(UI_IPC_CHANNELS.REPORT_PROGRESS, {
            extensionId,
            progressId,
            ...value,
          }).catch((error) => {
            console.error(`[Extension:${extensionId}] Failed to report progress:`, error)
          })
        },
      }
      
      // Create the cancellation token
      const token: CancellationToken = {
        get isCancellationRequested() {
          return isCancelled
        },
        onCancellationRequested(callback: () => void): Disposable {
          cancellationCallbacks.push(callback)
          return {
            dispose() {
              const index = cancellationCallbacks.indexOf(callback)
              if (index !== -1) {
                cancellationCallbacks.splice(index, 1)
              }
            },
          }
        },
      }
      
      try {
        // Start progress display
        const startResult = await sendIPC<{ success: boolean; cancelListener?: string }>(
          UI_IPC_CHANNELS.SHOW_PROGRESS,
          {
            extensionId,
            progressId,
            ...options,
          }
        )
        
        // Set up cancellation listener if cancellable
        if (options.cancellable && startResult.cancelListener) {
          // Listen for cancel events from main process
          // This would be wired up through the IPC bridge
        }
        
        // Execute the task
        const result = await task(progress, token)
        
        return result
      } finally {
        // Clean up progress display
        sendIPC(UI_IPC_CHANNELS.CANCEL_PROGRESS, {
          extensionId,
          progressId,
        }).catch(() => {
          // Ignore cleanup errors
        })
      }
    },

    /**
     * Show a quick pick list for user selection.
     */
    async showQuickPick(
      items: QuickPickItem[],
      options?: QuickPickOptions
    ): Promise<QuickPickItem | QuickPickItem[] | undefined> {
      checkPermission(extensionId, 'ui.showQuickPick', grantedPermissions)
      
      const result = await sendIPC<{ selected?: QuickPickItem | QuickPickItem[]; cancelled: boolean }>(
        UI_IPC_CHANNELS.SHOW_QUICK_PICK,
        {
          extensionId,
          items,
          options: options || {},
        }
      )
      
      if (result.cancelled) {
        return undefined
      }
      
      return result.selected
    },

    /**
     * Show an input box for user text input.
     */
    async showInputBox(options?: InputBoxOptions): Promise<string | undefined> {
      checkPermission(extensionId, 'ui.showInputBox', grantedPermissions)
      
      // Note: validateInput function cannot be serialized via IPC
      // Validation will happen on the main process side with the pattern
      // or be re-executed after receiving input
      const serializableOptions = options
        ? {
            title: options.title,
            placeholder: options.placeholder,
            value: options.value,
            valueSelection: options.valueSelection,
            password: options.password,
            prompt: options.prompt,
            // Validation pattern could be sent as regex string if needed
          }
        : {}
      
      const result = await sendIPC<{ value?: string; cancelled: boolean }>(
        UI_IPC_CHANNELS.SHOW_INPUT_BOX,
        {
          extensionId,
          options: serializableOptions,
        }
      )
      
      if (result.cancelled) {
        return undefined
      }
      
      // If there's a validateInput function, validate the result
      if (options?.validateInput && result.value !== undefined) {
        const validationError = await options.validateInput(result.value)
        if (validationError) {
          // Show error and re-prompt
          // This is a simplified implementation - real one would loop
          throw new Error(`Validation failed: ${validationError}`)
        }
      }
      
      return result.value
    },
  }
}

// ============================================
// Export Types
// ============================================

export type { UIAPI, ToastType, DialogOptions, DialogResult, ConnectionStatus }
export type { ProgressOptions, Progress, CancellationToken }
export type { QuickPickItem, QuickPickOptions, InputBoxOptions }
