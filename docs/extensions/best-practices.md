# Best Practices

This guide covers patterns, recommendations, and best practices for building high-quality BluePLM extensions.

## Architecture Patterns

### 1. Use the Disposable Pattern

Always push subscriptions to `context.subscriptions` for automatic cleanup:

```typescript
// ✓ Good: Resources are auto-disposed
export async function activate(context, api) {
  context.subscriptions.push(
    api.commands.registerCommand('myext.cmd', handler),
    api.workspace.onFileChanged(fileHandler),
    api.events.on('vault:changed', vaultHandler)
  )
}

// ❌ Bad: Memory leak on deactivate
export async function activate(context, api) {
  api.commands.registerCommand('myext.cmd', handler)
  // No cleanup!
}
```

### 2. Lazy Initialization

Don't do heavy work in `activate`. Use activation events:

```typescript
// ✓ Good: Fast activation, lazy loading
export async function activate(context, api) {
  // Register commands immediately (fast)
  context.subscriptions.push(
    api.commands.registerCommand('myext.sync', async () => {
      // Heavy work only when command is invoked
      const data = await loadLargeDataset()
      await performSync(data)
    })
  )
}

// ❌ Bad: Slow activation
export async function activate(context, api) {
  // This blocks activation
  const data = await loadLargeDataset()
  
  context.subscriptions.push(
    api.commands.registerCommand('myext.sync', () => performSync(data))
  )
}
```

### 3. Activation Events

Choose specific activation events for fast startup:

```json
// ✓ Good: Specific events
"activationEvents": [
  "onCommand:myext.sync",
  "onNavigate:settings/extensions/myext"
]

// ❌ Avoid: Loads on every startup
"activationEvents": [
  "onStartup"
]
```

**Only use `onStartup` if:**
- Extension needs to run background tasks always
- Extension intercepts global events

### 4. Separate Concerns

Organize code by responsibility:

```
client/
├── index.ts              # Entry point only
├── commands/             # Command handlers
│   ├── sync.ts
│   └── configure.ts
├── views/                # React components
│   ├── Panel.tsx
│   └── Settings.tsx
├── services/             # Business logic
│   ├── syncService.ts
│   └── apiClient.ts
└── utils/                # Pure utilities
    ├── formatting.ts
    └── validation.ts
```

---

## Error Handling

### 1. Always Handle Async Errors

```typescript
// ✓ Good: Errors handled
context.subscriptions.push(
  api.commands.registerCommand('myext.sync', async () => {
    try {
      await performSync(api)
    } catch (error) {
      context.log.error('Sync failed:', error)
      api.ui.showToast('Sync failed. Check logs for details.', 'error')
      api.telemetry.trackError(error as Error, { operation: 'sync' })
    }
  })
)

// ❌ Bad: Unhandled rejection
api.commands.registerCommand('myext.sync', async () => {
  await performSync(api) // Might throw!
})
```

### 2. User-Friendly Error Messages

```typescript
// ✓ Good: Helpful message
try {
  await api.callOrgApi('/extensions/myext/sync', { ... })
} catch (error) {
  if (error.message.includes('401')) {
    api.ui.showToast('Session expired. Please log in again.', 'error')
  } else if (error.message.includes('timeout')) {
    api.ui.showToast('Server is slow. Please try again.', 'warning')
  } else {
    api.ui.showToast('Sync failed. Check your connection.', 'error')
  }
}

// ❌ Bad: Exposing technical details
api.ui.showToast(`Error: ${error.stack}`, 'error')
```

### 3. Graceful Degradation

```typescript
async function getStatus(api: ExtensionClientAPI) {
  try {
    const response = await api.callOrgApi('/extensions/myext/status')
    return response.data
  } catch (error) {
    // Fallback to cached status
    const cached = await api.storage.get('lastStatus')
    if (cached) {
      context.log.warn('Using cached status due to API error')
      return { ...cached, stale: true }
    }
    throw error
  }
}
```

