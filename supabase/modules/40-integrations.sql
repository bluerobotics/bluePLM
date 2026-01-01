-- =====================================================================
-- BluePLM Integrations Module
-- =====================================================================
-- 
-- This module contains:
--   - Organization Integrations (generic integration settings)
--   - Integration Sync Log
--   - Odoo saved configurations
--   - WooCommerce saved configurations
--   - WooCommerce product mappings
--   - Webhooks
--   - Webhook deliveries
--   - Google Drive integration functions
--
-- DEPENDENCIES: 
--   - core.sql must be installed first
--
-- IDEMPOTENT: Safe to run multiple times
--
-- =====================================================================

-- ===========================================
-- INTEGRATION ENUMS
-- ===========================================

DO $$ BEGIN
  CREATE TYPE webhook_event AS ENUM (
    'file.created', 'file.updated', 'file.deleted', 'file.checked_in', 'file.checked_out',
    'file.state_changed', 'file.revision_changed', 'eco.created', 'eco.updated', 'eco.completed',
    'review.requested', 'review.approved', 'review.rejected', 'rfq.created', 'rfq.sent',
    'rfq.quoted', 'rfq.awarded', 'supplier.created', 'supplier.updated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'success', 'failed', 'retrying');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================
-- ORGANIZATION INTEGRATIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS organization_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Integration type
  integration_type TEXT NOT NULL,  -- 'odoo', 'slack', 'webhook', etc.
  
  -- Settings (flexible JSONB)
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Encrypted credentials
  credentials_encrypted TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_connected BOOLEAN DEFAULT false,
  last_connected_at TIMESTAMPTZ,
  last_error TEXT,
  
  -- Sync settings
  auto_sync BOOLEAN DEFAULT false,
  sync_interval_minutes INT DEFAULT 60,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_message TEXT,
  last_sync_count INT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  UNIQUE(org_id, integration_type)
);

CREATE INDEX IF NOT EXISTS idx_org_integrations_org_id ON organization_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_integrations_type ON organization_integrations(integration_type);
CREATE INDEX IF NOT EXISTS idx_org_integrations_active ON organization_integrations(is_active) WHERE is_active = true;

-- ===========================================
-- INTEGRATION SYNC LOG
-- ===========================================

CREATE TABLE IF NOT EXISTS integration_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES organization_integrations(id) ON DELETE CASCADE,
  
  -- Sync details
  sync_type TEXT NOT NULL,
  sync_direction TEXT NOT NULL DEFAULT 'pull',
  
  -- Results
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Counts
  records_processed INT DEFAULT 0,
  records_created INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  records_skipped INT DEFAULT 0,
  records_errored INT DEFAULT 0,
  
  -- Error details
  error_message TEXT,
  error_details JSONB,
  
  -- Triggered by
  triggered_by UUID REFERENCES users(id),
  trigger_type TEXT DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_sync_log_org_id ON integration_sync_log(org_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_integration_id ON integration_sync_log(integration_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_started_at ON integration_sync_log(started_at DESC);

-- ===========================================
-- ODOO SAVED CONFIGURATIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS odoo_saved_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Configuration identity
  name TEXT NOT NULL,
  description TEXT,
  
  -- Connection settings
  url TEXT NOT NULL,
  database TEXT NOT NULL,
  username TEXT NOT NULL,
  api_key_encrypted TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  last_test_success BOOLEAN,
  last_test_error TEXT,
  
  -- Visual
  color TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_odoo_saved_configs_org_id ON odoo_saved_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_odoo_saved_configs_active ON odoo_saved_configs(is_active) WHERE is_active = true;

-- ===========================================
-- WOOCOMMERCE SAVED CONFIGURATIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS woocommerce_saved_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Configuration identity
  name TEXT NOT NULL,
  description TEXT,
  
  -- Connection settings
  store_url TEXT NOT NULL,
  store_name TEXT,
  consumer_key_encrypted TEXT,
  consumer_secret_encrypted TEXT,
  
  -- Sync settings
  sync_settings JSONB DEFAULT '{
    "sync_products": true,
    "sync_on_release": false,
    "sync_categories": true,
    "default_status": "draft"
  }'::jsonb,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  last_test_success BOOLEAN,
  last_test_error TEXT,
  wc_version TEXT,
  
  -- Sync tracking
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_count INTEGER,
  
  -- Visual
  color TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_woocommerce_saved_configs_org_id ON woocommerce_saved_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_woocommerce_saved_configs_active ON woocommerce_saved_configs(is_active) WHERE is_active = true;

-- ===========================================
-- WOOCOMMERCE PRODUCT MAPPINGS
-- ===========================================

CREATE TABLE IF NOT EXISTS woocommerce_product_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES woocommerce_saved_configs(id) ON DELETE CASCADE,
  
  -- BluePLM file reference
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  
  -- WooCommerce product info
  wc_product_id INTEGER NOT NULL,
  wc_product_name TEXT,
  wc_product_sku TEXT,
  wc_product_type TEXT DEFAULT 'simple',
  wc_product_status TEXT DEFAULT 'draft',
  
  -- Sync tracking
  last_synced_at TIMESTAMPTZ,
  last_synced_version INTEGER,
  last_synced_revision TEXT,
  sync_status TEXT DEFAULT 'pending',
  sync_error TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(config_id, file_id),
  UNIQUE(config_id, wc_product_id)
);

