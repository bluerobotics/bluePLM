# Regression Test Scripts

Automated `.bptest` regression test scripts for bluePLM. These scripts cover the same scenarios as the [human regression test checklist](../../tests.md), expressed as executable command sequences with machine-verifiable assertions.

## How to Run

### From the UI

1. Open **Settings > Dev Tools > Test Runner**
2. Click **Run All** to execute every script in this folder
3. Or click a specific script to run it individually

### From the Terminal

```
run-tests tests/regression/
run-test tests/regression/01-file-sync.bptest
```

## How It Works

- The test runner creates a temporary **sandbox folder** (e.g., `0 - Tests/`) in your vault
- All file paths in scripts are automatically prefixed with the sandbox folder
- Scripts run sequentially; assertions that fail stop the current section and skip to teardown
- The `# Teardown` section **always runs**, even on failure, to clean up test data
- After all scripts finish, the sandbox folder is deleted from the server

## Prerequisites (`@requires` Tags)

| Tag | Meaning |
|-----|---------|
| `vault` | A vault must be connected (most scripts) |
| `sw` | SolidWorks must be installed and the SW service running |
| `multi-user` | Requires a second user account for collaboration tests |
| `admin` | Requires admin role for admin-only operations |

Scripts with unmet requirements are skipped automatically.

## Scripts

| # | Script | Checklist Section | Requires |
|---|--------|-------------------|----------|
| 01 | `01-file-sync.bptest` | File Sync & Download | vault |
| 02 | `02-checkout-checkin.bptest` | Check Out / Check In | vault |
| 03 | `03-file-operations.bptest` | File Operations | vault |
| 04 | `04-delete-restore.bptest` | Delete & Restore | vault |
| 05 | `05-metadata.bptest` | Metadata Operations | vault |
| 06 | `06-version-history.bptest` | Version History | vault |
| 07 | `07-collaboration.bptest` | Collaboration | vault |
| 08 | `08-batch-operations.bptest` | Batch Operations | vault |
| 09 | `09-metadata-sw.bptest` | SolidWorks Metadata | vault, sw |
| 10 | `10-edge-cases.bptest` | Edge Cases & Stress | vault |

## Writing New Tests

### File Format

```bptest
@name My Test
@requires vault
@timeout 60

# Section Name
command arg1 arg2 --flag=value
wait 2000
assert path/to/file --status=synced --version=1

# Teardown
delete _data/my-test
```

### Syntax Rules

- `@name` — display name for the script
- `@requires` — space-separated prerequisites (`vault`, `sw`, `multi-user`, `admin`)
- `@timeout` — max seconds before timeout (default: 120)
- `# Section Name` — starts a new section (shown in results UI)
- `# Teardown` — special section that always runs, even on failure
- `//` — comment line (ignored by parser)
- Empty lines are ignored

### Available Assert Flags

| Flag | Description |
|------|-------------|
| `--status=<value>` | `synced`, `checked-out`, `cloud`, `added`, `deleted` |
| `--version=<n>` | Exact version number |
| `--part=<value>` | Part number matches |
| `--desc=<value>` | Description matches |
| `--rev=<value>` | Revision matches |
| `--readonly` | File is read-only on disk |
| `--writable` | File is writable on disk |
| `--exists` | File exists in the vault store |
| `--not-exists` | File does not exist in the vault store |
| `--checked-out-by=me` | Checked out by current user |
| `--state=<value>` | Workflow state (`wip`, `in_review`, `released`, `obsolete`) |
| `--has-pending` | Has pending metadata changes |
| `--no-pending` | No pending metadata changes |

### Tips

- Use `wait 2000`–`3000` after server operations (sync, checkin, delete, restore)
- All test data should go under `_data/<test-name>/` to keep things organized
- The `# Teardown` section should delete everything created by the script
- Non-assert command errors are non-fatal (logged but don't stop execution)
- Assert failures stop the current section and skip to teardown
