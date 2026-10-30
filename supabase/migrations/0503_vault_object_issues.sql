-- =====================================================================
-- 0503_vault_object_issues.sql: damaged and missing vault content (schema 502 -> 503)
-- =====================================================================
-- Server backups (0501) read every vault object and check its bytes against the SHA-256
-- its name promises; tests re-hash a sample of the live vault. Until now a damaged object
-- lived only in that run's report. This release keeps each finding as a row, one per
-- content hash, so it can be looked at, repaired and closed:
--
--   vault_object_issue        one row per damaged ('damaged': bytes do not hash to the name)
--                             or missing ('missing': a file_version names it, storage has
--                             nothing) object; status open | repaired | unrecoverable |
--                             accepted, with who resolved it, when, how and why
--   vault_object_issue_event  append-only log of every finding and every action on it
--
-- Who writes what:
--   - the API's backup worker records findings with backup_issue_record() (service_role);
--   - repairs that write storage (restore a good copy from a backup, upload a desktop's
--     copy) are done by the API with service_role, after re-hashing the bytes to the name,
--     because no client may overwrite a content object (module 10 storage policies);
--     they close the issue with backup_issue_record_repair() (service_role);
--   - an admin accepts an issue or marks it unrecoverable with vault_object_issue_resolve();
--     rolling back to the last good version is an ordinary check-out and check-in.
-- Clients read the issues through vault_object_issue_list() (admins) and ask whether any of
-- a set of hashes is unrecoverable through vault_object_blocked() (any member), so downloads
-- refuse that content with a clear message instead of handing out bad bytes.
--
-- No BEGIN / COMMIT: the migration runner wraps this file in a transaction.
-- =====================================================================

CREATE TABLE IF NOT EXISTS vault_object_issue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL CONSTRAINT vault_object_issue_content_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  kind TEXT NOT NULL CONSTRAINT vault_object_issue_kind_check CHECK (kind IN ('damaged', 'missing')),
  -- The object's name in the vault bucket (NULL when missing).
  storage_name TEXT,
  -- What the stored bytes are (damaged only).
  actual_hash TEXT,
  actual_size BIGINT,
  found_by TEXT NOT NULL CONSTRAINT vault_object_issue_found_by_check CHECK (found_by IN ('backup', 'verify', 'live_audit')),
  found_in_run_id UUID REFERENCES backup_history(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'open'
    CONSTRAINT vault_object_issue_status_check CHECK (status IN ('open', 'repaired', 'unrecoverable', 'accepted')),
  resolution TEXT CONSTRAINT vault_object_issue_resolution_check CHECK (resolution IN (
    'restored_from_backup', 'uploaded_from_desktop', 'rolled_back', 'healed', 'marked_unrecoverable', 'accepted')),
  resolved_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  note TEXT,
  CONSTRAINT vault_object_issue_org_id_content_hash_key UNIQUE (org_id, content_hash)
);

CREATE INDEX IF NOT EXISTS vault_object_issue_org_id_status_idx ON vault_object_issue (org_id, status);

