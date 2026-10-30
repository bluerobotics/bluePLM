-- =====================================================================
-- BluePLM Integrations Module (5.0 baseline)
-- =====================================================================
-- Organization integrations (Odoo), saved Odoo configurations, the
-- service-only credential store, sync logs, webhooks, Google Drive settings
-- and SOLIDWORKS licences.
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
-- TYPES
-- ===========================================

CREATE TYPE webhook_event AS ENUM ('file.created', 'file.updated', 'file.deleted', 'file.checked_in', 'file.checked_out', 'file.state_changed', 'file.revision_changed', 'eco.created', 'eco.updated', 'eco.completed', 'review.requested', 'review.approved', 'review.rejected', 'rfq.created', 'rfq.sent', 'rfq.quoted', 'rfq.awarded', 'supplier.created', 'supplier.updated');
CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'success', 'failed', 'retrying');
CREATE TYPE solidworks_license_type AS ENUM ('standalone', 'network');

-- ===========================================
-- TABLES
-- ===========================================

-- ===========================================
-- ORGANIZATION INTEGRATIONS
-- ===========================================
CREATE TABLE org_integration (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Integration type
  -- 'odoo', 'slack', 'webhook', etc.
  integration_type TEXT NOT NULL,
  -- Settings (flexible JSONB)
  settings JSONB DEFAULT '{}'::jsonb NOT NULL,
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_connected BOOLEAN DEFAULT false,
  last_connected_at TIMESTAMPTZ,
  last_error TEXT,
  -- Sync settings
  is_auto_sync BOOLEAN DEFAULT false,
  sync_interval_minutes INTEGER DEFAULT 60,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_message TEXT,
  last_sync_count INTEGER,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  CONSTRAINT org_integration_org_id_integration_type_key UNIQUE (org_id, integration_type)
);

-- ===========================================
-- RLS POLICIES
-- ===========================================

-- ===========================================
-- COMMENTS
-- ===========================================

CREATE INDEX org_integration_org_id_idx ON org_integration (org_id);
CREATE INDEX org_integration_integration_type_idx ON org_integration (integration_type);
CREATE INDEX org_integration_is_active_idx ON org_integration (is_active) WHERE (is_active = true);

COMMENT ON TABLE org_integration IS 'Generic integration configurations for orgs';
ALTER TABLE org_integration ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_integration REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE org_integration;

-- ===========================================
-- INTEGRATION SYNC LOG
-- ===========================================
CREATE TABLE integration_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES org_integration(id) ON DELETE CASCADE,
  -- Sync details
  sync_type TEXT NOT NULL,
  sync_direction TEXT DEFAULT 'pull'::text NOT NULL,
  -- Results
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  -- Counts
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  records_errored INTEGER DEFAULT 0,
  -- Error details
  error_message TEXT,
  error_details JSONB,
  -- Triggered by
  triggered_by UUID REFERENCES app_user(id),
  trigger_type TEXT DEFAULT 'manual'::text,
  phase TEXT,
  phase_index INTEGER,
  phase_count INTEGER,
  progress_current INTEGER,
  progress_total INTEGER,
  is_cancel_requested BOOLEAN DEFAULT false NOT NULL,
  cancel_requested_by UUID REFERENCES app_user(id),
  heartbeat_at TIMESTAMPTZ,
  sync_watermark_at TIMESTAMPTZ
);

-- Supports the "is one already running for this org" guard the sync takes
-- before it starts, which is the only thing standing between two clients and
-- two concurrent syncs racing on the same upserts.

-- Supports reading back the last watermark: the newest successful run of one
-- sync_type for an org.

CREATE INDEX integration_sync_log_org_id_idx ON integration_sync_log (org_id);
CREATE INDEX integration_sync_log_integration_id_idx ON integration_sync_log (integration_id);
CREATE INDEX integration_sync_log_started_at_idx ON integration_sync_log (started_at DESC);
CREATE INDEX integration_sync_log_org_id_integration_id_idx ON integration_sync_log (org_id, integration_id) WHERE (status = 'running'::text);
CREATE INDEX integration_sync_log_org_id_sync_type_started_at_idx ON integration_sync_log (org_id, sync_type, started_at DESC) WHERE ((status = 'success'::text) AND (sync_watermark_at IS NOT NULL));

