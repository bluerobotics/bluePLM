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

-- An admin's decision on an open issue: 'accepted' (with a note: why it does not matter) or
-- 'unrecoverable' (downloads of that content are then refused), or back to 'open'. Recorded
-- on the issue and in its event log, with the admin as actor.
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
  IF p_status NOT IN ('accepted', 'unrecoverable', 'open') THEN
    RAISE EXCEPTION 'Unknown status %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_status = 'accepted' AND NULLIF(btrim(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'Accepting a damaged file needs a note saying why' USING ERRCODE = '22023';
  END IF;
  IF v_issue.status = 'repaired' THEN
    RAISE EXCEPTION 'This file is already repaired' USING ERRCODE = '22023';
  END IF;

  UPDATE vault_object_issue
     SET status = p_status,
         resolution = CASE p_status WHEN 'accepted' THEN 'accepted' WHEN 'unrecoverable' THEN 'marked_unrecoverable' END,
         resolved_by = CASE WHEN p_status = 'open' THEN NULL ELSE auth.uid() END,
         resolved_at = CASE WHEN p_status = 'open' THEN NULL ELSE NOW() END,
         note = COALESCE(NULLIF(btrim(p_note), ''), note)
   WHERE id = v_issue.id;
  INSERT INTO vault_object_issue_event (issue_id, org_id, action, actor_id, detail)
  VALUES (v_issue.id, v_org,
          CASE p_status WHEN 'accepted' THEN 'accepted' WHEN 'unrecoverable' THEN 'marked_unrecoverable' ELSE 'reopened' END,
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
  ('function', 'vault_object_blocked(text[])', '10-source-files', NULL, 'auth.uid', 503)
ON CONFLICT (kind, name) DO UPDATE
  SET module = EXCLUDED.module, probe = EXCLUDED.probe, requires = EXCLUDED.requires,
      since_version = EXCLUDED.since_version;

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
