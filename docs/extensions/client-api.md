# Client API Reference

The Extension Client API (`ExtensionClientAPI`) is the primary interface for extensions running in the Extension Host. All operations are sandboxed and permission-gated.

## Overview

```typescript
export async function activate(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  // api contains all available APIs
  api.ui          // UI operations
  api.storage     // Local storage
  api.commands    // Command registration
  api.workspace   // Workspace info
  api.events      // Event subscriptions
  api.telemetry   // Analytics
  api.context     // Read-only context
  api.callOrgApi  // Org API calls
  api.callStoreApi // Store API calls
  api.fetch       // External HTTP
}
```

---

## Extension Context

The `context` object is passed to your `activate` function.

### Properties

```typescript
interface ExtensionContext {
  extensionId: string       // Your extension ID
  extensionPath: string     // Absolute path to extension files
  storagePath: string       // Path for extension data
  subscriptions: Disposable[] // Auto-disposed on deactivate
  log: ExtensionLogger      // Scoped logger
  manifest: ExtensionManifest // Your manifest
  state: ExtensionState     // Current state
}
```

### context.subscriptions

Push `Disposable` objects here for automatic cleanup when the extension deactivates:

```typescript
export async function activate(context, api) {
  // These are automatically disposed when extension deactivates
  context.subscriptions.push(
    api.commands.registerCommand('myext.cmd', handler),
    api.workspace.onFileChanged(fileHandler),
    api.events.on('vault:changed', vaultHandler)
  )
}
```

### context.log

Scoped logger with extension prefix:

```typescript
context.log.debug('Debug message')   // Development only
context.log.info('Info message')     // General info
context.log.warn('Warning message')  // Warnings
context.log.error('Error message')   // Errors
```

---

## UI API

**Permission required:** Various `ui:*` permissions

### ui.showToast

Display a brief notification message.

```typescript
api.ui.showToast(
  message: string,
  type?: 'success' | 'error' | 'info' | 'warning',
  duration?: number
): void
```

**Permission:** `ui:toast`

**Example:**
```typescript
api.ui.showToast('File saved!', 'success')
api.ui.showToast('Connection failed', 'error', 5000) // 5 seconds
```

---

### ui.showDialog

Display a modal dialog and wait for user response.

```typescript
api.ui.showDialog(options: DialogOptions): Promise<DialogResult>

interface DialogOptions {
  title: string
  message: string
  type?: 'info' | 'warning' | 'error' | 'confirm'
  confirmText?: string   // Default: "OK"
  cancelText?: string    // Default: "Cancel"
  dismissible?: boolean  // Click outside to close
}

interface DialogResult {
  confirmed: boolean
  dismissed: boolean
}
```

**Permission:** `ui:dialog`

**Example:**
```typescript
const result = await api.ui.showDialog({
  title: 'Confirm Delete',
  message: 'Are you sure you want to delete this file?',
  type: 'confirm',
  confirmText: 'Delete',
  cancelText: 'Keep'
})

if (result.confirmed) {
  await deleteFile()
}
```

---

### ui.setStatus

Set the extension's status indicator in the UI.

```typescript
api.ui.setStatus(status: 'online' | 'offline' | 'partial' | 'checking'): void
```

**Permission:** `ui:status`

**Example:**
```typescript
api.ui.setStatus('checking')
const connected = await checkConnection()
api.ui.setStatus(connected ? 'online' : 'offline')
```

---

### ui.showProgress

Show a progress indicator while performing an operation.

```typescript
api.ui.showProgress<T>(
  options: ProgressOptions,
  task: (progress: Progress, token: CancellationToken) => Promise<T>
): Promise<T>

interface ProgressOptions {
  title: string
  cancellable?: boolean
  location?: 'notification' | 'statusbar'
}

interface Progress {
  report(value: { message?: string; increment?: number }): void
}

interface CancellationToken {
  readonly isCancellationRequested: boolean
  onCancellationRequested: (callback: () => void) => Disposable
}
```

**Permission:** `ui:progress`

**Example:**
```typescript
const result = await api.ui.showProgress(
  { title: 'Syncing files...', cancellable: true },
  async (progress, token) => {
    const files = await getFiles()
    
    for (let i = 0; i < files.length; i++) {
      if (token.isCancellationRequested) {
        return { cancelled: true, synced: i }
      }
      
      progress.report({
        message: `Syncing ${files[i].name}...`,
        increment: 100 / files.length
      })
      
      await syncFile(files[i])
    }
    
    return { cancelled: false, synced: files.length }
  }
)
```