COMMENT ON TABLE integration_sync_log IS 'Audit trail for integration sync operations';
COMMENT ON COLUMN integration_sync_log.sync_watermark_at IS 'How far through the source system''s change history this run got, in the SOURCE system''s clock (for Odoo, res.partner/sale.order write_date). The next run of the same sync_type resumes from the newest successful run''s value. Only written on success, so a cancelled or failed run leaves the window to be re-read.';
ALTER TABLE integration_sync_log ENABLE ROW LEVEL SECURITY;

-- ── Live progress and cooperative cancellation ──────────────────────────────
-- The table was originally an after-the-fact audit trail: one row written once
-- a sync had already finished. These columns let a row be written when the run
-- STARTS and updated as it goes, so a client can watch a sync it did not start
-- and ask it to stop.
--
-- status carries 'running' and 'cancelled' in addition to the historical
-- 'success' / 'failed'. It is free-text, so no enum change is needed.
--
-- heartbeat_at is what separates "still working" from "the server died holding
-- a running row". A reader treats a run whose heartbeat has gone quiet as dead
-- rather than trusting status alone.

-- progress_total stays NULL until the count is known; the reader shows a bare
-- running figure rather than inventing a denominator.

-- ── Incremental sync watermark ──────────────────────────────────────────────
-- How far through the source system's change history a run got, expressed in
-- the SOURCE system's clock rather than this server's - the two are not
-- synchronised, and a few seconds of skew is a silently dropped record.
--
-- It lives on the run row instead of on org_integration so that only
-- a run that reached 'success' can move it. A cancelled or failed run writes a
-- partial mirror and no watermark, so the next run re-reads that window.

-- ===========================================
-- ODOO SAVED CONFIGURATIONS
-- ===========================================
CREATE TABLE odoo_saved_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Configuration identity
  name TEXT NOT NULL,
  description TEXT,
  -- Connection settings
  url TEXT NOT NULL,
  database TEXT NOT NULL,
  username TEXT NOT NULL,
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  is_last_test_successful BOOLEAN,
  last_test_error TEXT,
  -- Visual
  color TEXT,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id),
  CONSTRAINT odoo_saved_config_org_id_name_key UNIQUE (org_id, name)
);

CREATE INDEX odoo_saved_config_org_id_idx ON odoo_saved_config (org_id);
CREATE INDEX odoo_saved_config_is_active_idx ON odoo_saved_config (is_active) WHERE (is_active = true);

COMMENT ON TABLE odoo_saved_config IS 'Saved Odoo ERP connection configurations';
ALTER TABLE odoo_saved_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE odoo_saved_config REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE odoo_saved_config;

-- ===========================================
-- WEBHOOKS
-- ===========================================
CREATE TABLE webhook (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Basic info
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  -- Security
  secret TEXT NOT NULL,
  -- Configuration
  events webhook_event[] DEFAULT '{}'::webhook_event[] NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  -- User filtering
  trigger_filter TEXT DEFAULT 'everyone'::text NOT NULL CHECK ((trigger_filter = ANY (ARRAY['everyone'::text, 'roles'::text, 'users'::text]))),
  trigger_roles TEXT[] DEFAULT '{}'::text[] NOT NULL,
  trigger_user_ids UUID[] DEFAULT '{}'::uuid[] NOT NULL,
  -- Headers
  custom_headers JSONB DEFAULT '{}'::jsonb NOT NULL,
  -- Retry configuration
  max_retries INTEGER DEFAULT 3 NOT NULL,
  retry_delay_seconds INTEGER DEFAULT 60 NOT NULL,
  timeout_seconds INTEGER DEFAULT 30 NOT NULL,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  -- Stats
  last_triggered_at TIMESTAMPTZ,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0
);

-- ===========================================
-- REALTIME
-- ===========================================

CREATE INDEX webhook_org_id_idx ON webhook (org_id);
CREATE INDEX webhook_org_id_is_active_idx ON webhook (org_id, is_active) WHERE (is_active = true);

COMMENT ON TABLE webhook IS 'Webhook configurations for external integrations';
ALTER TABLE webhook ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE webhook;

-- ===========================================
-- WEBHOOK DELIVERIES
-- ===========================================
CREATE TABLE webhook_delivery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES webhook(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Event details
  event_type webhook_event NOT NULL,
  event_id UUID,
  payload JSONB NOT NULL,
  -- Delivery status
  status webhook_delivery_status DEFAULT 'pending'::webhook_delivery_status,
  attempt_count INTEGER DEFAULT 0,
  -- Response
  response_status INTEGER,
  response_body TEXT,
  response_headers JSONB,
  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  -- Error tracking
  last_error TEXT
);