CREATE INDEX IF NOT EXISTS idx_wc_product_mappings_org_id ON woocommerce_product_mappings(org_id);
CREATE INDEX IF NOT EXISTS idx_wc_product_mappings_config_id ON woocommerce_product_mappings(config_id);
CREATE INDEX IF NOT EXISTS idx_wc_product_mappings_file_id ON woocommerce_product_mappings(file_id);

-- ===========================================
-- WEBHOOKS
-- ===========================================

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  
  -- Security
  secret TEXT NOT NULL,
  
  -- Configuration
  events webhook_event[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  
  -- User filtering
  trigger_filter TEXT DEFAULT 'everyone' CHECK (trigger_filter IN ('everyone', 'roles', 'users')),
  trigger_roles TEXT[] DEFAULT '{}',
  trigger_user_ids UUID[] DEFAULT '{}',
  
  -- Headers
  custom_headers JSONB DEFAULT '{}'::jsonb,
  
  -- Retry configuration
  max_retries INTEGER DEFAULT 3,
  retry_delay_seconds INTEGER DEFAULT 60,
  timeout_seconds INTEGER DEFAULT 30,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Stats
  last_triggered_at TIMESTAMPTZ,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org_id ON webhooks(org_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(org_id, is_active) WHERE is_active = TRUE;

-- ===========================================
-- WEBHOOK DELIVERIES
-- ===========================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Event details
  event_type webhook_event NOT NULL,
  event_id UUID,
  payload JSONB NOT NULL,
  
  -- Delivery status
  status webhook_delivery_status DEFAULT 'pending',
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

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org_id ON webhook_deliveries(org_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status) WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);

-- ===========================================
-- RLS POLICIES
-- ===========================================

ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE odoo_saved_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE woocommerce_saved_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE woocommerce_product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Organization Integrations
DROP POLICY IF EXISTS "Org members can view integrations" ON organization_integrations;
CREATE POLICY "Org members can view integrations"
  ON organization_integrations FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert org integrations" ON organization_integrations;
CREATE POLICY "Admins can insert org integrations"
  ON organization_integrations FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can update org integrations" ON organization_integrations;
CREATE POLICY "Admins can update org integrations"
  ON organization_integrations FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can delete org integrations" ON organization_integrations;
CREATE POLICY "Admins can delete org integrations"
  ON organization_integrations FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

-- Integration Sync Log
DROP POLICY IF EXISTS "Engineers can view sync logs" ON integration_sync_log;
CREATE POLICY "Engineers can view sync logs"
  ON integration_sync_log FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND user_has_team_permission('system:integrations', 'view'));

