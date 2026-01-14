# Agent 2 Report: Drawing PRP Resolution in SolidWorks Document Manager

## Overview

Implemented automatic drawing property resolution in `DocumentManagerAPI.cs` to handle SolidWorks drawings that use PRP (Property Reference) syntax to inherit metadata from their referenced models.

## Problem Statement

SolidWorks drawings (`.slddrw` files) often don't store custom properties directly. Instead, they use PRP references like `$PRP:"Description"` or `SW-PRP:Revision` that link to the properties of the part/assembly shown in the drawing. The Document Manager API returns these raw PRP strings rather than resolved values, causing bluePLM to display unhelpful placeholder text instead of actual metadata.

## Solution

Added PRP detection and resolution logic to `GetCustomProperties()` that:

1. **Detects** when drawing properties are empty or contain unresolved PRP references
2. **Resolves** properties by reading from the first referenced model (deterministic)
3. **Merges** resolved values intelligently, preserving any direct drawing properties
4. **Logs** diagnostic information for troubleshooting

## Technical Implementation

### File Modified

`solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs`

### New Helper Methods

Two static helper methods added for PRP pattern detection:

```csharp
/// <summary>
/// Check if any property values contain PRP references
/// </summary>
private static bool HasPrpReferences(Dictionary<string, string> properties)
{
    return properties.Any(kvp => IsPrpReference(kvp.Value));
}

/// <summary>
/// Check if a value contains PRP reference syntax
/// Handles: PRP:, $PRP:, SW-PRP: variants (case-insensitive)
/// </summary>
private static bool IsPrpReference(string? value)
{
    if (string.IsNullOrWhiteSpace(value))
        return false;

    return value.IndexOf("PRP:", StringComparison.OrdinalIgnoreCase) >= 0 ||
           value.IndexOf("SW-PRP:", StringComparison.OrdinalIgnoreCase) >= 0 ||
           value.IndexOf("$PRP:", StringComparison.OrdinalIgnoreCase) >= 0;
}
```

### Resolution Logic in GetCustomProperties()

Added after initial property read (line ~683):

```csharp
if (ext == ".slddrw")
{
    var hasPrpReferences = HasPrpReferences(fileProps);
    var needsReferencedModel = fileProps.Count == 0 || hasPrpReferences;
    
    if (needsReferencedModel)
    {
        var reason = fileProps.Count == 0 ? "no drawing properties" : "PRP references detected";
        Console.Error.WriteLine($"[DM] Drawing PRP resolution: {reason}; using first referenced model");

        var referencedProps = ReadDrawingReferencedModelProperties(dynDoc, filePath!);
        
        if (referencedProps.Count > 0)
        {
            if (fileProps.Count == 0)
            {
                // No drawing properties - use all referenced model properties
                fileProps = referencedProps;
            }
            else
            {
                // Merge: only replace missing keys or PRP-referenced values
                foreach (var kvp in referencedProps)
                {
                    if (!fileProps.TryGetValue(kvp.Key, out var currentValue) || IsPrpReference(currentValue))
                    {
                        fileProps[kvp.Key] = kvp.Value;
                    }
                }
            }

            Console.Error.WriteLine($"[DM] Drawing PRP resolution: applied {referencedProps.Count} properties from referenced model");
        }
        else
        {
            Console.Error.WriteLine("[DM] Drawing PRP resolution: no referenced model properties found");
        }
    }
}
```

## Behavior Matrix

| Scenario | Action | Example |
|----------|--------|---------|
| Drawing has no properties | Use all properties from first referenced model | Empty drawing → inherits Description, Revision, etc. |
| Drawing has PRP references | Replace only PRP values with resolved values | `$PRP:"Description"` → `"Bracket Assembly"` |
| Drawing has direct values | Preserve direct values, don't overwrite | `Revision: "B"` stays as `"B"` |
| Referenced model not found | Log warning, return whatever properties exist | Missing .sldprt → warning logged |
| No external references | Log warning, return original properties | Standalone drawing → warning logged |

## PRP Patterns Handled

The implementation detects these common SolidWorks PRP syntax variants:

- `$PRP:"PropertyName"` — Standard SW property reference
- `PRP:PropertyName` — Simplified reference
- `SW-PRP:PropertyName` — Alternate syntax
- Case-insensitive matching for all patterns

## Diagnostic Logging

All resolution activity is logged to stderr (captured by Electron):

```
[DM] Drawing PRP resolution: PRP references detected; using first referenced model
[DM] Drawing references 1 models
[DM] Primary referenced model: Part1.SLDPRT
[DM] Opened referenced model, reading properties...
[DM] Read 5 properties from referenced model
[DM] Drawing PRP resolution: applied 5 properties from referenced model
```

Or when no model is found:

```
[DM] Drawing PRP resolution: no drawing properties; using first referenced model
[DM] No external references found in drawing
[DM] Drawing PRP resolution: no referenced model properties found
```

## Edge Cases Handled

1. **Empty drawing properties** — Falls back to referenced model completely
2. **Mixed properties** — Preserves direct values, only resolves PRP references
3. **Missing referenced file** — Logs error, returns available properties
4. **No external references** — Logs warning, returns original (possibly empty) properties
5. **Referenced model has no properties** — Returns original drawing properties unchanged

## Dependencies

Leverages existing method `ReadDrawingReferencedModelProperties()` which:
- Uses `SwDMSearchOption` with filter for parts/assemblies
- Opens the first referenced model via Document Manager
- Reads file-level properties, then falls back to active configuration
- Properly closes documents to release file locks

## Testing Notes

**Manual testing recommended:**
1. Open bluePLM with a SolidWorks drawing that has PRP references
2. View the drawing's properties in the UI
3. Verify resolved values appear instead of `$PRP:...` syntax
4. Check logs for resolution path diagnostics

**Test files needed:**
- Drawing with `$PRP:"Description"` property
- Drawing with no custom properties
- Drawing with mixed direct and PRP-referenced properties
- Drawing with missing referenced model

## Limitations

1. **First model only** — Uses first external reference for determinism; drawings with multiple sheets referencing different models may not resolve all properties correctly
2. **File must exist** — Referenced model must be accessible on disk
3. **No partial resolution** — Values like `"Drawn for $PRP:"Customer""` get fully replaced, not partially resolved
4. **Configuration-specific properties** — Falls back to active configuration if file-level empty; may not match drawing's specific configuration reference

## Files Changed

| File | Change |
|------|--------|
| `solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs` | Added PRP detection helpers and resolution logic |
| `AGENT2_REPORT.md` | This report |

## Build Status

No build executed. C# file has no linter errors.
