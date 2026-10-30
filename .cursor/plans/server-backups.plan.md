# Server backups

Goal (user, 2026-10-29): backups that are tested and reliable, an isolated environment to test them in,
good backup-testing tools in the app, and schedules that work without a computer being on.

## What was wrong (found 2026-10-29)

1. **Schedules depended on one desktop being on at the exact minute.** `shouldRunScheduledBackup`
   (src/lib/backup.ts) matched `hour:minute` inside a 30-second poll and kept the "ran today" flag in
   memory. A machine asleep, off or restarted at that minute skipped the day, silently.
2. **The backup was of one machine's working copy.** restic backed up the designated machine's local
   vault folder: files never downloaded there (cloud-only) and every older version were not in it.
3. **Partial metadata passed as a backup.** `exportDatabaseMetadata` logged failed `file_versions`
   batches and carried on.
4. **Nothing ever tested a backup.** No restore was ever exercised, and `backup_history` had no writer.

## Decisions

- **The server runs backups** (API worker, `api/src/backup/worker.ts`), opted into per organization by
  `backup_config.run_location = 'server'`. The desktop path stays for organizations without an API.
- **Own repository format, not restic, on the server.** Vault content in Supabase Storage is already
  content-addressed and immutable (`<org>/<hh>/<sha256>`), so a blob is uploaded once and never read
  again: incremental with no disk to stage a vault on, which restic needs. The format
  (`repository.ts`) is AES-256-GCM per object with a scrypt-wrapped master key, HMAC blob names,
  gzip'd JSON table parts with hashes in the manifest, manifest written last as the commit point.
- **Every byte is checked against its name** on the way in (corrupt live content is reported and never
  stored) and on the way out (verify and restore re-hash).
- **Slot catch-up rule** (`schedule.ts`, shared by worker and desktop): run the most recent slot if it
  is newer than `last_scheduled_slot`; consumed when started, so a failing job is reported once per slot.
  Spring-forward gaps resolve later, fall-back repeats resolve to the first (Temporal "compatible").
- **Interrupted runs resume**: a `running` row with no live lock is closed as interrupted and the backup
  re-requested, at most 3 times a day.
- **Pruning refuses to delete** if any kept snapshot cannot be read, or if there is no snapshot.
- **Every scheduled backup is a small restore test** (10 blobs) and a small live-vault audit (10 objects),
  because a backup never re-reads content it already holds and cannot see it rot in place.
- **Restore writes only to a folder** (`restore.ts`). Putting rows back into a live database is left to a
  person with the JSON.

## Test environment

- `api/test/backupSim.ts`: simulated organization (rows + content-addressed objects) with fault
  injection: corrupt objects, flaky reads, failing tables, missing modules.
- `api/src/backup/backup.test.ts`, `schedule.test.ts`, `worker.test.ts` (worker against the typed
  FakeSupabase), `src/lib/supabase/backupExportSql.test.ts` (the SQL on PGlite). All run on the cloud
  runner; 48 pass as of 2026-10-30.
- `npm run backup --prefix api -- sandbox`: 60 days of daily backups on local disk, retention, deliberate
  damage (flipped bit, lost object, wrong password, corrupt live content, rot after backup), restores
  compared byte for byte. 11/11 checks pass. It found a crash (an unhandled stream error when a corrupt
  object failed its hash before the store started reading) fixed in `putBlob`.
- Production, read-only: `dry-run`, `verify`, `list`, `restore` open the bucket through `ReadOnlyStore`,
  which throws on every put and delete. They need `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

## Not verified yet

- Against a real S3 endpoint (B2): `S3ObjectStore` uses the AWS SDK's `Upload` (multipart, aborts on a
  failed body). Run `verify --mode quick` and one manual backup after deploying.
- In the app: the backup panel's server section (layout) has not been looked at.

## Deploy

1. Apply the schema (see the 5.0 port below).
2. Redeploy the API (3.1.0) with `SUPABASE_SERVICE_KEY` set. `BACKUP_WORKER=false` turns the worker off.
3. In the app, Settings > Backup > Backup Configuration > Where backups run: BluePLM server. Save.
4. Back up now, then Test backup > Full restore test.

## 5.0 port (pending)

BluePLM 5.0 (branch `release/5.0`, worktree `bluePLM-5.0`) renames every table and function and moves to
numbered migrations. This work is ported as `supabase/migrations/0501_server_backups.sql` on the renamed
tables, with functions named `backup_row_export` / `backup_vault_object_list`, the table names in the
export CASE and `BACKUP_TABLES` taken from `supabase/rename-map-5.0.json`, and the core.sql 113 bump
dropped. The schema must not land on main before the 5.0 window (the nightly routine would apply it).

## Names other work depends on (do not rename in 0501)

Security release 0502 (branch `security-followup`, commit 82039950, `security_monitor_run()`) alerts org
admins on backups and reads: `backup_config.run_location`, `server_worker_seen_at`, `is_schedule_enabled`,
`updated_at`, `created_at`; `backup_history.kind`, `runner`, `status`, `started_at`, `completed_at`,
`error_message`. Status values it relies on: `failed`, `warning`, `completed`; kind `backup`. Backup
notifications therefore live in 0502, not here.