CREATE INDEX webhook_delivery_webhook_id_idx ON webhook_delivery (webhook_id);
CREATE INDEX webhook_delivery_org_id_idx ON webhook_delivery (org_id);
CREATE INDEX webhook_delivery_status_idx ON webhook_delivery (status) WHERE (status = ANY (ARRAY['pending'::webhook_delivery_status, 'retrying'::webhook_delivery_status]));
CREATE INDEX webhook_delivery_created_at_idx ON webhook_delivery (created_at DESC);

COMMENT ON TABLE webhook_delivery IS 'Webhook delivery attempts and history';
ALTER TABLE webhook_delivery ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- SOLIDWORKS LICENSE MANAGEMENT
-- ===========================================

-- Enum for license types

-- Table: SOLIDWORKS Licenses
CREATE TABLE solidworks_license (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- License details
  serial_number TEXT NOT NULL,
  nickname TEXT,
  license_type solidworks_license_type DEFAULT 'standalone'::solidworks_license_type,
  product_name TEXT,
  seats INTEGER DEFAULT 1,
  -- Dates
  purchase_date DATE,
  expiry_date DATE,
  -- Notes
  notes TEXT,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_user(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT solidworks_license_org_id_serial_number_key UNIQUE (org_id, serial_number)
);

-- RLS for SOLIDWORKS Licenses

-- Realtime for license management

-- Comments

CREATE INDEX solidworks_license_org_id_idx ON solidworks_license (org_id);

COMMENT ON TABLE solidworks_license IS 'Organization SOLIDWORKS license keys and metadata';
ALTER TABLE solidworks_license ENABLE ROW LEVEL SECURITY;
ALTER TABLE solidworks_license REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE solidworks_license;

-- Table: SOLIDWORKS License Assignments
CREATE TABLE solidworks_license_assignment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id UUID NOT NULL REFERENCES solidworks_license(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  -- Assignment tracking
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES app_user(id),
  -- Activation status
  is_active BOOLEAN DEFAULT false,
  activated_at TIMESTAMPTZ,
  machine_id TEXT,
  machine_name TEXT,
  deactivated_at TIMESTAMPTZ,
  CONSTRAINT solidworks_license_assignment_license_id_user_id_key UNIQUE (license_id, user_id)
);

CREATE INDEX solidworks_license_assignment_license_id_idx ON solidworks_license_assignment (license_id);
CREATE INDEX solidworks_license_assignment_user_id_idx ON solidworks_license_assignment (user_id);

COMMENT ON TABLE solidworks_license_assignment IS 'User-license assignments with activation tracking';
ALTER TABLE solidworks_license_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE solidworks_license_assignment REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE solidworks_license_assignment;

-- ===========================================
-- CREDENTIAL STORE
-- ===========================================
--
-- In 4.x, odoo_saved_configs.api_key_encrypted and
-- organization_integrations.credentials_encrypted were named as though they
-- held ciphertext, but the API wrote the raw API key straight into them and
-- read it straight back out. Two consequences:
--
--   1. The values were plaintext at rest, despite the column names.
--   2. The SELECT policies on both tables grant access to every org member,
--      not just admins, so any authenticated user in the org could read
--      another team's ERP credentials directly through PostgREST.
--
-- Postgres RLS filters rows, not columns, so no policy change can hide a
-- credential column from a role that can read the row. The only robust fix is
-- to move the secret into a table that clients cannot read at all.
CREATE TABLE integration_credential (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Which record this credential belongs to. Deliberately not a foreign key
  -- per source table: new integrations should not require a schema change.
  owner_type TEXT NOT NULL CHECK ((owner_type = ANY (ARRAY['odoo_saved_config'::text, 'organization_integration'::text]))),
  owner_id UUID NOT NULL,
  -- AES-256-GCM ciphertext in `iv:authTag:ciphertext` base64 form, written by
  -- the API using EXTENSION_ENCRYPTION_KEY.
  --
  -- Rows migrated from the 4.x columns started out as plaintext; the API
  -- detects the format on read and re-encrypts on next write.
  secret TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  CONSTRAINT integration_credential_owner_type_owner_id_key UNIQUE (owner_type, owner_id)
);

CREATE INDEX integration_credential_org_id_idx ON integration_credential (org_id);
CREATE INDEX integration_credential_owner_type_owner_id_idx ON integration_credential (owner_type, owner_id);

COMMENT ON TABLE integration_credential IS 'Encrypted credentials for external integrations. Readable only by service_role: RLS is enabled with no policies for anon or authenticated, so PostgREST returns nothing to clients. Ciphertext is AES-256-GCM under EXTENSION_ENCRYPTION_KEY.';
ALTER TABLE integration_credential ENABLE ROW LEVEL SECURITY;


-- ===========================================
-- ADDITIONS TO TABLES OF EARLIER FILES
-- ===========================================

-- Added to organization (core.sql) by this module.
ALTER TABLE organization ADD COLUMN google_drive_client_id TEXT;
ALTER TABLE organization ADD COLUMN google_drive_client_secret TEXT;
ALTER TABLE organization ADD COLUMN is_google_drive_enabled BOOLEAN DEFAULT false;
ALTER TABLE organization ADD COLUMN google_drive_inspection_template_folder_id TEXT;

-- Added to pending_org_member (core.sql) by this module.
ALTER TABLE pending_org_member ADD COLUMN solidworks_license_ids UUID[] DEFAULT '{}'::uuid[];

-- ===========================================
-- FUNCTIONS, VIEWS, TRIGGERS AND POLICIES
-- ===========================================

-- Organization Integrations
CREATE POLICY "org_integration: org members read"
  ON org_integration FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "org_integration: admins insert"
  ON org_integration FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "org_integration: admins update"
  ON org_integration FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "org_integration: admins delete"
  ON org_integration FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Integration Sync Log
CREATE POLICY "integration_sync_log: engineers read"
  ON integration_sync_log FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND has_team_permission('system:integrations', 'view'));

