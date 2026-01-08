# Permissions Reference

BluePLM extensions use a permission system to control access to APIs. Users see requested permissions before installing an extension. This document covers all available permissions in detail.

## Overview

Permissions are declared in your manifest:

```json
{
  "permissions": {
    "client": ["ui:toast", "storage:local", "network:orgApi"],
    "server": ["storage:database", "secrets:read", "http:domain:api.example.com"]
  }
}
```

## Security Model

| Principle | Description |
|-----------|-------------|
| **Least Privilege** | Only request permissions you actually need |
| **Explicit Declaration** | All permissions must be declared in manifest |
| **Runtime Enforcement** | API calls without permission throw errors |
| **User Visibility** | Users see permissions before installation |

---

## Client Permissions

Client permissions control what the extension can do in the Extension Host (client-side).

### UI Permissions

#### ui:toast

Display toast notifications.

```typescript
api.ui.showToast('Message', 'success')
```

**Use for:** Brief, non-blocking feedback messages.

---

#### ui:dialog

Show modal dialogs and input prompts.

```typescript
await api.ui.showDialog({ title: 'Confirm', message: '...', type: 'confirm' })
await api.ui.showQuickPick([...])
await api.ui.showInputBox({ ... })
```

**Use for:** User confirmations, selections, and text input.

---

#### ui:status

Set the extension's connection status indicator.

```typescript
api.ui.setStatus('online')  // or 'offline', 'partial', 'checking'
```

**Use for:** Showing connection state to external services.

---

#### ui:progress

Show progress indicators during operations.

```typescript
await api.ui.showProgress(
  { title: 'Working...', cancellable: true },
  async (progress, token) => {
    progress.report({ message: 'Step 1...', increment: 25 })
    // ...
  }
)
```

**Use for:** Long-running operations with visual feedback.

---

#### ui:quickpick

Show quick pick selection lists.

```typescript
const selected = await api.ui.showQuickPick([
  { label: 'Option 1' },
  { label: 'Option 2' }
])
```

**Note:** This is typically grouped with `ui:dialog`.

---

#### ui:inputbox

Show text input dialogs.

```typescript
const value = await api.ui.showInputBox({
  title: 'Enter value',
  validateInput: (v) => v ? undefined : 'Required'
})
```

**Note:** This is typically grouped with `ui:dialog`.

---

### Storage Permissions

#### storage:local

Access extension-scoped local storage.

```typescript
await api.storage.set('key', value)
const data = await api.storage.get('key')
await api.storage.delete('key')
const keys = await api.storage.keys()
```

**Use for:** Persisting user preferences, cache data, and extension state.

**Data isolation:** Each extension has its own storage namespace. Extensions cannot access each other's data.

---

### Network Permissions

#### network:orgApi

Call the organization's API server (authenticated).

```typescript
const response = await api.callOrgApi('/extensions/myext/sync', {
  method: 'POST',
  body: { vaultId: '...' }
})
```

**Use for:** Calling your extension's server-side handlers.

**Automatically includes:** User authentication headers.

---

#### network:storeApi

Call the Extension Store API.

```typescript
const response = await api.callStoreApi('/store/extensions/myext')
```

**Use for:** Checking for updates, extension metadata.

---

#### network:fetch

Make HTTP requests to external URLs (client-side).

```typescript
const response = await api.fetch('https://api.example.com/data', {
  method: 'GET'
})
```

**Important:** Requires corresponding `http:domain:*` server permissions.

**Use for:** Client-side external API calls (rare; prefer server-side).

---

### Command Permissions

#### commands:register

Register command handlers.

```typescript
context.subscriptions.push(
  api.commands.registerCommand('myext.doThing', handler)
)
```

**Use for:** Creating executable commands.

---

#### commands:execute

Execute registered commands.

```typescript
await api.commands.executeCommand('myext.doThing', arg1, arg2)
```

