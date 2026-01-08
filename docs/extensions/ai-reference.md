# BluePLM Extension Complete Reference for AI

> **Purpose:** This consolidated reference is specifically designed for AI assistants generating BluePLM extensions. It contains all essential information in a single document to minimize context switching.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Extension Structure](#extension-structure)
3. [Manifest Schema](#manifest-schema)
4. [Client API](#client-api)
5. [Server API](#server-api)
6. [Complete Code Templates](#complete-code-templates)
7. [Common Patterns](#common-patterns)
8. [Checklist](#checklist)

---

## Architecture Overview

### Execution Environments

| Environment | Runtime | Purpose |
|-------------|---------|---------|
| **Extension Host** | Electron renderer (sandboxed) | Client-side UI, commands, local storage |
| **V8 Isolate** | Server-side sandbox | Database, secrets, external HTTP |

### Key Constraints

- **Client code**: No Node.js APIs, no direct DOM access, no Supabase access
- **Server code**: No Node.js APIs, 128MB memory limit, 30s timeout
- **HTTP requests**: Only to declared domains
- **All operations**: Async via IPC, permission-gated

---

## Extension Structure

### Directory Layout

```
my-extension/
├── extension.json          # Manifest (REQUIRED)
├── README.md               # Documentation
├── LICENSE                 # Open source license (REQUIRED)
├── icon.png                # 128x128 icon
├── client/                 # Client-side code
│   ├── index.ts            # Entry: activate(context, api), deactivate()
│   └── components/         # React components
│       ├── Panel.tsx
│       └── Settings.tsx
└── server/                 # Server-side handlers
    ├── sync.ts
    └── status.ts
```

### Entry Point Exports

```typescript
// client/index.ts - REQUIRED exports

import type { ExtensionContext, ExtensionClientAPI } from '@blueplm/extension-api'

/**
 * Called when extension is activated.
 * @param context - Extension context with lifecycle utilities
 * @param api - Client API for UI, storage, commands, etc.
 */
export async function activate(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  // Initialization code
}

/**
 * Called when extension is deactivated (optional).
 * Subscriptions in context.subscriptions are auto-disposed.
 */
export function deactivate(): void {
  // Cleanup code (optional)
}
```

---

## Manifest Schema

### Complete Example

```json
{
  "$schema": "https://blueplm.io/schemas/extension-v1.schema.json",
  "id": "publisher.extension-name",
  "name": "Display Name",
  "version": "1.0.0",
  "publisher": "publisher",
  "description": "What this extension does",
  "icon": "icon.png",
  "repository": "https://github.com/org/repo",
  "license": "MIT",
  "keywords": ["sync", "integration"],
  "categories": ["sync"],
  "category": "sandboxed",
  "engines": { "blueplm": "^1.0.0" },
  "main": "client/index.js",
  "serverMain": "server/index.js",
  "activationEvents": [
    "onExtensionEnabled",
    "onCommand:myext.sync"
  ],
  "contributes": {
    "views": [
      {
        "id": "myext.panel",
        "name": "My Extension",
        "icon": "box",
        "location": "panel",
        "component": "client/components/Panel.js"
      }
    ],
    "commands": [
      {
        "id": "myext.sync",
        "title": "Sync Now",
        "icon": "refresh-cw",
        "keybinding": "Ctrl+Shift+S",
        "category": "My Extension"
      }
    ],
    "settings": [
      {
        "id": "myext.settings",
        "name": "My Extension",
        "icon": "settings",
        "component": "client/components/Settings.js",
        "category": "extensions"
      }
    ],
    "apiRoutes": [
      { "method": "POST", "path": "sync", "handler": "server/sync.js" },
      { "method": "GET", "path": "status", "handler": "server/status.js" },
      { "method": "POST", "path": "webhook", "handler": "server/webhook.js", "public": true }
    ],
    "configuration": {
      "title": "My Extension",
      "properties": {
        "autoSync": {
          "type": "boolean",
          "default": true,
          "description": "Enable automatic sync"
        },
        "syncInterval": {
          "type": "number",
          "default": 300,
          "minimum": 60,
          "maximum": 3600,
          "description": "Sync interval in seconds"
        }
      }
    }
  },
  "permissions": {
    "client": [
      "ui:toast",
      "ui:dialog",
      "ui:progress",
      "storage:local",
      "network:orgApi",
      "commands:register",
      "workspace:files"
    ],
    "server": [
      "storage:database",
      "secrets:read",
      "secrets:write",
      "http:domain:api.example.com"
    ]
  }
}
```

### Required Fields

| Field | Format | Example |
|-------|--------|---------|
| `id` | `publisher.name` | `"mycompany.sync-tool"` |
| `name` | String (1-100 chars) | `"Sync Tool"` |
| `version` | Semver | `"1.0.0"` |
| `publisher` | Lowercase slug | `"mycompany"` |
| `license` | OSI identifier | `"MIT"` |
| `engines.blueplm` | Semver range | `"^1.0.0"` |
| `activationEvents` | Array (min 1) | `["onExtensionEnabled"]` |
| `contributes` | Object | `{}` |
| `permissions` | Object | `{ "client": [] }` |

### Activation Events

| Event | When Triggered |
|-------|----------------|
| `onExtensionEnabled` | User enables extension |
| `onStartup` | App starts |
| `onCommand:id` | Command executed |
| `onNavigate:route` | User navigates to route |
| `onView:id` | View opened |
| `onFileType:.ext` | File with extension opened |

### Client Permissions

```
ui:toast        - Show toast notifications
ui:dialog       - Show dialogs, quick pick, input box
ui:status       - Set status indicator
ui:progress     - Show progress bars
storage:local   - Extension-scoped storage
network:orgApi  - Call org API (authenticated)
network:storeApi- Call store API
network:fetch   - External HTTP (with domain restriction)
commands:register - Register commands
commands:execute  - Execute commands
workspace:files   - File change events
workspace:vaults  - Vault access
telemetry         - Anonymous analytics
```

### Server Permissions

```
storage:database    - Extension-scoped database storage
secrets:read        - Read encrypted secrets
secrets:write       - Write encrypted secrets
http:fetch          - External HTTP (any domain - use sparingly)
http:domain:X       - External HTTP to specific domain
```

---

## Client API

### ExtensionContext

```typescript
interface ExtensionContext {
  extensionId: string           // e.g., "mycompany.sync"
  extensionPath: string         // Absolute path to extension
  storagePath: string           // Path for extension data
  subscriptions: Disposable[]   // Auto-disposed on deactivate
  log: ExtensionLogger          // Scoped logger
  manifest: ExtensionManifest   // Parsed manifest
  state: ExtensionState         // Current state
}

interface ExtensionLogger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}
```

### ExtensionClientAPI

```typescript
interface ExtensionClientAPI {
  // UI
  ui: {
    showToast(message: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number): void
    showDialog(options: DialogOptions): Promise<DialogResult>
    setStatus(status: 'online' | 'offline' | 'partial' | 'checking'): void
    showProgress<T>(options: ProgressOptions, task: (progress: Progress, token: CancellationToken) => Promise<T>): Promise<T>
    showQuickPick(items: QuickPickItem[], options?: QuickPickOptions): Promise<QuickPickItem | undefined>
    showInputBox(options?: InputBoxOptions): Promise<string | undefined>
  }

  // Storage (extension-scoped, local)
  storage: {
    get<T>(key: string): Promise<T | undefined>
    set<T>(key: string, value: T): Promise<void>
    delete(key: string): Promise<void>
    keys(): Promise<string[]>
    has(key: string): Promise<boolean>
    clear(): Promise<void>
  }

  // Network
  callOrgApi<T>(endpoint: string, options?: FetchOptions): Promise<FetchResponse<T>>
  callStoreApi<T>(endpoint: string): Promise<FetchResponse<T>>
  fetch<T>(url: string, options?: FetchOptions): Promise<FetchResponse<T>>

  // Commands
  commands: {
    registerCommand(id: string, handler: (...args: unknown[]) => unknown): Disposable
    executeCommand<T>(id: string, ...args: unknown[]): Promise<T>
    getCommands(): Promise<string[]>
  }

  // Workspace
  workspace: {
    onFileChanged(callback: (events: FileChangeEvent[]) => void): Disposable
    getOpenFiles(): Promise<OpenFile[]>
    getCurrentVault(): Promise<VaultInfo | undefined>
    getVaults(): Promise<VaultInfo[]>
  }

  // Events
  events: {
    on(event: ExtensionEvent, callback: (...args: unknown[]) => void): Disposable
    emit(event: string, ...args: unknown[]): void
  }

  // Telemetry
  telemetry: {
    trackEvent(name: string, properties?: Record<string, string | number>): void
    trackError(error: Error, context?: Record<string, string>): void
    trackTiming(name: string, durationMs: number): void
  }

  // Context (read-only)
  context: {
    extensionId: string
    version: string
    user: { id: string; email: string } | null
    organization: { id: string; name: string } | null
    isOnline: boolean
    appVersion: string
    platform: 'win32' | 'darwin' | 'linux'
  }
}
```

### Supporting Types

```typescript
interface DialogOptions {
  title: string
  message: string
  type?: 'info' | 'warning' | 'error' | 'confirm'
  confirmText?: string
  cancelText?: string
}

interface DialogResult {
  confirmed: boolean
  dismissed: boolean
}

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

interface QuickPickItem {
  label: string
  description?: string
  detail?: string
  picked?: boolean
  data?: unknown
}

interface QuickPickOptions {
  title?: string
  placeholder?: string
  canPickMany?: boolean
}

interface InputBoxOptions {
  title?: string
  placeholder?: string
  value?: string
  password?: boolean
  validateInput?: (value: string) => string | undefined
}

interface FileChangeEvent {
  type: 'created' | 'changed' | 'deleted'
  path: string
  vaultId: string
}

interface VaultInfo {
  id: string
  name: string
  localPath: string
  orgId: string
}

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

interface Disposable {
  dispose(): void
}
```

---

## Server API

### ExtensionServerAPI

```typescript
interface ExtensionServerAPI {
  // Storage (extension-scoped, database)
  storage: {
    get<T>(key: string): Promise<T | undefined>
    set<T>(key: string, value: T): Promise<void>
    delete(key: string): Promise<void>
    list(prefix?: string): Promise<string[]>
  }

  // Secrets (encrypted, audited)
  secrets: {
    get(name: string): Promise<string | undefined>
    set(name: string, value: string): Promise<void>
    delete(name: string): Promise<void>
  }

  // HTTP (domain-restricted)
  http: {
    fetch(url: string, options?: RequestInit): Promise<SerializableResponse>
  }

  // Request context
  request: {
    method: string
    path: string
    body: unknown
    headers: Record<string, string>
    query: Record<string, string>
    params: Record<string, string>
  }

  // User context (null for public endpoints)
  user: {
    id: string
    email: string
    orgId: string
    role: string
  } | null

  // Response helpers
  response: {
    json(data: unknown, status?: number): ExtensionResponse
    error(message: string, status?: number): ExtensionResponse
    redirect(url: string, status?: number): ExtensionResponse
  }
}

interface SerializableResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}
```

### Server Handler Template

```typescript
// server/handler.ts
import type { ExtensionServerAPI } from '@blueplm/extension-api'

export default async function handler(api: ExtensionServerAPI) {
  const { request, user, storage, secrets, http, response } = api

  // Authentication check (skip for public endpoints)
  if (!user) {
    return response.error('Authentication required', 401)
  }

  try {
    // Your logic here
    
    return response.json({ success: true })
  } catch (error) {
    return response.error((error as Error).message, 500)
  }
}
```

---

## Complete Code Templates

### Template 1: Basic Extension with Command

```json
// extension.json
{
  "$schema": "https://blueplm.io/schemas/extension-v1.schema.json",
  "id": "mycompany.hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "publisher": "mycompany",
  "description": "A simple hello world extension",
  "license": "MIT",
  "engines": { "blueplm": "^1.0.0" },
  "main": "client/index.js",
  "activationEvents": ["onExtensionEnabled", "onCommand:hello-world.greet"],
  "contributes": {
    "commands": [
      {
        "id": "hello-world.greet",
        "title": "Say Hello",
        "category": "Hello World"
      }
    ]
  },
  "permissions": {
    "client": ["ui:toast", "commands:register"]
  }
}
```

```typescript
// client/index.ts
import type { ExtensionContext, ExtensionClientAPI } from '@blueplm/extension-api'

export async function activate(context: ExtensionContext, api: ExtensionClientAPI) {
  context.log.info('Hello World activating...')

  context.subscriptions.push(
    api.commands.registerCommand('hello-world.greet', () => {
      api.ui.showToast('Hello from my extension!', 'success')
    })
  )

  context.log.info('Hello World activated!')
}

export function deactivate() {}
```

---

### Template 2: Full Integration with Server

```json
// extension.json
{
  "$schema": "https://blueplm.io/schemas/extension-v1.schema.json",
  "id": "mycompany.cloud-sync",
  "name": "Cloud Sync",
  "version": "1.0.0",
  "publisher": "mycompany",
  "description": "Sync files with cloud storage",
  "icon": "icon.png",
  "repository": "https://github.com/mycompany/cloud-sync",
  "license": "MIT",
  "keywords": ["sync", "cloud", "backup"],
  "categories": ["sync"],
  "engines": { "blueplm": "^1.0.0" },
  "main": "client/index.js",
  "activationEvents": [
    "onExtensionEnabled",
    "onCommand:cloud-sync.syncNow"
  ],
  "contributes": {
    "commands": [
      {
        "id": "cloud-sync.syncNow",
        "title": "Sync Now",
        "icon": "refresh-cw",
        "keybinding": "Ctrl+Shift+S",
        "category": "Cloud Sync"
      }
    ],
    "settings": [
      {
        "id": "cloud-sync.settings",
        "name": "Cloud Sync",
        "description": "Configure cloud synchronization",
        "icon": "cloud",
        "component": "client/components/Settings.js",
        "category": "extensions"
      }
    ],
    "apiRoutes": [
      { "method": "POST", "path": "sync", "handler": "server/sync.js" },
      { "method": "GET", "path": "status", "handler": "server/status.js" },
      { "method": "POST", "path": "configure", "handler": "server/configure.js" }
    ],
    "configuration": {
      "title": "Cloud Sync",
      "properties": {
        "autoSync": {
          "type": "boolean",
          "default": true,
          "description": "Enable automatic synchronization"
        },
        "syncInterval": {
          "type": "number",
          "default": 300,
          "minimum": 60,
          "maximum": 3600,
          "description": "Sync interval in seconds"
        }
      }
    }
  },
  "permissions": {
    "client": [
      "ui:toast",
      "ui:dialog",
      "ui:status",
      "ui:progress",
      "storage:local",
      "network:orgApi",
      "commands:register",
      "workspace:files",
      "telemetry"
    ],
    "server": [
      "storage:database",
      "secrets:read",
      "secrets:write",
      "http:domain:api.cloudprovider.com"
    ]
  }
}
```

```typescript
// client/index.ts
import type { ExtensionContext, ExtensionClientAPI } from '@blueplm/extension-api'

let syncInterval: ReturnType<typeof setInterval> | undefined

export async function activate(context: ExtensionContext, api: ExtensionClientAPI) {
  context.log.info('Cloud Sync activating...')

  // Register sync command
  context.subscriptions.push(
    api.commands.registerCommand('cloud-sync.syncNow', async () => {
      await performSync(api, context)
    })
  )

  // Watch for file changes
  context.subscriptions.push(
    api.workspace.onFileChanged((events) => {
      context.log.debug(`${events.length} files changed`)
    })
  )

  // Set up auto-sync if enabled
  const autoSync = await api.storage.get<boolean>('autoSync')
  const interval = await api.storage.get<number>('syncInterval') ?? 300

  if (autoSync !== false) {
    syncInterval = setInterval(async () => {
      try {
        await performSync(api, context, true)
      } catch (error) {
        context.log.error('Auto-sync failed:', error)
      }
    }, interval * 1000)
  }

  // Set initial status
  api.ui.setStatus('online')
  context.log.info('Cloud Sync activated!')
}

export function deactivate() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = undefined
  }
}

async function performSync(
  api: ExtensionClientAPI,
  context: ExtensionContext,
  background = false
): Promise<void> {
  if (!background) {
    await api.ui.showProgress(
      { title: 'Syncing files...', cancellable: true },
      async (progress, token) => {
        await doSync(api, context, progress, token)
      }
    )
  } else {
    await doSync(api, context)
  }
}

async function doSync(
  api: ExtensionClientAPI,
  context: ExtensionContext,
  progress?: { report: (v: { message?: string; increment?: number }) => void },
  token?: { isCancellationRequested: boolean }
): Promise<void> {
  progress?.report({ message: 'Connecting...' })

  const vault = await api.workspace.getCurrentVault()
  if (!vault) {
    api.ui.showToast('No vault selected', 'error')
    return
  }

  if (token?.isCancellationRequested) return

  progress?.report({ message: 'Syncing...', increment: 20 })

  try {
    const response = await api.callOrgApi<{ fileCount: number }>('/extensions/cloud-sync/sync', {
      method: 'POST',
      body: { vaultId: vault.id }
    })

    if (response.ok) {
      progress?.report({ message: 'Complete!', increment: 80 })
      api.ui.showToast(`Synced ${response.data.fileCount} files`, 'success')
      api.telemetry.trackEvent('sync_completed', { fileCount: response.data.fileCount })
    } else {
      throw new Error('Sync failed')
    }
  } catch (error) {
    context.log.error('Sync error:', error)
    api.ui.showToast('Sync failed. Check logs for details.', 'error')
    api.telemetry.trackError(error as Error, { operation: 'sync' })
  }
}
```

```typescript
// server/sync.ts
import type { ExtensionServerAPI } from '@blueplm/extension-api'

interface SyncRequest {
  vaultId: string
  force?: boolean
}

export default async function handler(api: ExtensionServerAPI) {
  const { request, user, storage, secrets, http, response } = api

  if (!user) {
    return response.error('Authentication required', 401)
  }

  const body = request.body as SyncRequest
  if (!body.vaultId) {
    return response.error('vaultId is required', 400)
  }

  // Get API credentials
  const apiKey = await secrets.get('api_key')
  if (!apiKey) {
    return response.error('Extension not configured. Please set up API credentials.', 400)
  }

  try {
    // Get last sync time
    const lastSync = await storage.get<number>(`lastSync:${body.vaultId}`)

    // Call external API
    const externalResponse = await http.fetch('https://api.cloudprovider.com/sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vaultId: body.vaultId,
        since: lastSync ? new Date(lastSync).toISOString() : null,
        user: user.email
      })
    })

    if (!externalResponse.ok) {
      throw new Error(`External API error: ${externalResponse.body}`)
    }

    const result = JSON.parse(externalResponse.body)

    // Update last sync time
    await storage.set(`lastSync:${body.vaultId}`, Date.now())

    return response.json({ fileCount: result.filesProcessed || 0 })
  } catch (error) {
    return response.error((error as Error).message, 500)
  }
}
```

```typescript
// server/configure.ts
import type { ExtensionServerAPI } from '@blueplm/extension-api'

interface ConfigureRequest {
  apiKey?: string
}

export default async function handler(api: ExtensionServerAPI) {
  const { request, user, secrets, response } = api

  if (!user) {
    return response.error('Authentication required', 401)
  }

  if (user.role !== 'admin' && user.role !== 'owner') {
    return response.error('Admin access required', 403)
  }

  const body = request.body as ConfigureRequest

  if (body.apiKey) {
    await secrets.set('api_key', body.apiKey)
  }

  return response.json({ success: true })
}
```

```tsx
// client/components/Settings.tsx
import { useState, useEffect } from 'react'
import type { ExtensionClientAPI } from '@blueplm/extension-api'

interface SettingsProps {
  api: ExtensionClientAPI
}

export default function Settings({ api }: SettingsProps) {
  const [autoSync, setAutoSync] = useState(true)
  const [syncInterval, setSyncInterval] = useState(300)
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [savedAutoSync, savedInterval] = await Promise.all([
        api.storage.get<boolean>('autoSync'),
        api.storage.get<number>('syncInterval')
      ])
      if (savedAutoSync !== undefined) setAutoSync(savedAutoSync)
      if (savedInterval !== undefined) setSyncInterval(savedInterval)
      setLoading(false)
    }
    load()
  }, [api])

  async function handleSave() {
    setSaving(true)
    try {
      await api.storage.set('autoSync', autoSync)
      await api.storage.set('syncInterval', syncInterval)

      if (apiKey) {
        await api.callOrgApi('/extensions/cloud-sync/configure', {
          method: 'POST',
          body: { apiKey }
        })
      }

      api.ui.showToast('Settings saved', 'success')
    } catch (error) {
      api.ui.showToast('Failed to save settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-4">Loading...</div>

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Cloud Sync Settings</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API key"
            className="w-full px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            className="rounded"
          />
          <span>Enable automatic sync</span>
        </label>

        <div>
          <label className="block text-sm font-medium mb-1">
            Sync interval (seconds)
          </label>
          <input
            type="number"
            value={syncInterval}
            onChange={(e) => setSyncInterval(Number(e.target.value))}
            min={60}
            max={3600}
            className="w-32 px-3 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
```

---

## Common Patterns

### Disposable Pattern

```typescript
// Always push to subscriptions for auto-cleanup
context.subscriptions.push(
  api.commands.registerCommand('myext.cmd', handler),
  api.workspace.onFileChanged(fileHandler),
  api.events.on('vault:changed', vaultHandler),
  { dispose: () => clearInterval(intervalId) }  // Custom cleanup
)
```

### Error Handling

```typescript
async function safeOperation(api: ExtensionClientAPI) {
  try {
    const result = await api.callOrgApi('/extensions/myext/action', { method: 'POST' })
    if (result.ok) {
      api.ui.showToast('Success!', 'success')
    } else {
      throw new Error('Operation failed')
    }
  } catch (error) {
    context.log.error('Operation failed:', error)
    api.ui.showToast('Operation failed. Please try again.', 'error')
    api.telemetry.trackError(error as Error, { operation: 'action' })
  }
}
```

### Progress Indicator

```typescript
await api.ui.showProgress(
  { title: 'Processing...', cancellable: true },
  async (progress, token) => {
    for (let i = 0; i < items.length; i++) {
      if (token.isCancellationRequested) {
        api.ui.showToast('Cancelled', 'info')
        return
      }
      progress.report({
        message: `Item ${i + 1} of ${items.length}`,
        increment: 100 / items.length
      })
      await processItem(items[i])
    }
  }
)
```

### Configuration with Defaults

```typescript
interface Config {
  autoSync: boolean
  syncInterval: number
}

const DEFAULT_CONFIG: Config = {
  autoSync: true,
  syncInterval: 300
}

async function loadConfig(api: ExtensionClientAPI): Promise<Config> {
  const saved = await api.storage.get<Partial<Config>>('config')
  return { ...DEFAULT_CONFIG, ...saved }
}
```

### Debounce File Events

```typescript
function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timeout: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), ms)
  }
}

const debouncedHandler = debounce((events: FileChangeEvent[]) => {
  processFileChanges(events)
}, 500)

context.subscriptions.push(
  api.workspace.onFileChanged(debouncedHandler)
)
```

---

## Checklist

### Before Starting

- [ ] Unique `id` in format `publisher.name`
- [ ] Open source `license` (MIT, Apache-2.0, etc.)
- [ ] At least one `activationEvent`
- [ ] `main` or `serverMain` entry point

### Client Code

- [ ] Export `activate(context, api)` function
- [ ] Push all subscriptions to `context.subscriptions`
- [ ] Handle all async errors
- [ ] Check `api.context.user` before authenticated operations

### Server Code

- [ ] Export default async function
- [ ] Check `user` for authentication (unless public endpoint)
- [ ] Validate all input
- [ ] Never expose secrets in responses
- [ ] Declare all HTTP domains in permissions

### UI/UX

- [ ] Show progress for operations > 1 second
- [ ] Confirm destructive actions
- [ ] Provide meaningful error messages
- [ ] Support dark mode (use Tailwind classes)

### Permissions

- [ ] Only request permissions actually used
- [ ] Document why each permission is needed
- [ ] Use specific `http:domain:X` instead of `http:fetch`

### Before Publishing

- [ ] `npm run typecheck` passes
- [ ] All features tested via sideload
- [ ] README with setup instructions
- [ ] Icon included (128×128 PNG)
- [ ] Repository URL in manifest
- [ ] Package under 10MB

---

## Quick Reference Tables

### Manifest Required Fields

| Field | Format |
|-------|--------|
| `id` | `publisher.name` |
| `name` | String |
| `version` | Semver |
| `publisher` | Lowercase slug |
| `license` | OSI identifier |
| `engines.blueplm` | Semver range |
| `activationEvents` | Array (min 1) |
| `contributes` | Object |
| `permissions` | Object |

### Client API Quick Reference

| API | Permission | Purpose |
|-----|------------|---------|
| `ui.showToast` | `ui:toast` | Notifications |
| `ui.showDialog` | `ui:dialog` | Confirmations |
| `ui.showProgress` | `ui:progress` | Progress bars |
| `storage.get/set` | `storage:local` | Persist data |
| `callOrgApi` | `network:orgApi` | Server calls |
| `commands.registerCommand` | `commands:register` | Add commands |
| `workspace.onFileChanged` | `workspace:files` | Watch files |

### Server API Quick Reference

| API | Permission | Purpose |
|-----|------------|---------|
| `storage.get/set` | `storage:database` | Database storage |
| `secrets.get/set` | `secrets:read/write` | Encrypted secrets |
| `http.fetch` | `http:domain:X` | External HTTP |
| `response.json` | — | Return JSON |
| `response.error` | — | Return error |

---

**End of AI Reference**