CREATE POLICY "integration_sync_log: system insert"
  ON integration_sync_log FOR INSERT
  -- Schema 112: triggered_by is the caller.
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND triggered_by = auth.uid());

-- Odoo Saved Configs
CREATE POLICY "odoo_saved_config: org members read"
  ON odoo_saved_config FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()));

CREATE POLICY "odoo_saved_config: admins insert"
  ON odoo_saved_config FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "odoo_saved_config: admins update"
  ON odoo_saved_config FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "odoo_saved_config: admins delete"
  ON odoo_saved_config FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Webhooks
CREATE POLICY "webhook: users read"
  ON webhook FOR SELECT
  -- Schema 112: admins only; the row carries the signing secret. Every write was
  -- already admin-only and nothing outside the admin settings page reads it.
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "webhook: admins insert"
  ON webhook FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "webhook: admins update"
  ON webhook FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

CREATE POLICY "webhook: admins delete"
  ON webhook FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Webhook Deliveries
CREATE POLICY "webhook_delivery: users read"
  ON webhook_delivery FOR SELECT
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Schema 112: withdrawn. "Service" policies with TRUE applied to every role,
-- anon included, so anyone could insert or rewrite any organization's delivery
-- log. The service role bypasses RLS and needs no policy.

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Get organization integration status (no credentials exposed)
CREATE OR REPLACE FUNCTION org_integration_get_status(p_org_id UUID, p_integration_type TEXT)
RETURNS TABLE (
  id UUID,
  integration_type TEXT,
  is_active BOOLEAN,
  is_connected BOOLEAN,
  last_connected_at TIMESTAMPTZ,
  is_auto_sync BOOLEAN,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_count INT
) AS $$
BEGIN
  -- Returns the empty set rather than raising, so is_org_member() rather than
  -- org_require_member(). The test was
  -- `p_org_id NOT IN (SELECT org_id FROM users WHERE app_user.id = auth.uid())`,
  -- which is NULL for an account that has not joined an organization, so the
  -- RETURN was skipped and the query below ran for the named organization.
  -- Reproduced against another tenant's Odoo integration.
  IF NOT is_org_member(p_org_id) THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    oi.id, oi.integration_type, oi.is_active, oi.is_connected,
    oi.last_connected_at, oi.is_auto_sync, oi.last_sync_at,
    oi.last_sync_status, oi.last_sync_count
  FROM org_integration oi
  WHERE oi.org_id = p_org_id AND oi.integration_type = p_integration_type AND oi.is_active = true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get Odoo configs (no API keys exposed)
