-- =====================================================================
-- 0501_server_backups.sql: server-run backups (schema 500 -> 501)
-- =====================================================================
-- backup_config.run_location chooses who runs an organization's scheduled and
-- requested backups: the designated desktop machine (restic over its local copy
-- of the vault, as before) or the API's backup worker (api/src/backup/), which
-- backs up the whole vault bucket and the organization's rows into an encrypted
-- repository in the organization's own bucket, with no computer on.
--
--   last_scheduled_slot_at  the scheduled slot last started, by either runner, so
--                           a slot missed while nothing was running is caught up
--                           once instead of being skipped
--   verify_requested_*      a request to test the backup (quick / sample / full),
--   verify_mode             picked up by the worker like backup_requested_at
--   server_worker_seen_at   stamped by the worker every minute, so the app can say
--   server_worker_version   whether one is alive
--
-- backup_history gains kind ('backup' or 'verify'), trigger ('scheduled' or
-- 'manual'), runner ('desktop' or 'server') and report (what the run found). The
-- security monitor (0502) reads run_location, server_worker_seen_at and
-- backup_history.kind / runner / status: keep those names.
--
-- Two functions the worker reads through, callable by service_role only. They run
-- as the caller (SECURITY INVOKER) and service_role already reads every row and
-- storage object, so they add no reach; they exist so that every table is
-- exported only through a predicate that names the organization.
--
-- Members keep reading the configuration through backup_get_status(), which
-- returns the row (now with these columns) without its three secrets.
-- No BEGIN / COMMIT: the migration runner wraps this file in a transaction.
-- =====================================================================

ALTER TABLE backup_config
  ADD COLUMN run_location TEXT NOT NULL DEFAULT 'desktop'
    CONSTRAINT backup_config_run_location_check CHECK (run_location IN ('desktop', 'server')),
  ADD COLUMN last_scheduled_slot_at TIMESTAMPTZ,
  ADD COLUMN verify_requested_at TIMESTAMPTZ,
  ADD COLUMN verify_requested_by TEXT,
  ADD COLUMN verify_mode TEXT
    CONSTRAINT backup_config_verify_mode_check CHECK (verify_mode IN ('quick', 'sample', 'full')),
  ADD COLUMN server_worker_seen_at TIMESTAMPTZ,
  ADD COLUMN server_worker_version TEXT;

ALTER TABLE backup_history
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'backup'
    CONSTRAINT backup_history_kind_check CHECK (kind IN ('backup', 'verify')),
  ADD COLUMN trigger TEXT
    CONSTRAINT backup_history_trigger_check CHECK (trigger IN ('scheduled', 'manual')),
  ADD COLUMN runner TEXT
    CONSTRAINT backup_history_runner_check CHECK (runner IN ('desktop', 'server')),
  ADD COLUMN report JSONB;

-- One page of an organization's rows from one table, ordered by id. The scope of
-- every table is written out here, so a table is exported only through a
-- predicate that names the organization; a table this function does not know is
-- an error, never an unscoped read. A table whose module is not installed answers
-- {"missing": true}. Secrets are not exported: backup_config, integration
-- credentials, extension secrets, recovery codes, sessions and share links.
-- The list must match BACKUP_TABLES in api/src/backup/source.ts
-- (src/lib/supabase/serverBackupsMigration.test.ts checks it).
CREATE OR REPLACE FUNCTION backup_list_org_rows(p_org_id UUID, p_table TEXT, p_after UUID, p_limit INT)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_scope TEXT;
  v_rows JSONB;
