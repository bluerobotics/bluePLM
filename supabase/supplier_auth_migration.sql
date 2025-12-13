-- BluePDM Supplier Authentication Migration
-- Adds supplier portal access for external vendors
-- Run this in your Supabase SQL editor AFTER the suppliers_migration.sql

-- ===========================================
-- SUPPLIER AUTH TYPE ENUM
-- ===========================================

-- Auth method enum for suppliers (not all have Google access in China)
CREATE TYPE supplier_auth_method AS ENUM ('email', 'phone', 'wechat');

-- ===========================================
-- SUPPLIER CONTACTS (Supplier Portal Users)
-- ===========================================
-- These are people who work at supplier companies and need portal access

CREATE TABLE supplier_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Link to Supabase auth (if they have one)
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Which supplier company they work for
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  
  -- Contact info
  email TEXT,                            -- Email address (used for email login)
  phone TEXT,                            -- Phone number with country code (e.g., +86 138 0000 0000)
  phone_country_code TEXT,               -- Country code for display (e.g., 'CN', 'US')
  full_name TEXT NOT NULL,
  job_title TEXT,
  avatar_url TEXT,
  
  -- Auth configuration
  auth_method supplier_auth_method DEFAULT 'email',
  wechat_openid TEXT,                    -- WeChat OpenID for WeChat login
  
  -- Status
  is_primary BOOLEAN DEFAULT false,      -- Primary contact for the supplier
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  
  -- Portal access permissions
  can_view_rfqs BOOLEAN DEFAULT true,    -- Can view Requests for Quote
  can_submit_quotes BOOLEAN DEFAULT true,
  can_view_orders BOOLEAN DEFAULT true,
  can_update_pricing BOOLEAN DEFAULT true,
  can_manage_catalog BOOLEAN DEFAULT true,
  
  -- Last activity
  last_sign_in TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique email per org's suppliers
  UNIQUE(email),
  UNIQUE(phone),
  UNIQUE(wechat_openid)
);

