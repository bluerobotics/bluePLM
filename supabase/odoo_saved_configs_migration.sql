-- BluePLM Odoo Saved Configurations Migration
-- Allows saving multiple named Odoo configurations per organization
-- Run this in your Supabase SQL editor AFTER schema.sql

-- ===========================================
-- ODOO SAVED CONFIGURATIONS
-- ===========================================
-- Stores multiple named Odoo configurations per org
-- Users can save, load, and switch between configurations

CREATE TABLE IF NOT EXISTS odoo_saved_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Configuration identity
  name TEXT NOT NULL,  -- User-friendly label (e.g., "Production", "Dev Server", "Staging")
  description TEXT,    -- Optional description
  
  -- Connection settings
  url TEXT NOT NULL,           -- Odoo instance URL
  database TEXT NOT NULL,      -- Odoo database name
  username TEXT NOT NULL,      -- Odoo username (email)
  api_key_encrypted TEXT,      -- API key (should be encrypted in production)
  
  -- Status tracking
  is_active BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  last_test_success BOOLEAN,
  last_test_error TEXT,
  
  -- Color/icon for visual distinction (optional)
  color TEXT,  -- Hex color for UI badge (e.g., "#22c55e" for green)
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  -- Unique name per org
  UNIQUE(org_id, name)
);

CREATE INDEX idx_odoo_saved_configs_org_id ON odoo_saved_configs(org_id);
CREATE INDEX idx_odoo_saved_configs_active ON odoo_saved_configs(is_active) WHERE is_active = true;

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE odoo_saved_configs ENABLE ROW LEVEL SECURITY;

-- Only admins can view saved configs (contains sensitive credentials)
CREATE POLICY "Admins can view odoo saved configs"
  ON odoo_saved_configs FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Only admins can manage saved configs
CREATE POLICY "Admins can manage odoo saved configs"
  ON odoo_saved_configs FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ===========================================
-- UPDATE TIMESTAMP TRIGGER
-- ===========================================

CREATE OR REPLACE FUNCTION update_odoo_saved_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER odoo_saved_configs_updated_at
  BEFORE UPDATE ON odoo_saved_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_odoo_saved_config_timestamp();

-- ===========================================
-- HELPER: Get all saved configs for org (without API keys)
-- ===========================================

CREATE OR REPLACE FUNCTION get_odoo_saved_configs(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  url TEXT,
  database TEXT,
  username TEXT,
  color TEXT,
  is_active BOOLEAN,
  last_tested_at TIMESTAMPTZ,
  last_test_success BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    osc.id,
    osc.name,
    osc.description,
    osc.url,
    osc.database,
    osc.username,
    osc.color,
    osc.is_active,
    osc.last_tested_at,
    osc.last_test_success,
    osc.created_at
  FROM odoo_saved_configs osc
  WHERE osc.org_id = p_org_id
    AND osc.is_active = true
  ORDER BY osc.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

