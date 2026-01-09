# Getting Started with BluePLM Extensions

This guide walks you through creating your first BluePLM extension from scratch. By the end, you'll have a working extension that adds a command to sync files with an external service.

## Prerequisites

- Node.js 18+ installed
- Basic TypeScript/JavaScript knowledge
- BluePLM desktop application installed
- A code editor (VS Code recommended)

## Step 1: Create Extension Directory

Create a new directory for your extension:

```bash
mkdir my-first-extension
cd my-first-extension
```

Create the following structure:

```
my-first-extension/
├── extension.json          # Manifest (required)
├── README.md               # Documentation
├── LICENSE                 # Open source license (required)
├── icon.png                # 128x128 icon
├── client/                 # Client-side code
│   └── index.ts            # Main entry point
└── server/                 # Server-side code (optional)
    └── sync.ts             # API handler
```

## Step 2: Create the Manifest

Create `extension.json` — the heart of your extension:

```json
{
  "$schema": "https://blueplm.io/schemas/extension-v1.schema.json",
  "id": "mycompany.file-sync",
  "name": "File Sync",
  "version": "1.0.0",
  "publisher": "mycompany",
  "description": "Sync files with your custom service",
  "icon": "icon.png",
  "repository": "https://github.com/mycompany/blueplm-file-sync",
  "license": "MIT",
  "engines": {
    "blueplm": "^1.0.0"
  },
  "main": "client/index.js",
  "serverMain": "server/index.js",
  "activationEvents": [
    "onExtensionEnabled",
    "onCommand:file-sync.syncNow"
  ],
  "contributes": {
    "commands": [
      {
        "id": "file-sync.syncNow",
        "title": "Sync Files Now",
        "icon": "refresh-cw",
        "keybinding": "Ctrl+Shift+S"
      }
    ],
    "settings": [
      {
        "id": "file-sync.settings",
        "name": "File Sync",
        "description": "Configure file synchronization",
        "icon": "cloud-upload",
        "component": "client/components/Settings.js",
        "category": "extensions"
      }
    ],
    "configuration": {
      "title": "File Sync",
      "properties": {
        "syncInterval": {
          "type": "number",
          "default": 300,
          "minimum": 60,
          "maximum": 3600,
          "description": "Automatic sync interval in seconds"
        },
        "autoSync": {
          "type": "boolean",
          "default": true,
          "description": "Enable automatic synchronization"
        },
        "excludePatterns": {
          "type": "array",
          "default": ["*.tmp", "*.bak"],
          "description": "File patterns to exclude from sync"
        }
      }
    },
    "apiRoutes": [
      {
        "method": "POST",
        "path": "sync",
        "handler": "server/sync.js"
      },
      {
        "method": "GET",
        "path": "status",
        "handler": "server/status.js"
      }
    ]
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
      "http:domain:api.myservice.com"
    ]
  }
}
```

### Manifest Breakdown

| Field | Purpose |
|-------|---------|
| `id` | Unique identifier: `publisher.name` format |
| `main` | Client entry point (Extension Host) |
| `serverMain` | Server entry point (API sandbox) |
| `activationEvents` | When to load the extension |
| `contributes` | What the extension adds to BluePLM |
| `permissions` | Required API access |

## Step 3: Implement Client Code

Create `client/index.ts`:

