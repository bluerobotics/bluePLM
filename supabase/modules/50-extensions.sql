-- =====================================================================
-- BluePLM Extensions Module (5.0 baseline)
-- =====================================================================
-- Native extensions installed per organization and the org-extensions
-- storage bucket that holds their packages. 5.0 dropped the sandboxed
-- extension tables (org_extension_config, extension_storage,
-- extension_secret*, extension_http_log), which never held a row.
--
-- 5.0 BASELINE. supabase/core.sql and the files in supabase/modules are one
-- ordered set: core first, then the modules in file-name order, applied to an empty
-- database by the desktop app's migration runner in one transaction (or by
-- hand in that order). Every object is defined once, and nothing here upgrades
-- an older database: a 4.x database (schema 112) is upgraded by
-- supabase/migrations/0500_from_4x.sql, and every change after 5.0 is a new
-- numbered file in supabase/migrations/. Do not edit this baseline in place.
--
-- The stamp is not written here. The runner calls verify_and_stamp_schema()
-- (supabase/tools/verify-schema.sql) afterwards, and it stamps 500 only when
-- the manifest, the security checks and the residue checks all pass.
--
-- Names follow .cursor/rules/database.mdc (singular tables, org_ prefixes,
-- <entity>_<verb> functions, trg_ triggers, "<table>: <who> <action>"
-- policies); the 4.x -> 5.0 renames are listed in supabase/rename-map-5.0.json.
--
-- =====================================================================

-- ===========================================
-- TABLES
-- ===========================================

-- ===========================================
-- INSTALLED EXTENSIONS
-- ===========================================
-- Track which extensions are installed per organization
CREATE TABLE org_installed_extension (
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  extension_id TEXT NOT NULL,
  version TEXT NOT NULL,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  installed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  is_enabled BOOLEAN DEFAULT true,
  -- Extension manifest (full extension.json)
  manifest JSONB NOT NULL,
  package_sha256 TEXT,
  package_path TEXT,
  category TEXT,
  CONSTRAINT org_installed_extension_pkey PRIMARY KEY (org_id, extension_id),
  CONSTRAINT org_installed_extension_native_package_check CHECK (((category IS NULL) OR (category = 'sandboxed'::text) OR ((category = 'native'::text) AND (package_sha256 ~ '^[0-9a-f]{64}$'::text) AND (package_path IS NOT NULL) AND (split_part(package_path, '/'::text, 1) = (org_id)::text) AND (split_part(package_path, '/'::text, 2) = extension_id))))
);

-- Native extensions (schema 104). A native extension runs with full trust in the
-- desktop renderer and in-process in the API, so it runs only from the package an
-- org admin installed: its bytes live in the org-extensions bucket at package_path,
-- and both the desktop and the API refuse to run them unless they hash to
-- package_sha256. See .cursor/plans/extensions-native-runtime.plan.md.

-- ===========================================
-- EXTENSION CONFIGURATION
-- ===========================================
-- Extension-specific configuration per organization

-- ===========================================
-- EXTENSION STORAGE
-- ===========================================
-- Extension-scoped key-value storage

-- ===========================================
-- EXTENSION SECRETS
-- ===========================================
-- Encrypted secrets storage with audit logging

-- ===========================================
-- EXTENSION SECRET VERSIONS
-- ===========================================
-- Secret version history for rollback

-- ===========================================
-- EXTENSION SECRET ACCESS LOG
-- ===========================================
-- Audit log for secret access

-- ===========================================
-- EXTENSION HTTP LOG
-- ===========================================
-- Log all HTTP requests made by extensions

-- Partition by time for efficient cleanup (optional optimization)
-- CREATE INDEX IF NOT EXISTS idx_extension_http_log_cleanup 
--   ON extension_http_log(org_id, extension_id, timestamp);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Update timestamp triggers

-- ===========================================
-- REALTIME
-- ===========================================

-- ===========================================
-- COMMENTS
-- ===========================================

