# RCA: Auto-refresh Overwrites Part Number with Stale File-Level Property

## Status: FIXED

## Summary

When a user edits a SolidWorks file and saves (e.g., changing "use description in BOM" checkbox), the FileWatcher triggers an auto-refresh that reads metadata from the file. For files where "Save to File" was never used, stale legacy file-level properties (like BR-100115) would overwrite the correct BluePLM database values (like BR-107163).

## Root Cause Chain

1. `WLP-BULKHEAD-JPT.SLDPRT` created long ago with file-level `Number = "BR-100115"` (legacy)
2. BluePLM imported file with correct part number **BR-107163** in database
3. **"Save to File" was never run** - SW file properties never updated to match DB
4. File properties remained stale: `Number = BR-100115` while DB has `part_number = BR-107163`
5. User edits file in SolidWorks (changes "use description in BOM")
6. FileWatcher detects file change, triggers `refreshMetadataForFiles()`
7. Auto-refresh reads stale `Number = BR-100115` from file-level properties
8. Auto-refresh **overwrites** correct pendingMetadata with stale value

## The Fix

Modified `refreshMetadataForFiles()` in [`src/lib/commands/handlers/syncMetadata.ts`](../../src/lib/commands/handlers/syncMetadata.ts) to only refresh `revision` for parts/assemblies.

**Before:** Auto-refresh updated `part_number`, `tab_number`, `description`, and `revision` from file
**After:** Auto-refresh only updates `revision` for parts/assemblies

This aligns with the documented design:
> "For PARTS/ASSEMBLIES (.sldprt/.sldasm): PUSH - BluePLM is the source of truth for part/assembly metadata"

## Why BluePLM Didn't Write to the File

BluePLM only writes to SW files when explicitly triggered via "Save to File" button. It doesn't automatically sync DB → file. This is by design (avoids modifying files without user consent), but means legacy files can have stale properties until the user runs "Save to File".

## Files Modified

- `src/lib/commands/handlers/syncMetadata.ts` - Lines 628-670, removed `part_number`, `tab_number`, `description` from auto-refresh for parts/assemblies

## Testing

1. Edit a multi-config SW file in SolidWorks (e.g., change "use description in BOM")
2. Save the file
3. Verify in BluePLM that the part number is NOT overwritten with file-level values
4. Verify revision IS updated if changed in file
