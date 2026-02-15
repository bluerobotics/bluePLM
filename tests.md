# bluePLM — Human Regression Test Checklist

**Target duration:** 45–60 minutes  
**When to run:** Before every version release  
**Prerequisites:**
- A test vault with a mix of parts, assemblies, and drawings already synced
- SolidWorks installed (for SW-specific tests)
- A second user account (for collaboration tests)
- A clean local vault folder (or willingness to wipe and re-download)

> Mark each item ✅ pass, ❌ fail, or ⏭️ skipped (with reason).

---

## 1. Startup & Authentication (~3 min)

- [ ] App launches without crash after fresh install / update
- [ ] Splash screen shows progress and completes
- [ ] Sign in with email/password succeeds
- [ ] Sign in with Google OAuth succeeds (if enabled)
- [ ] Correct organization name shown after login
- [ ] Vault tree loads and displays folders
- [ ] Schema version warning does NOT appear (versions match)
- [ ] SolidWorks service starts (check status indicator in settings)

---

## 2. File Sync & Download (~5 min)

- [ ] **Download single file** — right-click a cloud-only file → Download → file appears locally
- [ ] **Download folder** — right-click a folder → Download → all contents download
- [ ] **Bulk download assembly** — right-click an assembly → Bulk Download → assembly + all references download
- [ ] Downloaded files are **read-only** on disk
- [ ] File status icons update correctly after download (cloud → local)
- [ ] **Get Latest** on an outdated file pulls the newest version
- [ ] Sync stats in vault settings look reasonable

---

## 3. Check Out / Check In (~8 min)

### Check Out
- [ ] Right-click a synced file → **Check Out** → file becomes writable
- [ ] Checkout avatar/indicator appears on the file
- [ ] File appears in **Pending Changes** pane
- [ ] Other users see the file as checked out (test with second account)
- [ ] Attempting to check out a file already checked out by someone else is blocked with a message

### Edit & Check In
- [ ] Open the checked-out file in SolidWorks, make a small change, save, close SW
- [ ] Right-click → **Check In** → version increments
- [ ] File goes back to read-only on disk
- [ ] Checkout indicator clears
- [ ] Version history shows the new version with correct timestamp
- [ ] **Version note** — add a note during check-in, verify it appears in history

### Discard Checkout
- [ ] Check out a file, make NO changes
- [ ] Right-click → **Discard Checkout** → file reverts to read-only, checkout clears
- [ ] Check out a file, make changes, then discard — file reverts to server version

### Bulk Assembly Check Out / Check In
- [ ] Right-click an assembly → **Bulk Check Out** → assembly + sub-components all check out
- [ ] Make a change to one part, then **Bulk Check In** the assembly → all files check in
- [ ] Verify version numbers incremented correctly on changed files

---

## 4. SolidWorks Metadata (~8 min)

### With SolidWorks Closed (Document Manager API)
- [ ] Select a part → details panel shows **part number**, **description**, **revision**
- [ ] Edit part number inline → value saves → re-select file → value persists
- [ ] Edit description inline → value saves → re-select file → value persists
- [ ] Open the file in SW afterwards → custom properties match what was set in bluePLM

### With SolidWorks Open
- [ ] Open a checked-out part in SolidWorks
- [ ] Edit description in bluePLM → value writes to the live SW file immediately
- [ ] Edit a custom property in SolidWorks → **Sync Metadata** in bluePLM → bluePLM reflects the SW change
- [ ] Close SW → metadata still shows correctly in bluePLM

### Configurations
- [ ] Select a part with multiple configurations
- [ ] Config rows appear in the file list / details panel
- [ ] Edit description on a specific config → saves to that config only
- [ ] Tab number editing works (digits only, correct width)

### Drawings
- [ ] Drawing metadata shows values inherited from referenced model (if lock settings are on)
- [ ] Locked fields (revision, item number, description) are not editable on drawing when lock is enabled
- [ ] Drawing revision propagates correctly to `configuration_revisions`

---

## 5. File Operations (~7 min)

### Rename
- [ ] Slow double-click on filename → rename mode activates
- [ ] Rename a checked-out file → name changes locally and on server
- [ ] File extension is preserved after rename
- [ ] Renaming a file that is checked out by someone else is blocked

### Move (Drag & Drop)
- [ ] Drag a file to another folder → file moves
- [ ] Drag a folder into another folder → folder moves with contents
- [ ] Move is reflected on server (check with second account or re-download)
- [ ] Auto-scroll works when dragging near top/bottom edge

### Copy / Paste
- [ ] Right-click → Copy, navigate to another folder, right-click → Paste
- [ ] Pasted file has its own version history (not shared with original)
- [ ] Part number and description are preserved on the copy
- [ ] **Paste from Windows Explorer** — copy a file in Explorer (Ctrl+C), paste in bluePLM (Ctrl+V) → file appears and can be synced

### Create Folder
- [ ] Right-click in empty space → New Folder → folder appears with rename active
- [ ] Folder syncs to server

---

## 6. Delete & Restore (~5 min)

### Delete from Server
- [ ] Right-click a synced file → **Delete from Server** → file moves to Trash
- [ ] File disappears from the file browser for all users
- [ ] Open **Trash** module → deleted file appears there
- [ ] **Restore** from Trash → file reappears in original location
- [ ] Version history is intact after restore