**Use for:** Triggering commands programmatically.

---

### Workspace Permissions

#### workspace:files

Access file change events and open file information.

```typescript
context.subscriptions.push(
  api.workspace.onFileChanged((events) => {
    // Handle file changes
  })
)

const openFiles = await api.workspace.getOpenFiles()
```

**Use for:** Reacting to file changes, monitoring workspace.

---

#### workspace:vaults

Access vault configuration.

```typescript
const vault = await api.workspace.getCurrentVault()
const allVaults = await api.workspace.getVaults()
```

**Use for:** Multi-vault operations, vault-aware sync.

---

### Telemetry Permission

#### telemetry

Send anonymous analytics data.

```typescript
api.telemetry.trackEvent('sync_completed', { fileCount: 42 })
api.telemetry.trackError(error, { context: 'sync' })
api.telemetry.trackTiming('operation', 1500)
```

**Use for:** Gathering anonymous usage statistics.

**Privacy:** All telemetry is anonymized and aggregated.

---

## Server Permissions

Server permissions control what extension handlers can do in the V8 sandbox.

### Storage Permissions

#### storage:database

Access extension-scoped database storage.

```typescript
await api.storage.set('key', value)
const data = await api.storage.get('key')
await api.storage.delete('key')
const keys = await api.storage.list('prefix:')
```

**Use for:** Persisting extension data server-side.

**Data isolation:** Scoped to (organization, extension) combination.

---

### Secrets Permissions

#### secrets:read

Read encrypted secrets.

```typescript
const apiKey = await api.secrets.get('api_key')
```

**Use for:** Accessing stored credentials.

**Audit:** All read operations are logged.

---

#### secrets:write

Store and delete encrypted secrets.

```typescript
await api.secrets.set('api_key', 'sk-...')
await api.secrets.delete('api_key')
```

**Use for:** Saving OAuth tokens, API keys.

**Limits:** 50 secrets max, 10KB each.

**Audit:** All write operations are logged.

---

### HTTP Permissions

#### http:fetch

Make HTTP requests to any domain (unrestricted).

```json
"server": ["http:fetch"]
```

**⚠️ Warning:** This grants access to ALL domains. Prefer specific domain permissions.

---

#### http:domain:{domain}

Make HTTP requests to a specific domain.

```json
"server": [
  "http:domain:api.googleapis.com",
  "http:domain:accounts.google.com",
  "http:domain:api.example.com"
]
```

**Pattern support:**
- Exact: `http:domain:api.example.com`
- Wildcards: Not supported (declare each domain)

**Example:**
```typescript
// With http:domain:api.googleapis.com permission
const response = await api.http.fetch('https://api.googleapis.com/v3/files')
// ✓ Allowed

const response = await api.http.fetch('https://malicious.com/steal')
// ✗ Error: Domain not in allowed list
```

---

## Permission Groups

Common permission combinations for different extension types.

### Basic UI Extension

```json
{
  "permissions": {
    "client": [
      "ui:toast",
      "ui:dialog",
      "storage:local",
      "commands:register"
    ]
  }
}
```

### Cloud Sync Extension

```json
{
  "permissions": {
    "client": [
      "ui:toast",
      "ui:dialog",
      "ui:status",
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
      "http:domain:api.cloudprovider.com"
    ]
  }
}
```

### OAuth Integration

```json
{
  "permissions": {
    "client": [
      "ui:toast",
      "ui:dialog",
      "network:orgApi"
    ],
    "server": [
      "secrets:read",
      "secrets:write",
      "http:domain:oauth2.googleapis.com",
      "http:domain:accounts.google.com",
      "http:domain:api.googleapis.com"
    ]
  }
}
```

### File Watcher Extension

```json
{
  "permissions": {
    "client": [
      "ui:toast",
      "storage:local",
      "workspace:files",
      "telemetry"
    ]
  }
}
```

### Full-Featured Integration

