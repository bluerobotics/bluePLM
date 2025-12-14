-- BluePLM Odoo Integration Migration
-- Adds organization integration settings for Odoo sync
-- Run this in your Supabase SQL editor AFTER the main schema.sql

-- ===========================================
-- ORGANIZATION INTEGRATIONS (Encrypted credentials)
-- ===========================================

CREATE TABLE organization_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Integration type
  integration_type TEXT NOT NULL,  -- 'odoo', 'slack', 'webhook', etc.
  
  -- Connection settings (stored as JSONB for flexibility)
  -- For Odoo: { url, database, username }
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Encrypted credentials (API keys, passwords)
  -- NOTE: In production, use Supabase Vault for sensitive data
  -- For now, we store the API key directly (should be encrypted in transit via HTTPS)
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
  last_sync_status TEXT,  -- 'success', 'error', 'partial'
  last_sync_message TEXT,
  last_sync_count INT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  -- One integration per type per org
  UNIQUE(org_id, integration_type)
);

CREATE INDEX idx_org_integrations_org_id ON organization_integrations(org_id);
CREATE INDEX idx_org_integrations_type ON organization_integrations(integration_type);
CREATE INDEX idx_org_integrations_active ON organization_integrations(is_active) WHERE is_active = true;

-- ===========================================
-- INTEGRATION SYNC LOG (Audit trail)
-- ===========================================

CREATE TABLE integration_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES organization_integrations(id) ON DELETE CASCADE,
  
  -- Sync details
  sync_type TEXT NOT NULL,  -- 'suppliers', 'products', 'full'
  sync_direction TEXT NOT NULL DEFAULT 'pull',  -- 'pull', 'push', 'bidirectional'
  
  -- Results
  status TEXT NOT NULL,  -- 'started', 'success', 'error', 'partial'
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
  trigger_type TEXT DEFAULT 'manual'  -- 'manual', 'scheduled', 'webhook'
);

CREATE INDEX idx_sync_log_org_id ON integration_sync_log(org_id);
CREATE INDEX idx_sync_log_integration_id ON integration_sync_log(integration_id);
CREATE INDEX idx_sync_log_started_at ON integration_sync_log(started_at DESC);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage integrations
CREATE POLICY "Admins can view org integrations"
  ON organization_integrations FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can manage org integrations"
  ON organization_integrations FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Admins and engineers can view sync logs
CREATE POLICY "Engineers can view sync logs"
  ON integration_sync_log FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer')));

CREATE POLICY "System can insert sync logs"
  ON integration_sync_log FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Function to get Odoo integration settings for an org
CREATE OR REPLACE FUNCTION get_odoo_integration(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  url TEXT,
  database TEXT,
  username TEXT,
  is_connected BOOLEAN,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_count INT,
  auto_sync BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oi.id,
    oi.settings->>'url' as url,
    oi.settings->>'database' as database,
    oi.settings->>'username' as username,
    oi.is_connected,
    oi.last_sync_at,
    oi.last_sync_status,
    oi.last_sync_count,
    oi.auto_sync
  FROM organization_integrations oi
  WHERE oi.org_id = p_org_id
    AND oi.integration_type = 'odoo'
    AND oi.is_active = true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ===========================================
-- UPDATE SCHEMA.SQL REMINDER
-- ===========================================
-- Remember to add these tables to supabase/schema.sql as the source of truth!

