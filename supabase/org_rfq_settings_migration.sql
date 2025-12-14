-- BluePLM Organization RFQ Settings Migration
-- Adds organization branding and RFQ template settings
-- Run this in your Supabase SQL editor

-- ===========================================
-- ADD COLUMNS TO ORGANIZATIONS TABLE
-- ===========================================

-- Company branding
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_storage_path TEXT;

-- Company address
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address_line2 TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'USA';

-- Company contact
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- RFQ template settings (stored as JSONB for flexibility)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS rfq_settings JSONB DEFAULT '{
  "default_payment_terms": "Net 30",
  "default_incoterms": "FOB",
  "default_valid_days": 30,
  "show_company_logo": true,
  "show_revision_column": true,
  "show_material_column": true,
  "show_finish_column": true,
  "show_notes_column": true,
  "terms_and_conditions": "",
  "footer_text": ""
}'::jsonb;

-- ===========================================
-- COMMENTS FOR DOCUMENTATION
-- ===========================================

COMMENT ON COLUMN organizations.logo_url IS 'Public URL to organization logo image';
COMMENT ON COLUMN organizations.logo_storage_path IS 'Supabase storage path for logo';
COMMENT ON COLUMN organizations.rfq_settings IS 'RFQ generation preferences and template settings';

-- ===========================================
-- UPDATE FUNCTION FOR RFQ SETTINGS
-- ===========================================

CREATE OR REPLACE FUNCTION update_org_rfq_settings(
  p_org_id UUID,
  p_settings JSONB
)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  -- Check if user is an admin in the organization
  SELECT role INTO v_user_role
  FROM users 
  WHERE id = auth.uid() 
  AND org_id = p_org_id;
  
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'User not found in organization';
  END IF;
  
  IF v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can update organization settings';
  END IF;
  
  -- Merge new settings with existing (preserves unset keys)
  UPDATE organizations
  SET rfq_settings = rfq_settings || p_settings
  WHERE id = p_org_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_org_rfq_settings(UUID, JSONB) TO authenticated;

-- ===========================================
-- UPDATE FUNCTION FOR ORG BRANDING
-- ===========================================

CREATE OR REPLACE FUNCTION update_org_branding(
  p_org_id UUID,
  p_logo_url TEXT DEFAULT NULL,
  p_logo_storage_path TEXT DEFAULT NULL,
  p_address_line1 TEXT DEFAULT NULL,
  p_address_line2 TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_postal_code TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  -- Check if user is an admin in the organization
  SELECT role INTO v_user_role
  FROM users 
  WHERE id = auth.uid() 
  AND org_id = p_org_id;
  
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'User not found in organization';
  END IF;
  
  IF v_user_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can update organization branding';
  END IF;
  
  -- Update only non-null values
  UPDATE organizations
  SET 
    logo_url = COALESCE(p_logo_url, logo_url),
    logo_storage_path = COALESCE(p_logo_storage_path, logo_storage_path),
    address_line1 = COALESCE(p_address_line1, address_line1),
    address_line2 = COALESCE(p_address_line2, address_line2),
    city = COALESCE(p_city, city),
    state = COALESCE(p_state, state),
    postal_code = COALESCE(p_postal_code, postal_code),
    country = COALESCE(p_country, country),
    phone = COALESCE(p_phone, phone),
    website = COALESCE(p_website, website),
    contact_email = COALESCE(p_contact_email, contact_email)
  WHERE id = p_org_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_org_branding(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

