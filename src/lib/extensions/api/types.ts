/**
 * Extension Client API Types
 * 
 * Defines the sandboxed API available to extensions running in the Extension Host.
 * Extensions cannot directly access BluePLM internals - all operations go through
 * this controlled, permission-gated interface via IPC.
 * 
 * @module extensions/api/types
 */

// ============================================
// Core Types
// ============================================

/**
 * Disposable pattern for resource cleanup (VS Code pattern).
 * Objects implementing this interface can release resources when disposed.
 */
export interface Disposable {
  /**
   * Dispose of the resource.
   * After calling dispose, the resource should not be used.
   */
  dispose(): void
}

/**
 * Creates a Disposable from a cleanup function.
 * 
 * @example
 * ```typescript
 * const unsubscribe = api.events.on('myEvent', handler)
 * return toDisposable(unsubscribe)
 * ```
 */
export function toDisposable(fn: () => void): Disposable {
  return { dispose: fn }
}

// ============================================
// UI Types
// ============================================

/**
 * Toast notification types for visual feedback.
 */
export type ToastType = 'success' | 'error' | 'info' | 'warning'

/**
 * Options for displaying a dialog.
 */
export interface DialogOptions {
  /** Dialog title */
  title: string
  /** Dialog message/body content */
  message: string
  /** Dialog type affects icon and styling */
  type?: 'info' | 'warning' | 'error' | 'confirm'
  /** Primary action button text (default: "OK") */
  confirmText?: string
  /** Secondary action button text (default: "Cancel" for confirm dialogs) */
  cancelText?: string
  /** Whether the dialog can be dismissed by clicking outside */
  dismissible?: boolean
}

/**
 * Result from a dialog interaction.
 */
export interface DialogResult {
  /** Whether the user confirmed (clicked primary button) */
  confirmed: boolean
  /** Whether the dialog was dismissed without action */
  dismissed: boolean
}

/**
 * Extension connection status indicators.
 */
export type ConnectionStatus = 'online' | 'offline' | 'partial' | 'checking'

/**
 * Options for progress indicator display.
 */
export interface ProgressOptions {
  /** Title shown in the progress UI */
  title: string
  /** Whether the user can cancel the operation */
  cancellable?: boolean
  /** Location of the progress indicator */
  location?: 'notification' | 'statusbar'
}

/**
 * Interface for reporting progress during an operation.
 */
export interface Progress {
  /**
   * Report progress update.
   * 
   * @example
   * ```typescript
   * progress.report({ message: 'Syncing files...', increment: 10 })
   * ```
   */
  report(value: { 
    /** Current step message */
    message?: string
    /** Percentage increment (0-100) to add to current progress */
    increment?: number 
  }): void
}

/**
 * Cancellation token for cancellable operations.
 */
export interface CancellationToken {
  /** Whether cancellation was requested */
  readonly isCancellationRequested: boolean
  /** Event fired when cancellation is requested */
  onCancellationRequested: (callback: () => void) => Disposable
}

/**
 * Item in a quick pick list.
 */
export interface QuickPickItem {
  /** Primary label shown for the item */
  label: string
  /** Optional secondary text (shown dimmer, to the right) */
  description?: string
  /** Optional detail text (shown below label) */
  detail?: string
  /** Whether this item is pre-selected */
  picked?: boolean
  /** Custom data attached to this item */
  data?: unknown
  /** Icon name (Lucide icon) */
  iconId?: string
}

/**
 * Options for quick pick display.
 */
export interface QuickPickOptions {
  /** Title of the quick pick */
  title?: string
  /** Placeholder text shown when empty */
  placeholder?: string
  /** Whether multiple items can be selected */
  canPickMany?: boolean
  /** Whether to match on description as well as label */
  matchOnDescription?: boolean
  /** Whether to match on detail as well as label */
  matchOnDetail?: boolean
}

/**
 * Options for input box display.
 */
export interface InputBoxOptions {
  /** Title of the input box */
  title?: string
  /** Placeholder text shown when empty */
  placeholder?: string
  /** Initial value */
  value?: string
  /** Selection start index (for pre-selecting text) */
  valueSelection?: [number, number]
  /** Whether to mask input (password field) */
  password?: boolean
  /** Prompt text shown above input */
  prompt?: string
  /**
   * Validation function. Return error message string if invalid,
   * undefined if valid.
   */
  validateInput?: (value: string) => string | undefined | Promise<string | undefined>
}

// ============================================
// Storage Types
// ============================================

/**
 * Storage API provides extension-scoped persistent storage.
 * Data is isolated per extension - extensions cannot access each other's data.
 */