---

### ui.showQuickPick

Display a searchable selection list.

```typescript
api.ui.showQuickPick(
  items: QuickPickItem[],
  options?: QuickPickOptions
): Promise<QuickPickItem | QuickPickItem[] | undefined>

interface QuickPickItem {
  label: string
  description?: string   // Shown dimmer, to the right
  detail?: string        // Shown below label
  picked?: boolean       // Pre-selected
  data?: unknown         // Custom data
  iconId?: string        // Lucide icon name
}

interface QuickPickOptions {
  title?: string
  placeholder?: string
  canPickMany?: boolean
  matchOnDescription?: boolean
  matchOnDetail?: boolean
}
```

**Permission:** `ui:dialog`

**Example:**
```typescript
const selected = await api.ui.showQuickPick([
  { label: 'Production', description: 'Main environment', data: 'prod' },
  { label: 'Staging', description: 'Test environment', data: 'staging' },
  { label: 'Development', description: 'Local dev', data: 'dev' }
], {
  title: 'Select Environment',
  placeholder: 'Choose deployment target...'
})

if (selected) {
  console.log('Selected:', selected.data)
}
```

**Multi-select:**
```typescript
const selected = await api.ui.showQuickPick(items, { canPickMany: true })
if (selected && Array.isArray(selected)) {
  console.log('Selected:', selected.map(s => s.label))
}
```

---

### ui.showInputBox

Display a text input dialog.

```typescript
api.ui.showInputBox(options?: InputBoxOptions): Promise<string | undefined>

interface InputBoxOptions {
  title?: string
  placeholder?: string
  value?: string           // Initial value
  valueSelection?: [number, number]  // Selection range
  password?: boolean       // Mask input
  prompt?: string          // Text above input
  validateInput?: (value: string) => string | undefined | Promise<string | undefined>
}
```

**Permission:** `ui:dialog`

**Example:**
```typescript
const projectName = await api.ui.showInputBox({
  title: 'New Project',
  placeholder: 'my-project',
  prompt: 'Enter project name (lowercase, no spaces)',
  validateInput: (value) => {
    if (!value) return 'Name is required'
    if (!/^[a-z0-9-]+$/.test(value)) {
      return 'Only lowercase letters, numbers, and hyphens'
    }
    return undefined // Valid
  }
})

if (projectName) {
  await createProject(projectName)
}
```

**Password input:**
```typescript
const apiKey = await api.ui.showInputBox({
  title: 'API Key',
  password: true,
  prompt: 'Enter your API key'
})
```

---

## Storage API

**Permission required:** `storage:local`

Extension-scoped persistent storage. Data is isolated per extension.

### storage.get

```typescript
api.storage.get<T>(key: string): Promise<T | undefined>
```

**Example:**
```typescript
const lastSync = await api.storage.get<number>('lastSyncTime')
const settings = await api.storage.get<Settings>('userSettings')
```

---

### storage.set

```typescript
api.storage.set<T>(key: string, value: T): Promise<void>
```

Values must be JSON-serializable.

**Example:**
```typescript
await api.storage.set('lastSyncTime', Date.now())
await api.storage.set('userSettings', { theme: 'dark', autoSync: true })
```

---

### storage.delete

```typescript
api.storage.delete(key: string): Promise<void>
```

**Example:**
```typescript
await api.storage.delete('cachedData')
```

---

### storage.keys

```typescript
api.storage.keys(): Promise<string[]>
```

**Example:**
```typescript
const allKeys = await api.storage.keys()
// ['lastSyncTime', 'userSettings', 'cachedData']
```

---

### storage.has

```typescript
api.storage.has(key: string): Promise<boolean>
```

**Example:**
```typescript
if (await api.storage.has('userSettings')) {
  // Load existing settings
}
```

---

### storage.clear

```typescript
api.storage.clear(): Promise<void>
```

**Warning:** This deletes ALL extension data. Use with caution.

---

## Commands API

### commands.registerCommand

Register a command handler.

```typescript
api.commands.registerCommand(
  id: string,
  handler: (...args: unknown[]) => unknown | Promise<unknown>,
  options?: CommandOptions
): Disposable
```

**Permission:** `commands:register`

**Example:**
```typescript
context.subscriptions.push(
  api.commands.registerCommand('myext.greet', (name: string) => {
    api.ui.showToast(`Hello, ${name}!`, 'info')
  })
)
```

---

### commands.executeCommand

Execute a registered command.

```typescript
api.commands.executeCommand<T>(id: string, ...args: unknown[]): Promise<T>
```

