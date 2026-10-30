# Organization Settings

Settings that affect your entire organization. Most require admin access.

## Vaults

Manage file storage containers. See [Vaults](/source-files/vaults) for details.

### Re-align with Server

Each connected vault has a **Re-align with Server** section that checks your local copy against
the server and reports how they disagree — files that moved on your disk but not in the vault,
files the server no longer has, files with a newer version on the server, and files that only
exist locally or have local edits the server hasn't seen. It's available to every user, not just
admins, since it only ever touches your own disk.

Opening the check is instant — it reads the same file list the Explorer already shows, so there's
no scan to wait for. What it finds is grouped into three kinds:

- **Can be fixed now** — moved files put back where the vault expects them, files the server no
  longer has moved to the Recycle Bin, and outdated files replaced with the server's current
  version. Each is a checkbox, on by default; untick any you'd rather handle yourself. Moved
  files default to keeping the server's path, but the list shows every one individually with its
  vault path and its disk path, so you can flip any file to keep its local path instead — useful
  when the rename on this machine is the one that should stick. A mixed choice can show more than
  one confirmation prompt while it runs; the dialog says so rather than leaving you looking at a
  spinner with no explanation.
- **Needs your decision** — local-only files and files with unsaved local edits. Re-align never
  touches these; it lists them so you can check them in or leave them as they are.
- **For information** — files only on the server (re-align doesn't download in bulk), files
  matching an ignore pattern, and files blocked by an active checkout, whether that checkout is
  someone else's or your own.

Running the fix reports what happened for each item you selected, and the check re-runs
immediately afterward so you see the vault's new state without reopening the dialog.

## Members & Teams

Manage users and access control.

### Users Tab

View all organization members:
- Name, email, avatar
- Role (admin/member)
- Teams they belong to
- Last sign-in time

**Actions:**
- Change user role
- Assign to teams
- Manage vault access
- Remove from organization

### Teams Tab

Teams group users for permission management.

**Default teams** (created automatically):
- Viewers - Read-only access
- Engineers - Standard access
- Administrators - Full access

Being an administrator means **either** having the admin role **or** being a member of the
Administrators team. Both give the same full access everywhere: the desktop app, the API and the
database. Adding someone to the Administrators team is enough; you do not need to change their
role as well. Removing them from the team removes the access, unless their role is still set to
admin.

**Create a team:**
1. Click **Create Team**
2. Enter name
3. Choose icon and color
4. Set permissions

### Roles Tab

Workflow roles for approval processes:
- Design Lead
- QA Manager
- etc.

Assign roles to users for workflow approvals.

### Titles Tab

Job titles for display purposes:
- Create titles (Engineer, Manager, etc.)
- Assign to users inline

## Company Profile

Set organization details:
- **Name** - Your company name
- **Logo** - Company logo for branding
- **Settings** - Organization-wide configuration

## Sign-In Methods

Control which authentication methods are available for your organization.

### Team Members

Configure sign-in options for your employees:
- **Google Account** - Sign in with Google OAuth
- **Email & Password** - Traditional email/password authentication
- **Phone Number (SMS)** - Sign in via SMS verification code

### Suppliers

Configure sign-in options for external suppliers and partners:
- **Google Account** - Sign in with Google OAuth
- **Email & Password** - Traditional email/password authentication
- **Phone Number (SMS)** - Sign in via SMS verification code

!!! note "Security"
    At least one sign-in method must remain enabled for each user type.
    Disabling a method prevents new sign-ins but doesn't affect existing sessions.

## Serialization

Configure part numbering:
- **Prefix** - e.g., "BR-"
- **Format** - Number pattern
- **Counter** - Current sequence number

## File Metadata

Define custom metadata columns for files:
- Part number
- Revision
- Description
- Custom fields

### Vault Metadata Audit

**Vault Metadata Audit** (admin only) lives under **Settings → SolidWorks → Metadata Audit**. It reads the SolidWorks files in a vault read-only and compares the
metadata they carry with what BluePLM has recorded. It is the in-app view of the
`scan-divergence` terminal command — the same scan and the same report file — and it groups what
it finds by what can be done about it: values to copy from the file, values to write into the
file, conflicts that need a choice, values lost on both sides, and values to leave alone.

**Empty in BluePLM, still in the file** lists parts and assemblies whose item number or
description is empty in BluePLM while the file still holds one under a key BluePLM writes. Before
4.4.5, uploading a file or refreshing its metadata from the file could empty these columns, so
many of them are lost values — but some may never have been BluePLM's, which is why nothing in
this group is filled automatically. To fill them:

1. Run the audit and tick the values you want in this group.
2. Click **Review** to see every file, field and value that would be written.
3. Click **Fill** to write them.

Each value is written only if BluePLM's column is still empty at that moment, so anything someone
filled in since the scan is kept. No new version is created and no document is changed. Files
checked out by someone else are skipped, and so are fields you have an unsaved edit to on this
machine. Every file filled is recorded in the activity log, and the result lists how many were
filled, already set, skipped or refused.

The same fill is available from the terminal, which is useful for a whole vault at once:

```
restore-metadata-from-files                      # dry run: lists what it would fill
restore-metadata-from-files --apply              # writes (admin only)
restore-metadata-from-files --path="ELEC"        # only one folder
restore-metadata-from-files --exclude="_ARCHIVE" # leave a folder out
```

## RFQ Settings

Configure request-for-quote workflow:
- Email templates
- Approval workflow
- Supplier settings

## Backups

Settings → Backup. The top of the page says whether backups are healthy, and if not why (no computer
designated, the computer or the server worker offline, no schedule, or no successful backup in 36 hours),
when the last backup was and when the next one is.

### Where backups run

An administrator chooses, in one click:

- **BluePLM server (recommended).** The API backs up the whole vault, every version, and the organization's
  database rows, encrypted, into your bucket on the schedule, with no computer on. Needs API 4.1.0 or later
  with `SUPABASE_SERVICE_KEY` set. **Back up now** and **Test backup** (quick check, sample restore, or full
  restore test) are on the page; every scheduled backup also test-restores a sample. Restoring a server
  backup: `npm run backup --prefix api -- restore --org <org id> --to <folder>` (writes only to that folder).
- **Designated computer.** One computer backs up its local copy of the vault with restic. It runs while that
  computer is on and signed in to BluePLM (the settings page does not need to be open), and covers only the
  files downloaded there. **Use this computer** designates it; **Release** clears it from any computer.

### Bucket and schedule

Under **Backup Configuration** (administrators): the storage provider, bucket and keys, the backup password,
how many daily / weekly / monthly / yearly snapshots to keep, and the daily backup time. A backup missed
while the runner was off runs once when it is back.

## Recovery Codes

Generate recovery codes for database access. Store these securely - they allow database recovery if you lose access.