### Delete Local Only
- [ ] Right-click a downloaded file → **Remove Local Copy**
- [ ] File icon reverts to cloud-only, local copy is gone
- [ ] File can be re-downloaded successfully

### Bulk Delete
- [ ] Select multiple files → delete from server → all move to Trash
- [ ] Performance is acceptable (no long hang on 5-10 files)

### Folder Delete
- [ ] Delete a folder with files inside → folder and contents move to Trash
- [ ] Folder with special characters in name deletes without error

---

## 7. Assembly & Reference Features (~5 min)

- [ ] Select an assembly → **Contains** tab in details panel shows referenced parts
- [ ] Select a part → **Where Used** shows which assemblies reference it
- [ ] **Extract References** on an assembly → references update in the database
- [ ] Active Files / hierarchical view shows assembly tree correctly
- [ ] **Insert into Assembly** (context menu on a part, with an assembly open in SW) → part inserts

---

## 8. Export (~5 min)

- [ ] Right-click a part → Export → **STEP** → file exports to correct location
- [ ] Right-click a part → Export → **STL** → file exports with correct quality settings
- [ ] Right-click a drawing → Export → **PDF** → PDF created with correct filename pattern
- [ ] Export a multi-config part → each config exports as separate file (no overwrites)
- [ ] Export filename uses the pattern set in Settings → Export Options
- [ ] Filename collisions are handled (appends (1), (2), etc.)

---

## 9. Collaboration (~5 min)

### Review Requests
- [ ] Right-click a file → **Request Review** → modal opens
- [ ] Select a reviewer, add a message, submit → notification sent
- [ ] Reviewer receives the notification
- [ ] Review appears in the **Reviews** module

### Notifications
- [ ] Notification badge appears when a new notification arrives
- [ ] Click notification → navigates to relevant file/context
- [ ] **Mark all as read** clears the badge
- [ ] **Notify Someone** from context menu → sends notification to chosen user
- [ ] **Watch File** → changes to that file trigger notifications

### File Watching
- [ ] Right-click → **Watch File** on a synced file
- [ ] Have second user check in a change → watcher receives a notification
- [ ] **Stop Watching** removes the watch

---

## 10. UI & Navigation (~4 min)

- [ ] **File browser grid view** — switch to grid → thumbnails display
- [ ] **File browser list view** — switch to list → columns display correctly
- [ ] **Pending Changes** — shows all checked-out / unsynced files
- [ ] **Collapse all folders** works
- [ ] **Pin a folder** → it appears in pinned section, shows only folder name
- [ ] **Filter downloaded folders** toggle works (hides folders with no local files)
- [ ] **Search** — type a filename → results appear
- [ ] **Context menu** — right-click in empty area → no crash, menu has correct options
- [ ] **Window drag region** — can drag the window from the title bar area
- [ ] **Sidebar modules** — toggling modules in settings shows/hides them in sidebar

---

## 11. Settings (~3 min)

- [ ] **Vault settings** — can view vault info, sync stats
- [ ] **SolidWorks settings** — preview mode toggle works (thumbnail vs. eDrawings)
- [ ] **SolidWorks settings** — hide temp files toggle works
- [ ] **Export options** — filename pattern changes apply to next export
- [ ] **STL quality settings** — resolution presets can be selected
- [ ] **Drawing lockout settings** — toggling lock revision/item number/description works
- [ ] **Serialization** — generating a serial number shows preview, then applies correctly
- [ ] **Members & Teams** — can view members, change roles (admin only)
- [ ] **Module toggles** — enabling/disabling a module updates the sidebar immediately

---

## 12. Version History & Rollback (~3 min)

- [ ] Select a file → open **History** → all versions listed with timestamps and notes
- [ ] Click a history entry → file browser navigates to / highlights that file
- [ ] **Rollback** to a previous version → file content reverts, new version entry created
- [ ] Rollback version number displays correctly (not off by one)
- [ ] Version note can be edited after the fact

---

## 13. Edge Cases & Stress (~5 min)

- [ ] **Rapid refresh** — click refresh button multiple times quickly → no crash or corruption
- [ ] **Large folder** — navigate to a folder with 100+ files → file list loads without hanging (virtualization works)
- [ ] **Offline behavior** — disconnect network → app doesn't crash, shows appropriate messages
- [ ] **File locked by another process** — try to check in a file that's open in SW → appropriate error message
- [ ] **Concurrent edits** — two users check out different files simultaneously → no conflicts
- [ ] **Special characters** — create a folder with spaces and special chars → operations work normally
- [ ] **App close & reopen** — close app → reopen → remembers last folder, vault state intact
- [ ] **Auto-update** — if an update is available, notification appears (or verify update mechanism works)

---

## Sign-Off

| Field | Value |
|---|---|
| **Tester** | |
| **Date** | |
| **App Version** | |
| **Schema Version** | |
| **SW Service Version** | |
| **OS** | |
| **SolidWorks Version** | |
| **Pass / Fail / Skip** | __ / __ / __ |
| **Blocking Issues** | |
| **Notes** | |