CREATE INDEX idx_supplier_contacts_supplier_id ON supplier_contacts(supplier_id);
CREATE INDEX idx_supplier_contacts_email ON supplier_contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_supplier_contacts_phone ON supplier_contacts(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_supplier_contacts_auth_user_id ON supplier_contacts(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX idx_supplier_contacts_wechat_openid ON supplier_contacts(wechat_openid) WHERE wechat_openid IS NOT NULL;
CREATE INDEX idx_supplier_contacts_is_active ON supplier_contacts(is_active) WHERE is_active = true;

-- ===========================================
-- SUPPLIER INVITATIONS
-- ===========================================
-- Organizations can invite suppliers to the portal

CREATE TABLE supplier_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Who invited
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id),
  
  -- Invitation details
  email TEXT,                            -- Email to invite (if email auth)
  phone TEXT,                            -- Phone to invite (if phone auth)
  contact_name TEXT NOT NULL,
  
  -- Token for invitation link
  token TEXT NOT NULL UNIQUE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'expired', 'cancelled'
  
  -- Timestamps
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supplier_invitations_org_id ON supplier_invitations(org_id);
CREATE INDEX idx_supplier_invitations_supplier_id ON supplier_invitations(supplier_id);
CREATE INDEX idx_supplier_invitations_token ON supplier_invitations(token);
CREATE INDEX idx_supplier_invitations_status ON supplier_invitations(status);
CREATE INDEX idx_supplier_invitations_email ON supplier_invitations(email) WHERE email IS NOT NULL;

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invitations ENABLE ROW LEVEL SECURITY;

-- Supplier contacts: Org members can view suppliers linked to their org
CREATE POLICY "Org members can view supplier contacts"
  ON supplier_contacts FOR SELECT
  USING (
    supplier_id IN (
      SELECT s.id FROM suppliers s 
      WHERE s.org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
    )
    OR auth_user_id = auth.uid()  -- Supplier can see their own record
  );

-- Supplier contacts: Only admins/engineers can invite (create) new contacts
CREATE POLICY "Engineers can create supplier contacts"
  ON supplier_contacts FOR INSERT
  WITH CHECK (
    supplier_id IN (
      SELECT s.id FROM suppliers s 
      WHERE s.org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer'))
    )
  );

-- Supplier contacts: Contacts can update their own profile
CREATE POLICY "Suppliers can update own profile"
  ON supplier_contacts FOR UPDATE
  USING (auth_user_id = auth.uid());

-- Supplier contacts: Admins can update any contact in their org's suppliers
CREATE POLICY "Admins can update supplier contacts"
  ON supplier_contacts FOR UPDATE
  USING (
    supplier_id IN (
      SELECT s.id FROM suppliers s 
      WHERE s.org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- Supplier invitations: Org members can view
CREATE POLICY "Org members can view supplier invitations"
  ON supplier_invitations FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Supplier invitations: Engineers can create
CREATE POLICY "Engineers can create supplier invitations"
  ON supplier_invitations FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role IN ('admin', 'engineer')));

-- Supplier invitations: Admins can update/delete
CREATE POLICY "Admins can manage supplier invitations"
  ON supplier_invitations FOR ALL
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Function to handle supplier signup
CREATE OR REPLACE FUNCTION handle_supplier_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_invitation RECORD;
  v_supplier_contact_id UUID;
BEGIN
  -- Check if this is a supplier signup by looking for pending invitation
  SELECT * INTO v_invitation
  FROM supplier_invitations
  WHERE (email = NEW.email OR phone = NEW.phone)
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_invitation IS NOT NULL THEN
    -- This is a supplier signing up via invitation
    
    -- Create or update supplier contact
    INSERT INTO supplier_contacts (
      auth_user_id,
      supplier_id,
      email,
      phone,
      full_name,
      auth_method,
      is_active,
      email_verified
    ) VALUES (
      NEW.id,
      v_invitation.supplier_id,
      NEW.email,
      NEW.phone,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', v_invitation.contact_name),
      CASE 
        WHEN NEW.phone IS NOT NULL THEN 'phone'::supplier_auth_method 
        ELSE 'email'::supplier_auth_method 
      END,
      true,
      true  -- Email is verified through Supabase auth
    )
    ON CONFLICT (email) DO UPDATE SET
      auth_user_id = NEW.id,
      full_name = COALESCE(EXCLUDED.full_name, supplier_contacts.full_name),
      email_verified = true,
      updated_at = NOW()
    RETURNING id INTO v_supplier_contact_id;
    
    -- Mark invitation as accepted
    UPDATE supplier_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = v_invitation.id;
    
    RAISE NOTICE 'Supplier contact created: %', v_supplier_contact_id;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the auth signup
  RAISE WARNING 'handle_supplier_signup error: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for supplier signup (runs after main user handler)
DROP TRIGGER IF EXISTS on_supplier_signup ON auth.users;
CREATE TRIGGER on_supplier_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_supplier_signup();

-- Function to check if an email/phone belongs to a supplier
CREATE OR REPLACE FUNCTION is_supplier_account(p_identifier TEXT)
RETURNS JSONB AS $$
DECLARE
  v_contact RECORD;
BEGIN
  -- Check by email
  SELECT sc.*, s.name as supplier_name, s.org_id
  INTO v_contact
  FROM supplier_contacts sc
  JOIN suppliers s ON sc.supplier_id = s.id
  WHERE (sc.email = p_identifier OR sc.phone = p_identifier)
    AND sc.is_active = true;
  
  IF v_contact IS NOT NULL THEN
    RETURN jsonb_build_object(
      'is_supplier', true,
      'contact_id', v_contact.id,
      'supplier_id', v_contact.supplier_id,
      'supplier_name', v_contact.supplier_name,
      'full_name', v_contact.full_name,
      'auth_method', v_contact.auth_method,
      'org_id', v_contact.org_id
    );
  END IF;
  
  -- Check pending invitations
  SELECT si.*, s.name as supplier_name
  INTO v_contact
  FROM supplier_invitations si
  JOIN suppliers s ON si.supplier_id = s.id
  WHERE (si.email = p_identifier OR si.phone = p_identifier)
    AND si.status = 'pending'
    AND si.expires_at > NOW();
  
  IF v_contact IS NOT NULL THEN
    RETURN jsonb_build_object(
      'is_supplier', true,
      'is_invitation', true,
      'invitation_id', v_contact.id,
      'supplier_id', v_contact.supplier_id,
      'supplier_name', v_contact.supplier_name,
      'contact_name', v_contact.contact_name
    );
  END IF;
  
  RETURN jsonb_build_object('is_supplier', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_supplier_account(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION is_supplier_account(TEXT) TO authenticated;

-- ===========================================
-- EXAMPLE: Inviting a Supplier
-- ===========================================
/*
-- First, create the supplier (if not exists)
INSERT INTO suppliers (org_id, name, code, contact_email, country)
VALUES ('your-org-id', 'Acme Manufacturing', 'ACME', 'contact@acme.cn', 'China');

-- Then invite a contact
INSERT INTO supplier_invitations (
  org_id, 
  supplier_id, 
  invited_by, 
  email, 
  contact_name, 
  token
)
VALUES (
  'your-org-id',
  'supplier-uuid',
  'your-user-id',
  'zhang.wei@acme.cn',
  'Zhang Wei',
  encode(gen_random_bytes(32), 'hex')
);

-- The supplier can then sign up using email/password or phone
-- and will automatically be linked to the invitation
*/