BEGIN
  v_scope := CASE p_table
    WHEN 'organization' THEN 'id = $1'
    WHEN 'app_user' THEN 'org_id = $1'
    WHEN 'team' THEN 'org_id = $1'
    WHEN 'team_member' THEN 'team_id IN (SELECT id FROM team WHERE org_id = $1)'
    WHEN 'team_permission' THEN 'team_id IN (SELECT id FROM team WHERE org_id = $1)'
    WHEN 'user_permission' THEN 'user_id IN (SELECT id FROM app_user WHERE org_id = $1)'
    WHEN 'module_access' THEN 'org_id = $1'
    WHEN 'vault' THEN 'org_id = $1'
    WHEN 'vault_access' THEN 'vault_id IN (SELECT id FROM vault WHERE org_id = $1)'
    WHEN 'team_vault_access' THEN 'vault_id IN (SELECT id FROM vault WHERE org_id = $1)'
    WHEN 'workflow_template' THEN 'org_id = $1'
    WHEN 'workflow_role' THEN 'org_id = $1'
    WHEN 'workflow_state' THEN 'workflow_id IN (SELECT id FROM workflow_template WHERE org_id = $1)'
    WHEN 'workflow_transition' THEN 'workflow_id IN (SELECT id FROM workflow_template WHERE org_id = $1)'
    WHEN 'workflow_gate' THEN 'transition_id IN (SELECT t.id FROM workflow_transition t'
      ' JOIN workflow_template w ON w.id = t.workflow_id WHERE w.org_id = $1)'
    WHEN 'user_workflow_role' THEN 'user_id IN (SELECT id FROM app_user WHERE org_id = $1)'
    WHEN 'folder' THEN 'org_id = $1'
    WHEN 'file' THEN 'org_id = $1'
    WHEN 'file_version' THEN 'file_id IN (SELECT id FROM file WHERE org_id = $1)'
    WHEN 'file_reference' THEN 'org_id = $1'
    WHEN 'file_version_reference' THEN 'org_id = $1'
    WHEN 'drawing_pdf_render' THEN 'org_id = $1'
    WHEN 'release_file' THEN 'org_id = $1'
    WHEN 'file_metadata_column' THEN 'org_id = $1'
    WHEN 'file_comment' THEN 'file_id IN (SELECT id FROM file WHERE org_id = $1)'
    WHEN 'file_watcher' THEN 'org_id = $1'
    WHEN 'file_workflow_assignment' THEN 'file_id IN (SELECT id FROM file WHERE org_id = $1)'
    WHEN 'file_state_entry' THEN 'file_id IN (SELECT id FROM file WHERE org_id = $1)'
    WHEN 'workflow_history' THEN 'org_id = $1'
    WHEN 'workflow_gate_review' THEN 'org_id = $1'
    WHEN 'review' THEN 'org_id = $1'
    WHEN 'review_item' THEN 'org_id = $1'
    WHEN 'review_round' THEN 'org_id = $1'
    WHEN 'review_response' THEN 'review_id IN (SELECT id FROM review WHERE org_id = $1)'
    WHEN 'eco' THEN 'org_id = $1'
    WHEN 'file_eco' THEN 'file_id IN (SELECT id FROM file WHERE org_id = $1)'
    WHEN 'deviation' THEN 'org_id = $1'
    WHEN 'file_deviation' THEN 'file_id IN (SELECT id FROM file WHERE org_id = $1)'
    WHEN 'item_designation' THEN 'org_id = $1'
    WHEN 'item_designation_assignment' THEN 'org_id = $1'
    WHEN 'inspection_characteristic' THEN 'org_id = $1'
    WHEN 'inspection_characteristic_version' THEN 'org_id = $1'
    WHEN 'supplier' THEN 'org_id = $1'
    WHEN 'part_supplier' THEN 'org_id = $1'
    WHEN 'activity' THEN 'org_id = $1'
    WHEN 'backup_history' THEN 'org_id = $1'
    ELSE NULL
  END;
  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'backup_list_org_rows: unknown table %', p_table USING ERRCODE = '22023';
  END IF;
  IF to_regclass(format('public.%I', p_table)) IS NULL THEN
    RETURN jsonb_build_object('missing', true, 'rows', '[]'::jsonb);
  END IF;
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), ''[]''::jsonb) FROM ('
    '  SELECT * FROM %I WHERE (%s) AND ($2::uuid IS NULL OR id > $2) ORDER BY id LIMIT $3'
    ') t', p_table, v_scope)
    INTO v_rows USING p_org_id, p_after, LEAST(GREATEST(p_limit, 1), 5000);
  RETURN jsonb_build_object('missing', false, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION backup_list_org_rows(UUID, TEXT, UUID, INT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION backup_list_org_rows(UUID, TEXT, UUID, INT) TO service_role;

-- One page of the organization's objects in the vault bucket (names start with
-- the organization id; see src/lib/storage.ts), ordered by name.
CREATE OR REPLACE FUNCTION backup_list_vault_objects(p_org_id UUID, p_after TEXT, p_limit INT)
RETURNS TABLE (name TEXT, size BIGINT)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT o.name, COALESCE((o.metadata ->> 'size')::BIGINT, -1)
    FROM storage.objects o
   WHERE o.bucket_id = 'vault'
     AND o.name LIKE p_org_id::TEXT || '/%'
     AND (p_after IS NULL OR o.name > p_after)
   ORDER BY o.name
   LIMIT LEAST(GREATEST(p_limit, 1), 5000);
$$;

REVOKE ALL ON FUNCTION backup_list_vault_objects(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION backup_list_vault_objects(UUID, TEXT, INT) TO service_role;

INSERT INTO schema_manifest_entry (module, probe, kind, name, requires, since_version) VALUES
  -- to_regclass is what lets an uninstalled module's table answer 'missing' instead
  -- of failing the export; storage.objects is the vault listing.
  ('10-source-files', NULL, 'function', 'backup_list_org_rows(uuid,text,uuid,integer)', 'to_regclass', 501),
  ('10-source-files', NULL, 'function', 'backup_list_vault_objects(uuid,text,integer)', 'storage.objects', 501);

CREATE OR REPLACE FUNCTION schema_release_version() RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$ SELECT 501 $$;

-- Must equal VERSION_DESCRIPTIONS[501] in src/lib/schemaVersion.ts.
CREATE OR REPLACE FUNCTION schema_release_description() RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$ SELECT
  'Server-run backups. backup_config.run_location chooses who runs scheduled and requested backups: the designated desktop machine (restic over its local vault copy, as before) or the API backup worker, which backs up the whole vault bucket and the organization''s rows with no computer on. last_scheduled_slot_at lets a missed slot be caught up once; verify_requested_at and verify_mode request a test of the backup; server_worker_seen_at shows the worker is alive. backup_history gains kind (backup or verify), trigger, runner and report. backup_list_org_rows() and backup_list_vault_objects() are callable by service_role only.'::text
$$;