CREATE OR REPLACE FUNCTION odoo_saved_config_list(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  url TEXT,
  database TEXT,
  color TEXT,
  is_active BOOLEAN,
  last_tested_at TIMESTAMPTZ,
  is_last_test_successful BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Same NULL-unsafe test as org_integration_get_status. Reproduced: an account
  -- with app_user.org_id NULL read another tenant's saved Odoo configuration -
  -- its URL, database name and service account - over PostgREST.
  IF NOT is_org_member(p_org_id) THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    osc.id, osc.name, osc.description, osc.url, osc.database,
    osc.color, osc.is_active, osc.last_tested_at, osc.is_last_test_successful, osc.created_at
  FROM odoo_saved_config osc
  WHERE osc.org_id = p_org_id AND osc.is_active = true
  ORDER BY osc.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

-- Get webhooks for event
CREATE OR REPLACE FUNCTION webhook_list_for_event(p_org_id UUID, p_event_type webhook_event)
RETURNS SETOF webhook
LANGUAGE sql STABLE AS $$
  SELECT * FROM webhook
  WHERE org_id = p_org_id AND is_active = TRUE AND p_event_type = ANY(events);
$$;

-- Google Drive settings (only if user is in org)
-- Recreate to add inspection_template_folder_id to the return signature
--
-- Both of these hand-wrote their membership test out of auth.uid(). Both were
-- correct, and their correctness was the problem: check_org_gates() had to
-- treat a bare auth.uid() as evidence of a gate in order to keep passing them,
-- and that accommodation certified a function with no authorization at all. See
-- c_gate_binding in core.sql. org_require_member() admits exactly the same
-- callers this test did.
CREATE OR REPLACE FUNCTION org_get_google_drive_settings(p_org_id UUID)
RETURNS TABLE (client_id TEXT, client_secret TEXT, is_enabled BOOLEAN, inspection_template_folder_id TEXT) 
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM org_require_member(p_org_id);

  RETURN QUERY
  SELECT o.google_drive_client_id, o.google_drive_client_secret, o.is_google_drive_enabled,
         o.google_drive_inspection_template_folder_id
  FROM organization o WHERE o.id = p_org_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION org_update_google_drive_settings(
  p_org_id UUID, p_client_id TEXT, p_client_secret TEXT, p_enabled BOOLEAN,
  p_inspection_template_folder_id TEXT DEFAULT NULL
) RETURNS BOOLEAN SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  -- Membership first, then the narrower admin question. The organization
  -- binding is a call something can recognise. "Admin" is is_org_admin(): the
  -- role column OR membership of the Administrators team, the same answer the
  -- renderer and the API now give.
  PERFORM org_require_member(p_org_id);

  IF NOT is_org_admin() THEN
    RAISE EXCEPTION 'Only admins can update Google Drive settings';
  END IF;
  
  UPDATE organization
  SET google_drive_client_id = p_client_id,
      google_drive_client_secret = p_client_secret,
      is_google_drive_enabled = p_enabled,
      google_drive_inspection_template_folder_id = p_inspection_template_folder_id
  WHERE id = p_org_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- TRIGGERS
-- ===========================================
CREATE TRIGGER trg_webhook_set_updated_at
  BEFORE UPDATE ON webhook
  FOR EACH ROW
  EXECUTE FUNCTION trg_set_updated_at();

-- Licenses: admins read every licence in their organization; anyone else reads
-- only the licences assigned to them (schema 106). Before 106 every member read
-- every row, serial_number included. The assignment test goes through a
-- SECURITY DEFINER helper because the assignment policies below read
-- solidworks_license, and a licence policy that read the assignments table
-- under RLS would recurse.
--
-- The helper takes no argument on purpose: it answers only about the caller, so
-- there is no row id for check_unbound_entity_args() to ask about and nothing
-- to hand it that reaches another user's assignments.
CREATE OR REPLACE FUNCTION my_solidworks_license_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT license_id FROM solidworks_license_assignment WHERE user_id = auth.uid()
$$;

CREATE POLICY "solidworks_license: admins and assignees read"
  ON solidworks_license FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    AND (is_org_admin() OR id IN (SELECT my_solidworks_license_ids()))
  );

-- Licenses: Admins can insert
CREATE POLICY "solidworks_license: admins insert"
  ON solidworks_license FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Licenses: Admins can update
CREATE POLICY "solidworks_license: admins update"
  ON solidworks_license FOR UPDATE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Licenses: Admins can delete
CREATE POLICY "solidworks_license: admins delete"
  ON solidworks_license FOR DELETE
  USING (org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid()) AND is_org_admin());