export interface ExtensionStorage {
  /**
   * Get a value from storage.
   * 
   * @param key - The key to retrieve
   * @returns The stored value, or undefined if not found
   * 
   * @example
   * ```typescript
   * const lastSync = await api.storage.get<number>('lastSyncTime')
   * ```
   */
  get<T>(key: string): Promise<T | undefined>

  /**
   * Set a value in storage.
   * 
   * @param key - The key to store under
   * @param value - The value to store (must be JSON-serializable)
   * 
   * @example
   * ```typescript
   * await api.storage.set('lastSyncTime', Date.now())
   * ```
   */
  set<T>(key: string, value: T): Promise<void>

  /**
   * Delete a value from storage.
   * 
   * @param key - The key to delete
   */
  delete(key: string): Promise<void>

  /**
   * List all keys in storage.
   * 
   * @returns Array of all stored keys
   */
  keys(): Promise<string[]>

  /**
   * Check if a key exists in storage.
   * 
   * @param key - The key to check
   */
  has(key: string): Promise<boolean>

  /**
   * Clear all data from storage.
   * Use with caution - this cannot be undone.
   */
  clear(): Promise<void>
}

// ============================================
// Network Types
// ============================================

/**
 * Allowed HTTP methods for fetch requests.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/**
 * Options for making HTTP requests.
 */
export interface FetchOptions {
  /** HTTP method (default: GET) */
  method?: HttpMethod
  /** Request headers */
  headers?: Record<string, string>
  /** Request body (will be JSON-stringified if object) */
  body?: unknown
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** AbortController signal for cancellation */
  signal?: AbortSignal
}

/**
 * Response from an HTTP request.
 */
export interface FetchResponse<T = unknown> {
  /** HTTP status code */
  status: number
  /** HTTP status text */
  statusText: string
  /** Response headers */
  headers: Record<string, string>
  /** Response body (parsed if JSON) */
  data: T
  /** Whether the response was successful (2xx status) */
  ok: boolean
}

// ============================================
// Command Types
// ============================================

/**
 * Handler function for a registered command.
 */
export type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>

/**
 * Command registration options.
 */
export interface CommandOptions {
  /** Whether the command should be hidden from command palette */
  hidden?: boolean
  /** Human-readable title for command palette */
  title?: string
  /** Category for grouping in command palette */
  category?: string
}

/**
 * Commands API for registering and executing commands.
 */
export interface CommandsAPI {
  /**
   * Register a command handler.
   * 
   * @param id - Unique command ID (should be namespaced, e.g., 'myext.doSomething')
   * @param handler - Function to execute when command is invoked
   * @param options - Optional command metadata
   * @returns Disposable to unregister the command
   * 
   * @example
   * ```typescript
   * context.subscriptions.push(
   *   api.commands.registerCommand('google-drive.sync', async () => {
   *     await performSync()
   *   })
   * )
   * ```
   */
  registerCommand(id: string, handler: CommandHandler, options?: CommandOptions): Disposable

  /**
   * Execute a registered command.
   * 
   * @param id - Command ID to execute
   * @param args - Arguments to pass to the command handler
   * @returns Result from the command handler
   * 
   * @example
   * ```typescript
   * const result = await api.commands.executeCommand<SyncResult>('google-drive.sync', { force: true })
   * ```
   */
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>

  /**
   * Get list of all registered command IDs.
   */
  getCommands(): Promise<string[]>
}

// ============================================
// Workspace Types
// ============================================

/**
 * Type of file change event.
 */
export type FileChangeType = 'created' | 'changed' | 'deleted'

/**
 * Event fired when files change in the workspace.
 */
export interface FileChangeEvent {
  /** Type of change */
  type: FileChangeType
  /** File path relative to vault root */
  path: string
  /** ID of the vault containing the file */
  vaultId: string
}

/**
 * Information about an open file in the workspace.
 */
export interface OpenFile {
  /** File path relative to vault root */
  path: string
  /** ID of the vault containing the file */
  vaultId: string
  /** Whether the file has unsaved changes */
  isDirty?: boolean
  /** File extension */
  extension?: string
}

/**
 * Basic vault information exposed to extensions.
 */
export interface VaultInfo {
  /** Unique vault ID */
  id: string
  /** Vault display name */
  name: string
  /** Local path to vault root */
  localPath: string
  /** Organization ID */
  orgId: string
}

/**
 * Workspace API for accessing workspace state.
 */