```typescript
import type { ExtensionContext, ExtensionClientAPI } from '@blueplm/extension-api'

// Sync interval handle
let syncInterval: ReturnType<typeof setInterval> | undefined

/**
 * Called when extension is activated.
 * This is your extension's entry point.
 */
export async function activate(
  context: ExtensionContext,
  api: ExtensionClientAPI
): Promise<void> {
  context.log.info('File Sync extension activating...')

  // Register the sync command
  context.subscriptions.push(
    api.commands.registerCommand('file-sync.syncNow', async () => {
      await performSync(api, context)
    })
  )

  // Watch for file changes
  context.subscriptions.push(
    api.workspace.onFileChanged(async (events) => {
      const createdOrChanged = events.filter(
        e => e.type === 'created' || e.type === 'changed'
      )
      if (createdOrChanged.length > 0) {
        context.log.debug(`${createdOrChanged.length} files changed`)
        // Could trigger auto-sync here
      }
    })
  )

  // Set up automatic sync if enabled
  const autoSync = await api.storage.get<boolean>('autoSync')
  const interval = await api.storage.get<number>('syncInterval') ?? 300

  if (autoSync !== false) {
    syncInterval = setInterval(() => {
      performSync(api, context).catch(err => {
        context.log.error('Auto-sync failed:', err)
      })
    }, interval * 1000)
  }

  context.log.info('File Sync extension activated!')
  api.ui.showToast('File Sync ready', 'success')
}

/**
 * Called when extension is deactivated.
 * Clean up any resources here.
 */
export function deactivate(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = undefined
  }
}

/**
 * Perform the sync operation with progress UI.
 */
async function performSync(
  api: ExtensionClientAPI,
  context: ExtensionContext
): Promise<void> {
  await api.ui.showProgress(
    { title: 'Syncing files...', cancellable: true },
    async (progress, token) => {
      // Check if user cancelled
      token.onCancellationRequested(() => {
        context.log.info('Sync cancelled by user')
      })

      progress.report({ message: 'Preparing sync...' })

      try {
        // Get current vault
        const vault = await api.workspace.getCurrentVault()
        if (!vault) {
          api.ui.showToast('No vault selected', 'error')
          return
        }

        progress.report({ message: 'Connecting to server...', increment: 20 })

        // Call our server handler
        const response = await api.callOrgApi<SyncResult>(
          `/extensions/file-sync/sync`,
          {
            method: 'POST',
            body: {
              vaultId: vault.id,
              vaultName: vault.name
            }
          }
        )

        if (response.ok) {
          progress.report({ message: 'Sync complete!', increment: 80 })
          api.ui.showToast(
            `Synced ${response.data.fileCount} files`,
            'success'
          )

          // Track telemetry
          api.telemetry.trackEvent('sync_completed', {
            fileCount: response.data.fileCount,
            duration: response.data.duration
          })
        } else {
          throw new Error(response.data.error || 'Sync failed')
        }
      } catch (error) {
        const err = error as Error
        context.log.error('Sync error:', err)
        api.ui.showToast(`Sync failed: ${err.message}`, 'error')
        api.telemetry.trackError(err, { operation: 'sync' })
      }
    }
  )
}

// Type for sync response
interface SyncResult {
  fileCount: number
  duration: number
  error?: string
}
```

## Step 4: Implement Server Handler

Create `server/sync.ts`:

```typescript
import type { ExtensionServerAPI } from '@blueplm/extension-api'

/**
 * Server handler for sync requests.
 * Runs in V8 isolate on the organization's API server.
 */
export default async function handler(api: ExtensionServerAPI) {
  const { request, user, response } = api
  const startTime = Date.now()

  // Ensure user is authenticated
  if (!user) {
    return response.error('Authentication required', 401)
  }

  try {
    // Get request body
    const { vaultId, vaultName } = request.body as {
      vaultId: string
      vaultName: string
    }

    if (!vaultId) {
      return response.error('vaultId is required', 400)
    }

    // Get API credentials from secrets
    const apiKey = await api.secrets.get('api_key')
    const apiEndpoint = await api.secrets.get('api_endpoint')

    if (!apiKey || !apiEndpoint) {
      return response.error(
        'Extension not configured. Please add API credentials.',
        400
      )
    }

    // Get last sync timestamp from storage
    const lastSync = await api.storage.get<number>(`lastSync:${vaultId}`)

    // Call external service
    const externalResponse = await api.http.fetch(
      `${apiEndpoint}/sync`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vault: vaultName,
          since: lastSync ? new Date(lastSync).toISOString() : null,
          user: user.email
        })
      }
    )

    if (!externalResponse.ok) {
      const errorText = externalResponse.body
      throw new Error(`External API error: ${errorText}`)
    }

    const result = JSON.parse(externalResponse.body)

    // Update last sync timestamp
    await api.storage.set(`lastSync:${vaultId}`, Date.now())

    // Return success response
    return response.json({
      fileCount: result.filesProcessed || 0,
      duration: Date.now() - startTime
    })

  } catch (error) {
    const err = error as Error
    return response.error(err.message, 500)
  }
}
```

## Step 5: Create Settings Component

Create `client/components/Settings.tsx`:

