---
name: Fix Drawing Sync Metadata
overview: "Fix two bugs: (1) Response mismatch causing drawing sync to receive empty parent properties, and (2) SW API loading assembly components when it should use DM API instead."
todos:
  - id: fix-api-selection
    content: Change GetPropertiesFast to only use SW API when the specific file is open in SW, otherwise use DM API
    status: pending
  - id: fix-response-id
    content: Ensure all C# CommandResult responses include the requestId for proper matching
    status: pending
  - id: verify-fifo-fallback
    content: Review FIFO fallback logic in solidworks.ts to understand when mismatches occur
    status: pending
---

# Fix Drawing Sync Metadata Bugs

## Problem 1: Drawing Sync Gets Empty Parent Properties

The log shows that when syncing metadata on a drawing, the `getProperties` call for the parent model returns empty data even though the SW service successfully reads the properties.

**Evidence from log:**

- Line 980: `getProperties (id: 48) completed in 2ms` - impossibly fast
- Lines 997-1046: SW Service logs reading `BR-107166` from file
- Line 1063: Electron receives `filePropertyCount: 0`

**Root Cause:** Response mismatch in the IPC layer. Looking at [solidworks.ts](electron/handlers/solidworks.ts) lines 836-856:

- If `requestId` in response doesn't match pending requests, it falls back to FIFO matching
- A ping response without requestId gets matched to the wrong request

**Fix:** Ensure all C# service responses include `requestId` for proper matching.

## Problem 2: Component Files (WireAssembly.SLDPRT) Opening in SolidWorks

**Confirmed:** WireAssembly.SLDPRT is a component inside BAR-XT-ASM.SLDASM. It was NOT open before sync metadata.

**Timeline from log:**

- Line 715 (22:18:34.260): `No documents open in SolidWorks`
- Line 883 (22:18:37.687): `Open doc: WireAssembly.SLDPRT` - appeared during sync!

**Root Cause:** In [Program.cs](solidworks-service/BluePLM.SolidWorksService/Program.cs) lines 426-429:

```csharp
// If SolidWorks is RUNNING (even with other files open), use SW API for consistency
if (_swApi != null && _swApi.IsSolidWorksRunning())
{
    return _swApi.GetCustomProperties(filePath, ...);
}
```

This is **overly aggressive** - it uses the full SW API whenever SolidWorks is running, even if the target file isn't open. When SW API opens an assembly via `OpenDoc6`:

1. SolidWorks loads ALL component references (like WireAssembly.SLDPRT)
2. `CloseDoc` only closes the main assembly
3. **Component files remain orphaned** in SolidWorks session

The **Document Manager API** can read properties without loading files into SolidWorks at all!

## Implementation

### Step 1: Fix API Selection Logic (PRIMARY FIX)

In [Program.cs](solidworks-service/BluePLM.SolidWorksService/Program.cs) `GetPropertiesFast`, change the logic to:

- Only use SW API if the **specific file** is already open in SolidWorks
- Otherwise use DM API (fast, doesn't load files into SW)
```csharp
static CommandResult GetPropertiesFast(string? filePath, JObject command)
{
    // ONLY use SW API if THIS SPECIFIC FILE is already open in SolidWorks
    // This prevents loading component files into SW when reading assembly properties
    if (_swApi != null && !string.IsNullOrEmpty(filePath) && _swApi.IsFileOpenInSolidWorks(filePath))
    {
        Console.Error.WriteLine($"[Service] File is open in SolidWorks, using SW API: {Path.GetFileName(filePath)}");
        return _swApi.GetCustomProperties(filePath, command["configuration"]?.ToString());
    }
    
    // Use Document Manager API - fast and doesn't load files into SW
    if (_dmApi == null)
    {
        return new CommandResult { Success = false, Error = "Document Manager not available" };
    }
    
    Console.Error.WriteLine($"[Service] Using Document Manager API for: {Path.GetFileName(filePath)}");
    return _dmApi.GetCustomProperties(filePath, command["configuration"]?.ToString());
}
```


**Important:** Remove the `IsSolidWorksRunning()` check that forces SW API usage.

### Step 2: Fix Response ID Matching

In `Program.cs`, ensure `RequestId` is always set on the CommandResult before returning:

```csharp
var result = action switch { ... };
result.RequestId = requestId;  // Always set before returning
return result;
```

### Step 3: Apply Same Fix to Other Fast Operations

Review and apply the same API selection logic to:

- `GetConfigurationsFast` 
- `GetReferencesFast`

These should also only use SW API when the specific file is open.