**Permission:** `commands:execute`

**Example:**
```typescript
// Execute your own command
await api.commands.executeCommand('myext.greet', 'World')

// Execute another extension's command (if permitted)
const result = await api.commands.executeCommand<SyncResult>('other-ext.sync')
```

---

### commands.getCommands

Get all registered command IDs.

```typescript
api.commands.getCommands(): Promise<string[]>
```

**Example:**
```typescript
const commands = await api.commands.getCommands()
// ['myext.greet', 'myext.sync', 'core.save', ...]
```

---

## Workspace API

### workspace.onFileChanged

Subscribe to file change events.

```typescript
api.workspace.onFileChanged(
  callback: (events: FileChangeEvent[]) => void
): Disposable

interface FileChangeEvent {
  type: 'created' | 'changed' | 'deleted'
  path: string       // Relative to vault root
  vaultId: string
}
```

**Permission:** `workspace:files`

**Example:**
```typescript
context.subscriptions.push(
  api.workspace.onFileChanged((events) => {
    for (const event of events) {
      console.log(`${event.type}: ${event.path}`)
      
      if (event.type === 'changed' && event.path.endsWith('.sldprt')) {
        // SolidWorks file modified
        scheduleSync(event.vaultId, event.path)
      }
    }
  })
)
```

---

### workspace.getOpenFiles

Get currently open files.

```typescript
api.workspace.getOpenFiles(): Promise<OpenFile[]>

interface OpenFile {
  path: string
  vaultId: string
  isDirty?: boolean   // Has unsaved changes
  extension?: string
}
```

**Permission:** `workspace:files`

---

### workspace.getCurrentVault

Get the currently active vault.

```typescript
api.workspace.getCurrentVault(): Promise<VaultInfo | undefined>

interface VaultInfo {
  id: string
  name: string
  localPath: string
  orgId: string
}
```

**Example:**
```typescript
const vault = await api.workspace.getCurrentVault()
if (vault) {
  console.log(`Current vault: ${vault.name} at ${vault.localPath}`)
}
```

---

### workspace.getVaults

Get all configured vaults.

```typescript
api.workspace.getVaults(): Promise<VaultInfo[]>
```

**Permission:** `workspace:vaults`

---

## Events API

### events.on

Subscribe to application events.

```typescript
api.events.on(
  event: ExtensionEvent,
  callback: (...args: unknown[]) => void
): Disposable

type ExtensionEvent =
  | 'extension:activated'
  | 'extension:deactivating'
  | 'config:changed'
  | 'auth:changed'
  | 'vault:changed'
  | 'online:changed'
```

**Example:**
```typescript
context.subscriptions.push(
  api.events.on('vault:changed', (newVaultId: string) => {
    console.log('Vault changed to:', newVaultId)
    refreshExtensionState()
  }),
  
  api.events.on('online:changed', (isOnline: boolean) => {
    api.ui.setStatus(isOnline ? 'online' : 'offline')
  }),
  
  api.events.on('config:changed', () => {
    // Reload configuration
    loadSettings()
  })
)
```

---

### events.emit

Emit custom events (prefixed with extension ID).

```typescript
api.events.emit(event: string, ...args: unknown[]): void
```

**Example:**
```typescript
// Only works for events prefixed with your extension ID
api.events.emit('myext.customEvent', { data: 'value' })
```

---

## Network API

### callOrgApi

Call the organization's API server (authenticated).

```typescript
api.callOrgApi<T>(
  endpoint: string,
  options?: FetchOptions
): Promise<FetchResponse<T>>

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
}

interface FetchResponse<T> {
  status: number
  statusText: string
  headers: Record<string, string>
  data: T
  ok: boolean
}
```

**Permission:** `network:orgApi`

**Example:**
```typescript
// Call your extension's server handler
const response = await api.callOrgApi<SyncResult>('/extensions/myext/sync', {
  method: 'POST',
  body: { vaultId: 'xxx', force: true }
})

if (response.ok) {
  console.log('Synced:', response.data.fileCount)
} else {
  console.error('Error:', response.data)
}
```

---

### callStoreApi

Call the Extension Store API.

```typescript
api.callStoreApi<T>(endpoint: string): Promise<FetchResponse<T>>
```

**Permission:** `network:storeApi`

**Example:**
```typescript
const response = await api.callStoreApi<Extension>('/store/extensions/blueplm.my-extension')
console.log('Latest version:', response.data.latestVersion)
```

---

### fetch

Make HTTP requests to external URLs.