CREATE INDEX org_installed_extension_org_id_idx ON org_installed_extension (org_id);
CREATE INDEX org_installed_extension_org_id_is_enabled_idx ON org_installed_extension (org_id, is_enabled) WHERE (is_enabled = true);

COMMENT ON TABLE org_installed_extension IS 'Native extensions installed per organization, each pinned to the package an org admin installed (package_sha256).';
COMMENT ON COLUMN org_installed_extension.manifest IS 'Full extension.json manifest with metadata and contributions';
COMMENT ON COLUMN org_installed_extension.package_sha256 IS 'Native extensions: lowercase hex SHA-256 of the .bpx. The desktop and the API refuse to run a package that does not hash to this.';
COMMENT ON COLUMN org_installed_extension.package_path IS 'Native extensions: object path in the org-extensions bucket, <org_id>/<extension_id>/<version>-<sha256>.bpx.';
COMMENT ON COLUMN org_installed_extension.category IS 'Manifest category: native or sandboxed (NULL on rows from before schema 104).';
ALTER TABLE org_installed_extension ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_installed_extension REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE org_installed_extension;


-- ===========================================
-- FUNCTIONS, VIEWS, TRIGGERS AND POLICIES
-- ===========================================

-- Installed Extensions: Org members can view, admins can manage
CREATE POLICY "org_installed_extension: org members read"
  ON org_installed_extension FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

-- Writes are admin-only, spelled out per command so an INSERT or UPDATE is
-- checked against the row it writes (WITH CHECK), not only the row it replaces.
-- Installing a native extension is an admin decision to run code with full trust
-- for the whole organization.
CREATE POLICY "org_installed_extension: admins insert"
  ON org_installed_extension FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "org_installed_extension: admins update"
  ON org_installed_extension FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin())
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "org_installed_extension: admins delete"
  ON org_installed_extension FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Extension Config: Similar to installed extensions

-- Extension Storage: written and read by the API on an extension's behalf, never
-- by a signed-in user directly. The old policy let every member of an org read
-- and rewrite every extension's storage for that org, so one member could forge
-- another extension's state. Only service_role now; admins keep DELETE so that
-- uninstalling an extension (api/src/extensions/loader.ts uninstallExtension,
-- which runs with the admin's own client) still clears its rows.

-- Extension Secrets: Admins can view names, service role can access values

-- Secret Versions: Service role only

-- Secret Access Log: Admins can view

-- An audit log any signed-in user can append to is not evidence: the old
-- policy had no TO clause, so it applied to every role, and WITH CHECK (TRUE)
-- let anyone insert rows for any org. Only service_role writes it now.

-- HTTP Log: Admins can view

-- An audit log any signed-in user can append to is not evidence: the old
-- policy had no TO clause, so it applied to every role, and WITH CHECK (TRUE)
-- let anyone insert rows for any org. Only service_role writes it now.

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Get extension config (safe for UI)
--
-- "Safe for UI" was only ever true for the caller's own organization.
-- extension_config_update below has always checked the caller's membership;
-- these two read the same rows and did not, so an extension's configuration for
-- any organization came back to anyone who named its id.
-- plpgsql rather than sql so the membership check runs before the query and not
-- as one more conjunct the planner is free to skip when no row matches.

-- Update extension config

-- Get extension statistics

-- Both cleanup routines sweep every organization at once: the DELETE is
-- qualified by age only, never by org_id. That is correct for an operator
-- maintenance sweep and catastrophic for anything a tenant can call, so the
-- ACL is the entire boundary. Neither had a GRANT in this file, which is
-- exactly why they looked safe; on Supabase, ALTER DEFAULT PRIVILEGES grants
-- authenticated EXECUTE on every function postgres creates, and an absent
-- GRANT means the default stands rather than that no one holds the privilege.
--
-- Measured before this revoke, on a harness at this release: a signed-in user
-- belonging to NO organization called POST /rpc/cleanup_extension_http_logs
-- with p_retention_days = 0 and got HTTP 200 with a row count, taking another
-- tenant's extension_http_log from 1 row to 0. The same held for
-- extension_secret_access_cleanup against extension_secret_access. That
-- is destruction of audit evidence by an unrelated tenant.
--
-- Withdrawing the endpoint is the whole fix, and org scoping would be the
-- wrong shape, because nothing signed-in is supposed to call these at all:
--   * no caller anywhere in src/, api/, electron/ or scripts/
--   * no pg_cron schedule and no scheduled job in the tree
--   * the retention path the application actually uses is cleanupHttpLogs()
--     in api/src/extensions/http-logger.ts, which deletes straight from the
--     table filtered by org_id and extension_id, under RLS, and never touches
--     this RPC
-- Adding a membership check would therefore gate a door with nobody behind it
-- while leaving the sweep unable to do the one job it exists for. postgres and
-- service_role keep EXECUTE and can still run the sweep.
--
-- check_org_gates() cannot police this pair - they take no organization
-- argument, so there is no foreign id for it to substitute and no refusal for
-- it to require. Coverage is negative control NC19, which regrants EXECUTE
-- exactly as the default ACL had it and requires the stamp to be withheld.

-- Same shape, same reasoning, same measurement - see the comment above.

-- ===========================================
-- NATIVE EXTENSION PACKAGES (storage bucket org-extensions)
-- ===========================================
-- Private bucket. Objects live under <org_id>/<extension_id>/<version>-<sha256>.bpx.
-- Members of an organization read their own organization's prefix (the desktop
-- downloads through a short-lived signed URL); only that organization's admins
-- write it. The API reads with the service role.
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-extensions', 'org-extensions', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

