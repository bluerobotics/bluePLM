# Agent 3: Sandboxed Client API - Completion Report

## Status: ✅ Complete

**Date:** January 7, 2026  
**Agent:** 3 - Sandboxed Client API  
**Wave:** 1 (Foundation)

---

## Summary

Successfully implemented the complete Sandboxed Client API that extensions use in the Extension Host. All operations are permission-gated and forwarded via IPC to the main process.

---

## Files Created

| File | Description |
|------|-------------|
| `src/lib/extensions/api/types.ts` | Core interfaces: `ExtensionClientAPI`, `Disposable`, all supporting types |
| `src/lib/extensions/api/ui.ts` | UI API: toast, dialog, status, progress, quickpick, inputbox |
| `src/lib/extensions/api/storage.ts` | Extension-scoped local storage API |
| `src/lib/extensions/api/network.ts` | Network API: callOrgApi, callStoreApi, fetch |
| `src/lib/extensions/api/commands.ts` | Command registration and execution API |
| `src/lib/extensions/api/workspace.ts` | Workspace API: file changes, open files, vaults |
| `src/lib/extensions/api/telemetry.ts` | Anonymous telemetry API with rate limiting |
| `src/lib/extensions/api/events.ts` | Event subscription and emission API |
| `src/lib/extensions/api/context.ts` | Extension context and activation context |
| `src/lib/extensions/api/permissions.ts` | Permission checking system |
| `src/lib/extensions/api/index.ts` | Barrel exports and main factory function |

---

## EXPORTS

### Types

```typescript
// Core
Disposable, toDisposable

// UI
UIAPI, ToastType, DialogOptions, DialogResult, ConnectionStatus
ProgressOptions, Progress, CancellationToken
QuickPickItem, QuickPickOptions, InputBoxOptions

// Storage
ExtensionStorage

// Network
NetworkAPI, FetchOptions, FetchResponse, HttpMethod

// Commands
CommandsAPI, CommandHandler, CommandOptions

// Workspace
WorkspaceAPI, FileChangeEvent, FileChangeType, OpenFile, VaultInfo

// Telemetry
TelemetryAPI, TelemetryProperties

// Events
EventsAPI, ExtensionEvent

// Context
ExtensionContextInfo, UserContext, OrganizationContext
ExtensionActivationContext

// Main API
ExtensionClientAPI

// Permissions
ClientPermission, PermissionCategory, PermissionDeniedError
```

### Factory Functions

```typescript
// Main factory
createExtensionClientAPI(options: CreateExtensionClientAPIOptions): ExtensionClientAPI

// Individual API factories
createUIAPI(extensionId, grantedPermissions): UIAPI
createStorageAPI(extensionId, grantedPermissions): ExtensionStorage
createNetworkAPI(extensionId, grantedPermissions, allowedDomains): NetworkAPI
createCommandsAPI(extensionId, grantedPermissions): CommandsAPI
createWorkspaceAPI(extensionId, grantedPermissions): WorkspaceAPI
createTelemetryAPI(extensionId, grantedPermissions): TelemetryAPI
createEventsAPI(extensionId, grantedPermissions): EventsAPI
createActivationContext(extensionId, extensionPath, storagePath): ExtensionActivationContext

// Utilities
createLocalStorageAPI(extensionId): ExtensionStorage  // Fallback for dev
createCommandExecutor<TArgs, TResult>(api, commandId): Function
createTimer(telemetry, name): { start, stop }
withTiming<TArgs, TResult>(telemetry, name, fn): Function
withErrorTracking<TArgs, TResult>(telemetry, fn, operationName): Function
```

### Permission System

```typescript
checkPermission(extensionId, api, grantedPermissions): void
hasPermission(permission, grantedPermissions): boolean
hasPermissions(required, granted): boolean
getRequiredPermissions(api): ClientPermission[]
validatePermissions(permissions): string[]
normalizePermissions(permissions): string[]
grantPermissions(extensionId, current, new): string[]
revokePermissions(extensionId, current, toRevoke): string[]
getPermissionDescription(permission): string
getPermissionCategory(permission): string
VALID_CLIENT_PERMISSIONS: ClientPermission[]
PERMISSION_CATEGORIES: PermissionCategory[]
```