DROP POLICY IF EXISTS "System can insert sync logs" ON integration_sync_log;
CREATE POLICY "System can insert sync logs"
  ON integration_sync_log FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Odoo Saved Configs
DROP POLICY IF EXISTS "Org members can view odoo configs" ON odoo_saved_configs;
CREATE POLICY "Org members can view odoo configs"
  ON odoo_saved_configs FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert odoo configs" ON odoo_saved_configs;
CREATE POLICY "Admins can insert odoo configs"
  ON odoo_saved_configs FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can update odoo configs" ON odoo_saved_configs;
CREATE POLICY "Admins can update odoo configs"
  ON odoo_saved_configs FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can delete odoo configs" ON odoo_saved_configs;
CREATE POLICY "Admins can delete odoo configs"
  ON odoo_saved_configs FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

-- WooCommerce Saved Configs
DROP POLICY IF EXISTS "Org members can view woocommerce configs" ON woocommerce_saved_configs;
CREATE POLICY "Org members can view woocommerce configs"
  ON woocommerce_saved_configs FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert woocommerce configs" ON woocommerce_saved_configs;
CREATE POLICY "Admins can insert woocommerce configs"
  ON woocommerce_saved_configs FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can update woocommerce configs" ON woocommerce_saved_configs;
CREATE POLICY "Admins can update woocommerce configs"
  ON woocommerce_saved_configs FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can delete woocommerce configs" ON woocommerce_saved_configs;
CREATE POLICY "Admins can delete woocommerce configs"
  ON woocommerce_saved_configs FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

-- WooCommerce Product Mappings
DROP POLICY IF EXISTS "Org members can view wc product mappings" ON woocommerce_product_mappings;
CREATE POLICY "Org members can view wc product mappings"
  ON woocommerce_product_mappings FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage wc product mappings" ON woocommerce_product_mappings;
CREATE POLICY "Admins can manage wc product mappings"
  ON woocommerce_product_mappings FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

-- Webhooks
DROP POLICY IF EXISTS "Users can view their org webhooks" ON webhooks;
CREATE POLICY "Users can view their org webhooks"
  ON webhooks FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert webhooks" ON webhooks;
CREATE POLICY "Admins can insert webhooks"
  ON webhooks FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can update webhooks" ON webhooks;
CREATE POLICY "Admins can update webhooks"
  ON webhooks FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

DROP POLICY IF EXISTS "Admins can delete webhooks" ON webhooks;
CREATE POLICY "Admins can delete webhooks"
  ON webhooks FOR DELETE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()) AND is_org_admin());

-- Webhook Deliveries
DROP POLICY IF EXISTS "Users can view their org webhook deliveries" ON webhook_deliveries;
CREATE POLICY "Users can view their org webhook deliveries"
  ON webhook_deliveries FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Service can insert webhook deliveries" ON webhook_deliveries;
CREATE POLICY "Service can insert webhook deliveries"
  ON webhook_deliveries FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Service can update webhook deliveries" ON webhook_deliveries;
CREATE POLICY "Service can update webhook deliveries"
  ON webhook_deliveries FOR UPDATE
  USING (TRUE);

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Get organization integration status (no credentials exposed)
CREATE OR REPLACE FUNCTION get_org_integration_status(p_org_id UUID, p_integration_type TEXT)
RETURNS TABLE (
  id UUID,
  integration_type TEXT,
  is_active BOOLEAN,
  is_connected BOOLEAN,
  last_connected_at TIMESTAMPTZ,
  auto_sync BOOLEAN,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_count INT
) AS $$
BEGIN
  IF p_org_id NOT IN (SELECT org_id FROM users WHERE users.id = auth.uid()) THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    oi.id, oi.integration_type, oi.is_active, oi.is_connected,
    oi.last_connected_at, oi.auto_sync, oi.last_sync_at,
    oi.last_sync_status, oi.last_sync_count
  FROM organization_integrations oi
  WHERE oi.org_id = p_org_id AND oi.integration_type = p_integration_type AND oi.is_active = true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_org_integration_status(UUID, TEXT) TO authenticated;