CREATE POLICY "Org members read their org extension packages"
  ON storage.objects FOR SELECT TO authenticated
  USING (((bucket_id = 'org-extensions'::text) AND ((storage.foldername(name))[1] IN ( SELECT (app_user.org_id)::text AS org_id
   FROM app_user
  WHERE ((app_user.id = auth.uid()) AND (app_user.org_id IS NOT NULL))))));

CREATE POLICY "Org admins upload extension packages"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'org-extensions'::text) AND is_org_admin() AND ((storage.foldername(name))[1] IN ( SELECT (app_user.org_id)::text AS org_id
   FROM app_user
  WHERE ((app_user.id = auth.uid()) AND (app_user.org_id IS NOT NULL))))));

CREATE POLICY "Org admins update extension packages"
  ON storage.objects FOR UPDATE TO authenticated
  USING (((bucket_id = 'org-extensions'::text) AND is_org_admin() AND ((storage.foldername(name))[1] IN ( SELECT (app_user.org_id)::text AS org_id
   FROM app_user
  WHERE ((app_user.id = auth.uid()) AND (app_user.org_id IS NOT NULL))))))
  WITH CHECK (((bucket_id = 'org-extensions'::text) AND is_org_admin() AND ((storage.foldername(name))[1] IN ( SELECT (app_user.org_id)::text AS org_id
   FROM app_user
  WHERE ((app_user.id = auth.uid()) AND (app_user.org_id IS NOT NULL))))));

CREATE POLICY "Org admins delete extension packages"
  ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'org-extensions'::text) AND is_org_admin() AND ((storage.foldername(name))[1] IN ( SELECT (app_user.org_id)::text AS org_id
   FROM app_user
  WHERE ((app_user.id = auth.uid()) AND (app_user.org_id IS NOT NULL))))));

-- ===========================================
-- PRIVILEGES
-- ===========================================

-- Written out in full rather than left to the platform's default privileges, so a
-- fresh database and an upgraded one hold the same grants. anon holds nothing
-- here except what anon_get_read_allowlist() and anon_get_execute_allowlist() name.
REVOKE ALL ON TABLE org_installed_extension FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE org_installed_extension TO authenticated, service_role;

SELECT anon_enforce_execute_posture();