```json
{
  "permissions": {
    "client": [
      "ui:toast",
      "ui:dialog",
      "ui:status",
      "ui:progress",
      "storage:local",
      "network:orgApi",
      "commands:register",
      "commands:execute",
      "workspace:files",
      "workspace:vaults",
      "telemetry"
    ],
    "server": [
      "storage:database",
      "secrets:read",
      "secrets:write",
      "http:domain:api.service.com",
      "http:domain:auth.service.com"
    ]
  }
}
```

---

## Runtime Enforcement

### Permission Denied Errors

Calling an API without permission throws an error:

```typescript
// Without ui:toast permission:
api.ui.showToast('Hello')
// Error: Permission denied: ui:toast not granted to extension myext

// Without http:domain:api.example.com permission:
await api.http.fetch('https://api.example.com/data')
// Error: Domain api.example.com not in extension's allowed domains
```

### Checking Permissions

Extensions should handle permission errors gracefully:

```typescript
try {
  api.ui.showToast('Success!', 'success')
} catch (error) {
  if (error.message.includes('Permission denied')) {
    console.log('Toast permission not available, using fallback')
    // Alternative feedback method
  } else {
    throw error
  }
}
```

---

## Best Practices

### 1. Request Minimal Permissions

```json
// ❌ Bad: Requesting everything
"permissions": {
  "client": ["ui:toast", "ui:dialog", "ui:status", "ui:progress", ...],
  "server": ["http:fetch"]  // Unrestricted!
}

// ✓ Good: Only what's needed
"permissions": {
  "client": ["ui:toast", "storage:local"],
  "server": ["http:domain:api.myservice.com"]
}
```

### 2. Document Why Permissions Are Needed

In your README:
```markdown
## Permissions

This extension requires:
- **ui:toast**: Show sync status notifications
- **storage:local**: Remember sync preferences
- **http:domain:api.myservice.com**: Connect to your account
```

### 3. Handle Missing Permissions Gracefully

```typescript
// Check if feature is available before using
async function showProgress(task) {
  try {
    return await api.ui.showProgress({ title: 'Working...' }, task)
  } catch (e) {
    // Fallback without progress UI
    return await task({ report: () => {} }, { isCancellationRequested: false })
  }
}
```

### 4. Use Specific HTTP Domains

```json
// ❌ Avoid: Too broad
"server": ["http:fetch"]

// ✓ Better: Specific domains
"server": [
  "http:domain:api.googleapis.com",
  "http:domain:oauth2.googleapis.com"
]
```

### 5. Separate Read and Write Secrets

Only request `secrets:write` if you actually store secrets:

```json
// Read-only (using pre-configured secrets)
"server": ["secrets:read"]

// Read and write (OAuth flow stores tokens)
"server": ["secrets:read", "secrets:write"]
```

---

## Permission Changes

### Adding Permissions

Adding new permissions requires users to re-approve the extension:

1. User sees "Extension wants additional permissions"
2. New permissions are listed
3. User approves or rejects

### Removing Permissions

Removing permissions is transparent to users — no approval needed.

---

## User-Facing Permission Descriptions

| Permission | User-Friendly Description |
|------------|---------------------------|
| `ui:toast` | Show notifications |
| `ui:dialog` | Display dialogs and prompts |
| `ui:status` | Show connection status |
| `ui:progress` | Display progress indicators |
| `storage:local` | Store preferences locally |
| `network:orgApi` | Communicate with your organization |
| `commands:register` | Add keyboard shortcuts |
| `workspace:files` | Monitor file changes |
| `workspace:vaults` | Access vault information |
| `telemetry` | Send anonymous usage data |
| `storage:database` | Store data on server |
| `secrets:read` | Access stored credentials |
| `secrets:write` | Save credentials securely |
| `http:domain:*` | Connect to {domain} |

---

**[← Contributions Reference](./contributions.md)** | **[Package Format →](./package-format.md)**