-- Get Odoo configs (no API keys exposed)
CREATE OR REPLACE FUNCTION get_org_odoo_configs(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  url TEXT,
  database TEXT,
  color TEXT,
  is_active BOOLEAN,
  last_tested_at TIMESTAMPTZ,
  last_test_success BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF p_org_id NOT IN (SELECT org_id FROM users WHERE users.id = auth.uid()) THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    osc.id, osc.name, osc.description, osc.url, osc.database,
    osc.color, osc.is_active, osc.last_tested_at, osc.last_test_success, osc.created_at
  FROM odoo_saved_configs osc
  WHERE osc.org_id = p_org_id AND osc.is_active = true
  ORDER BY osc.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_org_odoo_configs(UUID) TO authenticated;

-- Get webhooks for event
CREATE OR REPLACE FUNCTION get_webhooks_for_event(p_org_id UUID, p_event_type webhook_event)
RETURNS SETOF webhooks
LANGUAGE sql STABLE AS $$
  SELECT * FROM webhooks
  WHERE org_id = p_org_id AND is_active = TRUE AND p_event_type = ANY(events);
$$;

-- Google Drive settings (only if user is in org)
CREATE OR REPLACE FUNCTION get_google_drive_settings(p_org_id UUID)
RETURNS TABLE (client_id TEXT, client_secret TEXT, enabled BOOLEAN) 
SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND org_id = p_org_id) THEN
    RAISE EXCEPTION 'User not authorized to access this organization';
  END IF;
  
  RETURN QUERY
  SELECT o.google_drive_client_id, o.google_drive_client_secret, o.google_drive_enabled
  FROM organizations o WHERE o.id = p_org_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_google_drive_settings(
  p_org_id UUID, p_client_id TEXT, p_client_secret TEXT, p_enabled BOOLEAN
) RETURNS BOOLEAN SECURITY DEFINER AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = auth.uid() AND org_id = p_org_id;
  
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'User not found in organization';
  END IF;
  
  IF v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can update Google Drive settings';
  END IF;
  
  UPDATE organizations
  SET google_drive_client_id = p_client_id,
      google_drive_client_secret = p_client_secret,
      google_drive_enabled = p_enabled
  WHERE id = p_org_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_google_drive_settings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_google_drive_settings(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ===========================================
-- TRIGGERS
-- ===========================================

DROP TRIGGER IF EXISTS webhooks_updated_at ON webhooks;
CREATE TRIGGER webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- REALTIME
-- ===========================================

ALTER TABLE webhooks REPLICA IDENTITY FULL;
ALTER TABLE organization_integrations REPLICA IDENTITY FULL;
ALTER TABLE odoo_saved_configs REPLICA IDENTITY FULL;
ALTER TABLE woocommerce_saved_configs REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE webhooks; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE organization_integrations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE odoo_saved_configs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE woocommerce_saved_configs; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ===========================================
-- COMMENTS
-- ===========================================

COMMENT ON TABLE organization_integrations IS 'Generic integration configurations for orgs';
COMMENT ON TABLE integration_sync_log IS 'Audit trail for integration sync operations';
COMMENT ON TABLE odoo_saved_configs IS 'Saved Odoo ERP connection configurations';
COMMENT ON TABLE woocommerce_saved_configs IS 'Saved WooCommerce store configurations';
COMMENT ON TABLE woocommerce_product_mappings IS 'Maps BluePLM files to WooCommerce products';
COMMENT ON TABLE webhooks IS 'Webhook configurations for external integrations';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery attempts and history';

-- ===========================================
-- END OF INTEGRATIONS MODULE
-- ===========================================

DO $$
BEGIN
  RAISE NOTICE 'Integrations module installed successfully';
END $$;