---

## Performance

### 1. Startup Time Budget

Extensions should activate in under 200ms:

```typescript
export async function activate(context, api) {
  const start = performance.now()
  
  // Register handlers (fast)
  registerCommands(context, api)
  registerEventListeners(context, api)
  
  const duration = performance.now() - start
  if (duration > 200) {
    context.log.warn(`Slow activation: ${duration}ms`)
  }
}
```

### 2. Debounce Frequent Events

```typescript
import { debounce } from './utils'

const debouncedSync = debounce(async (events: FileChangeEvent[]) => {
  await performIncrementalSync(events)
}, 500)

context.subscriptions.push(
  api.workspace.onFileChanged(debouncedSync)
)
```

**Simple debounce implementation:**
```typescript
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined
  return (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), ms)
  }
}
```

### 3. Cache Expensive Operations

```typescript
let cachedVaults: VaultInfo[] | undefined

async function getVaults(api: ExtensionClientAPI): Promise<VaultInfo[]> {
  if (cachedVaults) return cachedVaults
  
  cachedVaults = await api.workspace.getVaults()
  return cachedVaults
}

// Invalidate on vault changes
context.subscriptions.push(
  api.events.on('vault:changed', () => {
    cachedVaults = undefined
  })
)
```

### 4. Batch Operations

```typescript
// ✓ Good: Batch storage operations
const settings = {
  autoSync: true,
  interval: 300,
  excludePatterns: ['*.tmp']
}
await api.storage.set('settings', settings)

// ❌ Bad: Multiple round-trips
await api.storage.set('autoSync', true)
await api.storage.set('interval', 300)
await api.storage.set('excludePatterns', ['*.tmp'])
```

---

## UI/UX

### 1. Provide Clear Feedback

```typescript
async function handleSync(api: ExtensionClientAPI) {
  // Show progress for long operations
  await api.ui.showProgress(
    { title: 'Syncing files...', cancellable: true },
    async (progress, token) => {
      progress.report({ message: 'Preparing...' })
      
      const files = await getFiles()
      for (let i = 0; i < files.length; i++) {
        if (token.isCancellationRequested) {
          api.ui.showToast('Sync cancelled', 'info')
          return
        }
        
        progress.report({
          message: `Syncing ${files[i].name}`,
          increment: 100 / files.length
        })
        
        await syncFile(files[i])
      }
      
      api.ui.showToast('Sync complete!', 'success')
    }
  )
}
```

### 2. Confirm Destructive Actions

```typescript
async function handleDelete(api: ExtensionClientAPI, file: string) {
  const result = await api.ui.showDialog({
    title: 'Delete File',
    message: `Are you sure you want to delete "${file}"? This cannot be undone.`,
    type: 'confirm',
    confirmText: 'Delete',
    cancelText: 'Cancel'
  })
  
  if (result.confirmed) {
    await deleteFile(file)
    api.ui.showToast('File deleted', 'success')
  }
}
```

### 3. Use Status Indicators

```typescript
// Show connection status
async function checkConnection(api: ExtensionClientAPI) {
  api.ui.setStatus('checking')
  
  try {
    await api.callOrgApi('/extensions/myext/ping')
    api.ui.setStatus('online')
  } catch {
    api.ui.setStatus('offline')
  }
}

// Update on reconnection
context.subscriptions.push(
  api.events.on('online:changed', (isOnline) => {
    api.ui.setStatus(isOnline ? 'online' : 'offline')
  })
)
```

### 4. Respect User Preferences

```typescript
async function maybeShowHint(api: ExtensionClientAPI) {
  const dismissed = await api.storage.get<boolean>('hintDismissed')
  
  if (!dismissed) {
    const result = await api.ui.showDialog({
      title: 'Tip',
      message: 'Press Ctrl+Shift+S to sync quickly!',
      type: 'info',
      confirmText: 'Got it',
      cancelText: "Don't show again"
    })
    
    if (!result.confirmed && !result.dismissed) {
      await api.storage.set('hintDismissed', true)
    }
  }
}
```