-- Assignments: users read their own, admins read every assignment in the org.
-- The second arm used to admit any org member (the comment always said admins),
-- which told every member who held which licence.
CREATE POLICY "solidworks_license_assignment: users read own"
  ON solidworks_license_assignment FOR SELECT
  USING (
    user_id = auth.uid() OR (
      is_org_admin() AND license_id IN (
        SELECT id FROM solidworks_license
        WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
      )
    )
  );

-- Assignments: Admins can manage all
CREATE POLICY "solidworks_license_assignment: admins insert"
  ON solidworks_license_assignment FOR INSERT
  WITH CHECK (
    license_id IN (
      SELECT id FROM solidworks_license 
      WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    ) AND is_org_admin()
  );

CREATE POLICY "solidworks_license_assignment: admins update"
  ON solidworks_license_assignment FOR UPDATE
  USING (
    license_id IN (
      SELECT id FROM solidworks_license 
      WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    ) AND is_org_admin()
  );

CREATE POLICY "solidworks_license_assignment: admins delete"
  ON solidworks_license_assignment FOR DELETE
  USING (
    license_id IN (
      SELECT id FROM solidworks_license 
      WHERE org_id IN (SELECT org_id FROM app_user WHERE id = auth.uid())
    ) AND is_org_admin()
  );

-- Withdrawn in schema 106. It let a user UPDATE any column of their own
-- assignment, license_id included, so pointing it at another licence made that
-- licence's serial readable through the assignee arm of the licence policy.
-- Users change their activation through solidworks_license_activate() and
-- solidworks_license_deactivate(), which are SECURITY DEFINER and touch only
-- the activation columns; nothing in the app updated the row directly.

