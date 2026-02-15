# Agent 4 Report — Regression Test Scripts

## Summary

Created 10 comprehensive `.bptest` regression test scripts plus a README in `tests/regression/`. These scripts automate the scenarios from the [human regression test checklist](../../tests.md) using bluePLM's terminal command system and assertion framework.

## Files Created

| File | Description |
|------|-------------|
| `tests/regression/01-file-sync.bptest` | File sync & download lifecycle (sync, remove local, download, get-latest) |
| `tests/regression/02-checkout-checkin.bptest` | Checkout/checkin lifecycle (checkout, checkin, discard, checkin with metadata) |
| `tests/regression/03-file-operations.bptest` | File management (rename, move, copy, nested folders) |
| `tests/regression/04-delete-restore.bptest` | Delete & trash recovery (server delete, restore, local delete, re-download) |
| `tests/regression/05-metadata.bptest` | Metadata read/write (set-metadata, pending verification, discard restores original) |
| `tests/regression/06-version-history.bptest` | Version tracking (3 sequential checkins, version number verification) |
| `tests/regression/07-collaboration.bptest` | Collaboration features (watch, unwatch; multi-user tests documented as comments) |
| `tests/regression/08-batch-operations.bptest` | Batch operations (checkout-all, checkin-all with 3 files) |
| `tests/regression/09-metadata-sw.bptest` | SolidWorks metadata (placeholder — requires SW fixture files) |
| `tests/regression/10-edge-cases.bptest` | Edge cases (special chars, empty folders, rapid cycles, non-existent files, workflow states) |
| `tests/regression/README.md` | Usage instructions, format reference, and writing guide |

## Checklist Coverage

| Checklist Section | Script(s) | Coverage |
|-------------------|-----------|----------|
| 1. Startup & Auth | — | Not automatable (UI-only, app launch) |
| 2. File Sync & Download | 01 | Sync, download, get-latest, read-only verification |
| 3. Check Out / Check In | 02, 08 | Checkout, checkin, discard, bulk operations |
| 4. SolidWorks Metadata | 05, 09 | Generic metadata fully covered; SW-specific is placeholder |
| 5. File Operations | 03 | Rename, move, copy, nested folders |
| 6. Delete & Restore | 04 | Server delete, restore from trash, local delete, re-download |
| 7. Assembly & References | — | Requires SW files (not automatable without fixtures) |
| 8. Export | — | Requires SW and external file verification |
| 9. Collaboration | 07 | Watch/unwatch; notify/review documented for multi-user |
| 10. UI & Navigation | — | Not automatable (visual/interaction tests) |
| 11. Settings | — | Not automatable (UI configuration screens) |
| 12. Version History | 06 | 3-version sequence with get-latest verification |
| 13. Edge Cases | 10 | Special chars, empty folders, rapid cycles, workflow states, graceful failure |

## Design Decisions

1. **Self-contained scripts**: Each script creates its own test data under `_data/<name>/` and cleans up in `# Teardown`
2. **Generous wait times**: 2000–3000ms after server operations to allow async propagation
3. **Assert-heavy**: Multiple assertion flags per assert command to catch partial failures
4. **Comments for non-automatable items**: Multi-user tests, SW-specific tests, and UI tests are documented as comments within their respective scripts
5. **SW script as placeholder**: Script 09 requires actual SolidWorks files which can't be auto-generated; it documents the expected flows for future use
6. **Path rewriting compatible**: All paths use the `_data/` prefix convention; the test runner prepends the sandbox folder name automatically

## Assertion Flags Used

- `--status` (synced, checked-out, cloud)
- `--version` (1, 2, 3)
- `--readonly` / `--writable`
- `--checked-out-by=me`
- `--exists` / `--not-exists`
- `--part` / `--desc` / `--rev`
- `--has-pending` / `--no-pending`
- `--state` (in_review, released)

## Not Covered (Requires Manual Testing)

- **Startup & authentication** — app launch, splash screen, OAuth
- **UI navigation** — grid/list view, sidebar modules, drag & drop
- **Assembly references** — requires actual SW assembly files
- **Export** — requires SW and external file format verification
- **Settings screens** — UI-only configuration
- **Offline behavior** — requires network manipulation
- **Auto-update** — requires version server
