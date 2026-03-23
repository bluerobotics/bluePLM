# Follow-up: Restore Uses Stale file_path (Bug 6)

## Summary
Documenting the known limitation where `restoreFile()` places files at their old path after the parent folder has been renamed. This is NOT fully fixable in this changeset but is now partially mitigated by Fix 4's stale-path warning.

## Current State

### What happens
1. User renames folder "A" to "B"
2. Fix 2's `deleted_at IS NULL` filter means trashed files inside "A" keep their old `file_path = "A/file.txt"`
3. User restores a trashed file -- `restoreFile()` clears `deleted_at` but does NOT change `file_path`
4. `addCloudFile()` places the file at `A/file.txt` -- a folder that no longer exists in the user's vault
5. `addCloudFile` auto-creates a cloud-only "A" directory and puts the file there

### Partial mitigation (Fix 4)
The stale-path detection added in Fix 4 now warns the user:
- Single restore: "Restored file's original folder 'A' no longer exists locally..."
- Batch restore: "N restored file(s) may appear in unexpected locations..."

This doesn't fix the problem but makes it visible instead of silently confusing.

## Full Fix Options (Deferred)

### Option A: Auto-detect renamed parent
Track folder rename history (old path -> new path) in a lightweight map. On restore, check if the file's parent path has a known rename mapping and update `file_path` accordingly before restoring.

**Pros**: Seamless UX
**Cons**: Requires storing rename history; history can go stale; doesn't handle multiple renames or complex reorganizations

### Option B: User prompt
When the stale-path is detected, show a dialog asking the user to pick the correct destination folder.

**Pros**: Always accurate; handles any reorganization
**Cons**: Worse UX for batch restores; requires UI work

### Option C: Restore to vault root
If the original parent doesn't exist, restore to the vault root and let the user move it.

**Pros**: Simple to implement
**Cons**: Files end up in an unexpected location (vault root)

## Recommendation
Option B (user prompt) is the most robust for single restores. For batch restores, consider Option A with a fallback to Option B when no rename mapping exists.

## Impact Assessment
With Fix 2's `deleted_at IS NULL` filter, this follow-up is MORE important than before:
- Previously, `updateFolderPath` might accidentally update trashed files' paths (wrong but sometimes helpful)
- Now, trashed files are guaranteed to have stale paths after any folder rename
- Fix 4's warning ensures users are at least informed, but the UX is still poor

## Priority
**Medium-High** -- Should be addressed in the next release cycle.
