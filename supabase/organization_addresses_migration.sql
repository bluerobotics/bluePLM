-- Organization Addresses Migration
-- Adds support for multiple billing and shipping addresses per organization
-- This migration is idempotent (safe to run multiple times)

-- Create address type enum (if not exists)
DO $$ BEGIN
  CREATE TYPE address_type AS ENUM ('billing', 'shipping');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create organization_addresses table
CREATE TABLE IF NOT EXISTS organization_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  address_type address_type NOT NULL,
  label TEXT NOT NULL, -- e.g., "Main Office", "Warehouse", "HQ"
  is_default BOOLEAN DEFAULT FALSE,
  
  -- Billing-specific fields
  company_name TEXT, -- Company name (billing addresses only)
  contact_name TEXT, -- Contact person name (billing addresses only)
  
  -- Address fields
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'USA',
  
  -- Contact info for this specific address
  attention_to TEXT, -- "ATTN: Receiving Dept" (shipping addresses only)
  phone TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Billing addresses should not have ATTN field
  CONSTRAINT no_attn_for_billing CHECK (
    address_type != 'billing' OR attention_to IS NULL
  )
);

-- Add new columns if they don't exist (for existing tables)
ALTER TABLE organization_addresses ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE organization_addresses ADD COLUMN IF NOT EXISTS contact_name TEXT;

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_org_addresses_org_id ON organization_addresses(org_id);
CREATE INDEX IF NOT EXISTS idx_org_addresses_type ON organization_addresses(org_id, address_type);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_org_address_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS org_address_updated ON organization_addresses;
CREATE TRIGGER org_address_updated
  BEFORE UPDATE ON organization_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_org_address_timestamp();

-- Function to ensure only one default per type per org
CREATE OR REPLACE FUNCTION ensure_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    -- Unset any other default of the same type for this org
    UPDATE organization_addresses
    SET is_default = FALSE
    WHERE org_id = NEW.org_id 
      AND address_type = NEW.address_type 
      AND id != NEW.id
      AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_single_default ON organization_addresses;
CREATE TRIGGER ensure_single_default
  BEFORE INSERT OR UPDATE ON organization_addresses
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_address();

-- RLS Policies
ALTER TABLE organization_addresses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "Users can view org addresses" ON organization_addresses;
DROP POLICY IF EXISTS "Admins can insert addresses" ON organization_addresses;
DROP POLICY IF EXISTS "Admins can update addresses" ON organization_addresses;
DROP POLICY IF EXISTS "Admins can delete addresses" ON organization_addresses;

-- Users can view addresses for their organization
CREATE POLICY "Users can view org addresses"
  ON organization_addresses FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
  );

-- Only admins can insert addresses
CREATE POLICY "Admins can insert addresses"
  ON organization_addresses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
        AND org_id = organization_addresses.org_id 
        AND role = 'admin'
    )
  );

-- Only admins can update addresses
CREATE POLICY "Admins can update addresses"
  ON organization_addresses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
        AND org_id = organization_addresses.org_id 
        AND role = 'admin'
    )
  );

-- Only admins can delete addresses
CREATE POLICY "Admins can delete addresses"
  ON organization_addresses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
        AND org_id = organization_addresses.org_id 
        AND role = 'admin'
    )
  );

-- Add address selection columns to rfqs table
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS billing_address_id UUID REFERENCES organization_addresses(id) ON DELETE SET NULL;
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS shipping_address_id UUID REFERENCES organization_addresses(id) ON DELETE SET NULL;

-- Migrate existing organization address to default addresses
-- Only creates addresses if none exist yet for the org
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN 
    SELECT id, address_line1, address_line2, city, state, postal_code, country, phone
    FROM organizations 
    WHERE address_line1 IS NOT NULL
  LOOP
    -- Only create if no addresses exist for this org yet
    IF NOT EXISTS (SELECT 1 FROM organization_addresses WHERE org_id = org.id) THEN
      -- Create default billing address
      INSERT INTO organization_addresses (org_id, address_type, label, is_default, address_line1, address_line2, city, state, postal_code, country, phone)
      VALUES (org.id, 'billing', 'Main Office', TRUE, org.address_line1, org.address_line2, org.city, org.state, org.postal_code, org.country, org.phone);
      
      -- Create default shipping address (same as billing initially)
      INSERT INTO organization_addresses (org_id, address_type, label, is_default, address_line1, address_line2, city, state, postal_code, country, phone)
      VALUES (org.id, 'shipping', 'Main Office', TRUE, org.address_line1, org.address_line2, org.city, org.state, org.postal_code, org.country, org.phone);
    END IF;
  END LOOP;
END $$;
