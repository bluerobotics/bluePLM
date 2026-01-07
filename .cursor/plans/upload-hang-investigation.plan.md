# Upload Hang Investigation

## Symptom
- Uploading files hangs indefinitely
- Affects both single file uploads AND bulk uploads (3000 files)
- No network activity visible in status bar after initial activity
- Previously uploads "worked fine" - this is a regression
- **CRITICAL: No UI feedback at all** - no spinners, no toasts, nothing visible
  - BUT terminal shows tons of activity (syncFile logs, SW service calls)

## Key Finding: UI Not Updating
The terminal shows:
- `[syncFile] Starting sync` logs ✓
- `[syncFile] Insert SUCCESS` logs ✓  
- SolidWorks service `getProperties` calls ✓

But MISSING from terminal:
- `[Commands] Executing: sync` log ✗
- No `addProgressToast` calls visible ✗

This suggests either:
1. The command executor isn't being used (code path bypasses it)
2. The command is running but UI updates aren't triggering re-renders
3. There's a race condition or async issue preventing UI updates

## Upload Flow Analysis

```
User Action: Click "Sync" / "First Check In"
         ↓
sync.ts: syncCommand.execute()
         ↓
For each file (in parallel, up to 20 concurrent):
    ↓
    ├── 1. window.electronAPI.readFile(file.path)
    │       → IPC call to Electron main process
    │       → fs.readFileSync() + SHA-256 hash
    │       → Returns base64 content
    │
    ├── 2. extractSolidWorksMetadata() [if SW file]
    │       → IPC call to SolidWorks service
    │       → Can be skipped if service not running
    │
    └── 3. syncFile() in supabase/files.ts
            ↓
            ├── 3a. client.storage.list() - Check if content exists (dedup)
            │       → Supabase Storage API call
            │
            ├── 3b. client.storage.upload() - Upload if not exists
            │       → Supabase Storage API call (LARGE payload)
            │
            ├── 3c. client.from('files').select() - Check DB for existing
            │       → Supabase Database API call
            │
            └── 3d. client.from('files').insert() or .update()
                    → Supabase Database API call
```

## Where Could the Hang Occur?

### Level 1: IPC / Electron (Unlikely if single file hangs)
- `readFile` IPC call could hang if main process is blocked
- BUT: Uses synchronous fs.readFileSync, shouldn't hang

### Level 2: Supabase Client Initialization (⚠️ LIKELY)
- If `getSupabaseClient()` returns a misconfigured client
- If auth token is expired/invalid and client is in bad state
- If there's a socket/connection issue that never resolves

### Level 3: Supabase Storage API (⚠️ LIKELY)
- `client.storage.list()` or `client.storage.upload()` hangs
- Possible causes:
  - Storage bucket misconfiguration
  - RLS policy blocking access silently
  - Rate limiting (429) not being handled
  - Network timeout with no client-side timeout
  - TLS/SSL handshake stalling

### Level 4: Supabase Database API
- DB queries hanging (connection pool exhausted, locks, etc.)
- Less likely for single-file uploads

## Investigation Steps

### Step 1: Check Supabase Client Configuration
- Review `src/lib/supabase/client.ts`
- Check if there are any timeouts configured
- Verify auth token handling

### Step 2: Add Debug Logging
- Add precise timing logs before/after each async operation
- Identify exactly which operation hangs

### Step 3: Test Components in Isolation
- Test storage.list() independently
- Test storage.upload() independently  
- Test database operations independently

### Step 4: Check Supabase Dashboard
- Look at Supabase project dashboard for:
  - Storage bucket status
  - Database connection pool usage
  - Rate limit metrics
  - Error logs

### Step 5: Network Analysis
- Check if request is even being sent (browser DevTools Network tab)
- Check for CORS or other network-level issues

## Files to Review
- `src/lib/supabase/client.ts` - Client initialization
- `src/lib/supabase/files.ts` - syncFile function
- `src/lib/commands/handlers/sync.ts` - Command flow
- `electron/handlers/fs.ts` - File reading IPC

## Questions for User
1. When did this start happening? Any recent changes?
2. Does it hang on the first file or after some succeed?
3. Is there any pattern to which files hang (size, type)?
4. Can you open browser DevTools and check the Network tab during an upload attempt?
5. Check Supabase Dashboard - any errors in logs?