export interface WorkspaceAPI {
  /**
   * Subscribe to file change events.
   * 
   * @param callback - Function called when files change
   * @returns Disposable to unsubscribe
   * 
   * @example
   * ```typescript
   * context.subscriptions.push(
   *   api.workspace.onFileChanged((events) => {
   *     for (const event of events) {
   *       console.log(`File ${event.type}: ${event.path}`)
   *     }
   *   })
   * )
   * ```
   */
  onFileChanged(callback: (events: FileChangeEvent[]) => void): Disposable

  /**
   * Get list of currently open files.
   */
  getOpenFiles(): Promise<OpenFile[]>

  /**
   * Get the currently active vault.
   * 
   * @returns Current vault info, or undefined if no vault is active
   */
  getCurrentVault(): Promise<VaultInfo | undefined>

  /**
   * Get all configured vaults.
   */
  getVaults(): Promise<VaultInfo[]>
}

// ============================================
// Telemetry Types
// ============================================

/**
 * Properties that can be attached to telemetry events.
 * Values must be simple types for proper serialization.
 */
export type TelemetryProperties = Record<string, string | number | boolean>

/**
 * Telemetry API for anonymous, privacy-respecting analytics.
 * All telemetry is aggregated and anonymized.
 */
export interface TelemetryAPI {
  /**
   * Track a named event with optional properties.
   * 
   * @param name - Event name (should be descriptive, e.g., 'sync_completed')
   * @param properties - Optional key-value properties
   * 
   * @example
   * ```typescript
   * api.telemetry.trackEvent('sync_completed', { 
   *   fileCount: 42, 
   *   duration: 1500 
   * })
   * ```
   */
  trackEvent(name: string, properties?: TelemetryProperties): void

  /**
   * Track an error occurrence.
   * 
   * @param error - The error that occurred
   * @param context - Additional context about where/why the error occurred
   * 
   * @example
   * ```typescript
   * try {
   *   await riskyOperation()
   * } catch (error) {
   *   api.telemetry.trackError(error as Error, { operation: 'sync' })
   * }
   * ```
   */
  trackError(error: Error, context?: Record<string, string>): void

  /**
   * Track a timing measurement.
   * 
   * @param name - Name of the operation being timed
   * @param durationMs - Duration in milliseconds
   * 
   * @example
   * ```typescript
   * const start = performance.now()
   * await longOperation()
   * api.telemetry.trackTiming('long_operation', performance.now() - start)
   * ```
   */
  trackTiming(name: string, durationMs: number): void
}

// ============================================
// Events Types
// ============================================

/**
 * Extension events that can be subscribed to.
 */
export type ExtensionEvent = 
  | 'extension:activated'
  | 'extension:deactivating'
  | 'config:changed'
  | 'auth:changed'
  | 'vault:changed'
  | 'online:changed'

/**
 * Events API for subscribing to application events.
 */
export interface EventsAPI {
  /**
   * Subscribe to an application event.
   * 
   * @param event - Event name to subscribe to
   * @param callback - Function called when event fires
   * @returns Disposable to unsubscribe
   * 
   * @example
   * ```typescript
   * context.subscriptions.push(
   *   api.events.on('vault:changed', (vaultId) => {
   *     console.log('Vault changed to:', vaultId)
   *   })
   * )
   * ```
   */
  on(event: ExtensionEvent, callback: (...args: unknown[]) => void): Disposable

  /**
   * Emit an event (for extension-internal use).
   * Extensions can only emit events prefixed with their extension ID.
   * 
   * @param event - Event name
   * @param args - Arguments to pass to subscribers
   */
  emit(event: string, ...args: unknown[]): void
}

// ============================================
// Context Types
// ============================================

/**
 * User context available to extensions.
 */
export interface UserContext {
  /** User ID */
  id: string
  /** User email */
  email: string
  /** User display name */
  displayName?: string
}

/**
 * Organization context available to extensions.
 */
export interface OrganizationContext {
  /** Organization ID */
  id: string
  /** Organization name */
  name: string
}

/**
 * Read-only context information about the current session.
 */
export interface ExtensionContextInfo {
  /** Extension ID */
  extensionId: string
  /** Extension version */
  version: string
  /** Current user info (null if not authenticated) */
  user: UserContext | null
  /** Current organization info (null if no org selected) */
  organization: OrganizationContext | null
  /** Whether the app is currently online */
  isOnline: boolean
  /** App version */
  appVersion: string
  /** Platform (win32, darwin, linux) */
  platform: string
}

// ============================================
// UI API Interface
// ============================================

/**
 * UI API for user interface interactions.
 * All UI operations are sandboxed - extensions cannot directly manipulate the DOM.
 */