---

## Security

### 1. Validate All Input

```typescript
// Server handler
export default async function handler(api: ExtensionServerAPI) {
  const { vaultId, action } = api.request.body as {
    vaultId?: unknown
    action?: unknown
  }
  
  // Type and format validation
  if (typeof vaultId !== 'string' || !vaultId.match(/^[a-f0-9-]{36}$/)) {
    return api.response.error('Invalid vaultId', 400)
  }
  
  if (!['sync', 'backup', 'restore'].includes(String(action))) {
    return api.response.error('Invalid action', 400)
  }
  
  // Safe to use
  await performAction(vaultId, action as 'sync' | 'backup' | 'restore')
}
```

### 2. Never Expose Secrets

```typescript
// ❌ Bad: Leaking secrets
return api.response.json({
  apiKey: await api.secrets.get('api_key')
})

// ✓ Good: Only expose status
return api.response.json({
  configured: !!(await api.secrets.get('api_key'))
})
```

### 3. Use HTTPS for External APIs

```json
// ✓ Good: HTTPS only
"permissions": {
  "server": ["http:domain:api.example.com"]
}

// In handler
await api.http.fetch('https://api.example.com/data')
```

### 4. Check Permissions Before Actions

```typescript
export default async function handler(api: ExtensionServerAPI) {
  const { user } = api
  
  // Ensure authenticated
  if (!user) {
    return api.response.error('Authentication required', 401)
  }
  
  // Check role for admin actions
  if (api.request.body.action === 'deleteAll') {
    if (user.role !== 'admin' && user.role !== 'owner') {
      return api.response.error('Admin access required', 403)
    }
  }
}
```

---

## Testing

### 1. Mock the API

```typescript
// test/commands.test.ts
const mockApi: Partial<ExtensionClientAPI> = {
  ui: {
    showToast: jest.fn(),
    showDialog: jest.fn().mockResolvedValue({ confirmed: true }),
    showProgress: jest.fn((opts, task) => task(
      { report: jest.fn() },
      { isCancellationRequested: false }
    )),
    setStatus: jest.fn(),
    showQuickPick: jest.fn(),
    showInputBox: jest.fn()
  },
  storage: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    keys: jest.fn(),
    has: jest.fn(),
    clear: jest.fn()
  },
  callOrgApi: jest.fn().mockResolvedValue({
    ok: true,
    data: { fileCount: 10 }
  })
}

test('sync command shows success toast', async () => {
  await syncCommand(mockApi as ExtensionClientAPI)
  
  expect(mockApi.ui?.showToast).toHaveBeenCalledWith(
    expect.stringContaining('complete'),
    'success'
  )
})
```

### 2. Test Edge Cases

```typescript
test('handles API timeout gracefully', async () => {
  mockApi.callOrgApi = jest.fn().mockRejectedValue(new Error('timeout'))
  
  await syncCommand(mockApi as ExtensionClientAPI)
  
  expect(mockApi.ui?.showToast).toHaveBeenCalledWith(
    expect.stringContaining('try again'),
    'error'
  )
})

test('handles no vault selected', async () => {
  mockApi.workspace = {
    ...mockApi.workspace,
    getCurrentVault: jest.fn().mockResolvedValue(undefined)
  }
  
  await syncCommand(mockApi as ExtensionClientAPI)
  
  expect(mockApi.ui?.showToast).toHaveBeenCalledWith(
    'No vault selected',
    'error'
  )
})
```

### 3. Test Settings Persistence

```typescript
test('settings are persisted', async () => {
  const storage = new Map()
  mockApi.storage = {
    set: jest.fn((key, value) => { storage.set(key, value); return Promise.resolve() }),
    get: jest.fn((key) => Promise.resolve(storage.get(key))),
    // ...
  }
  
  await saveSettings(mockApi, { autoSync: true, interval: 300 })
  const loaded = await loadSettings(mockApi)
  
  expect(loaded).toEqual({ autoSync: true, interval: 300 })
})
```