```typescript
api.fetch<T>(url: string, options?: FetchOptions): Promise<FetchResponse<T>>
```

**Permission:** `network:fetch` AND declared domains in manifest

**Manifest requirement:**
```json
"permissions": {
  "client": ["network:fetch"],
  "server": ["http:domain:api.example.com"]
}
```

**Example:**
```typescript
const response = await api.fetch<WeatherData>('https://api.example.com/weather', {
  method: 'GET',
  headers: { 'Authorization': 'Bearer xxx' }
})
```

**Note:** Can only access domains declared in your manifest's permissions.

---

## Telemetry API

**Permission required:** `telemetry`

Anonymous, privacy-respecting analytics.

### telemetry.trackEvent

Track a named event.

```typescript
api.telemetry.trackEvent(
  name: string,
  properties?: Record<string, string | number | boolean>
): void
```

**Example:**
```typescript
api.telemetry.trackEvent('sync_completed', {
  fileCount: 42,
  duration: 1500,
  usedCache: true
})
```

---

### telemetry.trackError

Track an error occurrence.

```typescript
api.telemetry.trackError(
  error: Error,
  context?: Record<string, string>
): void
```

**Example:**
```typescript
try {
  await riskyOperation()
} catch (error) {
  api.telemetry.trackError(error as Error, {
    operation: 'sync',
    vaultId: 'xxx'
  })
}
```

---

### telemetry.trackTiming

Track a timing measurement.

```typescript
api.telemetry.trackTiming(name: string, durationMs: number): void
```

**Example:**
```typescript
const start = performance.now()
await longOperation()
api.telemetry.trackTiming('longOperation', performance.now() - start)
```

---

## Context API

Read-only context information about the current session.

```typescript
interface ExtensionContextInfo {
  extensionId: string
  version: string
  user: UserContext | null
  organization: OrganizationContext | null
  isOnline: boolean
  appVersion: string
  platform: 'win32' | 'darwin' | 'linux'
}

interface UserContext {
  id: string
  email: string
  displayName?: string
}

interface OrganizationContext {
  id: string
  name: string
}
```

**Example:**
```typescript
const { user, organization, platform } = api.context

if (user) {
  console.log(`User: ${user.email}`)
}

if (platform === 'win32') {
  // Windows-specific logic
}
```

---

## Complete Example

```typescript
import type { ExtensionContext, ExtensionClientAPI } from '@blueplm/extension-api'

export async function activate(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  context.log.info('Extension activating...')

  // Register commands
  context.subscriptions.push(
    api.commands.registerCommand('myext.sync', async () => {
      await syncWithProgress(api)
    }),
    
    api.commands.registerCommand('myext.configure', async () => {
      const endpoint = await api.ui.showInputBox({
        title: 'API Endpoint',
        placeholder: 'https://api.example.com'
      })
      if (endpoint) {
        await api.storage.set('apiEndpoint', endpoint)
        api.ui.showToast('Configuration saved', 'success')
      }
    })
  )

  // Watch for file changes
  context.subscriptions.push(
    api.workspace.onFileChanged((events) => {
      const modified = events.filter(e => e.type !== 'deleted')
      if (modified.length > 0) {
        context.log.debug(`${modified.length} files changed`)
      }
    })
  )

  // Subscribe to events
  context.subscriptions.push(
    api.events.on('vault:changed', () => {
      context.log.info('Vault changed, refreshing...')
    })
  )

  // Set initial status
  api.ui.setStatus('online')
  api.ui.showToast('Extension ready!', 'success')
}

async function syncWithProgress(api: ExtensionClientAPI): Promise<void> {
  await api.ui.showProgress(
    { title: 'Syncing...', cancellable: true },
    async (progress, token) => {
      progress.report({ message: 'Connecting...' })
      
      const vault = await api.workspace.getCurrentVault()
      if (!vault) {
        api.ui.showToast('No vault selected', 'error')
        return
      }

      progress.report({ message: 'Syncing...', increment: 50 })

      const response = await api.callOrgApi('/extensions/myext/sync', {
        method: 'POST',
        body: { vaultId: vault.id }
      })

      if (response.ok) {
        api.ui.showToast('Sync complete!', 'success')
        api.telemetry.trackEvent('sync_completed')
      } else {
        api.ui.showToast('Sync failed', 'error')
      }
    }
  )
}

export function deactivate(): void {
  // Cleanup (subscriptions are auto-disposed)
}
```

---

**[← Manifest Reference](./manifest.md)** | **[Server API Reference →](./server-api.md)**