export interface UIAPI {
  /**
   * Show a toast notification.
   * 
   * @param message - Message to display
   * @param type - Toast type (affects icon and color)
   * @param duration - Display duration in ms (default: 3000)
   * 
   * @example
   * ```typescript
   * api.ui.showToast('Sync completed!', 'success')
   * ```
   */
  showToast(message: string, type?: ToastType, duration?: number): void

  /**
   * Show a dialog and wait for user response.
   * 
   * @param options - Dialog configuration
   * @returns User's response
   * 
   * @example
   * ```typescript
   * const result = await api.ui.showDialog({
   *   title: 'Confirm Sync',
   *   message: 'This will overwrite local changes. Continue?',
   *   type: 'confirm'
   * })
   * if (result.confirmed) {
   *   // User clicked confirm
   * }
   * ```
   */
  showDialog(options: DialogOptions): Promise<DialogResult>

  /**
   * Set the extension's connection status indicator.
   * 
   * @param status - Current connection status
   * 
   * @example
   * ```typescript
   * api.ui.setStatus('checking')
   * const connected = await checkConnection()
   * api.ui.setStatus(connected ? 'online' : 'offline')
   * ```
   */
  setStatus(status: ConnectionStatus): void

  /**
   * Show a progress indicator while performing an operation.
   * 
   * @param options - Progress display options
   * @param task - Async function to execute
   * @returns Result from the task function
   * 
   * @example
   * ```typescript
   * const result = await api.ui.showProgress(
   *   { title: 'Syncing files...' },
   *   async (progress) => {
   *     for (let i = 0; i < files.length; i++) {
   *       await syncFile(files[i])
   *       progress.report({ 
   *         message: `Syncing ${files[i].name}`,
   *         increment: 100 / files.length 
   *       })
   *     }
   *     return { syncedCount: files.length }
   *   }
   * )
   * ```
   */
  showProgress<T>(
    options: ProgressOptions,
    task: (progress: Progress, token: CancellationToken) => Promise<T>
  ): Promise<T>

  /**
   * Show a quick pick list for user selection.
   * 
   * @param items - Items to display
   * @param options - Display options
   * @returns Selected item(s), or undefined if cancelled
   * 
   * @example
   * ```typescript
   * const selected = await api.ui.showQuickPick([
   *   { label: 'Option A', description: 'First option' },
   *   { label: 'Option B', description: 'Second option' }
   * ], { title: 'Select an option' })
   * 
   * if (selected) {
   *   console.log('User selected:', selected.label)
   * }
   * ```
   */
  showQuickPick(
    items: QuickPickItem[],
    options?: QuickPickOptions
  ): Promise<QuickPickItem | QuickPickItem[] | undefined>

  /**
   * Show an input box for user text input.
   * 
   * @param options - Input box options
   * @returns User input, or undefined if cancelled
   * 
   * @example
   * ```typescript
   * const name = await api.ui.showInputBox({
   *   title: 'Enter configuration name',
   *   placeholder: 'my-config',
   *   validateInput: (value) => {
   *     if (!value) return 'Name is required'
   *     if (!/^[a-z0-9-]+$/.test(value)) return 'Only lowercase letters, numbers, and hyphens allowed'
   *     return undefined
   *   }
   * })
   * ```
   */
  showInputBox(options?: InputBoxOptions): Promise<string | undefined>
}

// ============================================
// Network API Interface
// ============================================

/**
 * Network API for making HTTP requests.
 * All requests are logged and subject to declared domain restrictions.
 */
export interface NetworkAPI {
  /**
   * Call the organization's API server.
   * Automatically includes authentication headers.
   * 
   * @param endpoint - API endpoint path (e.g., '/extensions/my-ext/sync')
   * @param options - Request options
   * @returns Response from the API
   * 
   * @example
   * ```typescript
   * const response = await api.callOrgApi<SyncResult>('/extensions/google-drive/sync', {
   *   method: 'POST',
   *   body: { vaultId: 'xxx' }
   * })
   * ```
   */
  callOrgApi<T>(endpoint: string, options?: FetchOptions): Promise<FetchResponse<T>>

  /**
   * Call the Extension Store API.
   * Used for marketplace operations.
   * 
   * @param endpoint - Store API endpoint path
   * @returns Response from the store API
   */
  callStoreApi<T>(endpoint: string): Promise<FetchResponse<T>>