```tsx
import { useState, useEffect } from 'react'
import type { ExtensionClientAPI } from '@blueplm/extension-api'

interface SettingsProps {
  api: ExtensionClientAPI
}

export default function Settings({ api }: SettingsProps) {
  const [apiKey, setApiKey] = useState('')
  const [apiEndpoint, setApiEndpoint] = useState('')
  const [autoSync, setAutoSync] = useState(true)
  const [syncInterval, setSyncInterval] = useState(300)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      const [storedAutoSync, storedInterval] = await Promise.all([
        api.storage.get<boolean>('autoSync'),
        api.storage.get<number>('syncInterval')
      ])

      if (storedAutoSync !== undefined) setAutoSync(storedAutoSync)
      if (storedInterval !== undefined) setSyncInterval(storedInterval)
      setLoading(false)
    }
    loadSettings()
  }, [api])

  async function handleSave() {
    setSaving(true)
    try {
      // Save to extension storage
      await api.storage.set('autoSync', autoSync)
      await api.storage.set('syncInterval', syncInterval)

      // Save secrets via server (if API key provided)
      if (apiKey) {
        await api.callOrgApi('/extensions/file-sync/configure', {
          method: 'POST',
          body: { apiKey, apiEndpoint }
        })
      }

      api.ui.showToast('Settings saved', 'success')
    } catch (error) {
      api.ui.showToast('Failed to save settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">File Sync Settings</h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Configure your file synchronization settings.
        </p>
      </div>

      {/* API Configuration */}
      <section className="space-y-4">
        <h3 className="font-medium">API Configuration</h3>
        
        <div>
          <label className="block text-sm font-medium mb-1">
            API Endpoint
          </label>
          <input
            type="url"
            value={apiEndpoint}
            onChange={(e) => setApiEndpoint(e.target.value)}
            placeholder="https://api.myservice.com"
            className="w-full px-3 py-2 border rounded-md"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            className="w-full px-3 py-2 border rounded-md"
          />
          <p className="text-xs text-gray-500 mt-1">
            Stored securely and encrypted
          </p>
        </div>
      </section>

      {/* Sync Options */}
      <section className="space-y-4">
        <h3 className="font-medium">Sync Options</h3>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="autoSync"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="autoSync">Enable automatic sync</label>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Sync Interval (seconds)
          </label>
          <input
            type="number"
            value={syncInterval}
            onChange={(e) => setSyncInterval(Number(e.target.value))}
            min={60}
            max={3600}
            className="w-32 px-3 py-2 border rounded-md"
          />
        </div>
      </section>

      {/* Save Button */}
      <div className="pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
```

## Step 6: Add License and README

**LICENSE** (MIT example):
```
MIT License

Copyright (c) 2024 My Company

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

**README.md**:
```markdown
# File Sync Extension for BluePLM

Sync your engineering files with your custom service.

## Features

- 🔄 One-click sync with keyboard shortcut (Ctrl+Shift+S)
- ⏰ Automatic background sync
- 📁 Watch for file changes
- 🔒 Secure API key storage

## Setup

1. Install from the BluePLM Extension Store
2. Open Settings → Extensions → File Sync
3. Enter your API endpoint and key
4. Enable automatic sync (optional)

## Usage

- Press `Ctrl+Shift+S` to sync immediately
- Or use Command Palette → "Sync Files Now"

## Requirements

- BluePLM 1.0.0 or later
- Active subscription to your sync service
```

## Step 7: Build and Package

Create a build script or use a bundler (esbuild, rollup, etc.):

**package.json**:
```json
{
  "name": "blueplm-file-sync",
  "version": "1.0.0",
  "scripts": {
    "build": "esbuild client/index.ts --bundle --outfile=client/index.js --format=esm --platform=browser && esbuild server/*.ts --bundle --outdir=server --format=esm",
    "package": "npm run build && zip -r file-sync-1.0.0.bpx extension.json README.md LICENSE icon.png client/ server/"
  },
  "devDependencies": {
    "esbuild": "^0.19.0",
    "typescript": "^5.0.0"
  }
}
```

Build and package:
```bash
npm install
npm run package
```

This creates `file-sync-1.0.0.bpx` ready for installation.

## Step 8: Test Locally (Sideload)

1. Open BluePLM
2. Go to Settings → Extensions → Extension Store
3. Click "Sideload Extension"
4. Select your `.bpx` file
5. Accept the warning (sideloaded extensions show a warning)
6. Test your extension!

## Step 9: Publish (Optional)

To publish to the Extension Store:

1. Create a GitHub repository for your extension
2. Ensure `repository` field in manifest points to it
3. Go to [extensions.blueplm.io/submit](https://extensions.blueplm.io/submit)
4. Register as a publisher
5. Upload your `.bpx` file
6. Wait for review (community) or contact Blue Robotics for verification

## Next Steps

- [Manifest Reference](./manifest.md) — All configuration options
- [Client API Reference](./client-api.md) — Complete client API
- [Server API Reference](./server-api.md) — Server handler APIs
- [Best Practices](./best-practices.md) — Patterns and recommendations

---

**[← Back to Overview](./index.md)** | **[Manifest Reference →](./manifest.md)**