---

## IPC CHANNELS

All IPC channels registered by the Extension Client API:

### UI Channels
| Channel | Direction | Description |
|---------|-----------|-------------|
| `extension:ui:showToast` | Host → Main | Show toast notification |
| `extension:ui:showDialog` | Host → Main | Show dialog, return result |
| `extension:ui:setStatus` | Host → Main | Update status indicator |
| `extension:ui:showProgress` | Host → Main | Start progress display |
| `extension:ui:reportProgress` | Host → Main | Update progress |
| `extension:ui:cancelProgress` | Host → Main | Clean up progress |
| `extension:ui:showQuickPick` | Host → Main | Show quick pick list |
| `extension:ui:showInputBox` | Host → Main | Show input dialog |

### Storage Channels
| Channel | Direction | Description |
|---------|-----------|-------------|
| `extension:storage:get` | Host → Main | Get stored value |
| `extension:storage:set` | Host → Main | Set stored value |
| `extension:storage:delete` | Host → Main | Delete stored value |
| `extension:storage:keys` | Host → Main | List all keys |
| `extension:storage:has` | Host → Main | Check if key exists |
| `extension:storage:clear` | Host → Main | Clear all storage |

### Network Channels
| Channel | Direction | Description |
|---------|-----------|-------------|
| `extension:network:callOrgApi` | Host → Main | Call org API |
| `extension:network:callStoreApi` | Host → Main | Call store API |
| `extension:network:fetch` | Host → Main | HTTP fetch |

### Commands Channels
| Channel | Direction | Description |
|---------|-----------|-------------|
| `extension:commands:register` | Host → Main | Register command |
| `extension:commands:unregister` | Host → Main | Unregister command |
| `extension:commands:execute` | Host → Main | Execute command |
| `extension:commands:getAll` | Host → Main | List commands |
| `extension:commands:invoke` | Main → Host | Invoke handler |

### Workspace Channels
| Channel | Direction | Description |
|---------|-----------|-------------|
| `extension:workspace:getOpenFiles` | Host → Main | Get open files |
| `extension:workspace:getCurrentVault` | Host → Main | Get current vault |
| `extension:workspace:getVaults` | Host → Main | Get all vaults |
| `extension:workspace:subscribeFileChanges` | Host → Main | Subscribe to changes |
| `extension:workspace:unsubscribeFileChanges` | Host → Main | Unsubscribe |
| `extension:workspace:fileChanged` | Main → Host | File change event |

### Telemetry Channels
| Channel | Direction | Description |
|---------|-----------|-------------|
| `extension:telemetry:trackEvent` | Host → Main | Track event |
| `extension:telemetry:trackError` | Host → Main | Track error |
| `extension:telemetry:trackTiming` | Host → Main | Track timing |

### Events Channels
| Channel | Direction | Description |
|---------|-----------|-------------|
| `extension:events:subscribe` | Host → Main | Subscribe to event |
| `extension:events:unsubscribe` | Host → Main | Unsubscribe |
| `extension:events:emit` | Host → Main | Emit custom event |
| `extension:events:event` | Main → Host | Broadcast event |

### Context Channels
| Channel | Direction | Description |
|---------|-----------|-------------|
| `extension:context:get` | Host → Main | Get context info |
| `extension:context:changed` | Main → Host | Context changed |

---

## API ENDPOINTS

None (this is the client-side API, not server-side).

---

## DATABASE TABLES

None (this is the client-side API).

---

## Permission Mapping