  /**
   * Make an HTTP request to an external URL.
   * Only allowed to domains declared in extension manifest.
   * 
   * @param url - Full URL to fetch
   * @param options - Request options
   * @returns Response from the request
   * 
   * @example
   * ```typescript
   * // Requires 'http:domain:api.example.com' permission in manifest
   * const response = await api.fetch<ExternalData>(
   *   'https://api.example.com/data',
   *   { method: 'GET' }
   * )
   * ```
   */
  fetch<T>(url: string, options?: FetchOptions): Promise<FetchResponse<T>>
}

// ============================================
// Main Extension Client API Interface
// ============================================

/**
 * The complete Extension Client API interface.
 * This is the primary API surface available to extensions running in the Extension Host.
 * All operations are sandboxed and permission-gated.
 * 
 * @example
 * ```typescript
 * import type { ExtensionContext, ExtensionClientAPI } from '@blueplm/extension-api'
 * 
 * export async function activate(context: ExtensionContext, api: ExtensionClientAPI) {
 *   // Register a command
 *   context.subscriptions.push(
 *     api.commands.registerCommand('myext.hello', () => {
 *       api.ui.showToast('Hello from my extension!', 'success')
 *     })
 *   )
 *   
 *   // Subscribe to events
 *   context.subscriptions.push(
 *     api.workspace.onFileChanged((events) => {
 *       console.log('Files changed:', events)
 *     })
 *   )
 * }
 * 
 * export function deactivate() {
 *   // Cleanup (subscriptions are auto-disposed)
 * }
 * ```
 */
export interface ExtensionClientAPI {
  /**
   * UI operations for user interaction.
   * Requires appropriate ui:* permissions.
   */
  ui: UIAPI

  /**
   * Extension-scoped local storage.
   * Requires 'storage:local' permission.
   */
  storage: ExtensionStorage

  /**
   * Network operations.
   * Requires appropriate network:* permissions.
   */
  callOrgApi: NetworkAPI['callOrgApi']
  callStoreApi: NetworkAPI['callStoreApi']
  fetch: NetworkAPI['fetch']

  /**
   * Command registration and execution.
   * Requires 'commands:*' permissions.
   */
  commands: CommandsAPI

  /**
   * Workspace information and events.
   * Requires 'workspace:*' permissions.
   */
  workspace: WorkspaceAPI

  /**
   * Event subscription system.
   */
  events: EventsAPI

  /**
   * Anonymous telemetry for analytics.
   * Requires 'telemetry' permission.
   */
  telemetry: TelemetryAPI

  /**
   * Read-only context information.
   */
  context: ExtensionContextInfo
}

// ============================================
// Export Permission Types
// ============================================

/**
 * Client-side permissions that extensions can request.
 */
export type ClientPermission =
  | 'ui:toast'
  | 'ui:dialog'
  | 'ui:status'
  | 'ui:progress'
  | 'storage:local'
  | 'network:orgApi'
  | 'network:storeApi'
  | 'network:fetch'
  | 'commands:register'
  | 'commands:execute'
  | 'workspace:files'
  | 'telemetry'

/**
 * Map of API methods to required permissions.
 */
export const API_PERMISSIONS: Record<string, ClientPermission[]> = {
  // UI
  'ui.showToast': ['ui:toast'],
  'ui.showDialog': ['ui:dialog'],
  'ui.setStatus': ['ui:status'],
  'ui.showProgress': ['ui:progress'],
  'ui.showQuickPick': ['ui:dialog'],
  'ui.showInputBox': ['ui:dialog'],
  
  // Storage
  'storage.get': ['storage:local'],
  'storage.set': ['storage:local'],
  'storage.delete': ['storage:local'],
  'storage.keys': ['storage:local'],
  'storage.has': ['storage:local'],
  'storage.clear': ['storage:local'],
  
  // Network
  'callOrgApi': ['network:orgApi'],
  'callStoreApi': ['network:storeApi'],
  'fetch': ['network:fetch'],
  
  // Commands
  'commands.registerCommand': ['commands:register'],
  'commands.executeCommand': ['commands:execute'],
  'commands.getCommands': [],
  
  // Workspace
  'workspace.onFileChanged': ['workspace:files'],
  'workspace.getOpenFiles': ['workspace:files'],
  'workspace.getCurrentVault': [],
  'workspace.getVaults': [],
  
  // Events
  'events.on': [],
  'events.emit': [],
  
  // Telemetry
  'telemetry.trackEvent': ['telemetry'],
  'telemetry.trackError': ['telemetry'],
  'telemetry.trackTiming': ['telemetry'],
  
  // Context
  'context': [],
}

// Re-export for convenience
export type { FetchOptions as RequestInit }
