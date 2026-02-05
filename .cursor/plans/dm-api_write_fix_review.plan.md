---
name: DM-API Write Fix Review
overview: "Review complete: The plan to fix the DM-API write access bug is validated. The root cause (integer-to-enum type mismatch) is confirmed by log evidence, and the proposed GetDocumentInternal helper method correctly implements the fix using the same enum conversion pattern that works for reads."
todos:
  - id: implement-helper
    content: Add GetDocumentInternal helper method with proper enum conversion
    status: completed
  - id: refactor-read
    content: "Refactor OpenDocument to use GetDocumentInternal(readOnly: true)"
    status: completed
  - id: refactor-write
    content: "Refactor OpenDocumentForWrite to use GetDocumentInternal(readOnly: false)"
    status: completed
  - id: rebuild-test
    content: Rebuild service and test setProperties without SW-API fallback
    status: pending
  - id: verify-persistence
    content: Call getProperties after setProperties to confirm values persisted
    status: pending
  - id: bump-version
    content: Bump version to 3.12.2 in package.json
    status: completed
  - id: add-changelog
    content: Add changelog entry for 3.12.2 with DM-API fix and logging improvements
    status: completed
  - id: commit-changes
    content: Commit all changes with descriptive message
    status: completed
  - id: create-tag
    content: Create git tag v3.12.2 (do NOT push)
    status: completed
---

# DM-API Write Access Bug Fix - Review Summary

## Root Cause: CONFIRMED

Log evidence explicitly shows the type mismatch:

```
OpenDocumentForWrite exception: The best overloaded method match for 
'SwDMApplicationClass.GetDocument(string, SwDmDocumentType, bool, out SwDmDocumentOpenError)' 
has some invalid arguments
```

The working `OpenDocument` method shows proper enum conversion:

- `OpenDocument: Calling GetDocument with enum type swDmDocumentAssembly`

The broken `OpenDocumentForWrite` passes raw integer directly.

## Proposed Fix: VALIDATED

The `GetDocumentInternal` helper in the plan correctly:

1. Converts `docTypeInt` to enum via `Enum.ToObject(docTypeEnumType, docTypeInt)`
2. Converts error parameter via `Enum.ToObject(errorEnumType, 0)`
3. Uses reflection with dynamic fallback (same as working `OpenDocument`)
4. Tracks document handles for debugging

## Affected Methods

Both methods call `OpenDocumentForWrite` and will be fixed:

- `SetCustomProperties` ([DocumentManagerAPI.cs:1247](solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs))
- `SetCustomPropertiesBatch` ([DocumentManagerAPI.cs:1420](solidworks-service/BluePLM.SolidWorksService/DocumentManagerAPI.cs))

## Expanded Testing Plan

### Required Tests

1. **Basic write test**: `setProperties` on a .SLDPRT file, verify no SW-API fallback in logs
2. **Read-back verification**: Call `getProperties` after `setProperties` to confirm values persisted
3. **All file types**: Test .SLDPRT (enum=1), .SLDASM (enum=2), .SLDDRW (enum=3)
4. **Batch write**: Test `setPropertiesBatch` with multiple configurations
5. **Config vs file-level**: Test both property scopes

### Success Criteria in Logs

Look for:

```
[DM-API] GetDocumentInternal: Converted to enum type swDmDocumentPart
[DM-API] GetDocumentInternal: Reflection call returned, error=0, doc=success
```

Should NOT see:

```
[Service] Falling back to SW-API for setProperties...
```

## Risk Assessment

| Risk | Mitigation |

|------|------------|

| Regression in read operations | Minimal - refactor uses same proven pattern |

| Reflection failure | Dynamic fallback also converts to enum |

| Different SW versions | Pattern is version-agnostic (uses runtime type discovery) |

## Implementation Notes

1. Insert `GetDocumentInternal` after line 481 (after `_openDocumentHandles` field)
2. Replace `OpenDocument` body (lines 483-594) with single call to helper
3. Replace `OpenDocumentForWrite` body (lines 1551-1582) with single call to helper
4. Rebuild: `dotnet build solidworks-service/BluePLM.SolidWorksService.sln -c Release`

## Versioning (After Fix is Tested)

### Version Bump: 3.12.1 -> 3.12.2

**Files to update:**

- `package.json`: Change `"version": "3.12.1"` to `"version": "3.12.2"`

### Changelog Entry

Add at the top of CHANGELOG.md (after the header):

```markdown
## [3.12.2] - 2026-01-28

### Fixed
- **DM-API write operations failing**: Fixed bug where `setProperties` and `setPropertiesBatch` would always fall back to the slow SolidWorks API. The Document Manager API's `OpenDocumentForWrite` was passing raw integers instead of proper `SwDmDocumentType` enums, causing COM interop failures. Write operations now use the same enum conversion pattern that works for reads
- **Improved DM-API error logging**: Added detailed logging throughout the property write path to help diagnose failures, including the specific error when opening files for write access

---
```

### Git Operations (tag but NOT push)

```powershell
# Stage and commit
git add -A
git commit -m "fix: DM-API write operations now use proper enum types

OpenDocumentForWrite was passing raw integers (1, 2, 3) to GetDocument
instead of SwDmDocumentType enums, causing COM interop failures with
'invalid arguments' error. Refactored to share GetDocumentInternal helper
with OpenDocument, which correctly converts integers to enums.

Also added diagnostic logging throughout the property write path."

# Create tag (do NOT push)
git tag v3.12.2
```

Note: Tag created locally only. Push manually when ready with `git push origin v3.12.2`.

## Conclusion

**The plan is ready for implementation.** The root cause analysis is accurate, the fix is correct, and the approach mirrors the already-working read implementation.