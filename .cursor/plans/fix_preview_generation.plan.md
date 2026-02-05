---
name: Fix Preview Generation
overview: DM API previews worked in v3.11.1 but fail in v3.12.0 with E_UNEXPECTED errors. The likely cause is the ComStabilityLayer/IMessageFilter added in recent commits interfering with Document Manager COM operations. Shell fallback is also disabled.
todos:
  - id: investigate-comstability
    content: Test if removing/deferring ComStabilityLayer initialization fixes DM API preview
    status: pending
  - id: fix-root-cause
    content: Fix ComStabilityLayer interference with DM API (move init after DM, or exclude DM calls)
    status: pending
  - id: enable-shell-fallback
    content: Re-enable shell preview fallback as backup (with optional setting)
    status: pending
---

# Fix File Preview Generation

## Root Cause Analysis

### Key Finding: Previews WORKED in v3.11.1, FAIL in v3.12.0

Comparing logs from Jan 23 (v3.11.1) vs Jan 24-25 (v3.12.0):

**Working (Jan 23, v3.11.1)**:

```
[OK] getPreview ... "success":true,"filePath":"MirrorT200-ASM-STATOR-BASE-ORING.SLDASM"
[SWThumbnail] Got preview via DM API for MirrorT200-ASM-STATOR-BASE-ORING.SLDASM
```

**Failing (Jan 24-25, v3.12.0)**:

```
[FAIL] getPreview ... "Document Manager preview failed. Shell fallback disabled to prevent file locks."
[DM-API] Failed (inner): COMException: Catastrophic failure (Exception from HRESULT: 0x8000FFFF (E_UNEXPECTED))
```

The **exact same files** that worked before now fail with `E_UNEXPECTED`.

### Likely Cause: ComStabilityLayer Interference

Between v3.11.1 and v3.12.0, a `ComStabilityLayer` with `IMessageFilter` was added to [Program.cs](solidworks-service/BluePLM.SolidWorksService/Program.cs):

```csharp
// Initialize COM Stability Layer FIRST (before any COM operations)
_comStability = new ComStabilityLayer();
var comInitResult = _comStability.Initialize();
```

The `IMessageFilter` is registered **before** the Document Manager API is initialized. This filter intercepts COM calls to handle "server busy" situations, but it may be interfering with how the Document Manager API's COM operations work.

The E_UNEXPECTED (0x8000FFFF) error typically indicates unexpected COM state or threading issues - exactly what a prematurely registered IMessageFilter could cause.

### Secondary Issue: Shell Fallback Disabled

Shell thumbnail fallback was disabled in [Program.cs](solidworks-service/BluePLM.SolidWorksService/Program.cs) (lines 539-549) to prevent file locks during folder moves.

## Solution

### Option A: Fix ComStabilityLayer Initialization Order (Recommended)

1. **Move ComStabilityLayer init AFTER DM API init** - The IMessageFilter is needed for SolidWorks API calls but may interfere with Document Manager API
2. **Or exclude DM API calls from IMessageFilter** - Only apply the filter to full SW API operations

Test by temporarily removing/commenting out the ComStabilityLayer initialization to confirm this is the cause.

### Option B: Re-enable Shell Fallback (Workaround)

If fixing ComStabilityLayer is complex, re-enable shell preview as a fallback in `GetPreviewFast`:

```csharp
// If DM API fails, try shell thumbnail
if (!_dmPreviewWorks || result == null || !result.Success)
{
    return WindowsShellThumbnail.GetThumbnail(filePath, 256);
}
```

This accepts the file lock risk but restores preview functionality.

## Files to Investigate/Modify

- `solidworks-service/BluePLM.SolidWorksService/Program.cs` - ComStabilityLayer init order
- `solidworks-service/BluePLM.SolidWorksService/ComStabilityLayer.cs` - IMessageFilter implementation
- `solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs` - DM API COM operations