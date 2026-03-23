# Follow-up: Race Window Between `renameFileInStore` and `updateFolderPath`

## Summary
There is a race window between `renameFileInStore` (instant, synchronous store update) and `updateFolderPath` (async, server round-trips). During this window, a realtime event triggering `loadFiles` could rebuild the `pdmMap` from stale server data.

## How Fix 1 Mitigates This
Before Fix 1, the race was critical:
- Store had new paths (via `renameFileInStore`)
- Store had old `pdmData.file_path` (not updated)
- Server had old `file_path` (not yet updated)
- A `loadFiles` refresh would create ghost files because `pdmData.file_path` didn't match `relativePath`

After Fix 1:
- Store has new paths AND new `pdmData.file_path` (updated immediately)
- Server still has old `file_path` during the window
- A `loadFiles` refresh during this window could still temporarily overwrite the store's correct `pdmData.file_path` with stale server data

## Remaining Risk
The race window is:
1. `renameFileInStore` + `updateFilesInStore` complete (instant)
2. ... window opens ...
3. `updateFolderPath` starts updating files one by one on server
4. ... window closes when all server updates complete ...

During this window, if `loadFiles` runs (triggered by realtime, file watcher, or manual refresh):
- It fetches server data where some files have old paths and some have new
- It rebuilds `pdmMap` from server data, potentially overwriting the store's correct state
- This creates a temporary inconsistency that self-resolves on the next sync

## Possible Mitigations (Deferred)

### Option A: Suppress `loadFiles` during rename
Add a `renameInProgress` flag to the store. `loadFiles` checks this flag and skips or debounces when true.

**Pros**: Simple, effective
**Cons**: Could delay important updates; risk of flag getting stuck if rename throws

### Option B: Debounce realtime events during operations
Buffer realtime events during active commands and replay them after the command completes.

**Pros**: Handles all operations, not just rename
**Cons**: Complex; risk of missed events

### Option C: Server-side transaction (RPC)
If `updateFolderPath` is wrapped in an RPC (see `updatefolderpath-rpc` report), the server update becomes atomic and the window shrinks to near-zero.

**Pros**: Eliminates the root cause
**Cons**: Requires migration

## Priority
**Low** -- Fix 1 makes this race benign in most cases. The temporary inconsistency self-resolves. Option C (RPC) would be the cleanest long-term fix.
