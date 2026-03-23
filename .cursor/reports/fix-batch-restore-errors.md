# Fix 5: Batch Restore Error Reporting

## Summary
Batch restore now collects per-file error messages and displays them in the failure toast, replacing the generic "X failed" message with actionable details.

## Changes Made
| File | Change |
|---|-----|
| `src/features/source/trash/TrashView.tsx` | Collect error messages, display in summary toast |

### Implementation
- Added `errorMessages: string[]` array to collect per-file errors
- On `result.success === false`: captures `result.file?.file_name` and `result.error`
- On catch: captures exception message with file ID
- After loop: if there are errors, shows them in a warning toast:
  - 3 or fewer: join all with `;`
  - More than 3: show first 3 plus "and N more"
- Added `stalePathCount` tracking for batch stale-path warnings (from Fix 4)

### Before
```
"Restored 5/8 files (3 failed)"
```

### After
```
"Restored 5/8 files (3 failed)"
"3 file(s) failed to restore: part.sldprt: Duplicate file exists; asm.sldasm: Unknown error; drawing.slddrw: Permission denied"
```

## Verification
- [x] Linter passes (0 errors)
- [x] Error messages capped at 3 to prevent toast overflow
- [x] Handles both API errors and exceptions
