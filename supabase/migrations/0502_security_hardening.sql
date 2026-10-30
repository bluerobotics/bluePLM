-- 0502 security hardening: the blueplm.io audit's remaining low findings, and security
-- monitoring that alerts organization admins.
--
-- Plan and decisions: .cursor/plans/security-followup-502.plan.md
--
--   1. can_access_module(text, uuid) answers for the caller only. It used to answer for any user id,
--      which let any account read another organization's module_access setup.
--   2. Realtime DELETE events are no longer published. Supabase Realtime cannot apply RLS to a
--      deleted row, so every subscriber of a table received the primary key of every row deleted
--      in every organization. Deletes the client needs now arrive as INSERTs on realtime_tombstone,
--      which RLS does filter.
--   3. organization.email_domains: one organization per domain (org_email_domain), no public mail
--      provider, and a domain added by a signed-in admin must be that admin's own verified domain.
--   4. check_function_inventory(): the stamp refuses a public function that is SECURITY DEFINER
--      or executable by anon / authenticated and that no release registered.
--   5. Security monitoring (and backup health, for 0501's server backups): triggers record admin grants and email-domain joins in security_event;
--      security_monitor_run() (pg_cron, every 10 minutes) adds rate signals, turns new events into
--      notification rows for the organization's admins, sends a daily summary and runs the
--      release checks once a day. Thresholds are per organization (org_security_setting).
--   6. auth_hook_before_user_created(jsonb): Supabase Auth's Before User Created hook. No account
--      is created for an address with no invitation, organization domain or supplier contact.
--
-- Runs in one transaction under the migration runner. Idempotent where the runner may meet a
-- partly prepared database (IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS before CREATE).

-- ===========================================
-- 1. can_access_module answers for the caller
-- ===========================================
-- The signature stays: the Customers extension's policies depend on it, and changing it would
-- need those dropped first. A second user id is honoured only for a server caller (no auth.uid():
-- the SQL editor, service role, pg_cron). For a client it must be the caller's own id; anything
-- else is refused rather than answered false, so a probe learns nothing and a bug is loud.

CREATE OR REPLACE FUNCTION can_access_module(
  p_module_id TEXT,
  p_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'can_access_module answers for the calling user only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT org_id INTO v_org_id FROM app_user WHERE id = v_user_id;
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF is_org_admin(v_user_id) THEN
    RETURN true;
  END IF;

  -- Unrestricted until an admin adds a subject
  IF NOT EXISTS (
    SELECT 1 FROM module_access ma
    WHERE ma.org_id = v_org_id AND ma.module_id = p_module_id
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM module_access ma
    WHERE ma.org_id = v_org_id
      AND ma.module_id = p_module_id
      AND ma.user_id = v_user_id
  ) OR EXISTS (
    SELECT 1 FROM module_access ma
    JOIN team_member tm ON tm.team_id = ma.team_id
    WHERE ma.org_id = v_org_id
      AND ma.module_id = p_module_id
      AND tm.user_id = v_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION can_access_module(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_access_module(TEXT, UUID) TO authenticated;

-- ===========================================
-- 2. Realtime deletes through tombstones
-- ===========================================
-- Supabase Realtime (Postgres Changes) checks a subscriber's SELECT policy against the new row of
-- an INSERT or UPDATE. A deleted row has nothing left to check, so DELETE events skip RLS and
-- skip the subscription filter, and carry the primary key. Publishing inserts and updates only
-- closes that for every table in the publication, including ones added later; check_realtime_
-- publication() keeps it closed.
--
-- The client still needs some deletes (a file purged from the trash, a swatch, a vault, a lost
-- team membership). A statement trigger on those tables writes one realtime_tombstone row per
-- deleted row; its INSERT event goes through realtime_tombstone's RLS, which follows the same
-- rules as the row it replaces (organization, vault access, a personal swatch's owner).

CREATE TABLE IF NOT EXISTS realtime_tombstone (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  -- The deleted row's primary key: id, or extension_id for org_installed_extension.
  row_id TEXT NOT NULL,
  -- A file or folder's vault: the row is readable only by those who could read the vault.
  vault_id UUID,
  -- The member a membership row named (team_member, vault_access, ...), for the client's filter.
  subject_user_id UUID,
  -- Set only for a personal row (a user's own colour swatch): nobody else may see it.
  audience_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS realtime_tombstone_created_at_idx ON realtime_tombstone (created_at);
CREATE INDEX IF NOT EXISTS realtime_tombstone_org_id_table_name_created_at_idx
  ON realtime_tombstone (org_id, table_name, created_at);

ALTER TABLE realtime_tombstone ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON realtime_tombstone FROM anon, authenticated;
GRANT SELECT ON realtime_tombstone TO authenticated;

DROP POLICY IF EXISTS "realtime_tombstone: members read" ON realtime_tombstone;
CREATE POLICY "realtime_tombstone: members read"
  ON realtime_tombstone FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT u.org_id FROM app_user u WHERE u.id = (SELECT auth.uid()))
    AND (vault_id IS NULL OR vault_id IN (SELECT my_accessible_vault_ids()))
    AND (audience_user_id IS NULL OR audience_user_id = (SELECT auth.uid()))
  );

-- One INSERT per statement, so emptying the trash of 5,000 files is one statement here too.
-- Rows whose organization cannot be resolved are skipped: no organization, no audience.
CREATE OR REPLACE FUNCTION trg_realtime_tombstone_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO realtime_tombstone (org_id, table_name, row_id, vault_id, subject_user_id, audience_user_id)
  SELECT org_id, TG_TABLE_NAME, row_id, vault_id, subject_user_id, audience_user_id
  FROM (
    SELECT
      COALESCE(r->>'id', r->>'extension_id') AS row_id,
      COALESCE(
        (r->>'org_id')::uuid,
        (SELECT t.org_id FROM team t WHERE t.id = (r->>'team_id')::uuid),
        (SELECT v.org_id FROM vault v WHERE v.id = (r->>'vault_id')::uuid),
        (SELECT u.org_id FROM app_user u WHERE u.id = (r->>'user_id')::uuid)
      ) AS org_id,
      CASE WHEN TG_TABLE_NAME IN ('file', 'folder') THEN (r->>'vault_id')::uuid END AS vault_id,
      CASE WHEN TG_TABLE_NAME = 'color_swatch' THEN NULL ELSE (r->>'user_id')::uuid END AS subject_user_id,
      CASE WHEN TG_TABLE_NAME = 'color_swatch' THEN (r->>'user_id')::uuid END AS audience_user_id
    FROM (SELECT to_jsonb(o) AS r FROM old_rows o) j
  ) s
  WHERE org_id IS NOT NULL AND row_id IS NOT NULL;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION trg_realtime_tombstone_write() FROM PUBLIC, anon, authenticated;

-- The tables whose deletes the client acts on (src/lib/realtimeTombstones.ts lists the same set).
-- A table that is not installed (an optional module) is skipped.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'file', 'folder', 'color_swatch', 'vault', 'vault_access', 'team', 'team_member',
    'user_workflow_role', 'org_installed_extension', 'solidworks_license',
    'solidworks_license_assignment'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_realtime_tombstone', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER DELETE ON %I REFERENCING OLD TABLE AS old_rows '
      || 'FOR EACH STATEMENT EXECUTE FUNCTION trg_realtime_tombstone_write()',
      'trg_' || t || '_realtime_tombstone', t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update');
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'realtime_tombstone'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE realtime_tombstone;
    END IF;
  END IF;
END $$;

-- Invariant for the stamp: the publication must not publish deletes or truncates, and the
-- tombstone table must be in it. No publication (plain Postgres, tests) is no finding.
CREATE OR REPLACE FUNCTION check_realtime_publication()
RETURNS TABLE (identity TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  p RECORD;
BEGIN
  SELECT pubdelete, pubtruncate INTO p FROM pg_publication WHERE pubname = 'supabase_realtime';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF p.pubdelete OR p.pubtruncate THEN
    identity := 'publication supabase_realtime';
    status := 'realtime-publishes-delete';
    detail := 'Realtime sends DELETE and TRUNCATE events without RLS, so every subscriber sees '
           || 'the primary keys of rows deleted in every organization. '
           || 'ALTER PUBLICATION supabase_realtime SET (publish = ''insert, update'');';
    RETURN NEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'realtime_tombstone'
  ) THEN
    identity := 'publication supabase_realtime';
    status := 'realtime-tombstone-unpublished';
    detail := 'realtime_tombstone is not in the publication, so clients never hear of deletes. '
           || 'ALTER PUBLICATION supabase_realtime ADD TABLE realtime_tombstone;';
    RETURN NEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION check_realtime_publication() FROM PUBLIC, anon, authenticated;

-- ===========================================
-- 3. organization.email_domains
-- ===========================================
-- A domain in email_domains pulls every new verified account at that domain into the organization
-- (user_ensure_org_id, org_join_by_slug). So a domain belongs to one organization, is never a
-- public mail provider, and is added by someone who holds an address there.
--
-- org_email_domain mirrors the arrays with domain as its primary key, so uniqueness is enforced by
-- Postgres under concurrency instead of by a check that two transactions can both pass.

CREATE TABLE IF NOT EXISTS org_email_domain (
  domain TEXT PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_email_domain_org_id_idx ON org_email_domain (org_id);

ALTER TABLE org_email_domain ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON org_email_domain FROM anon, authenticated;
-- No policy: clients read the domains from organization.email_domains, as before.

-- Free mail providers whose addresses anyone can create. Not exhaustive, and does not need to be:
-- the proof-of-control rule below already refuses a domain the admin holds no address at, and an
-- admin whose own address is on a free provider is the case this list exists for.
CREATE OR REPLACE FUNCTION is_public_email_domain(p_domain TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(p_domain) = ANY (ARRAY[
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr',
    'hotmail.de', 'hotmail.es', 'hotmail.it', 'live.com', 'live.co.uk', 'live.fr', 'msn.com',
    'passport.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it',
    'yahoo.co.jp', 'yahoo.com.br', 'ymail.com', 'rocketmail.com', 'aol.com', 'aim.com',
    'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me',
    'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch', 'web.de', 'mail.com', 'email.com',
    'zoho.com', 'zohomail.com', 'yandex.com', 'yandex.ru', 'ya.ru', 'mail.ru', 'bk.ru', 'inbox.ru',
    'list.ru', 'qq.com', 'foxmail.com', '163.com', '126.com', 'yeah.net', 'sina.com', 'sina.cn',
    'sohu.com', 'aliyun.com', 'naver.com', 'hanmail.net', 'daum.net', 'tutanota.com',
    'tutanota.de', 'tuta.io', 'tuta.com', 'fastmail.com', 'fastmail.fm', 'hey.com', 'hushmail.com',
    'mailfence.com', 'disroot.org', 'posteo.de', 'mailbox.org', 'runbox.com', 'seznam.cz',
    'orange.fr', 'wanadoo.fr', 'free.fr', 'laposte.net', 'libero.it', 'virgilio.it', 't-online.de',
    'freenet.de', 'btinternet.com', 'sky.com', 'comcast.net', 'verizon.net', 'att.net',
    'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net', 'earthlink.net', 'rediffmail.com',
    'yopmail.com', 'mailinator.com', 'guerrillamail.com', 'sharklasers.com', 'tempmail.com',
    '10minutemail.com', 'trashmail.com', 'getnada.com', 'duck.com'
  ]);
$$;

GRANT EXECUTE ON FUNCTION is_public_email_domain(TEXT) TO authenticated;

-- BEFORE: normalize (lower case, trimmed, no leading '@', no duplicates) and refuse what may not
-- be added. Domains the row already had are not re-checked against the caller, so an admin at
-- another address can still remove a domain or save unrelated settings.
CREATE OR REPLACE FUNCTION trg_organization_email_domains_check()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain TEXT;
  v_old TEXT[];
  v_caller_domain TEXT;
BEGIN
  NEW.email_domains := COALESCE((
    SELECT array_agg(d ORDER BY d)
    FROM (
      SELECT DISTINCT ltrim(lower(btrim(x)), '@') AS d
      FROM unnest(COALESCE(NEW.email_domains, '{}'::TEXT[])) x
    ) s
    WHERE d <> ''
  ), '{}'::TEXT[]);

  v_old := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.email_domains, '{}'::TEXT[]) ELSE '{}'::TEXT[] END;

  FOREACH v_domain IN ARRAY NEW.email_domains LOOP
    CONTINUE WHEN v_domain = ANY (v_old);

    IF v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN
      RAISE EXCEPTION 'Not a domain name: %', v_domain USING ERRCODE = 'check_violation';
    END IF;

    IF is_public_email_domain(v_domain) THEN
      RAISE EXCEPTION 'Public mail domain % cannot be an organization''s email domain: anyone can create an address there', v_domain
        USING ERRCODE = 'check_violation';
    END IF;

    -- Proof of control: a signed-in caller adds only the domain of their own verified address.
    -- A server caller (SQL editor, service role) has no auth.uid() and is trusted.
    IF auth.uid() IS NOT NULL THEN
      v_caller_domain := split_part(COALESCE(user_get_verified_email(auth.uid()), ''), '@', 2);
      IF v_caller_domain IS DISTINCT FROM v_domain THEN
        RAISE EXCEPTION 'You can add only the domain of your own verified address (%), not %',
          NULLIF(v_caller_domain, ''), v_domain
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM org_email_domain d WHERE d.domain = v_domain AND d.org_id <> NEW.id) THEN
      RAISE EXCEPTION 'The domain % belongs to another organization', v_domain
        USING ERRCODE = 'unique_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION trg_organization_email_domains_check() FROM PUBLIC, anon, authenticated;

-- AFTER: mirror into org_email_domain. Its primary key is what holds when two organizations add
-- the same domain at the same time.
CREATE OR REPLACE FUNCTION trg_organization_email_domains_sync()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM org_email_domain WHERE org_id = NEW.id AND NOT (domain = ANY (NEW.email_domains));
  INSERT INTO org_email_domain (domain, org_id)
  SELECT d, NEW.id FROM unnest(NEW.email_domains) d
  ON CONFLICT (domain) DO NOTHING;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.email_domains) d
    JOIN org_email_domain oed ON oed.domain = d AND oed.org_id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'An email domain of this organization belongs to another organization'
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION trg_organization_email_domains_sync() FROM PUBLIC, anon, authenticated;

-- Existing data, before the triggers exist: public domains come out, and a domain two
-- organizations both list comes out of both (neither can be shown to own it; an admin re-adds it
-- with an address there). Both are logged with the rows as they were.
DO $$
DECLARE
  v_subjects JSONB;
  v_rows INTEGER;
BEGIN
  WITH listed AS (
    SELECT o.id AS org_id, ltrim(lower(btrim(x)), '@') AS domain
    FROM organization o, unnest(o.email_domains) x
  ), shared AS (
    SELECT domain FROM listed GROUP BY domain HAVING COUNT(DISTINCT org_id) > 1
  ), bad AS (
    SELECT org_id, domain,
           CASE WHEN is_public_email_domain(domain) THEN 'public mail domain' ELSE 'listed by several organizations' END AS reason
    FROM listed
    WHERE is_public_email_domain(domain) OR domain IN (SELECT domain FROM shared)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('org_id', org_id, 'domain', domain, 'reason', reason)), '[]'::jsonb),
         COUNT(*)
    INTO v_subjects, v_rows
  FROM bad;

  IF v_rows > 0 THEN
    UPDATE organization o
    SET email_domains = ARRAY(
      SELECT x FROM unnest(o.email_domains) x
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_subjects) s
        WHERE (s->>'org_id')::uuid = o.id AND s->>'domain' = ltrim(lower(btrim(x)), '@')
      )
    )
    WHERE o.id IN (SELECT (s->>'org_id')::uuid FROM jsonb_array_elements(v_subjects) s);

    PERFORM schema_remediation_record(
      'email_domains_public_or_shared', v_rows, v_subjects,
      'Removed from organization.email_domains: a public mail domain lets anyone join, and a domain '
      || 'several organizations list sent new accounts to whichever sorted first. Re-add a domain '
      || 'from an admin account with a verified address at it.');
  END IF;

  UPDATE organization o
  SET email_domains = COALESCE((
    SELECT array_agg(DISTINCT ltrim(lower(btrim(x)), '@') ORDER BY ltrim(lower(btrim(x)), '@'))
    FROM unnest(o.email_domains) x WHERE btrim(x) <> ''
  ), '{}'::TEXT[])
  WHERE cardinality(o.email_domains) > 0;

  INSERT INTO org_email_domain (domain, org_id)
  SELECT d, o.id FROM organization o, unnest(o.email_domains) d
  ON CONFLICT (domain) DO NOTHING;
END $$;

DROP TRIGGER IF EXISTS trg_organization_email_domains_check ON organization;
CREATE TRIGGER trg_organization_email_domains_check
  BEFORE INSERT OR UPDATE OF email_domains ON organization
  FOR EACH ROW EXECUTE FUNCTION trg_organization_email_domains_check();

DROP TRIGGER IF EXISTS trg_organization_email_domains_sync ON organization;
CREATE TRIGGER trg_organization_email_domains_sync
  AFTER INSERT OR UPDATE OF email_domains ON organization
  FOR EACH ROW EXECUTE FUNCTION trg_organization_email_domains_sync();

-- ===========================================
-- 4. Every exposed function is registered
-- ===========================================
-- Production once carried functions no release defined: created by hand, never dropped, with no
-- caller checks, and reachable over PostgREST. The manifest could not see them because it lists
-- what must exist, not what may. schema_function_inventory is the second list: every public
-- function a release defines. A migration that adds a function registers it here; one that drops
-- a function deletes its row. check_function_inventory() refuses any public function that is
-- SECURITY DEFINER or executable by anon or authenticated and is not registered. Functions owned
-- by an extension are not the schema's and are left out.

CREATE TABLE IF NOT EXISTS schema_function_inventory (
  signature TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  release INTEGER NOT NULL
);

ALTER TABLE schema_function_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON schema_function_inventory FROM anon, authenticated;

CREATE OR REPLACE FUNCTION check_function_inventory()
RETURNS TABLE (signature TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_sig TEXT;
  v_oid OID;
  v_registered OID[] := ARRAY[]::OID[];
BEGIN
  -- to_regprocedure() raises on PostgreSQL 15 when an argument type does not exist (an optional
  -- module's enum that is not installed); such a function cannot exist either, so it is skipped.
  FOR v_sig IN SELECT i.signature FROM schema_function_inventory i LOOP
    BEGIN
      v_oid := to_regprocedure(v_sig);
    EXCEPTION WHEN OTHERS THEN
      v_oid := NULL;
    END;
    IF v_oid IS NOT NULL THEN
      v_registered := v_registered || v_oid;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT p.oid::regprocedure::text,
         'unregistered'::text,
         concat_ws(' ',
           CASE WHEN p.prosecdef THEN 'SECURITY DEFINER.' END,
           CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'anon may EXECUTE.' END,
           CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'authenticated may EXECUTE.' END,
           'No release defines it (schema_function_inventory), so nothing vouches for its checks.',
           'Drop it, or register it in the migration that defines it.')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND (p.prosecdef
         OR has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    AND NOT (p.oid = ANY (v_registered))
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION check_function_inventory() FROM PUBLIC, anon, authenticated;

-- The baseline's functions and this release's. Generated from supabase/ by
-- scripts/security/function-inventory.mjs; src/lib/supabase/functionInventory.test.ts fails when a
-- function the SQL defines is missing here.
INSERT INTO schema_function_inventory (signature, module, release)
SELECT s, 'baseline', 500 FROM unnest(ARRAY[
  -- @inventory:baseline:start
  'admin_recovery_code_use(text, text)',
  'anon_enforce_execute_posture()',
  'anon_get_execute_allowlist()',
  'anon_get_read_allowlist()',
  'anon_list_admitting_policies(oid)',
  'anon_list_read_grantors(oid)',
  'anon_list_revoke_grantors(oid)',
  'backup_get_status()',
  'bom_calculate_cost(uuid, integer)',
  'can_access_module(text, uuid)',
  'can_access_vault(uuid)',
  'can_read_vault_object(text)',
  'can_review_gate(uuid, uuid)',
  'can_run_transition(uuid, uuid)',
  'can_user_access_vault(uuid, uuid)',
  'check_anon_reach()',
  'check_gate_requirements(uuid, text)',
  'check_null_unsafe_org_gates()',
  'check_org_gates()',
  'check_release_residue()',
  'check_schema_release()',
  'check_unbound_entity_args()',
  'check_withdrawn_execute()',
  'custom_properties_merge(jsonb, jsonb)',
  'drawing_pdf_render_get(uuid)',
  'drawing_pdf_render_record(uuid, text, bigint, boolean)',
  'eco_gate_approve(uuid, text, text)',
  'eco_require_access(uuid)',
  'extension_config_get(uuid, text)',
  'extension_config_update(uuid, text, jsonb)',
  'extension_get_stats(uuid, text)',
  'extension_http_log_cleanup(integer)',
  'extension_secret_access_cleanup(integer)',
  'file_checkin(uuid, uuid, text, bigint, text, text, text, text, integer, jsonb, text, text, text)',
  'file_checkout(uuid, uuid, text, text, text)',
  'file_get_active_by_path(uuid, text)',
  'file_get_legacy_state(text)',
  'file_move(uuid, uuid, text, text)',
  'file_repair_config_maps(uuid, jsonb)',
  'file_require_access(uuid)',
  'file_share_link_admit(text)',
  'file_share_link_consume(text)',
  'file_share_link_create(uuid, uuid, uuid, integer, integer, boolean)',
  'file_share_link_generate_token()',
  'file_share_link_remediate_cross_tenant()',
  'file_share_link_validate(text)',
  'file_version_get_dependency_closure(uuid)',
  'file_version_reference_list_edges(uuid[], uuid)',
  'file_version_reference_record(uuid, jsonb)',
  'folder_remediate_case_collisions()',
  'folder_rename(text, text, uuid, uuid)',
  'gate_review_complete(uuid, review_status, text, jsonb)',
  'gate_review_list_awaiting_ids(uuid)',
  'gate_review_list_mine()',
  'gate_reviewer_list_user_ids(uuid, uuid)',
  'has_team_permission(text, permission_action, uuid)',
  'has_user_permission(uuid, text, permission_action, uuid)',
  'is_org_admin()',
  'is_org_admin(uuid)',
  'is_org_file_workflows_enabled(uuid)',
  'is_org_gate_status_blocking(text)',
  'is_org_member(uuid)',
  'item_designation_assignment_list(uuid, uuid)',
  'item_designation_assignment_set(uuid, uuid, text, uuid)',
  'item_designation_delete(uuid, uuid)',
  'item_designation_list(uuid)',
  'item_designation_upsert(uuid, text, uuid, integer)',
  'item_image_list(uuid)',
  'item_image_reset(uuid, text)',
  'item_image_upsert(uuid, text, text, text, text, text)',
  'job_title_create_defaults(uuid, uuid)',
  'like_pattern_escape(text)',
  'module_access_get_config()',
  'module_access_set(text, uuid[], uuid[])',
  'module_list_denied()',
  'my_accessible_vault_ids()',
  'my_actor_id()',
  'my_solidworks_license_ids()',
  'my_verified_email()',
  'odoo_saved_config_list(uuid)',
  'org_force_column_defaults(uuid, jsonb)',
  'org_force_module_defaults(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)',
  'org_gate_get_exclusion_reason(oid)',
  'org_get_auth_providers(text)',
  'org_get_column_defaults(uuid)',
  'org_get_google_drive_settings(uuid)',
  'org_get_item_definition_settings(uuid)',
  'org_get_module_defaults(uuid)',
  'org_integration_get_status(uuid, text)',
  'org_join_by_slug(text)',
  'org_regenerate_slug()',
  'org_remove_user(text)',
  'org_require_member(uuid)',
  'org_rpc_revoke_public_execute()',
  'org_set_column_defaults(uuid, jsonb)',
  'org_set_module_defaults(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)',
  'org_update_branding(uuid, text, text, text, text, text)',
  'org_update_google_drive_settings(uuid, text, text, boolean, text)',
  'org_update_item_definition_settings(uuid, jsonb)',
  'org_update_serialization_settings(uuid, jsonb)',
  'part_supplier_get_best_price(uuid, integer)',
  'pending_license_assignment_add(uuid, uuid)',
  'pending_license_assignment_apply(uuid)',
  'pending_license_assignment_remove(uuid, uuid)',
  'probe_get_literal(text)',
  'probe_get_literal_for_arg(oid, text, text)',
  'process_template_instantiate(uuid, uuid)',
  'review_advance_files(uuid, boolean)',
  'review_advance_items(uuid, boolean)',
  'review_apply_workflow_after_settle(uuid, text)',
  'review_approve_all_remaining(uuid, text)',
  'review_cancel(uuid, text)',
  'review_count_badge()',
  'review_get_detail(uuid)',
  'review_get_display_title(uuid)',
  'review_get_user_json(uuid)',
  'review_get_workflow_status(uuid)',
  'review_item_add(uuid, uuid[])',
  'review_item_list_owed_ids(uuid, uuid)',
  'review_item_remove(uuid, uuid[])',
  'review_item_respond(uuid, jsonb)',
  'review_list_open_for_files(uuid[])',
  'review_list_queue(text, uuid, text, integer, text)',
  'review_notify(uuid, uuid[], uuid, text, text, text, uuid, text)',
  'review_notify_overdue()',
  'review_priority_get_rank(text)',
  'review_request(uuid[], uuid[], uuid[], text, text, text, text, date)',
  'review_require_access(uuid)',
  'review_resubmit(uuid, jsonb, text)',
  'review_settle(uuid, uuid, boolean)',
  'review_stage_get_exit_transition(uuid)',
  'review_status_get_label(review_status)',
  'review_update_meta(uuid, text, date, boolean)',
  'review_withdraw_lost_reviewers()',
  'revision_get_next(text, revision_scheme)',
  'rfq_generate_number(uuid)',
  'routine_drop_overloads(text)',
  'routine_list_row_selecting_id_args(oid)',
  'schema_get_release_manifest()',
  'schema_get_withdrawn_execute_manifest()',
  'schema_migrate_uuid_defaults()',
  'schema_release_description()',
  'schema_release_version()',
  'schema_remediation_record(text, integer, jsonb, text)',
  'schema_stamp_quiet()',
  'schema_version_update(integer, text)',
  'serial_number_get_next(uuid)',
  'serial_number_preview_next(uuid)',
  'solidworks_license_activate(uuid, text, text)',
  'solidworks_license_assign(uuid, uuid)',
  'solidworks_license_deactivate(uuid)',
  'solidworks_license_unassign(uuid)',
  'sql_strip_noise(text)',
  'team_clear_module_defaults(uuid)',
  'team_create_defaults(uuid, uuid)',
  'team_get_module_defaults(uuid)',
  'team_member_apply_pending(uuid)',
  'team_reviewer_list_user_ids(uuid)',
  'team_set_module_defaults(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)',
  'trg_app_user_claim_pending_membership()',
  'trg_app_user_set_org_id()',
  'trg_auth_user_sync_app_user()',
  'trg_color_swatch_set_creator()',
  'trg_eco_sync_file_tags()',
  'trg_file_comment_check_integrity()',
  'trg_file_comment_link_review()',
  'trg_file_eco_sync_tags()',
  'trg_file_log_activity()',
  'trg_file_notify_watchers()',
  'trg_integration_credential_set_updated_at()',
  'trg_org_address_ensure_single_default()',
  'trg_org_address_set_updated_at()',
  'trg_organization_create_defaults()',
  'trg_review_item_resettle_on_delete()',
  'trg_review_withdraw_lost_reviewers()',
  'trg_set_updated_at()',
  'user_block(text, text)',
  'user_delete_account()',
  'user_ensure_org_id()',
  'user_get_column_defaults()',
  'user_get_effective_role(uuid)',
  'user_get_module_defaults(uuid)',
  'user_get_verified_email(uuid)',
  'user_permission_list(uuid, uuid)',
  'user_require_same_org(uuid)',
  'user_set_column_defaults(jsonb)',
  'user_unblock(text)',
  'user_update_avatar(text, text)',
  'user_update_last_online()',
  'user_vault_access_list(uuid)',
  'vault_file_count(uuid, uuid)',
  'vault_file_list(uuid, uuid)',
  'vault_file_list_delta(uuid, uuid, timestamptz)',
  'vault_require_access(uuid)',
  'verify_and_stamp_schema()',
  'webhook_list_for_event(uuid, webhook_event)',
  'workflow_create_default(uuid, uuid)',
  'workflow_history_remediate_cross_tenant()',
  'workflow_import_graph(uuid, jsonb)',
  'workflow_transition_apply(uuid, uuid, uuid, text, jsonb)',
  'workflow_transition_execute(uuid, uuid, text)',
  'workflow_transition_execute_to_legacy_state(uuid, text, text)',
  'workflow_transition_list_available(uuid, uuid)'
  -- @inventory:baseline:end
]::TEXT[]) s
ON CONFLICT (signature) DO NOTHING;

INSERT INTO schema_function_inventory (signature, module, release) VALUES
  ('can_access_module(text,uuid)', 'core', 502),
  ('trg_realtime_tombstone_write()', 'core', 502),
  ('check_realtime_publication()', 'core', 502),
  ('is_public_email_domain(text)', 'core', 502),
  ('trg_organization_email_domains_check()', 'core', 502),
  ('trg_organization_email_domains_sync()', 'core', 502),
  ('check_function_inventory()', 'core', 502),
  ('schema_list_problems()', 'core', 502),
  ('verify_and_stamp_schema()', 'core', 502),
  ('is_security_operator()', 'core', 502),
  ('security_operator_user_ids()', 'core', 502),
  ('org_admin_user_ids(uuid)', 'core', 502),
  ('security_event_record(uuid,text,text,text,jsonb)', 'core', 502),
  ('trg_app_user_security_watch()', 'core', 502),
  ('trg_team_member_security_watch()', 'core', 502),
  ('trg_team_security_watch()', 'core', 502),
  ('security_monitor_run()', 'core', 502),
  ('auth_hook_before_user_created(jsonb)', 'core', 502)
ON CONFLICT (signature) DO NOTHING;

-- ===========================================
-- 5. Security monitoring
-- ===========================================

-- Per-organization thresholds. A missing row means the defaults (the column defaults, read through
-- the LEFT JOIN in security_monitor_run()). Admins of the organization read and write their row.
CREATE TABLE IF NOT EXISTS org_security_setting (
  org_id UUID PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Files hard-deleted (purged from the trash) in one hour.
  file_delete_threshold INTEGER NOT NULL DEFAULT 200 CHECK (file_delete_threshold BETWEEN 1 AND 1000000),
  -- Net drop in the organization's vault storage objects within one hour.
  storage_delete_threshold INTEGER NOT NULL DEFAULT 500 CHECK (storage_delete_threshold BETWEEN 1 AND 10000000),
  -- Password recovery requests and repeated sign-ups at the organization's email domains, per hour.
  auth_event_threshold INTEGER NOT NULL DEFAULT 20 CHECK (auth_event_threshold BETWEEN 1 AND 100000),
  -- Alert on each member who joined through email_domains (they are always in the summary).
  is_domain_join_alert_enabled BOOLEAN NOT NULL DEFAULT true,
  is_daily_summary_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Backups (0501): alert on a failed or warning run, on no successful scheduled server backup
  -- within this many hours, and on a silent server worker.
  is_backup_alert_enabled BOOLEAN NOT NULL DEFAULT true,
  backup_overdue_hours INTEGER NOT NULL DEFAULT 36 CHECK (backup_overdue_hours BETWEEN 1 AND 720),
  summary_hour_utc INTEGER NOT NULL DEFAULT 14 CHECK (summary_hour_utc BETWEEN 0 AND 23),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id) ON DELETE SET NULL
);

ALTER TABLE org_security_setting ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON org_security_setting FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON org_security_setting TO authenticated;

DROP POLICY IF EXISTS "org_security_setting: admins read" ON org_security_setting;
CREATE POLICY "org_security_setting: admins read"
  ON org_security_setting FOR SELECT TO authenticated
  USING (org_id IN (SELECT u.org_id FROM app_user u WHERE u.id = (SELECT auth.uid())) AND (SELECT is_org_admin()));

DROP POLICY IF EXISTS "org_security_setting: admins insert" ON org_security_setting;
CREATE POLICY "org_security_setting: admins insert"
  ON org_security_setting FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT u.org_id FROM app_user u WHERE u.id = (SELECT auth.uid())) AND (SELECT is_org_admin())
              AND updated_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "org_security_setting: admins update" ON org_security_setting;
CREATE POLICY "org_security_setting: admins update"
  ON org_security_setting FOR UPDATE TO authenticated
  USING (org_id IN (SELECT u.org_id FROM app_user u WHERE u.id = (SELECT auth.uid())) AND (SELECT is_org_admin()))
  WITH CHECK (org_id IN (SELECT u.org_id FROM app_user u WHERE u.id = (SELECT auth.uid())) AND (SELECT is_org_admin())
              AND updated_by = (SELECT auth.uid()));

-- Signals that belong to no organization (accounts with no organization, sign-up and recovery
-- volume across the project, schema drift) go to the operators of this database: the users listed
-- here, written from the SQL editor only. Every BluePLM database is run by the organization that
-- owns it (BluePLM hosts no one's database or service), so with no row the operators are the
-- admins of every organization in it; nothing is ever sent outside the database.
CREATE TABLE IF NOT EXISTS security_platform_operator (
  user_id UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE security_platform_operator ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON security_platform_operator FROM anon, authenticated;

-- Deployment-wide thresholds; one row, written from the SQL editor.
CREATE TABLE IF NOT EXISTS security_platform_setting (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- New accounts in one hour that have no organization an hour after signing up.
  orgless_signup_threshold INTEGER NOT NULL DEFAULT 10 CHECK (orgless_signup_threshold >= 1),
  -- Recovery requests and repeated sign-ups across the project in one hour.
  auth_event_threshold INTEGER NOT NULL DEFAULT 50 CHECK (auth_event_threshold >= 1),
  summary_hour_utc INTEGER NOT NULL DEFAULT 14 CHECK (summary_hour_utc BETWEEN 0 AND 23)
);

ALTER TABLE security_platform_setting ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON security_platform_setting FROM anon, authenticated;
INSERT INTO security_platform_setting (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- What the monitor found. org_id NULL is a deployment-wide event. Kept 90 days.
CREATE TABLE IF NOT EXISTS security_event (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'admin_granted', 'domain_join', 'file_delete_spike', 'storage_delete_spike',
    'auth_event_spike', 'orgless_signup_spike', 'schema_drift',
    'backup_failed', 'backup_overdue', 'backup_worker_silent'
  )),
  severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal', 'high')),
  summary TEXT NOT NULL,
  subject JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- One event per key: a spike in the same hour, the same drift on the same day, is not news twice.
  dedup_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS security_event_dedup_key_idx ON security_event (dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS security_event_org_id_created_at_idx ON security_event (org_id, created_at);
CREATE INDEX IF NOT EXISTS security_event_pending_idx ON security_event (created_at) WHERE notified_at IS NULL;

ALTER TABLE security_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON security_event FROM anon, authenticated;
GRANT SELECT ON security_event TO authenticated;

-- Per-organization state the monitor keeps between runs. No client access.
CREATE TABLE IF NOT EXISTS security_monitor_state (
  org_id UUID PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  storage_object_count BIGINT,
  storage_counted_at TIMESTAMPTZ,
  last_summary_at TIMESTAMPTZ
);

ALTER TABLE security_monitor_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON security_monitor_state FROM anon, authenticated;

-- Deployment-wide state: one row.
CREATE TABLE IF NOT EXISTS security_platform_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run_at TIMESTAMPTZ,
  last_drift_check_at TIMESTAMPTZ,
  last_summary_at TIMESTAMPTZ
);

ALTER TABLE security_platform_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON security_platform_state FROM anon, authenticated;
INSERT INTO security_platform_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION security_operator_user_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM security_platform_operator
  UNION
  SELECT u.id
  FROM app_user u
  WHERE NOT EXISTS (SELECT 1 FROM security_platform_operator)
    AND u.org_id IS NOT NULL
    AND (u.role = 'admin' OR EXISTS (
      SELECT 1 FROM team_member tm JOIN team t ON t.id = tm.team_id
      WHERE tm.user_id = u.id AND t.org_id = u.org_id AND t.name = 'Administrators'));
$$;

REVOKE ALL ON FUNCTION security_operator_user_ids() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION is_security_operator()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND auth.uid() IN (SELECT security_operator_user_ids());
$$;

REVOKE ALL ON FUNCTION is_security_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_security_operator() TO authenticated;

-- The admins of one organization, by the one definition of admin (role or Administrators team).
-- is_org_admin(uuid) answers only within the caller's organization, which a pg_cron job has none of.
CREATE OR REPLACE FUNCTION org_admin_user_ids(p_org_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM app_user u
  WHERE u.org_id = p_org_id
    AND (u.role = 'admin' OR EXISTS (
      SELECT 1 FROM team_member tm JOIN team t ON t.id = tm.team_id
      WHERE tm.user_id = u.id AND t.org_id = p_org_id AND t.name = 'Administrators'));
$$;

REVOKE ALL ON FUNCTION org_admin_user_ids(UUID) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "security_event: admins read" ON security_event;
CREATE POLICY "security_event: admins read"
  ON security_event FOR SELECT TO authenticated
  USING (
    (org_id IN (SELECT u.org_id FROM app_user u WHERE u.id = (SELECT auth.uid())) AND (SELECT is_org_admin()))
    OR (org_id IS NULL AND (SELECT is_security_operator()))
  );

CREATE OR REPLACE FUNCTION security_event_record(
  p_org_id UUID,
  p_kind TEXT,
  p_severity TEXT,
  p_summary TEXT,
  p_subject JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO security_event (org_id, kind, severity, summary, subject, dedup_key)
  VALUES (p_org_id, p_kind, p_severity, p_summary, COALESCE(p_subject, '{}'::jsonb), p_subject->>'dedup_key')
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION security_event_record(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- An account becomes an admin through app_user.role, through joining the Administrators team, or
-- through its team being renamed to Administrators. Each is recorded when it happens, with the
-- account that did it (auth.uid(); NULL for the SQL editor and server jobs).

CREATE OR REPLACE FUNCTION trg_app_user_security_watch()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain TEXT;
  v_invited BOOLEAN;
  v_email TEXT;
  v_was_admin BOOLEAN;
  v_old_org UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_was_admin := false;
    v_old_org := NULL;
  ELSE
    v_was_admin := OLD.role = 'admin' AND OLD.org_id IS NOT DISTINCT FROM NEW.org_id;
    v_old_org := OLD.org_id;
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.role = 'admin' AND NOT v_was_admin THEN
    PERFORM security_event_record(NEW.org_id, 'admin_granted', 'high',
      'An account was given the admin role',
      jsonb_build_object('user_id', NEW.id, 'email', NEW.email, 'via', 'role', 'by', auth.uid()));
  END IF;

  -- Joined an organization: through an invitation, or through email_domains.
  IF TG_OP = 'UPDATE' AND v_old_org IS NULL AND NEW.org_id IS NOT NULL THEN
    v_email := lower(COALESCE(user_get_verified_email(NEW.id), NEW.email));
    v_domain := split_part(v_email, '@', 2);
    SELECT EXISTS (
      SELECT 1 FROM pending_org_member p
      WHERE p.org_id = NEW.org_id AND lower(p.email) = v_email
        AND (p.claimed_at IS NULL OR p.claimed_at >= NOW())
    ) INTO v_invited;
    IF NOT v_invited AND EXISTS (SELECT 1 FROM org_email_domain d WHERE d.org_id = NEW.org_id AND d.domain = v_domain) THEN
      PERFORM security_event_record(NEW.org_id, 'domain_join', 'normal',
        'An account joined through the organization''s email domains',
        jsonb_build_object('user_id', NEW.id, 'email', NEW.email, 'domain', v_domain));
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION trg_app_user_security_watch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_app_user_security_watch ON app_user;
CREATE TRIGGER trg_app_user_security_watch
  AFTER INSERT OR UPDATE OF role, org_id ON app_user
  FOR EACH ROW EXECUTE FUNCTION trg_app_user_security_watch();

CREATE OR REPLACE FUNCTION trg_team_member_security_watch()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO security_event (org_id, kind, severity, summary, subject)
  SELECT t.org_id, 'admin_granted', 'high', 'An account joined the Administrators team',
         jsonb_build_object('user_id', n.user_id, 'email', u.email, 'via', 'team',
                            'team_id', t.id, 'by', auth.uid())
  FROM new_rows n
  JOIN team t ON t.id = n.team_id AND t.name = 'Administrators'
  LEFT JOIN app_user u ON u.id = n.user_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION trg_team_member_security_watch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_team_member_security_watch ON team_member;
CREATE TRIGGER trg_team_member_security_watch
  AFTER INSERT ON team_member REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION trg_team_member_security_watch();

CREATE OR REPLACE FUNCTION trg_team_security_watch()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name = 'Administrators' AND OLD.name IS DISTINCT FROM 'Administrators' THEN
    INSERT INTO security_event (org_id, kind, severity, summary, subject)
    SELECT NEW.org_id, 'admin_granted', 'high', 'A team was renamed to Administrators',
           jsonb_build_object('user_id', tm.user_id, 'email', u.email, 'via', 'team_rename',
                              'team_id', NEW.id, 'by', auth.uid())
    FROM team_member tm LEFT JOIN app_user u ON u.id = tm.user_id
    WHERE tm.team_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION trg_team_security_watch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_team_security_watch ON team;
CREATE TRIGGER trg_team_security_watch
  AFTER UPDATE OF name ON team
  FOR EACH ROW EXECUTE FUNCTION trg_team_security_watch();

-- ===========================================
-- 6. Sign-up needs somewhere to belong
-- ===========================================
-- Supabase Auth's "Before User Created" hook: Auth calls this before it creates any account
-- (password sign-up, Google, an invitation, an admin creating a user). An account is created only
-- for an address that belongs somewhere, so nobody signs in to find no organization:
--   - an open invitation (pending_org_member, not yet claimed); /auth/invite writes it before it
--     calls inviteUserByEmail, so invited accounts pass;
--   - an organization's email domain (org_email_domain: one organization per domain, never a
--     public mail provider, added by an admin holding an address there), unless that
--     organization blocked the address;
--   - a supplier contact (supplier_contact.email, module 30, when installed);
--   - or a database with no organization yet, whose first account has to be able to create one.
--
-- Contract (Supabase Auth hooks, Postgres function): takes the event as jsonb, returns '{}' to
-- allow or {"error": {"http_code", "message"}} to refuse. Auth sends the refusal back to the
-- client as the error description; the client recognises the leading "Not invited" and shows its
-- own translated text. The hook is switched on in Auth's configuration, not here
-- (hook_before_user_created_uri = pg-functions://postgres/public/auth_hook_before_user_created);
-- docs/admin-setup.md says how.
CREATE OR REPLACE FUNCTION auth_hook_before_user_created(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(btrim(event->'user'->>'email'));
  v_domain TEXT;
  v_allowed BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organization) THEN
    RETURN '{}'::jsonb;
  END IF;

  IF v_email IS NULL OR v_email = '' OR position('@' IN v_email) = 0 THEN
    v_allowed := false;
  ELSE
    v_domain := split_part(v_email, '@', 2);
    v_allowed :=
      EXISTS (SELECT 1 FROM pending_org_member p WHERE lower(p.email) = v_email AND p.claimed_at IS NULL)
      OR EXISTS (
        SELECT 1 FROM org_email_domain d
        WHERE d.domain = v_domain
          AND NOT is_public_email_domain(v_domain)
          AND NOT EXISTS (SELECT 1 FROM blocked_user b WHERE b.org_id = d.org_id AND lower(b.email) = v_email));
    IF NOT v_allowed AND to_regclass('public.supplier_contact') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM supplier_contact c WHERE lower(c.email) = $1)'
        INTO v_allowed USING v_email;
    END IF;
  END IF;

  IF v_allowed THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Not invited: you haven''t been invited to an organization. Ask your administrator for an invite.'));
END;
$$;

REVOKE ALL ON FUNCTION auth_hook_before_user_created(JSONB) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION auth_hook_before_user_created(JSONB) TO supabase_auth_admin;
  END IF;
END $$;

-- ===========================================
-- The stamp: every check, one list
-- ===========================================
-- verify_and_stamp_schema() used to build this union inline; the daily drift check needs the same
-- list without stamping, so it lives here once. Adds check_function_inventory() and
-- check_realtime_publication() to what 0500 checked.
CREATE OR REPLACE FUNCTION schema_list_problems()
RETURNS TABLE (module TEXT, object TEXT, status TEXT, detail TEXT)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT c.module, c.identity, c.status, c.detail
  FROM check_schema_release() c WHERE c.status IN ('missing', 'stale', 'extra')
  UNION ALL
  SELECT 'security', g.signature, g.status, g.detail
  FROM check_org_gates() g WHERE is_org_gate_status_blocking(g.status)
  UNION ALL
  SELECT 'security', a.identity, 'anon-reachable', a.detail
  FROM check_anon_reach() a WHERE a.severity = 'blocking'
  UNION ALL
  SELECT 'security', n.signature, 'null-unsafe-gate', n.detail FROM check_null_unsafe_org_gates() n
  UNION ALL
  SELECT 'security', b.signature, 'unbound-entity-arg', b.detail FROM check_unbound_entity_args() b
  UNION ALL
  SELECT 'security', d.signature, 'definer-search-path', d.detail FROM check_definer_search_path() d
  UNION ALL
  SELECT 'security', w.signature, 'execute-not-withdrawn', w.detail
  FROM check_withdrawn_execute() w WHERE w.status = 'reachable'
  UNION ALL
  SELECT 'security', r.identity, r.residue, r.detail FROM check_release_residue() r
  UNION ALL
  SELECT 'security', f.signature, f.status, f.detail FROM check_function_inventory() f
  UNION ALL
  SELECT 'security', p.identity, p.status, p.detail FROM check_realtime_publication() p
$$;

REVOKE ALL ON FUNCTION schema_list_problems() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION verify_and_stamp_schema()
RETURNS JSON
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_problems JSON;
  v_count INTEGER;
  v_updated INTEGER;
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
           'module', p.module, 'object', p.object, 'status', p.status, 'detail', p.detail)
           ORDER BY p.module, p.object), '[]'::json),
         COUNT(*)
    INTO v_problems, v_count
  FROM schema_list_problems() p;

  IF v_count > 0 THEN
    RETURN json_build_object(
      'stamped', false,
      'version', (SELECT version FROM schema_version WHERE id = 1),
      'target_version', schema_release_version(),
      'problems', v_problems
    );
  END IF;

  UPDATE schema_version
  SET version = schema_release_version(),
      description = schema_release_description(),
      applied_at = NOW(),
      applied_by = 'verify-schema'
  WHERE id = 1;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Could not write schema_version: % is not permitted to update it. Run this from the Supabase SQL editor, which connects as postgres.', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN json_build_object(
    'stamped', true,
    'version', schema_release_version(),
    'target_version', schema_release_version(),
    'problems', '[]'::json
  );
END;
$$;

REVOKE ALL ON FUNCTION verify_and_stamp_schema() FROM PUBLIC, anon, authenticated;

-- ===========================================
-- The monitor
-- ===========================================
-- One run: record rate signals, notify, summarize once a day, check drift once a day, prune.
-- Everything it keeps is bounded: tombstones 1 day, events 90 days, at most one notification per
-- organization and kind per run, and a kind already notified in the last hour waits.
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

REVOKE ALL ON FUNCTION security_monitor_run() FROM PUBLIC, anon, authenticated;

-- Schedule: every 10 minutes through pg_cron, inside this database. Where pg_cron is not available
-- (a self-run Postgres without it, tests) the migration still applies and says so; the monitor can
-- then be called by any scheduler the owner runs, as postgres. Nothing runs outside the database.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron is not available (%); schedule SELECT security_monitor_run() every 10 minutes elsewhere.', SQLERRM;
    RETURN;
  END;
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'blueplm-security-monitor';
    PERFORM cron.schedule('blueplm-security-monitor', '*/10 * * * *', 'SELECT public.security_monitor_run()');
  END IF;
END $$;

-- ===========================================
-- Release manifest
-- ===========================================
-- What a database must hold to claim 502. `requires` names code each body must contain (matched
-- with comments and string literals removed), so a copy that lost its check fails the stamp.
-- The two 5.0 functions this file redefines get their new markers.
INSERT INTO schema_manifest_entry (kind, name, module, probe, requires, since_version) VALUES
  ('table', 'realtime_tombstone', 'core', NULL, NULL, 502),
  ('table', 'org_email_domain', 'core', NULL, NULL, 502),
  ('table', 'schema_function_inventory', 'core', NULL, NULL, 502),
  ('table', 'org_security_setting', 'core', NULL, NULL, 502),
  ('table', 'security_platform_operator', 'core', NULL, NULL, 502),
  ('table', 'security_platform_setting', 'core', NULL, NULL, 502),
  ('table', 'security_event', 'core', NULL, NULL, 502),
  ('table', 'security_monitor_state', 'core', NULL, NULL, 502),
  ('table', 'security_platform_state', 'core', NULL, NULL, 502),
  ('function', 'can_access_module(text,uuid)', 'core', NULL, 'p_user_id <> auth.uid()', 502),
  ('function', 'trg_realtime_tombstone_write()', 'core', NULL, 'realtime_tombstone && old_rows', 502),
  ('function', 'check_realtime_publication()', 'core', NULL, 'pubdelete && pubtruncate', 502),
  ('function', 'is_public_email_domain(text)', 'core', NULL, NULL, 502),
  ('function', 'trg_organization_email_domains_check()', 'core', NULL, 'is_public_email_domain && user_get_verified_email && org_email_domain', 502),
  ('function', 'trg_organization_email_domains_sync()', 'core', NULL, 'org_email_domain', 502),
  ('function', 'check_function_inventory()', 'core', NULL, 'schema_function_inventory && prosecdef', 502),
  ('function', 'schema_list_problems()', 'core', NULL, 'check_function_inventory && check_realtime_publication && check_definer_search_path && check_release_residue', 502),
  ('function', 'verify_and_stamp_schema()', 'core', NULL, 'schema_list_problems', 502),
  ('function', 'is_security_operator()', 'core', NULL, 'security_operator_user_ids', 502),
  ('function', 'security_operator_user_ids()', 'core', NULL, 'security_platform_operator', 502),
  ('function', 'org_admin_user_ids(uuid)', 'core', NULL, 'Administrators', 502),
  ('function', 'security_event_record(uuid,text,text,text,jsonb)', 'core', NULL, 'security_event', 502),
  ('function', 'trg_app_user_security_watch()', 'core', NULL, 'security_event_record', 502),
  ('function', 'trg_team_member_security_watch()', 'core', NULL, 'new_rows', 502),
  ('function', 'trg_team_security_watch()', 'core', NULL, 'security_event', 502),
  ('function', 'security_monitor_run()', 'core', NULL, 'org_admin_user_ids && security_operator_user_ids && schema_list_problems', 502),
  ('function', 'auth_hook_before_user_created(jsonb)', 'core', NULL, 'pending_org_member && org_email_domain && is_public_email_domain && blocked_user', 502)
ON CONFLICT (kind, name) DO UPDATE
  SET module = EXCLUDED.module, probe = EXCLUDED.probe, requires = EXCLUDED.requires,
      since_version = EXCLUDED.since_version;

-- ===========================================
-- Release
-- ===========================================
CREATE OR REPLACE FUNCTION schema_release_version() RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$ SELECT 502 $$;

CREATE OR REPLACE FUNCTION schema_release_description() RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$ SELECT
  'Security hardening and monitoring. can_access_module answers for the caller only. Realtime no '
  'longer publishes DELETE events (they bypass RLS); deletes the client needs arrive as '
  'realtime_tombstone inserts under RLS. organization.email_domains: one organization per domain, no '
  'public mail domains, and a signed-in admin adds only the domain of their own verified address. '
  'The stamp refuses any exposed public function no release registered (schema_function_inventory) '
  'and a publication that sends deletes. security_monitor_run() (pg_cron, every 10 minutes) records '
  'admin grants, email-domain joins, file and storage delete spikes, auth request spikes, accounts '
  'left without an organization and schema drift, and notifies organization admins, with per-'
  'organization thresholds in org_security_setting and a daily summary. '
  'auth_hook_before_user_created() (Supabase Auth Before User Created hook, enabled in Auth '
  'configuration) refuses an account for an address with no invitation, organization email domain '
  'or supplier contact.'
$$;
