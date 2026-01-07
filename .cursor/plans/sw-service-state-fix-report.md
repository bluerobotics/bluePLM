# SolidWorks Service State Synchronization Fix - Report

## Summary

Successfully implemented all fixes to address the bug where `swServiceProcess` remains set after the SW service crashes, causing "Service already running" errors when the user tries to restart it.

## Changes Made

### File: `electron/handlers/solidworks.ts`

#### 1. Configurable Timeout for `sendSWCommand()` (Task 2)

Added an optional `options` parameter to allow custom timeouts:

```typescript
async function sendSWCommand(
  command: Record<string, unknown>,
  options?: { timeoutMs?: number }
): Promise<SWServiceResult> {
  // ...
  const timeoutMs = options?.timeoutMs ?? 300000 // Default 5 min
  // ...
}
```

#### 2. Process Liveness Check in `startSWService()` (Task 1)

Before returning "already running", the function now verifies the process is actually alive with a 5-second timeout ping:

```typescript
if (swServiceProcess) {
  // Verify process is actually alive with a quick ping (5 second timeout)
  const pingResult = await sendSWCommand({ action: 'ping' }, { timeoutMs: 5000 })
  
  if (!pingResult.success) {
    // Process is stale - clean up and continue to start a new one
    log('[SolidWorks] Stale process detected, cleaning up')
    try {
      swServiceProcess.kill()
    } catch { /* ignore */ }
    swServiceProcess = null
    
    // Reject all pending requests
    for (const [, req] of swPendingRequests) {
      req.reject(new Error('Service process was stale'))
    }
    swPendingRequests.clear()
  } else {
    // Process is alive - proceed with existing behavior
    // ...
  }
}
```

#### 3. Force-Restart IPC Handler (Task 3)

Added new `solidworks:force-restart` handler for stuck situations:

```typescript
ipcMain.handle('solidworks:force-restart', async (_, dmLicenseKey?: string) => {
  log('[SolidWorks] Force restart requested')
  
  // Kill existing process if any
  if (swServiceProcess) {
    try {
      swServiceProcess.kill('SIGKILL')
    } catch { /* ignore */ }
    swServiceProcess = null
  }
  
  // Reject all pending requests
  for (const [, req] of swPendingRequests) {
    req.reject(new Error('Service force-restarted'))
  }
  swPendingRequests.clear()
  
  // Start fresh
  return startSWService(dmLicenseKey)
})
```

Also added `'solidworks:force-restart'` to the `unregisterSolidWorksHandlers()` cleanup list.

#### 4. Improved Exit Handler Reliability (Task 4)

Enhanced process event handlers to properly clean up pending requests:

- **`error` event**: Now rejects all pending requests with the error message
- **`close` event**: Now rejects all pending requests with "Service process exited"
- **`disconnect` event**: New handler added to catch disconnection cases

```typescript
swServiceProcess.on('error', (err) => {
  log('[SolidWorks Service] Process error: ' + String(err))
  swServiceProcess = null
  
  // Reject all pending requests
  for (const [, req] of swPendingRequests) {
    req.reject(new Error('Service process error: ' + String(err)))
  }
  swPendingRequests.clear()
})

swServiceProcess.on('close', (code, signal) => {
  log('[SolidWorks Service] Process exited with code: ' + code + ' signal: ' + signal)
  swServiceProcess = null
  
  // Reject all pending requests
  for (const [, req] of swPendingRequests) {
    req.reject(new Error('Service process exited'))
  }
  swPendingRequests.clear()
})

swServiceProcess.on('disconnect', () => {
  log('[SolidWorks Service] Process disconnected')
  swServiceProcess = null
  
  // Reject all pending requests
  for (const [, req] of swPendingRequests) {
    req.reject(new Error('Service process disconnected'))
  }
  swPendingRequests.clear()
})
```

## Verification

- [x] `npm run typecheck` passes
- [ ] Manual test: Kill SW service process externally, verify UI can restart it
- [ ] Manual test: Start service, use it, stop it, start it again
- [ ] No regressions in normal SW service operations

## Quality Compliance

- ✅ No `any` types introduced
- ✅ Proper error handling with try/catch
- ✅ Clear logging for debugging
- ✅ Follows existing patterns in the codebase
- ✅ Backwards compatible (no changes to IPC API signatures for existing handlers)
