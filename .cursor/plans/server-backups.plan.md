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

1. Schema 501: an org admin opens the 5.x app, which applies `supabase/migrations/0501_server_backups.sql`
   through the migration runner (or the nightly routine applies it from main). Land only after 5.0 (500)
   is applied to production.
2. Redeploy the API (4.1.0) with `SUPABASE_SERVICE_KEY` set. `BACKUP_WORKER=false` turns the worker off.
3. In the app, Settings > Backup > Backup Configuration > Where backups run: BluePLM server. Save.
4. Back up now, then Test backup > Full restore test.

## 5.0 port (done 2026-10-30)

Branch `server-backups-5`, cut from `v5.0.0` (45f9cc38): the four commits of `server-backups`
cherry-picked, the 4.x SQL (core.sql 113, module 10) dropped, TypeScript renamed with
`scripts/rename-5.0/rename.mjs --mode ts` plus the bare table names it leaves ambiguous, and the schema
written as `supabase/migrations/0501_server_backups.sql`:

- Functions are `backup_list_org_rows` and `backup_list_vault_objects`. `backup_row_export` (suggested)
  breaks the 5.0 naming rule: `export` is not in `VERBS` (`scripts/rename-5.0/namingRules.mjs`).
- `last_scheduled_slot` is `last_scheduled_slot_at` (timestamps end in `_at`).
- `backup_running_since` is 5.0's `backup_started_at`; `schedule_enabled` is `is_schedule_enabled`;
  `backup_locks` is `backup_lock`.
- Schema 501, API 4.1.0 (5.0 is 500 / 4.0.0); `REQUIRED_SCHEMA_VERSION` (dbUpgrade gate) is 501.
- `src/lib/schemaVersion.test.ts` read the release version and description from `core.sql` only. From
  5.0 the baseline is never edited, so it now reads the newest migration that rewrites
  `schema_release_description()`, falling back to `core.sql`.
- `src/lib/supabase/serverBackupsMigration.test.ts` applies 0501 to the real 5.0 baseline on PGlite and
  checks: stamps 501 with no problems, every exported table is a valid org-scoped query on the real
  tables, no other org's rows, the list matches `BACKUP_TABLES`, service_role only, the CHECKs, and
  `backup_get_status()` shows members the new columns without secrets.

Note for the record: production's empty `backup_history` does not show that restic never ran. Nothing
wrote `backup_history` before this work; the desktop recorded runs only as restic snapshots in the bucket.

## Names other work depends on (do not rename in 0501)

Security release 0502 (branch `security-followup`, commit 82039950, `security_monitor_run()`) alerts org
admins on backups and reads: `backup_config.run_location`, `server_worker_seen_at`, `is_schedule_enabled`,
`updated_at`, `created_at`; `backup_history.kind`, `runner`, `status`, `started_at`, `completed_at`,
`error_message`. Status values it relies on: `failed`, `warning`, `completed`; kind `backup`. Backup
notifications therefore live in 0502, not here.
