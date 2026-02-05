---
name: Fix DM API Unavailable After ReleaseHandles
overview: Fix a critical bug where the Document Manager API becomes permanently unavailable after a folder move operation calls `ReleaseHandles()`. The root cause is a short-circuit check in Program.cs that prevents lazy reinitialization.
todos:
  - id: remove-early-checks
    content: Remove or modify the redundant early IsAvailable checks in Program.cs GetBomFast, GetPropertiesFast, GetConfigurationsFast, GetReferencesFast, and GetPreviewFast methods
    status: completed
  - id: add-logging
    content: Add logging when reinitialization occurs after ReleaseHandles to aid debugging
    status: completed
  - id: test-folder-move
    content: Test that DM operations work after folder move operations
    status: pending
---

# Fix Document Manager API Unavailability After ReleaseHandles

## Root Cause Analysis

### The Bug

After calling `releaseHandles` (triggered by folder move operations), the Document Manager API becomes permanently unavailable until the service is restarted.

### Evidence from Logs

```
[04:27:40] Service started with DM License: provided
[04:27:44] DM API working: "Already initialized. _dmApp is available"
[04:28:31] releaseHandles called for folder move
[04:28:31] "COM object released successfully" - _dmApp set to null
[04:28:31] Response: {"dmAvailable": false}
[04:38:58] All subsequent DM operations fail: "Document Manager not available"
```

### Code Flow Analysis

**1. The `ReleaseHandles()` method correctly resets state:**

```2517:2518:solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs
_disposed = false;
_initialized = false;
```

This SHOULD allow lazy reinitialization on the next call to `Initialize()`.

**2. The bug is in Program.cs - early check prevents reinitialization:**

```448:456:solidworks-service/BluePLM.SolidWorksService/Program.cs
if (_dmApi == null || !_dmApi.IsAvailable)
{
    Console.Error.WriteLine($"[Service] Document Manager not available for: {Path.GetFileName(filePath)}");
    return new CommandResult 
    { 
        Success = false, 
        Error = "Document Manager not available. Configure DM license in Settings -> Integrations -> SOLIDWORKS." 
    };
}
```

**3. The `IsAvailable` property just checks current state:**

```75:76:solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs
public bool IsAvailable => _initialized && _dmApp != null;
```

After `ReleaseHandles()`: `_initialized = false`, `_dmApp = null`, so `IsAvailable = false`.

**4. The actual DM methods DO call `Initialize()` which would reinitialize:**

```621:624:solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs
public CommandResult GetCustomProperties(string? filePath, string? configuration = null)
{
    if (!Initialize() || _dmApp == null)
        return new CommandResult { Success = false, Error = _initError ?? "Document Manager not available" };
```

But this code is NEVER reached because Program.cs returns early!

### The Root Cause

Program.cs checks `IsAvailable` and returns an error **before** calling the actual DM method. The DM methods internally call `Initialize()` which would reinitialize the API, but they are never invoked.

## Solution

### Option A (Recommended): Remove redundant early checks in Program.cs

The DM methods already handle initialization internally and return proper error messages. The early `IsAvailable` check in Program.cs is:

1. **Redundant** - DM methods check this internally
2. **Harmful** - It prevents lazy reinitialization after `ReleaseHandles()`

**Files to modify:**

- [solidworks-service/BluePLM.SolidWorksService/Program.cs](solidworks-service/BluePLM.SolidWorksService/Program.cs)

Remove or modify the early `IsAvailable` checks in:

- `GetBomFast()` (lines 367-375)
- `GetPropertiesFast()` (lines 400-408)
- `GetConfigurationsFast()` (lines 448-456)
- `GetReferencesFast()` (lines 478-486)
- `GetPreviewFast()` (need to check this one)

### Option B (Alternative): Explicitly call Initialize() before IsAvailable check

Change the checks to call `Initialize()` first, triggering reinitialization:

```csharp
// Before
if (_dmApi == null || !_dmApi.IsAvailable)

// After
if (_dmApi == null || (!_dmApi.Initialize() || !_dmApi.IsAvailable))
```

This is more defensive but adds unnecessary complexity since DM methods already do this.

## Changes Made

### Program.cs - Removed redundant IsAvailable checks

Modified 7 methods to only check for `_dmApi == null` instead of `_dmApi == null || !_dmApi.IsAvailable`:

1. **GetBomFast()** - Removed early `IsAvailable` check
2. **GetPropertiesFast()** - Removed early `IsAvailable` check
3. **GetConfigurationsFast()** - Removed early `IsAvailable` check
4. **GetReferencesFast()** - Removed early `IsAvailable` check
5. **GetPreviewFast()** - Removed `IsAvailable` from the condition
6. **SetPropertiesFast()** - Removed `IsAvailable` from the condition
7. **SetPropertiesBatchFast()** - Removed `IsAvailable` from the condition

Added comments explaining why we only check for null:

```csharp
// Note: We only check for null here. The DM methods internally call Initialize()
// which handles reinitialization after ReleaseHandles() was called.
```

### DocumentManagerAPI.cs - Added reinitialization logging

Added logging in `Initialize()` to indicate when reinitialization is happening after `ReleaseHandles()` was called:

```csharp
// If we get here after ReleaseHandles() was called, this is a reinitialization
if (_dmApp == null && _dmAssembly != null)
{
    LogDebug("*** REINITIALIZING after ReleaseHandles() ***");
}
```

## Testing Strategy

1. Start the app with a valid DM license
2. Verify DM operations work (e.g., preview extraction, getting configurations)
3. Trigger a folder move operation (which calls `releaseHandles`)
4. Verify DM operations still work after the move
5. Repeat steps 3-4 multiple times to ensure reliability