| API Method | Required Permissions |
|------------|---------------------|
| `ui.showToast` | `ui:toast` |
| `ui.showDialog` | `ui:dialog` |
| `ui.setStatus` | `ui:status` |
| `ui.showProgress` | `ui:progress` |
| `ui.showQuickPick` | `ui:dialog` |
| `ui.showInputBox` | `ui:dialog` |
| `storage.*` | `storage:local` |
| `callOrgApi` | `network:orgApi` |
| `callStoreApi` | `network:storeApi` |
| `fetch` | `network:fetch` |
| `commands.registerCommand` | `commands:register` |
| `commands.executeCommand` | `commands:execute` |
| `workspace.onFileChanged` | `workspace:files` |
| `workspace.getOpenFiles` | `workspace:files` |
| `telemetry.*` | `telemetry` |
| `commands.getCommands` | (none) |
| `workspace.getCurrentVault` | (none) |
| `workspace.getVaults` | (none) |
| `events.*` | (none) |
| `context` | (none) |

---

## Key Design Decisions

### 1. IPC-First Architecture
All API methods are stubs that forward requests via IPC. The actual implementation happens in the main process (Agent 5's domain).

### 2. Permission Checking at Every Call
Every API method checks permissions before proceeding. This is defense-in-depth since permissions should also be checked at the IPC handler level.

### 3. Disposable Pattern
Following VS Code conventions, all subscriptions return `Disposable` objects. Extensions collect these in `context.subscriptions` for automatic cleanup.

### 4. Type Safety
Full TypeScript types with generics throughout. No `any` types except where absolutely necessary for IPC serialization.

### 5. Rate Limiting
Telemetry API includes built-in rate limiting (60 events/minute per extension) to prevent abuse.

### 6. Domain Restriction for Fetch
External HTTP requests are only allowed to domains declared in the extension manifest.

---

## Usage Example

```typescript
import type { ExtensionContext, ExtensionClientAPI } from '@blueplm/extension-api'

export async function activate(
  context: ExtensionContext,
  api: ExtensionClientAPI
) {
  context.log.info('Extension activating')
  
  // Register a command
  context.subscriptions.push(
    api.commands.registerCommand('myext.sync', async () => {
      await api.ui.showProgress(
        { title: 'Syncing...' },
        async (progress) => {
          progress.report({ message: 'Connecting...' })
          const result = await api.callOrgApi('/extensions/myext/sync', {
            method: 'POST'
          })
          api.ui.showToast('Sync complete!', 'success')
          return result.data
        }
      )
    })
  )
  
  // Subscribe to file changes
  context.subscriptions.push(
    api.workspace.onFileChanged((events) => {
      for (const event of events) {
        context.log.debug(`File ${event.type}: ${event.path}`)
      }
    })
  )
  
  // Store data
  await api.storage.set('lastSync', Date.now())
}

export function deactivate() {
  // Subscriptions are auto-disposed
}
```

---

## Typecheck Results

```
✅ All src/lib/extensions/api/* files pass typecheck
```

Note: There are errors in `src/lib/extensions/manifest.ts` from Agent 1's work, but all Agent 3 files are error-free.

---

## Next Steps

1. **Agent 5** (IPC Bridge) will implement the main process handlers for all these IPC channels
2. **Agent 2** (Extension Host) will use `createExtensionClientAPI()` to create the API for each extension
3. **Agent 4** (Registry) will use `createActivationContext()` during extension activation

---

## Notes for Other Agents

### For Agent 2 (Extension Host)
- Use `createExtensionClientAPI()` to create the API for each sandboxed extension
- Use `createActivationContext()` to create the context passed to `activate()`
- Call `disposeActivationContext()` during deactivation

### For Agent 5 (IPC Bridge)
- Import `ALL_IPC_CHANNELS` to get all channel names that need handlers
- Each handler should validate the extension ID and check permissions
- Forward results/errors back through the IPC channel

### For Agent 1 (Types)
- The `ClientPermission` type in `api/types.ts` should match the manifest permissions
- `ExtensionContext` (activation context) is defined in `api/context.ts`
