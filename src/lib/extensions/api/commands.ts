/**
 * Extension Commands API Implementation
 * 
 * Provides command registration and execution for extensions.
 * Commands are the primary way for extensions to expose functionality.
 * 
 * @module extensions/api/commands
 */

import type {
  CommandsAPI,
  CommandHandler,
  CommandOptions,
  Disposable,
} from './types'
import { checkPermission } from './permissions'
import { toDisposable } from './types'

// ============================================
// IPC Channel Constants
// ============================================

/**
 * IPC channels used by the Commands API.
 */
export const COMMANDS_IPC_CHANNELS = {
  REGISTER: 'extension:commands:register',
  UNREGISTER: 'extension:commands:unregister',
  EXECUTE: 'extension:commands:execute',
  GET_ALL: 'extension:commands:getAll',
  INVOKE: 'extension:commands:invoke',
} as const

// ============================================
// Helper Functions
// ============================================

/**
 * Send an IPC message to the main process.
 */
async function sendIPC<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (typeof window !== 'undefined' && (window as any).__extensionIPC) {
    return (window as any).__extensionIPC.invoke(channel, ...args)
  }
  throw new Error(`IPC not available: ${channel}`)
}

/**
 * Validate command ID format.
 * Commands should be namespaced, e.g., 'myext.doSomething'.
 */
function validateCommandId(commandId: string, extensionId: string): void {
  if (!commandId || typeof commandId !== 'string') {
    throw new Error('Command ID must be a non-empty string')
  }
  
  // Commands should be namespaced with extension ID or a common prefix
  const validPrefixes = [extensionId, 'blueplm']
  const hasValidPrefix = validPrefixes.some((prefix) => 
    commandId.startsWith(`${prefix}.`)
  )
  
  if (!hasValidPrefix) {
    console.warn(
      `[Extension:${extensionId}] Command ID '${commandId}' should be prefixed with '${extensionId}.'`
    )
  }
}

// ============================================
// Local Command Registry
// ============================================

/**
 * Local registry of command handlers for this extension context.
 * Maps command IDs to their handlers.
 */
const localHandlers = new Map<string, CommandHandler>()

/**
 * Handle a command invocation from the main process.
 */
export function handleCommandInvocation(
  commandId: string,
  args: unknown[]
): unknown {
  const handler = localHandlers.get(commandId)
  if (!handler) {
    throw new Error(`Command not found: ${commandId}`)
  }
  return handler(...args)
}

// ============================================
// Commands API Implementation
// ============================================

/**
 * Create the Commands API implementation for an extension.
 * 
 * @param extensionId - The ID of the extension using this API
 * @param grantedPermissions - Permissions granted to the extension
 * @returns The Commands API implementation
 * 
 * @example
 * ```typescript
 * const commands = createCommandsAPI('my-extension', ['commands:register'])
 * 
 * // Register a command
 * const disposable = commands.registerCommand('my-extension.sayHello', (name) => {
 *   return `Hello, ${name}!`
 * })
 * 
 * // Execute a command
 * const result = await commands.executeCommand<string>('my-extension.sayHello', 'World')
 * ```
 */
export function createCommandsAPI(
  extensionId: string,
  grantedPermissions: string[]
): CommandsAPI {
  return {
    /**
     * Register a command handler.
     */
    registerCommand(
      id: string,
      handler: CommandHandler,
      options?: CommandOptions
    ): Disposable {
      checkPermission(extensionId, 'commands.registerCommand', grantedPermissions)
      validateCommandId(id, extensionId)
      
      if (localHandlers.has(id)) {
        throw new Error(`Command '${id}' is already registered`)
      }
      
      // Store handler locally
      localHandlers.set(id, handler)
      
      // Register with main process
      sendIPC(COMMANDS_IPC_CHANNELS.REGISTER, {
        extensionId,
        commandId: id,
        options: options || {},
      }).catch((error) => {
        console.error(`[Extension:${extensionId}] Failed to register command:`, error)
        localHandlers.delete(id)
      })
      
      // Return disposable for cleanup
      return toDisposable(() => {
        localHandlers.delete(id)
        sendIPC(COMMANDS_IPC_CHANNELS.UNREGISTER, {
          extensionId,
          commandId: id,
        }).catch((error) => {
          console.error(`[Extension:${extensionId}] Failed to unregister command:`, error)
        })
      })
    },

    /**
     * Execute a registered command.
     */
    async executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T> {
      checkPermission(extensionId, 'commands.executeCommand', grantedPermissions)
      
      // Check if it's a local command first
      const localHandler = localHandlers.get(id)
      if (localHandler) {
        const result = await Promise.resolve(localHandler(...args))
        return result as T
      }
      
      // Otherwise, forward to main process
      const result = await sendIPC<{ result: T; error?: string }>(
        COMMANDS_IPC_CHANNELS.EXECUTE,
        {
          extensionId,
          commandId: id,
          args,
        }
      )
      
      if (result.error) {
        throw new Error(result.error)
      }
      
      return result.result
    },

    /**
     * Get list of all registered command IDs.
     */
    async getCommands(): Promise<string[]> {
      // No permission check needed for listing commands
      
      const result = await sendIPC<{ commands: string[] }>(
        COMMANDS_IPC_CHANNELS.GET_ALL,
        { extensionId }
      )
      
      return result.commands
    },
  }
}

// ============================================
// Command Utilities
// ============================================

/**
 * Create a typed command executor for a specific command.
 * Useful for extensions that frequently call the same command.
 * 
 * @param api - The Commands API instance
 * @param commandId - The command ID to wrap
 * @returns A typed function to execute the command
 * 
 * @example
 * ```typescript
 * const syncFiles = createCommandExecutor<[string[]], SyncResult>(
 *   api.commands,
 *   'gdrive.syncFiles'
 * )
 * 
 * const result = await syncFiles(['file1.txt', 'file2.txt'])
 * ```
 */
export function createCommandExecutor<TArgs extends unknown[], TResult>(
  api: CommandsAPI,
  commandId: string
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => api.executeCommand<TResult>(commandId, ...args)
}

/**
 * Get all locally registered commands for an extension.
 * Primarily for debugging/testing.
 */
export function getLocalCommands(): string[] {
  return Array.from(localHandlers.keys())
}

/**
 * Clear all locally registered commands.
 * Used during extension deactivation.
 */
export function clearLocalCommands(): void {
  localHandlers.clear()
}

// ============================================
// Export Types
// ============================================

export type { CommandsAPI, CommandHandler, CommandOptions }