---

## Code Organization

### 1. Type Everything

```typescript
// types.ts
export interface SyncOptions {
  vaultId: string
  force?: boolean
  dryRun?: boolean
}

export interface SyncResult {
  fileCount: number
  duration: number
  errors: string[]
}

// sync.ts
async function performSync(
  api: ExtensionClientAPI,
  options: SyncOptions
): Promise<SyncResult> {
  // Type-safe implementation
}
```

### 2. Use Constants

```typescript
// constants.ts
export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  LAST_SYNC: 'lastSync',
  CACHE: 'cache'
} as const

export const COMMANDS = {
  SYNC: 'myext.sync',
  CONFIGURE: 'myext.configure'
} as const

// Usage
await api.storage.set(STORAGE_KEYS.SETTINGS, settings)
api.commands.registerCommand(COMMANDS.SYNC, handler)
```

### 3. Document Complex Logic

```typescript
/**
 * Performs incremental sync by comparing local and remote file hashes.
 * 
 * Algorithm:
 * 1. Get list of local files with hashes
 * 2. Fetch remote file list from API
 * 3. Compare hashes to find changed files
 * 4. Upload changed local files
 * 5. Download changed remote files
 * 6. Handle conflicts based on user preference
 * 
 * @param api - Extension client API
 * @param vaultId - Target vault ID
 * @returns Sync result with counts and any errors
 */
async function performIncrementalSync(
  api: ExtensionClientAPI,
  vaultId: string
): Promise<SyncResult> {
  // Implementation...
}
```

---

## Common Patterns

### Configuration Loading

```typescript
interface ExtensionConfig {
  autoSync: boolean
  syncInterval: number
  excludePatterns: string[]
}

const DEFAULT_CONFIG: ExtensionConfig = {
  autoSync: true,
  syncInterval: 300,
  excludePatterns: ['*.tmp', '.git/**']
}

async function loadConfig(api: ExtensionClientAPI): Promise<ExtensionConfig> {
  const saved = await api.storage.get<Partial<ExtensionConfig>>('config')
  return { ...DEFAULT_CONFIG, ...saved }
}

async function saveConfig(
  api: ExtensionClientAPI,
  config: ExtensionConfig
): Promise<void> {
  await api.storage.set('config', config)
  api.events.emit('myext.configChanged', config)
}
```

### Periodic Background Tasks

```typescript
let intervalId: ReturnType<typeof setInterval> | undefined

export async function activate(context, api) {
  const config = await loadConfig(api)
  
  if (config.autoSync) {
    intervalId = setInterval(async () => {
      try {
        await performBackgroundSync(api)
      } catch (error) {
        context.log.error('Background sync failed:', error)
      }
    }, config.syncInterval * 1000)
  }
  
  // Clean up on deactivate
  context.subscriptions.push({
    dispose: () => {
      if (intervalId) clearInterval(intervalId)
    }
  })
}
```

### State Machine for Complex Operations

```typescript
type SyncState = 'idle' | 'syncing' | 'error' | 'paused'

class SyncManager {
  private state: SyncState = 'idle'
  private listeners: Set<(state: SyncState) => void> = new Set()
  
  async sync(api: ExtensionClientAPI): Promise<void> {
    if (this.state === 'syncing') return
    
    this.setState('syncing')
    
    try {
      await performSync(api)
      this.setState('idle')
    } catch (error) {
      this.setState('error')
      throw error
    }
  }
  
  private setState(state: SyncState) {
    this.state = state
    this.listeners.forEach(l => l(state))
  }
  
  onStateChange(callback: (state: SyncState) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
}
```

---

**[← Publishing Guide](./publishing.md)** | **[Troubleshooting →](./troubleshooting.md)**
