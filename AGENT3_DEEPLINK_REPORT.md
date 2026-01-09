# Agent 3: Deep Link Protocol Implementation Report

## Summary

Successfully implemented the `blueplm://` deep link protocol handler in the Electron app. The implementation enables users to click "Install in BluePLM" links on extensions.blueplm.io to automatically trigger extension installation in the desktop app.

## Files Created/Modified

### Created
- **`electron/handlers/deepLink.ts`** - Core deep link handler with URL parsing, validation, and IPC

### Modified
- **`electron/handlers/index.ts`** - Added deep link handler registration and exports
- **`electron/main.ts`** - Protocol registration and platform-specific event handlers
- **`electron/preload.ts`** - IPC bridge for renderer to receive deep link events

## Implementation Details

### URL Format Supported

```
blueplm://install/{extension-id}
blueplm://install/{extension-id}?version={version}
```

Examples:
- `blueplm://install/google-drive` - Install latest version
- `blueplm://install/google-drive?version=1.2.0` - Install specific version

### Cross-Platform Support

| Platform | How Deep Links Arrive | Handler |
|----------|----------------------|---------|
| **Windows** | Command line args on `second-instance` event | `app.on('second-instance', ...)` |
| **macOS** | `open-url` event | `app.on('open-url', ...)` |
| **Linux** | Command line args on `second-instance` event | `app.on('second-instance', ...)` |

### Cold Start vs Already Running

1. **Cold Start (App Not Running)**
   - Deep link parsed from `process.argv` at startup
   - Stored as pending via `storePendingDeepLink()`
   - Processed after window is ready (`registerDeepLinkHandlers()` calls `processPendingDeepLink()` with 1s delay)

2. **App Already Running**
   - Windows/Linux: `second-instance` event fires with command line args
   - macOS: `open-url` event fires with URL
   - Handler immediately sends IPC to renderer

### Security Measures

1. **Extension ID Validation** - Must match pattern: `/^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/`
2. **Version Validation** - Must be valid semver format
3. **URL Parsing** - Safe parsing with error handling for malformed URLs
4. **No Automatic Installation** - Deep link only triggers renderer notification; user confirmation required

### IPC Bridge

The renderer can listen for deep link install requests:

```typescript
// In renderer
const cleanup = window.electronAPI.onDeepLinkInstall((data) => {
  console.log('Install requested:', data.extensionId, data.version)
  // Show installation UI, get user confirmation, then install
  
  // Acknowledge when done
  window.electronAPI.acknowledgeDeepLink(data.extensionId, true)
})

// Cleanup on unmount
cleanup()
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Website                                   │
│  extensions.blueplm.io/extension/google-drive                   │
│                                                                  │
│  <a href="blueplm://install/google-drive">Install in BluePLM</a>│
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Operating System                            │
│                                                                  │
│  Protocol Handler: blueplm:// → BluePLM.exe                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Electron Main Process                       │
│                                                                  │
│  ┌──────────────────┐    ┌─────────────────────────────────┐   │
│  │ main.ts          │    │ handlers/deepLink.ts            │   │
│  │                  │    │                                 │   │
│  │ - Protocol reg   │───▶│ - parseDeepLink()               │   │
│  │ - open-url event │    │ - handleDeepLink()              │   │
│  │ - second-instance│    │ - handleInstallDeepLink()       │   │
│  └──────────────────┘    │ - IPC: deep-link:install-ext    │   │
│                          └───────────────┬─────────────────┘   │
└──────────────────────────────────────────┼──────────────────────┘
                                           │
                                           ▼ IPC
┌─────────────────────────────────────────────────────────────────┐
│                      Renderer Process                            │
│                                                                  │
│  window.electronAPI.onDeepLinkInstall((data) => {               │
│    // extensionId, version, timestamp                            │
│    // Navigate to extensions UI                                  │
│    // Trigger install with confirmation                          │
│  })                                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Testing Instructions

### Manual Testing

1. **Build the app** (or run in dev mode)
2. **Register protocol** - App registers on first run
3. **Test with browser** - Open: `blueplm://install/google-drive`
4. **Expected behavior**:
   - App focuses/launches
   - Renderer receives install event via IPC
   - (Once renderer handler is implemented) Extension install UI appears

### Windows Registry Verification

After running the app once, check:
```
HKEY_CURRENT_USER\Software\Classes\blueplm\shell\open\command
```
Should point to BluePLM executable.

### macOS Verification

Check Info.plist (in packaged app) or test with:
```bash
open "blueplm://install/test-extension"
```

## Remaining Work (Agent 4 / Renderer)

The renderer needs to implement a handler for the `onDeepLinkInstall` event:

1. Listen for `deep-link:install-extension` IPC events
2. Navigate to Extensions page/UI
3. Show confirmation dialog
4. Trigger `extensions:install` IPC call
5. Acknowledge completion with `acknowledgeDeepLink()`

## Dependencies

No new dependencies added. Uses only Electron built-in APIs:
- `app.setAsDefaultProtocolClient()`
- `app.on('open-url', ...)`
- `app.on('second-instance', ...)`
- `ipcMain.handle()` / `ipcRenderer.invoke()`

## Status

✅ **Complete** - Deep link protocol fully implemented and ready for renderer integration.