CREATE TABLE IF NOT EXISTS vault_object_issue_event (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_id UUID NOT NULL REFERENCES vault_object_issue(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  action TEXT NOT NULL CONSTRAINT vault_object_issue_event_action_check CHECK (action IN (
    'found', 'reopened', 'restored_from_backup', 'uploaded_from_desktop', 'rolled_back', 'healed',
    'marked_unrecoverable', 'accepted')),
  actor_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vault_object_issue_event_issue_id_idx ON vault_object_issue_event (issue_id);

-- Admins read; nobody writes from a client. Every write goes through the functions below.
ALTER TABLE vault_object_issue ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_object_issue_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE vault_object_issue, vault_object_issue_event FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE vault_object_issue, vault_object_issue_event TO service_role;
GRANT SELECT ON TABLE vault_object_issue, vault_object_issue_event TO authenticated;

DROP POLICY IF EXISTS "vault_object_issue: admins read" ON vault_object_issue;
CREATE POLICY "vault_object_issue: admins read" ON vault_object_issue FOR SELECT
  USING (org_id IN (SELECT u.org_id FROM app_user u WHERE u.id = (SELECT auth.uid())) AND (SELECT is_org_admin()));

DROP POLICY IF EXISTS "vault_object_issue_event: admins read" ON vault_object_issue_event;
CREATE POLICY "vault_object_issue_event: admins read" ON vault_object_issue_event FOR SELECT
  USING (org_id IN (SELECT u.org_id FROM app_user u WHERE u.id = (SELECT auth.uid())) AND (SELECT is_org_admin()));

-- ---------------------------------------------------------------------------
-- The backup worker's side (service_role only)
-- ---------------------------------------------------------------------------

-- Records the security event for a finding, once per object and occasion, unless the organization
-- turned backup alerts off (org_security_setting; no row means on). `p_occasion` keeps a reopened
-- finding from colliding with the first one's dedup key.
CREATE OR REPLACE FUNCTION backup_issue_alert(p_org_id UUID, p_content_hash TEXT, p_kind TEXT, p_occasion TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_paths TEXT;
BEGIN
  IF NOT COALESCE((SELECT s.is_backup_alert_enabled FROM org_security_setting s WHERE s.org_id = p_org_id), true) THEN
    RETURN;
  END IF;
  SELECT string_agg(DISTINCT f.file_path || ' v' || v.version, ', ') INTO v_paths
    FROM file_version v JOIN file f ON f.id = v.file_id AND f.org_id = p_org_id
   WHERE v.content_hash = p_content_hash;
  PERFORM security_event_record(
    p_org_id, 'backup_damaged_object', 'high',
    CASE p_kind WHEN 'missing' THEN 'Missing from storage: ' ELSE 'Damaged in storage: ' END
      || COALESCE(v_paths, p_content_hash),
    jsonb_build_object('dedup_key', 'backup_damaged_object:' || p_org_id::TEXT || ':' || p_content_hash || ':' || p_occasion,
                       'content_hash', p_content_hash, 'kind', p_kind));
END;
$$;

REVOKE ALL ON FUNCTION backup_issue_alert(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION backup_issue_alert(UUID, TEXT, TEXT, TEXT) TO service_role;

-- Records a finding. A new one is inserted with a 'found' event; one already open is touched
-- (last_seen_at); one that was repaired is reopened, because the object is bad again; one that
-- was accepted or marked unrecoverable stays as decided. Returns the issue id.
CREATE OR REPLACE FUNCTION backup_issue_record(
  p_org_id UUID,
  p_content_hash TEXT,
  p_kind TEXT,
  p_storage_name TEXT,
  p_actual_hash TEXT,
  p_actual_size BIGINT,
  p_found_by TEXT,
  p_run_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_issue vault_object_issue%ROWTYPE;
BEGIN
  SELECT * INTO v_issue FROM vault_object_issue WHERE org_id = p_org_id AND content_hash = p_content_hash FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO vault_object_issue (org_id, content_hash, kind, storage_name, actual_hash, actual_size, found_by, found_in_run_id)
    VALUES (p_org_id, p_content_hash, p_kind, p_storage_name, p_actual_hash, p_actual_size, p_found_by, p_run_id)
    RETURNING * INTO v_issue;
    INSERT INTO vault_object_issue_event (issue_id, org_id, action, detail)
    VALUES (v_issue.id, p_org_id, 'found', jsonb_build_object('kind', p_kind, 'found_by', p_found_by, 'run_id', p_run_id,
            'actual_hash', p_actual_hash, 'actual_size', p_actual_size));
    PERFORM backup_issue_alert(p_org_id, p_content_hash, p_kind, 'found');
    RETURN v_issue.id;
  END IF;

  IF v_issue.status = 'repaired' THEN
    UPDATE vault_object_issue
       SET status = 'open', kind = p_kind, storage_name = p_storage_name, actual_hash = p_actual_hash,
           actual_size = p_actual_size, found_by = p_found_by, found_in_run_id = p_run_id,
           last_seen_at = NOW(), resolution = NULL, resolved_by = NULL, resolved_at = NULL
     WHERE id = v_issue.id;
    INSERT INTO vault_object_issue_event (issue_id, org_id, action, detail)
    VALUES (v_issue.id, p_org_id, 'reopened', jsonb_build_object('kind', p_kind, 'found_by', p_found_by, 'run_id', p_run_id));
    PERFORM backup_issue_alert(p_org_id, p_content_hash, p_kind, 'reopened:' || v_issue.id::TEXT || ':' || NOW()::DATE::TEXT);
  ELSE
    UPDATE vault_object_issue SET last_seen_at = NOW() WHERE id = v_issue.id;
  END IF;
  RETURN v_issue.id;
END;
$$;

REVOKE ALL ON FUNCTION backup_issue_record(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION backup_issue_record(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, UUID) TO service_role;

-- Closes an open issue as repaired: by the API after it wrote good bytes back (restored from a
-- backup or uploaded from a desktop, p_actor_id the admin who asked), or by the worker when a
-- later run finds the object healthy ('healed', no actor).
CREATE OR REPLACE FUNCTION backup_issue_record_repair(
  p_org_id UUID,
  p_content_hash TEXT,
  p_resolution TEXT,
  p_actor_id UUID,
  p_detail JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_issue vault_object_issue%ROWTYPE;
BEGIN
  IF p_resolution NOT IN ('restored_from_backup', 'uploaded_from_desktop', 'healed') THEN
    RAISE EXCEPTION 'backup_issue_record_repair: % is not a repair', p_resolution USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_issue FROM vault_object_issue WHERE org_id = p_org_id AND content_hash = p_content_hash FOR UPDATE;
  IF NOT FOUND OR v_issue.status = 'repaired' THEN
    RETURN FALSE;
  END IF;
  UPDATE vault_object_issue
     SET status = 'repaired', resolution = p_resolution, resolved_by = p_actor_id, resolved_at = NOW()
   WHERE id = v_issue.id;
  INSERT INTO vault_object_issue_event (issue_id, org_id, action, actor_id, detail)
  VALUES (v_issue.id, p_org_id, p_resolution, p_actor_id, COALESCE(p_detail, '{}'::jsonb));
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION backup_issue_record_repair(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION backup_issue_record_repair(UUID, TEXT, TEXT, UUID, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- The app's side
-- ---------------------------------------------------------------------------

-- Every issue of the caller's organization, newest first, with what references the hash: each
-- file version that names it (path, version, who checked it in and when, whether it is the
-- file's current content). Admins only; argument-less, the organization is the caller's own.
CREATE OR REPLACE FUNCTION vault_object_issue_list()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT u.org_id INTO v_org FROM app_user u WHERE u.id = auth.uid();
  IF v_org IS NULL OR NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only administrators can review damaged files' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x) ORDER BY x.first_seen_at DESC)
    FROM (
      SELECT i.id, i.content_hash, i.kind, i.storage_name, i.actual_hash, i.actual_size, i.found_by,
             i.found_in_run_id, i.first_seen_at, i.last_seen_at, i.status, i.resolution, i.resolved_at,
             i.note, ru.email AS resolved_by_email,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'file_id', f.id, 'file_version_id', v.id, 'vault_id', f.vault_id,
                        'file_path', f.file_path, 'version', v.version, 'revision', v.revision,
                        'file_size', v.file_size, 'created_at', v.created_at, 'created_by_email', cu.email,
                        'is_latest', f.content_hash = i.content_hash AND f.version = v.version,
                        'file_deleted', f.deleted_at IS NOT NULL, 'checked_out_by', f.checked_out_by)
                      ORDER BY f.file_path, v.version)
               FROM file_version v
               JOIN file f ON f.id = v.file_id AND f.org_id = v_org
               LEFT JOIN app_user cu ON cu.id = v.created_by
               WHERE v.content_hash = i.content_hash
             ), '[]'::jsonb) AS refs
      FROM vault_object_issue i
      LEFT JOIN app_user ru ON ru.id = i.resolved_by
      WHERE i.org_id = v_org
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION vault_object_issue_list() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION vault_object_issue_list() TO authenticated;

-- An admin's decision on an open issue: 'accepted' (with a note: why it does not matter),
-- 'unrecoverable' (downloads of that content are then refused), 'rolled_back' (the app checked in
-- the last good version on top, so the damaged version is history; a note says which), or back to
-- 'open'. Recorded on the issue and in its event log, with the admin as actor.
CREATE OR REPLACE FUNCTION vault_object_issue_resolve(p_issue_id UUID, p_status TEXT, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_issue vault_object_issue%ROWTYPE;
BEGIN
  SELECT u.org_id INTO v_org FROM app_user u WHERE u.id = auth.uid();
  IF v_org IS NULL OR NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only administrators can resolve damaged files' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_issue FROM vault_object_issue WHERE id = p_issue_id AND org_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_status NOT IN ('accepted', 'unrecoverable', 'rolled_back', 'open') THEN
    RAISE EXCEPTION 'Unknown status %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_status IN ('accepted', 'rolled_back') AND NULLIF(btrim(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'Accepting a damaged file needs a note saying why' USING ERRCODE = '22023';
  END IF;
  IF v_issue.status = 'repaired' THEN
    RAISE EXCEPTION 'This file is already repaired' USING ERRCODE = '22023';
  END IF;

  UPDATE vault_object_issue
     SET status = CASE p_status WHEN 'rolled_back' THEN 'accepted' ELSE p_status END,
         resolution = CASE p_status WHEN 'accepted' THEN 'accepted' WHEN 'unrecoverable' THEN 'marked_unrecoverable'
                                    WHEN 'rolled_back' THEN 'rolled_back' END,
         resolved_by = CASE WHEN p_status = 'open' THEN NULL ELSE auth.uid() END,
         resolved_at = CASE WHEN p_status = 'open' THEN NULL ELSE NOW() END,
         note = COALESCE(NULLIF(btrim(p_note), ''), note)
   WHERE id = v_issue.id;
  INSERT INTO vault_object_issue_event (issue_id, org_id, action, actor_id, detail)
  VALUES (v_issue.id, v_org,
          CASE p_status WHEN 'accepted' THEN 'accepted' WHEN 'unrecoverable' THEN 'marked_unrecoverable'
                        WHEN 'rolled_back' THEN 'rolled_back' ELSE 'reopened' END,
          auth.uid(), jsonb_build_object('note', p_note, 'previous_status', v_issue.status));
END;
$$;

REVOKE ALL ON FUNCTION vault_object_issue_resolve(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION vault_object_issue_resolve(UUID, TEXT, TEXT) TO authenticated;

-- Which of these content hashes an admin marked unrecoverable, in the caller's organization.
-- Any member may ask: downloads call it before handing content to the user.
CREATE OR REPLACE FUNCTION vault_object_blocked(p_hashes TEXT[])
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(i.content_hash), ARRAY[]::TEXT[])
    FROM vault_object_issue i
   WHERE i.org_id = (SELECT u.org_id FROM app_user u WHERE u.id = auth.uid())
     AND i.status = 'unrecoverable'
     AND i.content_hash = ANY (p_hashes);
$$;

REVOKE ALL ON FUNCTION vault_object_blocked(TEXT[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION vault_object_blocked(TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Registration
-- ---------------------------------------------------------------------------

INSERT INTO schema_function_inventory (signature, module, release) VALUES
  ('backup_issue_alert(uuid,text,text,text)', '10-source-files', 503),
  ('security_monitor_run()', 'core', 503),
  ('backup_issue_record(uuid,text,text,text,text,bigint,text,uuid)', '10-source-files', 503),
  ('backup_issue_record_repair(uuid,text,text,uuid,jsonb)', '10-source-files', 503),
  ('vault_object_issue_list()', '10-source-files', 503),
  ('vault_object_issue_resolve(uuid,text,text)', '10-source-files', 503),
  ('vault_object_blocked(text[])', '10-source-files', 503)
ON CONFLICT (signature) DO UPDATE SET module = EXCLUDED.module, release = EXCLUDED.release;

INSERT INTO schema_manifest_entry (kind, name, module, probe, requires, since_version) VALUES
  ('table', 'vault_object_issue', '10-source-files', NULL, NULL, 503),
  ('table', 'vault_object_issue_event', '10-source-files', NULL, NULL, 503),
  ('function', 'backup_issue_record(uuid,text,text,text,text,bigint,text,uuid)', '10-source-files', NULL, 'vault_object_issue_event', 503),
  ('function', 'backup_issue_record_repair(uuid,text,text,uuid,jsonb)', '10-source-files', NULL, 'vault_object_issue_event', 503),
  ('function', 'vault_object_issue_list()', '10-source-files', NULL, 'is_org_admin && auth.uid', 503),
  ('function', 'vault_object_issue_resolve(uuid,text,text)', '10-source-files', NULL, 'is_org_admin && vault_object_issue_event', 503),
  ('function', 'vault_object_blocked(text[])', '10-source-files', NULL, 'auth.uid', 503),
  ('function', 'backup_issue_alert(uuid,text,text,text)', '10-source-files', NULL, 'security_event_record && is_backup_alert_enabled', 503),
  ('function', 'security_monitor_run()', 'core', NULL, 'org_admin_user_ids && security_operator_user_ids && schema_list_problems', 503)
ON CONFLICT (kind, name) DO UPDATE
  SET module = EXCLUDED.module, probe = EXCLUDED.probe, requires = EXCLUDED.requires,
      since_version = EXCLUDED.since_version;

-- ---------------------------------------------------------------------------
-- Security monitor: notify admins of a damaged or missing file (0502's monitor)
-- ---------------------------------------------------------------------------
-- A new finding (or one found bad again after a repair) records a security_event of kind
-- 'backup_damaged_object', once per object (dedup key kind:org:hash), unless the organization
-- turned backup alerts off. security_monitor_run() turns it into one notification for the
-- organization's admins; several objects in one run collapse into one ("... (and N more)").
ALTER TABLE security_event DROP CONSTRAINT IF EXISTS security_event_kind_check;
ALTER TABLE security_event ADD CONSTRAINT security_event_kind_check CHECK (kind IN (
  'admin_granted', 'domain_join', 'file_delete_spike', 'storage_delete_spike',
  'auth_event_spike', 'orgless_signup_spike', 'schema_drift',
  'backup_failed', 'backup_overdue', 'backup_worker_silent', 'backup_damaged_object'
));

-- The worker records findings as service_role; 0502 revoked this from the client roles only.
GRANT EXECUTE ON FUNCTION security_event_record(UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- 0502's security_monitor_run(), verbatim except the notification title: a title for
-- 'backup_damaged_object' and an ELSE, so no kind can leave the NOT NULL title empty.
CREATE OR REPLACE FUNCTION security_monitor_run()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_hour TEXT := to_char(date_trunc('hour', NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24');
  v_day TEXT := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_platform security_platform_setting%ROWTYPE;
  v_pstate security_platform_state%ROWTYPE;
  v_has_auth_log BOOLEAN := to_regclass('auth.audit_log_entries') IS NOT NULL;
  v_has_storage BOOLEAN := to_regclass('storage.objects') IS NOT NULL;
  v_count BIGINT;
  v_problems INTEGER;
  v_notified INTEGER := 0;
  v_summaries INTEGER := 0;
  o RECORD;
  e RECORD;
BEGIN
  SELECT * INTO v_platform FROM security_platform_setting WHERE id = 1;
  SELECT * INTO v_pstate FROM security_platform_state WHERE id = 1 FOR UPDATE;

  -- Per organization ---------------------------------------------------------------------------
  FOR o IN
    SELECT org.id AS org_id,
           COALESCE(s.is_enabled, true) AS is_enabled,
           COALESCE(s.file_delete_threshold, 200) AS file_delete_threshold,
           COALESCE(s.storage_delete_threshold, 500) AS storage_delete_threshold,
           COALESCE(s.auth_event_threshold, 20) AS auth_event_threshold,
           COALESCE(s.is_backup_alert_enabled, true) AS is_backup_alert_enabled,
           COALESCE(s.backup_overdue_hours, 36) AS backup_overdue_hours
    FROM organization org
    LEFT JOIN org_security_setting s ON s.org_id = org.id
  LOOP
    CONTINUE WHEN NOT o.is_enabled;

    -- Files purged in the last hour (hard deletes; the trash is a soft delete).
    SELECT COUNT(*) INTO v_count FROM realtime_tombstone
    WHERE org_id = o.org_id AND table_name = 'file' AND created_at > v_now - INTERVAL '1 hour';
    IF v_count >= o.file_delete_threshold THEN
      PERFORM security_event_record(o.org_id, 'file_delete_spike', 'high',
        format('%s files were permanently deleted in the last hour', v_count),
        jsonb_build_object('count', v_count, 'threshold', o.file_delete_threshold,
                           'dedup_key', format('file_delete_spike:%s:%s', o.org_id, v_hour)));
    END IF;

    -- Vault storage objects: compare with the count taken at least an hour ago. Storage paths
    -- start with the organization id (src/lib/storage.ts getStoragePath).
    IF v_has_storage THEN
      INSERT INTO security_monitor_state (org_id) VALUES (o.org_id) ON CONFLICT (org_id) DO NOTHING;
      IF COALESCE((SELECT storage_counted_at FROM security_monitor_state WHERE org_id = o.org_id),
                  '-infinity'::timestamptz) <= v_now - INTERVAL '1 hour' THEN
        EXECUTE 'SELECT COUNT(*) FROM storage.objects WHERE bucket_id = ''vault'' AND name LIKE $1'
          INTO v_count USING o.org_id::text || '/%';
        IF (SELECT storage_object_count FROM security_monitor_state WHERE org_id = o.org_id) - v_count
           >= o.storage_delete_threshold THEN
          PERFORM security_event_record(o.org_id, 'storage_delete_spike', 'high',
            format('%s stored file versions were deleted from the vault bucket within an hour',
                   (SELECT storage_object_count FROM security_monitor_state WHERE org_id = o.org_id) - v_count),
            jsonb_build_object('before', (SELECT storage_object_count FROM security_monitor_state WHERE org_id = o.org_id),
                               'after', v_count, 'threshold', o.storage_delete_threshold,
                               'dedup_key', format('storage_delete_spike:%s:%s', o.org_id, v_hour)));
        END IF;
        UPDATE security_monitor_state SET storage_object_count = v_count, storage_counted_at = v_now
        WHERE org_id = o.org_id;
      END IF;
    END IF;

    -- Recovery requests and repeated sign-ups for addresses at the organization's domains. Supabase
    -- Auth records these in auth.audit_log_entries; it does not record failed password sign-ins
    -- there, so this is the sign-in pressure the database can see.
    IF v_has_auth_log THEN
      EXECUTE $q$
        SELECT COUNT(*) FROM auth.audit_log_entries a
        WHERE a.created_at > $1 - INTERVAL '1 hour'
          AND a.payload->>'action' IN ('user_recovery_requested', 'user_repeated_signup', 'user_confirmation_requested')
          AND split_part(lower(a.payload->>'actor_username'), '@', 2) IN
              (SELECT d.domain FROM org_email_domain d WHERE d.org_id = $2)
      $q$ INTO v_count USING v_now, o.org_id;
      IF v_count >= o.auth_event_threshold THEN
        PERFORM security_event_record(o.org_id, 'auth_event_spike', 'high',
          format('%s password recovery or repeated sign-up requests for your domains in the last hour', v_count),
          jsonb_build_object('count', v_count, 'threshold', o.auth_event_threshold,
                             'dedup_key', format('auth_event_spike:%s:%s', o.org_id, v_hour)));
      END IF;
    END IF;

    -- Backups (columns from 0501). A failed or warning run (backup or verify) is reported once,
    -- keyed by its row; only runs that finished in the last two days are looked at. A run closed
    -- as failed because the worker restarted ({"interrupted": true}) is resumed by the worker and
    -- is not news; one that never completes shows up as backup_overdue instead.
    IF o.is_backup_alert_enabled THEN
      PERFORM security_event_record(o.org_id, 'backup_failed',
        CASE WHEN h.status = 'failed' THEN 'high' ELSE 'normal' END,
        format('A %s %s ended with status %s%s', COALESCE(h.runner, 'desktop'), h.kind, h.status,
               COALESCE(': ' || left(h.error_message, 200), '')),
        jsonb_build_object('backup_history_id', h.id, 'status', h.status, 'kind', h.kind,
                           'dedup_key', format('backup_failed:%s', h.id)))
      FROM backup_history h
      WHERE h.org_id = o.org_id AND h.status IN ('failed', 'warning')
        AND NOT COALESCE((h.error_details->>'interrupted')::boolean, false)
        AND COALESCE(h.completed_at, h.started_at) > v_now - INTERVAL '2 days';

      -- Scheduled server backups: one succeeded within the window, and the worker is alive.
      -- A configuration changed less than the window ago is not overdue yet.
      IF EXISTS (SELECT 1 FROM backup_config c
                 WHERE c.org_id = o.org_id AND c.is_schedule_enabled AND c.run_location = 'server'
                   AND COALESCE(c.updated_at, c.created_at) <= v_now - make_interval(hours => o.backup_overdue_hours))
         AND NOT EXISTS (SELECT 1 FROM backup_history h
                         WHERE h.org_id = o.org_id AND h.kind = 'backup' AND h.status IN ('completed', 'warning')
                           AND h.started_at > v_now - make_interval(hours => o.backup_overdue_hours)) THEN
        PERFORM security_event_record(o.org_id, 'backup_overdue', 'high',
          format('No scheduled backup has succeeded in the last %s hours', o.backup_overdue_hours),
          jsonb_build_object('hours', o.backup_overdue_hours, 'dedup_key', format('backup_overdue:%s:%s', o.org_id, v_day)));
      END IF;

      IF EXISTS (SELECT 1 FROM backup_config c
                 WHERE c.org_id = o.org_id AND c.run_location = 'server'
                   AND COALESCE(c.server_worker_seen_at, c.updated_at, c.created_at) < v_now - INTERVAL '10 minutes') THEN
        PERFORM security_event_record(o.org_id, 'backup_worker_silent', 'high',
          'The server backup worker has not checked in for more than 10 minutes',
          jsonb_build_object('last_seen_at', (SELECT c.server_worker_seen_at FROM backup_config c WHERE c.org_id = o.org_id),
                             'dedup_key', format('backup_worker_silent:%s:%s', o.org_id, v_hour)));
      END IF;
    END IF;
  END LOOP;

  -- Deployment-wide ------------------------------------------------------------------------------
  -- Accounts created between two hours and one hour ago that still have no organization: an hour
  -- is long enough for an invited or domain account to have been placed.
  SELECT COUNT(*) INTO v_count FROM app_user u
  WHERE u.org_id IS NULL AND u.created_at > v_now - INTERVAL '2 hours' AND u.created_at <= v_now - INTERVAL '1 hour';
  IF v_count >= v_platform.orgless_signup_threshold THEN
    PERFORM security_event_record(NULL, 'orgless_signup_spike', 'high',
      format('%s new accounts in one hour joined no organization', v_count),
      jsonb_build_object('count', v_count, 'threshold', v_platform.orgless_signup_threshold,
                         'dedup_key', format('orgless_signup_spike:%s', v_hour)));
  END IF;

  IF v_has_auth_log THEN
    EXECUTE $q$
      SELECT COUNT(*) FROM auth.audit_log_entries a
      WHERE a.created_at > $1 - INTERVAL '1 hour'
        AND a.payload->>'action' IN ('user_recovery_requested', 'user_repeated_signup', 'user_confirmation_requested')
    $q$ INTO v_count USING v_now;
    IF v_count >= v_platform.auth_event_threshold THEN
      PERFORM security_event_record(NULL, 'auth_event_spike', 'high',
        format('%s password recovery or repeated sign-up requests across the deployment in the last hour', v_count),
        jsonb_build_object('count', v_count, 'threshold', v_platform.auth_event_threshold,
                           'dedup_key', format('auth_event_spike:platform:%s', v_hour)));
    END IF;
  END IF;

  -- Drift: the stamp's checks, once a day.
  IF v_pstate.last_drift_check_at IS NULL OR v_pstate.last_drift_check_at <= v_now - INTERVAL '23 hours' THEN
    SELECT COUNT(*) INTO v_problems FROM schema_list_problems();
    IF v_problems > 0 THEN
      PERFORM security_event_record(NULL, 'schema_drift', 'high',
        format('The database fails %s release check(s): run supabase/tools/verify-schema.sql for the list', v_problems),
        jsonb_build_object('count', v_problems,
                           'problems', (SELECT jsonb_agg(jsonb_build_object('object', p.object, 'status', p.status))
                                        FROM (SELECT * FROM schema_list_problems() LIMIT 20) p),
                           'dedup_key', format('schema_drift:%s', v_day)));
    END IF;
    UPDATE security_platform_state SET last_drift_check_at = v_now WHERE id = 1;
  END IF;

  -- Notify -----------------------------------------------------------------------------------------
  -- One notification per audience and kind per run, naming how many events it covers. A kind
  -- notified in the last hour waits, so a sustained attack yields one alert an hour, not one a run.
  -- Domain joins are notified only where the organization asked for them; the summary has them all.
  FOR e IN
    SELECT ev.org_id, ev.kind,
           CASE WHEN bool_or(ev.severity = 'high') THEN 'high' ELSE 'normal' END AS severity, COUNT(*) AS n,
           (array_agg(ev.summary ORDER BY ev.created_at DESC))[1] AS latest,
           array_agg(ev.id) AS ids
    FROM security_event ev
    LEFT JOIN org_security_setting s ON s.org_id = ev.org_id
    WHERE ev.notified_at IS NULL
      AND (ev.org_id IS NULL OR COALESCE(s.is_enabled, true))
      AND NOT EXISTS (
        SELECT 1 FROM security_event prev
        WHERE prev.org_id IS NOT DISTINCT FROM ev.org_id AND prev.kind = ev.kind
          AND prev.notified_at > v_now - INTERVAL '1 hour')
    GROUP BY ev.org_id, ev.kind
  LOOP
    IF e.kind = 'domain_join' AND NOT COALESCE(
         (SELECT s.is_domain_join_alert_enabled FROM org_security_setting s WHERE s.org_id = e.org_id), true) THEN
      UPDATE security_event SET notified_at = v_now WHERE id = ANY (e.ids);
      CONTINUE;
    END IF;

    INSERT INTO notification (org_id, user_id, type, category, title, message, priority, entity_type, expires_at)
    SELECT COALESCE(e.org_id, au.org_id), au.id, 'security_alert', 'security',
           CASE e.kind
             WHEN 'admin_granted' THEN 'Security: new administrator'
             WHEN 'domain_join' THEN 'Security: member joined by email domain'
             WHEN 'file_delete_spike' THEN 'Security: many files deleted'
             WHEN 'storage_delete_spike' THEN 'Security: many stored files deleted'
             WHEN 'auth_event_spike' THEN 'Security: unusual sign-in activity'
             WHEN 'orgless_signup_spike' THEN 'Security: sign-up spike'
             WHEN 'schema_drift' THEN 'Security: database drift'
             WHEN 'backup_failed' THEN 'Backups: a run failed'
             WHEN 'backup_overdue' THEN 'Backups: overdue'
             WHEN 'backup_worker_silent' THEN 'Backups: server worker silent'
             WHEN 'backup_damaged_object' THEN 'Backups: damaged file found'
             -- A kind added later without a title here still notifies, instead of a NULL title
             -- failing the whole run for every organization.
             ELSE 'Security: ' || e.kind
           END,
           CASE WHEN e.n > 1 THEN format('%s (and %s more)', e.latest, e.n - 1) ELSE e.latest END,
           CASE WHEN e.severity = 'high' THEN 'high' ELSE 'normal' END,
           'security_event', v_now + INTERVAL '30 days'
    FROM app_user au
    WHERE au.org_id IS NOT NULL
      AND au.id IN (
        SELECT org_admin_user_ids(e.org_id) WHERE e.org_id IS NOT NULL
        UNION
        SELECT security_operator_user_ids() WHERE e.org_id IS NULL
      );

    UPDATE security_event SET notified_at = v_now WHERE id = ANY (e.ids);
    v_notified := v_notified + 1;
  END LOOP;

  -- Daily summary ----------------------------------------------------------------------------------
  FOR o IN
    SELECT org.id AS org_id, COALESCE(s.summary_hour_utc, 14) AS summary_hour_utc, st.last_summary_at
    FROM organization org
    LEFT JOIN org_security_setting s ON s.org_id = org.id
    LEFT JOIN security_monitor_state st ON st.org_id = org.id
    WHERE COALESCE(s.is_enabled, true) AND COALESCE(s.is_daily_summary_enabled, true)
  LOOP
    CONTINUE WHEN extract(hour FROM v_now AT TIME ZONE 'UTC') <> o.summary_hour_utc;
    CONTINUE WHEN o.last_summary_at IS NOT NULL AND o.last_summary_at > v_now - INTERVAL '20 hours';

    INSERT INTO notification (org_id, user_id, type, category, title, message, priority, entity_type, expires_at)
    SELECT o.org_id, a, 'security_summary', 'security', 'Security: daily summary',
           (SELECT COALESCE(NULLIF(string_agg(format('%s: %s', kind, n), ', ' ORDER BY kind), ''),
                            'No security events')
                   || format('. New members: %s. Admins: %s.',
                             (SELECT COUNT(*) FROM app_user m WHERE m.org_id = o.org_id AND m.created_at > v_now - INTERVAL '1 day'),
                             (SELECT COUNT(*) FROM org_admin_user_ids(o.org_id)))
            FROM (SELECT kind, COUNT(*) AS n FROM security_event
                  WHERE org_id = o.org_id AND created_at > v_now - INTERVAL '1 day' GROUP BY kind) k),
           'normal', 'security_event', v_now + INTERVAL '7 days'
    FROM org_admin_user_ids(o.org_id) a;

    INSERT INTO security_monitor_state (org_id, last_summary_at) VALUES (o.org_id, v_now)
    ON CONFLICT (org_id) DO UPDATE SET last_summary_at = EXCLUDED.last_summary_at;
    v_summaries := v_summaries + 1;
  END LOOP;

  IF extract(hour FROM v_now AT TIME ZONE 'UTC') = v_platform.summary_hour_utc
     AND (v_pstate.last_summary_at IS NULL OR v_pstate.last_summary_at <= v_now - INTERVAL '20 hours') THEN
    INSERT INTO notification (org_id, user_id, type, category, title, message, priority, entity_type, expires_at)
    SELECT au.org_id, au.id, 'security_summary', 'security', 'Security: deployment daily summary',
           (SELECT COALESCE(NULLIF(string_agg(format('%s: %s', kind, n), ', ' ORDER BY kind), ''),
                            'No deployment-wide security events')
                   || format('. New accounts: %s, of which without an organization: %s.',
                             (SELECT COUNT(*) FROM app_user m WHERE m.created_at > v_now - INTERVAL '1 day'),
                             (SELECT COUNT(*) FROM app_user m WHERE m.org_id IS NULL AND m.created_at > v_now - INTERVAL '1 day'))
            FROM (SELECT kind, COUNT(*) AS n FROM security_event
                  WHERE org_id IS NULL AND created_at > v_now - INTERVAL '1 day' GROUP BY kind) k),
           'normal', 'security_event', v_now + INTERVAL '7 days'
    FROM app_user au
    WHERE au.org_id IS NOT NULL AND au.id IN (SELECT security_operator_user_ids());
    UPDATE security_platform_state SET last_summary_at = v_now WHERE id = 1;
  END IF;

  -- Prune ------------------------------------------------------------------------------------------
  DELETE FROM realtime_tombstone WHERE created_at < v_now - INTERVAL '1 day';
  DELETE FROM security_event WHERE created_at < v_now - INTERVAL '90 days';
  UPDATE security_platform_state SET last_run_at = v_now WHERE id = 1;

  RETURN json_build_object('notified', v_notified, 'summaries', v_summaries, 'ran_at', v_now);
END;
$$;

-- ===========================================
-- Release
-- ===========================================
CREATE OR REPLACE FUNCTION schema_release_version() RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$ SELECT 503 $$;
CREATE OR REPLACE FUNCTION schema_release_description() RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$ SELECT
  'Damaged and missing vault content. vault_object_issue keeps one row per content hash '
  'whose stored bytes do not match their name (damaged) or that a file version names with '
  'nothing in storage (missing), recorded by server backups and tests through '
  'backup_issue_record() (service_role), with status open, repaired, unrecoverable or '
  'accepted, and vault_object_issue_event logs every finding and action. Admins read them '
  'through vault_object_issue_list() and decide with vault_object_issue_resolve(); the API '
  'repairs through backup_issue_record_repair() after re-hashing; downloads ask '
  'vault_object_blocked() for content marked unrecoverable.'
$$;