-- Helper function: Assign license to user
CREATE OR REPLACE FUNCTION solidworks_license_assign(
  p_license_id UUID,
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_current_user_id UUID;
  v_license_org_id UUID;
  v_user_org_id UUID;
  v_assignment_id UUID;
BEGIN
  v_current_user_id := auth.uid();
  
  -- Get license org
  SELECT org_id INTO v_license_org_id FROM solidworks_license WHERE id = p_license_id;
  
  IF v_license_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'License not found');
  END IF;
  
  -- The comment below used to say "admin of the license org" while the code
  -- asked only whether the caller was an admin of *some* organization - their
  -- own. An admin anywhere could therefore hand out any other organization's
  -- licences. Membership of the licence's organization is the missing half.
  IF NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = v_current_user_id AND u.org_id = v_license_org_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'License not found');
  END IF;

  -- Verify current user is admin of the license org
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can assign licenses');
  END IF;
  
  -- Verify target user is in the same org
  SELECT org_id INTO v_user_org_id FROM app_user WHERE id = p_user_id;
  
  IF v_user_org_id IS NULL OR v_user_org_id != v_license_org_id THEN
    RETURN json_build_object('success', false, 'error', 'User not found in organization');
  END IF;
  
  -- Check if assignment already exists
  IF EXISTS (SELECT 1 FROM solidworks_license_assignment WHERE license_id = p_license_id AND user_id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'License already assigned to this user');
  END IF;
  
  -- Create assignment
  INSERT INTO solidworks_license_assignment (license_id, user_id, assigned_by)
  VALUES (p_license_id, p_user_id, v_current_user_id)
  RETURNING id INTO v_assignment_id;
  
  RETURN json_build_object('success', true, 'assignment_id', v_assignment_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Helper function: Unassign license from user
CREATE OR REPLACE FUNCTION solidworks_license_unassign(
  p_assignment_id UUID
) RETURNS JSON AS $$
DECLARE
  v_license_org_id UUID;
BEGIN
  -- Get the org from the license via assignment
  SELECT sl.org_id INTO v_license_org_id
  FROM solidworks_license_assignment sla
  JOIN solidworks_license sl ON sl.id = sla.license_id
  WHERE sla.id = p_assignment_id;
  
  IF v_license_org_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;
  
  -- Being an admin somewhere is not being an admin here: without this, an admin
  -- of any organization could revoke any other organization's licence
  -- assignments. Same refusal as a nonexistent assignment, so this is not a way
  -- to enumerate them.
  IF NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_license_org_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  -- Verify current user is admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can unassign licenses');
  END IF;
  
  -- Delete assignment
  DELETE FROM solidworks_license_assignment WHERE id = p_assignment_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Helper function: Activate license on a machine
CREATE OR REPLACE FUNCTION solidworks_license_activate(
  p_assignment_id UUID,
  p_machine_id TEXT,
  p_machine_name TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_license_org_id UUID;
BEGIN
  -- Get the assignment user
  SELECT sla.user_id, sl.org_id INTO v_user_id, v_license_org_id
  FROM solidworks_license_assignment sla
  JOIN solidworks_license sl ON sl.id = sla.license_id
  WHERE sla.id = p_assignment_id;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  -- is_org_admin() answers "an admin of your own organization", so on its own it
  -- let an admin anywhere activate any assignment. Scope it to this licence's
  -- organization.
  IF NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_license_org_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;
  
  -- Verify current user owns this assignment or is admin
  IF auth.uid() != v_user_id AND NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to activate this license');
  END IF;
  
  -- Update activation status
  UPDATE solidworks_license_assignment
  SET 
    is_active = true,
    activated_at = NOW(),
    machine_id = p_machine_id,
    machine_name = p_machine_name,
    deactivated_at = NULL
  WHERE id = p_assignment_id;
  
  RETURN json_build_object('success', true, 'activated_at', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Helper function: Deactivate license
CREATE OR REPLACE FUNCTION solidworks_license_deactivate(
  p_assignment_id UUID
) RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_license_org_id UUID;
BEGIN
  -- Get the assignment user
  SELECT sla.user_id, sl.org_id INTO v_user_id, v_license_org_id
  FROM solidworks_license_assignment sla
  JOIN solidworks_license sl ON sl.id = sla.license_id
  WHERE sla.id = p_assignment_id;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;

  -- Scope the admin check to this licence's organization; is_org_admin() only
  -- says the caller is an admin of their own.
  IF NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_license_org_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Assignment not found');
  END IF;
  
  -- Verify current user owns this assignment or is admin
  IF auth.uid() != v_user_id AND NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to deactivate this license');
  END IF;
  
  -- Update deactivation status
  UPDATE solidworks_license_assignment
  SET 
    is_active = false,
    deactivated_at = NOW()
  WHERE id = p_assignment_id;
  
  RETURN json_build_object('success', true, 'deactivated_at', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Trigger for updated_at
CREATE TRIGGER trg_solidworks_license_set_updated_at
  BEFORE UPDATE ON solidworks_license
  FOR EACH ROW
  EXECUTE FUNCTION trg_set_updated_at();

-- Function to add a license to a pending member's pre-assigned list
CREATE OR REPLACE FUNCTION pending_license_assignment_add(
  p_pending_member_id UUID,
  p_license_id UUID
) RETURNS JSON AS $$
DECLARE
  v_pending RECORD;
  v_license_org_id UUID;
BEGIN
  -- Verify admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can assign licenses');
  END IF;
  
  -- Get pending member
  SELECT * INTO v_pending FROM pending_org_member WHERE id = p_pending_member_id AND claimed_at IS NULL;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Pending member not found');
  END IF;

  -- The admin check above is satisfied by being an admin of any organization,
  -- so without this an admin elsewhere could edit this organization's pending
  -- invitations. Same refusal as a nonexistent invitation.
  IF NOT EXISTS (
    SELECT 1 FROM app_user u WHERE u.id = auth.uid() AND u.org_id = v_pending.org_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Pending member not found');
  END IF;
  
  -- Verify license belongs to same org
  SELECT org_id INTO v_license_org_id FROM solidworks_license WHERE id = p_license_id;
  IF v_license_org_id IS NULL OR v_license_org_id != v_pending.org_id THEN
    RETURN json_build_object('success', false, 'error', 'License not found in organization');
  END IF;
  
  -- Add license to array if not already present
  UPDATE pending_org_member
  SET solidworks_license_ids = array_append(
    array_remove(solidworks_license_ids, p_license_id), -- Remove first to avoid duplicates
    p_license_id
  )
  WHERE id = p_pending_member_id;
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Function to remove a license from a pending member's pre-assigned list
CREATE OR REPLACE FUNCTION pending_license_assignment_remove(
  p_pending_member_id UUID,
  p_license_id UUID
) RETURNS JSON AS $$
BEGIN
  -- Verify admin
  IF NOT is_org_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Only admins can unassign licenses');
  END IF;
  
  -- ...of this invitation's organization. is_org_admin() alone let an admin
  -- anywhere strip licences from anyone's pending invitations.
  UPDATE pending_org_member
  SET solidworks_license_ids = array_remove(solidworks_license_ids, p_license_id)
  WHERE id = p_pending_member_id
    AND claimed_at IS NULL
    AND org_id = (SELECT u.org_id FROM app_user u WHERE u.id = auth.uid());
  
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Function to apply pending license assignments when user signs up
-- This should be called from the trg_app_user_claim_pending_membership trigger
CREATE OR REPLACE FUNCTION pending_license_assignment_apply(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_pending RECORD;
  v_license_id UUID;
  v_invited_by UUID;
BEGIN
  -- Find the pending member record for this user
  SELECT * INTO v_pending
  FROM pending_org_member
  -- Schema 111: verified address and the account's own organization, as in
  -- team_member_apply_pending() (core.sql).
  WHERE LOWER(email) = user_get_verified_email(p_user_id)
    AND org_id = (SELECT org_id FROM app_user WHERE id = p_user_id)
    AND claimed_at IS NULL
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Assign each pre-assigned license
  IF v_pending.solidworks_license_ids IS NOT NULL AND array_length(v_pending.solidworks_license_ids, 1) > 0 THEN
    v_invited_by := v_pending.invited_by;
    
    FOREACH v_license_id IN ARRAY v_pending.solidworks_license_ids
    LOOP
      -- Only assign if license still exists and isn't already assigned to someone else
      IF EXISTS (
        SELECT 1 FROM solidworks_license 
        WHERE id = v_license_id 
        AND org_id = v_pending.org_id
        AND NOT EXISTS (SELECT 1 FROM solidworks_license_assignment WHERE license_id = v_license_id)
      ) THEN
        INSERT INTO solidworks_license_assignment (license_id, user_id, assigned_by)
        VALUES (v_license_id, p_user_id, v_invited_by)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- No policies are defined for anon or authenticated, and that is deliberate.
-- With RLS enabled and no matching policy, PostgREST returns zero rows to
-- those roles. service_role bypasses RLS, so only the API can reach these
-- values. Do not add a "users can view their org's credentials" policy here:
-- that would reintroduce exactly the problem this table exists to fix.
CREATE OR REPLACE FUNCTION trg_integration_credential_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_integration_credential_set_updated_at
  BEFORE UPDATE ON integration_credential
  FOR EACH ROW EXECUTE FUNCTION trg_integration_credential_set_updated_at();

-- ===========================================
-- PRIVILEGES
-- ===========================================

-- Written out in full rather than left to the platform's default privileges, so a
-- fresh database and an upgraded one hold the same grants. anon holds nothing
-- here except what anon_get_read_allowlist() and anon_get_execute_allowlist() name.
REVOKE ALL ON FUNCTION
  my_solidworks_license_ids(),
  odoo_saved_config_list(uuid),
  org_get_google_drive_settings(uuid),
  org_integration_get_status(uuid,text),
  org_update_google_drive_settings(uuid,text,text,boolean,text),
  pending_license_assignment_add(uuid,uuid),
  pending_license_assignment_remove(uuid,uuid),
  solidworks_license_activate(uuid,text,text),
  solidworks_license_assign(uuid,uuid),
  solidworks_license_deactivate(uuid),
  solidworks_license_unassign(uuid),
  trg_integration_credential_set_updated_at(),
  webhook_list_for_event(uuid,webhook_event)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  my_solidworks_license_ids(),
  odoo_saved_config_list(uuid),
  org_get_google_drive_settings(uuid),
  org_integration_get_status(uuid,text),
  org_update_google_drive_settings(uuid,text,text,boolean,text),
  pending_license_assignment_add(uuid,uuid),
  pending_license_assignment_remove(uuid,uuid),
  solidworks_license_activate(uuid,text,text),
  solidworks_license_assign(uuid,uuid),
  solidworks_license_deactivate(uuid),
  solidworks_license_unassign(uuid),
  trg_integration_credential_set_updated_at(),
  webhook_list_for_event(uuid,webhook_event)
TO authenticated, service_role;
REVOKE ALL ON FUNCTION
  pending_license_assignment_apply(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  pending_license_assignment_apply(uuid)
TO service_role;

REVOKE ALL ON TABLE integration_sync_log, odoo_saved_config, org_integration, solidworks_license, solidworks_license_assignment, webhook, webhook_delivery FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE integration_sync_log, odoo_saved_config, org_integration, solidworks_license, solidworks_license_assignment, webhook, webhook_delivery TO authenticated, service_role;
REVOKE ALL ON TABLE integration_credential FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE integration_credential TO service_role;

SELECT anon_enforce_execute_posture();
